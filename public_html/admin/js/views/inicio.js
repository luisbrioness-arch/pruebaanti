// Inicio — accesos rápidos a las otras pantallas + lo importante de un
// vistazo (pedido: "falta una pantalla de inicio con accesos a las otras
// partes y con información importante"). Reemplaza a la vieja pestaña
// "Indicadores" (mismo endpoint, GET /admin/indicadores) — se fusionó acá
// para no tener dos tableros parecidos compitiendo por atención.
import { api } from '../api.js';
import { el, escapeHtml, formatMoney } from '../utils.js';

const ACCESOS = [
  { ruta: 'historial', icono: '📋', etiqueta: 'Historial' },
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

      <h3 style="margin-top: 26px;">Ventas pendientes de instalar</h3>
      <div id="inicio-ventas-pendientes"><p class="vacio">Cargando…</p></div>

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

  try {
    const { ventas } = await api('/admin/ventas/pendientes-instalar');
    pintarVentasPendientes(seccion.querySelector('#inicio-ventas-pendientes'), ventas);
  } catch (e) {
    seccion.querySelector('#inicio-ventas-pendientes').innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
  }
}

/** "hoy", "en 3 días", "vencida hace 2 días" — sin depender de ninguna librería de fechas. */
function etiquetaFecha(fechaStr) {
  if (!fechaStr) return { texto: 'Sin fecha', tono: '' };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaStr + 'T00:00:00');
  const dias = Math.round((fecha - hoy) / 86400000);
  const fechaFmt = fecha.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (dias < 0) return { texto: `${fechaFmt} — vencida hace ${-dias} día${-dias === 1 ? '' : 's'}`, tono: 'malo' };
  if (dias === 0) return { texto: `${fechaFmt} — hoy`, tono: 'malo' };
  if (dias <= 3) return { texto: `${fechaFmt} — en ${dias} día${dias === 1 ? '' : 's'}`, tono: 'alerta' };
  return { texto: fechaFmt, tono: '' };
}

function pintarVentasPendientes($div, ventas) {
  if (!ventas.length) {
    $div.innerHTML = '<p class="campo-ayuda">No hay ventas esperando instalación.</p>';
    return;
  }
  $div.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Cliente</th><th>Plan</th><th>Comuna</th><th>Vendedor</th><th>Fecha pedida</th></tr></thead>
      <tbody>
        ${ventas.map((v) => {
          const { texto, tono } = etiquetaFecha(v.fecha_instalacion_solicitada);
          return `
            <tr>
              <td>${escapeHtml(v.cliente_nombre)}</td>
              <td>${escapeHtml(v.plan_nombre)}</td>
              <td>${escapeHtml(v.comuna)}</td>
              <td>${escapeHtml(v.vendedor_nombre)}</td>
              <td>${tono ? `<span class="chip chip--${tono}">${escapeHtml(texto)}</span>` : escapeHtml(texto)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function pintarAlertas($div, r) {
  const items = [
    // Ya no hay cola de auditoría manual (las órdenes se auto-aprueban al
    // enviarse) — solo queda avisar si alguna quedó en conflicto de folio,
    // que ahora se ve (con su estado) en Historial.
    r.conflictos_abiertos > 0 && {
      texto: `${r.conflictos_abiertos} orden(es) en conflicto sin resolver`, ruta: 'historial', tono: 'malo',
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
  // Con la auto-aprobación al enviar, una orden ya no se queda "enviada"
  // esperando auditoría — pasa a "aprobada" en el mismo instante. Por eso
  // el total del mes se suma acá en vez de mostrar el bucket 'enviada'
  // (que ahora siempre da 0).
  const totalMes = Object.values(mapaOrdenes).reduce((a, b) => a + b, 0);
  $div.innerHTML = `
    <div class="tiles">
      ${tile('Órdenes este mes', totalMes)}
      ${tile('Aprobadas', mapaOrdenes.aprobada || 0, 'tile--ok')}
      ${tile('Rechazadas', (mapaOrdenes.rechazada_corregible || 0) + (mapaOrdenes.rechazada_penalizada || 0), 'tile--malo')}
      ${tile('Liquidado', formatMoney(r.liquidado_mes), 'tile--ok')}
    </div>
  `;
}
