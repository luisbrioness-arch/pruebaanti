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
  { ruta: 'bodega-tecnicos', icono: '🧑‍🔧', etiqueta: 'Bodega técnicos' },
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
      <thead>
        <tr>
          <th>Cliente</th><th>Dirección</th><th>Plan</th><th>Comuna</th><th>Vendedor</th>
          <th style="text-align: left;">Fecha pedida</th>
        </tr>
      </thead>
      <tbody>
        ${ventas.map((v) => {
          const { texto, tono } = etiquetaFecha(v.fecha_instalacion_solicitada);
          return `
            <tr>
              <td>${escapeHtml(v.cliente_nombre)}</td>
              <td>${escapeHtml(v.cliente_direccion || '—')}</td>
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

/**
 * Tile accionable (pedido: "que aqui sean botones accionables") — todo el
 * tile es un link a Historial, no solo decoración. `valorDinero` es
 * opcional: cuando viene, se pinta aparte a la derecha del conteo
 * (pedido: "a la derecha el valor en dinero que lo que llevamos").
 */
function tile(etiqueta, valor, { tono = '', valorDinero = null } = {}) {
  return `
    <a href="#historial" class="tile ${tono}">
      <span class="tile-fila">
        <span class="tile-valor">${valor}</span>
        ${valorDinero !== null ? `<span class="tile-dinero">${escapeHtml(valorDinero)}</span>` : ''}
      </span>
      <span class="tile-etiqueta">${escapeHtml(etiqueta)}</span>
    </a>
  `;
}

function pintarTiles($div, r) {
  const mapaOrdenes = Object.fromEntries(r.ordenes_por_estado_mes.map((o) => [o.estado, Number(o.n)]));
  $div.innerHTML = `
    <div class="tiles">
      ${tile('Instalaciones este mes', r.instalaciones_mes.n, { tono: 'tile--ok', valorDinero: formatMoney(r.instalaciones_mes.monto) })}
      ${tile('Ventas este mes', r.ventas_mes.n, { tono: 'tile--ok', valorDinero: formatMoney(r.ventas_mes.monto) })}
      ${tile('Aprobadas', mapaOrdenes.aprobada || 0, { tono: 'tile--ok' })}
      ${tile('Liquidado', formatMoney(r.liquidado_mes), { tono: 'tile--ok' })}
    </div>
  `;
}
