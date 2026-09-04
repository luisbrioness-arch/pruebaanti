// Informes (pedido: "que esta pantalla no se llame historial si no que
// INFORMES donde se vea el historial de las ultimas actividades y en otra
// pestaña los posibles informes generados por cada tecnico") — antes era
// solo esto: "elimina auditoria y crea un link de historial ordenes
// vendidas y ordenes instaladas con fecha", reemplazando a la pantalla de
// Auditoría. Ya no hay cola de revisión manual: las órdenes se auto-aprueban
// al enviarse (ver OrdenWizardService::confirmarEnviada), así que todo esto
// es de solo lectura.
//
// Dos submenús sobre el MISMO filtro (técnico / desde / hasta) y el MISMO
// fetch — no hace falta pedirle nada nuevo al servidor para el resumen, se
// arma agrupando por técnico lo que ya se trajo para el historial.
import { api } from '../api.js';
import {
  badge, escapeHtml, formatMoney, formatDateTime, el,
} from '../utils.js';

/** dd-mm-aaaa sin hora — para columnas de fecha "de calendario" (venta, instalación pedida). */
function formatDate(s) {
  if (!s) return '—';
  const d = new Date(String(s).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function renderHistorial(container) {
  container.appendChild(el(`
    <section class="panel-simple">
      <div class="panel-cabecera">
        <h2>Informes</h2>
        <p class="panel-explicacion">
          Ventas registradas y órdenes de trabajo, con su fecha — las órdenes se auto-aprueban al
          enviarse (ya no hay una cola de auditoría manual antes de pagar).
        </p>
      </div>

      <nav class="subtabs" id="subtabs-informes">
        <button type="button" class="subtab subtab--activo" data-tab="historial">Historial</button>
        <button type="button" class="subtab" data-tab="resumen">Resumen por técnico</button>
      </nav>

      <form id="form-filtros" class="form-fila">
        <label class="campo campo--inline">
          <span>Técnico</span>
          <select name="tecnico_id"><option value="">Todos</option></select>
        </label>
        <label class="campo campo--inline">
          <span>Desde</span>
          <input type="date" name="desde">
        </label>
        <label class="campo campo--inline">
          <span>Hasta</span>
          <input type="date" name="hasta">
        </label>
        <button type="submit" class="btn btn--secundario">Filtrar</button>
      </form>

      <div id="vista-historial">
        <h3 style="margin-top: 20px;">Ventas registradas</h3>
        <div id="tabla-ventas"><p class="vacio">Cargando…</p></div>

        <h3 style="margin-top: 26px;">Órdenes</h3>
        <div id="tabla-ordenes"><p class="vacio">Cargando…</p></div>
      </div>

      <div id="vista-resumen" hidden>
        <div id="tabla-resumen" style="margin-top: 20px;"><p class="vacio">Cargando…</p></div>
      </div>
    </section>
  `));

  const $selectTecnico = container.querySelector('select[name="tecnico_id"]');
  const $ventas = container.querySelector('#tabla-ventas');
  const $ordenes = container.querySelector('#tabla-ordenes');
  const $resumen = container.querySelector('#tabla-resumen');
  const $form = container.querySelector('#form-filtros');
  const $vistaHistorial = container.querySelector('#vista-historial');
  const $vistaResumen = container.querySelector('#vista-resumen');
  const $subtabs = Array.from(container.querySelectorAll('#subtabs-informes .subtab'));

  $subtabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      $subtabs.forEach((b) => b.classList.toggle('subtab--activo', b === btn));
      const esResumen = btn.dataset.tab === 'resumen';
      $vistaHistorial.hidden = esResumen;
      $vistaResumen.hidden = !esResumen;
    });
  });

  try {
    // Pedido: "edwin tambien es un tecnico que recibe los equipos de
    // bodega central" — filtrar por rol==='tecnico' dejaba a Edwin (admin)
    // afuera del selector, aunque tiene sus propias órdenes/ventas reales
    // (las ve como cualquier técnico). Se listan todos los usuarios.
    const { usuarios } = await api('/admin/usuarios');
    for (const u of usuarios) {
      $selectTecnico.appendChild(el(`<option value="${u.id}">${escapeHtml(u.nombre)}</option>`));
    }
  } catch { /* el filtro por técnico queda solo con "Todos" si esto falla */ }

  $form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    cargar();
  });

  function queryActual() {
    const fd = new FormData($form);
    const params = new URLSearchParams();
    for (const campo of ['tecnico_id', 'desde', 'hasta']) {
      const valor = fd.get(campo);
      if (valor) params.set(campo, valor);
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  function pintarVentas(ventas) {
    if (!ventas.length) {
      $ventas.innerHTML = '<p class="vacio">No hay ventas en este filtro.</p>';
      return;
    }
    $ventas.innerHTML = `
      <table class="tabla">
        <thead>
          <tr>
            <th>Cliente</th><th>Plan</th><th>Comuna</th><th>Vendedor</th>
            <th>Fecha de venta</th><th>Instalación pedida</th><th style="text-align: left;">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${ventas.map((v) => `
            <tr>
              <td>${escapeHtml(v.cliente_nombre)}</td>
              <td>${escapeHtml(v.plan_nombre)}</td>
              <td>${escapeHtml(v.comuna)}</td>
              <td>${escapeHtml(v.vendedor_nombre)}</td>
              <td>${formatDate(v.creado_en)}</td>
              <td>${formatDate(v.fecha_instalacion_solicitada)}</td>
              <td>${badge(v.estado)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function pintarOrdenes(ordenes) {
    if (!ordenes.length) {
      $ordenes.innerHTML = '<p class="vacio">No hay órdenes en este filtro.</p>';
      return;
    }
    $ordenes.innerHTML = `
      <table class="tabla">
        <thead>
          <tr>
            <th>Folio</th><th>Técnico</th><th>Tipo</th><th>Cliente</th>
            <th>Fecha de trabajo</th><th>Estado</th><th style="text-align: left;">Monto técnico</th>
          </tr>
        </thead>
        <tbody>
          ${ordenes.map((o) => `
            <tr>
              <td>${escapeHtml(o.folio)}</td>
              <td>${escapeHtml(o.tecnico_nombre)}</td>
              <td>${escapeHtml(o.tipo_servicio_nombre)}</td>
              <td>${escapeHtml(o.venta_cliente_nombre || '—')}</td>
              <td>${formatDateTime(o.fecha_trabajo_dispositivo)}</td>
              <td>${badge(o.estado)}</td>
              <td>${formatMoney(o.monto_tecnico)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  /**
   * Resumen por técnico: una fila por técnico, agrupando lo mismo que ya
   * se trajo para Historial — cantidad de ventas/órdenes por estado y
   * montos totales (vendido = monto_vendedor de ventas instaladas;
   * instalado = monto_tecnico de órdenes aprobadas/liquidadas). Agrupa por
   * id, no por nombre, para no mezclar a dos técnicos que compartan nombre.
   */
  function pintarResumen(ventas, ordenes) {
    const porTecnico = new Map(); // id -> { nombre, ...acumuladores }
    const de = (id, nombre) => {
      if (!porTecnico.has(id)) {
        porTecnico.set(id, {
          nombre,
          ventasTotal: 0, ventasInstaladas: 0, montoVendido: 0,
          ordenesTotal: 0, ordenesAprobadas: 0, montoInstalado: 0,
        });
      }
      return porTecnico.get(id);
    };
    for (const v of ventas) {
      const fila = de(v.vendedor_id, v.vendedor_nombre);
      fila.ventasTotal++;
      if (v.estado === 'instalada') {
        fila.ventasInstaladas++;
        fila.montoVendido += Number(v.monto_vendedor) || 0;
      }
    }
    for (const o of ordenes) {
      const fila = de(o.tecnico_id, o.tecnico_nombre);
      fila.ordenesTotal++;
      if (['aprobada', 'liquidada'].includes(o.estado)) {
        fila.ordenesAprobadas++;
        fila.montoInstalado += Number(o.monto_tecnico) || 0;
      }
    }
    const filas = [...porTecnico.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (!filas.length) {
      $resumen.innerHTML = '<p class="vacio">No hay actividad en este filtro.</p>';
      return;
    }
    $resumen.innerHTML = `
      <table class="tabla">
        <thead>
          <tr>
            <th>Técnico</th>
            <th>Ventas</th><th>Instaladas</th><th>Monto vendido</th>
            <th>Órdenes</th><th>Aprobadas</th><th style="text-align: left;">Monto instalado</th>
          </tr>
        </thead>
        <tbody>
          ${filas.map((f) => `
            <tr>
              <td>${escapeHtml(f.nombre)}</td>
              <td>${f.ventasTotal}</td>
              <td>${f.ventasInstaladas}</td>
              <td>${formatMoney(f.montoVendido)}</td>
              <td>${f.ordenesTotal}</td>
              <td>${f.ordenesAprobadas}</td>
              <td>${formatMoney(f.montoInstalado)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async function cargar() {
    $ventas.innerHTML = '<p class="vacio">Cargando…</p>';
    $ordenes.innerHTML = '<p class="vacio">Cargando…</p>';
    $resumen.innerHTML = '<p class="vacio">Cargando…</p>';
    try {
      const { ventas, ordenes } = await api(`/admin/historial${queryActual()}`);
      pintarVentas(ventas);
      pintarOrdenes(ordenes);
      pintarResumen(ventas, ordenes);
    } catch (e) {
      $ventas.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
      $ordenes.innerHTML = '';
      $resumen.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  await cargar();
}
