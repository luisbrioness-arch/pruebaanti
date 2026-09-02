import { api } from '../api.js';
import { abrirModal } from '../modal.js';
import { toast } from '../toast.js';
import { conColaSiHaceFalta } from '../offline.js';
import { escapeHtml, formatDateTime, el } from '../utils.js';

export async function renderConflictos(container) {
  container.appendChild(el(`
    <section class="panel-simple">
      <div class="panel-cabecera">
        <h2>Conflictos de sincronización</h2>
        <p class="panel-explicacion">
          Dos técnicos (o el mismo, el mismo día) usaron el mismo folio. La orden entró igual al sistema —
          nunca se pierde trabajo hecho — y espera aquí a que decidas si es un duplicado real o una
          reutilización legítima (ej. una visita de garantía).
        </p>
      </div>
      <div id="lista-conflictos"><p class="vacio">Cargando…</p></div>
    </section>
  `));

  const $lista = container.querySelector('#lista-conflictos');
  let conflictosActuales = [];

  async function cargar() {
    $lista.innerHTML = '<p class="vacio">Cargando…</p>';
    try {
      const { conflictos } = await api('/admin/conflictos');
      conflictosActuales = conflictos;
      renderLista(conflictosActuales);
    } catch (e) {
      $lista.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  /** Sin conexión no hay forma de refrescar la lista de verdad — se saca el ya resuelto de la vista actual. */
  function quitarDeListaLocal(id) {
    conflictosActuales = conflictosActuales.filter((c) => c.id !== id);
    renderLista(conflictosActuales);
  }

  function renderLista(conflictos) {
    if (!conflictos.length) {
      $lista.innerHTML = '<p class="vacio">No hay conflictos pendientes.</p>';
      return;
    }
    $lista.innerHTML = '';
    for (const c of conflictos) {
      const fila = el(`
        <article class="tarjeta-conflicto">
          <div>
            <h3>Folio ${escapeHtml(c.folio)}</h3>
            <p class="conflicto-meta">${escapeHtml(c.tecnico_nombre)} · ${formatDateTime(c.creado_en)}</p>
            <p class="conflicto-descripcion">${escapeHtml(c.descripcion)}</p>
          </div>
          <div class="conflicto-acciones">
            <button type="button" class="btn btn--malo" data-accion="invalidar">Invalidar orden</button>
            <button type="button" class="btn btn--ok" data-accion="aceptar">Aceptar como legítima</button>
          </div>
        </article>
      `);
      fila.querySelector('[data-accion="invalidar"]').addEventListener('click', () => resolver(c, 'invalidar'));
      fila.querySelector('[data-accion="aceptar"]').addEventListener('click', () => resolver(c, 'aceptar'));
      $lista.appendChild(fila);
    }
  }

  function resolver(conflicto, accion) {
    const titulo = accion === 'invalidar' ? 'Invalidar como duplicado real' : 'Aceptar como reutilización legítima';
    const explicacion = accion === 'invalidar'
      ? 'La orden en conflicto quedará rechazada sin pago (folio duplicado por error).'
      : 'La orden en conflicto vuelve a "enviada" para auditarse normalmente.';
    const { root, cerrar } = abrirModal(`
      <h3>${titulo}</h3>
      <p class="modal-explicacion">${explicacion}</p>
      <form id="form-resolver">
        <label class="campo">
          <span>Comentario (opcional)</span>
          <textarea name="comentario" rows="2" autofocus></textarea>
        </label>
        <div class="modal-acciones">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn ${accion === 'invalidar' ? 'btn--malo' : 'btn--ok'}">Confirmar</button>
        </div>
      </form>
    `);
    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-resolver').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const comentario = new FormData(ev.target).get('comentario') || null;
      const payload = { id: conflicto.id, accion, comentario };
      try {
        const { encolado } = await conColaSiHaceFalta(
          'resolver_conflicto', payload,
          () => api(`/admin/conflictos/${conflicto.id}/resolver`, { method: 'POST', body: payload })
        );
        cerrar();
        if (encolado) {
          toast(`Folio ${conflicto.folio} guardado sin conexión — se resolverá al recuperar señal.`, 'neutro');
          quitarDeListaLocal(conflicto.id);
        } else {
          toast(`Folio ${conflicto.folio} resuelto.`, 'ok');
          await cargar();
        }
      } catch (e) {
        toast(e.message, 'malo');
      }
    });
  }

  await cargar();
}
