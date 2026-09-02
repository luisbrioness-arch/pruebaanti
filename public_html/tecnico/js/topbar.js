// Barra superior compartida — cada vista decide su título y si muestra
// flecha de "atrás" (y adónde va) al renderizarse.
const $titulo = document.getElementById('topbar-titulo');
const $atras = document.getElementById('topbar-atras');
let handlerActual = null;

export function setTopbar({ titulo = 'Terreno DTH', atras = null } = {}) {
  $titulo.textContent = titulo;
  if (handlerActual) {
    $atras.removeEventListener('click', handlerActual);
    handlerActual = null;
  }
  if (atras) {
    $atras.hidden = false;
    handlerActual = atras;
    $atras.addEventListener('click', handlerActual);
  } else {
    $atras.hidden = true;
  }
}
