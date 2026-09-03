// Historial (pedido: "elimina auditoria y crea un link de historial ordenes
// vendidas y ordenes instaladas con fecha") — reemplaza a la pantalla de
// Auditoría en el nav. Ya no hay cola de revisión manual: las órdenes se
// auto-aprueban al enviarse (ver OrdenWizardService::confirmarEnviada), así
// que esto es de solo lectura — dos listas con fecha, filtrables por técnico
// y por rango de fechas.
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
        <h2>Historial</h2>
        <p class="panel-explicacion">
          Ventas registradas y órdenes de trabajo, con su fecha — las órdenes se auto-aprueban al
          enviarse (ya no hay una cola de auditoría manual antes de pagar).
        </p>
      </div>

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

      <h3 style="margin-top: 20px;">Ventas registradas</h3>
      <div id="tabla-ventas"><p class="vacio">Cargando…</p></div>

      <h3 style="margin-top: 26px;">Órdenes</h3>
      <div id="tabla-ordenes"><p class="vacio">Cargando…</p></div>
    </section>
  `));

  const $selectTecnico = container.querySelector('select[name="tecnico_id"]');
  const $ventas = container.querySelector('#tabla-ventas');
  const $ordenes = container.querySelector('#tabla-ordenes');
  const $form = container.querySelector('#form-filtros');

  try {
    const { usuarios } = await api('/admin/usuarios');
    for (const u of usuarios.filter((u) => u.rol === 'tecnico')) {
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
            <th>Fecha de venta</th><th>Instalación pedida</th><th>Estado</th>
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
            <th>Fecha de trabajo</th><th>Estado</th><th>Monto técnico</th>
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

  async function cargar() {
    $ventas.innerHTML = '<p class="vacio">Cargando…</p>';
    $ordenes.innerHTML = '<p class="vacio">Cargando…</p>';
    try {
      const { ventas, ordenes } = await api(`/admin/historial${queryActual()}`);
      pintarVentas(ventas);
      pintarOrdenes(ordenes);
    } catch (e) {
      $ventas.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
      $ordenes.innerHTML = '';
    }
  }

  await cargar();
}
