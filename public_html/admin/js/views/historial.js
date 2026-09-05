// Informes (pedido: "que esta pantalla no se llame historial si no que
// INFORMES donde se vea el historial de las ultimas actividades y en otra
// pestaña los posibles informes generados por cada tecnico") — antes era
// solo esto: "elimina auditoria y crea un link de historial ordenes
// vendidas y ordenes instaladas con fecha", reemplazando a la pantalla de
// Auditoría. Ya no hay cola de revisión manual: las órdenes se auto-aprueban
// al enviarse (ver OrdenWizardService::confirmarEnviada), así que todo esto
// es de solo lectura.
//
// Reporte #8: "aqui necesito 1 historial con los ultimos movimientos del
// mes, otra pestaña informe de ventas y otro con informe de instalaciones y
// otro general exportables a pdf todos para tener un mejor analisis" — 5
// submenús sobre el MISMO filtro (técnico / desde / hasta) y el MISMO
// fetch de /admin/historial — no hace falta pedirle nada nuevo al
// servidor, cada informe agrupa distinto lo mismo que ya se trajo.
// "Exportable a PDF" = imprimir (el navegador ya deja "Guardar como PDF"
// desde ahí) — @media print en admin.css oculta todo lo que no es el
// informe en sí (topbar, pestañas, filtros, botones).
import { api } from '../api.js';
import {
  badge, escapeHtml, formatMoney, formatDateTime, el,
} from '../utils.js';
import { abrirModal } from '../modal.js';
import { conColaSiHaceFalta } from '../offline.js';
import { toast } from '../toast.js';

