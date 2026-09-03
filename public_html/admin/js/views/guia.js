// Guía de despacho — resumen imprimible de todo lo que un técnico tiene
// pendiente de confirmar en este momento (equipos en_transito + ferretería
// pendiente), para que quien despacha lleve un papel con lo que corresponde
// entregar. No es un documento tributario (no reemplaza una guía SII real
// si algún día hiciera falta transportar comercialmente) — es un
// comprobante interno de "esto es lo que te mandé".
import { api } from '../api.js';
import { el, escapeHtml, formatDateTime } from '../utils.js';
import { irA } from '../router.js';

export async function renderGuia(container, params) {
  const tecnicoId = Number(params?.tecnicoId);
  const seccion = el(`
    <section class="guia-despacho">
      <div class="guia-acciones" data-no-imprimir>
        <button type="button" class="btn btn--secundario" id="btn-volver">← Volver</button>
        <button type="button" class="btn btn--primario" id="btn-imprimir">🖨 Imprimir</button>
      </div>
      <div id="guia-contenido"><p class="vacio">Cargando…</p></div>
    </section>
  `);
  container.appendChild(seccion);
  seccion.querySelector('#btn-volver').addEventListener('click', () => irA('bodega'));
  seccion.querySelector('#btn-imprimir').addEventListener('click', () => window.print());

  const $contenido = seccion.querySelector('#guia-contenido');
  if (!tecnicoId) {
    $contenido.innerHTML = '<p class="vacio vacio--error">Falta el técnico.</p>';
    return;
  }
  try {
    const [{ usuarios }, { equipos, ferreteria }] = await Promise.all([
      api('/admin/usuarios'),
      api(`/admin/tecnicos/${tecnicoId}/traspasos-pendientes`),
    ]);
    const tecnico = usuarios.find((u) => u.id === tecnicoId);

    $contenido.innerHTML = `
      <header class="guia-encabezado">
        <h1>Guía de despacho (uso interno)</h1>
        <p>Terreno DTH — no es un documento tributario</p>
      </header>
      <dl class="guia-datos">
        <div><dt>Técnico</dt><dd>${escapeHtml(tecnico?.nombre || '—')}</dd></div>
        <div><dt>Fecha</dt><dd>${formatDateTime(new Date().toISOString())}</dd></div>
      </dl>

      <h2>Equipos (${equipos.length})</h2>
      ${equipos.length ? `
        <table class="tabla">
          <thead><tr><th>N° de serie</th><th>Tipo</th><th>Origen</th><th>Desde</th></tr></thead>
          <tbody>
            ${equipos.map((e) => `
              <tr>
                <td class="celda-mono">${escapeHtml(e.numero_serie)}</td>
                <td>${escapeHtml(e.tipo_equipo_nombre)}</td>
                <td>${escapeHtml(e.origen_nombre || 'Bodega central')}</td>
                <td>${formatDateTime(e.actualizado_en)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p class="vacio">Ninguno pendiente.</p>'}

      <h2>Ferretería (${ferreteria.length})</h2>
      ${ferreteria.length ? `
        <table class="tabla">
          <thead><tr><th>Ítem</th><th>Cantidad</th><th>Desde</th></tr></thead>
          <tbody>
            ${ferreteria.map((f) => `
              <tr>
                <td>${escapeHtml(f.item_nombre)}</td>
                <td>${f.cantidad} ${escapeHtml(f.unidad_medida)}</td>
                <td>${formatDateTime(f.creado_en)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p class="vacio">Ninguna pendiente.</p>'}

      <p class="guia-firma">Recibí conforme (firma técnico): ______________________________</p>
    `;
  } catch (e) {
    $contenido.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
  }
}
