/**
 * Todo lo que este celular necesita recordar sin depender del servidor:
 * el catálogo de tipos de servicio y la maleta (para validar el paso 2 al
 * instante, aunque no haya señal — ver docs/wizard-api.md), y la lista de
 * "borradores" en curso para que la pantalla de inicio pueda ofrecer
 * reanudarlos. La orden en sí SIEMPRE vive en el servidor desde el paso 1
 * (por diseño, ver modelo-datos-fase1.md) — acá solo se guarda el mínimo
 * para no perder de vista qué uuid_dispositivo corresponde a qué trabajo.
 */

const NS = 'tdh_';
const K_CATALOGO = NS + 'catalogo';
const K_CATALOGO_FERRETERIA = NS + 'catalogo_ferreteria';
const K_MALETA = NS + 'maleta';
const K_BORRADORES = NS + 'borradores';
const K_ORDEN_LOCAL_PREFIJO = NS + 'orden_';

function leer(clave, porDefecto) {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo ? JSON.parse(crudo) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribir(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // almacenamiento lleno o bloqueado (modo privado) — la app sigue
    // funcionando, solo pierde la conveniencia de la caché/reanudar.
  }
}

export function getCatalogo() {
  return leer(K_CATALOGO, null);
}
export function setCatalogo(tiposServicio) {
  escribir(K_CATALOGO, tiposServicio);
}

/** Catálogo completo de ferretería — de acá sale el buscador del paso 4 (ver paso4-cierre.js). */
export function getCatalogoFerreteria() {
  return leer(K_CATALOGO_FERRETERIA, null);
}
export function setCatalogoFerreteria(items) {
  escribir(K_CATALOGO_FERRETERIA, items);
}

export function getMaleta() {
  return leer(K_MALETA, null);
}
export function setMaleta(maleta) {
  escribir(K_MALETA, maleta);
}

/** @returns {Array<{uuid, folio, tipo_servicio, tipo_servicio_nombre, paso, actualizado_en}>} */
export function listarBorradores() {
  return leer(K_BORRADORES, []);
}

export function guardarBorrador(borrador) {
  const lista = listarBorradores().filter((b) => b.uuid !== borrador.uuid);
  lista.unshift({ ...borrador, actualizado_en: new Date().toISOString() });
  escribir(K_BORRADORES, lista);
}

export function eliminarBorrador(uuid) {
  escribir(K_BORRADORES, listarBorradores().filter((b) => b.uuid !== uuid));
}

export function obtenerBorrador(uuid) {
  return listarBorradores().find((b) => b.uuid === uuid) || null;
}

/**
 * Snapshot completo de la orden mientras el wizard trabaja sin conexión —
 * ver js/offline.js. Es lo que le permite al celular reabrir la app SIN
 * SEÑAL y seguir mostrando la orden tal como quedó, en vez de solo el
 * recordatorio liviano de listarBorradores(). Se descarta apenas el
 * servidor confirma el estado real (ver wizard.js).
 */
export function guardarOrdenLocal(uuid, orden) {
  escribir(K_ORDEN_LOCAL_PREFIJO + uuid, orden);
}
export function obtenerOrdenLocal(uuid) {
  return leer(K_ORDEN_LOCAL_PREFIJO + uuid, null);
}
export function eliminarOrdenLocal(uuid) {
  try { localStorage.removeItem(K_ORDEN_LOCAL_PREFIJO + uuid); } catch { /* nada que limpiar */ }
}
