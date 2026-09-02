import { api } from '../api.js';
import { el, escapeHtml } from '../utils.js';
import { irA } from '../router.js';
import { setTopbar } from '../topbar.js';
import { toast } from '../toast.js';

export async function renderVenta(container) {
  setTopbar({ titulo: 'Registrar venta', atras: () => irA('home') });

  const seccion = el(`
    <section class="wizard-paso" style="padding-bottom: 24px;">
      <p class="wizard-paso-intro">
        Deja la venta guardada acá para poder enlazarla después con la instalación,
        sea hoy mismo o cuando el cliente agende. No hace falta el RUT ni la
        dirección exacta — eso ya vive en el sistema de TuVes.
      </p>
      <form class="venta-form" id="form-venta" novalidate>
        <label class="campo">
          <span>N° de venta TuVes</span>
          <input type="text" name="numero_venta_tuves" inputmode="numeric" required>
        </label>
        <label class="campo">
          <span>Nombre del cliente</span>
          <input type="text" name="cliente_nombre" required>
        </label>
        <label class="campo">
          <span>Comuna</span>
          <input type="text" name="comuna" required>
        </label>
        <label class="campo">
          <span>Plan</span>
          <select name="plan" required>
            <option value="" disabled selected>Cargando planes…</option>
          </select>
        </label>
        <p class="campo-error" id="venta-error" hidden></p>
        <button type="submit" class="btn btn--primario btn--ancho btn--grande" id="venta-guardar">Guardar venta</button>
      </form>
    </section>
  `);
  container.appendChild(seccion);

  const $select = seccion.querySelector('select[name="plan"]');
  try {
    const { planes } = await api('/catalogo/planes');
    $select.innerHTML = planes.length
      ? '<option value="" disabled selected>Elige un plan</option>' +
        planes.map((p) => `<option value="${escapeHtml(p.codigo)}">${escapeHtml(p.nombre)}</option>`).join('')
      : '<option value="" disabled selected>No hay planes configurados</option>';
  } catch {
    $select.innerHTML = '<option value="" disabled selected>No se pudieron cargar los planes — revisa tu señal</option>';
  }

  const form = seccion.querySelector('#form-venta');
  const $error = seccion.querySelector('#venta-error');
  const $btn = seccion.querySelector('#venta-guardar');

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $error.hidden = true;
    const datos = Object.fromEntries(new FormData(form));
    if (!datos.numero_venta_tuves || !datos.cliente_nombre || !datos.comuna || !datos.plan) {
      $error.textContent = 'Completa todos los campos.';
      $error.hidden = false;
      return;
    }
    $btn.disabled = true;
    $btn.textContent = 'Guardando…';
    try {
      await api('/ventas', { method: 'POST', body: datos });
      toast('Venta registrada.', 'ok');
      irA('home');
    } catch (e) {
      $error.textContent = e.message;
      $error.hidden = false;
      $btn.disabled = false;
      $btn.textContent = 'Guardar venta';
    }
  });
}
