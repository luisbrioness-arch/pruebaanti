import { api } from '../api.js';
import { toast } from '../toast.js';
import { abrirModal } from '../modal.js';
import { conColaSiHaceFalta } from '../offline.js';
import { escapeHtml, formatMoney, formatDateTime, el } from '../utils.js';

export async function renderTarifario(container) {
  container.appendChild(el(`
    <div class="vista-contenedor">
      <div class="vista-cabecera">
        <div>
          <h2 class="vista-titulo">Tarifario y comisiones</h2>
          <p class="vista-subtitulo">
            Control centralizado de comisiones comerciales por venta y tarifas diferenciales de instalación por plan.
          </p>
        </div>
      </div>

      <div class="callout-aviso">
        <div class="callout-icono">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        </div>
        <div class="callout-texto">
          <strong>Regla de inmutabilidad financiera:</strong> Editar un monto nunca sobreescribe el anterior: cierra la fila vigente y crea una nueva con fecha actual. Las órdenes y ventas ya aprobadas conservan intacto el monto histórico con el que se calcularon.
        </div>
      </div>

      <div class="tarifario-secciones">
        <!-- Bloque 1: Comisiones por plan -->
        <section class="card-bloque">
          <div class="card-bloque-cabecera">
            <div class="card-bloque-titular">
              <span class="card-bloque-tag card-bloque-tag--indigo">Venta comercial</span>
              <h3>Comisiones por plan</h3>
              <p class="card-bloque-bajada">Incentivo monetario liquidado al técnico por cada suscripción vendida.</p>
            </div>
            <button type="button" class="btn btn--primario btn--chico btn-con-icono" id="btn-nuevo-plan">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>+ Nuevo plan</span>
            </button>
          </div>
          <div class="card-bloque-body">
            <div id="tabla-comisiones" class="tabla-envoltorio"><p class="vacio">Cargando comisiones…</p></div>
          </div>
        </section>

        <!-- Bloque 2: Instalación por plan -->
        <section class="card-bloque">
          <div class="card-bloque-cabecera">
            <div class="card-bloque-titular">
              <span class="card-bloque-tag card-bloque-tag--amber">Escalonamiento decos</span>
              <h3>Instalación por plan</h3>
              <p class="card-bloque-bajada">Tarifas específicas de instalación según la cantidad de decodificadores.</p>
            </div>
            <button type="button" class="btn btn--secundario btn--chico btn-con-icono" id="btn-nuevo-plan-instalacion">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>+ Nuevo plan</span>
            </button>
          </div>
          <div class="nota-explicativa">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; margin-top:1px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            <span>Los planes escalan por cantidad de decodificadores para ventas propias. Si un plan no tiene tarifa diferencial acá, aplicará la tarifa plana estándar.</span>
          </div>
          <div class="card-bloque-body">
            <div id="tabla-instalacion-plan" class="tabla-envoltorio"><p class="vacio">Cargando instalaciones…</p></div>
          </div>
        </section>
      </div>
    </div>
  `));

  const $comisiones = container.querySelector('#tabla-comisiones');
  const $instalacionPlan = container.querySelector('#tabla-instalacion-plan');

  const $btnNuevoPlan = container.querySelector('#btn-nuevo-plan');
  if ($btnNuevoPlan) {
    $btnNuevoPlan.addEventListener('click', () => abrirModalNuevoPlan(cargar));
  }
  const $btnNuevoPlanInst = container.querySelector('#btn-nuevo-plan-instalacion');
  if ($btnNuevoPlanInst) {
    $btnNuevoPlanInst.addEventListener('click', () => abrirModalNuevoPlan(cargar));
  }

  /**
   * Modal compartido de "Editar".
   */
  function abrirModalEditar({ nombreActual, montoActual, onGuardar }) {
    const { root, cerrar } = abrirModal(`
      <div class="modal-tarifa-editar">
        <div class="modal-encabezado-icono">
          <div class="modal-icono-circulo modal-icono-circulo--teal">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800;">Editar "${escapeHtml(nombreActual)}"</h3>
            <p class="modal-explicacion" style="margin: 3px 0 0;">Actualiza el nombre o establece un nuevo monto vigente.</p>
          </div>
        </div>
        <form id="form-editar-fila" style="margin-top: 18px;">
          <label class="campo">
            <span>Nombre del registro</span>
            <input type="text" name="nombre" value="${escapeHtml(nombreActual)}" required>
          </label>
          <label class="campo">
            <span>Monto vigente ($ CLP)</span>
            <div class="input-con-prefijo">
              <span class="input-prefijo">$</span>
              <input type="number" name="monto" min="1" step="1" value="${montoActual ?? ''}" placeholder="Ej: 15000" required>
            </div>
            <small class="campo-ayuda">El valor anterior se cerrará con fecha histórica automáticamente.</small>
          </label>
          <div class="modal-acciones" style="margin-top: 10px;">
            <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
            <button type="submit" class="btn btn--primario">Guardar cambios</button>
          </div>
        </form>
      </div>
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

  /** Modal para crear un plan nuevo */
  function abrirModalNuevoPlan(onCreado) {
    const { root, cerrar } = abrirModal(`
      <div class="modal-nuevo-plan">
        <div class="modal-encabezado-icono">
          <div class="modal-icono-circulo modal-icono-circulo--indigo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800;">Nuevo plan comercial</h3>
            <p class="modal-explicacion" style="margin: 3px 0 0;">Se habilitará en el selector de ventas de la app del técnico.</p>
          </div>
        </div>
        <form id="form-nuevo-plan" style="margin-top: 18px;">
          <label class="campo">
            <span>Código identificador</span>
            <input type="text" name="codigo" placeholder="Ej: plan_premium_2decos" pattern="[a-z0-9_]+" title="Solo minúsculas, números o guion bajo" required>
            <small class="campo-ayuda">Identificador técnico interno (minúsculas, números y guión bajo).</small>
          </label>
          <label class="campo">
            <span>Nombre visible</span>
            <input type="text" name="nombre" placeholder="Ej: Plan Premium 2 Decos" required>
          </label>
          <label class="campo">
            <span>Comisión inicial ($ CLP)</span>
            <div class="input-con-prefijo">
              <span class="input-prefijo">$</span>
              <input type="number" name="comision_inicial" min="1" step="1" placeholder="Ej: 20000" required>
            </div>
          </label>
          <div class="modal-acciones" style="margin-top: 10px;">
            <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
            <button type="submit" class="btn btn--primario">Crear plan</button>
          </div>
        </form>
      </div>
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
          toast(`Plan "${payload.nombre}" creado exitosamente.`, 'ok');
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
      const [{ comisiones }, { tarifas_instalacion: tarifasInstalacion }] = await Promise.all([
        api('/admin/comisiones'),
        api('/admin/tarifas-instalacion'),
      ]);
      renderTablaComisiones(comisiones);
      renderTablaInstalacion(tarifasInstalacion);
    } catch (e) {
      toast(e.message, 'malo');
    }
  }

  // ---------------------------------------------------- Comisiones por plan --
  function renderTablaComisiones(comisionesTodas) {
    const comisiones = comisionesTodas.filter((f) => Number(f.plan_activo) === 1);
    if (!comisiones.length) {
      $comisiones.innerHTML = '<p class="vacio">No hay planes activos configurados todavía.</p>';
      return;
    }
    $comisiones.innerHTML = `
      <table class="tabla tabla--editable">
        <thead>
          <tr>
            <th style="width: 34%;">Plan comercial</th>
            <th style="width: 24%;">Comisión vigente</th>
            <th style="width: 24%;">Vigente desde</th>
            <th style="width: 18%; text-align: right;">Acciones</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;
    const $tbody = $comisiones.querySelector('tbody');
    for (const fila of comisiones) {
      const codigo = fila.plan_codigo;
      const nombre = fila.plan_nombre;
      const tr = el(`
        <tr>
          <td>
            <div class="celda-destacada">
              <span class="fila-nombre">${escapeHtml(nombre)}</span>
            </div>
          </td>
          <td>
            <span class="badge-monto">${formatMoney(fila.monto)}</span>
          </td>
          <td>
            <div class="celda-fecha-contenedor">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <span>${formatDateTime(fila.vigente_desde)}</span>
            </div>
          </td>
          <td>
            <div class="fila-tarifa-acciones">
              <button type="button" class="btn-accion btn-accion--editar" data-editar title="Editar nombre y comisión">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>Editar</span>
              </button>
              <button type="button" class="btn-accion btn-accion--eliminar" data-eliminar-plan title="Eliminar plan">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>Eliminar</span>
              </button>
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

  function confirmarEliminarPlan(codigo, nombre) {
    const { root, cerrar } = abrirModal(`
      <div class="modal-advertencia">
        <div class="modal-encabezado-icono">
          <div class="modal-icono-circulo modal-icono-circulo--malo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: var(--malo);">Eliminar "${escapeHtml(nombre)}"</h3>
            <p class="modal-explicacion" style="margin: 4px 0 0;">
              Dejará de aparecer inmediatamente en el selector de ventas de los técnicos.
            </p>
          </div>
        </div>
        <p style="font-size: 0.85rem; color: var(--tinta-2); margin: 14px 0 18px; line-height: 1.5;">
          No se borra el historial histórico: comisiones e instalaciones previas vinculadas seguirán registradas.
        </p>
        <div class="modal-acciones">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="button" class="btn btn--malo" id="btn-confirmar">Eliminar plan</button>
        </div>
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
  function renderTablaInstalacion(filas) {
    if (!filas.length) {
      $instalacionPlan.innerHTML = '<p class="vacio">Todavía no hay planes creados para asociar instalaciones.</p>';
      return;
    }
    $instalacionPlan.innerHTML = `
      <table class="tabla tabla--editable">
        <thead>
          <tr>
            <th style="width: 34%;">Plan comercial</th>
            <th style="width: 24%;">Tarifa instalación propia</th>
            <th style="width: 24%;">Vigente desde</th>
            <th style="width: 18%; text-align: right;">Acciones</th>
          </tr>
        </thead>
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
          <td>
            <div class="celda-destacada">
              <span class="fila-nombre">${escapeHtml(nombre)}</span>
            </div>
          </td>
          <td>
            ${tieneTarifa
              ? `<span class="badge-monto">${formatMoney(fila.monto)}</span>`
              : `<span class="badge-monto badge-monto--mudo">Tarifa plana</span>`
            }
          </td>
          <td>
            ${tieneTarifa
              ? `
                <div class="celda-fecha-contenedor">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  <span>${formatDateTime(fila.vigente_desde)}</span>
                </div>
              `
              : `<span style="color: var(--tinta-3); font-size: 0.85rem;">—</span>`
            }
          </td>
          <td>
            <div class="fila-tarifa-acciones">
              <button type="button" class="btn-accion btn-accion--editar" data-editar title="${tieneTarifa ? 'Modificar tarifa vigente' : 'Asignar monto específico'}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>${tieneTarifa ? 'Editar' : 'Fijar'}</span>
              </button>
              ${tieneTarifa ? `
                <button type="button" class="btn-accion btn-accion--eliminar" data-eliminar title="Volver a tarifa plana estándar">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  <span>Eliminar</span>
                </button>
              ` : ''}
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
