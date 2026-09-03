// Dashboard de indicadores (mejora 7) — de solo lectura, resume "cómo viene
// el mes" con datos que ya existen en otras pantallas (auditoría, bodega,
// billetera), sin duplicar nada. No reemplaza esas pantallas operativas.
import { api } from '../api.js';
import { el, escapeHtml, formatMoney } from '../utils.js';

export async function renderIndicadores(container) {
  const seccion = el('<section class="indicadores"><p class="vacio">Cargando…</p></section>');
  container.appendChild(seccion);
  try {
    const r = await api('/admin/indicadores');
    pintar(seccion, r);
  } catch (e) {
    seccion.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
  }
}

function tile(etiqueta, valor, tono = '') {
  return `
    <div class="tile ${tono}">
      <span class="tile-valor">${valor}</span>
      <span class="tile-etiqueta">${escapeHtml(etiqueta)}</span>
    </div>
  `;
}

function pintar(seccion, r) {
  const mapaOrdenes = Object.fromEntries(r.ordenes_por_estado_mes.map((o) => [o.estado, Number(o.n)]));
  const mapaEquipos = Object.fromEntries(r.equipos_por_estado.map((e) => [e.estado, Number(e.n)]));

  seccion.innerHTML = `
    <h3>Este mes</h3>
    <div class="tiles">
      ${tile('Órdenes enviadas', mapaOrdenes.enviada || 0)}
      ${tile('Aprobadas', mapaOrdenes.aprobada || 0, 'tile--ok')}
      ${tile('Rechazadas', (mapaOrdenes.rechazada_corregible || 0) + (mapaOrdenes.rechazada_penalizada || 0), 'tile--malo')}
      ${tile('En conflicto', mapaOrdenes.conflicto || 0, 'tile--alerta')}
      ${tile('Liquidado', formatMoney(r.liquidado_mes), 'tile--ok')}
    </div>

    <h3 style="margin-top: 22px;">Billetera</h3>
    <div class="tiles">
      ${tile('Saldo total a favor de técnicos', formatMoney(r.saldo_pendiente_total))}
    </div>

    <h3 style="margin-top: 22px;">Bodega</h3>
    <div class="tiles">
      ${tile('En bodega', mapaEquipos.bodega || 0)}
      ${tile('En maletas', mapaEquipos.maleta || 0)}
      ${tile('En tránsito', mapaEquipos.en_transito || 0, mapaEquipos.en_transito ? 'tile--alerta' : '')}
      ${tile('Ferretería por confirmar', r.ferreteria_pendiente_confirmar, r.ferreteria_pendiente_confirmar ? 'tile--alerta' : '')}
    </div>

    <h3 style="margin-top: 22px;">Últimos 30 días</h3>
    <div class="tiles">
      ${tile('Traspasos de equipo rechazados', r.traspasos_rechazados_30d, r.traspasos_rechazados_30d ? 'tile--malo' : '')}
      ${tile('Entregas de ferretería rechazadas', r.entregas_rechazadas_30d, r.entregas_rechazadas_30d ? 'tile--malo' : '')}
    </div>

    ${r.reportes_abiertos ? `<p class="campo-ayuda" style="margin-top: 18px;">🐞 ${r.reportes_abiertos} reporte(s) sin resolver (visible solo para Claude).</p>` : ''}
  `;
}
