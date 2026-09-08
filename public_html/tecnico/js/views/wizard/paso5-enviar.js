// Paso 5 — revisión y envío. Ver wizard-api.md: en una sola transacción el
// servidor detecta folio en conflicto, valida fotos/materiales, congela el
// monto y confirma el consumo físico de equipos y ferretería.
import { api, ApiError } from '../../api.js';
import { el, escapeHtml } from '../../utils.js';
import { eliminarBorrador } from '../../storage.js';
import { encolar } from '../../offline.js';

export async function renderPaso5(container, ctx) {
  const orden = ctx.getOrden();
  const tipoServicio = ctx.getTipoServicio();
  const instalados = orden.materiales.filter((m) => m.accion === 'instalado');
  const retirados = orden.materiales.filter((m) => m.accion === 'retirado');

  const seccion = el(`
    <div style="display: contents;">
    <section class="wizard-paso">
      <h2>Revisar y enviar</h2>

      <div class="resumen-bloque">
        <h3>Datos</h3>
        <div class="resumen-fila"><span>Folio</span><span>${escapeHtml(orden.folio)}</span></div>
        <div class="resumen-fila"><span>Servicio</span><span>${escapeHtml(tipoServicio?.nombre || '—')}</span></div>
      </div>

      <div class="resumen-bloque">
        <h3>Equipos</h3>
        ${(instalados.length === 0 && retirados.length === 0)
          ? '<p class="vacio" style="margin: 0; font-size: 0.84rem;">Sin sustitución de decodificadores (reparación / soporte técnico).</p>'
          : `
            <div class="resumen-fila"><span>Instalados</span><span>${instalados.length}</span></div>
            <div class="resumen-fila"><span>Retirados</span><span>${retirados.length}</span></div>
          `}
      </div>

      <div class="resumen-bloque">
        <h3>Fotos</h3>
        <div class="resumen-fila"><span>Subidas</span><span>${orden.fotos.length}</span></div>
      </div>

      <div class="resumen-bloque">
        <h3>Ferretería</h3>
        ${orden.ferreteria.length
          ? orden.ferreteria.map((f) => `<div class="resumen-fila"><span>${escapeHtml(f.item_nombre)}</span><span>${f.cantidad_final} ${escapeHtml(f.unidad_medida)}</span></div>`).join('')
          : '<p class="vacio">Sin ítems.</p>'}
      </div>

      ${orden.observaciones ? `
        <div class="resumen-bloque">
          <h3>📝 Nota de Cierre / Diagnóstico</h3>
          <p style="margin: 0; font-size: 0.88rem; line-height: 1.45; color: var(--tinta-1); font-style: italic;">
            "${escapeHtml(orden.observaciones)}"
          </p>
        </div>
      ` : ''}

      <div class="resumen-alerta">
        <span>⚠️</span>
        <span>Una vez enviada, esta orden ya no se puede editar desde el celular. Revisa que todo esté correcto.</span>
      </div>

      <p class="campo-error" id="paso5-error" hidden></p>
    </section>
    <div class="wizard-acciones">
      <button type="button" class="btn btn--secundario" id="paso5-atras">Atrás</button>
      <button type="button" class="btn btn--primario btn--ancho btn--grande" id="paso5-enviar">Enviar orden</button>
    </div>
    </div>
  `);
  container.appendChild(seccion);

  seccion.querySelector('#paso5-atras').addEventListener('click', () => ctx.irPaso(4));

  const $error = seccion.querySelector('#paso5-error');
  const $btn = seccion.querySelector('#paso5-enviar');

  $btn.addEventListener('click', async () => {
    $error.hidden = true;
    $btn.disabled = true;
    $btn.textContent = 'Enviando…';
    try {
      const resultado = await api(`/ordenes/${encodeURIComponent(ctx.uuid)}/enviar`, { method: 'POST' });
      eliminarBorrador(ctx.uuid);
      renderResultado(resultado, ctx);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'sin_conexion') {
        try {
          await encolar('enviar', ctx.uuid, {});
        } catch {
          $error.textContent = 'No se pudo guardar el envío sin conexión en este dispositivo.';
          $error.hidden = false;
          $btn.disabled = false;
          $btn.textContent = 'Enviar orden';
          return;
        }
        // No se marca como "enviada" (no sabemos todavía si el servidor la
        // va a aceptar) — solo que ya no se puede seguir editando desde
        // acá, igual que pasaría con orden_no_editable si el servidor ya
        // la hubiera recibido de verdad.
        ctx.setOrden({ ...ctx.getOrden(), _enviarPendiente: true });
        renderEnvioPendiente(ctx.getOrden(), ctx);
        return;
      }
      $error.textContent = e.message;
      $error.hidden = false;
      $btn.disabled = false;
      $btn.textContent = 'Enviar orden';
    }
  });
}

function renderEnvioPendiente(orden, ctx) {
  document.getElementById('wizard-paso-contenido').innerHTML = '';
  const nodo = el(`
    <section class="wizard-paso" style="justify-content: center; align-items: center; text-align: center; gap: 16px;">
      <span style="font-size: 3rem;">⏳</span>
      <h2>Envío guardado, esperando señal</h2>
      <p class="wizard-paso-intro">
        Quedó guardado en este celular y se manda solo apenas recuperes conexión.
        Esta orden ya no se puede seguir editando desde acá.
      </p>
      <button type="button" class="btn btn--primario btn--grande" id="envio-pendiente-volver">Volver al inicio</button>
    </section>
  `);
  document.getElementById('wizard-paso-contenido').appendChild(nodo);
  nodo.querySelector('#envio-pendiente-volver').addEventListener('click', () => ctx.irHome());
}

function renderResultado(orden, ctx) {
  document.getElementById('wizard-paso-contenido').innerHTML = '';
  const esConflicto = orden.estado === 'conflicto';
  const nodo = el(`
    <section class="wizard-paso" style="justify-content: center; align-items: center; text-align: center; gap: 16px;">
      <span style="font-size: 3rem;">${esConflicto ? '⚠️' : '✅'}</span>
      <h2>${esConflicto ? 'Quedó en conflicto de folio' : '¡Orden enviada!'}</h2>
      <p class="wizard-paso-intro">
        ${esConflicto
          ? `El folio ${escapeHtml(orden.folio)} ya existe en otra orden. El administrador la va a revisar — no se perdió nada de tu trabajo.`
          : `Folio ${escapeHtml(orden.folio)} enviado correctamente. Queda pendiente de revisión del administrador.`}
      </p>
      <button type="button" class="btn btn--primario btn--grande" id="resultado-volver">Volver al inicio</button>
    </section>
  `);
  document.getElementById('wizard-paso-contenido').appendChild(nodo);
  nodo.querySelector('#resultado-volver').addEventListener('click', () => ctx.irHome());
}
