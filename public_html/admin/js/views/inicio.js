// Inicio — accesos rápidos a las otras pantallas + lo importante de un
// vistazo (pedido: "falta una pantalla de inicio con accesos a las otras
// partes y con información importante"). Reemplaza a la vieja pestaña
// "Indicadores" (mismo endpoint, GET /admin/indicadores) — se fusionó acá
// para no tener dos tableros parecidos compitiendo por atención.
import { api } from '../api.js';
import { el, escapeHtml, formatMoney } from '../utils.js';

const ACCESOS = [
  { ruta: 'auditoria', icono: '📋', etiqueta: 'Auditoría' },
  { ruta: 'conflictos', icono: '⚠️', etiqueta: 'Conflictos' },
  { ruta: 'tarifario', icono: '💲', etiqueta: 'Tarifario' },
  { ruta: 'bodega', icono: '📦', etiqueta: 'Bodega' },
  { ruta: 'billetera', icono: '👛', etiqueta: 'Billetera' },
  { ruta: 'usuarios', icono: '👥', etiqueta: 'Usuarios' },
];

export async function renderInicio(container) {
  const seccion = el(`
    <section class="inicio">
      <h3>Accesos</h3>
      <div class="accesos-grid">
        ${ACCESOS.map((a) => `
          <a href="#${a.ruta}" class="acceso-tarjeta">
            <span class="acceso-icono">${a.icono}</span>
            <span>${escapeHtml(a.etiqueta)}</span>
          </a>
        `).join('')}
      </div>

      <h3 style="margin-top: 26px;">Importante</h3>
      <div id="inicio-alertas"><p class="vacio">Cargando…</p></div>

      <h3 style="margin-top: 26px;">Este mes</h3>
      <div id="inicio-tiles"><p class="vacio">Cargando…</p></div>
    </section>
  `);
  container.appendChild(seccion);

  try {
    const r = await api('/admin/indicadores');
    pintarAlertas(seccion.querySelector('#inicio-alertas'), r);
    pintarTiles(seccion.querySelector('#inicio-tiles'), r);
  } catch (e) {
    seccion.querySelector('#inicio-alertas').innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    seccion.querySelector('#inicio-tiles').innerHTML = '';
  }
}

function pintarAlertas($div, r) {
  const items = [
    r.pendientes_auditoria > 0 && {
      texto: `${r.pendientes_auditoria} orden(es) esperando auditoría`, ruta: 'auditoria', tono: 'alerta',
    },
    r.conflictos_abiertos > 0 && {
      texto: `${r.conflictos_abiertos} orden(es) en conflicto sin resolver`, ruta: 'conflictos', tono: 'malo',
    },
    r.traspasos_equipo_viejos > 0 && {
      texto: `${r.traspasos_equipo_viejos} traspaso(s) de equipo llevan 3+ días sin confirmar`, ruta: 'bodega', tono: 'malo',
    },
    r.entregas_ferreteria_viejas > 0 && {
      texto: `${r.entregas_ferreteria_viejas} entrega(s) de ferretería llevan 3+ días sin confirmar`, ruta: 'bodega', tono: 'malo',
    },
    r.ferreteria_pendiente_confirmar > 0 && {
      texto: `${r.ferreteria_pendiente_confirmar} entrega(s) de ferretería esperando confirmación`, ruta: 'bodega', tono: 'alerta',
    },
    r.saldo_pendiente_total > 0 && {
      texto: `${formatMoney(r.saldo_pendiente_total)} a favor de los técnicos en billetera`, ruta: 'billetera', tono: 'neutro',
    },
  ].filter(Boolean);

  if (!items.length) {
    $div.innerHTML = '<p class="campo-ayuda">✔ Todo al día — no hay nada urgente pendiente.</p>';
    return;
  }
  $div.innerHTML = `
    <div class="alertas-lista">
      ${items.map((i) => `
        <a href="#${i.ruta}" class="alerta-fila alerta-fila--${i.tono}">${escapeHtml(i.texto)} →</a>
      `).join('')}
    </div>
  `;
}

function tile(etiqueta, valor, tono = '') {
  return `
    <div class="tile ${tono}">
      <span class="tile-valor">${valor}</span>
      <span class="tile-etiqueta">${escapeHtml(etiqueta)}</span>
    </div>
  `;
}

function pintarTiles($div, r) {
  const mapaOrdenes = Object.fromEntries(r.ordenes_por_estado_mes.map((o) => [o.estado, Number(o.n)]));
  $div.innerHTML = `
    <div class="tiles">
      ${tile('Órdenes enviadas', mapaOrdenes.enviada || 0)}
      ${tile('Aprobadas', mapaOrdenes.aprobada || 0, 'tile--ok')}
      ${tile('Rechazadas', (mapaOrdenes.rechazada_corregible || 0) + (mapaOrdenes.rechazada_penalizada || 0), 'tile--malo')}
      ${tile('Liquidado', formatMoney(r.liquidado_mes), 'tile--ok')}
    </div>
  `;
}
