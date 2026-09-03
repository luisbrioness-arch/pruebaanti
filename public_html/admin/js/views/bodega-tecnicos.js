import { api } from '../api.js';
import { escapeHtml, el } from '../utils.js';

/**
 * Antes era una pestaña más dentro de "Bodega" ("Bodegas de técnicos") —
 * pasa a su propio ítem de nav (pedido: "mejora estos menus... y que
 * arriba solo sea bodega - bodega tecnicos"), porque es una pregunta
 * distinta a la de "Bodega" (que es inventario general): acá el punto de
 * partida es el técnico, no el ítem.
 */
export async function renderBodegaTecnicos(container) {
  container.appendChild(el(`
    <section class="panel-simple">
      <div class="panel-cabecera">
        <h2>Bodega técnicos</h2>
        <p class="panel-explicacion">Qué tiene cada técnico en su maleta ahora mismo — equipos y ferretería confirmada.</p>
      </div>
      <label class="campo campo--inline">
        <span>Técnico</span>
        <select id="select-tecnico-bodega">
          <option value="">Elegí un técnico…</option>
        </select>
      </label>
      <div id="contenido-tecnico"></div>
    </section>
  `));

  const $select = container.querySelector('#select-tecnico-bodega');
  const $div = container.querySelector('#contenido-tecnico');

  try {
    const { usuarios } = await api('/admin/usuarios');
    const tecnicos = usuarios.filter((u) => u.rol === 'tecnico');
    $select.innerHTML = '<option value="">Elegí un técnico…</option>'
      + tecnicos.map((t) => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
  } catch (e) {
    $div.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    return;
  }

  $select.addEventListener('change', (ev) => {
    const id = ev.target.value;
    if (id) cargarBodegaTecnico(Number(id));
    else $div.innerHTML = '';
  });

  async function cargarBodegaTecnico(tecnicoId) {
    $div.innerHTML = '<p class="vacio">Cargando…</p>';
    try {
      const [{ equipos: equiposTecnico }, { stock }] = await Promise.all([
        api(`/admin/equipos?estado=maleta&tecnico_id=${tecnicoId}`),
        api(`/admin/ferreteria/stock?tecnico_id=${tecnicoId}`),
      ]);
      $div.innerHTML = `
        <div class="form-fila" style="margin: 10px 0;">
          <a href="#guia?tecnicoId=${tecnicoId}" class="btn btn--secundario">🖨 Ver guía de despacho pendiente</a>
        </div>
        <h3>Equipos en su maleta (${equiposTecnico.length})</h3>
        ${equiposTecnico.length ? `
          <table class="tabla">
            <thead><tr><th>Serie</th><th>Tipo</th></tr></thead>
            <tbody>${equiposTecnico.map((e) => `<tr><td class="celda-mono">${escapeHtml(e.numero_serie)}</td><td>${escapeHtml(e.tipo_equipo_nombre)}</td></tr>`).join('')}</tbody>
          </table>
        ` : '<p class="vacio">No tiene equipos en su maleta.</p>'}

        <h3>Ferretería confirmada</h3>
        ${stock.length ? `
          <table class="tabla">
            <thead><tr><th>Ítem</th><th>Cantidad</th></tr></thead>
            <tbody>${stock.map((s) => `<tr><td>${escapeHtml(s.item_nombre)}</td><td class="${Number(s.cantidad_actual) < 0 ? 'celda-negativa' : ''}">${s.cantidad_actual} ${escapeHtml(s.unidad_medida)}</td></tr>`).join('')}</tbody>
          </table>
        ` : '<p class="vacio">Sin ferretería confirmada.</p>'}
      `;
    } catch (e) {
      $div.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }
}
