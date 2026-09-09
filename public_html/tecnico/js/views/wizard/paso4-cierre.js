// Paso 4 — ferretería consumida + datos de cierre técnico. Ya NO se
// precarga ningún "kit estándar" — cada orden nace sin ferretería y el
// técnico busca y agrega uno por uno lo que realmente usó (pedido: "eliminar
// stock básico de cada trabajo y tener un buscador de ítem y agregar
// cantidad"). El catálogo completo se cachea igual que antes (getCatalogoFerreteria)
// para que el buscador funcione aunque se pierda la señal en este paso.
import { api, ApiError } from '../../api.js';
import { el, escapeHtml } from '../../utils.js';
import { toast } from '../../toast.js';
import { encolar } from '../../offline.js';
import { getCatalogoFerreteria } from '../../storage.js';

export async function renderPaso4(container, ctx) {
  const tipoServicio = ctx.getTipoServicio();
  const esSoporte = tipoServicio && (
    tipoServicio.codigo === 'soporte_falla' ||
    (tipoServicio.nombre && tipoServicio.nombre.toLowerCase().includes('soporte')) ||
    (tipoServicio.nombre && tipoServicio.nombre.toLowerCase().includes('falla'))
  );

  const seccion = el(`
    <div style="display: contents;">
    <section class="wizard-paso">
      <h2>Ferretería usada (opcional)</h2>
      <p class="wizard-paso-intro" id="ferreteria-intro">Busca y agrega los materiales usados. Si este servicio no requirió ferretería ni conectores, continúa directamente al cierre abajo.</p>
      <div class="lista-ferreteria" id="lista-ferreteria"></div>

      <div class="campo" id="agregar-ferreteria" hidden style="position: relative;">
        <input type="text" id="buscar-item-ferreteria" placeholder="Busca un ítem (ej: grampa, conector…)" autocomplete="off">
        <div class="resultados-buscador" id="resultados-item-ferreteria" hidden></div>
      </div>

      <h2>Cierre técnico</h2>
      <form id="form-cierre" class="paso1-form" novalidate>
        <label class="campo">
          <span>Señal (%)</span>
          <input type="number" name="senal_porcentaje" min="0" max="100" inputmode="numeric" placeholder="Ej: 85">
        </label>
        <label class="campo">
          <span>Calidad (%)</span>
          <input type="number" name="calidad_porcentaje" min="0" max="100" inputmode="numeric" placeholder="Ej: 80">
        </label>
        <label class="campo">
          <span>Metros de cable usados</span>
          <input type="number" name="metros_cable" min="0" step="0.5" inputmode="decimal" placeholder="0">
        </label>
        <label class="campo ${esSoporte ? 'campo--destacado' : ''}" style="${esSoporte ? 'background: #fffbeb; border: 1.5px solid #f59e0b; border-radius: 8px; padding: 10px 12px; margin-top: 8px;' : ''}">
          <span style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 4px;">
            <strong style="color: ${esSoporte ? '#92400e' : 'inherit'}; font-size: 0.9rem;">
              ${esSoporte ? '📝 Nota de Cierre / Diagnóstico y Trabajo Realizado *' : 'Observaciones / Nota de Cierre'}
            </strong>
            ${esSoporte ? '<span class="chip chip--alerta" style="font-size: 0.68rem; font-weight: 700;">Obligatorio en soporte</span>' : ''}
          </span>
          <textarea name="observaciones" maxlength="500" rows="3" style="width: 100%; box-sizing: border-box;" placeholder="${esSoporte ? 'Describe el diagnóstico técnico, causa del problema, solución ejecutada y estado final del servicio...' : 'Observaciones o notas adicionales del servicio en terreno...'}"></textarea>
          ${esSoporte ? '<span style="font-size: 0.74rem; color: #78350f; display: block; margin-top: 4px;">Por favor indica el diagnóstico de la falla y qué trabajo realizaste para resolverla.</span>' : ''}
        </label>
      </form>
      <p class="campo-error" id="paso4-error" hidden></p>
    </section>
    <div class="wizard-acciones">
      <button type="button" class="btn btn--secundario" id="paso4-atras">Atrás</button>
      <button type="button" class="btn btn--primario btn--ancho" id="paso4-siguiente">Siguiente</button>
    </div>
    </div>
  `);
  container.appendChild(seccion);

  const form = seccion.querySelector('#form-cierre');
  const ordenInicial = ctx.getOrden();
  for (const campo of ['senal_porcentaje', 'calidad_porcentaje', 'metros_cable', 'observaciones']) {
    if (ordenInicial[campo] !== null && ordenInicial[campo] !== undefined) {
      form.elements[campo].value = ordenInicial[campo];
    }
  }

  const $lista = seccion.querySelector('#lista-ferreteria');
  const $intro = seccion.querySelector('#ferreteria-intro');
  const $error = seccion.querySelector('#paso4-error');
  const $siguiente = seccion.querySelector('#paso4-siguiente');
  const $agregar = seccion.querySelector('#agregar-ferreteria');
  const $buscar = seccion.querySelector('#buscar-item-ferreteria');
  const $resultados = seccion.querySelector('#resultados-item-ferreteria');

  let items = []; // [{item_ferreteria_id, item_nombre, unidad_medida, cantidad_final}]
  // Catálogo completo — de acá sale todo lo que el técnico puede agregar,
  // ya no hay un "kit por defecto" que lo precargue. Si no hay señal ni
  // caché todavía (getCatalogoFerreteria vacío), simplemente no se ofrece
  // el buscador — no hay de dónde sacar los nombres (ver docs/tecnico-app.md).
  const catalogoFerreteria = getCatalogoFerreteria() || [];

  function agregarItem(elegido) {
    items.push({
      item_ferreteria_id: elegido.id,
      item_nombre: elegido.nombre,
      unidad_medida: elegido.unidad_medida,
      cantidad_final: elegido.unidad_medida === 'metro' ? 0.5 : 1,
    });
    $buscar.value = '';
    $resultados.hidden = true;
    pintarFerreteria();
  }

  function pintarResultadosBuscador() {
    const texto = $buscar.value.trim().toLowerCase();
    if (!catalogoFerreteria.length) {
      $agregar.hidden = true;
      return;
    }
    $agregar.hidden = false;
    if (!texto) {
      $resultados.hidden = true;
      $resultados.innerHTML = '';
      return;
    }
    const idsEnUso = new Set(items.map((i) => i.item_ferreteria_id));
    const coincidencias = catalogoFerreteria
      .filter((c) => !idsEnUso.has(c.id) && c.nombre.toLowerCase().includes(texto))
      .slice(0, 8);
    if (!coincidencias.length) {
      $resultados.hidden = false;
      $resultados.innerHTML = '<p class="vacio" style="padding: 8px 12px;">Sin coincidencias.</p>';
      return;
    }
    $resultados.hidden = false;
    $resultados.innerHTML = coincidencias
      .map((c) => `<button type="button" class="resultado-buscador-item" data-id="${c.id}">${escapeHtml(c.nombre)}</button>`)
      .join('');
    $resultados.querySelectorAll('.resultado-buscador-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const elegido = catalogoFerreteria.find((c) => c.id === Number(btn.dataset.id));
        if (elegido) agregarItem(elegido);
      });
    });
  }
  $buscar.addEventListener('input', pintarResultadosBuscador);

  function pintarFerreteria() {
    if (!items.length) {
      $lista.innerHTML = `
        <div style="background: rgba(0,0,0,0.02); border: 1.5px dashed var(--borde, #cbd5e1); border-radius: 8px; padding: 12px 14px; text-align: center; color: var(--tinta-2, #64748b); font-size: 0.84rem; margin-bottom: 12px;">
          <span>🔩 <strong>Sin ferretería:</strong> Si no utilizaste materiales ni conectores en este servicio, puedes avanzar directamente.</span>
        </div>
      `;
    } else {
      $lista.innerHTML = '';
      for (const item of items) {
        const paso = item.unidad_medida === 'metro' ? 0.5 : 1;
        const fila = el(`
          <div class="item-ferreteria">
            <span class="item-ferreteria-nombre">${escapeHtml(item.item_nombre)}</span>
            <span class="item-ferreteria-cantidad">
              <button type="button" data-delta="-${paso}">−</button>
              <input type="number" min="0" step="${paso}" value="${item.cantidad_final}">
              <button type="button" data-delta="${paso}">+</button>
            </span>
            <span class="item-ferreteria-unidad">${escapeHtml(item.unidad_medida)}</span>
            <button type="button" class="item-ferreteria-quitar" aria-label="Quitar ${escapeHtml(item.item_nombre)}">🗑️</button>
          </div>
        `);
        const $input = fila.querySelector('input');
        fila.querySelectorAll('button[data-delta]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const delta = Number(btn.dataset.delta);
            item.cantidad_final = Math.max(0, redondear(item.cantidad_final + delta, paso));
            $input.value = item.cantidad_final;
          });
        });
        $input.addEventListener('change', () => {
          item.cantidad_final = Math.max(0, Number($input.value) || 0);
          $input.value = item.cantidad_final;
        });
        fila.querySelector('.item-ferreteria-quitar').addEventListener('click', () => {
          items = items.filter((i) => i !== item);
          pintarFerreteria();
        });
        $lista.appendChild(fila);
      }
    }
    pintarResultadosBuscador();
  }

  function redondear(n, paso) {
    return Math.round(n / paso) * paso;
  }

  function cargarFerreteria() {
    // Ya no hay ninguna llamada al servidor acá: sin kit que precargar no
    // hace falta ir a buscar nada antes de mostrar la pantalla. Si el
    // técnico ya había guardado ferretería en un paso anterior de ESTA
    // orden (volvió atrás y avanzó de nuevo), se respeta lo que ya eligió.
    const orden = ctx.getOrden();
    items = orden.ferreteria.map((f) => ({
      item_ferreteria_id: f.item_ferreteria_id, item_nombre: f.item_nombre,
      unidad_medida: f.unidad_medida, cantidad_final: Number(f.cantidad_final),
    }));
    if (!catalogoFerreteria.length) {
      $intro.textContent = 'Sin catálogo de ferretería en caché todavía (hace falta haber entrado acá alguna vez con señal) — puedes seguir sin agregar nada; se ajusta después con el administrador si hace falta.';
    }
    pintarFerreteria();
  }
  cargarFerreteria();

  seccion.querySelector('#paso4-atras').addEventListener('click', () => ctx.irPaso(3));

  async function guardarFerreteria() {
    const cuerpo = { items: items.map((i) => ({ item_ferreteria_id: i.item_ferreteria_id, cantidad_final: i.cantidad_final })) };
    try {
      return { orden: await api(`/ordenes/${encodeURIComponent(ctx.uuid)}/ferreteria`, { method: 'POST', body: cuerpo }), encolado: false };
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'sin_conexion')) throw e;
      await encolar('ferreteria', ctx.uuid, cuerpo);
      return {
        orden: {
          ...ctx.getOrden(),
          ferreteria: items.map((i) => ({ ...i, cantidad_estandar: i.cantidad_final, ajustado_manualmente: 0 })),
        },
        encolado: true,
      };
    }
  }

  async function guardarCierre(datosCierre) {
    try {
      return { orden: await api(`/ordenes/${encodeURIComponent(ctx.uuid)}/cierre`, { method: 'PATCH', body: datosCierre }), encolado: false };
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'sin_conexion')) throw e;
      await encolar('cierre', ctx.uuid, datosCierre);
      return { orden: { ...ctx.getOrden(), ...datosCierre }, encolado: true };
    }
  }

  $siguiente.addEventListener('click', async () => {
    $error.hidden = true;
    for (const campo of ['senal_porcentaje', 'calidad_porcentaje']) {
      const valor = form.elements[campo].value;
      if (valor !== '' && (Number(valor) < 0 || Number(valor) > 100)) {
        $error.textContent = 'Señal y calidad deben estar entre 0 y 100.';
        $error.hidden = false;
        return;
      }
    }

    if (esSoporte) {
      const nota = (form.elements.observaciones.value || '').trim();
      if (!nota) {
        $error.textContent = 'Debes ingresar la Nota de Cierre / Diagnóstico detallando el trabajo y solución efectuada.';
        $error.hidden = false;
        form.elements.observaciones.focus();
        return;
      }
    }

    $siguiente.disabled = true;
    $siguiente.textContent = 'Guardando…';
    try {
      const resultadoFerreteria = await guardarFerreteria();
      ctx.setOrden(resultadoFerreteria.orden);

      const datosCierre = Object.fromEntries(new FormData(form));
      for (const clave of Object.keys(datosCierre)) {
        if (datosCierre[clave] === '') delete datosCierre[clave];
      }
      const resultadoCierre = await guardarCierre(datosCierre);
      ctx.setOrden(resultadoCierre.orden);

      if (resultadoFerreteria.encolado || resultadoCierre.encolado) {
        toast('Guardado sin conexión — se enviará al recuperar señal.', 'neutro');
      }
      await ctx.irPaso(5);
    } catch (e) {
      $error.textContent = e.message;
      $error.hidden = false;
      $siguiente.disabled = false;
      $siguiente.textContent = 'Siguiente';
    }
  });
}
