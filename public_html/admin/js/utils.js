// Utilidades compartidas por todas las vistas del panel admin.

export function formatMoney(n) {
  if (n === null || n === undefined || n === '') return '—';
  return '$' + Math.round(Number(n)).toLocaleString('es-CL');
}

export function formatDateTime(s) {
  if (!s) return '—';
  const d = new Date(String(s).replace(' ', 'T'));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

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

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const ESTADO_LABEL = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  observada: 'Observada',
  aprobada: 'Aprobada',
  rechazada_corregible: 'Rechazada (corregible)',
  rechazada_penalizada: 'Rechazada (sin pago)',
  conflicto: 'En conflicto',
  liquidada: 'Liquidada',
  registrada: 'Registrada',
  instalada: 'Instalada',
  anulada: 'Anulada',
  bodega: 'En bodega',
  maleta: 'En maleta',
  en_transito: 'En tránsito (pendiente)',
  instalado: 'Instalado',
  retirado: 'Retirado',
  falla_fabrica: 'Falla de fábrica',
  devuelto_tuves: 'Devuelto a TuVes',
  perdido: 'Perdido',
};

export const ESTADO_TONO = {
  borrador: 'neutro',
  enviada: 'pendiente',
  observada: 'pendiente',
  aprobada: 'ok',
  rechazada_corregible: 'alerta',
  rechazada_penalizada: 'malo',
  conflicto: 'malo',
  liquidada: 'ok',
  registrada: 'pendiente',
  instalada: 'ok',
  anulada: 'malo',
  bodega: 'neutro',
  maleta: 'pendiente',
  en_transito: 'alerta',
  instalado: 'ok',
  retirado: 'alerta',
  falla_fabrica: 'malo',
  devuelto_tuves: 'neutro',
  perdido: 'malo',
};

/** Para la línea de tiempo del buscador por serie (Bodega → Buscar por serie). */
export const MOVIMIENTO_EQUIPO_LABEL = {
  ingreso_bodega: 'Ingreso a bodega',
  asignacion_maleta: 'Asignado a maleta',
  traspaso: 'Traspaso confirmado',
  traspaso_pendiente: 'Envío pendiente de confirmar',
  traspaso_rechazado: 'Traspaso rechazado',
  traspaso_cancelado: 'Envío cancelado por el admin',
  instalacion: 'Instalado en una orden',
  retiro: 'Retirado en una orden',
  falla_fabrica: 'Marcado como falla de fábrica',
  devolucion_tuves: 'Devuelto a TuVes',
  perdido: 'Marcado como perdido',
  ajuste_descuadre: 'Ajuste manual',
};

export const ANOMALIA_LABEL = {
  serie_ingresada_a_mano: 'Serie ingresada a mano',
  folio_en_conflicto: 'Folio en conflicto',
  registrada_por_admin: 'Registro retroactivo',
};

/** Pastilla de estado coloreada por tono semántico (ver admin.css). */
export function badge(estado) {
  const tono = ESTADO_TONO[estado] || 'neutro';
  const label = ESTADO_LABEL[estado] || estado;
  return `<span class="badge badge--${tono}">${escapeHtml(label)}</span>`;
}

export function anomaliaChip(codigo) {
  const label = ANOMALIA_LABEL[codigo] || codigo;
  return `<span class="chip chip--alerta" title="${escapeHtml(label)}">⚠ ${escapeHtml(label)}</span>`;
}

/** Ignora atajos de teclado si el foco está en un campo de texto/select. */
export function enCampoDeTexto(elemento) {
  const tag = elemento?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || elemento?.isContentEditable;
}

/** Genera un botón compacto de copiar al portapapeles */
export function botonCopiarHtml(texto, label = 'Copiar') {
  if (!texto || texto === '—' || texto === 'No registrado' || texto === 'No informado' || texto === 'Sin comuna') return '';
  return `<button type="button" class="btn-copiar-dato" data-copiar="${escapeHtml(String(texto))}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">📋</button>`;
}

