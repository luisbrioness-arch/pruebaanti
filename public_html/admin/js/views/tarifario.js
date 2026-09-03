import { api } from '../api.js';
import { toast } from '../toast.js';
import { abrirModal } from '../modal.js';
import { conColaSiHaceFalta } from '../offline.js';
import { escapeHtml, formatMoney, formatDateTime, el } from '../utils.js';

export async function renderTarifario(container) {
  container.appendChild(el(`
    <section class="panel-simple">
      <div class="panel-cabecera">
        <h2>Tarifario y comisiones</h2>
        <p class="panel-explicacion">
          Editar un monto nunca sobreescribe el anterior: cierra la fila vigente y crea una nueva.
          Las órdenes y ventas ya aprobadas conservan el monto con el que se calcularon, aunque el
          precio cambie después.
        </p>
      </div>
      <h3>Tarifas por tipo de servicio</h3>
      <div id="tabla-tarifas"><p class="vacio">Cargando…</p></div>
      <h3>Comisiones por plan</h3>
      <div id="tabla-comisiones"><p class="vacio">Cargando…</p></div>

      <h3>Instalación por plan</h3>
      <p class="campo-ayuda" style="margin-bottom: 8px;">
        Los planes van subiendo por cantidad de decos — si una orden de "Instalación nueva" viene de una
        venta propia, cobra según esto en vez del monto plano de arriba. Un plan sin fila acá sigue
        cobrando el monto plano de "Instalación nueva".
      </p>
      <div id="tabla-instalacion-plan"><p class="vacio">Cargando…</p></div>
      <form id="form-instalacion-plan" class="form-fila">
        <label class="campo campo--inline">
          <span>Plan</span>
          <select name="plan" required><option value="" disabled selected>Cargando planes…</option></select>
        </label>
        <label class="campo campo--inline">
          <span>Monto de instalación</span>
          <input type="number" name="monto" min="1" step="1" required>
        </label>
        <button type="submit" class="btn btn--secundario">Agregar / actualizar</button>
      </form>

      <h3>Nuevo plan</h3>
      <p class="campo-ayuda" style="margin-bottom: 8px;">Antes de que aparezca en el selector de "Registrar venta" del técnico, tiene que existir acá.</p>
      <form id="form-nuevo-plan" class="form-fila">
        <label class="campo campo--inline">
          <span>Código</span>
          <input type="text" name="codigo" placeholder="Ej: plan_basico" pattern="[a-z0-9_]+" title="Solo minúsculas, números o guion bajo" required>
        </label>
        <label class="campo campo--inline">
          <span>Nombre</span>
          <input type="text" name="nombre" placeholder="Ej: Plan Básico" required>
        </label>
        <label class="campo campo--inline">
          <span>Comisión inicial</span>
          <input type="number" name="comision_inicial" min="1" step="1" required>
        </label>
        <button type="submit" class="btn btn--primario">Crear plan</button>
      </form>
    </section>
  `));

  const $tarifas = container.querySelector('#tabla-tarifas');
  const $comisiones = container.querySelector('#tabla-comisiones');
  const $instalacionPlan = container.querySelector('#tabla-instalacion-plan');
  const $selectPlanInstalacion = container.querySelector('select[name="plan"]');

  container.querySelector('#form-instalacion-plan').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const $submit = ev.target.querySelector('button[type="submit"]');
    if ($submit.disabled) return;
    $submit.disabled = true;
    const fd = new FormData(ev.target);
    const codigo = fd.get('plan');
    const monto = Number(fd.get('monto'));
    try {
      const { encolado } = await conColaSiHaceFalta(
        'editar_tarifa_instalacion', { codigo, monto },
        () => api(`/admin/tarifas-instalacion/${encodeURIComponent(codigo)}`, { method: 'PUT', body: { monto } }),
        codigo
      );
      ev.target.reset();
      if (encolado) {
        toast('Guardado sin conexión — se aplicará al recuperar señal.', 'neutro');
      } else {
        toast('Instalación por plan guardada.', 'ok');
        await cargarInstalacionPlan();
      }
    } catch (e) {
      toast(e.message, 'malo');
    } finally {
      $submit.disabled = false;
    }
  });

  async function cargarInstalacionPlan() {
    try {
      const { tarifas_instalacion: tarifasInstalacion } = await api('/admin/tarifas-instalacion');
      renderTabla($instalacionPlan, tarifasInstalacion, {
        codigoCampo: 'plan_codigo',
        nombreCampo: 'plan_nombre',
        endpoint: (codigo) => `/admin/tarifas-instalacion/${encodeURIComponent(codigo)}`,
        tipoAccion: 'editar_tarifa_instalacion',
        // Pedido: "que aplique a todos los planes o instalaciones de
        // tarifario" — acá "eliminar" cierra la fila vigente sin
        // reemplazarla: esa instalación vuelve a cobrar el monto plano.
        onEliminar: async (codigo, nombre) => {
          const { encolado } = await conColaSiHaceFalta(
            'eliminar_tarifa_instalacion', { codigo },
            () => api(`/admin/tarifas-instalacion/${encodeURIComponent(codigo)}`, { method: 'DELETE' }),
            codigo
          );
          if (encolado) {
            toast(`${nombre}: guardado sin conexión — se aplicará al recuperar señal.`, 'neutro');
          } else {
            toast(`Instalación por plan de "${nombre}" eliminada — vuelve a cobrar el monto plano.`, 'neutro');
            await cargarInstalacionPlan();
          }
        },
      });
    } catch (e) {
      $instalacionPlan.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  container.querySelector('#form-nuevo-plan').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const $submit = ev.target.querySelector('button[type="submit"]');
    if ($submit.disabled) return;
    $submit.disabled = true;
    const fd = new FormData(ev.target);
    const payload = {
      codigo: fd.get('codigo').trim(),
      nombre: fd.get('nombre').trim(),
      comision_inicial: Number(fd.get('comision_inicial')),
    };
    try {
      const { datos, encolado } = await conColaSiHaceFalta('crear_plan', payload, () => api('/admin/planes', { method: 'POST', body: payload }));
      ev.target.reset();
      if (encolado) {
        toast(`Plan "${payload.nombre}" guardado sin conexión — se creará al recuperar señal.`, 'neutro');
      } else {
        toast(`Plan "${payload.nombre}" creado.`, 'ok');
        renderTablaComisiones($comisiones, datos.comisiones);
        $selectPlanInstalacion.innerHTML = datos.comisiones
          .map((c) => `<option value="${escapeHtml(c.plan_codigo)}">${escapeHtml(c.plan_nombre)}</option>`).join('');
      }
    } catch (e) {
      toast(e.message, 'malo');
    } finally {
      $submit.disabled = false;
    }
  });

  async function cargar() {
    try {
      const [{ tarifas }, { comisiones }] = await Promise.all([
        api('/admin/tarifas'),
        api('/admin/comisiones'),
      ]);
      renderTabla($tarifas, tarifas, {
        codigoCampo: 'tipo_servicio_codigo',
        nombreCampo: 'tipo_servicio_nombre',
        endpoint: (codigo) => `/admin/tarifas/${encodeURIComponent(codigo)}`,
        tipoAccion: 'editar_tarifa',
      });
      renderTablaComisiones($comisiones, comisiones);
      $selectPlanInstalacion.innerHTML = comisiones.length
        ? comisiones.map((c) => `<option value="${escapeHtml(c.plan_codigo)}">${escapeHtml(c.plan_nombre)}</option>`).join('')
        : '<option value="" disabled selected>No hay planes todavía</option>';
      await cargarInstalacionPlan();
    } catch (e) {
      $tarifas.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  function renderTabla($contenedor, filas, cfg) {
    if (!filas.length) {
      $contenedor.innerHTML = '<p class="vacio">Nada configurado todavía.</p>';
      return;
    }
    $contenedor.innerHTML = `
      <table class="tabla tabla--editable">
        <thead><tr><th>Nombre</th><th>Monto vigente</th><th>Desde</th><th>Editar</th></tr></thead>
        <tbody></tbody>
      </table>
    `;
    const $tbody = $contenedor.querySelector('tbody');
    for (const fila of filas) {
      const codigo = fila[cfg.codigoCampo];
      const tr = el(`
        <tr>
          <td>${escapeHtml(fila[cfg.nombreCampo])}</td>
          <td class="celda-monto">${formatMoney(fila.monto)}</td>
          <td class="celda-desde">${formatDateTime(fila.vigente_desde)}</td>
          <td>
            <div class="celda-acciones">
              <form class="form-inline">
                <input type="number" name="monto" min="1" step="1" placeholder="Nuevo monto" required>
                <button type="submit" class="btn btn--secundario btn--chico">Guardar</button>
              </form>
              ${cfg.onEliminar ? '<button type="button" class="btn btn--malo btn--chico" data-eliminar>Eliminar</button>' : ''}
            </div>
          </td>
        </tr>
      `);
      tr.querySelector('form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const monto = Number(new FormData(ev.target).get('monto'));
        if (!monto || monto <= 0) return;
        const boton = ev.target.querySelector('button');
        boton.disabled = true;
        const payload = { codigo, monto };
        try {
          const { encolado } = await conColaSiHaceFalta(
            cfg.tipoAccion, payload,
            () => api(cfg.endpoint(codigo), { method: 'PUT', body: { monto } }),
            codigo
          );
          if (encolado) {
            // No hay forma de refrescar de verdad sin conexión — se pinta el
            // cambio directo sobre la fila (el servidor tiene la última
            // palabra cuando la cola lo mande de verdad).
            tr.querySelector('.celda-monto').textContent = `${formatMoney(monto)} (sin conexión)`;
            tr.querySelector('.celda-desde').textContent = 'pendiente de confirmar';
            toast(`${fila[cfg.nombreCampo]}: guardado sin conexión — se aplicará al recuperar señal.`, 'neutro');
            boton.disabled = false;
          } else {
            toast(`${fila[cfg.nombreCampo]} actualizado a ${formatMoney(monto)}.`, 'ok');
            await cargar();
          }
        } catch (e) {
          toast(e.message, 'malo');
          boton.disabled = false;
        }
      });
      tr.querySelector('[data-eliminar]')?.addEventListener('click', async (ev) => {
        ev.target.disabled = true;
        try {
          await cfg.onEliminar(codigo, fila[cfg.nombreCampo]);
        } catch (e) {
          toast(e.message, 'malo');
          ev.target.disabled = false;
        }
      });
      $tbody.appendChild(tr);
    }
  }

  /**
   * Comisiones por plan necesita dos cosas que renderTabla() no tiene:
   * columna "Estado" y el botón Eliminar/Reactivar (pedido: "falta opcion
   * de borrar planes") — por eso es su propio render en vez de sumarle
   * parámetros a renderTabla() para un solo caso.
   */
  function renderTablaComisiones($contenedor, comisiones) {
    if (!comisiones.length) {
      $contenedor.innerHTML = '<p class="vacio">Nada configurado todavía.</p>';
      return;
    }
    $contenedor.innerHTML = `
      <table class="tabla tabla--editable">
        <thead><tr><th>Nombre</th><th>Estado</th><th>Monto vigente</th><th>Desde</th><th>Editar</th></tr></thead>
        <tbody></tbody>
      </table>
    `;
    const $tbody = $contenedor.querySelector('tbody');
    for (const fila of comisiones) {
      const codigo = fila.plan_codigo;
      const nombre = fila.plan_nombre;
      const activo = Number(fila.plan_activo) === 1;
      const tr = el(`
        <tr>
          <td>${escapeHtml(nombre)}</td>
          <td>${activo ? '<span class="badge badge--ok">Activo</span>' : '<span class="badge badge--neutro">Desactivado</span>'}</td>
          <td class="celda-monto">${formatMoney(fila.monto)}</td>
          <td class="celda-desde">${formatDateTime(fila.vigente_desde)}</td>
          <td>
            <div class="celda-acciones">
              <form class="form-inline">
                <input type="number" name="monto" min="1" step="1" placeholder="Nuevo monto" required>
                <button type="submit" class="btn btn--secundario btn--chico">Guardar</button>
              </form>
              <button type="button" class="btn btn--chico ${activo ? 'btn--malo' : 'btn--ok'}" data-toggle-activo>${activo ? 'Eliminar' : 'Reactivar'}</button>
            </div>
          </td>
        </tr>
      `);
      tr.querySelector('form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const monto = Number(new FormData(ev.target).get('monto'));
        if (!monto || monto <= 0) return;
        const boton = ev.target.querySelector('button');
        boton.disabled = true;
        try {
          const { encolado } = await conColaSiHaceFalta(
            'editar_comision', { codigo, monto },
            () => api(`/admin/comisiones/${encodeURIComponent(codigo)}`, { method: 'PUT', body: { monto } }),
            codigo
          );
          if (encolado) {
            tr.querySelector('.celda-monto').textContent = `${formatMoney(monto)} (sin conexión)`;
            tr.querySelector('.celda-desde').textContent = 'pendiente de confirmar';
            toast(`${nombre}: guardado sin conexión — se aplicará al recuperar señal.`, 'neutro');
            boton.disabled = false;
          } else {
            toast(`${nombre} actualizado a ${formatMoney(monto)}.`, 'ok');
            await cargar();
          }
        } catch (e) {
          toast(e.message, 'malo');
          boton.disabled = false;
        }
      });
      tr.querySelector('[data-toggle-activo]').addEventListener('click', () => {
        if (activo) {
          confirmarEliminarPlan(codigo, nombre);
        } else {
          cambiarActivoPlan(codigo, nombre, true);
        }
      });
      $tbody.appendChild(tr);
    }
  }

  function confirmarEliminarPlan(codigo, nombre) {
    const { root, cerrar } = abrirModal(`
      <h3>Eliminar "${escapeHtml(nombre)}"</h3>
      <p class="modal-explicacion">
        Deja de aparecer en el selector de "Registrar venta" del técnico. No se borra nada de su historial —
        las comisiones, la instalación por plan y las ventas ya hechas con este plan siguen intactas, y
        podés reactivarlo cuando quieras desde acá mismo.
      </p>
      <div class="modal-acciones">
        <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
        <button type="button" class="btn btn--malo" id="btn-confirmar">Eliminar</button>
      </div>
    `);
    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#btn-confirmar').addEventListener('click', () => {
      cerrar();
      cambiarActivoPlan(codigo, nombre, false);
    });
  }

  async function cambiarActivoPlan(codigo, nombre, activo) {
    try {
      const { datos, encolado } = await conColaSiHaceFalta(
        'cambiar_activo_plan', { codigo, activo },
        () => api(`/admin/planes/${encodeURIComponent(codigo)}/activo`, { method: 'PUT', body: { activo } }),
        codigo
      );
      if (encolado) {
        toast(`${nombre}: guardado sin conexión — se aplicará al recuperar señal.`, 'neutro');
      } else {
        toast(activo ? `${nombre} reactivado.` : `${nombre} eliminado del selector del técnico.`, activo ? 'ok' : 'neutro');
        renderTablaComisiones($comisiones, datos.comisiones);
      }
    } catch (e) {
      toast(e.message, 'malo');
    }
  }

  await cargar();
}
