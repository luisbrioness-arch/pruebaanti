// Utilidades compartidas por toda la app técnico.

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Crea un elemento a partir de una plantilla HTML (un solo nodo raíz). */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function formatDateTime(s) {
  if (!s) return '—';
  const d = new Date(String(s).replace(' ', 'T'));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export const TIPO_SERVICIO_ICONO = {
  instalacion_nueva: '📡',
  servicio_adicional: '🔧',
  soporte_falla: '🛠️',
  retiro: '📤',
};

export function iconoTipoServicio(codigo) {
  return TIPO_SERVICIO_ICONO[codigo] || '📋';
}

/** true si el navegador reporta conexión — no garantiza que el servidor responda, solo descarta el caso obvio. */
export function hayConexion() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}
