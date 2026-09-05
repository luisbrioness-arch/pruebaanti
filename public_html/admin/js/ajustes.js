// "Ajustes" (pedido/reporte #9: "crea un boton de ajustes con ajustes
// basicos ... como cambiar nombre cambiar clave y cosas del perfil") —
// modal simple para editar el propio perfil. Nada de esto pasa por la cola
// offline: es una acción de cuenta, no de terreno, y solo tiene sentido con
// conexión real (necesita confirmar la contraseña actual contra el server).
import { api } from './api.js';
import { abrirModal } from './modal.js';
import { toast } from './toast.js';
import { escapeHtml } from './utils.js';

export function initAjustes() {
  const $btn = document.getElementById('ajustes-btn');
  if (!$btn || $btn.dataset.ajustesInit) return; // evita duplicar el listener si boot() corre de nuevo (logout → login sin recargar la página)
  $btn.dataset.ajustesInit = '1';
  // Lee el usuario logueado AHORA (no el que estaba al bootear la página) —
  // si alguien cierra sesión y entra con otra cuenta sin recargar, el modal
  // tiene que mostrar los datos de quien está realmente adentro.
  $btn.addEventListener('click', async () => {
    try {
      const { usuario } = await api('/auth/yo');
      abrirModalAjustes(usuario);
    } catch (e) {
      toast(e.message, 'malo');
    }
  });
}

function abrirModalAjustes(usuarioActual) {
  const { root, cerrar } = abrirModal(`
    <h3>Ajustes de mi cuenta</h3>
    <form id="form-ajustes">
      <label class="campo">
        <span>Nombre</span>
        <input type="text" name="nombre" value="${escapeHtml(usuarioActual.nombre)}" required>
      </label>
      <p class="campo-ayuda" style="margin-top: 14px;">Cambiar contraseña (dejar en blanco si no querés cambiarla)</p>
      <label class="campo">
        <span>Contraseña actual</span>
        <input type="password" name="password_actual" autocomplete="current-password">
      </label>
      <label class="campo">
        <span>Contraseña nueva</span>
        <input type="password" name="password_nueva" autocomplete="new-password" placeholder="Mínimo 8 caracteres">
      </label>
      <p class="campo-error" id="ajustes-error" hidden></p>
      <div class="modal-acciones">
        <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
        <button type="submit" class="btn btn--primario">Guardar</button>
      </div>
    </form>
  `);
  const $error = root.querySelector('#ajustes-error');
  root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
  root.querySelector('#form-ajustes').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $error.hidden = true;
    const fd = new FormData(ev.target);
    const nombre = fd.get('nombre').trim();
    const passwordActual = fd.get('password_actual');
    const passwordNueva = fd.get('password_nueva');

    if (passwordNueva && !passwordActual) {
      $error.textContent = 'Para cambiar la contraseña, primero escribí la actual.';
      $error.hidden = false;
      return;
    }

    const payload = { nombre };
    if (passwordNueva) {
      payload.password_actual = passwordActual;
      payload.password_nueva = passwordNueva;
    }

    const $submit = ev.target.querySelector('button[type="submit"]');
    $submit.disabled = true;
    try {
      await api('/auth/perfil', { method: 'PUT', body: payload });
      cerrar();
      toast('Ajustes guardados.', 'ok');
      document.getElementById('usuario-nombre').textContent = nombre;
    } catch (e) {
      $error.textContent = e.message;
      $error.hidden = false;
      $submit.disabled = false;
    }
  });
}
