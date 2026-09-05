// Inicio — accesos rápidos a las otras pantallas + lo importante de un
// vistazo (pedido: "falta una pantalla de inicio con accesos a las otras
// partes y con información importante"). Reemplaza a la vieja pestaña
// "Indicadores" (mismo endpoint, GET /admin/indicadores) — se fusionó acá
// para no tener dos tableros parecidos compitiendo por atención.
import { api } from '../api.js';
import { el, escapeHtml, formatMoney } from '../utils.js';
import { abrirModal } from '../modal.js';

// Iconos SVG en línea en vez de emoji (mejora visual: mismo trazo y peso
// que los del riel de navegación, se ven parejos en cualquier plataforma).
const ICONOS = {
  bodega: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7.5 12 4l9 3.5v9L12 20l-9-3.5z"/><path d="M12 11v9M3 7.5 12 11l9-3.5"/></svg>',
  bodegaTecnicos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="7.5" r="3.2"/><path d="M5.5 20c0-4 3-6.8 6.5-6.8s6.5 2.8 6.5 6.8"/></svg>',
  billetera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="13" rx="1.5"/><path d="M3 10h18"/></svg>',
  tarifario: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3h6a1.8 1.8 0 0 1 1.8 1.8v6L11 20 3 12l8.8-9Z"/></svg>',
  usuarios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><path d="M15.5 8a2.7 2.7 0 0 1 0 5"/><path d="M17.3 14c2 .4 3.7 2.2 3.7 6"/></svg>',
  informes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="4" width="14" height="17" rx="1.5"/><path d="M8.3 11h7.4M8.3 15h7.4"/></svg>',
};

const ACCESOS = [
  { ruta: 'bodega', icono: ICONOS.bodega, etiqueta: 'Bodega' },
  { ruta: 'bodega?vista=tecnicos', icono: ICONOS.bodegaTecnicos, etiqueta: 'Bodega técnicos' },
  { ruta: 'billetera', icono: ICONOS.billetera, etiqueta: 'Billetera' },
  { ruta: 'tarifario', icono: ICONOS.tarifario, etiqueta: 'Tarifario' },
  { ruta: 'usuarios', icono: ICONOS.usuarios, etiqueta: 'Usuarios' },
  { ruta: 'historial', icono: ICONOS.informes, etiqueta: 'Informes' },
];

/** 'YYYY-MM' de hoy, según el reloj del navegador. */
function mesActualStr() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

/** "Período: 1 al 30 de septiembre de 2026" — a partir de lo que devolvió el servidor (fuente de verdad del rango real usado). */
function formatPeriodoLabel(desde, hasta) {
  const d1 = new Date(desde + 'T00:00:00');
  const d2 = new Date(hasta + 'T00:00:00');
  const mesTexto = d1.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  return `Período: ${d1.getDate()} al ${d2.getDate()} de ${mesTexto}`;
}

/**
 * Pedido: "que el otro periodo salga en modo lista" — reemplaza el
 * `<input type="month">` (calendario nativo) por un `<select>` con los
 * últimos N meses, el más reciente primero.
 */
function listaUltimosMeses(n) {
  const hoy = new Date();
  const meses = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const etiqueta = d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    meses.push({ valor, etiqueta: etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1) });
  }
  return meses;
}

