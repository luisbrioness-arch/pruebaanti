// Paso 1 — crear la orden. Es la única vez que se decide folio y tipo de
// servicio: no hay endpoint para cambiarlos después (ver wizard.js).
import { api, ApiError } from '../../api.js';
import { el, escapeHtml } from '../../utils.js';
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
        <label class="campo">
          <span>Tipo de servicio</span>
          <select name="tipo_servicio" required>
            <option value="" disabled selected>Elige uno</option>
            ${catalogo.map((t) => `<option value="${escapeHtml(t.codigo)}">${escapeHtml(t.nombre)}</option>`).join('')}
          </select>
        </label>
        <label class="campo">
          <span>Folio</span>
          <input type="text" name="folio" inputmode="numeric" autocomplete="off" required>
        </label>
        <label class="campo" id="campo-venta" hidden>
          <span>¿Viene de una venta tuya?</span>
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
  const $selectTipoServicio = seccion.querySelector('select[name="tipo_servicio"]');

  // Enlazar una venta solo tiene sentido en "Instalación nueva" — es lo
  // único que usa venta_id (decide si la instalación cobra según el plan
  // vendido, ver OrdenWizardService::calcularMontoBruto). En los demás
  // tipos de servicio el campo no aplica y se oculta.
  let hayVentasPendientes = false;
  function actualizarVisibilidadVenta() {
    const mostrar = hayVentasPendientes && $selectTipoServicio.value === 'instalacion_nueva';
    $campoVenta.hidden = !mostrar;
    if (!mostrar) $selectVenta.value = ''; // no arrastrar una venta elegida si el técnico cambia de tipo de servicio
  }
  $selectTipoServicio.addEventListener('change', actualizarVisibilidadVenta);

  api('/ventas/pendientes').then(({ ventas }) => {
    if (!ventas.length) return;
    hayVentasPendientes = true;
    for (const v of ventas) {
      const opt = document.createElement('option');
      opt.value = String(v.id);
      opt.textContent = `${v.cliente_nombre} · ${v.plan_nombre} · ${v.comuna}`;
      $selectVenta.appendChild(opt);
    }
    actualizarVisibilidadVenta();
  }).catch(() => { /* sin señal: simplemente no se ofrece el selector de venta */ });

  $btn.addEventListener('click', async () => {
    $error.hidden = true;
    const datos = Object.fromEntries(new FormData(form));
    if (!datos.tipo_servicio || !datos.folio) {
      $error.textContent = 'Elige el tipo de servicio y escribe el folio.';
      $error.hidden = false;
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
