// Modal genérico. abrirModal(html, { onMount }) inserta el contenido dentro
// de un overlay ya presente en index.html (#modal-overlay) y devuelve
// { root, cerrar }. Cierra con Escape o clic fuera, a menos que se pida lo
// contrario explícitamente (formularios con datos sin guardar).

import { escapeHtml } from './utils.js';

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

/** Confirmación modal sí/no — devuelve Promise<boolean>. */
export function confirmar(mensaje, { textoOk = 'Confirmar', textoCancelar = 'Cancelar', peligro = false } = {}) {
  return new Promise((resolve) => {
    const { root, cerrar } = abrirModal(`
      <div style="padding: 6px 0;">
        <p style="font-size: 1.05rem; font-weight: 600; color: var(--tinta); margin: 0 0 20px;">${escapeHtml(mensaje)}</p>
        <div class="modal-acciones" style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
          <button type="button" class="btn btn--secundario" id="modal-confirmar-cancelar">${escapeHtml(textoCancelar)}</button>
          <button type="button" class="btn ${peligro ? 'btn--peligro' : 'btn--primario'}" id="modal-confirmar-ok">${escapeHtml(textoOk)}</button>
        </div>
      </div>
    `);
    root.querySelector('#modal-confirmar-cancelar').addEventListener('click', () => { cerrar(); resolve(false); });
    root.querySelector('#modal-confirmar-ok').addEventListener('click', () => { cerrar(); resolve(true); });
  });
}
