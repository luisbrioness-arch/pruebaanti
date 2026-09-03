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

const TIPOS_COALESCIBLES = new Set([
  'editar_tarifa', 'eliminar_tarifa', 'editar_comision', 'editar_tarifa_instalacion', 'eliminar_tarifa_instalacion',
  'cambiar_activo_plan', 'editar_nombre_tarifa', 'editar_nombre_plan',
]);

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
  editar_tarifa: (p) => ({ path: `/admin/tarifas/${encodeURIComponent(p.codigo)}`, method: 'PUT', body: { monto: p.monto } }),
  eliminar_tarifa: (p) => ({ path: `/admin/tarifas/${encodeURIComponent(p.codigo)}`, method: 'DELETE' }),
  editar_nombre_tarifa: (p) => ({ path: `/admin/tarifas/${encodeURIComponent(p.codigo)}/nombre`, method: 'PUT', body: { nombre: p.nombre } }),
  editar_comision: (p) => ({ path: `/admin/comisiones/${encodeURIComponent(p.codigo)}`, method: 'PUT', body: { monto: p.monto } }),
  editar_nombre_plan: (p) => ({ path: `/admin/planes/${encodeURIComponent(p.codigo)}/nombre`, method: 'PUT', body: { nombre: p.nombre } }),
  editar_tarifa_instalacion: (p) => ({ path: `/admin/tarifas-instalacion/${encodeURIComponent(p.codigo)}`, method: 'PUT', body: { monto: p.monto } }),
  eliminar_tarifa_instalacion: (p) => ({ path: `/admin/tarifas-instalacion/${encodeURIComponent(p.codigo)}`, method: 'DELETE' }),
  alta_equipo: (p) => ({ path: '/admin/equipos', method: 'POST', body: { tipo_equipo: p.tipo_equipo, numero_serie: p.numero_serie, bodega_id: p.bodega_id } }),
  asignar_equipo: (p) => ({ path: `/admin/equipos/${p.id}/asignar`, method: 'POST', body: { tecnico_id: p.tecnico_id } }),
  traspasar_equipo: (p) => ({ path: `/admin/equipos/${p.id}/traspasar`, method: 'POST', body: { tecnico_destino_id: p.tecnico_destino_id } }),
  cancelar_traspaso_equipo: (p) => ({ path: `/admin/equipos/${p.id}/cancelar-traspaso`, method: 'POST', body: {} }),
  falla_fabrica: (p) => ({ path: `/admin/equipos/${p.id}/falla-fabrica`, method: 'POST', body: { observacion: p.observacion } }),
  ingreso_bodega: (p) => ({ path: `/admin/equipos/${p.id}/ingreso-bodega`, method: 'POST', body: { bodega_id: p.bodega_id } }),
  entregar_ferreteria: (p) => ({ path: '/admin/ferreteria/entregar', method: 'POST', body: { item_codigo: p.item_codigo, tecnico_id: p.tecnico_id, cantidad: p.cantidad, bodega_id: p.bodega_id } }),
  ingreso_ferreteria_central: (p) => ({ path: '/admin/ferreteria/ingreso', method: 'POST', body: { item_codigo: p.item_codigo, bodega_id: p.bodega_id, cantidad: p.cantidad, observacion: p.observacion } }),
  crear_bodega: (p) => ({ path: '/admin/bodegas', method: 'POST', body: { nombre: p.nombre } }),
  crear_plan: (p) => ({ path: '/admin/planes', method: 'POST', body: { codigo: p.codigo, nombre: p.nombre, comision_inicial: p.comision_inicial } }),
  cambiar_activo_plan: (p) => ({ path: `/admin/planes/${encodeURIComponent(p.codigo)}/activo`, method: 'PUT', body: { activo: p.activo } }),
  cancelar_entrega_ferreteria: (p) => ({ path: `/admin/ferreteria/pendientes/${p.id}/cancelar`, method: 'POST', body: {} }),
  crear_tipo_equipo: (p) => ({ path: '/admin/catalogo/tipos-equipo', method: 'POST', body: { codigo: p.codigo, nombre: p.nombre } }),
  crear_item_ferreteria: (p) => ({ path: '/admin/catalogo/items-ferreteria', method: 'POST', body: { codigo: p.codigo, nombre: p.nombre, unidad_medida: p.unidad_medida } }),
  crear_usuario: (p) => ({ path: '/admin/usuarios', method: 'POST', body: p }),
  cerrar_periodo: (p) => ({ path: `/admin/billetera/${p.tecnicoId}/cerrar`, method: 'POST', body: { observaciones: p.observaciones } }),
  registrar_pago: (p) => ({ path: `/admin/billetera/${p.tecnicoId}/pago`, method: 'POST', body: { monto: p.monto, observacion: p.observacion } }),
  registrar_ajuste: (p) => ({ path: `/admin/billetera/${p.tecnicoId}/ajuste`, method: 'POST', body: { monto: p.monto, observacion: p.observacion } }),
  reportar: (p) => ({ path: '/reportes', method: 'POST', body: { tipo: p.tipo, descripcion: p.descripcion, pantalla: p.pantalla, elemento: p.elemento } }),
};

const ETIQUETAS = {
  editar_tarifa: 'editar tarifa', eliminar_tarifa: 'eliminar tarifa', editar_nombre_tarifa: 'editar nombre de tarifa',
  editar_comision: 'editar comisión', editar_nombre_plan: 'editar nombre de plan', editar_tarifa_instalacion: 'editar instalación por plan',
  eliminar_tarifa_instalacion: 'eliminar instalación por plan', alta_equipo: 'alta de equipo',
  asignar_equipo: 'enviar equipo a técnico', traspasar_equipo: 'traspasar equipo', cancelar_traspaso_equipo: 'cancelar envío de equipo',
  falla_fabrica: 'marcar falla de fábrica',
  ingreso_bodega: 'ingreso a bodega', entregar_ferreteria: 'entregar ferretería', cancelar_entrega_ferreteria: 'cancelar entrega de ferretería',
  ingreso_ferreteria_central: 'ingreso de ferretería a bodega', crear_bodega: 'crear bodega', crear_plan: 'crear plan',
  cambiar_activo_plan: 'activar/desactivar plan',
  crear_tipo_equipo: 'crear tipo de equipo', crear_item_ferreteria: 'crear ítem de ferretería',
  cerrar_periodo: 'cerrar período de liquidación', registrar_pago: 'registrar pago', registrar_ajuste: 'registrar ajuste',
  reportar: 'enviar reporte', crear_usuario: 'crear usuario',
};

/**
 * Intenta la llamada real primero; si falla por falta de conexión, la
 * encola para más tarde. `clave` solo importa para los tipos coalescibles
 * (tarifas/comisiones) — identifica QUÉ fila se está editando, para
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
