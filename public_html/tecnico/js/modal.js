// Modal genérico — mismo contrato que el del panel admin, adaptado a un
// overlay que sube desde abajo (más natural con el pulgar en un celular).
import { escapeHtml } from './utils.js';

const overlay = () => document.getElementById('modal-overlay');
const contenedor = () => document.getElementById('modal-contenido');

export function abrirModal(html) {
  const ov = overlay();
  const box = contenedor();
  box.innerHTML = html;
  ov.hidden = false;

  const cerrar = () => {
    ov.hidden = true;
    box.innerHTML = '';
  };

  ov.onclick = (ev) => {
    if (ev.target === ov) cerrar();
  };

  return { root: box, cerrar };
}

/** Confirmación simple sí/no — devuelve una Promise<boolean>. */
export function confirmar(mensaje, { textoOk = 'Confirmar', textoCancelar = 'Cancelar', peligro = false } = {}) {
  return new Promise((resolve) => {
    const { root, cerrar } = abrirModal(`
      <p>${escapeHtml(mensaje)}</p>
      <div class="wizard-acciones" style="position: static; box-shadow: none; border: none; padding: 0;">
        <button type="button" class="btn btn--secundario" id="modal-cancelar">${escapeHtml(textoCancelar)}</button>
        <button type="button" class="btn ${peligro ? 'btn--peligro' : 'btn--primario'}" id="modal-ok">${escapeHtml(textoOk)}</button>
      </div>
    `);
    root.querySelector('#modal-cancelar').addEventListener('click', () => { cerrar(); resolve(false); });
    root.querySelector('#modal-ok').addEventListener('click', () => { cerrar(); resolve(true); });
  });
}
