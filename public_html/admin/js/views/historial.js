import { api } from '../api.js';
import {
  badge, escapeHtml, formatMoney, formatDateTime, el, ESTADO_LABEL,
} from '../utils.js';
import { abrirModal } from '../modal.js';
import { conColaSiHaceFalta } from '../offline.js';
import { toast } from '../toast.js';
import { abrirModalDetalleVenta, abrirModalDetalleOrden } from '../modal-detalle.js';

/** 'YYYY-MM-DD' del primer y último día del mes actual para arranque por defecto */
function primerDiaMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function ultimoDiaMes() {
  const d = new Date();
  const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}-${String(fin.getDate()).padStart(2, '0')}`;
}

export async function renderHistorial(container) {
  container.appendChild(el(`
    <div class="vista-contenedor">
      <div class="vista-cabecera">
        <div>
          <h2 class="vista-titulo">Informes y Rendimiento</h2>
          <p class="vista-subtitulo">
            Análisis consolidado de ventas comerciales, órdenes técnicas ejecutadas y métricas de producción por técnico.
          </p>
        </div>
      </div>

      <!-- Pestañas de informes -->
      <nav class="subtabs subtabs--nivel1 no-imprimir" id="subtabs-informes">
        <button type="button" class="subtab subtab--activo" data-tab="general">📊 General</button>
        <button type="button" class="subtab" data-tab="ventas">💼 Ventas por Plan</button>
        <button type="button" class="subtab" data-tab="instalaciones">🛠️ Órdenes y Servicios</button>
        <button type="button" class="subtab" data-tab="conflictos" id="subtab-conflictos">⚠️ Conflictos</button>
      </nav>

      <!-- Barra de Filtros y Herramientas -->
      <div class="card-bloque filtros-informes-toolbar no-imprimir" id="toolbar-filtros">
        <form id="form-filtros" class="filtros-informes-form">
          <div class="filtros-campos-grupo">
            <label class="filtro-campo">
              <span class="filtro-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                Técnico
              </span>
              <select name="tecnico_id" class="input-select-moderno">
                <option value="">Todos los técnicos</option>
              </select>
            </label>

            <label class="filtro-campo">
              <span class="filtro-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                Desde
              </span>
              <input type="date" name="desde" value="${primerDiaMes()}" class="input-fecha-moderno">
            </label>

            <label class="filtro-campo">
              <span class="filtro-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                Hasta
              </span>
              <input type="date" name="hasta" value="${ultimoDiaMes()}" class="input-fecha-moderno">
            </label>

            <div class="filtro-acciones-submit">
              <button type="submit" class="btn btn--primario btn-con-icono">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <span>Filtrar</span>
              </button>
            </div>
          </div>

          <div class="filtros-exportar-grupo">
            <button type="button" class="btn btn--secundario btn--chico btn-con-icono" id="btn-exportar-general">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Exportar CSV</span>
            </button>
            <button type="button" class="btn btn--secundario btn--chico btn-con-icono" id="btn-imprimir-informe">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
              <span>Imprimir / PDF</span>
            </button>
          </div>
        </form>
      </div>

      <!-- Vistas de informe -->
      <div id="vista-general">
        <div id="tabla-general"><div class="cargando-bloque"><div class="spinner"></div><p>Cargando métricas generales…</p></div></div>
      </div>

      <div id="vista-informe-ventas" hidden>
        <div id="informe-ventas"><div class="cargando-bloque"><div class="spinner"></div><p>Cargando informe de ventas…</p></div></div>
      </div>

      <div id="vista-informe-instalaciones" hidden>
        <div id="informe-instalaciones"><div class="cargando-bloque"><div class="spinner"></div><p>Cargando informe de órdenes…</p></div></div>
      </div>

      <div id="vista-conflictos" hidden>
        <div class="callout-aviso" style="margin-bottom: 20px;">
          <div class="callout-icono">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <div class="callout-texto">
            <strong>Resolución de folios duplicados:</strong> Ocurre cuando dos técnicos (o el mismo en modo sin conexión) ingresan una orden con el mismo folio. La orden permanece en espera hasta que determines si es una visita legítima (ej: garantía) o un duplicado inválido.
          </div>
        </div>
        <div id="tabla-conflictos"><div class="cargando-bloque"><div class="spinner"></div><p>Consultando conflictos…</p></div></div>
      </div>
    </div>
    <div id="documento-impresion-oficial" class="documento-impresion-oficial"></div>
  `));

  const $selectTecnico = container.querySelector('select[name="tecnico_id"]');
  const $toolbarFiltros = container.querySelector('#toolbar-filtros');
  const $informeVentas = container.querySelector('#informe-ventas');
  const $informeInstalaciones = container.querySelector('#informe-instalaciones');
  const $general = container.querySelector('#tabla-general');
  const $conflictos = container.querySelector('#tabla-conflictos');
  const $form = container.querySelector('#form-filtros');
  const $vistaInformeVentas = container.querySelector('#vista-informe-ventas');
  const $vistaInformeInstalaciones = container.querySelector('#vista-informe-instalaciones');
  const $vistaGeneral = container.querySelector('#vista-general');
  const $vistaConflictos = container.querySelector('#vista-conflictos');
  const $subtabConflictos = container.querySelector('#subtab-conflictos');
  const $subtabs = Array.from(container.querySelectorAll('#subtabs-informes .subtab'));
  let ultimoGeneral = [];
  let ultimoVentas = [];
  let ultimoOrdenes = [];

  const VISTAS = {
    general: $vistaGeneral,
    ventas: $vistaInformeVentas,
    instalaciones: $vistaInformeInstalaciones,
    conflictos: $vistaConflictos,
  };

  $subtabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      $subtabs.forEach((b) => b.classList.toggle('subtab--activo', b === btn));
      const esConflictos = btn.dataset.tab === 'conflictos';
      $toolbarFiltros.hidden = esConflictos;
      for (const [tab, $vista] of Object.entries(VISTAS)) {
        $vista.hidden = tab !== btn.dataset.tab;
      }
      if (esConflictos) cargarConflictos();
    });
  });

  try {
    const { usuarios } = await api('/admin/usuarios');
    for (const u of usuarios) {
      $selectTecnico.appendChild(el(`<option value="${u.id}">${escapeHtml(u.nombre)}</option>`));
    }
  } catch { /* si falla, se mantiene con opción "Todos" */ }

  $form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    cargar();
  });

  container.querySelector('#btn-imprimir-informe').addEventListener('click', () => {
    prepararInformeImpresion();
    window.print();
  });

  // Delegación de clic para ver el detalle integral del cliente, fechas y equipos
  container.addEventListener('click', (ev) => {
    // Si se hizo clic en un botón de acción de formulario o link específico, no interferir
    if (ev.target.closest('button, select, input, a')) {
      return;
    }

    const $trVenta = ev.target.closest('tr[data-venta-id]');
    if ($trVenta) {
      const vId = Number($trVenta.dataset.ventaId);
      let venta = ultimoVentas.find((x) => Number(x.id) === vId);
      if (!venta && Array.isArray(ultimoGeneral)) {
        for (const tec of ultimoGeneral) {
          const match = (tec.ventas || []).find((x) => Number(x.id) === vId);
          if (match) { venta = match; break; }
        }
      }
      abrirModalDetalleVenta(venta || { id: vId }, () => cargar());
      return;
    }

    const $trOrden = ev.target.closest('tr[data-orden-id]');
    if ($trOrden) {
      const oId = Number($trOrden.dataset.ordenId);
      let orden = ultimoOrdenes.find((x) => Number(x.id) === oId);
      if (!orden && Array.isArray(ultimoGeneral)) {
        for (const tec of ultimoGeneral) {
          const match = (tec.ordenes || []).find((x) => Number(x.id) === oId);
          if (match) { orden = match; break; }
        }
      }
      abrirModalDetalleOrden(orden || { id: oId }, () => cargar());
      return;
    }
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

  function prepararInformeImpresion(tecnicoId = null) {
    const $doc = container.querySelector('#documento-impresion-oficial');
    if (!$doc) return;

    const fd = new FormData($form);
    const desde = fd.get('desde');
    const hasta = fd.get('hasta');
    const adminNom = document.querySelector('#usuario-nombre')?.textContent?.trim() || 'Administración General';
    const ahora = new Date();
    const fechaEmision = ahora.toLocaleString('es-CL', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const folioInforme = `INF-${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}${String(ahora.getDate()).padStart(2, '0')}-${String(ahora.getHours()).padStart(2, '0')}${String(ahora.getMinutes()).padStart(2, '0')}`;

    let periodoTexto = 'Histórico acumulado completo';
    if (desde && hasta) {
      periodoTexto = `${desde.split('-').reverse().join('/')} al ${hasta.split('-').reverse().join('/')}`;
    } else if (desde) {
      periodoTexto = `Desde ${desde.split('-').reverse().join('/')}`;
    } else if (hasta) {
      periodoTexto = `Hasta ${hasta.split('-').reverse().join('/')}`;
    }

    const idFiltro = tecnicoId || $selectTecnico.value || null;
    let tecnicoNombre = 'Todos los técnicos (Consolidado)';
    let ventasInforme = ultimoVentas;
    let ordenesInforme = ultimoOrdenes;
    let filasInforme = ultimoGeneral;

    if (idFiltro) {
      const tecnicoObj = ultimoGeneral.find((f) => String(f.id) === String(idFiltro));
      if (tecnicoObj) {
        tecnicoNombre = tecnicoObj.nombre;
        ventasInforme = ultimoVentas.filter((v) => String(v.vendedor_id) === String(idFiltro));
        ordenesInforme = ultimoOrdenes.filter((o) => String(o.tecnico_id) === String(idFiltro));
        filasInforme = [tecnicoObj];
      }
    }

    const totales = filasInforme.reduce((acc, f) => ({
      ventasTotal: acc.ventasTotal + f.ventasTotal,
      ventasInstaladas: acc.ventasInstaladas + f.ventasInstaladas,
      montoVendido: acc.montoVendido + f.montoVendido,
      ordenesTotal: acc.ordenesTotal + f.ordenesTotal,
      ordenesAprobadas: acc.ordenesAprobadas + f.ordenesAprobadas,
      montoInstalado: acc.montoInstalado + f.montoInstalado,
    }), { ventasTotal: 0, ventasInstaladas: 0, montoVendido: 0, ordenesTotal: 0, ordenesAprobadas: 0, montoInstalado: 0 });

    const totalFacturado = totales.montoVendido + totales.montoInstalado;
    const totalTrabajos = totales.ventasInstaladas + totales.ordenesAprobadas;

    const ordenesOrdenadas = [...ordenesInforme].sort((a, b) => {
      const fa = new Date(a.fecha_trabajo_dispositivo || a.creado_en || 0);
      const fb = new Date(b.fecha_trabajo_dispositivo || b.creado_en || 0);
      return fb - fa;
    });

    const ventasOrdenadas = [...ventasInforme].sort((a, b) => {
      const fa = new Date(a.creado_en || 0);
      const fb = new Date(b.creado_en || 0);
      return fb - fa;
    });

    $doc.innerHTML = `
      <header class="doc-encabezado">
        <div>
          <span class="doc-marca-empresa">Hogar TV · Telecomunicaciones DTH</span>
          <span class="doc-submarca"> | Operaciones y Servicios en Terreno</span>
          <h1 class="doc-titulo-informe">Informe Oficial de Rendimiento y Liquidación</h1>
        </div>
        <div class="doc-meta-caja">
          <span class="doc-folio-tag">${escapeHtml(folioInforme)}</span>
          <div><strong>Emisión:</strong> ${escapeHtml(fechaEmision)}</div>
          <div><strong>Emitido por:</strong> ${escapeHtml(adminNom)}</div>
        </div>
      </header>

      <div class="doc-parametros-grid">
        <div class="doc-param-item">
          <span class="doc-param-label">Período Auditado</span>
          <span class="doc-param-valor">${escapeHtml(periodoTexto)}</span>
        </div>
        <div class="doc-param-item">
          <span class="doc-param-label">Técnico / Responsable</span>
          <span class="doc-param-valor">${escapeHtml(tecnicoNombre)}</span>
        </div>
        <div class="doc-param-item">
          <span class="doc-param-label">Personal Activo</span>
          <span class="doc-param-valor">${filasInforme.length} técnico(s) evaluado(s)</span>
        </div>
        <div class="doc-param-item" style="text-align: right;">
          <span class="doc-param-label">Condición Operativa</span>
          <span class="doc-param-valor" style="color: #047857;">VÁLIDO PARA LIQUIDACIÓN</span>
        </div>
      </div>

      <div class="doc-kpis-fila">
        <div class="doc-kpi-celda">
          <span class="doc-kpi-label">Ventas Instaladas</span>
          <div class="doc-kpi-numero">${totales.ventasInstaladas}</div>
          <span class="doc-kpi-sub">${totales.ventasTotal} ventas reg. (${formatMoney(totales.montoVendido)})</span>
        </div>
        <div class="doc-kpi-celda">
          <span class="doc-kpi-label">Órdenes Aprobadas</span>
          <div class="doc-kpi-numero">${totales.ordenesAprobadas}</div>
          <span class="doc-kpi-sub">${totales.ordenesTotal} órdenes tot. (${formatMoney(totales.montoInstalado)})</span>
        </div>
        <div class="doc-kpi-celda">
          <span class="doc-kpi-label">Trabajos Concluidos</span>
          <div class="doc-kpi-numero">${totalTrabajos}</div>
          <span class="doc-kpi-sub">Operaciones de terreno efectivas</span>
        </div>
        <div class="doc-kpi-celda">
          <span class="doc-kpi-label">Total a Liquidar / Facturado</span>
          <div class="doc-kpi-numero">${formatMoney(totalFacturado)}</div>
          <span class="doc-kpi-sub">100% computable en período</span>
        </div>
      </div>

      <section class="doc-seccion">
        <div class="doc-seccion-titulo">
          <span>1. Resumen Consolidado de Rendimiento y Comisiones</span>
          <span class="doc-seccion-sub">${filasInforme.length} técnico(s)</span>
        </div>
        <table class="doc-tabla">
          <thead>
            <tr>
              <th>Técnico</th>
              <th style="text-align: center;">Ventas (Reg / Inst)</th>
              <th style="text-align: right;">Comisiones Venta</th>
              <th style="text-align: center;">Órdenes (Tot / Aprob)</th>
              <th style="text-align: right;">Monto Órdenes</th>
              <th style="text-align: right;">Total Computable</th>
              <th style="text-align: right; width: 60px;">Aporte</th>
            </tr>
          </thead>
          <tbody>
            ${filasInforme.map((f) => {
              const totalTec = f.montoVendido + f.montoInstalado;
              const pct = totalFacturado > 0 ? Math.round((totalTec / totalFacturado) * 100) : 0;
              return `
                <tr>
                  <td><strong>${escapeHtml(f.nombre)}</strong></td>
                  <td style="text-align: center;">${f.ventasTotal} reg / <strong>${f.ventasInstaladas} inst</strong></td>
                  <td class="doc-monto">${formatMoney(f.montoVendido)}</td>
                  <td style="text-align: center;">${f.ordenesTotal} tot / <strong>${f.ordenesAprobadas} aprob</strong></td>
                  <td class="doc-monto">${formatMoney(f.montoInstalado)}</td>
                  <td class="doc-monto" style="font-weight: 800;">${formatMoney(totalTec)}</td>
                  <td style="text-align: right;">${pct}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>TOTAL CONSOLIDADO</strong></td>
              <td style="text-align: center;"><strong>${totales.ventasTotal} reg / ${totales.ventasInstaladas} inst</strong></td>
              <td class="doc-monto"><strong>${formatMoney(totales.montoVendido)}</strong></td>
              <td style="text-align: center;"><strong>${totales.ordenesTotal} tot / ${totales.ordenesAprobadas} aprob</strong></td>
              <td class="doc-monto"><strong>${formatMoney(totales.montoInstalado)}</strong></td>
              <td class="doc-monto" style="font-size: 8.5pt;"><strong>${formatMoney(totalFacturado)}</strong></td>
              <td style="text-align: right;"><strong>100%</strong></td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section class="doc-seccion">
        <div class="doc-seccion-titulo">
          <span>2. Detalle Pormenorizado de Órdenes de Trabajo en Terreno</span>
          <span class="doc-seccion-sub">${ordenesOrdenadas.length} órdenes registradas</span>
        </div>
        ${ordenesOrdenadas.length === 0 ? `
          <p style="font-size: 7.5pt; color: #64748B; padding: 6pt; border: 0.5pt dashed #CBD5E1; text-align: center;">
            No se registran órdenes de trabajo técnicas en este período.
          </p>
        ` : `
          <table class="doc-tabla">
            <thead>
              <tr>
                <th style="width: 70px;">Folio OT</th>
                <th>Técnico</th>
                <th>Tipo Servicio</th>
                <th>Cliente y Teléfono</th>
                <th>Comuna y Dirección</th>
                <th style="width: 80px;">Fecha Trabajo</th>
                <th style="text-align: right; width: 75px;">Monto</th>
                <th style="text-align: center; width: 65px;">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${ordenesOrdenadas.map((o) => {
                const cliente = o.venta_cliente_nombre || o.cliente_nombre || 'Cliente OT';
                const tel = o.venta_cliente_telefono || o.cliente_telefono || '';
                const dir = [o.venta_comuna || o.comuna, o.venta_cliente_direccion || o.cliente_direccion].filter(Boolean).join(' • ') || '—';
                const fecha = formatDateTime(o.fecha_trabajo_dispositivo || o.creado_en);
                const estadoTxt = ESTADO_LABEL[o.estado] || o.estado;
                return `
                  <tr>
                    <td class="doc-folio">${escapeHtml(o.folio || ('#' + o.id))}</td>
                    <td>${escapeHtml(o.tecnico_nombre || '—')}</td>
                    <td><strong>${escapeHtml(o.tipo_servicio_nombre || 'Servicio')}</strong></td>
                    <td>${escapeHtml(cliente)}${tel ? ` <span style="color: #64748B;">(${escapeHtml(tel)})</span>` : ''}</td>
                    <td>${escapeHtml(dir)}</td>
                    <td style="white-space: nowrap;">${fecha}</td>
                    <td class="doc-monto">${formatMoney(o.monto_tecnico)}</td>
                    <td style="text-align: center;"><span class="doc-badge">${escapeHtml(estadoTxt)}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="6"><strong>SUBTOTAL ÓRDENES DE TERRENO</strong></td>
                <td class="doc-monto"><strong>${formatMoney(totales.montoInstalado)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        `}
      </section>

      <section class="doc-seccion">
        <div class="doc-seccion-titulo">
          <span>3. Detalle Pormenorizado de Suscripciones y Ventas Comerciales</span>
          <span class="doc-seccion-sub">${ventasOrdenadas.length} ventas registradas</span>
        </div>
        ${ventasOrdenadas.length === 0 ? `
          <p style="font-size: 7.5pt; color: #64748B; padding: 6pt; border: 0.5pt dashed #CBD5E1; text-align: center;">
            No se registran ventas comerciales en este período.
          </p>
        ` : `
          <table class="doc-tabla">
            <thead>
              <tr>
                <th style="width: 75px;">N° Venta / TuVes</th>
                <th>Vendedor / Técnico</th>
                <th>Cliente y RUT</th>
                <th>Plan Comercial</th>
                <th>Comuna y Dirección</th>
                <th style="width: 80px;">Fecha Venta</th>
                <th style="text-align: right; width: 75px;">Comisión</th>
                <th style="text-align: center; width: 65px;">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${ventasOrdenadas.map((v) => {
                const dir = [v.comuna, v.cliente_direccion].filter(Boolean).join(' • ') || '—';
                const fecha = formatDateTime(v.creado_en);
                const estadoTxt = ESTADO_LABEL[v.estado] || v.estado;
                return `
                  <tr>
                    <td class="doc-folio">${escapeHtml(v.numero_orden_tuves || ('#' + v.id))}</td>
                    <td>${escapeHtml(v.vendedor_nombre || 'TuVes Directo')}</td>
                    <td><strong>${escapeHtml(v.cliente_nombre)}</strong>${v.cliente_rut ? ` <span style="color: #64748B;">(${escapeHtml(v.cliente_rut)})</span>` : ''}</td>
                    <td>${escapeHtml(v.plan_nombre || 'Plan Estándar')}</td>
                    <td>${escapeHtml(dir)}</td>
                    <td style="white-space: nowrap;">${fecha}</td>
                    <td class="doc-monto">${formatMoney(v.monto_vendedor)}</td>
                    <td style="text-align: center;"><span class="doc-badge">${escapeHtml(estadoTxt)}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="6"><strong>SUBTOTAL COMISIONES DE VENTA</strong></td>
                <td class="doc-monto"><strong>${formatMoney(totales.montoVendido)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        `}
      </section>

      <div class="doc-firmas-bloque">
        <div class="doc-firma-col">
          <div class="doc-firma-linea"></div>
          <div class="doc-firma-cargo">Firma y Timbre Supervisor / Administración</div>
          <div class="doc-firma-aclaracion">Hogar TV · Servicios de Telecomunicaciones DTH</div>
        </div>
        <div class="doc-firma-col">
          <div class="doc-firma-linea"></div>
          <div class="doc-firma-cargo">Firma de Conformidad del Técnico</div>
          <div class="doc-firma-aclaracion">${tecnicoNombre.includes('(') ? 'Nombre y Firma del Responsable' : escapeHtml(tecnicoNombre)}</div>
        </div>
      </div>

      <footer class="doc-pie-oficial">
        <span>Documento oficial generado por Sistema Terreno DTH (Hogar TV) · Válido para auditoría y cálculo de liquidaciones.</span>
        <span>Generado el ${escapeHtml(fechaEmision)}</span>
      </footer>
    `;
  }

  // =========================================================================
  // VISTA 1: GENERAL
  // =========================================================================
  let tecnicoSeleccionadoId = null;

  function renderDetalleTecnico(f, todasLasFilas, totalFacturadoGlobal) {
    if (!f) return '';
    const totalTecnico = f.montoVendido + f.montoInstalado;
    const inicial = (f.nombre || 'T').trim().charAt(0).toUpperCase();

    // Ordenar órdenes de trabajo por fecha DESC
    const ordenesOrdenadas = [...f.ordenes].sort((a, b) => {
      const fa = new Date(a.fecha_trabajo_dispositivo || a.creado_en || 0);
      const fb = new Date(b.fecha_trabajo_dispositivo || b.creado_en || 0);
      return fb - fa;
    });

    // Ordenar ventas por fecha DESC
    const ventasOrdenadas = [...f.ventas].sort((a, b) => {
      const fa = new Date(a.creado_en || 0);
      const fb = new Date(b.creado_en || 0);
      return fb - fa;
    });

    return `
      <section class="card-bloque detalle-tecnico-contenedor" id="seccion-detalle-tecnico" style="margin-bottom: 24px;">
        <!-- Encabezado del Técnico -->
        <div class="card-bloque-cabecera detalle-tecnico-cabecera">
          <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
            <div class="detalle-avatar-grande">${escapeHtml(inicial)}</div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span class="card-bloque-tag card-bloque-tag--teal">Detalle Individual Completo</span>
                ${todasLasFilas.length > 1 ? `
                  <div class="selector-tecnico-inline">
                    <label for="select-tecnico-activo" style="font-size: 0.78rem; font-weight: 700; color: var(--tinta-2);">Ver otro técnico:</label>
                    <select id="select-tecnico-activo" class="input-select-moderno" style="padding: 4px 10px; font-size: 0.82rem;">
                      ${todasLasFilas.map((op) => `
                        <option value="${op.id}" ${String(op.id) === String(f.id) ? 'selected' : ''}>${escapeHtml(op.nombre)}</option>
                      `).join('')}
                    </select>
                  </div>
                ` : ''}
              </div>
              <h3 style="margin: 4px 0 2px; font-size: 1.25rem;">${escapeHtml(f.nombre)}</h3>
              <p class="card-bloque-bajada" style="margin: 0;">
                Auditoría detallada de todos los trabajos en terreno y ventas comerciales efectuadas por el técnico.
              </p>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <button type="button" class="btn btn--primario btn--chico btn-con-icono no-imprimir" id="btn-imprimir-detalle-pdf">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
              <span>Imprimir Informe (PDF)</span>
            </button>
            <button type="button" class="btn btn--secundario btn--chico btn-con-icono no-imprimir" id="btn-exportar-detalle-csv">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>Exportar Detalle (CSV)</span>
            </button>
            <div class="detalle-tecnico-resumen-monto">
              <span style="font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: var(--tinta-2);">Total Ganado en Período</span>
              <strong style="font-size: 1.35rem; font-family: var(--fuente-mono); color: #047857;">${formatMoney(totalTecnico)}</strong>
            </div>
          </div>
        </div>

        <div class="card-bloque-body" style="padding-top: 14px;">
          <!-- Mini KPIs del Técnico -->
          <div class="detalle-tecnico-kpis-grid">
            <div class="detalle-mini-kpi">
              <span class="detalle-mini-label">Órdenes de Trabajo</span>
              <div class="detalle-mini-valor">
                <span>${f.ordenesTotal} <small style="font-size: 0.75rem; font-weight: 600; color: var(--tinta-2);">totales</small></span>
                <span class="badge-monto badge-monto--positivo">${formatMoney(f.montoInstalado)}</span>
              </div>
              <span class="detalle-mini-sub">${f.ordenesAprobadas} aprobadas / liquidadas</span>
            </div>

            <div class="detalle-mini-kpi">
              <span class="detalle-mini-label">Ventas Comerciales</span>
              <div class="detalle-mini-valor">
                <span>${f.ventasTotal} <small style="font-size: 0.75rem; font-weight: 600; color: var(--tinta-2);">captadas</small></span>
                <span class="badge-monto badge-monto--positivo">${formatMoney(f.montoVendido)}</span>
              </div>
              <span class="detalle-mini-sub">${f.ventasInstaladas} instaladas con éxito</span>
            </div>

            <div class="detalle-mini-kpi">
              <span class="detalle-mini-label">Rendimiento Operativo</span>
              <div class="detalle-mini-valor">
                <span>${f.ventasInstaladas + f.ordenesAprobadas} <small style="font-size: 0.75rem; font-weight: 600; color: var(--tinta-2);">exitosas</small></span>
                <span class="card-bloque-tag card-bloque-tag--indigo">${totalFacturadoGlobal > 0 ? Math.round((totalTecnico / totalFacturadoGlobal) * 100) : 0}% del global</span>
              </div>
              <span class="detalle-mini-sub">Total computable para liquidación</span>
            </div>
          </div>

          <!-- TABLA 1: ÓRDENES DE TRABAJO -->
          <div class="detalle-seccion-itemizada" style="margin-top: 20px;">
            <div class="detalle-seccion-titulo-fila">
              <h4 style="margin: 0; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                <span>🛠️</span>
                <span>Órdenes de Trabajo y Servicios en Terreno</span>
                <span class="badge-contador badge-contador--ok">${ordenesOrdenadas.length} órdenes</span>
              </h4>
              <span style="font-size: 0.82rem; color: var(--tinta-2); font-weight: 600;">
                Subtotal órdenes: <strong style="color: var(--tinta);">${formatMoney(f.montoInstalado)}</strong>
              </span>
            </div>

            ${ordenesOrdenadas.length === 0 ? `
              <div class="vacio-tarjeta vacio-tarjeta--compacta" style="margin-top: 12px;">
                <p class="vacio-desc">El técnico no registra órdenes de trabajo en el rango de fechas seleccionado.</p>
              </div>
            ` : `
              <div class="tabla-envoltorio" style="margin-top: 12px;">
                <table class="tabla tabla--detalle-itemizado">
                  <thead>
                    <tr>
                      <th style="width: 100px;">Folio OT</th>
                      <th>Tipo de Servicio</th>
                      <th>Cliente</th>
                      <th>Dirección y Comuna</th>
                      <th>Fecha Trabajo</th>
                      <th style="text-align: right;">Monto Técnico</th>
                      <th style="text-align: center;">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${ordenesOrdenadas.map((o) => {
                      const clienteNom = o.venta_cliente_nombre || o.cliente_nombre || 'Cliente OT';
                      const tel = o.venta_cliente_telefono || o.cliente_telefono || '';
                      const dir = [o.venta_comuna || o.comuna, o.venta_cliente_direccion || o.cliente_direccion].filter(Boolean).join(' • ') || '—';
                      const fecha = formatDateTime(o.fecha_trabajo_dispositivo || o.creado_en);
                      const esValida = ['aprobada', 'liquidada'].includes(o.estado);

                      return `
                        <tr class="fila-cliqueable" data-orden-id="${o.id}" title="Presiona para ver el detalle de la orden, cliente y equipos">
                          <td>
                            <strong class="folio-tag">${escapeHtml(o.folio || ('#' + o.id))}</strong>
                          </td>
                          <td>
                            <span class="servicio-nombre">${escapeHtml(o.tipo_servicio_nombre || 'Servicio')}</span>
                          </td>
                          <td>
                            <div class="celda-cliente-info">
                              <strong class="cliente-nombre">${escapeHtml(clienteNom)}</strong>
                              ${tel ? `<span class="cliente-contacto">📞 ${escapeHtml(tel)}</span>` : ''}
                            </div>
                          </td>
                          <td style="font-size: 0.82rem; color: var(--tinta-2);">
                            ${escapeHtml(dir)}
                          </td>
                          <td style="font-size: 0.82rem; white-space: nowrap; color: var(--tinta-2);">
                            ${fecha}
                          </td>
                          <td style="text-align: right;">
                            <span class="badge-monto ${esValida ? 'badge-monto--positivo' : 'badge-monto--mudo'}">
                              ${formatMoney(o.monto_tecnico)}
                            </span>
                          </td>
                          <td style="text-align: center;">
                            ${badge(o.estado)}
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <!-- TABLA 2: VENTAS Y SUSCRIPCIONES -->
          <div class="detalle-seccion-itemizada" style="margin-top: 24px;">
            <div class="detalle-seccion-titulo-fila">
              <h4 style="margin: 0; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                <span>💼</span>
                <span>Ventas y Suscripciones Comerciales Captadas</span>
                <span class="badge-contador badge-contador--ok">${ventasOrdenadas.length} ventas</span>
              </h4>
              <span style="font-size: 0.82rem; color: var(--tinta-2); font-weight: 600;">
                Subtotal comisiones: <strong style="color: var(--tinta);">${formatMoney(f.montoVendido)}</strong>
              </span>
            </div>

            ${ventasOrdenadas.length === 0 ? `
              <div class="vacio-tarjeta vacio-tarjeta--compacta" style="margin-top: 12px;">
                <p class="vacio-desc">El técnico no registra ventas o suscripciones captadas en el rango seleccionado.</p>
              </div>
            ` : `
              <div class="tabla-envoltorio" style="margin-top: 12px;">
                <table class="tabla tabla--detalle-itemizado">
                  <thead>
                    <tr>
                      <th style="width: 110px;">N° TuVes / ID</th>
                      <th>Cliente</th>
                      <th>Plan Contratado</th>
                      <th>Comuna y Dirección</th>
                      <th>Fecha Venta</th>
                      <th style="text-align: right;">Comisión</th>
                      <th style="text-align: center;">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${ventasOrdenadas.map((v) => {
                      const dir = [v.comuna, v.cliente_direccion].filter(Boolean).join(' • ') || '—';
                      const fechaVenta = formatDateTime(v.creado_en);
                      const esInstalada = v.estado === 'instalada';

                      return `
                        <tr class="fila-cliqueable" data-venta-id="${v.id}" title="Presiona para ver el detalle del cliente, fechas de venta e instalación y equipos">
                          <td>
                            <strong class="folio-tag" style="color: #2563EB; background: #EFF6FF; border-color: #BFDBFE;">
                              ${escapeHtml(v.numero_orden_tuves || ('#' + v.id))}
                            </strong>
                          </td>
                          <td>
                            <div class="celda-cliente-info">
                              <strong class="cliente-nombre">${escapeHtml(v.cliente_nombre)}</strong>
                              ${v.cliente_rut ? `<span class="cliente-contacto">${escapeHtml(v.cliente_rut)}</span>` : ''}
                            </div>
                          </td>
                          <td>
                            <span class="plan-tag-inline">${escapeHtml(v.plan_nombre || 'Plan Estándar')}</span>
                          </td>
                          <td style="font-size: 0.82rem; color: var(--tinta-2);">
                            ${escapeHtml(dir)}
                          </td>
                          <td style="font-size: 0.82rem; white-space: nowrap; color: var(--tinta-2);">
                            ${fechaVenta}
                          </td>
                          <td style="text-align: right;">
                            <span class="badge-monto ${esInstalada ? 'badge-monto--positivo' : 'badge-monto--mudo'}">
                              ${formatMoney(v.monto_vendedor)}
                            </span>
                          </td>
                          <td style="text-align: center;">
                            ${badge(v.estado)}
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>

        </div>
      </section>
    `;
  }

  function exportarDetalleTecnicoCsv(tecnico) {
    if (!tecnico) return;
    const filasCsv = [];
    filasCsv.push(['TIPO', 'FOLIO_ID', 'SERVICIO_PLAN', 'CLIENTE', 'CONTACTO', 'DIRECCION_COMUNA', 'FECHA', 'MONTO_PAGO', 'ESTADO']);

    for (const o of (tecnico.ordenes || [])) {
      const clienteNom = o.venta_cliente_nombre || o.cliente_nombre || 'Cliente OT';
      const tel = o.venta_cliente_telefono || o.cliente_telefono || '';
      const dir = [o.venta_comuna || o.comuna, o.venta_cliente_direccion || o.cliente_direccion].filter(Boolean).join(' - ');
      const fecha = o.fecha_trabajo_dispositivo || o.creado_en || '';
      filasCsv.push([
        'ORDEN_TRABAJO',
        o.folio || ('#' + o.id),
        o.tipo_servicio_nombre || 'Servicio',
        clienteNom,
        tel,
        dir,
        fecha,
        o.monto_tecnico || 0,
        o.estado || '',
      ]);
    }

    for (const v of (tecnico.ventas || [])) {
      const dir = [v.comuna, v.cliente_direccion].filter(Boolean).join(' - ');
      filasCsv.push([
        'VENTA_COMERCIAL',
        v.numero_orden_tuves || ('#' + v.id),
        v.plan_nombre || 'Plan Comercial',
        v.cliente_nombre || '',
        v.cliente_telefono || v.cliente_rut || '',
        dir,
        v.creado_en || '',
        v.monto_vendedor || 0,
        v.estado || '',
      ]);
    }

    const csv = filasCsv
      .map((fila) => fila.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const nombreLimpio = (tecnico.nombre || 'tecnico').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const a = el(`<a href="${url}" download="detalle_${nombreLimpio}.csv"></a>`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function pintarGeneral(ventas, ordenes) {
    const porTecnico = new Map();
    const de = (id, nombre) => {
      if (!porTecnico.has(id)) {
        porTecnico.set(id, {
          id,
          nombre,
          ventasTotal: 0, ventasInstaladas: 0, montoVendido: 0,
          ordenesTotal: 0, ordenesAprobadas: 0, montoInstalado: 0,
          ventas: [],
          ordenes: [],
        });
      }
      return porTecnico.get(id);
    };

    for (const v of ventas) {
      const fila = v.vendedor_id === null
        ? de('sin_vendedor', 'TuVes (directo)')
        : de(v.vendedor_id, v.vendedor_nombre);
      fila.ventasTotal++;
      fila.ventas.push(v);
      if (v.estado === 'instalada') {
        fila.ventasInstaladas++;
        fila.montoVendido += Number(v.monto_vendedor) || 0;
      }
    }

    for (const o of ordenes) {
      const fila = de(o.tecnico_id, o.tecnico_nombre);
      fila.ordenesTotal++;
      fila.ordenes.push(o);
      if (['aprobada', 'liquidada'].includes(o.estado)) {
        fila.ordenesAprobadas++;
        fila.montoInstalado += Number(o.monto_tecnico) || 0;
      }
    }

    const filas = [...porTecnico.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
    ultimoGeneral = filas;

    if (!filas.length) {
      $general.innerHTML = `
        <div class="card-bloque">
          <div class="vacio-tarjeta">
            <div class="vacio-icono">📈</div>
            <p class="vacio-titulo">Sin actividad en este período</p>
            <p class="vacio-desc">No se encontraron ventas ni órdenes registradas con los filtros seleccionados.</p>
          </div>
        </div>
      `;
      return;
    }

    const totales = filas.reduce((acc, f) => ({
      ventasTotal: acc.ventasTotal + f.ventasTotal,
      ventasInstaladas: acc.ventasInstaladas + f.ventasInstaladas,
      montoVendido: acc.montoVendido + f.montoVendido,
      ordenesTotal: acc.ordenesTotal + f.ordenesTotal,
      ordenesAprobadas: acc.ordenesAprobadas + f.ordenesAprobadas,
      montoInstalado: acc.montoInstalado + f.montoInstalado,
    }), { ventasTotal: 0, ventasInstaladas: 0, montoVendido: 0, ordenesTotal: 0, ordenesAprobadas: 0, montoInstalado: 0 });

    const totalFacturado = totales.montoVendido + totales.montoInstalado;
    const totalTrabajos = totales.ventasInstaladas + totales.ordenesAprobadas;

    // Determinar técnico activo por defecto
    const filtroTecnico = $selectTecnico.value;
    if (filtroTecnico && filas.some((f) => String(f.id) === String(filtroTecnico))) {
      tecnicoSeleccionadoId = filtroTecnico;
    } else if (!tecnicoSeleccionadoId || !filas.some((f) => String(f.id) === String(tecnicoSeleccionadoId))) {
      tecnicoSeleccionadoId = filas[0].id;
    }

    $general.innerHTML = `
      <!-- KPI Grid General -->
      <div class="informes-kpi-grid">
        <div class="informes-kpi-card informes-kpi-card--ventas">
          <div class="informes-kpi-cabecera">
            <span class="informes-kpi-etiqueta">Ventas Instaladas</span>
            <div class="informes-kpi-icono informes-kpi-icono--azul">💼</div>
          </div>
          <div class="informes-kpi-numero">${totales.ventasInstaladas}</div>
          <div class="informes-kpi-bajada">
            <span>${totales.ventasTotal} ventas registradas</span>
            <span class="informes-kpi-monto-resaltado">${formatMoney(totales.montoVendido)}</span>
          </div>
        </div>

        <div class="informes-kpi-card informes-kpi-card--ordenes">
          <div class="informes-kpi-cabecera">
            <span class="informes-kpi-etiqueta">Órdenes Aprobadas</span>
            <div class="informes-kpi-icono informes-kpi-icono--verde">🛠️</div>
          </div>
          <div class="informes-kpi-numero">${totales.ordenesAprobadas}</div>
          <div class="informes-kpi-bajada">
            <span>${totales.ordenesTotal} órdenes totales</span>
            <span class="informes-kpi-monto-resaltado">${formatMoney(totales.montoInstalado)}</span>
          </div>
        </div>

        <div class="informes-kpi-card informes-kpi-card--actividad">
          <div class="informes-kpi-cabecera">
            <span class="informes-kpi-etiqueta">Trabajos Concluidos</span>
            <div class="informes-kpi-icono informes-kpi-icono--morado">⚡</div>
          </div>
          <div class="informes-kpi-numero">${totalTrabajos}</div>
          <div class="informes-kpi-bajada">
            <span>Operaciones de terreno</span>
            <span class="card-bloque-tag card-bloque-tag--teal">${filas.length} técnicos activos</span>
          </div>
        </div>

        <div class="informes-kpi-card informes-kpi-card--destacado">
          <div class="informes-kpi-cabecera">
            <span class="informes-kpi-etiqueta">Total Facturado</span>
            <div class="informes-kpi-icono informes-kpi-icono--destacado">💰</div>
          </div>
          <div class="informes-kpi-numero">${formatMoney(totalFacturado)}</div>
          <div class="informes-kpi-bajada">
            <span>Total comisiones y servicios</span>
            <span style="color: #34D399; font-weight: 700;">100% computable</span>
          </div>
        </div>
      </div>

      <!-- Tabla de Rendimiento por Técnico -->
      <section class="card-bloque" style="margin-bottom: 24px;">
        <div class="card-bloque-cabecera">
          <div class="card-bloque-titular">
            <span class="card-bloque-tag card-bloque-tag--indigo">Desempeño técnico</span>
            <h3>Producción y comisiones por técnico</h3>
            <p class="card-bloque-bajada">Haz clic en cualquier técnico para desplegar su detalle completo de órdenes de trabajo y ventas.</p>
          </div>
          <span class="badge-monto badge-monto--mudo">${filas.length} técnico(s)</span>
        </div>
        <div class="card-bloque-body">
          <div class="tabla-envoltorio">
            <table class="tabla tabla--rendimiento">
              <thead>
                <tr>
                  <th>Técnico</th>
                  <th style="text-align: center;">Ventas (Reg / Inst)</th>
                  <th style="text-align: right;">Comisiones venta</th>
                  <th style="text-align: center;">Órdenes (Tot / Aprob)</th>
                  <th style="text-align: right;">Monto órdenes</th>
                  <th style="text-align: right;">Total generado</th>
                  <th style="width: 130px;">Aporte %</th>
                  <th style="text-align: center; width: 140px;">Detalle</th>
                </tr>
              </thead>
              <tbody>
                ${filas.map((f) => {
                  const totalTecnico = f.montoVendido + f.montoInstalado;
                  const pctAporte = totalFacturado > 0 ? Math.round((totalTecnico / totalFacturado) * 100) : 0;
                  const inicial = (f.nombre || 'T').trim().charAt(0).toUpperCase();
                  const estaActivo = String(f.id) === String(tecnicoSeleccionadoId);

                  return `
                    <tr class="fila-tecnico-interactiva ${estaActivo ? 'fila-tecnico-interactiva--activa' : ''}" data-tecnico-id="${f.id}">
                      <td>
                        <div class="celda-tecnico-destacada">
                          <span class="subtab-avatar">${escapeHtml(inicial)}</span>
                          <div>
                            <strong class="fila-nombre">${escapeHtml(f.nombre)}</strong>
                            <span class="celda-subtexto">${f.ventasInstaladas + f.ordenesAprobadas} tareas exitosas</span>
                          </div>
                        </div>
                      </td>
                      <td style="text-align: center;">
                        <span class="badge-contador">${f.ventasTotal} reg</span>
                        <span class="badge-contador badge-contador--ok">${f.ventasInstaladas} inst</span>
                      </td>
                      <td style="text-align: right;">
                        <span class="badge-monto badge-monto--positivo">${formatMoney(f.montoVendido)}</span>
                      </td>
                      <td style="text-align: center;">
                        <span class="badge-contador">${f.ordenesTotal} tot</span>
                        <span class="badge-contador badge-contador--ok">${f.ordenesAprobadas} aprob</span>
                      </td>
                      <td style="text-align: right;">
                        <span class="badge-monto badge-monto--positivo">${formatMoney(f.montoInstalado)}</span>
                      </td>
                      <td style="text-align: right;">
                        <strong class="monto-total-tecnico">${formatMoney(totalTecnico)}</strong>
                      </td>
                      <td>
                        <div class="barra-rendimiento-col">
                          <div class="barra-pista-mini">
                            <div class="barra-relleno-mini" style="width: ${pctAporte}%"></div>
                          </div>
                          <span class="barra-pct-label">${pctAporte}% del período</span>
                        </div>
                      </td>
                      <td style="text-align: center;">
                        <button type="button" class="btn btn--chico ${estaActivo ? 'btn--primario' : 'btn--secundario'} btn-cambiar-detalle" data-tecnico-id="${f.id}">
                          ${estaActivo ? '✓ Viendo detalle' : 'Ver detalle 🔍'}
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
              <tfoot>
                <tr class="tabla-fila-totales">
                  <td><strong>TOTAL CONSOLIDADO</strong></td>
                  <td style="text-align: center;">
                    <strong>${totales.ventasTotal} reg / ${totales.ventasInstaladas} inst</strong>
                  </td>
                  <td style="text-align: right;">
                    <span class="badge-monto badge-monto--positivo">${formatMoney(totales.montoVendido)}</span>
                  </td>
                  <td style="text-align: center;">
                    <strong>${totales.ordenesTotal} tot / ${totales.ordenesAprobadas} aprob</strong>
                  </td>
                  <td style="text-align: right;">
                    <span class="badge-monto badge-monto--positivo">${formatMoney(totales.montoInstalado)}</span>
                  </td>
                  <td style="text-align: right;">
                    <strong class="monto-total-global">${formatMoney(totalFacturado)}</strong>
                  </td>
                  <td><strong style="color: #047857;">100%</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      <!-- CONTENEDOR DEL DETALLE COMPLETO DEL TÉCNICO -->
      <div id="contenedor-detalle-tecnico"></div>

      <!-- Dashboard Visual: Gráficos de Producción -->
      <div class="graficos-dashboard-grid">
        <!-- Gráfico A: Montos Económicos -->
        <section class="card-bloque">
          <div class="card-bloque-cabecera">
            <div class="card-bloque-titular">
              <span class="card-bloque-tag card-bloque-tag--teal">Monto por concepto</span>
              <h3>Comparativa económica por técnico</h3>
              <p class="card-bloque-bajada">Relación entre montos comisionados por venta vs servicios instalados.</p>
            </div>
            <div class="grafico-leyenda">
              <span><i class="grafico-swatch" style="background: #3B82F6;"></i>Venta</span>
              <span><i class="grafico-swatch" style="background: #0D9488;"></i>Instalación</span>
            </div>
          </div>
          <div class="grafico-card-cuerpo">
            ${graficoEconomico(filas)}
          </div>
        </section>

        <!-- Gráfico B: Volumen de Operaciones -->
        <section class="card-bloque">
          <div class="card-bloque-cabecera">
            <div class="card-bloque-titular">
              <span class="card-bloque-tag card-bloque-tag--amber">Carga operativa</span>
              <h3>Volumen de trabajos ejecutados</h3>
              <p class="card-bloque-bajada">Cantidad física de órdenes atendidas vs ventas concretadas.</p>
            </div>
            <div class="grafico-leyenda">
              <span><i class="grafico-swatch" style="background: #6366F1;"></i>Órdenes</span>
              <span><i class="grafico-swatch" style="background: #10B981;"></i>Ventas</span>
            </div>
          </div>
          <div class="grafico-card-cuerpo">
            ${graficoVolumen(filas)}
          </div>
        </section>
      </div>
    `;

    function refrescarDetalleTecnico(id, hacerScroll = false) {
      tecnicoSeleccionadoId = id;
      const tecnico = filas.find((f) => String(f.id) === String(id)) || filas[0];
      const $contenedor = $general.querySelector('#contenedor-detalle-tecnico');
      if ($contenedor && tecnico) {
        $contenedor.innerHTML = renderDetalleTecnico(tecnico, filas, totalFacturado);
        engancharEventosDetalle($contenedor, tecnico);
        if (hacerScroll) {
          $contenedor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      $general.querySelectorAll('.fila-tecnico-interactiva').forEach((tr) => {
        const esActiva = String(tr.dataset.tecnicoId) === String(id);
        tr.classList.toggle('fila-tecnico-interactiva--activa', esActiva);
        const $btn = tr.querySelector('.btn-cambiar-detalle');
        if ($btn) {
          $btn.className = `btn btn--chico ${esActiva ? 'btn--primario' : 'btn--secundario'} btn-cambiar-detalle`;
          $btn.innerHTML = esActiva ? '✓ Viendo detalle' : 'Ver detalle 🔍';
        }
      });
    }

    function engancharEventosDetalle($cont, tecnico) {
      const $sel = $cont.querySelector('#select-tecnico-activo');
      if ($sel) {
        $sel.addEventListener('change', (ev) => {
          refrescarDetalleTecnico(ev.target.value, true);
        });
      }

      const $btnCsv = $cont.querySelector('#btn-exportar-detalle-csv');
      if ($btnCsv) {
        $btnCsv.addEventListener('click', () => exportarDetalleTecnicoCsv(tecnico));
      }

      const $btnPdf = $cont.querySelector('#btn-imprimir-detalle-pdf');
      if ($btnPdf) {
        $btnPdf.addEventListener('click', () => {
          prepararInformeImpresion(tecnico.id);
          window.print();
        });
      }
    }

    // Render inicial del detalle del técnico
    refrescarDetalleTecnico(tecnicoSeleccionadoId, false);

    // Eventos de selección en la tabla de resumen
    $general.querySelectorAll('.fila-tecnico-interactiva').forEach((tr) => {
      tr.addEventListener('click', (ev) => {
        const id = tr.dataset.tecnicoId;
        refrescarDetalleTecnico(id, true);
      });
    });
  }

  function graficoEconomico(filas) {
    const max = Math.max(1, ...filas.map((f) => Math.max(f.montoVendido, f.montoInstalado)));
    return filas.map((f) => {
      const pctVendido = Math.round((f.montoVendido / max) * 100);
      const pctInstalado = Math.round((f.montoInstalado / max) * 100);
      const inicial = (f.nombre || 'T').trim().charAt(0).toUpperCase();

      return `
        <div class="grafico-barra-item">
          <div class="grafico-barra-cabecera">
            <div class="grafico-barra-tecnico">
              <span class="subtab-avatar" style="width: 18px; height: 18px; font-size: 0.65rem;">${escapeHtml(inicial)}</span>
              <span>${escapeHtml(f.nombre)}</span>
            </div>
            <span class="grafico-barra-totales">${formatMoney(f.montoVendido + f.montoInstalado)}</span>
          </div>
          <div class="grafico-barra-pistas-stack">
            <div class="grafico-barra-linea">
              <div class="grafico-pista-ancha">
                <div class="grafico-relleno-vendido" style="width: ${pctVendido}%"></div>
              </div>
              <span class="grafico-barra-valor">${formatMoney(f.montoVendido)}</span>
            </div>
            <div class="grafico-barra-linea">
              <div class="grafico-pista-ancha">
                <div class="grafico-relleno-instalado" style="width: ${pctInstalado}%"></div>
              </div>
              <span class="grafico-barra-valor">${formatMoney(f.montoInstalado)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function graficoVolumen(filas) {
    const max = Math.max(1, ...filas.map((f) => Math.max(f.ordenesAprobadas, f.ventasInstaladas)));
    return filas.map((f) => {
      const pctOrdenes = Math.round((f.ordenesAprobadas / max) * 100);
      const pctVentas = Math.round((f.ventasInstaladas / max) * 100);
      const inicial = (f.nombre || 'T').trim().charAt(0).toUpperCase();

      return `
        <div class="grafico-barra-item">
          <div class="grafico-barra-cabecera">
            <div class="grafico-barra-tecnico">
              <span class="subtab-avatar" style="width: 18px; height: 18px; font-size: 0.65rem;">${escapeHtml(inicial)}</span>
              <span>${escapeHtml(f.nombre)}</span>
            </div>
            <span class="grafico-barra-totales" style="color: var(--tinta-2); font-size: 0.8rem;">
              ${f.ordenesAprobadas} órdenes / ${f.ventasInstaladas} ventas
            </span>
          </div>
          <div class="grafico-barra-pistas-stack">
            <div class="grafico-barra-linea">
              <div class="grafico-pista-ancha">
                <div class="grafico-relleno-vendido" style="background: linear-gradient(90deg, #6366F1, #818CF8); width: ${pctOrdenes}%"></div>
              </div>
              <span class="grafico-barra-valor" style="min-width: 60px;">${f.ordenesAprobadas} ord</span>
            </div>
            <div class="grafico-barra-linea">
              <div class="grafico-pista-ancha">
                <div class="grafico-relleno-instalado" style="background: linear-gradient(90deg, #10B981, #34D399); width: ${pctVentas}%"></div>
              </div>
              <span class="grafico-barra-valor" style="min-width: 60px;">${f.ventasInstaladas} vtas</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // =========================================================================
  // VISTA 2: INFORME DE VENTAS
  // =========================================================================
  function pintarInformeVentas(ventas) {
    if (!ventas.length) {
      $informeVentas.innerHTML = `
        <div class="card-bloque">
          <div class="vacio-tarjeta">
            <div class="vacio-icono">📦</div>
            <p class="vacio-titulo">No hay ventas en este filtro</p>
            <p class="vacio-desc">Modifica el rango de fechas o el técnico seleccionado para ver suscripciones comerciales.</p>
          </div>
        </div>
      `;
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

      const comuna = v.comuna || 'Sin comuna';
      if (!porComuna.has(comuna)) porComuna.set(comuna, { n: 0, monto: 0 });
      const fc = porComuna.get(comuna);
      fc.n++; fc.monto += montoVendedor;
    }

    const maxPlan = Math.max(1, ...[...porPlan.values()].map((d) => d.n));
    const maxComuna = Math.max(1, ...[...porComuna.values()].map((d) => d.n));

    $informeVentas.innerHTML = `
      <!-- KPIs Ventas -->
      <div class="informes-kpi-grid">
        <div class="informes-kpi-card informes-kpi-card--ventas">
          <div class="informes-kpi-cabecera">
            <span class="informes-kpi-etiqueta">Ventas Totales</span>
            <div class="informes-kpi-icono informes-kpi-icono--azul">📋</div>
          </div>
          <div class="informes-kpi-numero">${ventas.length}</div>
          <div class="informes-kpi-bajada"><span>Total solicitudes</span></div>
        </div>

        <div class="informes-kpi-card informes-kpi-card--ordenes">
          <div class="informes-kpi-cabecera">
            <span class="informes-kpi-etiqueta">Instaladas con éxito</span>
            <div class="informes-kpi-icono informes-kpi-icono--verde">✅</div>
          </div>
          <div class="informes-kpi-numero">${porEstado.instalada || 0}</div>
          <div class="informes-kpi-bajada">
            <span>Tasa conversión:</span>
            <strong style="color: #047857;">${Math.round(((porEstado.instalada || 0) / ventas.length) * 100)}%</strong>
          </div>
        </div>

        <div class="informes-kpi-card informes-kpi-card--actividad">
          <div class="informes-kpi-cabecera">
            <span class="informes-kpi-etiqueta">Pendientes de Instalación</span>
            <div class="informes-kpi-icono informes-kpi-icono--morado">⏳</div>
          </div>
          <div class="informes-kpi-numero">${porEstado.registrada || 0}</div>
          <div class="informes-kpi-bajada"><span>En proceso o agendadas</span></div>
        </div>

        <div class="informes-kpi-card informes-kpi-card--destacado">
          <div class="informes-kpi-cabecera">
            <span class="informes-kpi-etiqueta">Comisiones por Venta</span>
            <div class="informes-kpi-icono informes-kpi-icono--destacado">💵</div>
          </div>
          <div class="informes-kpi-numero">${formatMoney(montoVendidoTotal)}</div>
          <div class="informes-kpi-bajada"><span>Monto acumulado vendedores</span></div>
        </div>
      </div>

      <!-- Tablas de Ventas -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 24px;">
        <!-- Por Plan -->
        <section class="card-bloque">
          <div class="card-bloque-cabecera">
            <div class="card-bloque-titular">
              <span class="card-bloque-tag card-bloque-tag--indigo">Suscripciones</span>
              <h3>Ventas por plan comercial</h3>
              <p class="card-bloque-bajada">Planes de TuVes contratados en el período.</p>
            </div>
          </div>
          <div class="card-bloque-body">
            <div class="tabla-envoltorio">
              <table class="tabla">
                <thead>
                  <tr><th>Plan</th><th style="width: 170px;">Volumen</th><th style="text-align: right;">Comisiones</th></tr>
                </thead>
                <tbody>
                  ${[...porPlan.entries()].sort((a, b) => b[1].n - a[1].n).map(([nombre, d]) => {
                    const pct = Math.round((d.n / maxPlan) * 100);
                    return `
                      <tr>
                        <td><strong>${escapeHtml(nombre)}</strong></td>
                        <td>
                          <div class="celda-distribucion">
                            <span class="distribucion-num">${d.n}</span>
                            <div class="distribucion-barra-pista">
                              <div class="distribucion-barra-relleno" style="width: ${pct}%"></div>
                            </div>
                            <span class="distribucion-pct">${Math.round((d.n / ventas.length) * 100)}%</span>
                          </div>
                        </td>
                        <td style="text-align: right;"><span class="badge-monto badge-monto--positivo">${formatMoney(d.monto)}</span></td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- Por Comuna -->
        <section class="card-bloque">
          <div class="card-bloque-cabecera">
            <div class="card-bloque-titular">
              <span class="card-bloque-tag card-bloque-tag--teal">Distribución territorial</span>
              <h3>Ventas por comuna</h3>
              <p class="card-bloque-bajada">Cobertura geográfica de captación comercial.</p>
            </div>
          </div>
          <div class="card-bloque-body">
            <div class="tabla-envoltorio">
              <table class="tabla">
                <thead>
                  <tr><th>Comuna</th><th style="width: 170px;">Volumen</th><th style="text-align: right;">Comisiones</th></tr>
                </thead>
                <tbody>
                  ${[...porComuna.entries()].sort((a, b) => b[1].n - a[1].n).map(([nombre, d]) => {
                    const pct = Math.round((d.n / maxComuna) * 100);
                    return `
                      <tr>
                        <td><strong>${escapeHtml(nombre)}</strong></td>
                        <td>
                          <div class="celda-distribucion">
                            <span class="distribucion-num">${d.n}</span>
                            <div class="distribucion-barra-pista">
                              <div class="distribucion-barra-relleno" style="background: linear-gradient(90deg, #10B981, #34D399); width: ${pct}%"></div>
                            </div>
                            <span class="distribucion-pct">${Math.round((d.n / ventas.length) * 100)}%</span>
                          </div>
                        </td>
                        <td style="text-align: right;"><span class="badge-monto badge-monto--positivo">${formatMoney(d.monto)}</span></td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <!-- Listado Detallado de Ventas -->
      <section class="card-bloque" style="margin-top: 24px;">
        <div class="card-bloque-cabecera">
          <div class="card-bloque-titular">
            <span class="card-bloque-tag card-bloque-tag--indigo">Detalle completo</span>
            <h3>Listado pormenorizado de ventas (${ventas.length})</h3>
            <p class="card-bloque-bajada">Todas las solicitudes y contratos de clientes ingresados en el período.</p>
          </div>
          <span class="badge-monto badge-monto--mudo">${ventas.length} registro(s)</span>
        </div>
        <div class="card-bloque-body">
          <div class="tabla-envoltorio">
            <table class="tabla tabla--detalle-itemizado">
              <thead>
                <tr>
                  <th style="width: 110px;">N° TuVes / ID</th>
                  <th>Vendedor / Técnico</th>
                  <th>Cliente</th>
                  <th>Plan Comercial</th>
                  <th>Comuna y Dirección</th>
                  <th>Fecha Ingreso</th>
                  <th style="text-align: right;">Comisión</th>
                  <th style="text-align: center;">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${ventas.map((v) => {
                  const dir = [v.comuna, v.cliente_direccion].filter(Boolean).join(' • ') || '—';
                  const fecha = formatDateTime(v.creado_en);
                  const vendedorNom = v.vendedor_nombre || 'TuVes (directo)';
                  const esInstalada = v.estado === 'instalada';

                  return `
                    <tr class="fila-cliqueable" data-venta-id="${v.id}" title="Presiona para ver el detalle del cliente, fechas de venta e instalación y equipos">
                      <td>
                        <strong class="folio-tag" style="color: #2563EB; background: #EFF6FF; border-color: #BFDBFE;">
                          ${escapeHtml(v.numero_orden_tuves || ('#' + v.id))}
                        </strong>
                      </td>
                      <td>
                        <strong class="fila-nombre">${escapeHtml(vendedorNom)}</strong>
                      </td>
                      <td>
                        <div class="celda-cliente-info">
                          <strong class="cliente-nombre">${escapeHtml(v.cliente_nombre)}</strong>
                          ${v.cliente_telefono ? `<span class="cliente-contacto">📞 ${escapeHtml(v.cliente_telefono)}</span>` : ''}
                        </div>
                      </td>
                      <td>
                        <span class="plan-tag-inline">${escapeHtml(v.plan_nombre || 'Plan Estándar')}</span>
                      </td>
                      <td style="font-size: 0.82rem; color: var(--tinta-2);">
                        ${escapeHtml(dir)}
                      </td>
                      <td style="font-size: 0.82rem; white-space: nowrap; color: var(--tinta-2);">
                        ${fecha}
                      </td>
                      <td style="text-align: right;">
                        <span class="badge-monto ${esInstalada ? 'badge-monto--positivo' : 'badge-monto--mudo'}">
                          ${formatMoney(v.monto_vendedor)}
                        </span>
                      </td>
                      <td style="text-align: center;">
                        ${badge(v.estado)}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

  // =========================================================================
  // VISTA 3: INFORME DE INSTALACIONES Y SERVICIOS
  // =========================================================================
  function pintarInformeInstalaciones(ordenes) {
    if (!ordenes.length) {
      $informeInstalaciones.innerHTML = `
        <div class="card-bloque">
          <div class="vacio-tarjeta">
            <div class="vacio-icono">🔧</div>
            <p class="vacio-titulo">No hay órdenes en este filtro</p>
            <p class="vacio-desc">Modifica los filtros de fecha o técnico para visualizar órdenes de terreno.</p>
          </div>
        </div>
      `;
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

    const maxTipo = Math.max(1, ...[...porTipo.values()].map((d) => d.n));

    $informeInstalaciones.innerHTML = `
      <!-- KPIs Instalaciones -->
      <div class="informes-kpi-grid">
        <div class="informes-kpi-card informes-kpi-card--ordenes">
          <div class="informes-kpi-cabecera">
            <span class="informes-kpi-etiqueta">Órdenes Ejecutadas</span>
            <div class="informes-kpi-icono informes-kpi-icono--verde">📋</div>
          </div>
          <div class="informes-kpi-numero">${ordenes.length}</div>
          <div class="informes-kpi-bajada"><span>Enviadas por técnicos</span></div>
        </div>

        <div class="informes-kpi-card informes-kpi-card--ventas">
          <div class="informes-kpi-cabecera">
            <span class="informes-kpi-etiqueta">Aprobadas / Liquidadas</span>
            <div class="informes-kpi-icono informes-kpi-icono--azul">✅</div>
          </div>
          <div class="informes-kpi-numero">${aprobadas}</div>
          <div class="informes-kpi-bajada">
            <span>Tasa de aprobación:</span>
            <strong style="color: #047857;">${Math.round((aprobadas / ordenes.length) * 100)}%</strong>
          </div>
        </div>

        <div class="informes-kpi-card informes-kpi-card--destacado">
          <div class="informes-kpi-cabecera">
            <span class="informes-kpi-etiqueta">Monto Total Técnico</span>
            <div class="informes-kpi-icono informes-kpi-icono--destacado">💵</div>
          </div>
          <div class="informes-kpi-numero">${formatMoney(montoTotal)}</div>
          <div class="informes-kpi-bajada"><span>Monto por servicios pagable</span></div>
        </div>
      </div>

      <!-- Tablas de Órdenes -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 24px;">
        <!-- Por Tipo de Servicio -->
        <section class="card-bloque">
          <div class="card-bloque-cabecera">
            <div class="card-bloque-titular">
              <span class="card-bloque-tag card-bloque-tag--amber">Tipificación</span>
              <h3>Órdenes por tipo de servicio</h3>
              <p class="card-bloque-bajada">Instalaciones, servicios adicionales y soportes técnicos.</p>
            </div>
          </div>
          <div class="card-bloque-body">
            <div class="tabla-envoltorio">
              <table class="tabla">
                <thead>
                  <tr><th>Servicio</th><th style="width: 170px;">Volumen</th><th style="text-align: right;">Monto técnico</th></tr>
                </thead>
                <tbody>
                  ${[...porTipo.entries()].sort((a, b) => b[1].n - a[1].n).map(([nombre, d]) => {
                    const pct = Math.round((d.n / maxTipo) * 100);
                    return `
                      <tr>
                        <td><strong>${escapeHtml(nombre)}</strong></td>
                        <td>
                          <div class="celda-distribucion">
                            <span class="distribucion-num">${d.n}</span>
                            <div class="distribucion-barra-pista">
                              <div class="distribucion-barra-relleno distribucion-barra-relleno--ordenes" style="width: ${pct}%"></div>
                            </div>
                            <span class="distribucion-pct">${Math.round((d.n / ordenes.length) * 100)}%</span>
                          </div>
                        </td>
                        <td style="text-align: right;"><span class="badge-monto badge-monto--positivo">${formatMoney(d.monto)}</span></td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- Por Estado -->
        <section class="card-bloque">
          <div class="card-bloque-cabecera">
            <div class="card-bloque-titular">
              <span class="card-bloque-tag card-bloque-tag--indigo">Flujo de aprobación</span>
              <h3>Órdenes por estado</h3>
              <p class="card-bloque-bajada">Distribución según condición operativa en el sistema.</p>
            </div>
          </div>
          <div class="card-bloque-body">
            <div class="tabla-envoltorio">
              <table class="tabla">
                <thead>
                  <tr><th>Estado</th><th style="width: 170px;">Cantidad</th><th style="text-align: right;">Porcentaje</th></tr>
                </thead>
                <tbody>
                  ${[...porEstado.entries()].sort((a, b) => b[1] - a[1]).map(([estado, n]) => {
                    const pct = Math.round((n / ordenes.length) * 100);
                    return `
                      <tr>
                        <td>${badge(estado)}</td>
                        <td>
                          <div class="celda-distribucion">
                            <span class="distribucion-num">${n}</span>
                            <div class="distribucion-barra-pista">
                              <div class="distribucion-barra-relleno" style="width: ${pct}%"></div>
                            </div>
                          </div>
                        </td>
                        <td style="text-align: right;"><strong>${pct}%</strong></td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <!-- Listado Detallado de Órdenes -->
      <section class="card-bloque" style="margin-top: 24px;">
        <div class="card-bloque-cabecera">
          <div class="card-bloque-titular">
            <span class="card-bloque-tag card-bloque-tag--amber">Detalle completo</span>
            <h3>Listado pormenorizado de órdenes de trabajo (${ordenes.length})</h3>
            <p class="card-bloque-bajada">Todas las intervenciones técnicas realizadas en terreno en el período.</p>
          </div>
          <span class="badge-monto badge-monto--mudo">${ordenes.length} registro(s)</span>
        </div>
        <div class="card-bloque-body">
          <div class="tabla-envoltorio">
            <table class="tabla tabla--detalle-itemizado">
              <thead>
                <tr>
                  <th style="width: 100px;">Folio OT</th>
                  <th>Técnico</th>
                  <th>Tipo de Servicio</th>
                  <th>Cliente</th>
                  <th>Comuna y Dirección</th>
                  <th>Fecha Trabajo</th>
                  <th style="text-align: right;">Monto Técnico</th>
                  <th style="text-align: center;">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${ordenes.map((o) => {
                  const clienteNom = o.venta_cliente_nombre || o.cliente_nombre || 'Cliente OT';
                  const tel = o.venta_cliente_telefono || o.cliente_telefono || '';
                  const dir = [o.venta_comuna || o.comuna, o.venta_cliente_direccion || o.cliente_direccion].filter(Boolean).join(' • ') || '—';
                  const fecha = formatDateTime(o.fecha_trabajo_dispositivo || o.creado_en);
                  const esValida = ['aprobada', 'liquidada'].includes(o.estado);

                  return `
                    <tr class="fila-cliqueable" data-orden-id="${o.id}" title="Presiona para ver el detalle de la orden, cliente y equipos">
                      <td>
                        <strong class="folio-tag">${escapeHtml(o.folio || ('#' + o.id))}</strong>
                      </td>
                      <td>
                        <strong class="fila-nombre">${escapeHtml(o.tecnico_nombre || 'Técnico')}</strong>
                      </td>
                      <td>
                        <span class="servicio-nombre">${escapeHtml(o.tipo_servicio_nombre || 'Servicio')}</span>
                      </td>
                      <td>
                        <div class="celda-cliente-info">
                          <strong class="cliente-nombre">${escapeHtml(clienteNom)}</strong>
                          ${tel ? `<span class="cliente-contacto">📞 ${escapeHtml(tel)}</span>` : ''}
                        </div>
                      </td>
                      <td style="font-size: 0.82rem; color: var(--tinta-2);">
                        ${escapeHtml(dir)}
                      </td>
                      <td style="font-size: 0.82rem; white-space: nowrap; color: var(--tinta-2);">
                        ${fecha}
                      </td>
                      <td style="text-align: right;">
                        <span class="badge-monto ${esValida ? 'badge-monto--positivo' : 'badge-monto--mudo'}">
                          ${formatMoney(o.monto_tecnico)}
                        </span>
                      </td>
                      <td style="text-align: center;">
                        ${badge(o.estado)}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

  // =========================================================================
  // EXPORTAR CSV
  // =========================================================================
  container.querySelector('#btn-exportar-general').addEventListener('click', () => {
    if (!ultimoGeneral.length) { toast('No hay filas para exportar en este filtro.', 'malo'); return; }
    const encabezados = ['Técnico', 'Ventas Registradas', 'Ventas Instaladas', 'Monto Ventas', 'Órdenes Totales', 'Órdenes Aprobadas', 'Monto Órdenes', 'Total Generado'];
    const filasCsv = ultimoGeneral.map((f) => [
      f.nombre, f.ventasTotal, f.ventasInstaladas, f.montoVendido, f.ordenesTotal, f.ordenesAprobadas, f.montoInstalado, (f.montoVendido + f.montoInstalado),
    ]);
    const csv = [encabezados, ...filasCsv]
      .map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = el(`<a href="${url}" download="informe-rendimiento-tecnicos.csv"></a>`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // =========================================================================
  // VISTA 4: CONFLICTOS
  // =========================================================================
  function pintarConflictos(conflictos) {
    $subtabConflictos.innerHTML = conflictos.length
      ? `⚠️ Conflictos <span class="badge-monto badge-monto--negativo" style="padding: 1px 6px; font-size: 0.72rem; margin-left: 4px;">${conflictos.length}</span>`
      : '⚠️ Conflictos';

    if (!conflictos.length) {
      $conflictos.innerHTML = `
        <div class="card-bloque">
          <div class="vacio-tarjeta">
            <div class="vacio-icono">🛡️</div>
            <p class="vacio-titulo">Sin conflictos pendientes</p>
            <p class="vacio-desc">Todos los folios de órdenes en terreno se encuentran validados y al día.</p>
          </div>
        </div>
      `;
      return;
    }

    $conflictos.innerHTML = `
      <section class="card-bloque">
        <div class="card-bloque-cabecera">
          <div class="card-bloque-titular">
            <span class="card-bloque-tag card-bloque-tag--amber">Revisión requerida</span>
            <h3>Folios duplicados pendientes</h3>
            <p class="card-bloque-bajada">Decide si cada visita corresponde a un trabajo legítimo o a un ingreso repetido.</p>
          </div>
          <span class="badge-monto badge-monto--negativo">${conflictos.length} conflicto(s)</span>
        </div>
        <div class="card-bloque-body">
          <div class="tabla-envoltorio">
            <table class="tabla">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Técnico</th>
                  <th>Descripción del conflicto</th>
                  <th>Fecha de ingreso</th>
                  <th style="text-align: right;">Resolución</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </section>
    `;

    const $tbody = $conflictos.querySelector('tbody');
    for (const c of conflictos) {
      const tr = el(`
        <tr>
          <td><strong>${escapeHtml(c.folio)}</strong></td>
          <td>
            <div class="celda-destacada">
              <span class="usuario-pill">${escapeHtml(c.tecnico_nombre)}</span>
            </div>
          </td>
          <td class="celda-observacion">${escapeHtml(c.descripcion || 'Folio ingresado previamente.')}</td>
          <td style="font-size: 0.82rem; color: var(--tinta-2);">${formatDateTime(c.creado_en)}</td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 6px;">
              <button type="button" class="btn btn--primario btn--chico btn-con-icono" data-accion="aceptar">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Aceptar</span>
              </button>
              <button type="button" class="btn btn--malo btn--chico btn-con-icono" data-accion="invalidar">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                <span>Invalidar</span>
              </button>
            </div>
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
      <div class="modal-encabezado-icono">
        <div class="modal-icono-circulo ${esAceptar ? 'modal-icono-circulo--teal' : 'modal-icono-circulo--malo'}">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${esAceptar
              ? '<polyline points="20 6 9 17 4 12"></polyline>'
              : '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>'}
          </svg>
        </div>
        <div>
          <h3 style="margin: 0; font-size: 1.15rem;">${esAceptar ? 'Aceptar visita legítima' : 'Invalidar duplicado'} — Folio ${escapeHtml(conflicto.folio)}</h3>
          <p style="margin: 3px 0 0; font-size: 0.82rem; color: var(--tinta-2);">
            ${esAceptar
              ? 'La orden se liquidará como válida: se calcula su valor, se descuenta material y se acredita al técnico.'
              : 'La orden se descarta sin pago ni descuento de inventario por folio repetido.'}
          </p>
        </div>
      </div>
      <form id="form-resolver" style="margin-top: 18px;">
        <label class="campo">
          <span>Comentario u observación (opcional)</span>
          <textarea name="comentario" rows="2" placeholder="Motivo de la resolución…"></textarea>
        </label>
        <div class="modal-acciones" style="margin-top: 20px;">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn ${esAceptar ? 'btn--primario' : 'btn--malo'}">
            ${esAceptar ? 'Confirmar y Aceptar' : 'Confirmar Invalidación'}
          </button>
        </div>
      </form>
    `);

    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-resolver').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const $submit = ev.target.querySelector('button[type="submit"]');
      if ($submit.disabled) return;
      $submit.disabled = true;
      const comentario = new FormData(ev.target).get('comentario')?.trim() || null;
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
      } catch (e) {
        toast(e.message, 'malo');
        $submit.disabled = false;
      }
    });
  }

  async function cargarConflictos() {
    $conflictos.innerHTML = '<div class="cargando-bloque"><div class="spinner"></div><p>Cargando conflictos…</p></div>';
    try {
      const { conflictos } = await api('/admin/conflictos');
      pintarConflictos(conflictos);
    } catch (e) {
      $conflictos.innerHTML = `<div class="callout-aviso callout-aviso--error"><div class="callout-texto">${escapeHtml(e.message)}</div></div>`;
    }
  }

  async function cargar() {
    $informeVentas.innerHTML = '<div class="cargando-bloque"><div class="spinner"></div><p>Cargando informe de ventas…</p></div>';
    $informeInstalaciones.innerHTML = '<div class="cargando-bloque"><div class="spinner"></div><p>Cargando informe de órdenes…</p></div>';
    $general.innerHTML = '<div class="cargando-bloque"><div class="spinner"></div><p>Cargando métricas consolidadas…</p></div>';
    try {
      const { ventas, ordenes } = await api(`/admin/historial${queryActual()}`);
      ultimoVentas = ventas;
      ultimoOrdenes = ordenes;
      pintarInformeVentas(ventas);
      pintarInformeInstalaciones(ordenes);
      pintarGeneral(ventas, ordenes);
      prepararInformeImpresion();
    } catch (e) {
      const msg = `<div class="callout-aviso callout-aviso--error"><div class="callout-texto">${escapeHtml(e.message)}</div></div>`;
      $informeVentas.innerHTML = msg;
      $informeInstalaciones.innerHTML = '';
      $general.innerHTML = msg;
    }
  }

  await Promise.all([cargar(), cargarConflictos()]);
}
