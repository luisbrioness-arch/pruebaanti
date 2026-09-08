// Paso 1 — crear la orden. Es la única vez que se decide folio y tipo de
// servicio: no hay endpoint para cambiarlos después (ver wizard.js).
import { api, ApiError } from '../../api.js';
import { el, escapeHtml, iconoTipoServicio } from '../../utils.js';
import { toast } from '../../toast.js';
import { setCatalogo } from '../../storage.js';
import { encolar } from '../../offline.js';

export async function renderPaso1(container, ctx) {
  let catalogo = ctx.getCatalogo();
  if (!catalogo || !catalogo.length) {
    try {
      const { tipos_servicio } = await api('/catalogo/tipos-servicio');
      catalogo = tipos_servicio;
      setCatalogo(tipos_servicio);
    } catch (e) {
      container.appendChild(el(`
        <section class="wizard-paso">
          <p class="vacio vacio--error">No se pudo cargar el catálogo de servicios — revisa tu señal e inténtalo de nuevo.</p>
        </section>
      `));
      return;
    }
  }

  const seccion = el(`
    <div style="display: contents;">
    <section class="wizard-paso">
      <h2>¿Qué trabajo es?</h2>
      <form class="paso1-form" id="form-paso1" novalidate>
        <div class="campo">
          <span style="font-weight: 700; font-size: 0.95rem; margin-bottom: 6px; display: block;">Tipo de servicio</span>
          <input type="hidden" name="tipo_servicio" id="input-tipo-servicio" value="">
          <div class="grupo-botones-servicio" id="grupo-botones-servicio">
            ${catalogo.map((t) => {
              const icono = iconoTipoServicio(t.codigo);
              return `
                <button type="button" class="btn-servicio-card" data-codigo="${escapeHtml(t.codigo)}">
                  <span class="btn-servicio-icono">${icono}</span>
                  <span class="btn-servicio-nombre">${escapeHtml(t.nombre)}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
        <label class="campo" style="margin-top: 14px;">
          <span>Folio</span>
          <input type="text" name="folio" inputmode="numeric" autocomplete="off" placeholder="Ej: 58207" required>
        </label>
        <label class="campo" id="campo-venta" hidden>
          <span>¿Viene de una venta pendiente?</span>
          <select name="venta_id">
            <option value="">No, no viene de una venta</option>
          </select>
        </label>
        <p class="campo-error" id="paso1-error" hidden></p>
      </form>
    </section>
    <div class="wizard-acciones">
      <button type="button" class="btn btn--primario btn--ancho" id="paso1-siguiente">Siguiente</button>
    </div>
    </div>
  `);
  container.appendChild(seccion);

  const form = seccion.querySelector('#form-paso1');
  const $error = seccion.querySelector('#paso1-error');
  const $btn = seccion.querySelector('#paso1-siguiente');
  const $campoVenta = seccion.querySelector('#campo-venta');
  const $selectVenta = $campoVenta.querySelector('select');
  const $inputTipoServicio = seccion.querySelector('#input-tipo-servicio');
  const $grupoBotones = seccion.querySelector('#grupo-botones-servicio');
  const $botonesServicio = $grupoBotones.querySelectorAll('.btn-servicio-card');

  // Enlazar una venta solo tiene sentido en "Instalación nueva" — es lo
  // único que usa venta_id (decide si la instalación cobra según el plan
  // vendido, ver OrdenWizardService::calcularMontoBruto). En los demás
  // tipos de servicio el campo no aplica y se oculta.
  let hayVentasPendientes = false;
  function actualizarVisibilidadVenta() {
    const mostrar = hayVentasPendientes && $inputTipoServicio.value === 'instalacion_nueva';
    $campoVenta.hidden = !mostrar;
    if (!mostrar) $selectVenta.value = ''; // no arrastrar una venta elegida si el técnico cambia de tipo de servicio
  }

  $botonesServicio.forEach((boton) => {
    boton.addEventListener('click', () => {
      const codigo = boton.dataset.codigo;
      $inputTipoServicio.value = codigo;
      $botonesServicio.forEach((b) => b.classList.toggle('activo', b === boton));
      $error.hidden = true;
      actualizarVisibilidadVenta();
    });
  });

  // Pedido: "si la venta viene de otro lugar ya sea directa de tuvez o
  // otro tecnico esa no se paga al que instala si no al que vendio" — acá
  // ya no son solo "mis" ventas (ver VentaController::pendientes), así que
  // cada opción muestra quién la vendió para que quede claro que la
  // comisión de esa venta es de otra persona, no de quien instala.
  api('/ventas/pendientes').then(({ ventas }) => {
    if (!ventas.length) return;
    hayVentasPendientes = true;
    for (const v of ventas) {
      const opt = document.createElement('option');
      opt.value = String(v.id);
      opt.textContent = `${v.cliente_nombre} · ${v.plan_nombre} · ${v.comuna} · vendió: ${v.vendedor_nombre || 'TuVes (directo)'}`;
      $selectVenta.appendChild(opt);
    }
    actualizarVisibilidadVenta();
  }).catch(() => { /* sin señal: simplemente no se ofrece el selector de venta */ });

  $btn.addEventListener('click', async () => {
    $error.hidden = true;
    const datos = Object.fromEntries(new FormData(form));
    if (!datos.tipo_servicio) {
      $error.textContent = 'Selecciona el tipo de servicio presionando uno de los botones.';
      $error.hidden = false;
      return;
    }
    if (!datos.folio) {
      $error.textContent = 'Escribe el número de folio.';
      $error.hidden = false;
      form.elements.folio.focus();
      return;
    }

    const tipoServicioObj = catalogo.find((t) => t.codigo === datos.tipo_servicio) || null;
    const cuerpo = {
      uuid_dispositivo: ctx.uuid,
      folio: datos.folio.trim(),
      tipo_servicio: datos.tipo_servicio,
      venta_id: datos.venta_id || undefined,
    };

    $btn.disabled = true;
    $btn.textContent = 'Creando…';
    try {
      const nuevaOrden = await api('/ordenes', { method: 'POST', body: cuerpo });
      ctx.setOrden(nuevaOrden, tipoServicioObj);
      await ctx.irPaso(2);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'sin_conexion') {
        // Nota: una venta enlazada elegida sin conexión no se puede confirmar
        // acá (no hay forma de saber si sigue "registrada") — el servidor la
        // valida igual cuando la cola mande esto, y si ya no aplica, rechaza
        // solo esta acción sin tocar el resto de la orden.
        await encolar('crear_orden', ctx.uuid, cuerpo).catch(() => {
          $error.textContent = 'No se pudo guardar sin conexión en este dispositivo.';
          $error.hidden = false;
          $btn.disabled = false;
          $btn.textContent = 'Siguiente';
          throw e;
        });
        ctx.setOrden({
          id: null,
          uuid_dispositivo: ctx.uuid,
          folio: cuerpo.folio,
          tipo_servicio_id: tipoServicioObj?.id ?? null,
          venta_id: cuerpo.venta_id ? Number(cuerpo.venta_id) : null,
          estado: 'borrador',
          monto_bruto: null, porcentaje_aplicado: null, monto_tecnico: null,
          senal_porcentaje: null, calidad_porcentaje: null, metros_cable: null, observaciones: null,
          creado_por_admin: 0,
          creado_en: new Date().toISOString(),
          materiales: [], fotos: [], ferreteria: [],
        }, tipoServicioObj);
        toast('Sin conexión — guardado en este celular, se enviará cuando haya señal.', 'neutro', 6000);
        await ctx.irPaso(2);
        return;
      }
      $error.textContent = e.message;
      $error.hidden = false;
      $btn.disabled = false;
      $btn.textContent = 'Siguiente';
    }
  });
}
