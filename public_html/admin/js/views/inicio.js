import { api } from '../api.js';
import { el, escapeHtml, formatMoney, formatDateTime, badge } from '../utils.js';
import { abrirModal } from '../modal.js';
import { toast } from '../toast.js';

const ACCESOS = [
  {
    ruta: 'bodega',
    icono: '📦',
    colorFondo: '#FEF3C7',
    tag: 'Inventario Central',
    etiqueta: 'Bodega Central',
    desc: 'Stock de decodificadores, tarjetas TuVes, LNB y carga de lotes.',
  },
  {
    ruta: 'bodega?vista=tecnicos',
    icono: '🧰',
    colorFondo: '#E0F2FE',
    tag: 'Maletas Técnicas',
    etiqueta: 'Bodega Técnicos',
    desc: 'Equipos asignados y material en custodia por instalador.',
  },
  {
    ruta: 'billetera',
    icono: '💳',
    colorFondo: '#DCFCE7',
    tag: 'Finanzas y Pagos',
    etiqueta: 'Billetera',
    desc: 'Saldos disponibles, registro de pagos y liquidación de períodos.',
  },
  {
    ruta: 'tarifario',
    icono: '🏷️',
    colorFondo: '#F3E8FF',
    tag: 'Precios Oficiales',
    etiqueta: 'Tarifario y Planes',
    desc: 'Comisiones de venta comercial y tarifas por número de decos.',
  },
  {
    ruta: 'usuarios',
    icono: '👥',
    colorFondo: '#EEF2FF',
    tag: 'Equipo Humano',
    etiqueta: 'Usuarios y Roles',
    desc: 'Gestión de técnicos, credenciales de acceso y permisos.',
  },
  {
    ruta: 'historial',
    icono: '📊',
    colorFondo: '#FFE4E6',
    tag: 'Analítica y CSV',
    etiqueta: 'Informes',
    desc: 'Rendimiento comparativo, reporte de ventas y exportación a PDF/Excel.',
  },
];

/** 'YYYY-MM' de hoy según el reloj local */
function mesActualStr() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

