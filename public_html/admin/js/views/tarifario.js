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
        venta propia, cobra según esto en vez del monto plano de arriba. Un plan sin tarifa acá sigue
        cobrando el monto plano de "Instalación nueva".
      </p>
      <div id="tabla-instalacion-plan"><p class="vacio">Cargando…</p></div>
    </section>
  `));

  const $tarifas = container.querySelector('#tabla-tarifas');
  const $comisiones = container.querySelector('#tabla-comisiones');
  const $instalacionPlan = container.querySelector('#tabla-instalacion-plan');

  /**
   * Modal compartido de "Editar" (pedido: "eliminar esta parte [el
   * formulario aparte con selector de plan] en cambio un boton de editar
   * que deje editar todos los campos ya sea nombre y valor"). Antes solo
   * el monto se podía cambiar (con un mini-formulario embebido en la
   * fila) — el nombre quedaba fijo desde que se creaba el plan/tipo de
   * servicio. Ahora las tres tablas abren este mismo modal desde un único
   * botón "Editar" por fila.
   */
  function abrirModalEditar({ nombreActual, montoActual, onGuardar }) {
    const { root, cerrar } = abrirModal(`
      <h3>Editar "${escapeHtml(nombreActual)}"</h3>
      <form id="form-editar-fila">
        <label class="campo">
          <span>Nombre</span>
          <input type="text" name="nombre" value="${escapeHtml(nombreActual)}" required>
        </label>
        <label class="campo">
          <span>Monto</span>
          <input type="number" name="monto" min="1" step="1" value="${montoActual ?? ''}" required>
        </label>
        <div class="modal-acciones">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--primario">Guardar</button>
        </div>
      </form>
    `);
    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-editar-fila').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const $submit = ev.target.querySelector('button[type="submit"]');
      $submit.disabled = true;
      const fd = new FormData(ev.target);
      const nombre = fd.get('nombre').trim();
      const monto = Number(fd.get('monto'));
      if (!nombre || !monto || monto <= 0) { $submit.disabled = false; return; }
      cerrar();
      try {
        await onGuardar({
          nombreCambio: nombre !== nombreActual ? nombre : null,
          montoCambio: monto !== Number(montoActual) ? monto : null,
        });
      } catch (e) {
        toast(e.message, 'malo');
      }
    });
  }

  /** Modal para crear un plan nuevo (pedido: "en cada final de cada campo que aparezca un boton para agregar nuevos planes") — reemplaza el formulario fijo "Nuevo plan" del fondo de la página. */
  function abrirModalNuevoPlan(onCreado) {
    const { root, cerrar } = abrirModal(`
      <h3>Nuevo plan</h3>
      <p class="modal-explicacion">Antes de que aparezca en el selector de "Registrar venta" del técnico, tiene que existir acá.</p>
      <form id="form-nuevo-plan">
        <label class="campo">
          <span>Código</span>
          <input type="text" name="codigo" placeholder="Ej: plan_basico" pattern="[a-z0-9_]+" title="Solo minúsculas, números o guion bajo" required>
        </label>
        <label class="campo">
          <span>Nombre</span>
          <input type="text" name="nombre" placeholder="Ej: Plan Básico" required>
        </label>
        <label class="campo">
          <span>Comisión inicial</span>
          <input type="number" name="comision_inicial" min="1" step="1" required>
        </label>
        <div class="modal-acciones">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--primario">Crear plan</button>
        </div>
      </form>
    `);
    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-nuevo-plan').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const $submit = ev.target.querySelector('button[type="submit"]');
      $submit.disabled = true;
      const fd = new FormData(ev.target);
      const payload = {
        codigo: fd.get('codigo').trim(),
        nombre: fd.get('nombre').trim(),
        comision_inicial: Number(fd.get('comision_inicial')),
      };
      try {
        const { datos, encolado } = await conColaSiHaceFalta('crear_plan', payload, () => api('/admin/planes', { method: 'POST', body: payload }));
        cerrar();
        if (encolado) {
          toast(`Plan "${payload.nombre}" guardado sin conexión — se creará al recuperar señal.`, 'neutro');
        } else {
          toast(`Plan "${payload.nombre}" creado.`, 'ok');
          await onCreado();
        }
      } catch (e) {
        toast(e.message, 'malo');
        $submit.disabled = false;
      }
    });
  }

  async function cargar() {
    try {
      const [{ tarifas }, { comisiones }, { tarifas_instalacion: tarifasInstalacion }] = await Promise.all([
        api('/admin/tarifas'),
        api('/admin/comisiones'),
        api('/admin/tarifas-instalacion'),
      ]);
      renderTablaTarifas(tarifas);
      renderTablaComisiones(comisiones);
      renderTablaInstalacion(tarifasInstalacion);
    } catch (e) {
      $tarifas.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  // -------------------------------------------- Tarifas por tipo de servicio --
  function renderTablaTarifas(filas) {
    if (!filas.length) {
      $tarifas.innerHTML = '<p class="vacio">Nada configurado todavía.</p>';
      return;
    }
    $tarifas.innerHTML = `
      <table class="tabla tabla--editable">
        <thead><tr><th>Nombre</th><th>Monto vigente</th><th>Desde</th><th>Editar</th></tr></thead>
        <tbody></tbody>
      </table>
    `;
    const $tbody = $tarifas.querySelector('tbody');
    for (const fila of filas) {
      const codigo = fila.tipo_servicio_codigo;
      const nombre = fila.tipo_servicio_nombre;
      const tr = el(`
        <tr>
          <td>${escapeHtml(nombre)}</td>
          <td class="celda-monto">${formatMoney(fila.monto)}</td>
          <td class="celda-desde">${formatDateTime(fila.vigente_desde)}</td>
          <td>
            <div class="fila-tarifa-acciones">
              <button type="button" class="btn btn--secundario btn--chico" data-editar>Editar</button>
              <button type="button" class="btn btn--malo btn--chico" data-eliminar>Eliminar</button>
            </div>
          </td>
        </tr>
      `);
      tr.querySelector('[data-editar]').addEventListener('click', () => {
        abrirModalEditar({
          nombreActual: nombre,
          montoActual: fila.monto,
          onGuardar: async ({ nombreCambio, montoCambio }) => {
            if (nombreCambio) {
              await conColaSiHaceFalta(
                'editar_nombre_tarifa', { codigo, nombre: nombreCambio },
                () => api(`/admin/tarifas/${encodeURIComponent(codigo)}/nombre`, { method: 'PUT', body: { nombre: nombreCambio } }),
                `nombre_${codigo}`
              );
            }
            if (montoCambio) {
              await conColaSiHaceFalta(
                'editar_tarifa', { codigo, monto: montoCambio },
                () => api(`/admin/tarifas/${encodeURIComponent(codigo)}`, { method: 'PUT', body: { monto: montoCambio } }),
                codigo
              );
            }
            toast(`"${nombreCambio || nombre}" actualizado.`, 'ok');
            await cargar();
          },
        });
      });
      // Pedido: "que aplique igual para las Tarifas por tipo de servicio"
      // — a diferencia de instalación por plan, acá NO hay monto plano al
      // que caer (esta ES la tarifa plana), así que sin confirmación
      // sería fácil bloquear por accidente a todos los técnicos para ese
      // tipo de servicio.
      tr.querySelector('[data-eliminar]').addEventListener('click', () => {
        const { root, cerrar } = abrirModal(`
          <h3>Eliminar tarifa de "${escapeHtml(nombre)}"</h3>
          <p class="modal-explicacion">
            Sin un monto vigente para este tipo de servicio, ningún técnico va a poder cerrar una orden
            de "${escapeHtml(nombre)}" hasta que cargues uno nuevo — se les va a mostrar un error pidiendo
            que avisen al administrador. No se borra ningún dato: el historial de montos sigue intacto.
          </p>
          <div class="modal-acciones">
            <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
            <button type="button" class="btn btn--malo" id="btn-confirmar">Eliminar</button>
          </div>
        `);
        root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
        root.querySelector('#btn-confirmar').addEventListener('click', async () => {
          cerrar();
          try {
            const { encolado } = await conColaSiHaceFalta(
              'eliminar_tarifa', { codigo },
              () => api(`/admin/tarifas/${encodeURIComponent(codigo)}`, { method: 'DELETE' }),
              codigo
            );
            if (encolado) {
              toast(`${nombre}: guardado sin conexión — se aplicará al recuperar señal.`, 'neutro');
            } else {
              toast(`Tarifa de "${nombre}" eliminada — nadie puede cerrar ese tipo de orden hasta que cargues un monto nuevo.`, 'alerta', 8000);
              await cargar();
            }
          } catch (e) {
            toast(e.message, 'malo');
          }
        });
      });
      $tbody.appendChild(tr);
    }
  }

  // ---------------------------------------------------- Comisiones por plan --
  // Pedido: "que no aparezca este plan" (sobre un plan Desactivado listado
  // acá) — los planes desactivados dejan de listarse en esta tabla. Ya no
  // hay forma de reactivarlos desde el panel (ver confirmarEliminarPlan),
  // así que mostrarlos acá era ruido puro: el historial de sus comisiones
  // e instalaciones sigue intacto en la base, solo no aparece más en esta
  // vista de "planes disponibles hoy".
  function renderTablaComisiones(comisionesTodas) {
    const comisiones = comisionesTodas.filter((f) => Number(f.plan_activo) === 1);
    $comisiones.innerHTML = `
      ${comisiones.length ? `
        <table class="tabla tabla--editable">
          <thead><tr><th>Nombre</th><th>Monto vigente</th><th>Desde</th><th>Editar</th></tr></thead>
          <tbody></tbody>
        </table>
      ` : '<p class="vacio">Nada configurado todavía.</p>'}
      <button type="button" class="btn btn--secundario" id="btn-nuevo-plan" style="margin-top: 10px;">+ Agregar nuevo plan</button>
    `;
    $comisiones.querySelector('#btn-nuevo-plan').addEventListener('click', () => {
      abrirModalNuevoPlan(cargar);
    });
    const $tbody = $comisiones.querySelector('tbody');
    if (!$tbody) return;
    for (const fila of comisiones) {
      const codigo = fila.plan_codigo;
      const nombre = fila.plan_nombre;
      const tr = el(`
        <tr>
          <td>${escapeHtml(nombre)}</td>
          <td class="celda-monto">${formatMoney(fila.monto)}</td>
          <td class="celda-desde">${formatDateTime(fila.vigente_desde)}</td>
          <td>
            <div class="fila-tarifa-acciones">
              <button type="button" class="btn btn--secundario btn--chico" data-editar>Editar</button>
              <button type="button" class="btn btn--malo btn--chico" data-eliminar-plan>Eliminar</button>
            </div>
          </td>
        </tr>
      `);
      tr.querySelector('[data-editar]').addEventListener('click', () => {
        abrirModalEditar({
          nombreActual: nombre,
          montoActual: fila.monto,
          onGuardar: async ({ nombreCambio, montoCambio }) => {
            if (nombreCambio) {
              await conColaSiHaceFalta(
                'editar_nombre_plan', { codigo, nombre: nombreCambio },
                () => api(`/admin/planes/${encodeURIComponent(codigo)}/nombre`, { method: 'PUT', body: { nombre: nombreCambio } }),
                `nombre_${codigo}`
              );
            }
            if (montoCambio) {
              await conColaSiHaceFalta(
                'editar_comision', { codigo, monto: montoCambio },
                () => api(`/admin/comisiones/${encodeURIComponent(codigo)}`, { method: 'PUT', body: { monto: montoCambio } }),
                codigo
              );
            }
            toast(`"${nombreCambio || nombre}" actualizado.`, 'ok');
            await cargar();
          },
        });
      });
      tr.querySelector('[data-eliminar-plan]').addEventListener('click', () => {
        confirmarEliminarPlan(codigo, nombre);
      });
      $tbody.appendChild(tr);
    }
  }

  // Pedido: "que no se pueda reactivar si necesito algo lo vuelvo a
  // ingresar no mas" — sin botón "Reactivar" en el panel; el backend
  // (PUT /admin/planes/{codigo}/activo) todavía acepta activo:true si
  // alguna vez hace falta destrabar esto a mano, pero la UI ya no lo ofrece.
  function confirmarEliminarPlan(codigo, nombre) {
    const { root, cerrar } = abrirModal(`
      <h3>Eliminar "${escapeHtml(nombre)}"</h3>
      <p class="modal-explicacion">
        Deja de aparecer en el selector de "Registrar venta" del técnico. No se borra nada de su historial —
        las comisiones, la instalación por plan y las ventas ya hechas con este plan siguen intactas. No hay
        forma de reactivarlo desde acá: si más adelante hace falta de nuevo, se vuelve a crear como plan nuevo.
      </p>
      <div class="modal-acciones">
        <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
        <button type="button" class="btn btn--malo" id="btn-confirmar">Eliminar</button>
      </div>
    `);
    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#btn-confirmar').addEventListener('click', () => {
      cerrar();
      cambiarActivoPlan(codigo, nombre);
    });
  }

  async function cambiarActivoPlan(codigo, nombre) {
    try {
      const { encolado } = await conColaSiHaceFalta(
        'cambiar_activo_plan', { codigo, activo: false },
        () => api(`/admin/planes/${encodeURIComponent(codigo)}/activo`, { method: 'PUT', body: { activo: false } }),
        codigo
      );
      if (encolado) {
        toast(`${nombre}: guardado sin conexión — se aplicará al recuperar señal.`, 'neutro');
      } else {
        toast(`${nombre} eliminado del selector del técnico.`, 'neutro');
        await cargar();
      }
    } catch (e) {
      toast(e.message, 'malo');
    }
  }

  // ------------------------------------------------------ Instalación por plan --
  // Pedido: "eliminar esta parte [el formulario Plan+Monto separado] en
  // cambio un boton de editar" — la tabla lista TODOS los planes (con o
  // sin tarifa todavía, ver TarifaInstalacionPlanRepository::todosLosPlanesConTarifa)
  // así que "Editar" también sirve para ponerle la primera tarifa a un
  // plan que nunca tuvo una.
  function renderTablaInstalacion(filas) {
    if (!filas.length) {
      $instalacionPlan.innerHTML = '<p class="vacio">Todavía no hay planes creados — agregá uno en "Comisiones por plan".</p>';
      return;
    }
    $instalacionPlan.innerHTML = `
      <table class="tabla tabla--editable">
        <thead><tr><th>Nombre</th><th>Monto vigente</th><th>Desde</th><th>Editar</th></tr></thead>
        <tbody></tbody>
      </table>
    `;
    const $tbody = $instalacionPlan.querySelector('tbody');
    for (const fila of filas) {
      const codigo = fila.plan_codigo;
      const nombre = fila.plan_nombre;
      const tieneTarifa = fila.monto !== null && fila.monto !== undefined;
      const tr = el(`
        <tr>
          <td>${escapeHtml(nombre)}</td>
          <td class="celda-monto">${tieneTarifa ? formatMoney(fila.monto) : '— (monto plano)'}</td>
          <td class="celda-desde">${tieneTarifa ? formatDateTime(fila.vigente_desde) : '—'}</td>
          <td>
            <div class="fila-tarifa-acciones">
              <button type="button" class="btn btn--secundario btn--chico" data-editar>Editar</button>
              ${tieneTarifa ? '<button type="button" class="btn btn--malo btn--chico" data-eliminar>Eliminar</button>' : ''}
            </div>
          </td>
        </tr>
      `);
      tr.querySelector('[data-editar]').addEventListener('click', () => {
        abrirModalEditar({
          nombreActual: nombre,
          montoActual: tieneTarifa ? fila.monto : null,
          onGuardar: async ({ nombreCambio, montoCambio }) => {
            if (nombreCambio) {
              await conColaSiHaceFalta(
                'editar_nombre_plan', { codigo, nombre: nombreCambio },
                () => api(`/admin/planes/${encodeURIComponent(codigo)}/nombre`, { method: 'PUT', body: { nombre: nombreCambio } }),
                `nombre_${codigo}`
              );
            }
            if (montoCambio) {
              await conColaSiHaceFalta(
                'editar_tarifa_instalacion', { codigo, monto: montoCambio },
                () => api(`/admin/tarifas-instalacion/${encodeURIComponent(codigo)}`, { method: 'PUT', body: { monto: montoCambio } }),
                codigo
              );
            }
            toast(`"${nombreCambio || nombre}" actualizado.`, 'ok');
            await cargar();
          },
        });
      });
      tr.querySelector('[data-eliminar]')?.addEventListener('click', async () => {
        try {
          const { encolado } = await conColaSiHaceFalta(
            'eliminar_tarifa_instalacion', { codigo },
            () => api(`/admin/tarifas-instalacion/${encodeURIComponent(codigo)}`, { method: 'DELETE' }),
            codigo
          );
          if (encolado) {
            toast(`${nombre}: guardado sin conexión — se aplicará al recuperar señal.`, 'neutro');
          } else {
            toast(`Instalación por plan de "${nombre}" eliminada — vuelve a cobrar el monto plano.`, 'neutro');
            await cargar();
          }
        } catch (e) {
          toast(e.message, 'malo');
        }
      });
      $tbody.appendChild(tr);
    }
  }

  await cargar();
}
