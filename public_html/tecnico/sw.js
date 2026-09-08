// Service worker del PWA técnico. Dos trabajos:
//  1. Cachear la cáscara de la app (HTML/CSS/JS/vendor) para que abra
//     instantáneo con mala señal — ver el fetch handler más abajo.
//  2. Un intento de Background Sync (evento 'sync') para reintentar la cola
//     offline (ver js/offline.js) aunque la PWA esté cerrada. Es MEJOR
//     ESFUERZO, no la vía principal: solo Chrome/Android lo soporta (iOS
//     Safari no tiene Background Sync), y por eso js/offline.js YA reintenta
//     solo con que la app esté abierta y vuelva la señal (evento 'online'
//     de la página) — esto de acá es un bonus para cuando el celular
//     reconecta con la app en segundo plano, no un reemplazo.
//
// Subir este número en CADA release que toque la cáscara (HTML/CSS/JS) —
// si no, un técnico con la PWA instalada sigue viendo la versión vieja: la
// estrategia de abajo es cache-first, y el Cache Storage del service worker
// es independiente de las cabeceras Cache-Control del servidor, así que
// esas no lo despiertan. Sin este bump, el cambio recién le llega en el
// SEGUNDO arranque (revalidación en segundo plano), no en el primero.
const CACHE = 'terreno-dth-tecnico-v21';

const APP_SHELL = [
  '/tecnico/',
  '/tecnico/index.html',
  '/tecnico/manifest.webmanifest',
  '/tecnico/css/tecnico.css',
  '/tecnico/js/app.js',
  '/tecnico/js/api.js',
  '/tecnico/js/utils.js',
  '/tecnico/js/toast.js',
  '/tecnico/js/router.js',
  '/tecnico/js/storage.js',
  '/tecnico/js/session.js',
  '/tecnico/js/db.js',
  '/tecnico/js/offline.js',
  '/tecnico/js/topbar.js',
  '/tecnico/js/modal.js',
  '/tecnico/js/geo.js',
  '/tecnico/js/compress.js',
  '/tecnico/js/uuid.js',
  '/tecnico/js/scanner.js',
  '/tecnico/js/reportar.js',
  '/tecnico/js/views/login.js',
  '/tecnico/js/views/home.js',
  '/tecnico/js/views/venta.js',
  '/tecnico/js/views/historial.js',
  '/tecnico/js/views/billetera.js',
  '/tecnico/js/views/traspasos.js',
  '/tecnico/js/views/wizard/wizard.js',
  '/tecnico/js/views/wizard/paso1-datos.js',
  '/tecnico/js/views/wizard/paso2-escaneo.js',
  '/tecnico/js/views/wizard/paso3-fotos.js',
  '/tecnico/js/views/wizard/paso4-cierre.js',
  '/tecnico/js/views/wizard/paso5-enviar.js',
  '/tecnico/js/vendor/compressor.min.js',
  '/tecnico/js/vendor/html5-qrcode.min.js',
  '/tecnico/icons/icon.svg',
  '/tecnico/icons/icon-192.png',
  '/tecnico/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // La API nunca se sirve desde caché: los datos de una orden no pueden
  // quedar viejos silenciosamente. Si falla la red, que falle claro.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (event.request.method !== 'GET') {
    return;
  }

  // Cache-first para la cáscara de la app: prioriza velocidad, y revalida
  // en segundo plano para que la próxima carga tenga lo último.
  event.respondWith(
    caches.match(event.request).then((cacheada) => {
      const redFetch = fetch(event.request)
        .then((respuesta) => {
          if (respuesta.ok) {
            const copia = respuesta.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copia));
          }
          return respuesta;
        })
        .catch(() => cacheada);
      return cacheada || redFetch;
    })
  );
});

// --- Background Sync (mejor esfuerzo, ver comentario arriba) ---------------
// Copia mínima y autónoma de la lógica de js/db.js + js/offline.js — no se
// puede import() el módulo de la página desde acá sin volver el service
// worker dependiente de que ese módulo nunca use `document`/`window` (toast.js
// sí los usa), así que se duplica solo lo estrictamente necesario para
// reintentar el envío en segundo plano. Cualquier cambio en el contrato de
// la cola (js/db.js) debe reflejarse acá también.
const DB_NOMBRE = 'terreno_dth';
const ALMACEN = 'cola';

function abrirDbSw() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function listarColaSw() {
  const db = await abrirDbSw();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readonly');
    const req = tx.objectStore(ALMACEN).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.id - b.id));
    req.onerror = () => reject(req.error);
  });
}

async function eliminarDeColaSw(id) {
  const db = await abrirDbSw();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite');
    tx.objectStore(ALMACEN).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function rutaYMetodoSw(tipo, uuid) {
  const base = `/api/ordenes/${encodeURIComponent(uuid || '')}`;
  switch (tipo) {
    case 'crear_orden': return { path: '/api/ordenes', method: 'POST' };
    case 'material': return { path: `${base}/materiales`, method: 'POST' };
    case 'foto': return { path: `${base}/fotos`, method: 'POST' };
    case 'ferreteria': return { path: `${base}/ferreteria`, method: 'POST' };
    case 'cierre': return { path: `${base}/cierre`, method: 'PATCH' };
    case 'enviar': return { path: `${base}/enviar`, method: 'POST' };
    default: return null;
  }
}

async function enviarItemSw(item) {
  const ruta = rutaYMetodoSw(item.tipo, item.uuid);
  if (!ruta) return { ok: false, permanente: true };
  let respuesta;
  if (item.tipo === 'foto') {
    const form = new FormData();
    form.append('foto', item.payload.blob, 'foto.jpg');
    for (const [clave, valor] of Object.entries(item.payload.campos || {})) {
      if (valor !== null && valor !== undefined) form.append(clave, String(valor));
    }
    respuesta = await fetch(ruta.path, { method: ruta.method, credentials: 'same-origin', body: form });
  } else {
    respuesta = await fetch(ruta.path, {
      method: ruta.method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item.payload),
    });
  }
  // 4xx/5xx reales (no de red) cuentan como "no se puede reintentar tal
  // cual" — se descarta para no trabar la cola, igual que en offline.js.
  // EXCEPTO 401/403: ahí el servidor no rechazó el trabajo, solo se venció
  // la sesión; descartarlo perdería una orden ya terminada en terreno.
  const sesionVencida = respuesta.status === 401 || respuesta.status === 403;
  return { ok: respuesta.ok, permanente: !respuesta.ok && !sesionVencida, sesionVencida };
}

async function procesarColaEnSw() {
  for (;;) {
    let items;
    try {
      items = await listarColaSw();
    } catch {
      return; // sin IndexedDB accesible acá — se reintenta la próxima vez
    }
    if (!items.length) return;
    const item = items[0];
    try {
      const resultado = await enviarItemSw(item);
      if (resultado.sesionVencida) {
        // Se deja en la cola: cuando el técnico vuelva a iniciar sesión,
        // js/offline.js la vacía sola. Ver el mismo criterio allá.
        console.warn('[terreno-dth sw] sesión vencida — la cola queda pendiente:', item);
        return;
      }
      await eliminarDeColaSw(item.id);
      if (!resultado.ok) {
        console.error('[terreno-dth sw] acción pendiente descartada (rechazo real del servidor):', item);
      }
    } catch {
      // fetch lanzó (sin red de verdad, otra vez) — se corta acá, sigue en la cola
      return;
    }
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'cola-pendiente') {
    event.waitUntil(procesarColaEnSw());
  }
});
