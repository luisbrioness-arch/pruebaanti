// Paso 4 — ferretería consumida + datos de cierre técnico. El kit estándar
// se precarga llamando a /ferreteria con items:[] apenas se entra a este
// paso (si todavía no hay nada guardado) — el servidor lo resuelve y desde
// ahí el técnico solo ajusta cantidades (ver wizard-api.md: el paso
// "reemplaza siempre el conjunto completo", nunca hace diff).
//
// Sin conexión: se usa el último kit de ESTE tipo de servicio que se haya
// visto con señal (ver storage.js: guardarKitCache) — si nunca se entró acá
// con señal para este tipo de servicio, no hay de dónde sacarlo, y queda
// documentado como límite conocido (ver docs/tecnico-app.md).
import { api, ApiError } from '../../api.js';
import { el, escapeHtml } from '../../utils.js';
import { toast } from '../../toast.js';
import { encolar } from '../../offline.js';
import { guardarKitCache, obtenerKitCache, getCatalogoFerreteria } from '../../storage.js';

export async function renderPaso4(container, ctx) {
  const seccion = el(`
    <div style="display: contents;">
    <section class="wizard-paso">
      <h2>Ferretería usada</h2>
      <p class="wizard-paso-intro" id="ferreteria-intro">Cargando el kit estándar…</p>
      <div class="lista-ferreteria" id="lista-ferreteria"></div>

      <div class="campo campo--inline" id="agregar-ferreteria" hidden>
        <select id="select-item-ferreteria"></select>
        <button type="button" class="btn btn--secundario" id="btn-agregar-ferreteria">+ Agregar</button>
      </div>

      <h2>Cierre técnico</h2>
      <form id="form-cierre" class="paso1-form" novalidate>
        <label class="campo">
          <span>Señal (%)</span>
          <input type="number" name="senal_porcentaje" min="0" max="100" inputmode="numeric">
        </label>
        <label class="campo">
          <span>Calidad (%)</span>
          <input type="number" name="calidad_porcentaje" min="0" max="100" inputmode="numeric">
        </label>
        <label class="campo">
          <span>Satélite</span>
          <input type="text" name="satelite" autocomplete="off">
        </label>
        <label class="campo">
          <span>Metros de cable usados</span>
          <input type="number" name="metros_cable" min="0" step="0.5" inputmode="decimal">
        </label>
        <label class="campo">
          <span>Observaciones</span>
          <textarea name="observaciones" maxlength="500"></textarea>
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
  for (const campo of ['senal_porcentaje', 'calidad_porcentaje', 'satelite', 'metros_cable', 'observaciones']) {
    if (ordenInicial[campo] !== null && ordenInicial[campo] !== undefined) {
      form.elements[campo].value = ordenInicial[campo];
    }
  }

  const $lista = seccion.querySelector('#lista-ferreteria');
  const $intro = seccion.querySelector('#ferreteria-intro');
  const $error = seccion.querySelector('#paso4-error');
  const $siguiente = seccion.querySelector('#paso4-siguiente');
  const $agregar = seccion.querySelector('#agregar-ferreteria');
  const $selectAgregar = seccion.querySelector('#select-item-ferreteria');
  const $btnAgregar = seccion.querySelector('#btn-agregar-ferreteria');

  let items = []; // [{item_ferreteria_id, item_nombre, unidad_medida, cantidad_final}]
  // Catálogo completo (no solo el kit) — permite agregar algo que el kit por
  // defecto no trae. Si no hay señal ni caché todavía, simplemente no se
  // ofrece la opción: el técnico sigue pudiendo ajustar lo que el kit sí
  // trajo (ver docs/tecnico-app.md, "Agregar ítem fuera del kit").
  const catalogoFerreteria = getCatalogoFerreteria() || [];

  function pintarSelectAgregar() {
    if (!catalogoFerreteria.length) {
      $agregar.hidden = true;
      return;
    }
    const idsEnUso = new Set(items.map((i) => i.item_ferreteria_id));
    const disponibles = catalogoFerreteria.filter((c) => !idsEnUso.has(c.id));
    if (!disponibles.length) {
      $agregar.hidden = true;
      return;
    }
    $agregar.hidden = false;
    $selectAgregar.innerHTML = disponibles
      .map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`)
      .join('');
  }

  function pintarFerreteria() {
    if (!items.length) {
      $lista.innerHTML = '<p class="vacio">Sin ítems de ferretería para este servicio todavía — agrega lo que hayas usado.</p>';
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
          pintarSelectAgregar();
        });
        $lista.appendChild(fila);
      }
    }
    pintarSelectAgregar();
  }

  $btnAgregar.addEventListener('click', () => {
    const id = Number($selectAgregar.value);
    const elegido = catalogoFerreteria.find((c) => c.id === id);
    if (!elegido) return;
    items.push({
      item_ferreteria_id: elegido.id,
      item_nombre: elegido.nombre,
      unidad_medida: elegido.unidad_medida,
      cantidad_final: elegido.unidad_medida === 'metro' ? 0.5 : 1,
    });
    pintarFerreteria();
  });

  function redondear(n, paso) {
    return Math.round(n / paso) * paso;
  }

  async function cargarFerreteria() {
    const orden = ctx.getOrden();
    if (orden.ferreteria.length) {
      items = orden.ferreteria.map((f) => ({
        item_ferreteria_id: f.item_ferreteria_id, item_nombre: f.item_nombre,
        unidad_medida: f.unidad_medida, cantidad_final: Number(f.cantidad_final),
      }));
      $intro.textContent = 'Ajusta las cantidades si usaste más o menos que el kit estándar.';
      pintarFerreteria();
      return;
    }

    try {
      const ordenActualizada = await api(`/ordenes/${encodeURIComponent(ctx.uuid)}/ferreteria`, { method: 'POST', body: { items: [] } });
      ctx.setOrden(ordenActualizada);
      items = ordenActualizada.ferreteria.map((f) => ({
        item_ferreteria_id: f.item_ferreteria_id, item_nombre: f.item_nombre,
        unidad_medida: f.unidad_medida, cantidad_final: Number(f.cantidad_final),
      }));
      if (items.length) {
        guardarKitCache(orden.tipo_servicio_id, items.map((i) => ({ ...i, cantidad_estandar: i.cantidad_final })));
      }
      $intro.textContent = 'Ajusta las cantidades si usaste más o menos que el kit estándar.';
      pintarFerreteria();
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'sin_conexion')) {
        $intro.textContent = '';
        $lista.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
        return;
      }
      const kitCacheado = obtenerKitCache(orden.tipo_servicio_id);
      if (kitCacheado && kitCacheado.length) {
        items = kitCacheado.map((k) => ({ ...k, cantidad_final: k.cantidad_estandar }));
        $intro.textContent = 'Sin conexión — se precargó el último kit guardado para este tipo de servicio. Se confirma al recuperar señal.';
        pintarFerreteria();
      } else {
        $intro.textContent = 'Sin conexión y sin un kit guardado de antes para este tipo de servicio — puedes seguir sin ferretería; se ajusta después con el administrador si hace falta.';
        pintarFerreteria();
      }
    }
  }
  await cargarFerreteria();

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