/** "Período: 1 al 30 de septiembre de 2026" */
function formatPeriodoLabel(desde, hasta) {
  const d1 = new Date(desde + 'T00:00:00');
  const d2 = new Date(hasta + 'T00:00:00');
  const mesTexto = d1.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  return `Período: ${d1.getDate()} al ${d2.getDate()} de ${mesTexto}`;
}

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
    <div class="vista-contenedor">
      <!-- Cabecera de Bienvenida -->
      <div class="vista-cabecera inicio-cabecera-bienvenida">
        <div>
          <span class="badge-bienvenida">Panel de Control General</span>
          <h2 class="vista-titulo">Resumen Operativo</h2>
          <p class="vista-subtitulo">
            Métricas del mes, accesos rápidos a módulos principales y control de órdenes en terreno.
          </p>
        </div>
        <div class="inicio-periodo-control">
          <div class="inicio-periodo-badge">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <span id="periodo-titulo">Cargando período…</span>
          </div>
          <button type="button" class="btn btn--secundario btn--chico btn-con-icono" id="periodo-consultar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>Cambiar mes</span>
          </button>
          <button type="button" class="btn btn--texto btn--chico" id="periodo-hoy" hidden>Volver a este mes</button>
        </div>
      </div>

      <!-- Sección 1: Métricas Clave del Período -->
      <div id="inicio-tiles" style="margin-bottom: 30px;">
        <div class="cargando-bloque"><div class="spinner"></div><p>Cargando métricas del período…</p></div>
      </div>

      <!-- Sección 2: Accesos Directos a Módulos -->
      <div style="margin-bottom: 32px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--tinta); margin: 0;">Módulos del Sistema</h3>
          <span style="font-size: 0.8rem; color: var(--tinta-3); font-weight: 600;">Acceso rápido a gestión</span>
        </div>
        <div class="accesos-hub-grid">
          ${ACCESOS.map((a) => `
            <a href="#${a.ruta}" class="acceso-hub-tarjeta">
              <div class="acceso-hub-icono" style="background: ${a.colorFondo};">
                ${a.icono}
              </div>
              <div class="acceso-hub-cuerpo">
                <div class="acceso-hub-titular">
                  <span class="acceso-hub-tag">${escapeHtml(a.tag)}</span>
                  <span class="acceso-hub-flecha">→</span>
                </div>
                <h4 class="acceso-hub-titulo">${escapeHtml(a.etiqueta)}</h4>
                <p class="acceso-hub-desc">${escapeHtml(a.desc)}</p>
              </div>
            </a>
          `).join('')}
        </div>
      </div>

      <!-- Sección 3: Alertas Operativas -->
      <div class="card-bloque" style="margin-bottom: 28px;">
        <div class="card-bloque-cabecera">
          <div class="card-bloque-titular">
            <span class="card-bloque-tag card-bloque-tag--amber">Atención operativa</span>
            <h3>Alertas y pendientes urgentes</h3>
            <p class="card-bloque-bajada">Seguimiento de traspasos sin confirmar y órdenes retenidas.</p>
          </div>
        </div>
        <div class="card-bloque-body" style="padding: 20px 24px;">
          <div id="inicio-alertas">
            <div class="cargando-bloque" style="padding: 20px;"><div class="spinner"></div><p>Verificando alertas…</p></div>
          </div>
        </div>
      </div>

      <!-- Sección 4: Ventas Pendientes de Instalar -->
      <section class="card-bloque" style="margin-bottom: 24px;">
        <div class="card-bloque-cabecera">
          <div class="card-bloque-titular">
            <span class="card-bloque-tag card-bloque-tag--indigo">Por instalar</span>
            <h3>Ventas pendientes de instalación</h3>
            <p class="card-bloque-bajada">Suscripciones contratadas esperando visita técnica en terreno.</p>
          </div>
          <span class="badge-monto badge-monto--mudo" id="badge-pendientes-conteo">0 pendientes</span>
        </div>
        <div class="card-bloque-body">
          <div id="inicio-ventas-pendientes">
            <div class="cargando-bloque"><div class="spinner"></div><p>Cargando órdenes…</p></div>
          </div>
        </div>
      </section>
    </div>
  `);
  container.appendChild(seccion);

  async function recargarVentas() {
    try {
      const { ventas } = await api('/admin/ventas/pendientes-instalar');
      const $badgeConteo = seccion.querySelector('#badge-pendientes-conteo');
      if ($badgeConteo) $badgeConteo.textContent = `${ventas.length} por instalar`;
      pintarVentasPendientes(seccion.querySelector('#inicio-ventas-pendientes'), ventas, recargarVentas);
    } catch (e) {
      seccion.querySelector('#inicio-ventas-pendientes').innerHTML = `
        <div class="callout-aviso callout-aviso--error"><div class="callout-texto">${escapeHtml(e.message)}</div></div>
      `;
    }
  }
  await recargarVentas();

  const $titulo = seccion.querySelector('#periodo-titulo');
  const $tiles = seccion.querySelector('#inicio-tiles');
  const $btnConsultar = seccion.querySelector('#periodo-consultar');
  const $btnHoy = seccion.querySelector('#periodo-hoy');
  const mesDeHoy = mesActualStr();
  let mesMostrado = mesDeHoy;

  async function cargarPeriodo(mes) {
    mesMostrado = mes;
    $btnHoy.hidden = mes === mesDeHoy;
    $tiles.innerHTML = '<div class="cargando-bloque"><div class="spinner"></div><p>Actualizando período…</p></div>';
    try {
      const r = await api(`/admin/indicadores?mes=${mes}`);
      $titulo.textContent = formatPeriodoLabel(r.periodo.desde, r.periodo.hasta);
      pintarTiles($tiles, r);
      pintarAlertas(seccion.querySelector('#inicio-alertas'), r);
    } catch (e) {
      $tiles.innerHTML = `
        <div class="callout-aviso callout-aviso--error"><div class="callout-texto">${escapeHtml(e.message)}</div></div>
      `;
    }
  }

  $btnConsultar.addEventListener('click', () => {
    const { root, cerrar } = abrirModal(`
      <div class="modal-encabezado-icono">
        <div class="modal-icono-circulo modal-icono-circulo--indigo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </div>
        <div>
          <h3 style="margin: 0; font-size: 1.15rem;">Consultar otro período</h3>
          <p style="margin: 3px 0 0; font-size: 0.82rem; color: var(--tinta-2);">
            Visualiza métricas históricas de instalaciones y ventas por mes.
          </p>
        </div>
      </div>
      <form id="form-periodo" style="margin-top: 18px;">
        <label class="campo">
          <span>Seleccionar mes</span>
          <select name="mes" required class="input-select-moderno" style="width: 100%;">
            ${listaUltimosMeses(24).map((m) => `<option value="${m.valor}" ${m.valor === mesMostrado ? 'selected' : ''}>${escapeHtml(m.etiqueta)}</option>`).join('')}
          </select>
        </label>
        <div class="modal-acciones" style="margin-top: 20px;">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--primario">Ver estadísticas</button>
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

