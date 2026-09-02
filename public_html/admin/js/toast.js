import { el } from './utils.js';

/**
 * @param {'ok'|'malo'|'neutro'} tono
 *
 * El mensaje se inserta como TEXTO, nunca como HTML: muchos avisos llevan
 * mensajes de error del servidor que a su vez incluyen datos escritos por
 * un técnico (números de serie, folios), así que interpolarlos como HTML
 * era un XSS real contra la sesión del admin. Por eso los llamadores
 * tampoco necesitan escapar nada antes de pasar el texto.
 */
export function toast(mensaje, tono = 'ok', duracionMs = 4000) {
  const pila = document.getElementById('toast-pila');
  const nodo = el(`<div class="toast toast--${tono}"></div>`);
  nodo.textContent = mensaje;
  pila.appendChild(nodo);
  requestAnimationFrame(() => nodo.classList.add('toast--visible'));
  setTimeout(() => {
    nodo.classList.remove('toast--visible');
    setTimeout(() => nodo.remove(), 250);
  }, duracionMs);
}