export async function renderInicio(container) {
  const seccion = el(`
    <section class="inicio">
      <div class="inicio-seccion inicio-seccion--primera">
        <h3>Accesos</h3>
        <div class="accesos-grid">
          ${ACCESOS.map((a) => `
            <a href="#${a.ruta}" class="acceso-tarjeta">
              <span class="acceso-icono">${a.icono}</span>
              <span>${escapeHtml(a.etiqueta)}</span>
            </a>
          `).join('')}
        </div>
      </div>

      <div class="inicio-seccion">
        <h3>Importante</h3>
        <div id="inicio-alertas"><p class="vacio">Cargando…</p></div>
      </div>

      <div class="inicio-seccion">
        <h3>Ventas pendientes de instalar</h3>
        <div id="inicio-ventas-pendientes"><p class="vacio">Cargando…</p></div>
      </div>

      <div class="inicio-seccion">
        <div class="form-fila" style="align-items: center;">
          <h3 id="periodo-titulo" style="margin: 0;">Este mes</h3>
          <button type="button" class="btn btn--secundario btn--chico" id="periodo-consultar">Consultar otro período</button>
          <button type="button" class="btn btn--texto btn--chico" id="periodo-hoy" hidden>Volver a este mes</button>
        </div>
        <div id="inicio-tiles"><p class="vacio">Cargando…</p></div>
      </div>
    </section>
  `);
  container.appendChild(seccion);

  try {
    const { ventas } = await api('/admin/ventas/pendientes-instalar');
    pintarVentasPendientes(seccion.querySelector('#inicio-ventas-pendientes'), ventas);
  } catch (e) {
    seccion.querySelector('#inicio-ventas-pendientes').innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
  }

  // Pedido/reporte #7: "Que diga periodo septiembre del 1 al 30 y que
  // cambie cuando sea otro mes y que tambien deje cambiar para mirar de
  // forma rapida otros periodos" — ajustado después a "prefiero que tenga
  // un boton que diga consultar otro periodo" (en vez de flechas ◀/▶): un
  // botón abre un modal con un selector de mes.
  const $titulo = seccion.querySelector('#periodo-titulo');
  const $tiles = seccion.querySelector('#inicio-tiles');
  const $btnConsultar = seccion.querySelector('#periodo-consultar');
  const $btnHoy = seccion.querySelector('#periodo-hoy');
  const mesDeHoy = mesActualStr();
  let mesMostrado = mesDeHoy;

  async function cargarPeriodo(mes) {
    mesMostrado = mes;
    $btnHoy.hidden = mes === mesDeHoy;
    $tiles.innerHTML = '<p class="vacio">Cargando…</p>';
    try {
      const r = await api(`/admin/indicadores?mes=${mes}`);
      $titulo.textContent = formatPeriodoLabel(r.periodo.desde, r.periodo.hasta);
      pintarTiles($tiles, r);
      // Las alertas ("Importante") no dependen del período — son la cola
      // de trabajo real de AHORA (conflictos, traspasos viejos, etc.), el
      // backend las calcula igual sin importar qué mes se haya pedido.
      pintarAlertas(seccion.querySelector('#inicio-alertas'), r);
    } catch (e) {
      $tiles.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  $btnConsultar.addEventListener('click', () => {
    const { root, cerrar } = abrirModal(`
      <h3>Consultar otro período</h3>
      <form id="form-periodo">
        <label class="campo">
          <span>Mes</span>
          <select name="mes" required>
            ${listaUltimosMeses(24).map((m) => `<option value="${m.valor}" ${m.valor === mesMostrado ? 'selected' : ''}>${escapeHtml(m.etiqueta)}</option>`).join('')}
          </select>
        </label>
        <div class="modal-acciones">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--primario">Ver</button>
        </div>
      </form>
    `);
    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-periodo').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const mes = new FormData(ev.target).get('mes');
      cerrar();
      cargarPeriodo(mes);
    });
  });
  $btnHoy.addEventListener('click', () => cargarPeriodo(mesDeHoy));

  await cargarPeriodo(mesDeHoy);
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
              <td>${escapeHtml(v.vendedor_nombre || 'TuVes (directo)')}</td>
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
    // Reporte #19: "que aqui tambien aparezca si un tecnico no ha aceptado
    // algun traspaso" — los recién enviados (todavía no llegan a 3 días)
    // no son urgentes como el de arriba, pero igual conviene que se vean.
    (r.traspasos_equipo_pendientes - r.traspasos_equipo_viejos) > 0 && {
      texto: `${r.traspasos_equipo_pendientes - r.traspasos_equipo_viejos} traspaso(s) de equipo esperando que el técnico confirme`, ruta: 'bodega', tono: 'neutro',
    },
    r.entregas_ferreteria_viejas > 0 && {
      texto: `${r.entregas_ferreteria_viejas} entrega(s) de ferretería llevan 3+ días sin confirmar`, ruta: 'bodega', tono: 'malo',
    },
    r.ferreteria_pendiente_confirmar > 0 && {
      texto: `${r.ferreteria_pendiente_confirmar} entrega(s) de ferretería esperando confirmación`, ruta: 'bodega', tono: 'alerta',
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
function tile(etiqueta, valor, { tono = '', valorDinero = null, ruta = 'historial' } = {}) {
  return `
    <a href="#${ruta}" class="tile ${tono}">
      <span class="tile-fila">
        <span class="tile-valor">${valor}</span>
        ${valorDinero !== null ? `<span class="tile-dinero">${escapeHtml(valorDinero)}</span>` : ''}
      </span>
      <span class="tile-etiqueta">${escapeHtml(etiqueta)}</span>
    </a>
  `;
}

// Pedido: "eliminemos el concepto de aprobadas si se instala ya es sumada"
// — "Aprobadas" duplicaba lo que ya cuenta "Instalaciones este mes" (una
// orden de instalación aprobada YA está en ese conteo). En su lugar,
// "Ventas por instalar" — la cola real de ventas registradas sin instalar
// todavía, mismo número que la tabla de arriba pero como resumen rápido.
// "Liquidado" (casi siempre $0 — dependía de un cierre manual de
// billetera) pasa a ser "Total mes": la plata real generada este mes por
// órdenes aprobadas (cualquier tipo de servicio) + comisión de las ventas
// que ya se instalaron.
function pintarTiles($div, r) {
  $div.innerHTML = `
    <div class="tiles">
      ${tile('Instalaciones este mes', r.instalaciones_mes.n, { tono: 'tile--ok', valorDinero: formatMoney(r.instalaciones_mes.monto) })}
      ${tile('Ventas este mes', r.ventas_mes.n, { tono: 'tile--ok', valorDinero: formatMoney(r.ventas_mes.monto) })}
      ${tile('Ventas por instalar', r.ventas_por_instalar, { tono: 'tile--ok' })}
      ${tile('Total mes', formatMoney(r.total_mes), { tono: 'tile--ok', ruta: 'billetera' })}
    </div>
  `;
}
