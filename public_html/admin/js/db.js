/**
 * IndexedDB mínimo para la cola de acciones pendientes del panel admin —
 * mismo patrón que la app técnico (public_html/tecnico/js/db.js), base de datos
 * separada ('terreno_dth_admin') para no acoplar el formato de cola de un
 * panel con el del otro aunque compartan origen.
 */
const DB_NOMBRE = 'terreno_dth_admin';
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

/** Siempre en el orden en que se agregaron (FIFO). */
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

/** Para tarifas/comisiones: solo importa mandar la ÚLTIMA edición de una misma clave (ej. el mismo tipo de servicio), no cada paso intermedio. */
export async function colaEliminarPorTipoYClave(tipo, clave) {
  const items = await colaListar();
  for (const item of items.filter((i) => i.tipo === tipo && i.clave === clave)) {
    await colaEliminar(item.id);
  }
}

export async function colaContar() {
  const items = await colaListar();
  return items.length;
}