/** dd-mm-aaaa sin hora — para columnas de fecha "de calendario" (venta, instalación pedida). */
function formatDate(s) {
  if (!s) return '—';
  const d = new Date(String(s).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** 'YYYY-MM-DD' del primer/último día del mes actual — para que Historial arranque mostrando "lo del mes", no todo el histórico. */
function primerDiaMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function ultimoDiaMes() {
  const d = new Date();
  const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}-${String(fin.getDate()).padStart(2, '0')}`;
}

/** Botón "🖶 Imprimir" — igual en las 4 pestañas de informe; imprimir = "exportar a PDF" vía el diálogo del navegador. */
function botonImprimirHtml(id) {
  return `<button type="button" class="btn btn--secundario btn--chico no-imprimir" id="${id}">🖶 Imprimir</button>`;
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

      <nav class="subtabs no-imprimir" id="subtabs-informes">
        <button type="button" class="subtab subtab--activo" data-tab="historial">Historial</button>
        <button type="button" class="subtab" data-tab="ventas">Informe de ventas</button>
        <button type="button" class="subtab" data-tab="instalaciones">Informe de instalaciones</button>
        <button type="button" class="subtab" data-tab="general">General</button>
        <button type="button" class="subtab" data-tab="conflictos" id="subtab-conflictos">Conflictos</button>
      </nav>

      <form id="form-filtros" class="form-fila no-imprimir">
        <label class="campo campo--inline">
          <span>Técnico</span>
          <select name="tecnico_id"><option value="">Todos</option></select>
        </label>
        <label class="campo campo--inline">
          <span>Desde</span>
          <input type="date" name="desde" value="${primerDiaMes()}">
        </label>
        <label class="campo campo--inline">
          <span>Hasta</span>
          <input type="date" name="hasta" value="${ultimoDiaMes()}">
        </label>
        <button type="submit" class="btn btn--secundario">Filtrar</button>
      </form>

      <div id="vista-historial">
        <div class="form-fila" style="margin-top: 20px;">${botonImprimirHtml('btn-imprimir-historial')}</div>
        <h3 style="margin-top: 12px;">Ventas registradas</h3>
        <div id="tabla-ventas"><p class="vacio">Cargando…</p></div>

        <h3 style="margin-top: 26px;">Órdenes</h3>
        <div id="tabla-ordenes"><p class="vacio">Cargando…</p></div>
      </div>

      <div id="vista-informe-ventas" hidden>
        <div class="form-fila" style="margin-top: 20px;">${botonImprimirHtml('btn-imprimir-ventas')}</div>
        <div id="informe-ventas" style="margin-top: 10px;"><p class="vacio">Cargando…</p></div>
      </div>

      <div id="vista-informe-instalaciones" hidden>
        <div class="form-fila" style="margin-top: 20px;">${botonImprimirHtml('btn-imprimir-instalaciones')}</div>
        <div id="informe-instalaciones" style="margin-top: 10px;"><p class="vacio">Cargando…</p></div>
      </div>

      <div id="vista-general" hidden>
        <div class="form-fila" style="margin-top: 20px;">
          <button type="button" class="btn btn--secundario btn--chico no-imprimir" id="btn-exportar-general">⬇ Exportar CSV</button>
          ${botonImprimirHtml('btn-imprimir-general')}
        </div>
        <div id="tabla-general" style="margin-top: 10px;"><p class="vacio">Cargando…</p></div>
      </div>

      <div id="vista-conflictos" hidden>
        <p class="panel-explicacion" style="margin-top: 20px;">
          Dos técnicos (o el mismo, offline) escanearon el mismo folio — la orden queda sin pagar
          hasta que decidís acá cuál fue la visita real ("Aceptar") o si el folio se repitió por error
          ("Invalidar", cierra esa orden sin pago).
        </p>
        <div id="tabla-conflictos" style="margin-top: 10px;"><p class="vacio">Cargando…</p></div>
      </div>
    </section>
  `));

  const $selectTecnico = container.querySelector('select[name="tecnico_id"]');
  const $ventas = container.querySelector('#tabla-ventas');
  const $ordenes = container.querySelector('#tabla-ordenes');
  const $informeVentas = container.querySelector('#informe-ventas');
  const $informeInstalaciones = container.querySelector('#informe-instalaciones');
  const $general = container.querySelector('#tabla-general');
  const $conflictos = container.querySelector('#tabla-conflictos');
  const $form = container.querySelector('#form-filtros');
  const $vistaHistorial = container.querySelector('#vista-historial');
  const $vistaInformeVentas = container.querySelector('#vista-informe-ventas');
  const $vistaInformeInstalaciones = container.querySelector('#vista-informe-instalaciones');
  const $vistaGeneral = container.querySelector('#vista-general');
  const $vistaConflictos = container.querySelector('#vista-conflictos');
  const $subtabConflictos = container.querySelector('#subtab-conflictos');
  const $subtabs = Array.from(container.querySelectorAll('#subtabs-informes .subtab'));
  let ultimoGeneral = []; // filas por técnico ya agrupadas — para exportar sin recalcular

  const VISTAS = {
    historial: $vistaHistorial, ventas: $vistaInformeVentas, instalaciones: $vistaInformeInstalaciones,
    general: $vistaGeneral, conflictos: $vistaConflictos,
  };
  $subtabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      $subtabs.forEach((b) => b.classList.toggle('subtab--activo', b === btn));
      $form.hidden = btn.dataset.tab === 'conflictos';
      for (const [tab, $vista] of Object.entries(VISTAS)) $vista.hidden = tab !== btn.dataset.tab;
      if (btn.dataset.tab === 'conflictos') cargarConflictos();
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
              <td>${escapeHtml(v.vendedor_nombre || 'TuVes (directo)')}</td>
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

  /** Tabla de agrupación genérica: una fila por clave + fila de "Total" al fondo. */
  function tablaAgrupada(titulo, columnas, filas, totales) {
    return `
      <h4>${escapeHtml(titulo)}</h4>
      ${filas.length ? `
        <table class="tabla">
          <thead><tr>${columnas.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
          <tbody>
            ${filas.map((f) => `<tr>${f.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}
            <tr style="font-weight: 700;">${totales.map((v) => `<td>${v}</td>`).join('')}</tr>
          </tbody>
        </table>
      ` : '<p class="vacio">Sin datos en este filtro.</p>'}
    `;
  }

  /**
   * Informe de ventas — agrupado por plan y por comuna (cortes que
   * Historial no muestra), con el mismo filtro técnico/fecha de arriba.
   */
  function pintarInformeVentas(ventas) {
    if (!ventas.length) {
      $informeVentas.innerHTML = '<p class="vacio">No hay ventas en este filtro.</p>';
      return;
    }
    const porPlan = new Map();
    const porComuna = new Map();
    const porEstado = { registrada: 0, instalada: 0, anulada: 0 };
    let montoVendidoTotal = 0;
    for (const v of ventas) {
      porEstado[v.estado] = (porEstado[v.estado] || 0) + 1;
      const montoVendedor = Number(v.monto_vendedor) || 0;
      montoVendidoTotal += montoVendedor;

      if (!porPlan.has(v.plan_nombre)) porPlan.set(v.plan_nombre, { n: 0, monto: 0 });
      const fp = porPlan.get(v.plan_nombre);
      fp.n++; fp.monto += montoVendedor;

      if (!porComuna.has(v.comuna)) porComuna.set(v.comuna, { n: 0, monto: 0 });
      const fc = porComuna.get(v.comuna);
      fc.n++; fc.monto += montoVendedor;
    }
    const filasPlan = [...porPlan.entries()].sort((a, b) => b[1].n - a[1].n)
      .map(([nombre, d]) => [escapeHtml(nombre), d.n, formatMoney(d.monto)]);
    const filasComuna = [...porComuna.entries()].sort((a, b) => b[1].n - a[1].n)
      .map(([nombre, d]) => [escapeHtml(nombre), d.n, formatMoney(d.monto)]);

    $informeVentas.innerHTML = `
      <div class="tiles" style="margin-bottom: 20px;">
        <div class="tile tile--ok"><span class="tile-fila"><span class="tile-valor">${ventas.length}</span></span><span class="tile-etiqueta">Ventas totales</span></div>
        <div class="tile tile--ok"><span class="tile-fila"><span class="tile-valor">${porEstado.instalada || 0}</span></span><span class="tile-etiqueta">Instaladas</span></div>
        <div class="tile tile--ok"><span class="tile-fila"><span class="tile-valor">${porEstado.registrada || 0}</span></span><span class="tile-etiqueta">Por instalar</span></div>
        <div class="tile tile--ok"><span class="tile-fila"><span class="tile-valor">${formatMoney(montoVendidoTotal)}</span></span><span class="tile-etiqueta">Monto vendido</span></div>
      </div>
      ${tablaAgrupada('Por plan', ['Plan', 'Ventas', 'Monto vendido'], filasPlan, ['Total', ventas.length, formatMoney(montoVendidoTotal)])}
      <div style="margin-top: 26px;">
        ${tablaAgrupada('Por comuna', ['Comuna', 'Ventas', 'Monto vendido'], filasComuna, ['Total', ventas.length, formatMoney(montoVendidoTotal)])}
      </div>
    `;
  }

  /**
   * Informe de instalaciones — agrupado por tipo de servicio (cada uno
   * cobra distinto, ver Tarifario) y por estado, con el mismo filtro de
   * arriba. El monto solo suma órdenes aprobadas/liquidadas — una
   * rechazada no cobra nada.
   */
  function pintarInformeInstalaciones(ordenes) {
    if (!ordenes.length) {
      $informeInstalaciones.innerHTML = '<p class="vacio">No hay órdenes en este filtro.</p>';
      return;
    }
    const porTipo = new Map();
    const porEstado = new Map();
    let montoTotal = 0;
    let aprobadas = 0;
    for (const o of ordenes) {
      const pagable = ['aprobada', 'liquidada'].includes(o.estado);
      const monto = pagable ? (Number(o.monto_tecnico) || 0) : 0;
      if (pagable) { aprobadas++; montoTotal += monto; }

      if (!porTipo.has(o.tipo_servicio_nombre)) porTipo.set(o.tipo_servicio_nombre, { n: 0, monto: 0 });
      const ft = porTipo.get(o.tipo_servicio_nombre);
      ft.n++; ft.monto += monto;

      porEstado.set(o.estado, (porEstado.get(o.estado) || 0) + 1);
    }
    const filasTipo = [...porTipo.entries()].sort((a, b) => b[1].n - a[1].n)
      .map(([nombre, d]) => [escapeHtml(nombre), d.n, formatMoney(d.monto)]);
    const filasEstado = [...porEstado.entries()].sort((a, b) => b[1] - a[1])
      .map(([estado, n]) => [badge(estado), n]);

    $informeInstalaciones.innerHTML = `
      <div class="tiles" style="margin-bottom: 20px;">
        <div class="tile tile--ok"><span class="tile-fila"><span class="tile-valor">${ordenes.length}</span></span><span class="tile-etiqueta">Órdenes totales</span></div>
        <div class="tile tile--ok"><span class="tile-fila"><span class="tile-valor">${aprobadas}</span></span><span class="tile-etiqueta">Aprobadas/liquidadas</span></div>
        <div class="tile tile--ok"><span class="tile-fila"><span class="tile-valor">${formatMoney(montoTotal)}</span></span><span class="tile-etiqueta">Monto técnico total</span></div>
      </div>
      ${tablaAgrupada('Por tipo de servicio', ['Tipo', 'Órdenes', 'Monto técnico'], filasTipo, ['Total', ordenes.length, formatMoney(montoTotal)])}
      <div style="margin-top: 26px;">
        <h4>Por estado</h4>
        <table class="tabla">
          <thead><tr><th>Estado</th><th style="text-align: left;">Órdenes</th></tr></thead>
          <tbody>${filasEstado.map((f) => `<tr><td>${f[0]}</td><td>${f[1]}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    `;
  }

  /**
   * "General" (antes "Resumen por técnico", ampliado con reporte #8: "otro
   * general") — totales globales de la empresa arriba, y la misma tabla
   * por técnico debajo. Una fila por técnico, agrupando lo mismo que ya se
   * trajo para Historial — cantidad de ventas/órdenes por estado y montos
   * totales (vendido = monto_vendedor de ventas instaladas; instalado =
   * monto_tecnico de órdenes aprobadas/liquidadas). Agrupa por id, no por
   * nombre, para no mezclar a dos técnicos que compartan nombre.
   */
  function pintarGeneral(ventas, ordenes) {
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
      // Venta directa de TuVes (checkbox "yo no la vendí") — sin
      // vendedor_id, se agrupa en su propia fila en vez de romper el
      // agrupador (no hay id de técnico al que sumarle esto).
      const fila = v.vendedor_id === null
        ? de('sin_vendedor', 'TuVes (directo)')
        : de(v.vendedor_id, v.vendedor_nombre);
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
    ultimoGeneral = filas;
    if (!filas.length) {
      $general.innerHTML = '<p class="vacio">No hay actividad en este filtro.</p>';
      return;
    }
    const totales = filas.reduce((acc, f) => ({
      ventasTotal: acc.ventasTotal + f.ventasTotal, ventasInstaladas: acc.ventasInstaladas + f.ventasInstaladas, montoVendido: acc.montoVendido + f.montoVendido,
      ordenesTotal: acc.ordenesTotal + f.ordenesTotal, ordenesAprobadas: acc.ordenesAprobadas + f.ordenesAprobadas, montoInstalado: acc.montoInstalado + f.montoInstalado,
    }), { ventasTotal: 0, ventasInstaladas: 0, montoVendido: 0, ordenesTotal: 0, ordenesAprobadas: 0, montoInstalado: 0 });

    $general.innerHTML = `
      <div class="tiles" style="margin-bottom: 20px;">
        <div class="tile tile--ok"><span class="tile-fila"><span class="tile-valor">${totales.ventasInstaladas}</span><span class="tile-dinero">${formatMoney(totales.montoVendido)}</span></span><span class="tile-etiqueta">Ventas instaladas</span></div>
        <div class="tile tile--ok"><span class="tile-fila"><span class="tile-valor">${totales.ordenesAprobadas}</span><span class="tile-dinero">${formatMoney(totales.montoInstalado)}</span></span><span class="tile-etiqueta">Órdenes aprobadas</span></div>
        <div class="tile tile--ok"><span class="tile-fila"><span class="tile-valor">${formatMoney(totales.montoVendido + totales.montoInstalado)}</span></span><span class="tile-etiqueta">Total generado</span></div>
      </div>
      <h4>Por técnico</h4>
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

  /** CSV simple, sin librería — separador ";" (Excel en español lo abre directo sin pedir importar). */
  container.querySelector('#btn-exportar-general').addEventListener('click', () => {
    if (!ultimoGeneral.length) { toast('No hay filas para exportar en este filtro.', 'malo'); return; }
    const encabezados = ['Técnico', 'Ventas', 'Instaladas', 'Monto vendido', 'Órdenes', 'Aprobadas', 'Monto instalado'];
    const filasCsv = ultimoGeneral.map((f) => [
      f.nombre, f.ventasTotal, f.ventasInstaladas, f.montoVendido, f.ordenesTotal, f.ordenesAprobadas, f.montoInstalado,
    ]);
    const csv = [encabezados, ...filasCsv]
      .map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = el(`<a href="${url}" download="informe-general.csv"></a>`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  for (const id of ['btn-imprimir-historial', 'btn-imprimir-ventas', 'btn-imprimir-instalaciones', 'btn-imprimir-general']) {
    container.querySelector(`#${id}`).addEventListener('click', () => window.print());
  }

  /**
   * Conflictos de folio (pedido: "que nos falta" — el backend ya tenía
   * GET/POST /admin/conflictos completos, pero ninguna pantalla los usaba;
   * una orden en conflicto quedaba visible en Historial pero sin forma de
   * resolverla, atascada para siempre sin poder liquidarse).
   */
  function pintarConflictos(conflictos) {
    $subtabConflictos.textContent = conflictos.length ? `Conflictos (${conflictos.length})` : 'Conflictos';
    if (!conflictos.length) {
      $conflictos.innerHTML = '<p class="vacio">No hay conflictos pendientes — todo al día.</p>';
      return;
    }
    $conflictos.innerHTML = `
      <table class="tabla">
        <thead>
          <tr><th>Folio</th><th>Técnico</th><th>Descripción</th><th>Fecha</th><th style="text-align: left;">Acciones</th></tr>
        </thead>
        <tbody></tbody>
      </table>
    `;
    const $tbody = $conflictos.querySelector('tbody');
    for (const c of conflictos) {
      const tr = el(`
        <tr>
          <td>${escapeHtml(c.folio)}</td>
          <td>${escapeHtml(c.tecnico_nombre)}</td>
          <td>${escapeHtml(c.descripcion || '—')}</td>
          <td>${formatDateTime(c.creado_en)}</td>
          <td class="celda-acciones">
            <button type="button" class="btn btn--secundario btn--chico" data-accion="aceptar">Aceptar</button>
            <button type="button" class="btn btn--malo btn--chico" data-accion="invalidar">Invalidar</button>
          </td>
        </tr>
      `);
      tr.querySelector('[data-accion="aceptar"]').addEventListener('click', () => confirmarResolver(c, 'aceptar'));
      tr.querySelector('[data-accion="invalidar"]').addEventListener('click', () => confirmarResolver(c, 'invalidar'));
      $tbody.appendChild(tr);
    }
  }

  function confirmarResolver(conflicto, accion) {
    const esAceptar = accion === 'aceptar';
    const { root, cerrar } = abrirModal(`
      <h3>${esAceptar ? 'Aceptar' : 'Invalidar'} conflicto — folio ${escapeHtml(conflicto.folio)}</h3>
      <p class="modal-explicacion">
        ${esAceptar
          ? 'La orden se confirma como una visita legítima (ej. garantía): se calcula su monto, se descuenta el material de la maleta del técnico y — si venía de una venta propia — se confirma la comisión, exactamente como una orden enviada sin conflicto.'
          : 'La orden se cierra sin pago (motivo: folio duplicado). No se descuenta nada del inventario ni se calcula monto.'}
      </p>
      <form id="form-resolver">
        <label class="campo">
          <span>Comentario (opcional)</span>
          <textarea name="comentario" rows="2"></textarea>
        </label>
        <div class="modal-acciones">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn ${esAceptar ? 'btn--primario' : 'btn--malo'}">${esAceptar ? 'Aceptar' : 'Invalidar'}</button>
        </div>
      </form>
    `);
    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-resolver').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const comentario = new FormData(ev.target).get('comentario').trim() || null;
      try {
        const { encolado } = await conColaSiHaceFalta(
          'resolver_conflicto', { id: conflicto.id, accion, comentario },
          () => api(`/admin/conflictos/${conflicto.id}/resolver`, { method: 'POST', body: { accion, comentario } })
        );
        cerrar();
        if (encolado) {
          toast(`Folio ${conflicto.folio}: guardado sin conexión — se resolverá al recuperar señal.`, 'neutro');
        } else {
          toast(`Folio ${conflicto.folio}: conflicto ${esAceptar ? 'aceptado' : 'invalidado'}.`, 'ok');
          await cargarConflictos();
        }
      } catch (e) { toast(e.message, 'malo'); }
    });
  }

  async function cargarConflictos() {
    $conflictos.innerHTML = '<p class="vacio">Cargando…</p>';
    try {
      const { conflictos } = await api('/admin/conflictos');
      pintarConflictos(conflictos);
    } catch (e) {
      $conflictos.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  async function cargar() {
    $ventas.innerHTML = '<p class="vacio">Cargando…</p>';
    $ordenes.innerHTML = '<p class="vacio">Cargando…</p>';
    $informeVentas.innerHTML = '<p class="vacio">Cargando…</p>';
    $informeInstalaciones.innerHTML = '<p class="vacio">Cargando…</p>';
    $general.innerHTML = '<p class="vacio">Cargando…</p>';
    try {
      const { ventas, ordenes } = await api(`/admin/historial${queryActual()}`);
      pintarVentas(ventas);
      pintarOrdenes(ordenes);
      pintarInformeVentas(ventas);
      pintarInformeInstalaciones(ordenes);
      pintarGeneral(ventas, ordenes);
    } catch (e) {
      const msg = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
      $ventas.innerHTML = msg;
      $ordenes.innerHTML = '';
      $informeVentas.innerHTML = msg;
      $informeInstalaciones.innerHTML = '';
      $general.innerHTML = msg;
    }
  }

  await Promise.all([cargar(), cargarConflictos()]);
}
