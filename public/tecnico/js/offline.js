/**
 * Cola de escritura offline. Alcance deliberado (ver docs/tecnico-app.md):
 * cubre crear orden, escanear un equipo para INSTALAR (el único caso donde
 * hay dónde sacar el equipo_id sin preguntarle al servidor — la maleta
 * cacheada), fotos, ferretería y cierre técnico, y el envío final. Un
 * "retirado" y "quitar material" siguen necesitando conexión real: no hay
 * forma honesta de saber en el celular, sin preguntarle al servidor, si un
 * equipo que nunca estuvo en la maleta de este técnico de verdad figura
 * instalado en la casa del cliente.
 *
 * Se procesa en el mismo orden en que se guardó (FIFO) — así "crear orden"
 * siempre sale antes que un material de esa misma orden, sin necesidad de
 * agrupar por uuid.
 */
import { api, ApiError } from './api.js';
import { toast } from './toast.js';
import { colaAgregar, colaListar, colaEliminar, colaContar, colaEliminarPorTipoYUuid } from './db.js';
import { eliminarBorrador, eliminarOrdenLocal } from './storage.js';

const TIPOS_COALESCIBLES = new Set(['ferreteria', 'cierre']);

const listeners = new Set();
/** @param {() => void} fn se llama cada vez que la cola cambia (para refrescar un badge, por ejemplo). */
export function onColaCambio(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notificar() {
  listeners.forEach((fn) => {
    try { fn(); } catch { /* un listener roto no debe tumbar el resto */ }
  });
}

export { colaContar };

/**
 * Guarda una acción para mandarla más tarde. `payload` es exactamente el
 * cuerpo que se le mandaría a `api()` — para 'foto', en cambio, es
 * { blob, campos } porque un archivo no se guarda como JSON.
 */
export async function encolar(tipo, uuid, payload) {
  if (TIPOS_COALESCIBLES.has(tipo)) {
    await colaEliminarPorTipoYUuid(tipo, uuid);
  }
  await colaAgregar({ tipo, uuid, payload, creado_en: Date.now() });
  notificar();
  registrarBackgroundSyncSiHay();
}

/**
 * Quita de la cola un material que todavía no se mandó (el técnico se
 * arrepintió antes de que hubiera señal) — sin esto, "quitar" un material
 * agregado offline intentaría un DELETE contra un servidor que ni siquiera
 * sabe que existe. Devuelve true si encontró y quitó algo.
 */
export async function desencolarMaterial(uuid, numeroSerie, accion) {
  const items = await colaListar();
  const item = items.find((i) => (
    i.tipo === 'material' && i.uuid === uuid
    && i.payload.numero_serie === numeroSerie && i.payload.accion === accion
  ));
  if (!item) return false;
  await colaEliminar(item.id);
  notificar();
  return true;
}

function rutaYMetodo(tipo, uuid) {
  switch (tipo) {
    case 'crear_orden': return { path: '/ordenes', method: 'POST' };
    case 'material': return { path: `/ordenes/${encodeURIComponent(uuid)}/materiales`, method: 'POST' };
    case 'foto': return { path: `/ordenes/${encodeURIComponent(uuid)}/fotos`, method: 'POST' };
    case 'ferreteria': return { path: `/ordenes/${encodeURIComponent(uuid)}/ferreteria`, method: 'POST' };
    case 'cierre': return { path: `/ordenes/${encodeURIComponent(uuid)}/cierre`, method: 'PATCH' };
    case 'enviar': return { path: `/ordenes/${encodeURIComponent(uuid)}/enviar`, method: 'POST' };
    default: throw new Error('Tipo de acción pendiente desconocido: ' + tipo);
  }
}

async function enviarItem(item) {
  const { path, method } = rutaYMetodo(item.tipo, item.uuid);
  if (item.tipo === 'foto') {
    const form = new FormData();
    form.append('foto', item.payload.blob, 'foto.jpg');
    for (const [clave, valor] of Object.entries(item.payload.campos)) {
      if (valor !== null && valor !== undefined) form.append(clave, String(valor));
    }
    return api(path, { method, form });
  }
  return api(path, { method, body: item.payload });
}

let procesando = false;

/**
 * Drena la cola de a un ítem por vez. Si el problema es de conexión, se
 * detiene ahí mismo (el resto sigue esperando) — se reintenta solo al
 * recuperar señal o al reabrir la app. Si el servidor de verdad rechazó el
 * ítem (folio duplicado que ya no aplica, validación, etc.), no tiene
 * sentido reintentarlo tal cual: se descarta y se avisa, para no trabar
 * para siempre lo que viene después en la cola.
 */
export async function procesarCola() {
  if (procesando) return;
  procesando = true;
  try {
    for (;;) {
      const items = await colaListar().catch(() => []);
      if (!items.length) break;
      const item = items[0];
      try {
        await enviarItem(item);
        await colaEliminar(item.id);
        if (item.tipo === 'enviar') {
          // La orden ya quedó de verdad 'enviada' (o 'conflicto') en el
          // servidor — esto pudo pasar con la app cerrada (Background Sync)
          // o en segundo plano, sin que ninguna pantalla de wizard.js
          // estuviera abierta para hacer esta misma limpieza por su cuenta.
          eliminarBorrador(item.uuid);
          eliminarOrdenLocal(item.uuid);
        }
        notificar();
      } catch (e) {
        if (e instanceof ApiError && e.code === 'sin_conexion') {
          break;
        }
        await colaEliminar(item.id);
        notificar();
        const mensaje = e instanceof ApiError ? e.message : String(e);
        console.error('[terreno-dth] acción pendiente descartada tras error real del servidor:', item, mensaje);
        toast(`Una acción guardada sin conexión no se pudo enviar (${etiquetaTipo(item.tipo)}): ${mensaje}`, 'malo', 8000);
      }
    }
  } finally {
    procesando = false;
  }
}

function etiquetaTipo(tipo) {
  return {
    crear_orden: 'crear orden', material: 'agregar equipo', foto: 'subir foto',
    ferreteria: 'ferretería', cierre: 'cierre técnico', enviar: 'enviar orden',
  }[tipo] || tipo;
}

function registrarBackgroundSyncSiHay() {
  // Mejor esfuerzo, solo Chrome/Android: si el navegador soporta Background
  // Sync, esto le pide al sistema operativo que vuelva a despertar la app
  // cuando haya señal, aunque esté cerrada. Sin esto (iOS Safari, la
  // mayoría de los navegadores de escritorio), la cola igual se procesa
  // apenas la PWA esté abierta y online — ver el listener más abajo.
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready
      .then((registro) => registro.sync.register('cola-pendiente'))
      .catch(() => { /* no crítico: el listener 'online' de abajo cubre el caso común */ });
  }
}

window.addEventListener('online', () => {
  procesarCola();
});
