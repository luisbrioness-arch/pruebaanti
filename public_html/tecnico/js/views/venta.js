import { api, ApiError } from '../api.js';
import { el, escapeHtml } from '../utils.js';
import { irA } from '../router.js';
import { setTopbar } from '../topbar.js';
import { toast } from '../toast.js';
import { encolar } from '../offline.js';
import { getCatalogoPlanes, setCatalogoPlanes } from '../storage.js';

export async function renderVenta(container) {
  setTopbar({ titulo: 'Registrar venta', atras: () => irA('home') });

  const seccion = el(`
    <section class="wizard-paso" style="padding-bottom: 24px;">
      <p class="wizard-paso-intro">
        Deja la venta guardada acá para poder enlazarla después con la instalación,
        sea hoy mismo o cuando el cliente agende. La ficha real del cliente sigue
        viviendo en el sistema de TuVes — RUT, dirección y teléfono acá son
        opcionales, solo una referencia rápida para vos o para quien instale. Si
        cargas la fecha que pidió el cliente, Edwin la ve como pendiente de
        instalar en su pantalla de Inicio.
      </p>
      <form class="venta-form" id="form-venta" novalidate>
        <label class="campo campo--checkbox">
          <input type="checkbox" name="sin_vendedor">
          <span>Venta directa de TuVes — yo no la vendí, solo la voy a instalar</span>
        </label>
        <label class="campo">
          <span>N° de venta TuVes</span>
          <input type="text" name="numero_venta_tuves" inputmode="numeric" required>
        </label>
        <label class="campo">
          <span>Nombre del cliente</span>
          <input type="text" name="cliente_nombre" required>
        </label>
        <label class="campo">
          <span>RUT (opcional)</span>
          <input type="text" name="cliente_rut" placeholder="Ej: 12.345.678-9" autocomplete="off">
        </label>
        <label class="campo">
          <span>Dirección (opcional)</span>
          <input type="text" name="cliente_direccion" placeholder="Calle, número, depto/casa…" autocomplete="off">
        </label>
        <label class="campo">
          <span>Teléfono (opcional)</span>
          <input type="tel" name="cliente_telefono" placeholder="Ej: +56 9 1234 5678" inputmode="tel" autocomplete="off">
        </label>
        <label class="campo">
          <span>Comuna</span>
          <input type="text" name="comuna" required>
        </label>
        <label class="campo">
          <span>Fecha de instalación pedida por el cliente (opcional)</span>
          <input type="date" name="fecha_instalacion_solicitada">
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
  let planes = getCatalogoPlanes();

  function pintarPlanes(lista) {
    if (!lista || !lista.length) {
      $select.innerHTML = '<option value="" disabled selected>No hay planes configurados</option>';
      return;
    }
    $select.innerHTML = '<option value="" disabled selected>Elige un plan</option>' +
      lista.map((p) => `<option value="${escapeHtml(p.codigo)}">${escapeHtml(p.nombre)}</option>`).join('');
  }

  if (planes && planes.length) {
    pintarPlanes(planes);
  }

  // Refrescar catálogo en segundo plano si hay conexión
  api('/catalogo/planes').then(({ planes: p }) => {
    if (p && p.length) {
      setCatalogoPlanes(p);
      pintarPlanes(p);
    }
  }).catch(() => {
    if (!planes || !planes.length) {
      $select.innerHTML = '<option value="" disabled selected>No se pudieron cargar los planes — revisa tu señal</option>';
    }
  });

  const form = seccion.querySelector('#form-venta');
  const $error = seccion.querySelector('#venta-error');
  const $btn = seccion.querySelector('#venta-guardar');

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $error.hidden = true;
    const datos = Object.fromEntries(new FormData(form));
    if (!datos.numero_venta_tuves || !datos.cliente_nombre || !datos.comuna || !datos.plan) {
      $error.textContent = 'Completa todos los campos obligatorios.';
      $error.hidden = false;
      return;
    }
    $btn.disabled = true;
    $btn.textContent = 'Guardando…';
    try {
      await api('/ventas', { method: 'POST', body: datos });
      toast('Venta registrada con éxito.', 'ok');
      irA('home');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'sin_conexion') {
        try {
          await encolar('venta', null, datos);
          toast('Venta guardada sin conexión. Se enviará automáticamente al recuperar señal.', 'ok');
          irA('home');
          return;
        } catch {
          $error.textContent = 'No se pudo guardar la venta sin conexión en este dispositivo.';
          $error.hidden = false;
          $btn.disabled = false;
          $btn.textContent = 'Guardar venta';
          return;
        }
      }
      $error.textContent = e.message;
      $error.hidden = false;
      $btn.disabled = false;
      $btn.textContent = 'Guardar venta';
    }
  });
}
