import { api } from '../api.js';
import { el } from '../utils.js';

export function renderLogin(container, onSuccess) {
  container.innerHTML = '';
  const form = el(`
    <form class="login-form" novalidate>
      <label class="campo">
        <span>Usuario</span>
        <input type="text" name="usuario" autocomplete="username" autocapitalize="none" required>
      </label>
      <label class="campo">
        <span>Contraseña</span>
        <input type="password" name="password" autocomplete="current-password" required>
      </label>
      <p class="login-error" hidden></p>
      <button type="submit" class="btn btn--primario btn--ancho btn--grande">Entrar</button>
    </form>
  `);
  const errorP = form.querySelector('.login-error');
  const btn = form.querySelector('button');

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    errorP.hidden = true;
    const usuario = form.usuario.value.trim();
    const password = form.password.value;
    if (!usuario || !password) return;

    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      await api('/auth/login', { method: 'POST', body: { usuario, password } });
      onSuccess();
    } catch (e) {
      errorP.textContent = e.code === 'credenciales_invalidas'
        ? 'Usuario o contraseña incorrectos.'
        : (e.message || 'No se pudo iniciar sesión.');
      errorP.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Entrar';
      form.password.value = '';
      form.password.focus();
    }
  });

  container.appendChild(form);
}
