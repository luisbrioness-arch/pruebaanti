import { api } from '../api.js';
import { el, escapeHtml, formatMoney, formatDateTime, badge, botonCopiarHtml } from '../utils.js';
import { abrirModal } from '../modal.js';
import { toast } from '../toast.js';
import { abrirModalDetalleVenta, etiquetaFecha } from '../modal-detalle.js';

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

function formatMesNombre(mesStr) {
  const [y, m] = mesStr.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const mesTexto = d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  return mesTexto.charAt(0).toUpperCase() + mesTexto.slice(1);
}

function desplazarMes(mesStr, delta) {
  const [y, m] = mesStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function listaOpcionesMeses(centroMesStr, pastCount = 24, futureCount = 3) {
  const [cy, cm] = (centroMesStr || mesActualStr()).split('-').map(Number);
  const meses = [];
  for (let i = futureCount; i >= -pastCount; i--) {
    const d = new Date(cy, cm - 1 + i, 1);
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
          <div class="periodo-barra-accion">
            <div class="periodo-nav-card" id="periodo-nav-card">
              <button type="button" class="btn-periodo-nav" id="periodo-ant" title="Ir al mes anterior">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>
              
              <div class="periodo-select-wrapper" title="Clic para seleccionar otro mes">
                <div class="periodo-info-principal">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="periodo-icono-cal">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  <span id="periodo-label-mes" class="periodo-label-mes">Cargando…</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="periodo-icono-flecha"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                <select id="select-periodo-mes" class="periodo-select-invisible" title="Seleccionar otro mes"></select>
              </div>

              <button type="button" class="btn-periodo-nav" id="periodo-sig" title="Ir al mes siguiente">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </div>

            <button type="button" class="btn-periodo-hoy es-actual" id="periodo-hoy" title="Estás viendo las métricas del mes en curso">
              <span class="punto-actual-dot">●</span>
              <span>Mes actual</span>
            </button>
          </div>

          <div class="periodo-barra-inferior">
            <span id="periodo-rango-subtexto" class="periodo-rango-badge">Cargando rango…</span>
          </div>
        </div>
      </div>

      <!-- Sección 1: Métricas Clave del Período -->
      <div id="inicio-tiles" style="margin-bottom: 30px; min-height: 120px;">
        <div class="cargando-bloque" style="min-height: 120px; display: flex; align-items: center; justify-content: center; flex-direction: column;"><div class="spinner"></div><p style="margin-top: 8px;">Cargando métricas del período…</p></div>
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

  const $labelMes = seccion.querySelector('#periodo-label-mes');
  const $selectMes = seccion.querySelector('#select-periodo-mes');
  const $rangoSubtexto = seccion.querySelector('#periodo-rango-subtexto');
  const $btnAnt = seccion.querySelector('#periodo-ant');
  const $btnSig = seccion.querySelector('#periodo-sig');
  const $btnHoy = seccion.querySelector('#periodo-hoy');
  const $navCard = seccion.querySelector('#periodo-nav-card');
  const $tiles = seccion.querySelector('#inicio-tiles');
  const mesDeHoy = mesActualStr();
  let mesMostrado = mesDeHoy;
  let primerCargaPeriodo = true;

  function actualizarOpcionesSelect(seleccionado) {
    const opciones = listaOpcionesMeses(mesDeHoy, 24, 3);
    $selectMes.innerHTML = opciones.map((m) => `
      <option value="${m.valor}" ${m.valor === seleccionado ? 'selected' : ''}>
        ${escapeHtml(m.etiqueta)}${m.valor === mesDeHoy ? ' (Mes actual)' : ''}
      </option>
    `).join('');
  }

  async function cargarPeriodo(mes) {
    mesMostrado = mes;
    const esActual = (mes === mesDeHoy);

    $labelMes.textContent = formatMesNombre(mes);
    actualizarOpcionesSelect(mes);

    if (esActual) {
      $btnHoy.className = 'btn-periodo-hoy es-actual';
      $btnHoy.innerHTML = `
        <span class="punto-actual-dot">●</span>
        <span>Mes actual</span>
      `;
      $btnHoy.title = 'Estás viendo las métricas del mes en curso';
    } else {
      $btnHoy.className = 'btn-periodo-hoy es-distinto';
      $btnHoy.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg>
        <span>Volver a mes actual</span>
      `;
      $btnHoy.title = 'Clic para volver a las métricas del mes actual';
    }

    if (!primerCargaPeriodo) {
      if ($navCard) $navCard.classList.add('periodo-cargando');
      $tiles.classList.add('cargando-suave');
    }

    try {
      const r = await api(`/admin/indicadores?mes=${mes}`);
      const d1 = new Date(r.periodo.desde + 'T00:00:00');
      const d2 = new Date(r.periodo.hasta + 'T00:00:00');
      const mesTexto = d1.toLocaleDateString('es-CL', { month: 'long' });
      $rangoSubtexto.textContent = `Período: ${d1.getDate()} al ${d2.getDate()} de ${mesTexto} ${d1.getFullYear()}`;
      pintarTiles($tiles, r);
      pintarAlertas(seccion.querySelector('#inicio-alertas'), r);
    } catch (e) {
      if (primerCargaPeriodo) {
        $tiles.innerHTML = `
          <div class="callout-aviso callout-aviso--error"><div class="callout-texto">${escapeHtml(e.message)}</div></div>
        `;
      } else {
        toast(`Error al cargar datos del período: ${e.message}`, 'error');
      }
    } finally {
      primerCargaPeriodo = false;
      if ($navCard) $navCard.classList.remove('periodo-cargando');
      $tiles.classList.remove('cargando-suave');
    }
  }

  $selectMes.addEventListener('change', (ev) => {
    cargarPeriodo(ev.target.value);
  });

  $btnAnt.addEventListener('click', (ev) => {
    ev.preventDefault();
    cargarPeriodo(desplazarMes(mesMostrado, -1));
  });

  $btnSig.addEventListener('click', (ev) => {
    ev.preventDefault();
    cargarPeriodo(desplazarMes(mesMostrado, 1));
  });

  $btnHoy.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (mesMostrado !== mesDeHoy) {
      cargarPeriodo(mesDeHoy);
    }
  });

  await cargarPeriodo(mesDeHoy);
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
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
      <div style="position: relative; flex: 1; max-width: 380px;">
        <input type="search" id="filtro-ventas-pendientes" placeholder="🔍 Buscar por cliente, comuna, plan o N°..." class="input" style="width: 100%; padding: 7px 12px; font-size: 0.85rem; border-radius: 8px; border: 1.5px solid var(--borde-fuerte, #cbd5e1); background: var(--blanco, #ffffff);">
      </div>
      <span class="campo-ayuda" id="contador-ventas-pendientes" style="font-weight: 600; color: var(--tinta-2); font-size: 0.82rem;">
        Mostrando ${ventas.length} de ${ventas.length} ${ventas.length === 1 ? 'venta' : 'ventas'}
      </span>
    </div>
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
        <tbody id="tbody-ventas-pendientes">
          ${renderFilasVentas(ventas)}
        </tbody>
      </table>
      <div id="vacio-ventas-filtro" class="vacio-tarjeta" style="display: none; padding: 28px 16px;">
        <p class="vacio-titulo" style="font-size: 0.95rem;">Sin coincidencias para la búsqueda</p>
        <p class="vacio-desc" style="font-size: 0.82rem;">Intenta con otro término o limpia el buscador para ver todas las ventas.</p>
      </div>
    </div>
  `;

  function renderFilasVentas(lista) {
    return lista.map((v) => {
      const { texto, tono } = etiquetaFecha(v.fecha_instalacion_solicitada);
      return `
        <tr class="fila-cliqueable" data-venta-id="${v.id}" title="Toca para ver quién vendió, cuándo y detalles de la orden">
          <td>
            <strong class="fila-nombre" style="color: var(--acento-2);">${escapeHtml(v.cliente_nombre)}</strong>
            ${v.cliente_rut ? `<div style="font-size: 0.76rem; color: var(--tinta-3); margin-top: 2px;">RUT: ${escapeHtml(v.cliente_rut)}${botonCopiarHtml(v.cliente_rut, 'Copiar RUT')}</div>` : ''}
          </td>
          <td>
            <div style="font-size: 0.84rem;">
              <div>${escapeHtml(v.cliente_direccion || '—')}</div>
              <span style="color: var(--tinta-3); font-size: 0.78rem;">📍 ${escapeHtml(v.comuna || 'Sin comuna')}</span>
            </div>
          </td>
          <td>
            <span class="card-bloque-tag card-bloque-tag--indigo">${escapeHtml(v.plan_nombre)}</span>
            ${v.numero_venta_tuves ? `<div style="font-size: 0.76rem; color: var(--tinta-3); margin-top: 3px; font-family: var(--fuente-mono, monospace);">TuVes: #${escapeHtml(v.numero_venta_tuves)}${botonCopiarHtml(v.numero_venta_tuves, 'Copiar N° TuVes')}</div>` : ''}
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
    }).join('');
  }

  function enlazarFilas() {
    $div.querySelectorAll('#tbody-ventas-pendientes tr[data-venta-id]').forEach(($tr) => {
      $tr.addEventListener('click', () => {
        const id = Number($tr.dataset.ventaId);
        const venta = ventas.find(item => Number(item.id) === id);
        if (venta) {
          abrirModalDetalleVenta(venta, onActualizar);
        }
      });
    });
  }
  enlazarFilas();

  // Buscador en vivo
  const $inputFiltro = $div.querySelector('#filtro-ventas-pendientes');
  const $tbody = $div.querySelector('#tbody-ventas-pendientes');
  const $contador = $div.querySelector('#contador-ventas-pendientes');
  const $vacioFiltro = $div.querySelector('#vacio-ventas-filtro');

  $inputFiltro.addEventListener('input', (ev) => {
    const q = ev.target.value.trim().toLowerCase();
    if (!q) {
      $tbody.innerHTML = renderFilasVentas(ventas);
      $tbody.style.display = '';
      $vacioFiltro.style.display = 'none';
      $contador.textContent = `Mostrando ${ventas.length} de ${ventas.length} ${ventas.length === 1 ? 'venta' : 'ventas'}`;
      enlazarFilas();
      return;
    }

    const filtradas = ventas.filter((v) => {
      const match = [
        v.cliente_nombre,
        v.cliente_direccion,
        v.comuna,
        v.plan_nombre,
        v.vendedor_nombre,
        v.cliente_rut,
        v.numero_venta_tuves,
        v.numero_orden_tuves,
      ].some((campo) => campo && String(campo).toLowerCase().includes(q));
      return match;
    });

    if (filtradas.length) {
      $tbody.innerHTML = renderFilasVentas(filtradas);
      $tbody.style.display = '';
      $vacioFiltro.style.display = 'none';
      $contador.textContent = `Mostrando ${filtradas.length} de ${ventas.length}`;
      enlazarFilas();
    } else {
      $tbody.innerHTML = '';
      $tbody.style.display = 'none';
      $vacioFiltro.style.display = 'block';
      $contador.textContent = `0 resultados para "${q}"`;
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
          <span class="informes-kpi-etiqueta">Instalaciones del Mes</span>
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
          <span class="informes-kpi-etiqueta">Ventas del Mes</span>
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
          <span class="informes-kpi-etiqueta">Facturación del Mes</span>
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
