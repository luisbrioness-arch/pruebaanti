import { api } from '../api.js';
import { toast } from '../toast.js';
import { conColaSiHaceFalta } from '../offline.js';
import { escapeHtml, formatDateTime, el } from '../utils.js';

const ETIQUETA_TIPO = { bug: '🐞 Bug', cambio: '💡 Cambio' };

export async function renderReportes(container) {
  container.appendChild(el(`
    <section class="panel-simple">
      <div class="panel-cabecera">
        <h2>Reportes</h2>
        <p class="panel-explicacion">
          Bugs y pedidos de cambio que cualquiera manda desde el botón "🐞 Reportar" del topbar — incluye
          lo que reportan los técnicos desde la app en el celular.
        </p>
      </div>
      <label class="campo campo--inline" style="max-width: 240px; margin-bottom: 16px;">
        <span>Estado</span>
        <select id="filtro-estado">
          <option value="abierto">Abiertos</option>
          <option value="resuelto">Resueltos</option>
          <option value="">Todos</option>
        </select>
      </label>
      <div id="lista-reportes"><p class="vacio">Cargando…</p></div>
    </section>
  `));

  const $lista = container.querySelector('#lista-reportes');
  const $filtro = container.querySelector('#filtro-estado');
  let estadoActual = 'abierto';
  let reportesActuales = [];

  async function cargar() {
    $lista.innerHTML = '<p class="vacio">Cargando…</p>';
    try {
      const qs = estadoActual ? `?estado=${estadoActual}` : '';
      const { reportes } = await api(`/admin/reportes${qs}`);
      reportesActuales = reportes;
      renderLista(reportesActuales);
    } catch (e) {
      $lista.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  $filtro.addEventListener('change', () => {
    estadoActual = $filtro.value;
    cargar();
  });

  function quitarDeListaLocal(id) {
    reportesActuales = reportesActuales.filter((r) => r.id !== id);
    renderLista(reportesActuales);
  }

  function renderLista(reportes) {
    if (!reportes.length) {
      $lista.innerHTML = '<p class="vacio">No hay reportes en este filtro.</p>';
      return;
    }
    $lista.innerHTML = '';
    for (const r of reportes) {
      const fila = el(`
        <article class="tarjeta-conflicto">
          <div>
            <h3>${ETIQUETA_TIPO[r.tipo] || escapeHtml(r.tipo)}</h3>
            <p class="conflicto-meta">
              ${escapeHtml(r.usuario_nombre)} · ${formatDateTime(r.creado_en)}
              ${r.pantalla ? ` · pantalla: <code>${escapeHtml(r.pantalla)}</code>` : ''}
              ${r.estado === 'resuelto' ? ` · resuelto por ${escapeHtml(r.resuelto_por_nombre || '—')}` : ''}
            </p>
            <p class="conflicto-descripcion">${escapeHtml(r.descripcion)}</p>
          </div>
          <div class="conflicto-acciones">
            ${r.estado === 'abierto'
              ? '<button type="button" class="btn btn--ok" data-accion="resolver">Marcar resuelto</button>'
              : '<button type="button" class="btn btn--secundario" data-accion="reabrir">Reabrir</button>'}
          </div>
        </article>
      `);
      const $btn = fila.querySelector('[data-accion]');
      $btn.addEventListener('click', () => cambiarEstado(r, $btn.dataset.accion));
      $lista.appendChild(fila);
    }
  }

  async function cambiarEstado(reporte, accion) {
    const tipo = accion === 'resolver' ? 'reporte_resolver' : 'reporte_reabrir';
    try {
      const { encolado } = await conColaSiHaceFalta(
        tipo, { id: reporte.id },
        () => api(`/admin/reportes/${reporte.id}/${accion}`, { method: 'POST' })
      );
      if (encolado) {
        toast('Cambio guardado sin conexión — se aplicará al recuperar señal.', 'neutro');
        quitarDeListaLocal(reporte.id);
      } else {
        toast(accion === 'resolver' ? 'Reporte marcado como resuelto.' : 'Reporte reabierto.', 'ok');
        await cargar();
      }
    } catch (e) {
      toast(e.message, 'malo');
    }
  }

  await cargar();
}
