import { api } from '../api.js';
import { toast } from '../toast.js';
import { abrirModal } from '../modal.js';
import { conColaSiHaceFalta } from '../offline.js';
import { escapeHtml, formatMoney, formatDateTime, el } from '../utils.js';

const ETIQUETA_MOVIMIENTO = {
  liquidacion: 'Liquidación',
  pago: 'Pago',
  ajuste: 'Ajuste',
};

export async function renderBilletera(container) {
  container.appendChild(el(`
    <section class="panel-simple">
      <div class="panel-cabecera">
        <h2>Billetera</h2>
        <p class="panel-explicacion">
          El detalle de cada técnico suma todo lo que tiene aprobado (órdenes) o instalado (ventas)
          y sin liquidar todavía. El cierre final del mes se hace aparte, con el total acumulado —
          por ahora acá solo se ve el detalle, sin un botón de "Cerrar período".
        </p>
      </div>

      <div id="saldos-resumen"><p class="vacio">Cargando…</p></div>

      <label class="campo" style="margin-top: 16px;">
        <span>Ver detalle de</span>
        <nav class="subtabs subtabs--tecnicos" id="subtabs-tecnico"></nav>
      </label>

      <div id="detalle-tecnico"></div>
    </section>
  `));

  const $resumen = container.querySelector('#saldos-resumen');
  const $subtabsTecnico = container.querySelector('#subtabs-tecnico');
  const $detalle = container.querySelector('#detalle-tecnico');

  const [{ usuarios }, { saldos }] = await Promise.all([
    api('/admin/usuarios'),
    api('/admin/billetera/saldos'),
  ]);

  // Pedido: "mismo caso aqui como son pocos tecnicos que los nombres enten
  // en un submenu" — mismo criterio que ya se usó en Bodega técnicos:
  // como son pocos, una pestaña por técnico en vez de un <select>.
  for (const u of usuarios) {
    const btn = el(`<button type="button" class="subtab" data-id="${u.id}">${escapeHtml(u.nombre)}</button>`);
    btn.addEventListener('click', () => {
      marcarTecnicoActivo(u.id);
      cargarDetalle(Number(u.id));
    });
    $subtabsTecnico.appendChild(btn);
  }

  function marcarTecnicoActivo(tecnicoId) {
    $subtabsTecnico.querySelectorAll('.subtab').forEach((b) => {
      b.classList.toggle('subtab--activo', String(b.dataset.id) === String(tecnicoId));
    });
  }

  function renderResumen() {
    if (!saldos.length) {
      $resumen.innerHTML = '<p class="vacio">Todavía no hay ningún movimiento de billetera registrado.</p>';
      return;
    }
    $resumen.innerHTML = `
      <div class="tarjetas-saldo">
        ${saldos.map((s) => `
          <button type="button" class="tarjeta-saldo" data-id="${s.tecnico_id}">
            <span class="tarjeta-saldo-nombre">${escapeHtml(s.tecnico_nombre)}</span>
            <span class="tarjeta-saldo-monto ${Number(s.saldo) < 0 ? 'celda-negativa' : ''}">${formatMoney(s.saldo)}</span>
          </button>
        `).join('')}
      </div>
    `;
    $resumen.querySelectorAll('.tarjeta-saldo').forEach((btn) => {
      btn.addEventListener('click', () => {
        marcarTecnicoActivo(btn.dataset.id);
        cargarDetalle(Number(btn.dataset.id));
      });
    });
  }
  renderResumen();

  async function refrescarSaldos() {
    try {
      const { saldos: nuevos } = await api('/admin/billetera/saldos');
      saldos.length = 0;
      saldos.push(...nuevos);
      renderResumen();
    } catch { /* no crítico — el detalle abierto ya se actualizó solo */ }
  }

  async function cargarDetalle(tecnicoId) {
    $detalle.innerHTML = '<p class="vacio">Cargando…</p>';
    try {
      const [resumen, pendiente] = await Promise.all([
        api(`/admin/billetera/${tecnicoId}`),
        api(`/admin/billetera/${tecnicoId}/pendiente`),
      ]);
      pintarDetalle(tecnicoId, resumen, pendiente);
    } catch (e) {
      $detalle.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  function pintarDetalle(tecnicoId, resumen, pendiente) {
    const nombreTecnico = usuarios.find((u) => u.id === tecnicoId)?.nombre || `Técnico #${tecnicoId}`;

    $detalle.innerHTML = `
      <div class="resumen-bloque" style="margin-top: 16px;">
        <h3>Saldo de ${escapeHtml(nombreTecnico)}</h3>
        <p class="saldo-grande ${resumen.saldo < 0 ? 'celda-negativa' : ''}">${formatMoney(resumen.saldo)}</p>
      </div>

      <div class="resumen-bloque">
        <h3>Pendiente por liquidar</h3>
        ${pendiente.monto_total > 0 ? `
          <div class="resumen-fila"><span>${pendiente.ordenes.length} orden(es) aprobada(s)</span><span>${formatMoney(pendiente.monto_ordenes)}</span></div>
          <div class="resumen-fila"><span>${pendiente.ventas.length} venta(s) instalada(s)</span><span>${formatMoney(pendiente.monto_ventas)}</span></div>
          <div class="resumen-fila"><span><strong>Total a liquidar</strong></span><span><strong>${formatMoney(pendiente.monto_total)}</strong></span></div>
        ` : '<p class="vacio">No hay nada pendiente de liquidar ahora mismo.</p>'}
      </div>

      <div class="form-fila">
        <button type="button" class="btn btn--secundario" id="btn-registrar-pago">Registrar pago</button>
        <button type="button" class="btn btn--secundario" id="btn-registrar-ajuste">Ajuste manual</button>
      </div>

      <h3>Historial de cierres</h3>
      ${resumen.periodos.length ? `
        <table class="tabla">
          <thead><tr><th>Cerrado</th><th>Rango</th><th>Órdenes</th><th>Ventas</th><th>Total</th><th>Por</th><th style="text-align: left;"></th></tr></thead>
          <tbody>
            ${resumen.periodos.map((p) => `
              <tr>
                <td>${formatDateTime(p.creado_en)}</td>
                <td>${formatDateTime(p.fecha_desde)} — ${formatDateTime(p.fecha_hasta)}</td>
                <td>${formatMoney(p.monto_ordenes)}</td>
                <td>${formatMoney(p.monto_ventas)}</td>
                <td>${formatMoney(p.monto_total)}</td>
                <td>${escapeHtml(p.cerrado_por_nombre)}</td>
                <td><button type="button" class="btn btn--secundario btn--chico" data-ver-periodo="${p.id}">Ver detalle</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p class="vacio vacio--chico">Sin cierres todavía.</p>'}

      <h3>Movimientos de billetera</h3>
      ${resumen.movimientos.length ? `
        <table class="tabla">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Observación</th><th>Por</th></tr></thead>
          <tbody>
            ${resumen.movimientos.map((m) => `
              <tr>
                <td>${formatDateTime(m.creado_en)}</td>
                <td>${ETIQUETA_MOVIMIENTO[m.tipo_movimiento] || m.tipo_movimiento}</td>
                <td class="${Number(m.monto) < 0 ? 'celda-negativa' : ''}">${formatMoney(m.monto)}</td>
                <td>${escapeHtml(m.observacion || '—')}</td>
                <td>${escapeHtml(m.creado_por_nombre)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p class="vacio vacio--chico">Sin movimientos todavía.</p>'}
    `;

    $detalle.querySelector('#btn-registrar-pago').addEventListener('click', () => abrirModalPago(tecnicoId, nombreTecnico));
    $detalle.querySelector('#btn-registrar-ajuste').addEventListener('click', () => abrirModalAjuste(tecnicoId, nombreTecnico));
    $detalle.querySelectorAll('[data-ver-periodo]').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalDetallePeriodo(Number(btn.dataset.verPeriodo)));
    });
  }

  /**
   * Pedido/reporte #11: "aca que se vean los trabajos liquidados todo lo
   * que se ha completado como venta o instalacion" — "Historial de
   * cierres" solo mostraba el total de cada período; esto trae el detalle
   * real (qué órdenes y qué ventas específicas quedaron adentro de ESE
   * cierre puntual).
   */
  async function abrirModalDetallePeriodo(periodoId) {
    const { root, cerrar } = abrirModal(`
      <h3>Detalle del cierre</h3>
      <div id="detalle-periodo-contenido"><p class="vacio">Cargando…</p></div>
      <div class="modal-acciones">
        <button type="button" class="btn btn--secundario" id="btn-cerrar-detalle">Cerrar</button>
      </div>
    `);
    root.querySelector('#btn-cerrar-detalle').addEventListener('click', cerrar);
    const $contenido = root.querySelector('#detalle-periodo-contenido');
    try {
      const { ordenes, ventas } = await api(`/admin/billetera/periodos/${periodoId}/detalle`);
      $contenido.innerHTML = `
        <h4>Órdenes instaladas (${ordenes.length})</h4>
        ${ordenes.length ? `
          <table class="tabla">
            <thead><tr><th>Folio</th><th>Tipo</th><th>Cliente</th><th>Fecha</th><th style="text-align: left;">Monto</th></tr></thead>
            <tbody>
              ${ordenes.map((o) => `
                <tr>
                  <td>${escapeHtml(o.folio)}</td>
                  <td>${escapeHtml(o.tipo_servicio_nombre)}</td>
                  <td>${escapeHtml(o.venta_cliente_nombre || '—')}</td>
                  <td>${formatDateTime(o.fecha_trabajo_dispositivo)}</td>
                  <td>${formatMoney(o.monto_tecnico)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<p class="vacio">Ninguna.</p>'}

        <h4 style="margin-top: 20px;">Ventas instaladas (${ventas.length})</h4>
        ${ventas.length ? `
          <table class="tabla">
            <thead><tr><th>Cliente</th><th>Plan</th><th>Comuna</th><th style="text-align: left;">Monto</th></tr></thead>
            <tbody>
              ${ventas.map((v) => `
                <tr>
                  <td>${escapeHtml(v.cliente_nombre)}</td>
                  <td>${escapeHtml(v.plan_nombre)}</td>
                  <td>${escapeHtml(v.comuna)}</td>
                  <td>${formatMoney(v.monto_vendedor)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<p class="vacio">Ninguna.</p>'}
      `;
    } catch (e) {
      $contenido.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  // Pedido/reporte #16: "que no exista el concepto de 'cerrar periodo' por
  // ahora ... el cierre final se hara con el total del mes no mas" — se
  // sacó el botón "Cerrar período" y el modal que lo armaba
  // (abrirModalCerrar). El backend (POST /admin/billetera/{id}/cerrar,
  // LiquidacionService::cerrarPeriodo) sigue intacto por si se retoma más
  // adelante — esto solo saca la puerta de entrada desde el panel.

  function abrirModalPago(tecnicoId, nombreTecnico) {
    const { root, cerrar } = abrirModal(`
      <h3>Registrar pago a ${escapeHtml(nombreTecnico)}</h3>
      <p class="modal-explicacion">Para cuando Edwin ya le transfirió o le pagó en efectivo — descuenta de la billetera.</p>
      <form id="form-pago">
        <label class="campo">
          <span>Monto pagado</span>
          <input type="number" name="monto" min="1" step="1" required autofocus>
        </label>
        <label class="campo">
          <span>Observación (opcional)</span>
          <input type="text" name="observacion" placeholder="Ej: Transferencia 30/08">
        </label>
        <div class="modal-acciones">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--primario">Registrar pago</button>
        </div>
      </form>
    `);
    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-pago').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      // Doble clic = dos peticiones en paralelo; en "cerrar período" eso
      // llegaba a acreditar dos veces el mismo trabajo (el bloqueo en el
      // servidor ya lo corta, esto evita siquiera intentarlo).
      const $submit = ev.target.querySelector('button[type="submit"]');
      if ($submit.disabled) return;
      $submit.disabled = true;
      const fd = new FormData(ev.target);
      const payload = { monto: Number(fd.get('monto')), observacion: fd.get('observacion') || null };
      if (!payload.monto || payload.monto <= 0) return;
      try {
        const { encolado } = await conColaSiHaceFalta(
          'registrar_pago', { tecnicoId, ...payload },
          () => api(`/admin/billetera/${tecnicoId}/pago`, { method: 'POST', body: payload })
        );
        cerrar();
        if (encolado) {
          toast(`Pago a ${nombreTecnico} guardado sin conexión — se aplicará al recuperar señal.`, 'neutro');
        } else {
          toast('Pago registrado.', 'ok');
          await cargarDetalle(tecnicoId);
          await refrescarSaldos();
        }
      } catch (e) {
        toast(e.message, 'malo');
        $submit.disabled = false; // permitir reintentar tras un error
      }
    });
  }

  function abrirModalAjuste(tecnicoId, nombreTecnico) {
    const { root, cerrar } = abrirModal(`
      <h3>Ajuste manual — ${escapeHtml(nombreTecnico)}</h3>
      <p class="modal-explicacion">Para corregir un error puntual en la billetera. Positivo suma a favor del técnico, negativo resta.</p>
      <form id="form-ajuste">
        <label class="campo">
          <span>Monto (puede ser negativo)</span>
          <input type="number" name="monto" step="1" required autofocus>
        </label>
        <label class="campo">
          <span>Observación</span>
          <textarea name="observacion" rows="2" required placeholder="Por qué se hace este ajuste…"></textarea>
        </label>
        <div class="modal-acciones">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--primario">Registrar ajuste</button>
        </div>
      </form>
    `);
    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-ajuste').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      // Doble clic = dos peticiones en paralelo; en "cerrar período" eso
      // llegaba a acreditar dos veces el mismo trabajo (el bloqueo en el
      // servidor ya lo corta, esto evita siquiera intentarlo).
      const $submit = ev.target.querySelector('button[type="submit"]');
      if ($submit.disabled) return;
      $submit.disabled = true;
      const fd = new FormData(ev.target);
      const payload = { monto: Number(fd.get('monto')), observacion: fd.get('observacion') };
      if (!payload.monto || !payload.observacion.trim()) return;
      try {
        const { encolado } = await conColaSiHaceFalta(
          'registrar_ajuste', { tecnicoId, ...payload },
          () => api(`/admin/billetera/${tecnicoId}/ajuste`, { method: 'POST', body: payload })
        );
        cerrar();
        if (encolado) {
          toast(`Ajuste a ${nombreTecnico} guardado sin conexión — se aplicará al recuperar señal.`, 'neutro');
        } else {
          toast('Ajuste registrado.', 'ok');
          await cargarDetalle(tecnicoId);
          await refrescarSaldos();
        }
      } catch (e) {
        toast(e.message, 'malo');
        $submit.disabled = false; // permitir reintentar tras un error
      }
    });
  }
}
