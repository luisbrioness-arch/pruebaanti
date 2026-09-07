// Modal genérico. abrirModal(html, { onMount }) inserta el contenido dentro
// de un overlay ya presente en index.html (#modal-overlay) y devuelve
// { root, cerrar }. Cierra con Escape o clic fuera, a menos que se pida lo
// contrario explícitamente (formularios con datos sin guardar).

const overlay = () => document.getElementById('modal-overlay');
const contenedor = () => document.getElementById('modal-contenido');

let manejadorTecla = null;

export function abrirModal(html, { cerrarConEscape = true, amplio = false } = {}) {
  const ov = overlay();
  const box = contenedor();
  box.className = 'modal-caja' + (amplio ? ' modal-caja--amplio' : '');
  box.innerHTML = html;
  ov.hidden = false;
  document.body.classList.add('modal-abierto');

  const cerrar = () => {
    ov.hidden = true;
    box.innerHTML = '';
    box.className = 'modal-caja';
    document.body.classList.remove('modal-abierto');
    if (manejadorTecla) {
      document.removeEventListener('keydown', manejadorTecla);
      manejadorTecla = null;
    }
  };

  if (cerrarConEscape) {
    manejadorTecla = (ev) => {
      if (ev.key === 'Escape') cerrar();
    };
    document.addEventListener('keydown', manejadorTecla);
  }

  ov.onclick = (ev) => {
    if (ev.target === ov) cerrar();
  };

  const primerCampo = box.querySelector('input, textarea, select, button');
  if (primerCampo) primerCampo.focus();

  return { root: box, cerrar };
}
