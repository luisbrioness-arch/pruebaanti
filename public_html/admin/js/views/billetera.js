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
          "Cerrar período" agarra TODO lo que un técnico tenga aprobado (órdenes) o instalado (ventas)
          y sin liquidar todavía — no hace falta elegir fechas a mano, así nada se queda afuera por
          aprobarse después de que "ya se cerró el mes".
        </p>
      </div>

      <div id="saldos-resumen"><p class="vacio">Cargando…</p></div>

      <label class="campo campo--inline" style="margin-top: 16px;">
        <span>Ver detalle de</span>
        <select id="select-tecnico"><option value="">Elige un técnico</option></select>
      </label>

      <div id="detalle-tecnico"></div>
    </section>
  `));

  const $resumen = container.querySelector('#saldos-resumen');
  const $select = container.querySelector('#select-tecnico');
  const $detalle = container.querySelector('#detalle-tecnico');

  const [{ usuarios }, { saldos }] = await Promise.all([
    api('/admin/usuarios'),
    api('/admin/billetera/saldos'),
  ]);

  for (const u of usuarios) {
    $select.appendChild(el(`<option value="${u.id}">${escapeHtml(u.nombre)}</option>`));
  }
  $select.addEventListener('change', () => {
    if ($select.value) cargarDetalle(Number($select.value));
  });

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
        $select.value = btn.dataset.id;
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
          <button type="button" class="btn btn--primario" id="btn-cerrar-periodo" style="margin-top: 10px;">Cerrar período</button>
        ` : '<p class="vacio">No hay nada pendiente de liquidar ahora mismo.</p>'}
      </div>

      <div class="form-fila">
        <button type="button" class="btn btn--secundario" id="btn-registrar-pago">Registrar pago</button>
        <button type="button" class="btn btn--secundario" id="btn-registrar-ajuste">Ajuste manual</button>
      </div>

      <h3>Historial de cierres</h3>
      ${resumen.periodos.length ? `
        <table class="tabla">
          <thead><tr><th>Cerrado</th><th>Rango</th><th>Órdenes</th><th>Ventas</th><th>Total</th><th>Por</th></tr></thead>
          <tbody>
            ${resumen.periodos.map((p) => `
              <tr>
                <td>${formatDateTime(p.creado_en)}</td>
                <td>${formatDateTime(p.fecha_desde)} — ${formatDateTime(p.fecha_hasta)}</td>
                <td>${formatMoney(p.monto_ordenes)}</td>
                <td>${formatMoney(p.monto_ventas)}</td>
                <td>${formatMoney(p.monto_total)}</td>
                <td>${escapeHtml(p.cerrado_por_nombre)}</td>
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

    $detalle.querySelector('#btn-cerrar-periodo')?.addEventListener('click', () => abrirModalCerrar(tecnicoId, nombreTecnico, pendiente));
    $detalle.querySelector('#btn-registrar-pago').addEventListener('click', () => abrirModalPago(tecnicoId, nombreTecnico));
    $detalle.querySelector('#btn-registrar-ajuste').addEventListener('click', () => abrirModalAjuste(tecnicoId, nombreTecnico));
  }

  function abrirModalCerrar(tecnicoId, nombreTecnico, pendiente) {
    const { root, cerrar } = abrirModal(`
      <h3>Cerrar período de ${escapeHtml(nombreTecnico)}</h3>
      <p class="modal-explicacion">
        Se van a marcar como liquidadas ${pendiente.ordenes.length} orden(es) y ${pendiente.ventas.length} venta(s),
        por un total de ${formatMoney(pendiente.monto_total)}. Esto queda acreditado en la billetera —
        no es lo mismo que pagarle de verdad (eso se registra aparte, en "Registrar pago").
      </p>
      <form id="form-cerrar">
        <label class="campo">
          <span>Observaciones (opcional)</span>
          <textarea name="observaciones" rows="2"></textarea>
        </label>
        <div class="modal-acciones">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--primario">Cerrar período</button>
        </div>
      </form>
    `);
    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-cerrar').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      // Doble clic = dos peticiones en paralelo; en "cerrar período" eso
      // llegaba a acreditar dos veces el mismo trabajo (el bloqueo en el
      // servidor ya lo corta, esto evita siquiera intentarlo).
      const $submit = ev.target.querySelector('button[type="submit"]');
      if ($submit.disabled) return;
      $submit.disabled = true;
      const observaciones = new FormData(ev.target).get('observaciones') || null;
      const payload = { observaciones };
      try {
        const { encolado } = await conColaSiHaceFalta(
          'cerrar_periodo', { tecnicoId, ...payload },
          () => api(`/admin/billetera/${tecnicoId}/cerrar`, { method: 'POST', body: payload })
        );
        cerrar();
        if (encolado) {
          toast(`Cierre de ${nombreTecnico} guardado sin conexión — se aplicará al recuperar señal.`, 'neutro');
        } else {
          toast(`Período de ${nombreTecnico} cerrado.`, 'ok');
          await cargarDetalle(tecnicoId);
          await refrescarSaldos();
        }
      } catch (e) {
        toast(e.message, 'malo');
        $submit.disabled = false; // permitir reintentar tras un error
      }
    });
  }

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