function etiquetaFecha(fechaStr) {
  if (!fechaStr) return { texto: 'Sin fecha agendada', tono: 'neutro' };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaStr + 'T00:00:00');
  const dias = Math.round((fecha - hoy) / 86400000);
  const fechaFmt = fecha.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (dias < 0) return { texto: `${fechaFmt} — vencida hace ${-dias} día${-dias === 1 ? '' : 's'}`, tono: 'malo' };
  if (dias === 0) return { texto: `${fechaFmt} — ¡Hoy!`, tono: 'alerta' };
  if (dias <= 3) return { texto: `${fechaFmt} — en ${dias} día${dias === 1 ? '' : 's'}`, tono: 'ok' };
  return { texto: fechaFmt, tono: 'neutro' };
}

function pintarVentasPendientes($div, ventas, onActualizar = null) {
  if (!ventas.length) {
    $div.innerHTML = `
      <div class="vacio-tarjeta" style="padding: 36px 20px;">
        <div class="vacio-icono">✨</div>
        <p class="vacio-titulo">No hay ventas esperando instalación</p>
        <p class="vacio-desc">Todas las suscripciones vendidas han sido instaladas con éxito en terreno.</p>
      </div>
    `;
    return;
  }
  $div.innerHTML = `
    <div class="tabla-envoltorio">
      <table class="tabla">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Dirección y Comuna</th>
            <th>Plan contratado</th>
            <th>Vendedor</th>
            <th style="text-align: right;">Fecha solicitada</th>
          </tr>
        </thead>
        <tbody>
          ${ventas.map((v) => {
            const { texto, tono } = etiquetaFecha(v.fecha_instalacion_solicitada);
            return `
              <tr class="fila-cliqueable" data-venta-id="${v.id}" title="Toca para ver quién vendió, cuándo y detalles de la orden">
                <td>
                  <strong class="fila-nombre" style="color: var(--acento-2);">${escapeHtml(v.cliente_nombre)}</strong>
                </td>
                <td>
                  <div style="font-size: 0.84rem;">
                    <div>${escapeHtml(v.cliente_direccion || '—')}</div>
                    <span style="color: var(--tinta-3); font-size: 0.78rem;">📍 ${escapeHtml(v.comuna || 'Sin comuna')}</span>
                  </div>
                </td>
                <td>
                  <span class="card-bloque-tag card-bloque-tag--indigo">${escapeHtml(v.plan_nombre)}</span>
                </td>
                <td>
                  <span class="usuario-pill">${escapeHtml(v.vendedor_nombre || 'TuVes (directo)')}</span>
                </td>
                <td style="text-align: right;">
                  <span class="chip chip--${tono}">${escapeHtml(texto)}</span>
                  <span style="color: var(--tinta-3); margin-left: 6px; font-weight: 800; font-size: 0.95rem;">→</span>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Abrir detalle al presionar cualquier fila de la lista
  $div.querySelectorAll('tr[data-venta-id]').forEach(($tr) => {
    $tr.addEventListener('click', () => {
      const id = Number($tr.dataset.ventaId);
      const venta = ventas.find(item => Number(item.id) === id);
      if (venta) {
        abrirModalDetalleVenta(venta, onActualizar);
      }
    });
  });
}

