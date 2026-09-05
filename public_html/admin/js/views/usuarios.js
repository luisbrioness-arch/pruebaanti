// Alta de técnicos (y admins) — antes esto era manual, directo en la base
// de datos (ver docs/despliegue.md, sección 5). Solo alta: no hay edición
// ni baja acá todavía, no se pidió y no hace falta para operar hoy.
import { api } from '../api.js';
import { toast } from '../toast.js';
import { conColaSiHaceFalta } from '../offline.js';
import { el, escapeHtml } from '../utils.js';
import { abrirModal } from '../modal.js';

const ROL_LABEL = { admin: 'Administrador', tecnico: 'Técnico' };

export async function renderUsuarios(container) {
  container.appendChild(el(`
    <section class="bodega">
      <div class="form-fila" style="align-items: center; justify-content: space-between;">
        <h3 style="margin: 0;">Usuarios activos</h3>
        <button type="button" class="btn btn--primario" id="btn-nuevo-usuario">+ Agregar nuevo usuario</button>
      </div>
      <div id="tabla-usuarios"><p class="vacio">Cargando…</p></div>
    </section>
  `));

  const $tabla = container.querySelector('#tabla-usuarios');

  // Pedido/reporte #12: "lista de usuarios y un boton para agregar nuevo
  // usuario y ahi se despliegue un menu solicitando datos" — el formulario
  // ya no queda siempre abierto arriba de la lista, ahora vive en un modal.
  container.querySelector('#btn-nuevo-usuario').addEventListener('click', abrirModalNuevoUsuario);

  function abrirModalNuevoUsuario() {
    const { root, cerrar } = abrirModal(`
      <h3>Nuevo usuario</h3>
      <form id="form-nuevo-usuario">
        <label class="campo">
          <span>Nombre</span>
          <input type="text" name="nombre" placeholder="Ej: Juan Pérez" required>
        </label>
        <label class="campo">
          <span>Usuario (para entrar)</span>
          <input type="text" name="usuario" placeholder="Ej: juan" pattern="[a-z0-9_.]+" title="Solo minúsculas, números, punto o guion bajo" required>
        </label>
        <label class="campo">
          <span>Contraseña</span>
          <input type="text" name="password" placeholder="Mínimo 8 caracteres" minlength="8" required>
        </label>
        <label class="campo">
          <span>Rol</span>
          <select name="rol">
            <option value="tecnico" selected>Técnico</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <label class="campo">
          <span>% de reparto</span>
          <input type="number" name="porcentaje_reparto" value="100" min="1" max="100" step="0.01" required>
        </label>
        <div class="modal-acciones">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--primario">Crear usuario</button>
        </div>
      </form>
    `);
    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-nuevo-usuario').addEventListener('submit', async (ev) => {
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
        cerrar();
        if (encolado) {
          toast(`Usuario ${payload.usuario} guardado sin conexión — se creará al recuperar señal.`, 'neutro');
        } else {
          toast(`Usuario ${payload.nombre} creado.`, 'ok');
          await cargarUsuarios();
        }
      } catch (e) {
        toast(e.message, 'malo');
        $submit.disabled = false;
      }
    });
  }

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
