import { api } from '../api.js';
import { toast } from '../toast.js';
import { conColaSiHaceFalta } from '../offline.js';
import { badge, escapeHtml, el, formatDateTime, MOVIMIENTO_EQUIPO_LABEL } from '../utils.js';
import { abrirScanner } from '../scanner.js';
import { abrirModal } from '../modal.js';

/** Días corridos desde una fecha del servidor (formato "YYYY-MM-DD HH:mm:ss") — para los avisos de "esto lleva mucho esperando" (mejora 3). */
function diasDesde(fechaServidor) {
  const ms = Date.now() - new Date(String(fechaServidor).replace(' ', 'T')).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
const DIAS_AVISO_PENDIENTE = 3;

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
      ${filaHistorialHtml(movimientos)}
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
export async function renderBodega(container, params = {}) {
  container.appendChild(el(`
    <section class="bodega">
      <nav class="subtabs subtabs--nivel1">
        <button type="button" class="subtab subtab--activo" data-vista="principal">Bodega principal</button>
        <button type="button" class="subtab" data-vista="tecnicos">Bodega técnicos</button>
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
  // Pedido: "que los tecnicos como son pocos aparezcan en pestañas
  // seleccionables y que ahi se despliegue su bodega" — reemplaza el
  // <select> por una pestaña por técnico (mismo patrón visual que las demás
  // sub-navegaciones de este archivo: .subtabs / .subtab).
  async function renderVistaTecnicos() {
    const lista = tecnicos();
    $nivel2.innerHTML = `
      <nav class="subtabs subtabs--tecnicos">
        ${lista.map((t) => `<button type="button" class="subtab" data-tecnico-id="${t.id}">${escapeHtml(t.nombre)}</button>`).join('')}
      </nav>
      <div id="contenido-tecnico"></div>
    `;
    const $botones = Array.from($nivel2.querySelectorAll('.subtabs--tecnicos .subtab'));
    $botones.forEach((btn) => {
      btn.addEventListener('click', () => {
        $botones.forEach((b) => b.classList.toggle('subtab--activo', b === btn));
        cargarBodegaTecnico(Number(btn.dataset.tecnicoId));
      });
    });
    if (lista.length === 1) $botones[0].click();
  }

  async function cargarBodegaTecnico(tecnicoId) {
    const $div = $nivel2.querySelector('#contenido-tecnico');
    $div.innerHTML = '<p class="vacio">Cargando…</p>';
    try {
      const [{ equipos: equiposTecnico }, { stock }] = await Promise.all([
        api(`/admin/equipos?estado=maleta&tecnico_id=${tecnicoId}`),
        api(`/admin/ferreteria/stock?tecnico_id=${tecnicoId}`),
      ]);
      $div.innerHTML = `
        <div class="form-fila" style="margin: 10px 0;">
          <a href="#guia?tecnicoId=${tecnicoId}" class="btn btn--secundario">🖨 Ver guía de despacho pendiente</a>
        </div>
        <h3>Equipos en su maleta (${equiposTecnico.length})</h3>
        ${equiposTecnico.length ? `
          <table class="tabla">
            <thead><tr><th>Serie</th><th>Tipo</th></tr></thead>
            <tbody>${equiposTecnico.map((e) => `<tr><td class="celda-mono">${escapeHtml(e.numero_serie)}</td><td>${escapeHtml(e.tipo_equipo_nombre)}</td></tr>`).join('')}</tbody>
          </table>
        ` : '<p class="vacio">No tiene equipos en su maleta.</p>'}

        <h3>Ferretería confirmada</h3>
        ${stock.length ? `
          <table class="tabla">
            <thead><tr><th>Ítem</th><th>Cantidad</th></tr></thead>
            <tbody>${stock.map((s) => `<tr><td>${escapeHtml(s.item_nombre)}</td><td class="${Number(s.cantidad_actual) < 0 ? 'celda-negativa' : ''}">${s.cantidad_actual} ${escapeHtml(s.unidad_medida)}</td></tr>`).join('')}</tbody>
          </table>
        ` : '<p class="vacio">Sin ferretería confirmada.</p>'}
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
        <button type="button" class="subtab subtab--activo" data-tab="equipos">Equipos</button>
        <button type="button" class="subtab" data-tab="asignar">Asignar a técnicos</button>
        <button type="button" class="subtab" data-tab="ferreteria">Ferretería</button>
        <button type="button" class="subtab" data-tab="catalogo">Catálogo</button>
        <button type="button" class="subtab" data-tab="buscar">Buscar por serie</button>
        <button type="button" class="subtab" data-tab="ubicaciones">Ubicaciones</button>
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
  // Ahora es solo inventario: ver, filtrar, dar de alta, marcar falla de
  // fábrica, registrar el reingreso de un retiro. Asignar/traspasar vive en
  // su propia pestaña (ver renderAsignar).
  async function renderEquipos() {
    $contenido.innerHTML = `
      <form id="form-alta" class="form-fila">
        <label class="campo campo--inline">
          <span>Tipo</span>
          <select name="tipo_equipo" required>
            ${tiposEquipo.map((t) => `<option value="${t.codigo}">${escapeHtml(t.nombre)}</option>`).join('')}
          </select>
        </label>
        <label class="campo campo--inline">
          <span>N° de serie</span>
          <input type="text" name="numero_serie" id="input-numero-serie" placeholder="Ej: 8934221100561" required>
        </label>
        <label class="campo campo--inline">
          <span>Bodega</span>
          <select name="bodega_id" required>${opcionesBodegas()}</select>
        </label>
        <button type="button" class="btn btn--secundario" id="btn-escanear-serie" title="Escanear código de barras">📷 Escanear</button>
        <button type="submit" class="btn btn--primario">Dar de alta en bodega</button>
      </form>

      <label class="campo campo--inline">
        <span>Filtrar por estado</span>
        <select id="filtro-estado-equipo">
          <option value="">Todos</option>
          <option value="bodega">En bodega</option>
          <option value="maleta">En maleta</option>
          <option value="en_transito">En tránsito (pendiente)</option>
          <option value="instalado">Instalado</option>
          <option value="retirado">Retirado</option>
          <option value="falla_fabrica">Falla de fábrica</option>
        </select>
      </label>

      <div id="tabla-equipos"><p class="vacio">Cargando…</p></div>
    `;

    const $filtro = $contenido.querySelector('#filtro-estado-equipo');
    $filtro.addEventListener('change', () => cargarTablaEquipos($filtro.value));

    $contenido.querySelector('#btn-escanear-serie').addEventListener('click', async () => {
      const resultado = await abrirScanner();
      if (resultado) $contenido.querySelector('#input-numero-serie').value = resultado.serie;
    });

    $contenido.querySelector('#form-alta').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const payload = { tipo_equipo: fd.get('tipo_equipo'), numero_serie: fd.get('numero_serie').trim(), bodega_id: Number(fd.get('bodega_id')) };
      try {
        const { datos, encolado } = await conColaSiHaceFalta('alta_equipo', payload, () => api('/admin/equipos', { method: 'POST', body: payload }));
        ev.target.reset();
        if (encolado) {
          // No se refresca la tabla: sin conexión no hay forma de saber el
          // estado real, y mostrar un error de red justo después del aviso
          // de "guardado" confundiría más de lo que ayuda.
          toast(`Serie ${payload.numero_serie} guardada sin conexión — se dará de alta al recuperar señal.`, 'neutro');
        } else {
          toast(`Equipo ${datos.numero_serie} dado de alta en bodega.`, 'ok');
          await cargarTablaEquipos($filtro.value);
        }
      } catch (e) {
        toast(e.message, 'malo');
      }
    });

    await cargarTablaEquipos('');
  }

  async function cargarTablaEquipos(estado) {
    const $tabla = $contenido.querySelector('#tabla-equipos');
    try {
      const qs = estado ? `?estado=${encodeURIComponent(estado)}` : '';
      const { equipos } = await api(`/admin/equipos${qs}`);
      if (!equipos.length) {
        $tabla.innerHTML = '<p class="vacio">No hay equipos en este estado.</p>';
        return;
      }
      $tabla.innerHTML = `
        <table class="tabla">
          <thead><tr><th>Serie</th><th>Tipo</th><th>Estado</th><th>Técnico / Bodega</th><th>Acciones</th></tr></thead>
          <tbody></tbody>
        </table>
      `;
      const $tbody = $tabla.querySelector('tbody');
      for (const e of equipos) {
        const tr = el(`
          <tr>
            <td class="celda-mono">${escapeHtml(e.numero_serie)}</td>
            <td>${escapeHtml(e.tipo_equipo_nombre)}</td>
            <td>${badge(e.estado)}</td>
            <td>${escapeHtml(e.tecnico_nombre || e.bodega_nombre || '—')}</td>
            <td class="celda-acciones"></td>
          </tr>
        `);
        const $acciones = tr.querySelector('.celda-acciones');

        /** Sin conexión no hay fila nueva que pintar (el servidor decide el estado real) — se marca esta fila como "en camino" y se le quitan más acciones hasta que se sepa de verdad. */
        function marcarFilaPendiente(mensaje) {
          $acciones.innerHTML = `<span class="chip chip--alerta">⏳ ${escapeHtml(mensaje)}</span>`;
        }

        if (e.estado === 'bodega' || e.estado === 'maleta') {
          $acciones.appendChild(el('<a href="#bodega?tab=asignar" class="campo-ayuda">→ Asignar a técnicos</a>'));
        }
        if (e.estado === 'en_transito') {
          const dias = diasDesde(e.actualizado_en);
          const texto = dias >= DIAS_AVISO_PENDIENTE
            ? `⚠ Esperando hace ${dias} días que ${escapeHtml(e.tecnico_nombre || 'el técnico')} confirme`
            : `⏳ Esperando que ${escapeHtml(e.tecnico_nombre || 'el técnico')} confirme`;
          const $chip = el(`<span class="chip ${dias >= DIAS_AVISO_PENDIENTE ? 'chip--malo' : 'chip--alerta'}">${texto}</span>`);
          const btnCancelar = el('<button type="button" class="btn btn--secundario btn--chico">Cancelar envío</button>');
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
        }
        // Pedido: "nos falta una bodega de reversa donde lleguen los con
        // falla, retiro o reparaciones" — tanto "retirado" (vuelve de
        // instalar) como "falla_fabrica" (salió malo / está en reparación)
        // se reingresan con el mismo formulario, eligiendo a qué bodega
        // física llega (puede ser una dedicada, ej. "Bodega Reversa",
        // creada como cualquier otra desde Ubicaciones).
        if (['retirado', 'falla_fabrica'].includes(e.estado)) {
          const form = el(`
            <form class="form-inline">
              <select name="bodega_id" required>${opcionesBodegas()}</select>
              <button type="submit" class="btn btn--secundario btn--chico">${e.estado === 'retirado' ? 'Ingresó a bodega' : 'Reingresar (reparado)'}</button>
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
        }
        if (e.estado === 'instalado') {
          const btnRastreo = el('<button type="button" class="btn btn--secundario btn--chico">🔎 Rastreo</button>');
          btnRastreo.addEventListener('click', () => abrirRastreoEquipo(e.id, e.numero_serie));
          $acciones.appendChild(btnRastreo);
        }
        if (!['falla_fabrica', 'devuelto_tuves', 'perdido'].includes(e.estado)) {
          const form = el(`
            <form class="form-inline">
              <select name="bodega_id" required>${opcionesBodegas()}</select>
              <button type="submit" class="btn btn--malo btn--chico">Falla de fábrica</button>
            </form>
          `);
          form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const bodegaId = Number(new FormData(ev.target).get('bodega_id'));
            const payload = { id: e.id, observacion: null, bodega_id: bodegaId };
            try {
              const { encolado } = await conColaSiHaceFalta('falla_fabrica', payload, () => api(`/admin/equipos/${e.id}/falla-fabrica`, { method: 'POST', body: { bodega_id: bodegaId } }));
              if (encolado) {
                toast(`${e.numero_serie}: guardado sin conexión — se marcará al recuperar señal.`, 'neutro');
                marcarFilaPendiente('falla de fábrica pendiente');
              } else {
                toast(`${e.numero_serie} marcado como falla de fábrica.`, 'alerta');
                await cargarTablaEquipos(estado);
              }
            } catch (err) { toast(err.message, 'malo'); }
          });
          $acciones.appendChild(form);
        }
        $tbody.appendChild(tr);
      }
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
        <div class="form-fila" style="margin-bottom: 10px;">
          <button type="button" class="btn btn--secundario" id="btn-escanear-seleccionar">📷 Escanear para seleccionar</button>
          <span class="campo-ayuda">Escanea uno tras otro — se van tildando solos, sin tener que buscarlos a mano en la lista.</span>
        </div>
        <div id="acciones-masivas" class="acciones-masivas" hidden></div>
        <table class="tabla">
          <thead><tr><th></th><th>Serie</th><th>Tipo</th><th>${modo === 'bodega' ? 'Bodega' : 'Técnico'}</th><th>Acciones</th></tr></thead>
          <tbody></tbody>
        </table>
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
          <tr>
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
    $tabla.innerHTML = `
      <table class="tabla">
        <thead><tr><th>Código</th><th>Nombre</th></tr></thead>
        <tbody>${tiposEquipo.map((t) => `<tr><td class="celda-mono">${escapeHtml(t.codigo)}</td><td>${escapeHtml(t.nombre)}</td></tr>`).join('')}</tbody>
      </table>
    `;
  }

  function pintarTablaItemsFerreteria() {
    const $tabla = $contenido.querySelector('#tabla-items-ferreteria');
    if (!$tabla) return;
    $tabla.innerHTML = `
      <table class="tabla">
        <thead><tr><th>Código</th><th>Nombre</th><th>Unidad</th></tr></thead>
        <tbody>${items.map((i) => `<tr><td class="celda-mono">${escapeHtml(i.codigo)}</td><td>${escapeHtml(i.nombre)}</td><td>${escapeHtml(i.unidad_medida)}</td></tr>`).join('')}</tbody>
      </table>
    `;
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
