/**
 * Cola de escritura offline del panel admin — mismo mecanismo que la app
 * técnico (ver docs/tecnico-app.md), adaptado a que acá TODAS las acciones
 * apuntan a un id ya conocido (la fila ya está cargada en pantalla), así
 * que no existe el problema que sí tenía el técnico con "retirar" (no saber
 * a qué equipo corresponde una serie sin preguntarle al servidor). Por eso
 * acá se puede encolar cualquier acción de escritura sin excepciones.
 *
 * A diferencia del wizard, este panel es una herramienta de escritorio que
 * normalmente se deja abierta — no es una PWA instalable, así que no hay
 * service worker ni Background Sync: la cola se vacía sola apenas la
 * pestaña detecta que volvió la señal (evento 'online') o al recargar.
 */
import { api, ApiError } from './api.js';
import { toast } from './toast.js';
import { colaAgregar, colaListar, colaEliminar, colaContar, colaEliminarPorTipoYClave } from './db.js';

const TIPOS_COALESCIBLES = new Set(['editar_tarifa', 'editar_comision', 'actualizar_kit']);

const listeners = new Set();
/** @param {() => void} fn se llama cada vez que la cola cambia (para refrescar el contador del topbar). */
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

const RUTAS = {
  aprobar: (p) => ({ path: `/admin/ordenes/${p.id}/aprobar`, method: 'POST', body: {} }),
  aprobar_masivo: (p) => ({ path: '/admin/ordenes/aprobar-masivo', method: 'POST', body: { ids: p.ids } }),
  rechazar: (p) => ({ path: `/admin/ordenes/${p.id}/rechazar`, method: 'POST', body: { motivo: p.motivo, comentario: p.comentario, descuenta_pago: p.descuenta_pago } }),
  observar: (p) => ({ path: `/admin/ordenes/${p.id}/observar`, method: 'POST', body: { comentario: p.comentario } }),
  reabrir: (p) => ({ path: `/admin/ordenes/${p.id}/reabrir`, method: 'POST', body: {} }),
  resolver_conflicto: (p) => ({ path: `/admin/conflictos/${p.id}/resolver`, method: 'POST', body: { accion: p.accion, comentario: p.comentario } }),
  editar_tarifa: (p) => ({ path: `/admin/tarifas/${encodeURIComponent(p.codigo)}`, method: 'PUT', body: { monto: p.monto } }),
  editar_comision: (p) => ({ path: `/admin/comisiones/${encodeURIComponent(p.codigo)}`, method: 'PUT', body: { monto: p.monto } }),
  alta_equipo: (p) => ({ path: '/admin/equipos', method: 'POST', body: { tipo_equipo: p.tipo_equipo, numero_serie: p.numero_serie } }),
  asignar_equipo: (p) => ({ path: `/admin/equipos/${p.id}/asignar`, method: 'POST', body: { tecnico_id: p.tecnico_id } }),
  traspasar_equipo: (p) => ({ path: `/admin/equipos/${p.id}/traspasar`, method: 'POST', body: { tecnico_destino_id: p.tecnico_destino_id } }),
  falla_fabrica: (p) => ({ path: `/admin/equipos/${p.id}/falla-fabrica`, method: 'POST', body: { observacion: p.observacion } }),
  ingreso_bodega: (p) => ({ path: `/admin/equipos/${p.id}/ingreso-bodega`, method: 'POST', body: {} }),
  entregar_ferreteria: (p) => ({ path: '/admin/ferreteria/entregar', method: 'POST', body: { item_codigo: p.item_codigo, tecnico_id: p.tecnico_id, cantidad: p.cantidad } }),
  actualizar_kit: (p) => ({ path: `/admin/kits/${encodeURIComponent(p.codigo)}`, method: 'PUT', body: { items: p.items } }),
  cerrar_periodo: (p) => ({ path: `/admin/billetera/${p.tecnicoId}/cerrar`, method: 'POST', body: { observaciones: p.observaciones } }),
  registrar_pago: (p) => ({ path: `/admin/billetera/${p.tecnicoId}/pago`, method: 'POST', body: { monto: p.monto, observacion: p.observacion } }),
  registrar_ajuste: (p) => ({ path: `/admin/billetera/${p.tecnicoId}/ajuste`, method: 'POST', body: { monto: p.monto, observacion: p.observacion } }),
};

const ETIQUETAS = {
  aprobar: 'aprobar orden', aprobar_masivo: 'aprobar en lote', rechazar: 'rechazar orden',
  observar: 'observar orden', reabrir: 'reabrir orden', resolver_conflicto: 'resolver conflicto',
  editar_tarifa: 'editar tarifa', editar_comision: 'editar comisión', alta_equipo: 'alta de equipo',
  asignar_equipo: 'asignar equipo', traspasar_equipo: 'traspasar equipo', falla_fabrica: 'marcar falla de fábrica',
  ingreso_bodega: 'ingreso a bodega', entregar_ferreteria: 'entregar ferretería', actualizar_kit: 'actualizar kit',
  cerrar_periodo: 'cerrar período de liquidación', registrar_pago: 'registrar pago', registrar_ajuste: 'registrar ajuste',
};

/**
 * Intenta la llamada real primero; si falla por falta de conexión, la
 * encola para más tarde. `clave` solo importa para los tipos coalescibles
 * (tarifas/comisiones/kits) — identifica QUÉ fila se está editando, para
 * que una segunda edición mientras la primera sigue en la cola reemplace a
 * la anterior en vez de acumularse.
 */
export async function conColaSiHaceFalta(tipo, payload, llamadaOnline, clave = null) {
  try {
    return { datos: await llamadaOnline(), encolado: false };
  } catch (e) {
    if (e instanceof ApiError && e.code === 'sin_conexion') {
      if (TIPOS_COALESCIBLES.has(tipo) && clave !== null) {
        await colaEliminarPorTipoYClave(tipo, clave);
      }
      await colaAgregar({ tipo, clave, payload, creado_en: Date.now() });
      notificar();
      return { datos: null, encolado: true };
    }
    throw e;
  }
}

async function enviarItem(item) {
  const ruta = RUTAS[item.tipo];
  if (!ruta) throw new Error('Tipo de acción pendiente desconocido: ' + item.tipo);
  const { path, method, body } = ruta(item.payload);
  return api(path, { method, body });
}

let procesando = false;

/**
 * Drena la cola de a un ítem por vez. Si el problema es de conexión, se
 * detiene ahí mismo. Si el servidor rechaza el ítem por una razón real (la
 * orden ya la aprobó otro, el conflicto ya se resolvió, etc.), se descarta
 * con un aviso — reintentarlo tal cual no tiene sentido y trabaría todo lo
 * que viene después en la cola.
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
        notificar();
      } catch (e) {
        if (e instanceof ApiError && e.code === 'sin_conexion') {
          break;
        }
        await colaEliminar(item.id);
        notificar();
        const mensaje = e instanceof ApiError ? e.message : String(e);
        console.error('[terreno-dth admin] acción pendiente descartada tras error real del servidor:', item, mensaje);
        toast(`Una acción guardada sin conexión no se pudo enviar (${ETIQUETAS[item.tipo] || item.tipo}): ${mensaje}`, 'malo', 8000);
      }
    }
  } finally {
    procesando = false;
  }
}

window.addEventListener('online', () => {
  procesarCola();
});
