import { api } from '../api.js';
import { toast } from '../toast.js';
import { conColaSiHaceFalta } from '../offline.js';
import { badge, escapeHtml, el, formatDateTime, MOVIMIENTO_EQUIPO_LABEL, debounce } from '../utils.js';
import { abrirScanner } from '../scanner.js';
import { abrirModal } from '../modal.js';

/** Días corridos desde una fecha del servidor (formato "YYYY-MM-DD HH:mm:ss") — para los avisos de "esto lleva mucho esperando" (mejora 3). */
function diasDesde(fechaServidor) {
  const ms = Date.now() - new Date(String(fechaServidor).replace(' ', 'T')).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
const DIAS_AVISO_PENDIENTE = 3;

// Pedido: "se ve mal, que todas las opciones de perdido falla de fabrica
// o devuelto a tuvez esten en un boton solo como algo parecido a
// acciones" — antes eran 2-3 botones sueltos por fila (con formularios
// mezclados si además tenía "Cancelar envío" u "Asignar a técnicos"),
// ahora un solo "Acciones ▾" que despliega la lista. Un único listener en
// document (registrado acá, no por fila) cierra cualquier menú abierto al
// hacer clic afuera — así no se acumulan listeners cada vez que se
// recarga la tabla.
document.addEventListener('click', () => {
  document.querySelectorAll('.menu-acciones-lista:not([hidden])').forEach((l) => { l.hidden = true; });
});

/** @param {{texto: string, clase?: string, onClick: () => void}[]} items */
function crearMenuAcciones(items) {
  const wrapper = el(`
    <div class="menu-acciones">
      <button type="button" class="btn btn--secundario btn--chico" data-menu-toggle>Acciones ▾</button>
      <ul class="menu-acciones-lista" hidden></ul>
    </div>
  `);
  const $lista = wrapper.querySelector('.menu-acciones-lista');
  items.forEach((it, i) => {
    const li = el(`<li><button type="button" class="${it.clase || ''}">${escapeHtml(it.texto)}</button></li>`);
    li.querySelector('button').addEventListener('click', () => {
      $lista.hidden = true;
      it.onClick();
    });
    $lista.appendChild(li);
  });
  wrapper.querySelector('[data-menu-toggle]').addEventListener('click', (ev) => {
    ev.stopPropagation();
    document.querySelectorAll('.menu-acciones-lista:not([hidden])').forEach((l) => { if (l !== $lista) l.hidden = true; });
    $lista.hidden = !$lista.hidden;
  });
  return wrapper;
}

/** Tabla de línea de tiempo compartida por "Buscar por serie" y el botón "Rastreo". */
function filaHistorialHtml(movimientos) {
  if (!movimientos.length) return '<p class="vacio">Sin movimientos registrados.</p>';
  return `
    <table class="tabla">
      <thead><tr><th>Fecha</th><th>Movimiento</th><th>De</th><th>A</th><th>Orden</th><th>Observación</th></tr></thead>
      <tbody>
        ${movimientos.map((m) => `
          <tr>
            <td>${formatDateTime(m.creado_en)}</td>
            <td>${escapeHtml(MOVIMIENTO_EQUIPO_LABEL[m.tipo_movimiento] || m.tipo_movimiento)}</td>
            <td>${escapeHtml(m.origen_nombre || '—')}</td>
            <td>${escapeHtml(m.destino_nombre || '—')}</td>
            <td>${escapeHtml(m.orden_folio || '—')}</td>
            <td>${escapeHtml(m.observacion || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Botón "Rastreo" (pedido: "que en el caso de un equipo instalado se pueda
 * realizar seguimiento o se pueda ver donde fue instalado") — reutiliza el
 * mismo /admin/equipos/{id}/historial que ya usa "Buscar por serie", pero
 * en un modal y con un resumen arriba de la tabla: quién lo instaló, cuándo,
 * en qué orden, y el cliente/dirección/GPS de esa orden cuando existen
 * (vienen de la venta enlazada — una orden sin venta propia no tiene cliente
 * registrado en el sistema, solo el GPS que haya tomado el técnico).
 */
async function abrirRastreoEquipo(equipoId, numeroSerie) {
  const { root, cerrar } = abrirModal(`
    <h3>Rastreo de ${escapeHtml(numeroSerie)}</h3>
    <div id="rastreo-resumen"><p class="vacio">Cargando…</p></div>
    <div class="modal-acciones">
      <button type="button" class="btn btn--secundario" id="btn-cerrar-rastreo">Cerrar</button>
    </div>
  `);
  root.querySelector('#btn-cerrar-rastreo').addEventListener('click', cerrar);
  try {
    const { movimientos } = await api(`/admin/equipos/${equipoId}/historial`);
    const instalacion = movimientos.find((m) => m.tipo_movimiento === 'instalacion');
    const resumenHtml = instalacion ? `
      <div class="modal-explicacion" style="margin-bottom: 14px;">
        <p><strong>Instalado por:</strong> ${escapeHtml(instalacion.destino_nombre || instalacion.origen_nombre || '—')}</p>
        <p><strong>Fecha:</strong> ${formatDateTime(instalacion.creado_en)}</p>
        <p><strong>Orden:</strong> ${escapeHtml(instalacion.orden_folio || '—')}</p>
        ${instalacion.orden_cliente_nombre ? `<p><strong>Cliente:</strong> ${escapeHtml(instalacion.orden_cliente_nombre)}</p>` : ''}
        ${instalacion.orden_cliente_direccion ? `<p><strong>Dirección:</strong> ${escapeHtml(instalacion.orden_cliente_direccion)}</p>` : ''}
        ${instalacion.orden_cliente_telefono ? `<p><strong>Teléfono:</strong> ${escapeHtml(instalacion.orden_cliente_telefono)}</p>` : ''}
        ${instalacion.orden_latitud && instalacion.orden_longitud ? `<p><a href="https://www.google.com/maps?q=${instalacion.orden_latitud},${instalacion.orden_longitud}" target="_blank" rel="noopener">📍 Ver ubicación GPS en el mapa</a></p>` : ''}
      </div>
    ` : '<p class="vacio">Este equipo todavía no registra una instalación.</p>';
    root.querySelector('#rastreo-resumen').innerHTML = `
      ${resumenHtml}
      <h4>Historial completo</h4>
      <div class="tabla-envoltorio">${filaHistorialHtml(movimientos)}</div>
    `;
  } catch (e) {
    root.querySelector('#rastreo-resumen').innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
  }
}

/**
 * Reorganización de menús (pedido: "mejora estos menus que sean mas
 * intuitivos y que arriba solo sea bodega - bodega tecnicos", después
 * ajustado a "que dentro de bodega existan 2 submenu uno de bodega
 * principal y otro bodega tecnicos" — un solo ítem de nav arriba, con dos
 * submenús adentro en vez de dos ítems de nav separados):
 *  - "Bodega" (nav de arriba) tiene ahora 2 submenús: "Bodega principal"
 *    (todo lo que había) y "Bodega técnicos" (antes la pestaña "Bodegas de
 *    técnicos", después probado como su propio ítem de nav — quedó acá).
 *  - Dentro de "Bodega principal", 6 pestañas: Equipos (ahora solo
 *    inventario: ver/filtrar/alta/falla de fábrica) · Asignar a técnicos
 *    (nueva — el "Enviar"/"Traspasar" que vivía embebido en cada fila de
 *    Equipos, más la selección masiva) · Ferretería · Catálogo (nueva —
 *    crear tipos de equipo/ítems de ferretería nuevos, antes exigía tocar
 *    la base a mano) · Buscar por serie · Ubicaciones (antes "Bodegas",
 *    renombrada para no confundir con "Bodega" del nav de arriba).
 *  - "Kits estándar" desapareció del todo (pedido separado: "eliminar el
 *    kit standar de todo el proyecto que no exista" — el wizard ya no lo
 *    usa desde antes, ver docs/wizard-api.md).
 */
function iconForTipo(codigo = '') {
  const c = String(codigo).toLowerCase();
  if (c.includes('deco')) return '📡';
  if (c.includes('tarjeta') || c.includes('card') || c.includes('smart')) return '💳';
  if (c.includes('lnb')) return '🛰️';
  if (c.includes('control')) return '📱';
  if (c.includes('antena') || c.includes('plato')) return '🌐';
  if (c.includes('cable')) return '🔌';
  return '📦';
}

export async function renderBodega(container, params = {}) {
  container.appendChild(el(`
    <section class="bodega">
      <nav class="subtabs subtabs--nivel1">
        <button type="button" class="subtab subtab--activo" data-vista="principal">🏢 Bodega principal</button>
        <button type="button" class="subtab" data-vista="tecnicos">🧰 Bodega técnicos</button>
      </nav>
      <div id="bodega-nivel2"><p class="vacio">Cargando…</p></div>
    </section>
  `));

  const $nivel2 = container.querySelector('#bodega-nivel2');
  const $vistas = Array.from(container.querySelectorAll('.subtabs--nivel1 .subtab'));

  // Catálogos compartidos por todas las pestañas — se piden una sola vez.
  let [{ usuarios }, { tipos_equipo: tiposEquipo }, { items }, { bodegas }] = await Promise.all([
    api('/admin/usuarios'),
    api('/admin/catalogo/tipos-equipo'),
    api('/admin/catalogo/items-ferreteria'),
    api('/admin/bodegas'),
  ]);
  // Pedido: "edwin tambien es un tecnico que recibe los equipos de bodega
  // central" — el selector de "Bodega técnicos" no puede filtrar por
  // rol==='tecnico', porque un admin (Edwin) puede perfectamente tener
  // equipos en su propia maleta igual que cualquiera. Mismo criterio que
  // ya usa opcionesUsuarios() para asignar/traspasar: cualquier usuario
  // activo puede terminar con equipos encima, sea cual sea su rol.
  const tecnicos = () => usuarios;

  function opcionesUsuarios(seleccionado, excluirId) {
    return usuarios
      .filter((u) => String(u.id) !== String(excluirId ?? ''))
      .map((u) => `<option value="${u.id}" ${String(u.id) === String(seleccionado) ? 'selected' : ''}>${escapeHtml(u.nombre)}</option>`)
      .join('');
  }

  function opcionesBodegas(seleccionado) {
    return bodegas
      .map((b) => `<option value="${b.id}" ${String(b.id) === String(seleccionado) ? 'selected' : ''}>${escapeHtml(b.nombre)}</option>`)
      .join('');
  }

  // ------------------------------------------------------- Nivel 1: vista --
  async function activarVista(vista) {
    $vistas.forEach((v) => v.classList.toggle('subtab--activo', v.dataset.vista === vista));
    $nivel2.innerHTML = '<p class="vacio">Cargando…</p>';
    if (vista === 'tecnicos') await renderVistaTecnicos();
    else await renderVistaPrincipal();
  }
  $vistas.forEach((v) => v.addEventListener('click', () => activarVista(v.dataset.vista)));

  // --------------------------------------------- "Bodega técnicos" (submenú) --
  // Pestañas de técnicos con avatar, carga automática inicial y tarjetas estructuradas
  async function renderVistaTecnicos() {
    const lista = tecnicos();
    if (!lista || !lista.length) {
      $nivel2.innerHTML = '<p class="vacio">No hay técnicos registrados en el sistema.</p>';
      return;
    }
    $nivel2.innerHTML = `
      <div class="subtabs-contenedor-tecnicos" style="margin-top: 14px;">
        <div class="subtabs-etiqueta-tecnicos">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span>Técnico:</span>
        </div>
        <nav class="subtabs subtabs--tecnicos">
          ${lista.map((t) => {
            const inicial = (t.nombre || 'T').trim().charAt(0).toUpperCase();
            return `
              <button type="button" class="subtab" data-tecnico-id="${t.id}">
                <span class="subtab-avatar">${escapeHtml(inicial)}</span>
                <span>${escapeHtml(t.nombre)}</span>
              </button>
            `;
          }).join('')}
        </nav>
      </div>
      <div id="contenido-tecnico"></div>
    `;
    const $botones = Array.from($nivel2.querySelectorAll('.subtabs--tecnicos .subtab'));
    $botones.forEach((btn) => {
      btn.addEventListener('click', () => {
        $botones.forEach((b) => b.classList.toggle('subtab--activo', b === btn));
        cargarBodegaTecnico(Number(btn.dataset.tecnicoId));
      });
    });

    // Auto-seleccionar el técnico solicitado en la URL o el primero de la lista para que nunca quede en blanco
    const tecnicoBuscado = params.tecnicoId ? $botones.find(b => b.dataset.tecnicoId === String(params.tecnicoId)) : null;
    const $botonInicial = tecnicoBuscado || $botones[0];
    if ($botonInicial) {
      $botonInicial.click();
    }
  }

  async function cargarBodegaTecnico(tecnicoId) {
    const $div = $nivel2.querySelector('#contenido-tecnico');
    $div.innerHTML = '<div class="cargando-bloque"><div class="spinner"></div><p>Cargando inventario del técnico…</p></div>';
    try {
      const [{ equipos: equiposTecnico }, { stock }] = await Promise.all([
        api(`/admin/equipos?estado=maleta&tecnico_id=${tecnicoId}`),
        api(`/admin/ferreteria/stock?tecnico_id=${tecnicoId}`),
      ]);
      $div.innerHTML = `
        <div style="display: flex; justify-content: flex-end; margin-bottom: 14px;">
          <a href="#guia?tecnicoId=${tecnicoId}" class="btn btn--secundario btn--chico btn-con-icono">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <span>Ver guía de despacho pendiente</span>
          </a>
        </div>

        <section class="card-bloque" style="margin-bottom: 20px;">
          <div class="card-bloque-cabecera">
            <div class="card-bloque-titular">
              <span class="card-bloque-tag card-bloque-tag--indigo">Maleta técnica</span>
              <h3>Equipos en su maleta</h3>
              <p class="card-bloque-bajada">Decodificadores y equipos en poder de este instalador.</p>
            </div>
            <span class="badge-monto badge-monto--mudo">${equiposTecnico.length} equipo${equiposTecnico.length === 1 ? '' : 's'}</span>
          </div>
          <div class="card-bloque-body">
            ${equiposTecnico.length ? `
              <div class="tabla-envoltorio">
                <table class="tabla">
                  <thead><tr><th>N° Serie</th><th>Tipo de Equipo</th></tr></thead>
                  <tbody>${equiposTecnico.map((e) => `<tr><td class="celda-mono"><strong>${escapeHtml(e.numero_serie)}</strong></td><td>${escapeHtml(e.tipo_equipo_nombre)}</td></tr>`).join('')}</tbody>
                </table>
              </div>
            ` : `
              <div class="vacio-tarjeta">
                <div class="vacio-icono">📦</div>
                <p class="vacio-titulo">No tiene equipos en su maleta</p>
                <p class="vacio-desc">Todos los equipos asignados han sido instalados o devueltos a bodega central.</p>
              </div>
            `}
          </div>
        </section>

        <section class="card-bloque">
          <div class="card-bloque-cabecera">
            <div class="card-bloque-titular">
              <span class="card-bloque-tag card-bloque-tag--amber">Materiales</span>
              <h3>Ferretería confirmada</h3>
              <p class="card-bloque-bajada">Stock físico confirmado por el instalador para órdenes de trabajo.</p>
            </div>
            <span class="badge-monto badge-monto--mudo">${stock.length} ítem${stock.length === 1 ? '' : 's'}</span>
          </div>
          <div class="card-bloque-body">
            ${stock.length ? `
              <div class="tabla-envoltorio">
                <table class="tabla">
                  <thead><tr><th>Ítem</th><th>Cantidad disponible</th></tr></thead>
                  <tbody>${stock.map((s) => `<tr><td><strong>${escapeHtml(s.item_nombre)}</strong></td><td class="${Number(s.cantidad_actual) < 0 ? 'celda-negativa' : ''}"><strong>${s.cantidad_actual}</strong> <span style="color: var(--tinta-3); font-size: 0.85em;">${escapeHtml(s.unidad_medida)}</span></td></tr>`).join('')}</tbody>
                </table>
              </div>
            ` : `
              <div class="vacio-tarjeta">
                <div class="vacio-icono">🧰</div>
                <p class="vacio-titulo">Sin ferretería confirmada</p>
                <p class="vacio-desc">El técnico no registra stock de ferretería en su custodia.</p>
              </div>
            `}
          </div>
        </section>
      `;
    } catch (e) {
      $div.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  // --------------------------------------------- "Bodega principal" (submenú) --
  let $contenido, $tabs;

  async function renderVistaPrincipal() {
    $nivel2.innerHTML = `
      <nav class="subtabs">
        <button type="button" class="subtab subtab--activo" data-tab="equipos">📦 Equipos</button>
        <button type="button" class="subtab" data-tab="asignar">🚚 Asignar a técnicos</button>
        <button type="button" class="subtab" data-tab="ferreteria">🔩 Ferretería</button>
        <button type="button" class="subtab" data-tab="catalogo">🏷️ Catálogo</button>
        <button type="button" class="subtab" data-tab="buscar">🔍 Buscar por serie</button>
        <button type="button" class="subtab" data-tab="ubicaciones">🏢 Ubicaciones</button>
      </nav>
      <div id="bodega-contenido"><p class="vacio">Cargando…</p></div>
    `;
    $contenido = $nivel2.querySelector('#bodega-contenido');
    $tabs = Array.from($nivel2.querySelectorAll('.subtabs:not(.subtabs--nivel1) .subtab'));
    $tabs.forEach((t) => t.addEventListener('click', () => activarTab(t.dataset.tab)));

    const tabInicial = params.tab;
    await activarTab(tabInicial && $tabs.some((t) => t.dataset.tab === tabInicial) ? tabInicial : 'equipos');
  }

  async function activarTab(nombre) {
    $tabs.forEach((t) => t.classList.toggle('subtab--activo', t.dataset.tab === nombre));
    $contenido.innerHTML = '<p class="vacio">Cargando…</p>';
    if (nombre === 'equipos') await renderEquipos();
    else if (nombre === 'asignar') await renderAsignar();
    else if (nombre === 'ferreteria') await renderFerreteria();
    else if (nombre === 'catalogo') await renderCatalogo();
    else if (nombre === 'buscar') await renderBuscar();
    else await renderUbicaciones();
  }

  // ------------------------------------------------------------- Equipos --
  async function renderEquipos() {
    $contenido.innerHTML = `
      <div class="card-bloque card-bloque--recepcion" style="margin-bottom: 24px;">
        <div class="card-bloque-cabecera">
          <div class="card-bloque-titular">
            <span class="card-bloque-tag card-bloque-tag--teal">Recepción TuVes</span>
            <h3>Ingreso de Equipos a Bodega</h3>
            <p class="card-bloque-bajada">Da de alta rápidamente los equipos que te entrega TuVes por unidad o en lote.</p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="btn btn--primario btn--chico btn-con-icono" id="btn-alta-masiva">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
              <span>+ Cargar Lote TuVes</span>
            </button>
            <button type="button" class="btn btn--secundario btn--chico btn-con-icono" id="btn-ir-catalogo-equipos" title="Agregar nuevos tipos de equipo al catálogo">
              <span>⚙ Catálogo</span>
            </button>
          </div>
        </div>

        <!-- Botones de acceso rápido por tipo de equipo TuVes -->
        <div class="tuves-botones-rapidos">
          <span class="tuves-botones-label">Botones directos por tipo de equipo TuVes:</span>
          <div class="tuves-botones-grid">
            ${tiposEquipo.map((t) => `
              <button type="button" class="btn-equipo-tuves" data-tipo-codigo="${t.codigo}" data-tipo-nombre="${escapeHtml(t.nombre)}" title="Ingresar ${escapeHtml(t.nombre)}">
                <span class="btn-equipo-icon">${iconForTipo(t.codigo)}</span>
                <span class="btn-equipo-nombre">+ ${escapeHtml(t.nombre)}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Formulario directo de alta rápida en bodega -->
        <form id="form-alta" class="tuves-form-directo">
          <div class="tuves-form-grid">
            <label class="campo">
              <span>Tipo de equipo</span>
              <select name="tipo_equipo" id="select-tipo-equipo" required>
                ${tiposEquipo.map((t) => `<option value="${t.codigo}">${iconForTipo(t.codigo)} ${escapeHtml(t.nombre)}</option>`).join('')}
              </select>
            </label>
            <label class="campo" style="flex: 2; min-width: 240px;">
              <span>N° de serie</span>
              <div class="input-con-accion">
                <input type="text" name="numero_serie" id="input-numero-serie" placeholder="Ej: 8934221100561" autocomplete="off" required>
                <button type="button" class="btn btn--secundario btn--chico btn-con-icono" id="btn-escanear-serie" title="Escanear código de barras con la cámara">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                  <span>Escanear</span>
                </button>
              </div>
            </label>
            <label class="campo">
              <span>Bodega destino</span>
              <select name="bodega_id" required>${opcionesBodegas()}</select>
            </label>
            <div class="tuves-form-acciones">
              <button type="submit" class="btn btn--primario btn-con-icono" style="height: 42px;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                <span>Dar de alta en bodega</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      <!-- Alertas de Stock Crítico y Resumen de Disponibilidad en Bodega -->
      <div id="bodega-resumen-stock" style="margin-bottom: 20px;"></div>

      <!-- Barra de Filtros y Búsqueda -->
      <div class="card-bloque filtros-equipos-toolbar" style="margin-bottom: 20px;">
        <div class="filtros-equipos-grid">
          <div class="campo campo-busqueda">
            <span class="campo-busqueda-icono">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>
            <input type="text" id="filtro-serie-equipo" placeholder="Buscar por serie…">
          </div>
          <div class="campo">
            <select id="filtro-tipo-equipo">
              <option value="">Todos los tipos</option>
              ${tiposEquipo.map((t) => `<option value="${t.codigo}">${iconForTipo(t.codigo)} ${escapeHtml(t.nombre)}</option>`).join('')}
            </select>
          </div>
          <div class="campo">
            <select id="filtro-estado-equipo">
              <option value="">Todos los estados</option>
              <option value="bodega">En bodega</option>
              <option value="maleta">En maleta</option>
              <option value="en_transito">En tránsito (pendiente)</option>
              <option value="instalado">Instalado</option>
              <option value="retirado">Retirado</option>
              <option value="falla_fabrica">Falla de fábrica</option>
              <option value="perdido">Perdido</option>
              <option value="devuelto_tuves">Devuelto a TuVes</option>
            </select>
          </div>
          <div class="campo">
            <input type="text" id="filtro-tecbod-equipo" placeholder="Filtrar por técnico o bodega…">
          </div>
          <div class="campo">
            <select id="filtro-orden-equipo" title="Criterio de ordenación de la tabla">
              <option value="serie_asc">🔢 Serie (0 → 9 / A → Z)</option>
              <option value="serie_desc">🔢 Serie (9 → 0 / Z → A)</option>
              <option value="tipo_asc">📦 Tipo de equipo (A-Z)</option>
              <option value="tipo_desc">📦 Tipo de equipo (Z-A)</option>
              <option value="estado_asc">🏷️ Por estado</option>
              <option value="ubicacion_asc">📍 Ubicación / Técnico</option>
              <option value="recientes">🕐 Más recientes primero</option>
            </select>
          </div>
        </div>
        <div class="filtros-equipos-meta">
          <span id="equipos-conteo" class="conteo-badge">Cargando inventario…</span>
          <span style="font-size: 0.8rem; color: var(--tinta-3);">💡 Clic en los encabezados de la tabla para ordenar</span>
        </div>
      </div>

      <div id="tabla-equipos"><p class="vacio">Cargando…</p></div>
    `;

    const $filtroSerie = $contenido.querySelector('#filtro-serie-equipo');
    const $filtroTipo = $contenido.querySelector('#filtro-tipo-equipo');
    const $filtroEstado = $contenido.querySelector('#filtro-estado-equipo');
    const $filtroTecBod = $contenido.querySelector('#filtro-tecbod-equipo');
    const $filtroOrden = $contenido.querySelector('#filtro-orden-equipo');
    $filtroEstado.addEventListener('change', () => cargarTablaEquipos($filtroEstado.value));
    $filtroSerie.addEventListener('input', debounce(pintarFilasEquipos, 200));
    $filtroTipo.addEventListener('change', pintarFilasEquipos);
    $filtroTecBod.addEventListener('input', debounce(pintarFilasEquipos, 200));
    $filtroOrden.addEventListener('change', (ev) => {
      criterioOrden = ev.target.value;
      pintarFilasEquipos();
    });

    $contenido.querySelector('#btn-escanear-serie').addEventListener('click', async () => {
      const resultado = await abrirScanner();
      if (resultado) $contenido.querySelector('#input-numero-serie').value = resultado.serie;
    });

    $contenido.querySelector('#btn-alta-masiva').addEventListener('click', () => abrirModalAltaEquipo());
    $contenido.querySelector('#btn-ir-catalogo-equipos')?.addEventListener('click', () => activarTab('catalogo'));

    $contenido.querySelectorAll('.btn-equipo-tuves').forEach((btn) => {
      btn.addEventListener('click', () => {
        const codigo = btn.dataset.tipoCodigo;
        const select = $contenido.querySelector('#select-tipo-equipo');
        if (select) select.value = codigo;
        abrirModalAltaEquipo(codigo);
      });
    });

    $contenido.querySelector('#form-alta').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const payload = { tipo_equipo: fd.get('tipo_equipo'), numero_serie: fd.get('numero_serie').trim(), bodega_id: Number(fd.get('bodega_id')) };
      try {
        const { datos, encolado } = await conColaSiHaceFalta('alta_equipo', payload, () => api('/admin/equipos', { method: 'POST', body: payload }));
        $contenido.querySelector('#input-numero-serie').value = '';
        if (encolado) {
          toast(`Serie ${payload.numero_serie} guardada sin conexión — se dará de alta al recuperar señal.`, 'neutro');
        } else {
          toast(`Equipo ${datos.numero_serie} dado de alta en bodega.`, 'ok');
          await cargarTablaEquipos($filtroEstado.value);
        }
      } catch (e) {
        toast(e.message, 'malo');
      }
    });

    await cargarTablaEquipos('');
  }

  async function abrirModalAltaEquipo(tipoCodigoDefault = null) {
    const tipoSeleccionado = tipoCodigoDefault || tiposEquipo[0]?.codigo;
    const tipoObj = tiposEquipo.find((t) => t.codigo === tipoSeleccionado) || tiposEquipo[0];
    const { root, cerrar } = abrirModal(`
      <div class="modal-alta-equipo">
        <div class="modal-encabezado-icono">
          <div class="modal-icono-circulo modal-icono-circulo--teal">
            <span style="font-size: 1.4rem;">${iconForTipo(tipoSeleccionado)}</span>
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800;">Ingreso de ${escapeHtml(tipoObj?.nombre || 'Equipos TuVes')}</h3>
            <p class="modal-explicacion" style="margin: 3px 0 0;">Carga individual o remesa en lote para Bodega Central.</p>
          </div>
        </div>

        <form id="form-alta-modal" style="margin-top: 16px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <label class="campo">
              <span>Tipo de equipo</span>
              <select name="tipo_equipo" id="modal-tipo-equipo" required>
                ${tiposEquipo.map((t) => `<option value="${t.codigo}" ${t.codigo === tipoSeleccionado ? 'selected' : ''}>${iconForTipo(t.codigo)} ${escapeHtml(t.nombre)}</option>`).join('')}
              </select>
            </label>
            <label class="campo">
              <span>Bodega destino</span>
              <select name="bodega_id" required>${opcionesBodegas()}</select>
            </label>
          </div>

          <label class="campo" style="margin-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>Números de serie</span>
              <span id="modal-contador-series" style="font-size: 0.78rem; font-weight: 700; color: var(--acento-2);">1 serie por línea</span>
            </div>
            <textarea name="series" rows="6" placeholder="Pega una o varias series aquí...&#10;Ej:&#10;8934221100561&#10;8934221100562" style="font-family: var(--fuente-mono); font-size: 0.85rem;" required></textarea>
            <small class="campo-ayuda">Puedes pegar listas completas de Excel de TuVes o escanear en bucle con la cámara.</small>
          </label>

          <button type="button" class="btn btn--secundario btn-con-icono" id="btn-escanear-modal" style="width: 100%; justify-content: center; margin-top: 4px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            <span>📷 Escaneo continuo con cámara</span>
          </button>

          <div class="modal-acciones" style="margin-top: 18px;">
            <button type="button" class="btn btn--secundario" id="btn-cancelar-modal">Cancelar</button>
            <button type="submit" class="btn btn--primario btn-con-icono">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>Dar de alta equipos</span>
            </button>
          </div>
        </form>
      </div>
    `);

    const $textarea = root.querySelector('textarea[name="series"]');
    const $contador = root.querySelector('#modal-contador-series');

    function actualizarContador() {
      const series = $textarea.value.split('\n').map((s) => s.trim()).filter(Boolean);
      $contador.textContent = series.length === 1 ? '1 serie detectada' : `${series.length} series detectadas`;
    }
    $textarea.addEventListener('input', actualizarContador);

    root.querySelector('#btn-cancelar-modal').addEventListener('click', cerrar);

    root.querySelector('#btn-escanear-modal').addEventListener('click', async () => {
      let seguirEscaneando = true;
      while (seguirEscaneando) {
        const resultado = await abrirScanner();
        if (!resultado) { seguirEscaneando = false; break; }
        const actual = $textarea.value.trim();
        $textarea.value = actual ? `${actual}\n${resultado.serie}` : resultado.serie;
        actualizarContador();
        toast(`"${resultado.serie}" agregado a la lista.`, 'ok');
      }
    });

    root.querySelector('#form-alta-modal').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const $submit = ev.target.querySelector('button[type="submit"]');
      if ($submit.disabled) return;
      const fd = new FormData(ev.target);
      const tipo_equipo = fd.get('tipo_equipo');
      const bodega_id = Number(fd.get('bodega_id'));
      const series = [...new Set($textarea.value.split('\n').map((s) => s.trim()).filter(Boolean))];
      if (!series.length) { toast('Agrega al menos una serie.', 'malo'); return; }
      $submit.disabled = true;
      let dadasDeAlta = 0;
      const fallidas = [];
      for (const numero_serie of series) {
        try {
          await api('/admin/equipos', { method: 'POST', body: { tipo_equipo, numero_serie, bodega_id } });
          dadasDeAlta++;
        } catch (e) {
          fallidas.push(`${numero_serie}: ${e.message}`);
        }
      }
      cerrar();
      if (dadasDeAlta) toast(`${dadasDeAlta} equipo(s) dado(s) de alta en bodega.`, 'ok');
      if (fallidas.length) toast(`${fallidas.length} no se pudieron dar de alta — ${fallidas[0]}`, 'malo');
      await cargarTablaEquipos(estadoActual);
    });
  }

  let criterioOrden = 'serie_asc';
  let equiposCache = [];
  let estadoActual = '';

  function pintarResumenAlertasStock() {
    const $resumen = $contenido.querySelector('#bodega-resumen-stock');
    if (!$resumen) return;

    // Calcular equipos disponibles en bodega (stock central disponible para despacho)
    const enBodega = equiposCache.filter((e) => e.estado === 'bodega');
    const conteoPorTipo = {};
    tiposEquipo.forEach((t) => {
      conteoPorTipo[t.codigo] = {
        codigo: t.codigo,
        nombre: t.nombre,
        total: 0,
      };
    });

    enBodega.forEach((e) => {
      if (conteoPorTipo[e.tipo_equipo_codigo]) {
        conteoPorTipo[e.tipo_equipo_codigo].total++;
      } else {
        conteoPorTipo[e.tipo_equipo_codigo] = {
          codigo: e.tipo_equipo_codigo,
          nombre: e.tipo_equipo_nombre || e.tipo_equipo_codigo,
          total: 1,
        };
      }
    });

    const UMBRAL_CRITICO = 5;
    const tiposCriticos = Object.values(conteoPorTipo).filter((t) => t.total < UMBRAL_CRITICO);

    $resumen.innerHTML = `
      ${tiposCriticos.length > 0 ? `
        <div class="alerta-stock-critico" style="margin-bottom: 14px;">
          <div class="alerta-stock-icono">⚠️</div>
          <div class="alerta-stock-cuerpo">
            <strong>Alerta de Stock Bajo en Bodega Central</strong>
            <p>Hay equipos con stock menor a ${UMBRAL_CRITICO} unidades disponibles para asignar:</p>
            <div class="alerta-stock-tags">
              ${tiposCriticos.map((t) => `
                <span class="chip-stock-alerta ${t.total === 0 ? 'chip-stock-alerta--agotado' : ''}">
                  ${iconForTipo(t.codigo)} ${escapeHtml(t.nombre)}: <strong>${t.total} ${t.total === 1 ? 'disponible' : 'disponibles'}</strong>
                </span>
              `).join('')}
            </div>
          </div>
        </div>
      ` : ''}

      <div class="tarjetas-resumen-stock">
        ${Object.values(conteoPorTipo).map((t) => {
          const esCritico = t.total < UMBRAL_CRITICO;
          const esAgotado = t.total === 0;
          return `
            <div class="tarjeta-stock-item ${esAgotado ? 'tarjeta-stock--agotado' : (esCritico ? 'tarjeta-stock--critico' : '')}" title="Filtrar por ${escapeHtml(t.nombre)} en bodega" data-filtro-tipo="${t.codigo}">
              <span class="stock-item-icono">${iconForTipo(t.codigo)}</span>
              <div class="stock-item-info">
                <span class="stock-item-nombre">${escapeHtml(t.nombre)}</span>
                <span class="stock-item-cantidad">${t.total} <small>en bodega</small></span>
              </div>
              <span class="stock-item-status ${esAgotado ? 'status--agotado' : (esCritico ? 'status--bajo' : 'status--ok')}">
                ${esAgotado ? 'Agotado' : (esCritico ? 'Stock bajo' : 'Disponible')}
              </span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    $resumen.querySelectorAll('.tarjeta-stock-item').forEach((card) => {
      card.addEventListener('click', () => {
        const codigo = card.dataset.filtroTipo;
        const $filtroTipo = $contenido.querySelector('#filtro-tipo-equipo');
        const $filtroEstado = $contenido.querySelector('#filtro-estado-equipo');
        if ($filtroTipo) $filtroTipo.value = codigo;
        if ($filtroEstado) $filtroEstado.value = 'bodega';
        cargarTablaEquipos('bodega');
      });
    });
  }

  async function cargarTablaEquipos(estado) {
    const $tabla = $contenido.querySelector('#tabla-equipos');
    estadoActual = estado;
    try {
      const qs = estado ? `?estado=${encodeURIComponent(estado)}` : '';
      const { equipos } = await api(`/admin/equipos${qs}`);
      equiposCache = equipos;
      pintarResumenAlertasStock();
      pintarFilasEquipos();
    } catch (e) {
      $tabla.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  function pintarFilasEquipos() {
    const $tabla = $contenido.querySelector('#tabla-equipos');
    const estado = estadoActual;
    const serieQ = ($contenido.querySelector('#filtro-serie-equipo')?.value ?? '').trim().toLowerCase();
    const tipoQ = $contenido.querySelector('#filtro-tipo-equipo')?.value ?? '';
    const tecbodQ = ($contenido.querySelector('#filtro-tecbod-equipo')?.value ?? '').trim().toLowerCase();
    const equipos = equiposCache.filter((e) => {
      if (serieQ && !e.numero_serie.toLowerCase().includes(serieQ)) return false;
      if (tipoQ && e.tipo_equipo_codigo !== tipoQ) return false;
      if (tecbodQ && !(e.tecnico_nombre || e.bodega_nombre || '').toLowerCase().includes(tecbodQ)) return false;
      return true;
    });

    // Ordenación natural y según criterio seleccionado
    equipos.sort((a, b) => {
      if (criterioOrden === 'serie_asc') {
        return (a.numero_serie || '').localeCompare(b.numero_serie || '', undefined, { numeric: true, sensitivity: 'base' });
      }
      if (criterioOrden === 'serie_desc') {
        return (b.numero_serie || '').localeCompare(a.numero_serie || '', undefined, { numeric: true, sensitivity: 'base' });
      }
      if (criterioOrden === 'tipo_asc') {
        const c = (a.tipo_equipo_nombre || '').localeCompare(b.tipo_equipo_nombre || '', undefined, { sensitivity: 'base' });
        return c !== 0 ? c : (a.numero_serie || '').localeCompare(b.numero_serie || '', undefined, { numeric: true });
      }
      if (criterioOrden === 'tipo_desc') {
        const c = (b.tipo_equipo_nombre || '').localeCompare(a.tipo_equipo_nombre || '', undefined, { sensitivity: 'base' });
        return c !== 0 ? c : (a.numero_serie || '').localeCompare(b.numero_serie || '', undefined, { numeric: true });
      }
      if (criterioOrden === 'estado_asc') {
        const c = (a.estado || '').localeCompare(b.estado || '');
        return c !== 0 ? c : (a.numero_serie || '').localeCompare(b.numero_serie || '', undefined, { numeric: true });
      }
      if (criterioOrden === 'ubicacion_asc') {
        const ubA = a.tecnico_nombre || a.bodega_nombre || '';
        const ubB = b.tecnico_nombre || b.bodega_nombre || '';
        const c = ubA.localeCompare(ubB, undefined, { sensitivity: 'base' });
        return c !== 0 ? c : (a.numero_serie || '').localeCompare(b.numero_serie || '', undefined, { numeric: true });
      }
      if (criterioOrden === 'recientes') {
        return (b.id || 0) - (a.id || 0);
      }
      return 0;
    });

    const $conteo = $contenido.querySelector('#equipos-conteo');
    if ($conteo) {
      $conteo.innerHTML = `Mostrando <strong>${equipos.length}</strong> de ${equiposCache.length} equipo(s) en inventario`;
    }

    try {
      if (!equipos.length) {
        $tabla.innerHTML = '<p class="vacio">No hay equipos que coincidan con los filtros seleccionados.</p>';
        return;
      }
      $tabla.innerHTML = `
        <div class="tabla-envoltorio">
          <table class="tabla tabla-equipos-compacta">
            <thead>
              <tr>
                <th style="width: 44px; text-align: center; color: var(--tinta-3); font-size: 0.78rem;">#</th>
                <th class="th-ordenable ${criterioOrden.startsWith('serie') ? 'th-activa' : ''}" data-sort="serie" style="width: 25%;" title="Clic para ordenar por número de serie">
                  <span>Número de serie</span>
                  <span class="sort-indicator">${criterioOrden === 'serie_asc' ? '▲' : (criterioOrden === 'serie_desc' ? '▼' : '↕')}</span>
                </th>
                <th class="th-ordenable ${criterioOrden.startsWith('tipo') ? 'th-activa' : ''}" data-sort="tipo" style="width: 20%;" title="Clic para ordenar por tipo">
                  <span>Tipo de equipo</span>
                  <span class="sort-indicator">${criterioOrden === 'tipo_asc' ? '▲' : (criterioOrden === 'tipo_desc' ? '▼' : '↕')}</span>
                </th>
                <th class="th-ordenable ${criterioOrden.startsWith('estado') ? 'th-activa' : ''}" data-sort="estado" style="width: 17%;" title="Clic para ordenar por estado">
                  <span>Estado</span>
                  <span class="sort-indicator">${criterioOrden === 'estado_asc' ? '▲' : '↕'}</span>
                </th>
                <th class="th-ordenable ${criterioOrden.startsWith('ubicacion') ? 'th-activa' : ''}" data-sort="ubicacion" style="width: 22%;" title="Clic para ordenar por ubicación">
                  <span>Ubicación / Asignado a</span>
                  <span class="sort-indicator">${criterioOrden === 'ubicacion_asc' ? '▲' : '↕'}</span>
                </th>
                <th style="width: 130px; text-align: right;">Acciones</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      `;
      const $tbody = $tabla.querySelector('tbody');
      equipos.forEach((e, idx) => {
        const tr = el(`
          <tr>
            <td style="text-align: center; color: var(--tinta-3); font-size: 0.78rem; font-weight: 600;">${idx + 1}</td>
            <td>
              <span class="badge-serie celda-mono" title="Clic para copiar serie" data-copiar="${escapeHtml(e.numero_serie)}">${escapeHtml(e.numero_serie)}</span>
            </td>
            <td>
              <span class="tipo-con-icono">
                <span class="tipo-icon">${iconForTipo(e.tipo_equipo_codigo)}</span>
                <span>${escapeHtml(e.tipo_equipo_nombre)}</span>
              </span>
            </td>
            <td>${badge(e.estado)}</td>
            <td>
              <span class="ubicacion-nombre" style="font-weight: 500;">
                ${escapeHtml(e.tecnico_nombre || e.bodega_nombre || '—')}
              </span>
            </td>
            <td class="celda-acciones"></td>
          </tr>
        `);
        const $acciones = tr.querySelector('.celda-acciones');

        function marcarFilaPendiente(mensaje) {
          $acciones.innerHTML = `<span class="chip chip--alerta" style="font-size: 0.72rem; padding: 2px 6px;">⏳ ${escapeHtml(mensaje)}</span>`;
        }

        if (e.estado === 'en_transito') {
          const dias = diasDesde(e.actualizado_en);
          const texto = dias >= DIAS_AVISO_PENDIENTE
            ? `⚠ Esperando hace ${dias}d`
            : `⏳ En tránsito`;
          const $chip = el(`<span class="chip ${dias >= DIAS_AVISO_PENDIENTE ? 'chip--malo' : 'chip--alerta'}" style="font-size: 0.72rem; padding: 2px 6px;">${texto}</span>`);
          const btnCancelar = el('<button type="button" class="btn btn--secundario btn--chico" style="font-size: 0.75rem; padding: 3px 8px;">Cancelar</button>');
          btnCancelar.addEventListener('click', async () => {
            try {
              const { encolado } = await conColaSiHaceFalta('cancelar_traspaso_equipo', { id: e.id }, () => api(`/admin/equipos/${e.id}/cancelar-traspaso`, { method: 'POST', body: {} }));
              if (encolado) {
                toast(`${e.numero_serie}: guardado sin conexión — se cancelará al recuperar señal.`, 'neutro');
              } else {
                toast(`${e.numero_serie}: envío cancelado.`, 'ok');
                await cargarTablaEquipos(estado);
              }
            } catch (err) { toast(err.message, 'malo'); }
          });
          $acciones.append($chip, btnCancelar);
        } else if (['retirado', 'falla_fabrica'].includes(e.estado)) {
          const form = el(`
            <form class="form-inline" style="gap: 4px;">
              <select name="bodega_id" required style="max-width: 120px; font-size: 0.75rem; padding: 3px 6px;">${opcionesBodegas()}</select>
              <button type="submit" class="btn btn--secundario btn--chico" style="font-size: 0.75rem; padding: 3px 8px;">${e.estado === 'retirado' ? 'Reingresar' : 'Reparado'}</button>
            </form>
          `);
          form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const bodegaId = Number(new FormData(ev.target).get('bodega_id'));
            const payload = { id: e.id, bodega_id: bodegaId };
            try {
              const { encolado } = await conColaSiHaceFalta('ingreso_bodega', payload, () => api(`/admin/equipos/${e.id}/ingreso-bodega`, { method: 'POST', body: { bodega_id: bodegaId } }));
              if (encolado) {
                toast(`${e.numero_serie}: guardado sin conexión — se registrará el ingreso al recuperar señal.`, 'neutro');
                marcarFilaPendiente('ingreso pendiente');
              } else {
                toast(`${e.numero_serie} de vuelta en bodega.`, 'ok');
                await cargarTablaEquipos(estado);
              }
            } catch (err) { toast(err.message, 'malo'); }
          });
          $acciones.appendChild(form);
        } else {
          // Menú único de acciones consolidado y ordenado
          function abrirModalFallaFabrica() {
            const { root, cerrar } = abrirModal(`
              <h3>Marcar "${escapeHtml(e.numero_serie)}" como falla de fábrica</h3>
              <p class="modal-explicacion">Sale de donde esté ahora sin culpar ni descontar a nadie. Elige a qué bodega física llega.</p>
              <form id="form-falla-fabrica">
                <label class="campo">
                  <span>Bodega</span>
                  <select name="bodega_id" required>${opcionesBodegas()}</select>
                </label>
                <div class="modal-acciones">
                  <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
                  <button type="submit" class="btn btn--malo">Marcar falla de fábrica</button>
                </div>
              </form>
            `);
            root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
            root.querySelector('#form-falla-fabrica').addEventListener('submit', async (ev) => {
              ev.preventDefault();
              const bodegaId = Number(new FormData(ev.target).get('bodega_id'));
              const payload = { id: e.id, observacion: null, bodega_id: bodegaId };
              try {
                const { encolado } = await conColaSiHaceFalta('falla_fabrica', payload, () => api(`/admin/equipos/${e.id}/falla-fabrica`, { method: 'POST', body: { bodega_id: bodegaId } }));
                cerrar();
                if (encolado) {
                  toast(`${e.numero_serie}: guardado sin conexión — se marcará al recuperar señal.`, 'neutro');
                  marcarFilaPendiente('falla de fábrica pendiente');
                } else {
                  toast(`${e.numero_serie} marcado como falla de fábrica.`, 'alerta');
                  await cargarTablaEquipos(estado);
                }
              } catch (err) { toast(err.message, 'malo'); }
            });
          }

          const accionesTerminales = [
            { tipo: 'marcar_perdido', ruta: 'perdido', boton: 'Perdido', titulo: `Marcar "${e.numero_serie}" como perdido`, explicacion: 'Sale del inventario activo — no queda en ninguna bodega ni maleta. Úsalo si a un técnico se le extravió o se lo robaron.', toastOk: 'marcado como perdido.', pendienteMsg: 'perdido pendiente' },
            { tipo: 'marcar_devuelto_tuves', ruta: 'devuelto-tuves', boton: 'Devuelto a TuVes', titulo: `Marcar "${e.numero_serie}" como devuelto a TuVes`, explicacion: 'Sale del inventario activo — se devolvió al proveedor y ya no es stock propio.', toastOk: 'marcado como devuelto a TuVes.', pendienteMsg: 'devolución pendiente' },
          ];
          function abrirModalAccionTerminal(acc) {
            const { root, cerrar } = abrirModal(`
              <h3>${escapeHtml(acc.titulo)}</h3>
              <p class="modal-explicacion">${escapeHtml(acc.explicacion)}</p>
              <form id="form-accion-terminal">
                <label class="campo">
                  <span>Nota (opcional)</span>
                  <textarea name="observacion" rows="2"></textarea>
                </label>
                <div class="modal-acciones">
                  <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
                  <button type="submit" class="btn btn--malo">${escapeHtml(acc.boton)}</button>
                </div>
              </form>
            `);
            root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
            root.querySelector('#form-accion-terminal').addEventListener('submit', async (ev) => {
              ev.preventDefault();
              const observacion = new FormData(ev.target).get('observacion').trim() || null;
              const payload = { id: e.id, observacion };
              try {
                const { encolado } = await conColaSiHaceFalta(acc.tipo, payload, () => api(`/admin/equipos/${e.id}/${acc.ruta}`, { method: 'POST', body: { observacion } }));
                cerrar();
                if (encolado) {
                  toast(`${e.numero_serie}: guardado sin conexión — se ${acc.toastOk.replace('marcado', 'marcará')} al recuperar señal.`, 'neutro');
                  marcarFilaPendiente(acc.pendienteMsg);
                } else {
                  toast(`${e.numero_serie} ${acc.toastOk}`, 'alerta');
                  await cargarTablaEquipos(estado);
                }
              } catch (err) { toast(err.message, 'malo'); }
            });
          }

          const menuItems = [];

          if (e.estado === 'bodega' || e.estado === 'maleta') {
            menuItems.push({
              texto: '🚚 Asignar a técnicos',
              onClick: () => { window.location.hash = '#bodega?tab=asignar'; },
            });
          }

          menuItems.push({
            texto: '🔍 Ver historial y rastreo',
            onClick: () => abrirRastreoEquipo(e.id, e.numero_serie),
          });

          if (!['falla_fabrica', 'devuelto_tuves', 'perdido'].includes(e.estado)) {
            menuItems.push({
              texto: '⚠️ Falla de fábrica',
              clase: 'menu-item--malo',
              onClick: abrirModalFallaFabrica,
            });
            menuItems.push({
              texto: '📦 Devuelto a TuVes',
              onClick: () => abrirModalAccionTerminal(accionesTerminales[1]),
            });
            menuItems.push({
              texto: '❌ Marcar como perdido',
              onClick: () => abrirModalAccionTerminal(accionesTerminales[0]),
            });
          }

          $acciones.appendChild(crearMenuAcciones(menuItems));
        }

        $tbody.appendChild(tr);
      });

      // Listeners de ordenación al hacer clic en columnas
      $tabla.querySelectorAll('.th-ordenable').forEach((th) => {
        th.addEventListener('click', () => {
          const col = th.dataset.sort;
          if (col === 'serie') {
            criterioOrden = criterioOrden === 'serie_asc' ? 'serie_desc' : 'serie_asc';
          } else if (col === 'tipo') {
            criterioOrden = criterioOrden === 'tipo_asc' ? 'tipo_desc' : 'tipo_asc';
          } else if (col === 'estado') {
            criterioOrden = criterioOrden === 'estado_asc' ? 'serie_asc' : 'estado_asc';
          } else if (col === 'ubicacion') {
            criterioOrden = criterioOrden === 'ubicacion_asc' ? 'serie_asc' : 'ubicacion_asc';
          }
          const $sel = $contenido.querySelector('#filtro-orden-equipo');
          if ($sel) $sel.value = criterioOrden;
          pintarFilasEquipos();
        });
      });

      // Clic para copiar número de serie
      $tabla.querySelectorAll('[data-copiar]').forEach((badge) => {
        badge.addEventListener('click', () => {
          const num = badge.dataset.copiar;
          if (navigator.clipboard) {
            navigator.clipboard.writeText(num);
            toast(`Serie ${num} copiada al portapapeles.`, 'ok');
          }
        });
      });
    } catch (e) {
      $tabla.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  // ------------------------------------------------------ Asignar a técnicos --
  // Todo lo que antes vivía embebido en cada fila de Equipos ("Enviar"
  // desde bodega, "Traspasar" desde una maleta) más la selección masiva
  // (reporte #5: "poder seleccionar varios equipos y transferir") — juntos
  // en un solo lugar pensado para esa tarea, no mezclado con el inventario.
  async function renderAsignar() {
    $contenido.innerHTML = `
      <div class="segmentado" id="segmentado-asignar">
        <button type="button" data-modo="bodega" class="activo">En bodega — asignar</button>
        <button type="button" data-modo="maleta">En maletas — traspasar</button>
      </div>
      <div id="tabla-asignar"><p class="vacio">Cargando…</p></div>
    `;
    let modo = 'bodega';
    const $segmentado = $contenido.querySelector('#segmentado-asignar');
    $segmentado.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-modo]');
      if (!btn) return;
      modo = btn.dataset.modo;
      $segmentado.querySelectorAll('button').forEach((b) => b.classList.toggle('activo', b === btn));
      cargarTablaAsignar(modo);
    });
    await cargarTablaAsignar(modo);
  }

  const seleccionados = new Map(); // id -> numero_serie

  async function cargarTablaAsignar(modo) {
    const $tabla = $contenido.querySelector('#tabla-asignar');
    seleccionados.clear();
    try {
      const { equipos } = await api(`/admin/equipos?estado=${encodeURIComponent(modo)}`);
      if (!equipos.length) {
        $tabla.innerHTML = modo === 'bodega'
          ? '<p class="vacio">No hay equipos en bodega para asignar.</p>'
          : '<p class="vacio">Ningún técnico tiene equipos en su maleta ahora mismo.</p>';
        return;
      }
      $tabla.innerHTML = `
        <div class="form-fila" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <button type="button" class="btn btn--secundario" id="btn-escanear-seleccionar">📷 Escanear para seleccionar</button>
            <span class="campo-ayuda">Escanea uno tras otro — se van tildando solos.</span>
          </div>
          <div style="position: relative; min-width: 260px; max-width: 360px; flex: 1;">
            <input type="search" id="filtro-serie-asignar" placeholder="🔍 Filtrar por serie, tipo o técnico..." class="input" style="width: 100%; padding: 7px 12px; font-size: 0.85rem; border-radius: 8px; border: 1.5px solid var(--borde-fuerte, #cbd5e1); background: var(--blanco, #ffffff);">
          </div>
        </div>
        <div id="acciones-masivas" class="acciones-masivas" hidden></div>
        <table class="tabla">
          <thead><tr><th></th><th>Serie</th><th>Tipo</th><th>${modo === 'bodega' ? 'Bodega' : 'Técnico'}</th><th>Acciones</th></tr></thead>
          <tbody></tbody>
        </table>
        <div id="vacio-filtro-asignar" class="vacio-tarjeta" style="display: none; padding: 24px 16px; margin-top: 10px;">
          <p class="vacio-titulo" style="font-size: 0.92rem;">Sin resultados para este filtro</p>
          <p class="vacio-desc" style="font-size: 0.8rem;">Verifica la serie o limpia el campo de búsqueda.</p>
        </div>
      `;
      const $barra = $tabla.querySelector('#acciones-masivas');

      function actualizarBarra() {
        if (!seleccionados.size) { $barra.hidden = true; $barra.innerHTML = ''; return; }
        $barra.hidden = false;
        if (modo === 'bodega') {
          $barra.innerHTML = `
            <form id="form-accion-masiva" class="form-fila">
              <span class="campo-ayuda">${seleccionados.size} en bodega seleccionados</span>
              <select name="tecnico_id" required>${opcionesUsuarios()}</select>
              <button type="submit" class="btn btn--primario btn--chico">Enviar seleccionados</button>
            </form>
          `;
          $barra.querySelector('#form-accion-masiva').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const tecnicoId = Number(new FormData(ev.target).get('tecnico_id'));
            await ejecutarAccionMasiva('asignar_equipo', (id) => api(`/admin/equipos/${id}/asignar`, { method: 'POST', body: { tecnico_id: tecnicoId } }), (id) => ({ id, tecnico_id: tecnicoId }));
          });
        } else {
          $barra.innerHTML = `
            <form id="form-accion-masiva" class="form-fila">
              <span class="campo-ayuda">${seleccionados.size} en maleta seleccionados</span>
              <select name="tecnico_destino_id" required>${opcionesUsuarios()}</select>
              <button type="submit" class="btn btn--primario btn--chico">Traspasar seleccionados</button>
            </form>
          `;
          $barra.querySelector('#form-accion-masiva').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const tecnicoDestinoId = Number(new FormData(ev.target).get('tecnico_destino_id'));
            await ejecutarAccionMasiva('traspasar_equipo', (id) => api(`/admin/equipos/${id}/traspasar`, { method: 'POST', body: { tecnico_destino_id: tecnicoDestinoId } }), (id) => ({ id, tecnico_destino_id: tecnicoDestinoId }));
          });
        }
      }

      /**
       * Manda una acción por cada seleccionado, uno por uno — no hay un
       * endpoint masivo real en el servidor para esto, así que se reusan
       * los mismos endpoints de a uno (cada uno pasa igual por la cola
       * offline si hace falta). Sin conexión, cada ítem queda encolado por
       * separado y se procesan en orden al recuperar señal.
       */
      async function ejecutarAccionMasiva(tipo, llamada, armarPayload) {
        const ids = [...seleccionados.keys()];
        let ok = 0, encoladosN = 0, fallidos = 0;
        for (const id of ids) {
          const numeroSerie = seleccionados.get(id);
          try {
            const { encolado } = await conColaSiHaceFalta(tipo, armarPayload(id), () => llamada(id));
            if (encolado) encoladosN++; else ok++;
          } catch (e) {
            fallidos++;
            console.error('[terreno-dth admin] acción masiva falló para', numeroSerie, e.message);
          }
        }
        if (fallidos) toast(`${fallidos} de ${ids.length} fallaron — revisa la consola.`, 'malo');
        else if (encoladosN) toast(`${ok + encoladosN} guardados${encoladosN ? `, ${encoladosN} sin conexión (se aplicarán al recuperar señal)` : ''}.`, 'neutro');
        else toast(`${ok} equipos enviados — quedan pendientes hasta que cada técnico confirme.`, 'ok');
        await cargarTablaAsignar(modo);
      }

      const $tbody = $tabla.querySelector('tbody');

      // Pedido: "aqui falta algo como un scaner igual para ir agregando
      // decos y traspasarlos a algun tecnico ya que ahora se pueden ver
      // visualmente pero cuando sean muchos no" — reabre el scanner solo
      // después de cada lectura, así queda un loop "escanea, tilda,
      // escanea, tilda…" hasta que el usuario cierra el modal (✕ o Escape).
      $tabla.querySelector('#btn-escanear-seleccionar').addEventListener('click', async () => {
        let seguirEscaneando = true;
        while (seguirEscaneando) {
          const resultado = await abrirScanner();
          if (!resultado) { seguirEscaneando = false; break; }
          const equipo = equipos.find((eq) => eq.numero_serie === resultado.serie);
          if (!equipo) {
            toast(`"${resultado.serie}" no está en esta lista (¿${modo === 'bodega' ? 'bodega' : 'técnico'} equivocado?).`, 'malo');
            continue;
          }
          const $check = $tbody.querySelector(`.check-equipo[data-id="${equipo.id}"]`);
          if (!$check) continue;
          if ($check.checked) {
            toast(`${equipo.numero_serie} ya estaba seleccionado.`, 'neutro');
          } else {
            $check.checked = true;
            seleccionados.set(equipo.id, equipo.numero_serie);
            actualizarBarra();
            toast(`${equipo.numero_serie} seleccionado (${seleccionados.size}).`, 'ok');
          }
        }
      });

      for (const e of equipos) {
        const tr = el(`
          <tr data-equipo-id="${e.id}" data-texto="${escapeHtml((e.numero_serie + ' ' + e.tipo_equipo_nombre + ' ' + (e.tecnico_nombre || e.bodega_nombre || '')).toLowerCase())}">
            <td><input type="checkbox" class="check-equipo" data-id="${e.id}"></td>
            <td class="celda-mono">${escapeHtml(e.numero_serie)}</td>
            <td>${escapeHtml(e.tipo_equipo_nombre)}</td>
            <td>${escapeHtml(e.tecnico_nombre || e.bodega_nombre || '—')}</td>
            <td class="celda-acciones"></td>
          </tr>
        `);
        const $acciones = tr.querySelector('.celda-acciones');
        tr.querySelector('.check-equipo').addEventListener('change', (ev) => {
          if (ev.target.checked) seleccionados.set(e.id, e.numero_serie);
          else seleccionados.delete(e.id);
          actualizarBarra();
        });

        if (modo === 'bodega') {
          const form = el(`
            <form class="form-inline">
              <select name="tecnico_id" required>${opcionesUsuarios()}</select>
              <button type="submit" class="btn btn--secundario btn--chico">Enviar</button>
            </form>
          `);
          form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const tecnicoId = Number(new FormData(ev.target).get('tecnico_id'));
            try {
              const { encolado } = await conColaSiHaceFalta('asignar_equipo', { id: e.id, tecnico_id: tecnicoId }, () => api(`/admin/equipos/${e.id}/asignar`, { method: 'POST', body: { tecnico_id: tecnicoId } }));
              if (encolado) {
                toast(`${e.numero_serie}: guardado sin conexión — se enviará al recuperar señal.`, 'neutro');
                $acciones.innerHTML = '<span class="chip chip--alerta">⏳ envío pendiente</span>';
              } else {
                toast(`${e.numero_serie} enviado — queda pendiente hasta que el técnico confirme que lo recibió.`, 'ok');
                await cargarTablaAsignar(modo);
              }
            } catch (err) { toast(err.message, 'malo'); }
          });
          $acciones.appendChild(form);
        } else {
          const form = el(`
            <form class="form-inline">
              <select name="tecnico_destino_id" required>${opcionesUsuarios(null, e.usuario_actual_id)}</select>
              <button type="submit" class="btn btn--secundario btn--chico">Traspasar</button>
            </form>
          `);
          form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const tecnicoDestinoId = Number(new FormData(ev.target).get('tecnico_destino_id'));
            try {
              const { encolado } = await conColaSiHaceFalta('traspasar_equipo', { id: e.id, tecnico_destino_id: tecnicoDestinoId }, () => api(`/admin/equipos/${e.id}/traspasar`, { method: 'POST', body: { tecnico_destino_id: tecnicoDestinoId } }));
              if (encolado) {
                toast(`${e.numero_serie}: guardado sin conexión — se traspasará al recuperar señal.`, 'neutro');
                $acciones.innerHTML = '<span class="chip chip--alerta">⏳ traspaso pendiente</span>';
              } else {
                toast(`${e.numero_serie} enviado — queda pendiente hasta que el técnico confirme que lo recibió.`, 'ok');
                await cargarTablaAsignar(modo);
              }
            } catch (err) { toast(err.message, 'malo'); }
          });
          $acciones.appendChild(form);
        }
        $tbody.appendChild(tr);
      }

      const $filtroSerie = $tabla.querySelector('#filtro-serie-asignar');
      const $vacioFiltro = $tabla.querySelector('#vacio-filtro-asignar');
      const $tablaElem = $tabla.querySelector('table');

      $filtroSerie?.addEventListener('input', (ev) => {
        const q = ev.target.value.trim().toLowerCase();
        let visibles = 0;
        $tbody.querySelectorAll('tr[data-equipo-id]').forEach(($tr) => {
          const texto = $tr.dataset.texto || '';
          const coincide = !q || texto.includes(q);
          $tr.style.display = coincide ? '' : 'none';
          if (coincide) visibles++;
        });

        if (visibles === 0 && equipos.length > 0) {
          $tablaElem.style.display = 'none';
          if ($vacioFiltro) $vacioFiltro.style.display = 'block';
        } else {
          $tablaElem.style.display = '';
          if ($vacioFiltro) $vacioFiltro.style.display = 'none';
        }
      });
    } catch (e) {
      $tabla.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  // ---------------------------------------------------------- Ferretería --
  async function renderFerreteria() {
    $contenido.innerHTML = `
      <h3>Ingreso a bodega (compra / recepción de TuVes)</h3>
      <form id="form-ingreso-central" class="form-fila">
        <label class="campo campo--inline">
          <span>Ítem</span>
          <select name="item_codigo" required>${items.map((i) => `<option value="${i.codigo}">${escapeHtml(i.nombre)}</option>`).join('')}</select>
        </label>
        <label class="campo campo--inline">
          <span>Bodega</span>
          <select name="bodega_id" required>${opcionesBodegas()}</select>
        </label>
        <label class="campo campo--inline">
          <span>Cantidad</span>
          <input type="number" name="cantidad" min="0.01" step="0.01" required>
        </label>
        <button type="submit" class="btn btn--secundario">Ingresar</button>
      </form>

      <h3>Entregar a un técnico</h3>
      <form id="form-entrega" class="form-fila">
        <label class="campo campo--inline">
          <span>Ítem</span>
          <select name="item_codigo" required>${items.map((i) => `<option value="${i.codigo}">${escapeHtml(i.nombre)}</option>`).join('')}</select>
        </label>
        <label class="campo campo--inline">
          <span>Bodega</span>
          <select name="bodega_id" required>${opcionesBodegas()}</select>
        </label>
        <label class="campo campo--inline">
          <span>Técnico</span>
          <select name="tecnico_id" required>${opcionesUsuarios()}</select>
        </label>
        <label class="campo campo--inline">
          <span>Cantidad</span>
          <input type="number" name="cantidad" min="0.01" step="0.01" required>
        </label>
        <button type="submit" class="btn btn--primario">Entregar</button>
      </form>

      <h3>Pendientes de confirmar</h3>
      <div id="tabla-pendientes-ferreteria"><p class="vacio">Cargando…</p></div>

      <h3>Stock por bodega</h3>
      <div id="tabla-stock-central"><p class="vacio">Cargando…</p></div>

      <h3>Stock confirmado por técnico</h3>
      <div id="tabla-stock"><p class="vacio">Cargando…</p></div>
    `;

    $contenido.querySelector('#form-ingreso-central').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const payload = {
        item_codigo: fd.get('item_codigo'),
        bodega_id: Number(fd.get('bodega_id')),
        cantidad: Number(fd.get('cantidad')),
      };
      try {
        const { encolado } = await conColaSiHaceFalta('ingreso_ferreteria_central', payload, () => api('/admin/ferreteria/ingreso', { method: 'POST', body: payload }));
        ev.target.reset();
        if (encolado) {
          toast('Guardado sin conexión — el ingreso se registrará al recuperar señal.', 'neutro');
        } else {
          toast('Ingreso registrado.', 'ok');
          await cargarStockCentral();
        }
      } catch (e) {
        toast(e.message, 'malo');
      }
    });

    $contenido.querySelector('#form-entrega').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const payload = {
        item_codigo: fd.get('item_codigo'),
        bodega_id: Number(fd.get('bodega_id')),
        tecnico_id: Number(fd.get('tecnico_id')),
        cantidad: Number(fd.get('cantidad')),
      };
      try {
        const { encolado } = await conColaSiHaceFalta('entregar_ferreteria', payload, () => api('/admin/ferreteria/entregar', { method: 'POST', body: payload }));
        ev.target.reset();
        if (encolado) {
          toast('Guardado sin conexión — la entrega se registrará al recuperar señal.', 'neutro');
        } else {
          toast('Entrega enviada — queda pendiente hasta que el técnico confirme la cantidad recibida.', 'ok');
          await Promise.all([cargarStock(), cargarPendientesFerreteria(), cargarStockCentral()]);
        }
      } catch (e) {
        toast(e.message, 'malo');
      }
    });

    await Promise.all([cargarStock(), cargarPendientesFerreteria(), cargarStockCentral()]);
  }

  async function cargarPendientesFerreteria() {
    const $tabla = $contenido.querySelector('#tabla-pendientes-ferreteria');
    try {
      const { pendientes } = await api('/admin/ferreteria/pendientes');
      if (!pendientes.length) {
        $tabla.innerHTML = '<p class="vacio">No hay entregas esperando confirmación.</p>';
        return;
      }
      $tabla.innerHTML = `
        <table class="tabla">
          <thead><tr><th>Técnico</th><th>Ítem</th><th>Cantidad</th><th>Esperando</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
      `;
      const $tbody = $tabla.querySelector('tbody');
      for (const p of pendientes) {
        const dias = diasDesde(p.creado_en);
        const esperando = dias >= DIAS_AVISO_PENDIENTE
          ? `<span class="chip chip--malo">⚠ ${dias} días</span>`
          : `<span class="chip chip--alerta">${dias === 0 ? 'hoy' : dias + ' día' + (dias === 1 ? '' : 's')}</span>`;
        const tr = el(`
          <tr>
            <td>${escapeHtml(p.tecnico_nombre)}</td>
            <td>${escapeHtml(p.item_nombre)}</td>
            <td>${p.cantidad} ${escapeHtml(p.unidad_medida)}</td>
            <td>${esperando}</td>
            <td class="celda-acciones"></td>
          </tr>
        `);
        const btn = el('<button type="button" class="btn btn--secundario btn--chico">Cancelar</button>');
        btn.addEventListener('click', async () => {
          try {
            const { encolado } = await conColaSiHaceFalta('cancelar_entrega_ferreteria', { id: p.id }, () => api(`/admin/ferreteria/pendientes/${p.id}/cancelar`, { method: 'POST', body: {} }));
            if (encolado) {
              toast('Guardado sin conexión — se cancelará al recuperar señal.', 'neutro');
            } else {
              toast('Entrega cancelada.', 'ok');
              await Promise.all([cargarPendientesFerreteria(), cargarStockCentral()]);
            }
          } catch (err) { toast(err.message, 'malo'); }
        });
        tr.querySelector('.celda-acciones').appendChild(btn);
        $tbody.appendChild(tr);
      }
    } catch (e) {
      $tabla.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  async function cargarStockCentral() {
    const $tabla = $contenido.querySelector('#tabla-stock-central');
    try {
      const { stock } = await api('/admin/ferreteria/stock-central');
      if (!stock.length) {
        $tabla.innerHTML = '<p class="vacio">Todavía no se ha ingresado ferretería a ninguna bodega.</p>';
        return;
      }
      $tabla.innerHTML = `
        <table class="tabla">
          <thead><tr><th>Bodega</th><th>Ítem</th><th>Cantidad actual</th></tr></thead>
          <tbody>
            ${stock.map((s) => `
              <tr>
                <td>${escapeHtml(s.bodega_nombre)}</td>
                <td>${escapeHtml(s.item_nombre)}</td>
                <td class="${Number(s.cantidad_actual) < 0 ? 'celda-negativa' : ''}">${s.cantidad_actual} ${escapeHtml(s.unidad_medida)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      $tabla.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  async function cargarStock() {
    const $tabla = $contenido.querySelector('#tabla-stock');
    try {
      const { stock } = await api('/admin/ferreteria/stock');
      if (!stock.length) {
        $tabla.innerHTML = '<p class="vacio">Todavía no se ha entregado ferretería a nadie.</p>';
        return;
      }
      $tabla.innerHTML = `
        <table class="tabla">
          <thead><tr><th>Técnico</th><th>Ítem</th><th>Cantidad actual</th></tr></thead>
          <tbody>
            ${stock.map((s) => `
              <tr>
                <td>${escapeHtml(s.tecnico_nombre)}</td>
                <td>${escapeHtml(s.item_nombre)}</td>
                <td class="${Number(s.cantidad_actual) < 0 ? 'celda-negativa' : ''}">${s.cantidad_actual} ${escapeHtml(s.unidad_medida)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      $tabla.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  // ------------------------------------------------------------ Catálogo --
  // Pedido: "en bodega se puedan agregar nuevos items" — hasta ahora solo
  // se podía dar de alta una serie/cantidad de un tipo que YA existía en
  // el catálogo; crear el tipo en sí exigía tocar la base a mano.
  async function renderCatalogo() {
    $contenido.innerHTML = `
      <h3>Tipos de equipo</h3>
      <form id="form-nuevo-tipo-equipo" class="form-fila">
        <label class="campo campo--inline">
          <span>Código</span>
          <input type="text" name="codigo" placeholder="Ej: decodificador_4k" pattern="[a-z0-9_]+" title="Solo minúsculas, números o guion bajo" required>
        </label>
        <label class="campo campo--inline">
          <span>Nombre</span>
          <input type="text" name="nombre" placeholder="Ej: Decodificador 4K" required>
        </label>
        <button type="submit" class="btn btn--primario">Crear tipo de equipo</button>
      </form>
      <div id="tabla-tipos-equipo"></div>

      <h3 style="margin-top: 26px;">Ítems de ferretería</h3>
      <form id="form-nuevo-item" class="form-fila">
        <label class="campo campo--inline">
          <span>Código</span>
          <input type="text" name="codigo" placeholder="Ej: cinta_aislante" pattern="[a-z0-9_]+" title="Solo minúsculas, números o guion bajo" required>
        </label>
        <label class="campo campo--inline">
          <span>Nombre</span>
          <input type="text" name="nombre" placeholder="Ej: Cinta aislante" required>
        </label>
        <label class="campo campo--inline">
          <span>Unidad</span>
          <select name="unidad_medida">
            <option value="unidad">Unidad</option>
            <option value="metro">Metro</option>
          </select>
        </label>
        <button type="submit" class="btn btn--primario">Crear ítem</button>
      </form>
      <div id="tabla-items-ferreteria"></div>
    `;

    pintarTablaTiposEquipo();
    pintarTablaItemsFerreteria();

    $contenido.querySelector('#form-nuevo-tipo-equipo').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const $submit = ev.target.querySelector('button[type="submit"]');
      if ($submit.disabled) return;
      $submit.disabled = true;
      const fd = new FormData(ev.target);
      const payload = { codigo: fd.get('codigo').trim(), nombre: fd.get('nombre').trim() };
      try {
        const { datos, encolado } = await conColaSiHaceFalta('crear_tipo_equipo', payload, () => api('/admin/catalogo/tipos-equipo', { method: 'POST', body: payload }));
        ev.target.reset();
        if (encolado) {
          toast(`"${payload.nombre}" guardado sin conexión — se creará al recuperar señal.`, 'neutro');
        } else {
          toast(`Tipo de equipo "${payload.nombre}" creado.`, 'ok');
          tiposEquipo = datos.tipos_equipo;
          pintarTablaTiposEquipo();
        }
      } catch (e) {
        toast(e.message, 'malo');
      } finally {
        $submit.disabled = false;
      }
    });

    $contenido.querySelector('#form-nuevo-item').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const $submit = ev.target.querySelector('button[type="submit"]');
      if ($submit.disabled) return;
      $submit.disabled = true;
      const fd = new FormData(ev.target);
      const payload = { codigo: fd.get('codigo').trim(), nombre: fd.get('nombre').trim(), unidad_medida: fd.get('unidad_medida') };
      try {
        const { datos, encolado } = await conColaSiHaceFalta('crear_item_ferreteria', payload, () => api('/admin/catalogo/items-ferreteria', { method: 'POST', body: payload }));
        ev.target.reset();
        if (encolado) {
          toast(`"${payload.nombre}" guardado sin conexión — se creará al recuperar señal.`, 'neutro');
        } else {
          toast(`Ítem "${payload.nombre}" creado.`, 'ok');
          items = datos.items;
          pintarTablaItemsFerreteria();
        }
      } catch (e) {
        toast(e.message, 'malo');
      } finally {
        $submit.disabled = false;
      }
    });
  }

  function pintarTablaTiposEquipo() {
    const $tabla = $contenido.querySelector('#tabla-tipos-equipo');
    if (!$tabla) return;
    if (!tiposEquipo.length) {
      $tabla.innerHTML = '<p class="vacio" style="margin: 14px 0;">No hay tipos de equipo registrados en el catálogo.</p>';
      return;
    }
    $tabla.innerHTML = `
      <table class="tabla">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th style="text-align: right; width: 140px;">Acciones</th>
          </tr>
        </thead>
        <tbody>${tiposEquipo.map((t) => `
          <tr>
            <td class="celda-mono">${escapeHtml(t.codigo)}</td>
            <td>
              <span style="display: inline-flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.1rem;">${iconForTipo(t.codigo)}</span>
                <strong>${escapeHtml(t.nombre)}</strong>
              </span>
            </td>
            <td style="text-align: right; width: 140px;">
              <div style="display: inline-flex; gap: 6px; align-items: center; justify-content: flex-end;">
                <button type="button" class="btn-accion btn-accion--editar" data-editar-tipo="${t.id}" title="Editar tipo de equipo">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  <span>Editar</span>
                </button>
                <button type="button" class="btn-accion btn-accion--eliminar" data-borrar-tipo="${t.id}" title="Eliminar tipo de equipo">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  <span>Borrar</span>
                </button>
              </div>
            </td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;

    $tabla.querySelectorAll('[data-editar-tipo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = tiposEquipo.find((x) => String(x.id) === btn.dataset.editarTipo);
        if (t) abrirModalEditarTipoEquipo(t);
      });
    });

    $tabla.querySelectorAll('[data-borrar-tipo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = tiposEquipo.find((x) => String(x.id) === btn.dataset.borrarTipo);
        if (t) confirmarEliminarTipoEquipo(t);
      });
    });
  }

  function abrirModalEditarTipoEquipo(t) {
    const { root, cerrar } = abrirModal(`
      <div class="modal-encabezado-icono">
        <div class="modal-icono-circulo modal-icono-circulo--teal">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </div>
        <div>
          <h3 style="margin: 0; font-size: 1.15rem;">Editar tipo de equipo</h3>
          <p style="margin: 3px 0 0; font-size: 0.82rem; color: var(--tinta-2);">
            Modifica el código o el nombre visible del equipo en el catálogo.
          </p>
        </div>
      </div>
      <form id="form-editar-tipo-equipo" style="margin-top: 18px;">
        <label class="campo">
          <span>Código</span>
          <input type="text" name="codigo" value="${escapeHtml(t.codigo)}" pattern="[a-z0-9_]+" title="Solo minúsculas, números o guion bajo" required>
        </label>
        <label class="campo" style="margin-top: 12px;">
          <span>Nombre</span>
          <input type="text" name="nombre" value="${escapeHtml(t.nombre)}" required autofocus>
        </label>
        <div class="modal-acciones" style="margin-top: 22px;">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--primario">Guardar cambios</button>
        </div>
      </form>
    `);

    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-editar-tipo-equipo').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const $submit = ev.target.querySelector('button[type="submit"]');
      if ($submit.disabled) return;
      $submit.disabled = true;
      const fd = new FormData(ev.target);
      const payload = {
        id: t.id,
        codigo: fd.get('codigo').trim(),
        nombre: fd.get('nombre').trim(),
      };
      try {
        const { datos, encolado } = await conColaSiHaceFalta('editar_tipo_equipo', payload, () =>
          api(`/admin/catalogo/tipos-equipo/${t.id}`, { method: 'PUT', body: { codigo: payload.codigo, nombre: payload.nombre } })
        );
        cerrar();
        if (encolado) {
          toast(`Tipo "${payload.nombre}" guardado sin conexión.`, 'neutro');
        } else {
          toast(`Tipo de equipo "${payload.nombre}" actualizado.`, 'ok');
          tiposEquipo = datos.tipos_equipo;
          pintarTablaTiposEquipo();
        }
      } catch (e) {
        toast(e.message, 'malo');
        $submit.disabled = false;
      }
    });
  }

  function confirmarEliminarTipoEquipo(t) {
    const { root, cerrar } = abrirModal(`
      <div class="modal-encabezado-icono">
        <div class="modal-icono-circulo modal-icono-circulo--malo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </div>
        <div>
          <h3 style="margin: 0; font-size: 1.15rem;">¿Eliminar tipo "${escapeHtml(t.nombre)}"?</h3>
          <p style="margin: 3px 0 0; font-size: 0.82rem; color: var(--tinta-2);">
            Código: <code class="celda-mono">${escapeHtml(t.codigo)}</code><br>
            Si no tiene equipos registrados en el sistema, se eliminará definitivamente. Si ya tiene equipos asociados, se desactivará del catálogo para conservar la trazabilidad histórica.
          </p>
        </div>
      </div>
      <div class="modal-acciones" style="margin-top: 22px;">
        <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
        <button type="button" class="btn btn--malo" id="btn-confirmar">Sí, eliminar</button>
      </div>
    `);

    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#btn-confirmar').addEventListener('click', async () => {
      const $btn = root.querySelector('#btn-confirmar');
      if ($btn.disabled) return;
      $btn.disabled = true;
      try {
        const { datos, encolado } = await conColaSiHaceFalta('eliminar_tipo_equipo', { id: t.id }, () =>
          api(`/admin/catalogo/tipos-equipo/${t.id}`, { method: 'DELETE' })
        );
        cerrar();
        if (encolado) {
          toast(`Tipo "${t.nombre}" eliminado sin conexión.`, 'neutro');
        } else {
          toast(datos?.resultado?.mensaje || `Tipo de equipo "${t.nombre}" eliminado.`, 'ok');
          tiposEquipo = datos.tipos_equipo;
          pintarTablaTiposEquipo();
        }
      } catch (e) {
        toast(e.message, 'malo');
        $btn.disabled = false;
      }
    });
  }

  function pintarTablaItemsFerreteria() {
    const $tabla = $contenido.querySelector('#tabla-items-ferreteria');
    if (!$tabla) return;
    if (!items.length) {
      $tabla.innerHTML = '<p class="vacio" style="margin: 14px 0;">No hay ítems de ferretería registrados en el catálogo.</p>';
      return;
    }
    $tabla.innerHTML = `
      <table class="tabla">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Unidad</th>
            <th style="text-align: right; width: 140px;">Acciones</th>
          </tr>
        </thead>
        <tbody>${items.map((i) => `
          <tr>
            <td class="celda-mono">${escapeHtml(i.codigo)}</td>
            <td><strong>${escapeHtml(i.nombre)}</strong></td>
            <td><span class="chip chip--neutro">${escapeHtml(i.unidad_medida)}</span></td>
            <td style="text-align: right; width: 140px;">
              <div style="display: inline-flex; gap: 6px; align-items: center; justify-content: flex-end;">
                <button type="button" class="btn-accion btn-accion--editar" data-editar-item="${i.id}" title="Editar ítem de ferretería">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  <span>Editar</span>
                </button>
                <button type="button" class="btn-accion btn-accion--eliminar" data-borrar-item="${i.id}" title="Eliminar ítem de ferretería">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  <span>Borrar</span>
                </button>
              </div>
            </td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;

    $tabla.querySelectorAll('[data-editar-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = items.find((x) => String(x.id) === btn.dataset.editarItem);
        if (item) abrirModalEditarItemFerreteria(item);
      });
    });

    $tabla.querySelectorAll('[data-borrar-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = items.find((x) => String(x.id) === btn.dataset.borrarItem);
        if (item) confirmarEliminarItemFerreteria(item);
      });
    });
  }

  function abrirModalEditarItemFerreteria(item) {
    const { root, cerrar } = abrirModal(`
      <div class="modal-encabezado-icono">
        <div class="modal-icono-circulo modal-icono-circulo--teal">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </div>
        <div>
          <h3 style="margin: 0; font-size: 1.15rem;">Editar ítem de ferretería</h3>
          <p style="margin: 3px 0 0; font-size: 0.82rem; color: var(--tinta-2);">
            Modifica el código, nombre o unidad de medida del material.
          </p>
        </div>
      </div>
      <form id="form-editar-item" style="margin-top: 18px;">
        <label class="campo">
          <span>Código</span>
          <input type="text" name="codigo" value="${escapeHtml(item.codigo)}" pattern="[a-z0-9_]+" title="Solo minúsculas, números o guion bajo" required>
        </label>
        <label class="campo" style="margin-top: 12px;">
          <span>Nombre</span>
          <input type="text" name="nombre" value="${escapeHtml(item.nombre)}" required autofocus>
        </label>
        <label class="campo" style="margin-top: 12px;">
          <span>Unidad de medida</span>
          <select name="unidad_medida">
            <option value="unidad" ${item.unidad_medida === 'unidad' ? 'selected' : ''}>Unidad</option>
            <option value="metro" ${item.unidad_medida === 'metro' ? 'selected' : ''}>Metro</option>
          </select>
        </label>
        <div class="modal-acciones" style="margin-top: 22px;">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--primario">Guardar cambios</button>
        </div>
      </form>
    `);

    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-editar-item').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const $submit = ev.target.querySelector('button[type="submit"]');
      if ($submit.disabled) return;
      $submit.disabled = true;
      const fd = new FormData(ev.target);
      const payload = {
        id: item.id,
        codigo: fd.get('codigo').trim(),
        nombre: fd.get('nombre').trim(),
        unidad_medida: fd.get('unidad_medida'),
      };
      try {
        const { datos, encolado } = await conColaSiHaceFalta('editar_item_ferreteria', payload, () =>
          api(`/admin/catalogo/items-ferreteria/${item.id}`, {
            method: 'PUT',
            body: { codigo: payload.codigo, nombre: payload.nombre, unidad_medida: payload.unidad_medida },
          })
        );
        cerrar();
        if (encolado) {
          toast(`Ítem "${payload.nombre}" guardado sin conexión.`, 'neutro');
        } else {
          toast(`Ítem "${payload.nombre}" actualizado.`, 'ok');
          items = datos.items;
          pintarTablaItemsFerreteria();
        }
      } catch (e) {
        toast(e.message, 'malo');
        $submit.disabled = false;
      }
    });
  }

  function confirmarEliminarItemFerreteria(item) {
    const { root, cerrar } = abrirModal(`
      <div class="modal-encabezado-icono">
        <div class="modal-icono-circulo modal-icono-circulo--malo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </div>
        <div>
          <h3 style="margin: 0; font-size: 1.15rem;">¿Eliminar ítem "${escapeHtml(item.nombre)}"?</h3>
          <p style="margin: 3px 0 0; font-size: 0.82rem; color: var(--tinta-2);">
            Código: <code class="celda-mono">${escapeHtml(item.codigo)}</code><br>
            Si no tiene movimientos ni órdenes en el historial, se eliminará definitivamente. Si ya tiene movimientos registrados, se desactivará del catálogo para preservar los registros.
          </p>
        </div>
      </div>
      <div class="modal-acciones" style="margin-top: 22px;">
        <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
        <button type="button" class="btn btn--malo" id="btn-confirmar">Sí, eliminar</button>
      </div>
    `);

    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#btn-confirmar').addEventListener('click', async () => {
      const $btn = root.querySelector('#btn-confirmar');
      if ($btn.disabled) return;
      $btn.disabled = true;
      try {
        const { datos, encolado } = await conColaSiHaceFalta('eliminar_item_ferreteria', { id: item.id }, () =>
          api(`/admin/catalogo/items-ferreteria/${item.id}`, { method: 'DELETE' })
        );
        cerrar();
        if (encolado) {
          toast(`Ítem "${item.nombre}" eliminado sin conexión.`, 'neutro');
        } else {
          toast(datos?.resultado?.mensaje || `Ítem "${item.nombre}" eliminado.`, 'ok');
          items = datos.items;
          pintarTablaItemsFerreteria();
        }
      } catch (e) {
        toast(e.message, 'malo');
        $btn.disabled = false;
      }
    });
  }

  // -------------------------------------------------------- Buscar por serie --
  async function renderBuscar() {
    $contenido.innerHTML = `
      <form id="form-buscar-serie" class="form-fila">
        <label class="campo campo--inline" style="flex: 1;">
          <span>N° de serie (parcial o completo)</span>
          <input type="text" name="q" placeholder="Ej: 89342" required>
        </label>
        <button type="submit" class="btn btn--primario">Buscar</button>
      </form>
      <div id="resultado-buscar"></div>
    `;
    const $resultado = $contenido.querySelector('#resultado-buscar');
    $contenido.querySelector('#form-buscar-serie').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const q = new FormData(ev.target).get('q').trim();
      if (!q) return;
      $resultado.innerHTML = '<p class="vacio">Buscando…</p>';
      try {
        const { equipos } = await api(`/admin/equipos/buscar?q=${encodeURIComponent(q)}`);
        if (!equipos.length) {
          $resultado.innerHTML = '<p class="vacio">No hay ningún equipo con esa serie.</p>';
          return;
        }
        $resultado.innerHTML = `
          <table class="tabla">
            <thead><tr><th>Serie</th><th>Tipo</th><th>Estado</th><th>Técnico</th><th></th></tr></thead>
            <tbody>
              ${equipos.map((e) => `
                <tr data-id="${e.id}">
                  <td class="celda-mono">${escapeHtml(e.numero_serie)}</td>
                  <td>${escapeHtml(e.tipo_equipo_nombre)}</td>
                  <td>${badge(e.estado)}</td>
                  <td>${escapeHtml(e.tecnico_nombre || '—')}</td>
                  <td class="celda-acciones"><button type="button" class="btn btn--secundario btn--chico btn-historial">Ver historial</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div id="historial-equipo"></div>
        `;
        $resultado.querySelectorAll('.btn-historial').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = Number(btn.closest('tr').dataset.id);
            cargarHistorial(id);
          });
        });
      } catch (e) {
        $resultado.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
      }
    });

    async function cargarHistorial(equipoId) {
      const $historial = $resultado.querySelector('#historial-equipo');
      $historial.innerHTML = '<p class="vacio">Cargando…</p>';
      try {
        const { equipo, movimientos } = await api(`/admin/equipos/${equipoId}/historial`);
        $historial.innerHTML = `
          <h3>Historial de ${escapeHtml(equipo.numero_serie)}</h3>
          ${filaHistorialHtml(movimientos)}
        `;
      } catch (e) {
        $historial.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
      }
    }
  }

  // -------------------------------------------------------- Ubicaciones --
  // Antes "Bodegas" — se renombra para no confundir con el nombre de la
  // sección entera ("Bodega" en el nav de arriba).
  async function renderUbicaciones() {
    $contenido.innerHTML = `
      <form id="form-nueva-bodega" class="form-fila">
        <label class="campo campo--inline">
          <span>Nombre de la ubicación</span>
          <input type="text" name="nombre" placeholder="Ej: Bodega Valparaíso" required>
        </label>
        <button type="submit" class="btn btn--primario">Crear ubicación</button>
      </form>
      <div id="tabla-bodegas"></div>
    `;
    $contenido.querySelector('#form-nueva-bodega').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const nombre = new FormData(ev.target).get('nombre').trim();
      try {
        const { encolado } = await conColaSiHaceFalta('crear_bodega', { nombre }, () => api('/admin/bodegas', { method: 'POST', body: { nombre } }));
        ev.target.reset();
        if (encolado) {
          toast(`"${nombre}" guardada sin conexión — se creará al recuperar señal.`, 'neutro');
        } else {
          toast(`"${nombre}" creada.`, 'ok');
          const { bodegas: actualizadas } = await api('/admin/bodegas');
          bodegas = actualizadas;
          pintarTablaBodegas();
        }
      } catch (e) {
        toast(e.message, 'malo');
      }
    });
    pintarTablaBodegas();
  }

  function pintarTablaBodegas() {
    const $tabla = $contenido.querySelector('#tabla-bodegas');
    if (!$tabla) return;
    $tabla.innerHTML = `
      <table class="tabla">
        <thead><tr><th>Nombre</th></tr></thead>
        <tbody>${bodegas.map((b) => `<tr><td>${escapeHtml(b.nombre)}</td></tr>`).join('')}</tbody>
      </table>
    `;
  }

  // La URL puede pedir un submenú puntual (ej. #bodega?vista=tecnicos
  // desde el acceso rápido de Inicio, o #bodega?tab=asignar desde el link
  // "→ Asignar a técnicos" de la tabla de Equipos — implica vista=principal).
  await activarVista(params.vista === 'tecnicos' ? 'tecnicos' : 'principal');
}
