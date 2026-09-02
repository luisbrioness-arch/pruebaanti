import { el } from './utils.js';

/** @param {'ok'|'malo'|'neutro'} tono */
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
