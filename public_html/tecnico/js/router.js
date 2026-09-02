// Router mínimo por hash — mismo patrón que el panel admin.

const routes = {};
let ultimaLimpieza = null;

export function route(name, handler) {
  routes[name] = handler;
}

export function currentRoute() {
  const hash = location.hash.replace(/^#/, '') || 'home';
  const [name, query] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { name: routes[name] ? name : 'home', params };
}

export function irA(nombre, params = {}) {
  const qs = new URLSearchParams(params).toString();
  location.hash = qs ? `${nombre}?${qs}` : nombre;
}

export async function renderRoute() {
  if (typeof ultimaLimpieza === 'function') {
    try { ultimaLimpieza(); } catch { /* la vista anterior ya no importa */ }
    ultimaLimpieza = null;
  }
  const { name, params } = currentRoute();
  const handler = routes[name];
  const container = document.getElementById('view');
  container.innerHTML = '';
  container.scrollTop = 0;
  const posibleLimpieza = await handler(container, params);
  if (typeof posibleLimpieza === 'function') {
    ultimaLimpieza = posibleLimpieza;
  }
}

export function startRouter() {
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
}
