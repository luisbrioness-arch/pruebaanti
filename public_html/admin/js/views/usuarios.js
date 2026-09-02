// Alta de técnicos (y admins) — antes esto era manual, directo en la base
// de datos (ver docs/despliegue.md, sección 5). Solo alta: no hay edición
// ni baja acá todavía, no se pidió y no hace falta para operar hoy.
import { api } from '../api.js';
import { toast } from '../toast.js';
import { conColaSiHaceFalta } from '../offline.js';
import { el, escapeHtml } from '../utils.js';

const ROL_LABEL = { admin: 'Administrador', tecnico: 'Técnico' };

export async function renderUsuarios(container) {
  container.appendChild(el(`
    <section class="bodega">
      <h3>Nuevo usuario</h3>
      <form id="form-nuevo-usuario" class="form-fila">
        <label class="campo campo--inline">
          <span>Nombre</span>
          <input type="text" name="nombre" placeholder="Ej: Juan Pérez" required>
        </label>
        <label class="campo campo--inline">
          <span>Usuario (para entrar)</span>
          <input type="text" name="usuario" placeholder="Ej: juan" pattern="[a-z0-9_.]+" title="Solo minúsculas, números, punto o guion bajo" required>
        </label>
        <label class="campo campo--inline">
          <span>Contraseña</span>
          <input type="text" name="password" placeholder="Mínimo 8 caracteres" minlength="8" required>
        </label>
        <label class="campo campo--inline">
          <span>Rol</span>
          <select name="rol">
            <option value="tecnico" selected>Técnico</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <label class="campo campo--inline">
          <span>% de reparto</span>
          <input type="number" name="porcentaje_reparto" value="100" min="1" max="100" step="0.01" required>
        </label>
        <button type="submit" class="btn btn--primario">Crear usuario</button>
      </form>

      <h3 style="margin-top: 18px;">Usuarios activos</h3>
      <div id="tabla-usuarios"><p class="vacio">Cargando…</p></div>
    </section>
  `));

  const $form = container.querySelector('#form-nuevo-usuario');
  const $tabla = container.querySelector('#tabla-usuarios');

  $form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const $submit = ev.target.querySelector('button[type="submit"]');
    if ($submit.disabled) return;
    $submit.disabled = true;
    const fd = new FormData(ev.target);
    const payload = {
      nombre: fd.get('nombre').trim(),
      usuario: fd.get('usuario').trim(),
      password: fd.get('password'),
      rol: fd.get('rol'),
      porcentaje_reparto: Number(fd.get('porcentaje_reparto')),
    };
    try {
      const { encolado } = await conColaSiHaceFalta('crear_usuario', payload, () => api('/admin/usuarios', { method: 'POST', body: payload }));
      if (encolado) {
        toast(`Usuario ${payload.usuario} guardado sin conexión — se creará al recuperar señal.`, 'neutro');
        ev.target.reset();
      } else {
        toast(`Usuario ${payload.nombre} creado.`, 'ok');
        ev.target.reset();
        await cargarUsuarios();
      }
    } catch (e) {
      toast(e.message, 'malo');
    } finally {
      $submit.disabled = false;
    }
  });

  async function cargarUsuarios() {
    try {
      const { usuarios } = await api('/admin/usuarios');
      $tabla.innerHTML = `
        <table class="tabla">
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>% reparto</th></tr></thead>
          <tbody>
            ${usuarios.map((u) => `
              <tr>
                <td>${escapeHtml(u.nombre)}</td>
                <td class="celda-mono">${escapeHtml(u.usuario)}</td>
                <td>${escapeHtml(ROL_LABEL[u.rol] || u.rol)}</td>
                <td>${u.porcentaje_reparto}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      $tabla.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  await cargarUsuarios();
}
