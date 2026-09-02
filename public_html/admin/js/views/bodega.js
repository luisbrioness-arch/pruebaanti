import { api } from '../api.js';
import { toast } from '../toast.js';
import { conColaSiHaceFalta } from '../offline.js';
import { badge, escapeHtml, el } from '../utils.js';
import { abrirScanner } from '../scanner.js';

export async function renderBodega(container) {
  container.appendChild(el(`
    <section class="bodega">
      <nav class="subtabs">
        <button type="button" class="subtab subtab--activo" data-tab="equipos">Equipos</button>
        <button type="button" class="subtab" data-tab="ferreteria">Ferretería</button>
        <button type="button" class="subtab" data-tab="kits">Kits estándar</button>
      </nav>
      <div id="bodega-contenido"><p class="vacio">Cargando…</p></div>
    </section>
  `));

  const $contenido = container.querySelector('#bodega-contenido');
  const $tabs = Array.from(container.querySelectorAll('.subtab'));

  // Catálogos compartidos por las tres pestañas — se piden una sola vez.
  const [{ usuarios }, { tipos_equipo: tiposEquipo }, { items }, { tipos_servicio: tiposServicio }] = await Promise.all([
    api('/admin/usuarios'),
    api('/admin/catalogo/tipos-equipo'),
    api('/admin/catalogo/items-ferreteria'),
    api('/catalogo/tipos-servicio'),
  ]);

  function opcionesUsuarios(seleccionado, excluirId) {
    return usuarios
      .filter((u) => String(u.id) !== String(excluirId ?? ''))
      .map((u) => `<option value="${u.id}" ${String(u.id) === String(seleccionado) ? 'selected' : ''}>${escapeHtml(u.nombre)}</option>`)
      .join('');
  }

  async function activarTab(nombre) {
    $tabs.forEach((t) => t.classList.toggle('subtab--activo', t.dataset.tab === nombre));
    $contenido.innerHTML = '<p class="vacio">Cargando…</p>';
    if (nombre === 'equipos') await renderEquipos();
    else if (nombre === 'ferreteria') await renderFerreteria();
    else await renderKits();
  }
  $tabs.forEach((t) => t.addEventListener('click', () => activarTab(t.dataset.tab)));

  // ------------------------------------------------------------- Equipos --
  async function renderEquipos() {
    $contenido.innerHTML = `
      <form id="form-alta" class="form-fila">
        <label class="campo campo--inline">
          <span>Tipo</span>
          <select name="tipo_equipo" required>
            ${tiposEquipo.map((t) => `<option value="${t.codigo}">${escapeHtml(t.nombre)}</option>`).join('')}
          </select>
        </label>
        <label class="campo campo--inline">
          <span>N° de serie</span>
          <input type="text" name="numero_serie" id="input-numero-serie" placeholder="Ej: 8934221100561" required>
        </label>
        <button type="button" class="btn btn--secundario" id="btn-escanear-serie" title="Escanear código de barras">📷 Escanear</button>
        <button type="submit" class="btn btn--primario">Dar de alta en bodega</button>
      </form>

      <label class="campo campo--inline">
        <span>Filtrar por estado</span>
        <select id="filtro-estado-equipo">
          <option value="">Todos</option>
          <option value="bodega">En bodega</option>
          <option value="maleta">En maleta</option>
          <option value="instalado">Instalado</option>
          <option value="retirado">Retirado</option>
          <option value="falla_fabrica">Falla de fábrica</option>
        </select>
      </label>

      <div id="tabla-equipos"><p class="vacio">Cargando…</p></div>
    `;

    const $filtro = $contenido.querySelector('#filtro-estado-equipo');
    $filtro.addEventListener('change', () => cargarTablaEquipos($filtro.value));

    $contenido.querySelector('#btn-escanear-serie').addEventListener('click', async () => {
      const resultado = await abrirScanner();
      if (resultado) $contenido.querySelector('#input-numero-serie').value = resultado.serie;
    });

    $contenido.querySelector('#form-alta').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const payload = { tipo_equipo: fd.get('tipo_equipo'), numero_serie: fd.get('numero_serie').trim() };
      try {
        const { datos, encolado } = await conColaSiHaceFalta('alta_equipo', payload, () => api('/admin/equipos', { method: 'POST', body: payload }));
        ev.target.reset();
        if (encolado) {
          // No se refresca la tabla: sin conexión no hay forma de saber el
          // estado real, y mostrar un error de red justo después del aviso
          // de "guardado" confundiría más de lo que ayuda.
          toast(`Serie ${escapeHtml(payload.numero_serie)} guardada sin conexión — se dará de alta al recuperar señal.`, 'neutro');
        } else {
          toast(`Equipo ${escapeHtml(datos.numero_serie)} dado de alta en bodega.`, 'ok');
          await cargarTablaEquipos($filtro.value);
        }
      } catch (e) {
        toast(e.message, 'malo');
      }
    });

    await cargarTablaEquipos('');
  }

  /**
   * Selección para acciones masivas (reporte #5: "poder seleccionar varios
   * equipos y transferir"). Solo tiene sentido entre filas del MISMO estado
   * (asignar es 'bodega'→técnico, traspasar es 'maleta'→otro técnico) — no
   * hay una acción común a mezclar entre estados distintos, así que la
   * barra de acciones se oculta si la selección queda mixta.
   */
  const seleccionados = new Map(); // id -> { estado, numero_serie }

  async function cargarTablaEquipos(estado) {
    const $tabla = $contenido.querySelector('#tabla-equipos');
    seleccionados.clear();
    try {
      const qs = estado ? `?estado=${encodeURIComponent(estado)}` : '';
      const { equipos } = await api(`/admin/equipos${qs}`);
      if (!equipos.length) {
        $tabla.innerHTML = '<p class="vacio">No hay equipos en este estado.</p>';
        return;
      }
      $tabla.innerHTML = `
        <div id="acciones-masivas" class="acciones-masivas" hidden></div>
        <table class="tabla">
          <thead><tr><th></th><th>Serie</th><th>Tipo</th><th>Estado</th><th>Técnico</th><th>Acciones</th></tr></thead>
          <tbody></tbody>
        </table>
      `;
      const $barra = $tabla.querySelector('#acciones-masivas');

      function actualizarBarra() {
        if (!seleccionados.size) { $barra.hidden = true; $barra.innerHTML = ''; return; }
        const estados = new Set([...seleccionados.values()].map((v) => v.estado));
        if (estados.size > 1) {
          $barra.hidden = false;
          $barra.innerHTML = `<p class="campo-ayuda">${seleccionados.size} seleccionados — mezclan estados distintos, no se pueden mover juntos.</p>`;
          return;
        }
        const estadoComun = [...estados][0];
        if (estadoComun === 'bodega') {
          $barra.hidden = false;
          $barra.innerHTML = `
            <form id="form-asignar-masivo" class="form-fila">
              <span class="campo-ayuda">${seleccionados.size} en bodega seleccionados</span>
              <select name="tecnico_id" required>${opcionesUsuarios()}</select>
              <button type="submit" class="btn btn--primario btn--chico">Asignar seleccionados</button>
            </form>
          `;
          $barra.querySelector('#form-asignar-masivo').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const tecnicoId = Number(new FormData(ev.target).get('tecnico_id'));
            await ejecutarAccionMasiva('asignar_equipo', (id) => api(`/admin/equipos/${id}/asignar`, { method: 'POST', body: { tecnico_id: tecnicoId } }), (id) => ({ id, tecnico_id: tecnicoId }));
          });
        } else if (estadoComun === 'maleta') {
          $barra.hidden = false;
          $barra.innerHTML = `
            <form id="form-traspasar-masivo" class="form-fila">
              <span class="campo-ayuda">${seleccionados.size} en maleta seleccionados</span>
              <select name="tecnico_destino_id" required>${opcionesUsuarios()}</select>
              <button type="submit" class="btn btn--primario btn--chico">Traspasar seleccionados</button>
            </form>
          `;
          $barra.querySelector('#form-traspasar-masivo').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const tecnicoDestinoId = Number(new FormData(ev.target).get('tecnico_destino_id'));
            await ejecutarAccionMasiva('traspasar_equipo', (id) => api(`/admin/equipos/${id}/traspasar`, { method: 'POST', body: { tecnico_destino_id: tecnicoDestinoId } }), (id) => ({ id, tecnico_destino_id: tecnicoDestinoId }));
          });
        } else {
          $barra.hidden = true;
        }
      }

      /**
       * Manda una acción por cada seleccionado, uno por uno — no hay un
       * endpoint masivo real en el servidor para esto, así que se reusan
       * los mismos endpoints de a uno (cada uno pasa igual por la cola
       * offline si hace falta). Sin conexión, cada ítem queda encolado por
       * separado y se procesan en orden al recuperar señal.
       */
      async function ejecutarAccionMasiva(tipo, llamada, armarPayload) {
        const ids = [...seleccionados.keys()];
        let ok = 0, encoladosN = 0, fallidos = 0;
        for (const id of ids) {
          const info = seleccionados.get(id);
          try {
            const { encolado } = await conColaSiHaceFalta(tipo, armarPayload(id), () => llamada(id));
            if (encolado) encoladosN++; else ok++;
          } catch (e) {
            fallidos++;
            console.error('[terreno-dth admin] acción masiva falló para', info.numero_serie, e.message);
          }
        }
        if (fallidos) toast(`${fallidos} de ${ids.length} fallaron — revisa la consola.`, 'malo');
        else if (encoladosN) toast(`${ok + encoladosN} guardados${encoladosN ? `, ${encoladosN} sin conexión (se aplicarán al recuperar señal)` : ''}.`, 'neutro');
        else toast(`${ok} equipos actualizados.`, 'ok');
        await cargarTablaEquipos(estado);
      }

      const $tbody = $tabla.querySelector('tbody');
      for (const e of equipos) {
        const puedeSeleccionar = e.estado === 'bodega' || e.estado === 'maleta';
        const tr = el(`
          <tr>
            <td>${puedeSeleccionar ? `<input type="checkbox" class="check-equipo" data-id="${e.id}">` : ''}</td>
            <td class="celda-mono">${escapeHtml(e.numero_serie)}</td>
            <td>${escapeHtml(e.tipo_equipo_nombre)}</td>
            <td>${badge(e.estado)}</td>
            <td>${escapeHtml(e.tecnico_nombre || '—')}</td>
            <td class="celda-acciones"></td>
          </tr>
        `);
        const $acciones = tr.querySelector('.celda-acciones');

        tr.querySelector('.check-equipo')?.addEventListener('change', (ev) => {
          if (ev.target.checked) seleccionados.set(e.id, { estado: e.estado, numero_serie: e.numero_serie });
          else seleccionados.delete(e.id);
          actualizarBarra();
        });

        /** Sin conexión no hay fila nueva que pintar (el servidor decide el estado real) — se marca esta fila como "en camino" y se le quitan más acciones hasta que se sepa de verdad. */
        function marcarFilaPendiente(mensaje) {
          $acciones.innerHTML = `<span class="chip chip--alerta">⏳ ${escapeHtml(mensaje)}</span>`;
        }

        if (e.estado === 'bodega') {
          const form = el(`
            <form class="form-inline">
              <select name="tecnico_id" required>${opcionesUsuarios()}</select>
              <button type="submit" class="btn btn--secundario btn--chico">Asignar</button>
            </form>
          `);
          form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const tecnicoId = Number(new FormData(ev.target).get('tecnico_id'));
            const payload = { id: e.id, tecnico_id: tecnicoId };
            try {
              const { encolado } = await conColaSiHaceFalta('asignar_equipo', payload, () => api(`/admin/equipos/${e.id}/asignar`, { method: 'POST', body: { tecnico_id: tecnicoId } }));
              if (encolado) {
                toast(`${escapeHtml(e.numero_serie)}: guardado sin conexión — se asignará al recuperar señal.`, 'neutro');
                marcarFilaPendiente('asignación pendiente');
              } else {
                toast(`${escapeHtml(e.numero_serie)} asignado.`, 'ok');
                await cargarTablaEquipos(estado);
              }
            } catch (err) { toast(err.message, 'malo'); }
          });
          $acciones.appendChild(form);
        }
        if (e.estado === 'maleta') {
          const form = el(`
            <form class="form-inline">
              <select name="tecnico_destino_id" required>${opcionesUsuarios(null, e.usuario_actual_id)}</select>
              <button type="submit" class="btn btn--secundario btn--chico">Traspasar</button>
            </form>
          `);
          form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const tecnicoDestinoId = Number(new FormData(ev.target).get('tecnico_destino_id'));
            const payload = { id: e.id, tecnico_destino_id: tecnicoDestinoId };
            try {
              const { encolado } = await conColaSiHaceFalta('traspasar_equipo', payload, () => api(`/admin/equipos/${e.id}/traspasar`, { method: 'POST', body: { tecnico_destino_id: tecnicoDestinoId } }));
              if (encolado) {
                toast(`${escapeHtml(e.numero_serie)}: guardado sin conexión — se traspasará al recuperar señal.`, 'neutro');
                marcarFilaPendiente('traspaso pendiente');
              } else {
                toast(`${escapeHtml(e.numero_serie)} traspasado.`, 'ok');
                await cargarTablaEquipos(estado);
              }
            } catch (err) { toast(err.message, 'malo'); }
          });
          $acciones.appendChild(form);
        }
        if (e.estado === 'retirado') {
          const btn = el('<button type="button" class="btn btn--secundario btn--chico">Ingresó a bodega</button>');
          btn.addEventListener('click', async () => {
            try {
              const { encolado } = await conColaSiHaceFalta('ingreso_bodega', { id: e.id }, () => api(`/admin/equipos/${e.id}/ingreso-bodega`, { method: 'POST' }));
              if (encolado) {
                toast(`${escapeHtml(e.numero_serie)}: guardado sin conexión — se registrará el ingreso al recuperar señal.`, 'neutro');
                marcarFilaPendiente('ingreso pendiente');
              } else {
                toast(`${escapeHtml(e.numero_serie)} de vuelta en bodega.`, 'ok');
                await cargarTablaEquipos(estado);
              }
            } catch (err) { toast(err.message, 'malo'); }
          });
          $acciones.appendChild(btn);
        }
        if (!['falla_fabrica', 'devuelto_tuves', 'perdido'].includes(e.estado)) {
          const btnFalla = el('<button type="button" class="btn btn--malo btn--chico">Falla de fábrica</button>');
          btnFalla.addEventListener('click', async () => {
            try {
              const { encolado } = await conColaSiHaceFalta('falla_fabrica', { id: e.id, observacion: null }, () => api(`/admin/equipos/${e.id}/falla-fabrica`, { method: 'POST', body: {} }));
              if (encolado) {
                toast(`${escapeHtml(e.numero_serie)}: guardado sin conexión — se marcará al recuperar señal.`, 'neutro');
                marcarFilaPendiente('falla de fábrica pendiente');
              } else {
                toast(`${escapeHtml(e.numero_serie)} marcado como falla de fábrica.`, 'alerta');
                await cargarTablaEquipos(estado);
              }
            } catch (err) { toast(err.message, 'malo'); }
          });
          $acciones.appendChild(btnFalla);
        }
        $tbody.appendChild(tr);
      }
    } catch (e) {
      $tabla.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  // ---------------------------------------------------------- Ferretería --
  async function renderFerreteria() {
    $contenido.innerHTML = `
      <form id="form-entrega" class="form-fila">
        <label class="campo campo--inline">
          <span>Ítem</span>
          <select name="item_codigo" required>${items.map((i) => `<option value="${i.codigo}">${escapeHtml(i.nombre)}</option>`).join('')}</select>
        </label>
        <label class="campo campo--inline">
          <span>Técnico</span>
          <select name="tecnico_id" required>${opcionesUsuarios()}</select>
        </label>
        <label class="campo campo--inline">
          <span>Cantidad</span>
          <input type="number" name="cantidad" min="0.01" step="0.01" required>
        </label>
        <button type="submit" class="btn btn--primario">Entregar</button>
      </form>
      <div id="tabla-stock"><p class="vacio">Cargando…</p></div>
    `;

    $contenido.querySelector('#form-entrega').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const payload = {
        item_codigo: fd.get('item_codigo'),
        tecnico_id: Number(fd.get('tecnico_id')),
        cantidad: Number(fd.get('cantidad')),
      };
      try {
        const { encolado } = await conColaSiHaceFalta('entregar_ferreteria', payload, () => api('/admin/ferreteria/entregar', { method: 'POST', body: payload }));
        ev.target.reset();
        if (encolado) {
          toast('Guardado sin conexión — la entrega se registrará al recuperar señal.', 'neutro');
        } else {
          toast('Entrega registrada.', 'ok');
          await cargarStock();
        }
      } catch (e) {
        toast(e.message, 'malo');
      }
    });

    await cargarStock();
  }

  async function cargarStock() {
    const $tabla = $contenido.querySelector('#tabla-stock');
    try {
      const { stock } = await api('/admin/ferreteria/stock');
      if (!stock.length) {
        $tabla.innerHTML = '<p class="vacio">Todavía no se ha entregado ferretería a nadie.</p>';
        return;
      }
      $tabla.innerHTML = `
        <table class="tabla">
          <thead><tr><th>Técnico</th><th>Ítem</th><th>Cantidad actual</th></tr></thead>
          <tbody>
            ${stock.map((s) => `
              <tr>
                <td>${escapeHtml(s.tecnico_nombre)}</td>
                <td>${escapeHtml(s.item_nombre)}</td>
                <td class="${Number(s.cantidad_actual) < 0 ? 'celda-negativa' : ''}">${s.cantidad_actual} ${escapeHtml(s.unidad_medida)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      $tabla.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  // ---------------------------------------------------------------- Kits --
  async function renderKits() {
    $contenido.innerHTML = `
      <label class="campo campo--inline">
        <span>Tipo de servicio</span>
        <select id="select-tipo-servicio">
          ${tiposServicio.map((t) => `<option value="${t.codigo}">${escapeHtml(t.nombre)}</option>`).join('')}
        </select>
      </label>
      <div id="editor-kit"></div>
    `;
    const $select = $contenido.querySelector('#select-tipo-servicio');
    $select.addEventListener('change', () => cargarKit($select.value));
    await cargarKit($select.value);
  }

  async function cargarKit(codigoServicio) {
    const $editor = $contenido.querySelector('#editor-kit');
    $editor.innerHTML = '<p class="vacio">Cargando…</p>';
    try {
      const { kit } = await api(`/admin/kits/${encodeURIComponent(codigoServicio)}`);
      const filasIniciales = kit.map((k) => ({ item_codigo: k.item_codigo, item_nombre: k.item_nombre, cantidad_estandar: k.cantidad_estandar }));
      renderEditorKit(codigoServicio, filasIniciales);
    } catch (e) {
      $editor.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  function renderEditorKit(codigoServicio, filas) {
    const $editor = $contenido.querySelector('#editor-kit');
    const itemsUsados = new Set(filas.map((f) => f.item_codigo));
    const itemsDisponibles = items.filter((i) => !itemsUsados.has(i.codigo));

    $editor.innerHTML = `
      <p class="panel-explicacion">
        Esto es la plantilla que el wizard precarga en el paso 4 — no afecta a órdenes ya enviadas,
        que guardan su propio consumo congelado.
      </p>
      <table class="tabla tabla--editable">
        <thead><tr><th>Ítem</th><th>Cantidad estándar</th><th></th></tr></thead>
        <tbody>
          ${filas.map((f, i) => `
            <tr data-idx="${i}">
              <td>${escapeHtml(f.item_nombre)}</td>
              <td><input type="number" class="input-cantidad" min="0" step="0.01" value="${f.cantidad_estandar}"></td>
              <td><button type="button" class="btn btn--malo btn--chico btn-quitar">Quitar</button></td>
            </tr>
          `).join('') || '<tr><td colspan="3" class="vacio-celda">Sin ítems en el kit todavía.</td></tr>'}
        </tbody>
      </table>
      ${itemsDisponibles.length ? `
        <form class="form-fila" id="form-agregar-item">
          <select name="item_codigo">${itemsDisponibles.map((i) => `<option value="${i.codigo}">${escapeHtml(i.nombre)}</option>`).join('')}</select>
          <input type="number" name="cantidad" min="0" step="0.01" placeholder="Cantidad" required>
          <button type="submit" class="btn btn--secundario">Agregar al kit</button>
        </form>
      ` : ''}
      <button type="button" class="btn btn--primario" id="btn-guardar-kit">Guardar kit completo</button>
    `;

    $editor.querySelectorAll('.btn-quitar').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        const idx = Number(ev.target.closest('tr').dataset.idx);
        const nuevasFilas = filas.filter((_, i) => i !== idx);
        renderEditorKit(codigoServicio, nuevasFilas);
      });
    });

    $editor.querySelector('#form-agregar-item')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const codigo = fd.get('item_codigo');
      const item = items.find((i) => i.codigo === codigo);
      const nuevasFilas = [...filas, { item_codigo: codigo, item_nombre: item.nombre, cantidad_estandar: Number(fd.get('cantidad')) }];
      renderEditorKit(codigoServicio, nuevasFilas);
    });

    $editor.querySelector('#btn-guardar-kit').addEventListener('click', async () => {
      const filasActualizadas = Array.from($editor.querySelectorAll('tbody tr[data-idx]')).map((tr, i) => ({
        item_codigo: filas[Number(tr.dataset.idx)].item_codigo,
        cantidad_estandar: Number(tr.querySelector('.input-cantidad').value),
      }));
      const payload = { codigo: codigoServicio, items: filasActualizadas };
      try {
        const { encolado } = await conColaSiHaceFalta(
          'actualizar_kit', payload,
          () => api(`/admin/kits/${encodeURIComponent(codigoServicio)}`, { method: 'PUT', body: { items: filasActualizadas } }),
          codigoServicio
        );
        if (encolado) {
          toast('Kit guardado sin conexión — se aplicará al recuperar señal.', 'neutro');
          // Se deja el editor tal como quedó (ya refleja lo que el admin
          // pidió) en vez de recargarlo desde un servidor que no responde.
        } else {
          toast('Kit actualizado.', 'ok');
          await cargarKit(codigoServicio);
        }
      } catch (e) {
        toast(e.message, 'malo');
      }
    });
  }

  await activarTab('equipos');
}
