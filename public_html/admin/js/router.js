// Router mínimo por hash — 4 pantallas, no necesita nada más elaborado.

const routes = {};
let ultimaLimpieza = null;

export function route(name, handler) {
  routes[name] = handler;
}

export function currentRoute() {
  const hash = location.hash.replace(/^#/, '') || 'inicio';
  const [name, query] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { name: routes[name] ? name : 'inicio', params };
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
  document.querySelectorAll('.nav-link').forEach((a) => {
    a.classList.toggle('activo', a.dataset.route === name);
  });
  const posibleLimpieza = await handler(container, params);
  if (typeof posibleLimpieza === 'function') {
    ultimaLimpieza = posibleLimpieza;
  }
}

export function startRouter() {
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
}
