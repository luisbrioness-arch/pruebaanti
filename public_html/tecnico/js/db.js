/**
 * IndexedDB mínimo para UNA sola cosa: la cola de acciones pendientes de
 * sincronizar (ver offline.js). Todo lo demás (catálogo, maleta, borradores)
 * sigue en localStorage — no hacía falta IndexedDB para eso. Acá sí, porque
 * una foto ya comprimida es un Blob, y localStorage no guarda binarios.
 */
const DB_NOMBRE = 'terreno_dth';
const DB_VERSION = 1;
const ALMACEN = 'cola';

function abrirDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Este navegador no soporta guardado local sin conexión.'));
      return;
    }
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function colaAgregar(item) {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite');
    tx.objectStore(ALMACEN).add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Siempre en el orden en que se agregaron — es lo que garantiza que un material no se mande antes que la orden que lo contiene. */
export async function colaListar() {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readonly');
    const req = tx.objectStore(ALMACEN).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.id - b.id));
    req.onerror = () => reject(req.error);
  });
}

export async function colaEliminar(id) {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite');
    tx.objectStore(ALMACEN).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Para 'ferreteria'/'cierre': solo importa mandar la ÚLTIMA edición, no cada paso intermedio. */
export async function colaEliminarPorTipoYUuid(tipo, uuid) {
  const items = await colaListar();
  for (const item of items.filter((i) => i.tipo === tipo && i.uuid === uuid)) {
    await colaEliminar(item.id);
  }
}

export async function colaContar(uuid) {
  const items = await colaListar();
  return uuid ? items.filter((i) => i.uuid === uuid).length : items.length;
}