/**
 * Modal detallado que muestra quién vendió, cuándo se vendió y todos los
 * detalles de la orden técnica y equipos instalados en terreno.
 * Además permite reagendar la visita si el cliente no pudo o reprogramar para otro día.
 */
function abrirModalDetalleVenta(v, onActualizar) {
  const { texto: fechaTexto, tono: fechaTono } = etiquetaFecha(v.fecha_instalacion_solicitada);
  const inicial = (v.cliente_nombre || 'C').trim().charAt(0).toUpperCase();

  const { root, cerrar } = abrirModal(`
    <div class="modal-banner-cliente">
      <div class="modal-banner-cliente-info">
        <div class="modal-banner-avatar">${escapeHtml(inicial)}</div>
        <div>
          <div class="modal-banner-nombre">${escapeHtml(v.cliente_nombre)}</div>
          <div class="modal-banner-sub">
            RUT: <strong>${escapeHtml(v.cliente_rut || 'No informado')}</strong> · 📍 ${escapeHtml(v.comuna || 'Sin comuna')}
          </div>
        </div>
      </div>
      <div>
        ${v.cliente_telefono ? `
          <a href="tel:${escapeHtml(v.cliente_telefono)}" class="btn btn--chico btn--secundario" style="color: #0f766e; background: #fff; font-weight: 700; text-decoration: none; border: none; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
            📞 ${escapeHtml(v.cliente_telefono)}
          </a>
        ` : '<span style="font-size: 0.8rem; opacity: 0.8;">Sin teléfono</span>'}
      </div>
    </div>

    <div class="modal-detalle-grid">
      <!-- Tarjeta 1: Quién vendió y Cuándo se vendió (Comercial) -->
      <div class="detalle-bloque">
        <div class="detalle-bloque-titulo">
          <span>💼 Registro de Venta</span>
          <span class="card-bloque-tag card-bloque-tag--indigo">${escapeHtml(v.plan_nombre)}</span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Quién vendió:</span>
          <span class="detalle-campo-valor">
            <span class="usuario-pill" style="font-weight: 700;">${escapeHtml(v.vendedor_nombre || 'TuVes (Venta directa)')}</span>
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Cuándo se vendió:</span>
          <span class="detalle-campo-valor" style="color: var(--tinta);">
            ${formatDateTime(v.creado_en)}
          </span>
        </div>

        <div class="detalle-campo-fila" style="align-items: flex-start; padding-top: 8px;">
          <span class="detalle-campo-label" style="padding-top: 2px;">Fecha solicitada:</span>
          <span class="detalle-campo-valor" style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span id="modal-fecha-chip" class="chip chip--${fechaTono}">${escapeHtml(fechaTexto)}</span>
              <button type="button" class="btn btn--chico btn--secundario" id="btn-toggle-reagendar" style="font-size: 0.74rem; padding: 3px 8px; border-radius: 6px; border-color: var(--acento); color: var(--acento-2); font-weight: 700;" title="Reprogramar visita para otro día">
                📅 Reagendar
              </button>
            </div>
          </span>
        </div>

        <!-- Panel Desplegable para Reagendar la Visita -->
        <div id="caja-reagendar" style="display: none; background: #f0fdfa; border: 1.5px solid #0d9488; border-radius: 10px; padding: 12px; margin-top: 8px; margin-bottom: 8px; box-shadow: 0 4px 12px rgba(13, 148, 136, 0.1);">
          <div style="font-weight: 800; font-size: 0.84rem; color: #0f766e; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <span>📅 Reprogramar Visita en Terreno</span>
          </div>
          <label class="campo" style="margin-bottom: 8px;">
            <span style="font-size: 0.78rem; font-weight: 700; color: #0f766e;">Nueva fecha acordada con cliente:</span>
            <input type="date" id="input-nueva-fecha" value="${v.fecha_instalacion_solicitada || ''}" class="input-fecha-moderno" required style="width: 100%; font-size: 0.9rem; padding: 6px 10px;">
          </label>
          <label class="campo" style="margin-bottom: 10px;">
            <span style="font-size: 0.78rem; font-weight: 700; color: #0f766e;">Motivo de reagendamiento:</span>
            <input type="text" id="input-motivo-reagendar" value="${escapeHtml(v.observacion || '')}" placeholder="Ej: Cliente no estaba en casa, pide para el sábado..." style="width: 100%; font-size: 0.85rem; padding: 6px 10px; border: 1.5px solid var(--borde-fuerte); border-radius: 8px;">
          </label>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <button type="button" class="btn btn--chico btn--secundario" id="btn-cancelar-reagendar">Cancelar</button>
            <button type="button" class="btn btn--chico btn--primario" id="btn-confirmar-reagendar">Guardar nueva fecha</button>
          </div>
        </div>

        <div class="detalle-campo-fila" id="fila-observacion" ${v.observacion ? '' : 'style="display: none;"'}>
          <span class="detalle-campo-label">Nota de visita:</span>
          <span class="detalle-campo-valor" id="valor-observacion" style="color: #b45309; font-size: 0.82rem; max-width: 65%; line-height: 1.25; font-style: italic;">
            ${escapeHtml(v.observacion || '')}
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">N° Venta TuVes:</span>
          <span class="detalle-campo-valor" style="font-family: var(--fuente-mono, monospace);">
            ${escapeHtml(v.numero_venta_tuves || 'Sin N° registrado')}
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Dirección instalación:</span>
          <span class="detalle-campo-valor" style="max-width: 60%; line-height: 1.3;">
            ${escapeHtml(v.cliente_direccion || '—')}
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Comuna:</span>
          <span class="detalle-campo-valor">
            📍 ${escapeHtml(v.comuna || 'Sin comuna')}
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Comisión vendedor:</span>
          <span class="detalle-campo-valor">
            <span class="badge-monto badge-monto--positivo">${formatMoney(v.monto_vendedor || 0)}</span>
          </span>
        </div>
      </div>

      <!-- Tarjeta 2: Detalles de la Orden y Terreno -->
      <div class="detalle-bloque detalle-bloque--destacado">
        <div class="detalle-bloque-titulo">
          <span>🛠️ Trabajo en Terreno / Orden</span>
          <span id="modal-orden-estado-tag"><span class="chip chip--alerta">Consultando…</span></span>
        </div>

        <div id="modal-orden-contenido">
          <div class="cargando-bloque" style="padding: 24px 10px;">
            <div class="spinner"></div>
            <p style="font-size: 0.85rem;">Consultando detalles de orden…</p>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-acciones" style="margin-top: 18px; display: flex; justify-content: space-between; align-items: center;">
      <button type="button" class="btn btn--texto btn--chico" id="btn-anular-venta" style="color: var(--malo); font-size: 0.82rem;" title="Anular si el cliente desiste definitivamente">
        ✕ Anular esta venta
      </button>
      <button type="button" class="btn btn--primario" id="btn-cerrar-modal">Cerrar</button>
    </div>
  `, { amplio: true });

  root.querySelector('#btn-cerrar-modal').addEventListener('click', cerrar);

  // Toggle para caja de reagendamiento
  const $cajaReagendar = root.querySelector('#caja-reagendar');
  root.querySelector('#btn-toggle-reagendar').addEventListener('click', () => {
    const visible = $cajaReagendar.style.display !== 'none';
    $cajaReagendar.style.display = visible ? 'none' : 'block';
    if (!visible) {
      const $input = root.querySelector('#input-nueva-fecha');
      if ($input) $input.focus();
    }
  });
  root.querySelector('#btn-cancelar-reagendar').addEventListener('click', () => {
    $cajaReagendar.style.display = 'none';
  });

  // Guardar nueva fecha reagendada
  root.querySelector('#btn-confirmar-reagendar').addEventListener('click', async () => {
    const $btnConfirmar = root.querySelector('#btn-confirmar-reagendar');
    const nuevaFecha = root.querySelector('#input-nueva-fecha').value.trim();
    const motivo = root.querySelector('#input-motivo-reagendar').value.trim();

    if (!nuevaFecha) {
      toast('Debes seleccionar una nueva fecha para la visita.', 'alerta');
      return;
    }

    $btnConfirmar.disabled = true;
    $btnConfirmar.textContent = 'Guardando…';

    try {
      await api(`/admin/ventas/${v.id}/reagendar`, {
        method: 'PUT',
        body: {
          fecha_instalacion_solicitada: nuevaFecha,
          observacion: motivo,
        },
      });

      toast(`Visita reprogramada exitosamente para el ${nuevaFecha}.`, 'ok');
      v.fecha_instalacion_solicitada = nuevaFecha;
      v.observacion = motivo;

      const { texto: nTexto, tono: nTono } = etiquetaFecha(nuevaFecha);
      const $chip = root.querySelector('#modal-fecha-chip');
      if ($chip) {
        $chip.className = `chip chip--${nTono}`;
        $chip.textContent = nTexto;
      }

      const $filaObs = root.querySelector('#fila-observacion');
      const $valObs = root.querySelector('#valor-observacion');
      if ($filaObs && $valObs) {
        $valObs.textContent = motivo || '';
        $filaObs.style.display = motivo ? 'flex' : 'none';
      }

      $cajaReagendar.style.display = 'none';
      if (typeof onActualizar === 'function') onActualizar();
    } catch (err) {
      toast(err.message || 'Error al reprogramar visita.', 'malo');
    } finally {
      $btnConfirmar.disabled = false;
      $btnConfirmar.textContent = 'Guardar nueva fecha';
    }
  });

  // Anular venta si el cliente desiste
  root.querySelector('#btn-anular-venta').addEventListener('click', async () => {
    const motivo = prompt('¿Motivo por el cual se anula la venta? (ej: cliente desistió, fuera de cobertura, etc.):');
    if (motivo === null) return;
    try {
      await api(`/admin/ventas/${v.id}/anular`, {
        method: 'PUT',
        body: { motivo: motivo || 'Anulada por cliente' },
      });
      toast('Venta anulada correctamente.', 'ok');
      cerrar();
      if (typeof onActualizar === 'function') onActualizar();
    } catch (err) {
      toast(err.message || 'Error al anular venta.', 'malo');
    }
  });

  // Consulta asíncrona de los detalles técnicos completos
  api(`/admin/ventas/${v.id}`).then((detalle) => {
    const $estadoTag = root.querySelector('#modal-orden-estado-tag');
    const $ordenContenido = root.querySelector('#modal-orden-contenido');
    if (!$ordenContenido) return; // Modal cerrado

    const orden = detalle.orden;
    if (!orden) {
      if ($estadoTag) $estadoTag.innerHTML = '<span class="chip chip--neutro">Sin orden aún</span>';
      $ordenContenido.innerHTML = `
        <div class="aviso-orden-pendiente">
          <div class="aviso-orden-pendiente-icono">⏳</div>
          <div class="aviso-orden-pendiente-titulo">Pendiente de visita técnica en terreno</div>
          <div class="aviso-orden-pendiente-desc">
            Esta suscripción comercial fue registrada y está a la espera de que el técnico la tome desde su celular
            (<strong>Paso 1 del Wizard</strong>) para ejecutar la instalación domiciliaria y registrar números de serie.
          </div>
        </div>
      `;
      return;
    }

    // Si ya existe orden creada/en curso/aprobada:
    if ($estadoTag) $estadoTag.innerHTML = badge(orden.estado);

    const tieneMateriales = orden.materiales && orden.materiales.length > 0;
    const tieneFotos = orden.fotos && orden.fotos.length > 0;
    const tieneFerreteria = orden.ferreteria && orden.ferreteria.length > 0;

    $ordenContenido.innerHTML = `
      <div class="detalle-campo-fila">
        <span class="detalle-campo-label">Folio de orden:</span>
        <span class="detalle-campo-valor" style="font-weight: 800; font-family: var(--fuente-mono, monospace);">
          ${escapeHtml(orden.folio || 'Borrador sin folio')}
        </span>
      </div>

      <div class="detalle-campo-fila">
        <span class="detalle-campo-label">Técnico instalador:</span>
        <span class="detalle-campo-valor">
          <strong style="color: var(--acento-2);">${escapeHtml(orden.tecnico_nombre || 'No asignado')}</strong>
        </span>
      </div>

      <div class="detalle-campo-fila">
        <span class="detalle-campo-label">Fecha de trabajo:</span>
        <span class="detalle-campo-valor">
          ${formatDateTime(orden.fecha_trabajo_dispositivo || orden.creado_en)}
        </span>
      </div>

      <div class="detalle-campo-fila">
        <span class="detalle-campo-label">Monto técnico servicio:</span>
        <span class="detalle-campo-valor">
          <span class="badge-monto badge-monto--positivo">${formatMoney(orden.monto_tecnico || 0)}</span>
        </span>
      </div>

      ${tieneMateriales ? `
        <div style="margin-top: 12px;">
          <span class="detalle-campo-label" style="display: block; margin-bottom: 4px;">Equipos y Decodificadores:</span>
          <div class="lista-equipos-instalados">
            ${orden.materiales.map(m => `
              <div class="item-equipo-instalado">
                <div>
                  <strong>${escapeHtml(m.tipo_equipo_nombre || 'Decodificador')}</strong>
                  <div style="font-family: var(--fuente-mono, monospace); font-size: 0.76rem; color: var(--tinta-2);">
                    Serie: ${escapeHtml(m.numero_serie)}
                  </div>
                </div>
                <span class="chip chip--${m.accion === 'instalado' ? 'ok' : 'alerta'}" style="font-size: 0.72rem;">
                  ${escapeHtml(m.accion)}
                </span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${tieneFerreteria ? `
        <div style="margin-top: 10px;">
          <span class="detalle-campo-label" style="display: block; margin-bottom: 4px;">Ferretería / Insumos:</span>
          <div style="font-size: 0.8rem; color: var(--tinta-2); background: #fff; border: 1px solid var(--borde); border-radius: 8px; padding: 6px 10px;">
            ${orden.ferreteria.map(f => `${escapeHtml(f.item_nombre)}: <strong>${f.cantidad_final} ${escapeHtml(f.unidad_medida || 'un')}</strong>`).join(' · ')}
          </div>
        </div>
      ` : ''}

      ${tieneFotos ? `
        <div style="margin-top: 12px;">
          <span class="detalle-campo-label" style="display: block; margin-bottom: 4px;">Fotos de Terreno (${orden.fotos.length}):</span>
          <div class="galeria-fotos-orden">
            ${orden.fotos.map(f => `
              <a href="/api/fotos/${f.id}" target="_blank" rel="noopener" class="galeria-foto-card" title="Toca para ver en grande">
                <img src="/api/fotos/${f.id}" alt="${escapeHtml(f.tipo)}" loading="lazy">
                <span class="galeria-foto-etiqueta">${escapeHtml(f.tipo.replace(/_/g, ' '))}</span>
              </a>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }).catch((err) => {
    const $ordenContenido = root.querySelector('#modal-orden-contenido');
    if ($ordenContenido) {
      $ordenContenido.innerHTML = `
        <div class="callout-aviso callout-aviso--error" style="margin-top: 8px;">
          <div class="callout-texto">${escapeHtml(err.message || 'Error consultando orden')}</div>
        </div>
      `;
    }
  });
}

function pintarAlertas($div, r) {
  const items = [
    r.conflictos_abiertos > 0 && {
      texto: `${r.conflictos_abiertos} orden(es) en conflicto de folio sin resolver`,
      ruta: 'historial',
      tono: 'malo',
      tipo: 'Crítico',
    },
    r.traspasos_equipo_viejos > 0 && {
      texto: `${r.traspasos_equipo_viejos} traspaso(s) de equipo llevan 3+ días sin confirmar`,
      ruta: 'bodega',
      tono: 'malo',
      tipo: 'Urgente',
    },
    (r.traspasos_equipo_pendientes - r.traspasos_equipo_viejos) > 0 && {
      texto: `${r.traspasos_equipo_pendientes - r.traspasos_equipo_viejos} traspaso(s) de equipo esperando confirmación del técnico`,
      ruta: 'bodega',
      tono: 'neutro',
      tipo: 'Pendiente',
    },
    r.entregas_ferreteria_viejas > 0 && {
      texto: `${r.entregas_ferreteria_viejas} entrega(s) de ferretería llevan 3+ días sin confirmar`,
      ruta: 'bodega',
      tono: 'malo',
      tipo: 'Urgente',
    },
    r.ferreteria_pendiente_confirmar > 0 && {
      texto: `${r.ferreteria_pendiente_confirmar} entrega(s) de ferretería esperando confirmación`,
      ruta: 'bodega',
      tono: 'alerta',
      tipo: 'Atención',
    },
  ].filter(Boolean);

  if (!items.length) {
    $div.innerHTML = `
      <div class="alerta-estado-vacio">
        <div class="alerta-estado-icono-ok">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div class="alerta-estado-info">
          <strong>Todo al día y operativo</strong>
          <p>No hay traspasos vencidos, entregas demoradas ni órdenes en conflicto de folio.</p>
        </div>
      </div>
    `;
    return;
  }

  $div.innerHTML = `
    <div class="alertas-lista">
      ${items.map((i) => `
        <a href="#${i.ruta}" class="alerta-fila alerta-fila--${i.tono}">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="chip chip--${i.tono}">${i.tipo}</span>
            <span>${escapeHtml(i.texto)}</span>
          </div>
          <span style="font-weight: 700; font-size: 0.95rem;">Ir a gestionar →</span>
        </a>
      `).join('')}
    </div>
  `;
}

function pintarTiles($div, r) {
  $div.innerHTML = `
    <div class="informes-kpi-grid" style="margin-bottom: 0;">
      <div class="informes-kpi-card informes-kpi-card--ordenes">
        <div class="informes-kpi-cabecera">
          <span class="informes-kpi-etiqueta">Instalaciones Este Mes</span>
          <div class="informes-kpi-icono informes-kpi-icono--verde">🛠️</div>
        </div>
        <div class="informes-kpi-numero">${r.instalaciones_mes.n}</div>
        <div class="informes-kpi-bajada">
          <span>Órdenes completadas</span>
          <span class="informes-kpi-monto-resaltado">${formatMoney(r.instalaciones_mes.monto)}</span>
        </div>
      </div>

      <div class="informes-kpi-card informes-kpi-card--ventas">
        <div class="informes-kpi-cabecera">
          <span class="informes-kpi-etiqueta">Ventas Este Mes</span>
          <div class="informes-kpi-icono informes-kpi-icono--azul">💼</div>
        </div>
        <div class="informes-kpi-numero">${r.ventas_mes.n}</div>
        <div class="informes-kpi-bajada">
          <span>Suscripciones nuevas</span>
          <span class="informes-kpi-monto-resaltado">${formatMoney(r.ventas_mes.monto)}</span>
        </div>
      </div>

      <div class="informes-kpi-card informes-kpi-card--actividad">
        <div class="informes-kpi-cabecera">
          <span class="informes-kpi-etiqueta">Ventas Por Instalar</span>
          <div class="informes-kpi-icono informes-kpi-icono--morado">⏳</div>
        </div>
        <div class="informes-kpi-numero">${r.ventas_por_instalar}</div>
        <div class="informes-kpi-bajada">
          <span>Cola pendiente en terreno</span>
          <span class="card-bloque-tag card-bloque-tag--amber">Por agendar</span>
        </div>
      </div>

      <a href="#billetera" class="informes-kpi-card informes-kpi-card--destacado" style="text-decoration: none;">
        <div class="informes-kpi-cabecera">
          <span class="informes-kpi-etiqueta">Total del Mes</span>
          <div class="informes-kpi-icono informes-kpi-icono--destacado">💰</div>
        </div>
        <div class="informes-kpi-numero">${formatMoney(r.total_mes)}</div>
        <div class="informes-kpi-bajada">
          <span>Facturación consolidada</span>
          <span style="color: #34D399; font-weight: 700;">Ver billetera →</span>
        </div>
      </a>
    </div>
  `;
}
