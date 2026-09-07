import { api } from '../api.js';
import { toast } from '../toast.js';
import { conColaSiHaceFalta } from '../offline.js';
import { el, escapeHtml } from '../utils.js';
import { abrirModal } from '../modal.js';

const ROL_LABEL = {
  admin: 'Administrador',
  tecnico: 'Técnico',
};

export async function renderUsuarios(container) {
  container.appendChild(el(`
    <div class="vista-contenedor">
      <div class="vista-cabecera">
        <div>
          <h2 class="vista-titulo">Gestión de Usuarios</h2>
          <p class="vista-subtitulo">
            Control de cuentas, asignación de roles, contraseñas y porcentaje de reparto para técnicos.
          </p>
        </div>
        <button type="button" class="btn btn--primario btn-con-icono" id="btn-nuevo-usuario">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>+ Nuevo usuario</span>
        </button>
      </div>

      <!-- KPI Summary -->
      <div id="usuarios-kpis" class="informes-kpi-grid" style="margin-bottom: 24px;"></div>

      <!-- Tabla Principal -->
      <section class="card-bloque">
        <div class="card-bloque-cabecera">
          <div class="card-bloque-titular">
            <span class="card-bloque-tag card-bloque-tag--indigo">Cuentas autorizadas</span>
            <h3>Usuarios del sistema</h3>
            <p class="card-bloque-bajada">Técnicos de terreno y administradores con acceso al panel y PWA.</p>
          </div>
          <span class="badge-monto badge-monto--mudo" id="badge-total-usuarios">0 usuarios</span>
        </div>
        <div class="card-bloque-body">
          <div id="tabla-usuarios" class="tabla-envoltorio">
            <div class="cargando-bloque"><div class="spinner"></div><p>Cargando usuarios…</p></div>
          </div>
        </div>
      </section>
    </div>
  `));

  const $tabla = container.querySelector('#tabla-usuarios');
  const $kpis = container.querySelector('#usuarios-kpis');
  const $badgeTotal = container.querySelector('#badge-total-usuarios');
  container.querySelector('#btn-nuevo-usuario').addEventListener('click', abrirModalNuevoUsuario);

  let listaUsuarios = [];

  function pintarKpis(usuarios) {
    const total = usuarios.length;
    const activos = usuarios.filter((u) => Number(u.activo) === 1).length;
    const tecnicos = usuarios.filter((u) => u.rol === 'tecnico' && Number(u.activo) === 1).length;
    const admins = usuarios.filter((u) => u.rol === 'admin' && Number(u.activo) === 1).length;

    $badgeTotal.textContent = `${total} usuario${total === 1 ? '' : 's'}`;

    $kpis.innerHTML = `
      <div class="informes-kpi-card informes-kpi-card--ordenes">
        <div class="informes-kpi-cabecera">
          <span class="informes-kpi-etiqueta">Total Cuentas</span>
          <div class="informes-kpi-icono informes-kpi-icono--verde">👥</div>
        </div>
        <div class="informes-kpi-numero">${total}</div>
        <div class="informes-kpi-bajada"><span>${activos} activas / ${total - activos} inactivas</span></div>
      </div>

      <div class="informes-kpi-card informes-kpi-card--ventas">
        <div class="informes-kpi-cabecera">
          <span class="informes-kpi-etiqueta">Técnicos en Terreno</span>
          <div class="informes-kpi-icono informes-kpi-icono--azul">🧰</div>
        </div>
        <div class="informes-kpi-numero">${tecnicos}</div>
        <div class="informes-kpi-bajada"><span>Instaladores habilitados</span></div>
      </div>

      <div class="informes-kpi-card informes-kpi-card--actividad">
        <div class="informes-kpi-cabecera">
          <span class="informes-kpi-etiqueta">Administradores</span>
          <div class="informes-kpi-icono informes-kpi-icono--morado">🛡️</div>
        </div>
        <div class="informes-kpi-numero">${admins}</div>
        <div class="informes-kpi-bajada"><span>Acceso administrativo total</span></div>
      </div>
    `;
  }

  async function cargarUsuarios() {
    try {
      const { usuarios } = await api('/admin/usuarios');
      listaUsuarios = usuarios;
      pintarKpis(usuarios);

      if (!usuarios.length) {
        $tabla.innerHTML = `
          <div class="vacio-tarjeta">
            <div class="vacio-icono">👤</div>
            <p class="vacio-titulo">No hay usuarios registrados</p>
            <p class="vacio-desc">Crea el primer usuario haciendo clic en "+ Nuevo usuario".</p>
          </div>
        `;
        return;
      }

      $tabla.innerHTML = `
        <table class="tabla">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre completo</th>
              <th>Rol de acceso</th>
              <th>% Reparto</th>
              <th>Estado</th>
              <th style="text-align: right;">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${usuarios.map((u) => {
              const inicial = (u.nombre || 'U').trim().charAt(0).toUpperCase();
              const esActivo = Number(u.activo) === 1;
              const esAdmin = u.rol === 'admin';

              return `
                <tr class="${!esActivo ? 'fila-inactiva' : ''}">
                  <td>
                    <div class="celda-tecnico-destacada">
                      <span class="subtab-avatar" style="${!esActivo ? 'filter: grayscale(1); opacity: 0.6;' : ''}">${escapeHtml(inicial)}</span>
                      <div>
                        <strong class="celda-mono" style="font-size: 0.9rem;">@${escapeHtml(u.usuario)}</strong>
                        ${u.email ? `<span class="celda-subtexto">${escapeHtml(u.email)}</span>` : ''}
                      </div>
                    </div>
                  </td>
                  <td><strong>${escapeHtml(u.nombre)}</strong></td>
                  <td>
                    <span class="card-bloque-tag ${esAdmin ? 'card-bloque-tag--indigo' : 'card-bloque-tag--teal'}">
                      ${escapeHtml(ROL_LABEL[u.rol] || u.rol)}
                    </span>
                  </td>
                  <td>
                    <span class="badge-monto badge-monto--positivo">${u.porcentaje_reparto}%</span>
                  </td>
                  <td>
                    <span class="chip ${esActivo ? 'chip--ok' : 'chip--neutro'}">
                      ${esActivo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style="text-align: right;">
                    <div style="display: inline-flex; gap: 6px; align-items: center;">
                      <button type="button" class="btn-accion btn-accion--editar" data-editar="${u.id}" title="Editar información">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span>Editar</span>
                      </button>
                      <button type="button" class="btn-accion btn-accion--editar" data-password="${u.id}" title="Cambiar contraseña">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        <span>Clave</span>
                      </button>
                      <button type="button" class="btn-accion ${esActivo ? 'btn-accion--eliminar' : 'btn-accion--editar'}" data-toggle-activo="${u.id}">
                        ${esActivo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;

      $tabla.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const u = listaUsuarios.find((x) => String(x.id) === btn.dataset.editar);
          if (u) abrirModalEditarUsuario(u);
        });
      });

      $tabla.querySelectorAll('[data-password]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const u = listaUsuarios.find((x) => String(x.id) === btn.dataset.password);
          if (u) abrirModalCambiarPassword(u);
        });
      });

      $tabla.querySelectorAll('[data-toggle-activo]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const u = listaUsuarios.find((x) => String(x.id) === btn.dataset.toggleActivo);
          if (u) confirmarCambiarActivo(u);
        });
      });
    } catch (e) {
      $tabla.innerHTML = `<div class="callout-aviso callout-aviso--error"><div class="callout-texto">${escapeHtml(e.message)}</div></div>`;
    }
  }

  function abrirModalNuevoUsuario() {
    const { root, cerrar } = abrirModal(`
      <div class="modal-encabezado-icono">
        <div class="modal-icono-circulo modal-icono-circulo--indigo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="8.5" cy="7" r="4"></circle>
            <line x1="20" y1="8" x2="20" y2="14"></line>
            <line x1="23" y1="11" x2="17" y2="11"></line>
          </svg>
        </div>
        <div>
          <h3 style="margin: 0; font-size: 1.15rem;">Crear nuevo usuario</h3>
          <p style="margin: 3px 0 0; font-size: 0.82rem; color: var(--tinta-2);">
            Habilita acceso al panel de administración o a la PWA de terreno.
          </p>
        </div>
      </div>
      <form id="form-nuevo-usuario" style="margin-top: 18px;">
        <label class="campo">
          <span>Nombre y apellido</span>
          <input type="text" name="nombre" placeholder="Ej: Carlos Silva Gómez" required autofocus>
        </label>
        <label class="campo" style="margin-top: 12px;">
          <span>Nombre de usuario (login)</span>
          <input type="text" name="usuario" placeholder="Ej: csilva" pattern="[a-z0-9_.]+" title="Solo minúsculas, números, punto o guion bajo" required>
        </label>
        <label class="campo" style="margin-top: 12px;">
          <span>Correo electrónico (opcional)</span>
          <input type="email" name="email" placeholder="Ej: csilva@hogartv.cl">
        </label>
        <label class="campo" style="margin-top: 12px;">
          <span>Contraseña inicial</span>
          <input type="password" name="password" placeholder="Mínimo 8 caracteres" minlength="8" required autocomplete="new-password">
        </label>
        <div class="form-fila" style="margin-top: 12px;">
          <label class="campo" style="flex: 1;">
            <span>Rol</span>
            <select name="rol" class="input-select-moderno">
              <option value="tecnico" selected>Técnico (App terreno)</option>
              <option value="admin">Administrador (Panel completo)</option>
            </select>
          </label>
          <label class="campo" style="flex: 1;">
            <span>% de reparto comisiones</span>
            <div class="input-con-prefijo">
              <span class="input-prefijo">%</span>
              <input type="number" name="porcentaje_reparto" value="100" min="1" max="100" step="0.01" required>
            </div>
          </label>
        </div>
        <div class="modal-acciones" style="margin-top: 22px;">
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
        usuario: fd.get('usuario').trim().toLowerCase(),
        email: fd.get('email')?.trim() || null,
        password: fd.get('password'),
        rol: fd.get('rol'),
        porcentaje_reparto: Number(fd.get('porcentaje_reparto')),
      };
      try {
        const { encolado } = await conColaSiHaceFalta('crear_usuario', payload, () => api('/admin/usuarios', { method: 'POST', body: payload }));
        cerrar();
        if (encolado) {
          toast(`Usuario ${payload.usuario} guardado sin conexión.`, 'neutro');
        } else {
          toast(`Usuario ${payload.nombre} creado exitosamente.`, 'ok');
          await cargarUsuarios();
        }
      } catch (e) {
        toast(e.message, 'malo');
        $submit.disabled = false;
      }
    });
  }

  function abrirModalEditarUsuario(u) {
    const { root, cerrar } = abrirModal(`
      <div class="modal-encabezado-icono">
        <div class="modal-icono-circulo modal-icono-circulo--teal">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </div>
        <div>
          <h3 style="margin: 0; font-size: 1.15rem;">Editar usuario @${escapeHtml(u.usuario)}</h3>
          <p style="margin: 3px 0 0; font-size: 0.82rem; color: var(--tinta-2);">
            Modifica los datos personales, rol o porcentaje de reparto.
          </p>
        </div>
      </div>
      <form id="form-editar-usuario" style="margin-top: 18px;">
        <label class="campo">
          <span>Nombre completo</span>
          <input type="text" name="nombre" value="${escapeHtml(u.nombre)}" required autofocus>
        </label>
        <label class="campo" style="margin-top: 12px;">
          <span>Correo electrónico</span>
          <input type="email" name="email" value="${escapeHtml(u.email || '')}" placeholder="correo@ejemplo.com">
        </label>
        <div class="form-fila" style="margin-top: 12px;">
          <label class="campo" style="flex: 1;">
            <span>Rol</span>
            <select name="rol" class="input-select-moderno">
              <option value="tecnico" ${u.rol === 'tecnico' ? 'selected' : ''}>Técnico</option>
              <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>Administrador</option>
            </select>
          </label>
          <label class="campo" style="flex: 1;">
            <span>% Reparto comisiones</span>
            <div class="input-con-prefijo">
              <span class="input-prefijo">%</span>
              <input type="number" name="porcentaje_reparto" value="${u.porcentaje_reparto}" min="1" max="100" step="0.01" required>
            </div>
          </label>
        </div>
        <div class="modal-acciones" style="margin-top: 22px;">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--primario">Guardar cambios</button>
        </div>
      </form>
    `);

    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-editar-usuario').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const $submit = ev.target.querySelector('button[type="submit"]');
      if ($submit.disabled) return;
      $submit.disabled = true;
      const fd = new FormData(ev.target);
      const payload = {
        nombre: fd.get('nombre').trim(),
        email: fd.get('email')?.trim() || null,
        rol: fd.get('rol'),
        porcentaje_reparto: Number(fd.get('porcentaje_reparto')),
      };
      try {
        await api(`/admin/usuarios/${u.id}`, { method: 'PUT', body: payload });
        cerrar();
        toast('Usuario actualizado correctamente.', 'ok');
        await cargarUsuarios();
      } catch (e) {
        toast(e.message, 'malo');
        $submit.disabled = false;
      }
    });
  }

  function abrirModalCambiarPassword(u) {
    const { root, cerrar } = abrirModal(`
      <div class="modal-encabezado-icono">
        <div class="modal-icono-circulo modal-icono-circulo--indigo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <div>
          <h3 style="margin: 0; font-size: 1.15rem;">Cambiar clave de ${escapeHtml(u.nombre)}</h3>
          <p style="margin: 3px 0 0; font-size: 0.82rem; color: var(--tinta-2);">
            Restablece la contraseña de acceso a la cuenta @${escapeHtml(u.usuario)}.
          </p>
        </div>
      </div>
      <form id="form-password-usuario" style="margin-top: 18px;">
        <label class="campo">
          <span>Nueva contraseña</span>
          <input type="password" name="password" minlength="8" placeholder="Mínimo 8 caracteres" required autofocus autocomplete="new-password">
        </label>
        <div class="modal-acciones" style="margin-top: 22px;">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--primario">Actualizar clave</button>
        </div>
      </form>
    `);

    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-password-usuario').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const $submit = ev.target.querySelector('button[type="submit"]');
      if ($submit.disabled) return;
      $submit.disabled = true;
      const password = new FormData(ev.target).get('password');
      try {
        await api(`/admin/usuarios/${u.id}/password`, { method: 'POST', body: { password } });
        cerrar();
        toast(`Contraseña de @${u.usuario} actualizada.`, 'ok');
      } catch (e) {
        toast(e.message, 'malo');
        $submit.disabled = false;
      }
    });
  }

  function confirmarCambiarActivo(u) {
    const esActivo = Number(u.activo) === 1;
    const accion = esActivo ? 'desactivar' : 'activar';
    const { root, cerrar } = abrirModal(`
      <div class="modal-encabezado-icono">
        <div class="modal-icono-circulo ${esActivo ? 'modal-icono-circulo--malo' : 'modal-icono-circulo--teal'}">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${esActivo
              ? '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'
              : '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline>'}
          </svg>
        </div>
        <div>
          <h3 style="margin: 0; font-size: 1.15rem;">¿Deseas ${accion} la cuenta de ${escapeHtml(u.nombre)}?</h3>
          <p style="margin: 3px 0 0; font-size: 0.82rem; color: var(--tinta-2);">
            ${esActivo
              ? 'El usuario no podrá iniciar sesión en la app ni en el panel mientras esté inactivo.'
              : 'El usuario recuperará el acceso inmediato al sistema con sus credenciales.'}
          </p>
        </div>
      </div>
      <div class="modal-acciones" style="margin-top: 22px;">
        <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
        <button type="button" class="btn ${esActivo ? 'btn--malo' : 'btn--primario'}" id="btn-confirmar">
          Sí, ${accion} usuario
        </button>
      </div>
    `);

    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#btn-confirmar').addEventListener('click', async () => {
      try {
        await api(`/admin/usuarios/${u.id}/activo`, { method: 'PUT', body: { activo: !esActivo } });
        cerrar();
        toast(`Usuario ${u.nombre} ${esActivo ? 'desactivado' : 'activado'}.`, 'ok');
        await cargarUsuarios();
      } catch (e) {
        toast(e.message, 'malo');
      }
    });
  }

  await cargarUsuarios();
}
