import { api } from '../api.js';
import { abrirModal } from '../modal.js';
import { toast } from '../toast.js';
import { conColaSiHaceFalta } from '../offline.js';
import {
  badge, anomaliaChip, formatMoney, formatDateTime, escapeHtml, el, enCampoDeTexto,
} from '../utils.js';

const MOTIVOS_RECHAZO = [
  ['mala_instalacion', 'Mala instalación'],
  ['foto_ilegible', 'Foto ilegible'],
  ['serie_incorrecta', 'Serie incorrecta'],
  ['datos_incompletos', 'Datos incompletos'],
  ['no_corresponde', 'No corresponde'],
];

export async function renderAuditoria(container) {
  const estado = { estadoFiltro: 'enviada', ordenes: [], seleccionadoId: null, detalle: null, marcadas: new Set() };

  container.appendChild(el(`
    <section class="auditoria">
      <div class="aud-toolbar">
        <label class="campo campo--inline">
          <span>Estado</span>
          <select id="filtro-estado">
            <option value="enviada">Pendientes de auditar</option>
            <option value="observada">Observadas</option>
            <option value="aprobada">Aprobadas</option>
            <option value="rechazada_corregible">Rechazadas (corregibles)</option>
            <option value="rechazada_penalizada">Rechazadas (sin pago)</option>
            <option value="conflicto">En conflicto</option>
          </select>
        </label>
        <button id="btn-aprobar-masivo" class="btn btn--secundario" disabled>Aprobar seleccionadas (0)</button>
        <span class="aud-toolbar-hint">Atajos: <kbd>A</kbd> aprobar · <kbd>R</kbd> rechazar · <kbd>O</kbd> observar · <kbd>↑</kbd><kbd>↓</kbd> navegar</span>
      </div>
      <div class="aud-columns">
        <div class="aud-col aud-col--lista" id="col-lista"><p class="vacio">Cargando…</p></div>
        <div class="aud-col aud-col--detalle" id="col-detalle"><p class="vacio">Selecciona una orden de la lista.</p></div>
        <div class="aud-col aud-col--acciones" id="col-acciones"></div>
      </div>
    </section>
  `));

  const $lista = container.querySelector('#col-lista');
  const $detalle = container.querySelector('#col-detalle');
  const $acciones = container.querySelector('#col-acciones');
  const $filtroEstado = container.querySelector('#filtro-estado');
  const $btnMasivo = container.querySelector('#btn-aprobar-masivo');

  $filtroEstado.value = estado.estadoFiltro;
  $filtroEstado.addEventListener('change', () => {
    estado.estadoFiltro = $filtroEstado.value;
    estado.marcadas.clear();
    cargarLista();
  });

  $btnMasivo.addEventListener('click', aprobarMasivo);

  async function cargarLista() {
    $lista.innerHTML = '<p class="vacio">Cargando…</p>';
    try {
      const { ordenes } = await api(`/admin/ordenes?estado=${encodeURIComponent(estado.estadoFiltro)}`);
      estado.ordenes = ordenes;
      renderLista();
      if (ordenes.length && !ordenes.some((o) => o.id === estado.seleccionadoId)) {
        seleccionar(ordenes[0].id);
      } else if (!ordenes.length) {
        estado.seleccionadoId = null;
        estado.detalle = null;
        renderDetalle();
        renderAcciones();
      }
    } catch (e) {
      $lista.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  function renderLista() {
    if (!estado.ordenes.length) {
      $lista.innerHTML = '<p class="vacio">No hay órdenes en este estado.</p>';
      actualizarBotonMasivo();
      return;
    }
    const grupos = new Map();
    for (const o of estado.ordenes) {
      const clave = o.tecnico_nombre || `Técnico #${o.tecnico_id}`;
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(o);
    }

    $lista.innerHTML = '';
    for (const [tecnico, ordenes] of grupos) {
      $lista.appendChild(el(`<h3 class="aud-grupo">${escapeHtml(tecnico)} <span>(${ordenes.length})</span></h3>`));
      for (const o of ordenes) {
        const fila = el(`
          <button type="button" class="aud-fila ${o.id === estado.seleccionadoId ? 'aud-fila--activa' : ''}" data-id="${o.id}">
            <input type="checkbox" class="aud-check" data-id="${o.id}" ${estado.marcadas.has(o.id) ? 'checked' : ''}>
            <span class="aud-fila-folio">${escapeHtml(o.folio)}</span>
            <span class="aud-fila-tipo">${escapeHtml(o.tipo_servicio_nombre)}</span>
            <span class="aud-fila-monto">${formatMoney(o.monto_tecnico)}</span>
            ${(o.anomalias || []).length ? '<span class="aud-fila-anomalia" title="Tiene anomalías">⚠</span>' : ''}
          </button>
        `);
        fila.querySelector('.aud-check').addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (ev.target.checked) estado.marcadas.add(o.id); else estado.marcadas.delete(o.id);
          actualizarBotonMasivo();
        });
        fila.addEventListener('click', () => seleccionar(o.id));
        $lista.appendChild(fila);
      }
    }
    actualizarBotonMasivo();
  }

  function actualizarBotonMasivo() {
    $btnMasivo.textContent = `Aprobar seleccionadas (${estado.marcadas.size})`;
    $btnMasivo.disabled = estado.marcadas.size === 0;
  }

  async function seleccionar(id) {
    estado.seleccionadoId = id;
    renderLista();
    $detalle.innerHTML = '<p class="vacio">Cargando…</p>';
    $acciones.innerHTML = '';
    try {
      estado.detalle = await api(`/admin/ordenes/${id}`);
      renderDetalle();
      renderAcciones();
    } catch (e) {
      $detalle.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  function renderDetalle() {
    const o = estado.detalle;
    if (!o) { $detalle.innerHTML = '<p class="vacio">Selecciona una orden de la lista.</p>'; return; }

    const fotos = (o.fotos || []).map((f, i) => `
      <button type="button" class="aud-foto" data-idx="${i}" title="${escapeHtml(f.tipo)}">
        <img src="/api/fotos/${f.id}" alt="${escapeHtml(f.tipo)}" loading="lazy">
        <span>${escapeHtml(f.tipo)}</span>
      </button>
    `).join('') || '<p class="vacio vacio--chico">Sin fotos.</p>';

    const materiales = (o.materiales || []).map((m) => `
      <tr>
        <td>${escapeHtml(m.numero_serie)}</td>
        <td>${escapeHtml(m.accion)}</td>
        <td>${Number(m.ingresado_manual) === 1 ? '<span class="chip chip--alerta">a mano</span>' : 'escaneado'}</td>
      </tr>
    `).join('') || '<tr><td colspan="3" class="vacio-celda">Sin materiales.</td></tr>';

    const ferreteria = (o.ferreteria || []).map((f) => `
      <tr><td>${escapeHtml(f.item_nombre)}</td><td>${f.cantidad_final} ${escapeHtml(f.unidad_medida)}</td>
      <td>${Number(f.ajustado_manualmente) === 1 ? 'ajustado' : 'estándar'}</td></tr>
    `).join('') || '<tr><td colspan="3" class="vacio-celda">Sin ferretería registrada.</td></tr>';

    const anomalias = (o.anomalias || []).map(anomaliaChip).join(' ');

    $detalle.innerHTML = `
      <div class="aud-detalle-cabecera">
        <h2>Folio ${escapeHtml(o.folio)}</h2>
        ${badge(o.estado)}
      </div>
      <p class="aud-meta">${escapeHtml(o.tecnico_nombre || '')} · ${escapeHtml(o.tipo_servicio_nombre || '')} · ${formatDateTime(o.fecha_trabajo_dispositivo)}</p>
      ${anomalias ? `<div class="aud-anomalias">${anomalias}</div>` : ''}

      <h4>Evidencia fotográfica</h4>
      <div class="aud-fotos">${fotos}</div>

      <h4>Materiales</h4>
      <table class="tabla"><thead><tr><th>Serie</th><th>Acción</th><th>Origen</th></tr></thead><tbody>${materiales}</tbody></table>

      <h4>Ferretería</h4>
      <table class="tabla"><thead><tr><th>Ítem</th><th>Cantidad</th><th>Origen</th></tr></thead><tbody>${ferreteria}</tbody></table>

      <h4>Cierre técnico</h4>
      <dl class="aud-dl">
        <dt>Señal</dt><dd>${o.senal_porcentaje ?? '—'}%</dd>
        <dt>Calidad</dt><dd>${o.calidad_porcentaje ?? '—'}%</dd>
        <dt>Satélite</dt><dd>${escapeHtml(o.satelite || '—')}</dd>
        <dt>Cable</dt><dd>${o.metros_cable ?? '—'} m</dd>
        <dt>Observaciones</dt><dd>${escapeHtml(o.observaciones || '—')}</dd>
        <dt>Monto</dt><dd>${formatMoney(o.monto_bruto)} bruto · ${formatMoney(o.monto_tecnico)} al técnico (${o.porcentaje_aplicado ?? '—'}%)</dd>
        ${o.comentario_auditoria ? `<dt>Auditoría previa</dt><dd>${escapeHtml(o.comentario_auditoria)}</dd>` : ''}
      </dl>
    `;

    const fotosNodos = Array.from($detalle.querySelectorAll('.aud-foto'));
    fotosNodos.forEach((btn) => btn.addEventListener('click', () => abrirLightbox(o.fotos, Number(btn.dataset.idx))));
  }

  function renderAcciones() {
    const o = estado.detalle;
    if (!o) { $acciones.innerHTML = ''; return; }
    const auditable = o.estado === 'enviada' || o.estado === 'observada';
    const reabribible = o.estado === 'rechazada_corregible';

    $acciones.innerHTML = `
      ${auditable ? `
        <button type="button" class="btn btn--ok btn--ancho" id="btn-aprobar">✓ Aprobar <kbd>A</kbd></button>
        <button type="button" class="btn btn--malo btn--ancho" id="btn-rechazar">✕ Rechazar <kbd>R</kbd></button>
        <button type="button" class="btn btn--secundario btn--ancho" id="btn-observar">⏸ Observar <kbd>O</kbd></button>
      ` : ''}
      ${reabribible ? `<button type="button" class="btn btn--secundario btn--ancho" id="btn-reabrir">↺ Reabrir para corrección</button>` : ''}
      ${!auditable && !reabribible ? '<p class="vacio vacio--chico">Esta orden ya no admite acciones de auditoría.</p>' : ''}
    `;

    $acciones.querySelector('#btn-aprobar')?.addEventListener('click', aprobar);
    $acciones.querySelector('#btn-rechazar')?.addEventListener('click', abrirModalRechazo);
    $acciones.querySelector('#btn-observar')?.addEventListener('click', abrirModalObservar);
    $acciones.querySelector('#btn-reabrir')?.addEventListener('click', reabrir);
  }

  async function avanzarSiguiente() {
    const idx = estado.ordenes.findIndex((o) => o.id === estado.seleccionadoId);
    await cargarLista();
    const restante = estado.ordenes[idx] || estado.ordenes[idx - 1] || estado.ordenes[0];
    if (restante) seleccionar(restante.id); else { estado.seleccionadoId = null; renderDetalle(); renderAcciones(); }
  }

  /**
   * Sin conexión no hay forma de refrescar la lista de verdad — en vez de
   * eso, se sacan las órdenes ya resueltas de la vista actual (mismo
   * criterio de selección que avanzarSiguiente, pero sin red) para que el
   * admin pueda seguir auditando el resto sin esperar a que vuelva la señal.
   */
  function quitarDeListaLocal(ids) {
    const listaIds = Array.isArray(ids) ? ids : [ids];
    const idx = estado.ordenes.findIndex((o) => o.id === estado.seleccionadoId);
    estado.ordenes = estado.ordenes.filter((o) => !listaIds.includes(o.id));
    listaIds.forEach((id) => estado.marcadas.delete(id));
    renderLista();
    if (!listaIds.includes(estado.seleccionadoId)) return; // la seleccionada no era ninguna de las que se sacaron
    const restante = estado.ordenes[idx] || estado.ordenes[idx - 1] || estado.ordenes[0];
    if (restante) seleccionar(restante.id); else { estado.seleccionadoId = null; estado.detalle = null; renderDetalle(); renderAcciones(); }
  }

  async function aprobar() {
    if (!estado.detalle) return;
    const { id, folio } = estado.detalle;
    try {
      const { encolado } = await conColaSiHaceFalta('aprobar', { id }, () => api(`/admin/ordenes/${id}/aprobar`, { method: 'POST' }));
      if (encolado) {
        toast(`Folio ${escapeHtml(folio)} guardado sin conexión — se aprobará al recuperar señal.`, 'neutro');
        quitarDeListaLocal(id);
      } else {
        toast(`Folio ${escapeHtml(folio)} aprobado.`, 'ok');
        await avanzarSiguiente();
      }
    } catch (e) {
      toast(e.message, 'malo');
    }
  }

  function abrirModalRechazo() {
    if (!estado.detalle) return;
    const opciones = MOTIVOS_RECHAZO.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    const { root, cerrar } = abrirModal(`
      <h3>Rechazar folio ${escapeHtml(estado.detalle.folio)}</h3>
      <form id="form-rechazo">
        <label class="campo">
          <span>Motivo</span>
          <select name="motivo" required>${opciones}</select>
        </label>
        <label class="campo">
          <span>Comentario para el técnico</span>
          <textarea name="comentario" rows="3" placeholder="Explica qué hay que corregir…"></textarea>
        </label>
        <label class="campo campo--switch">
          <input type="checkbox" name="descuenta_pago">
          <span>¿Descuenta pago? (si no, el técnico puede corregir y reenviar)</span>
        </label>
        <div class="modal-acciones">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--malo">Rechazar</button>
        </div>
      </form>
    `);
    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-rechazo').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const { id, folio } = estado.detalle;
      const payload = {
        id,
        motivo: fd.get('motivo'),
        comentario: fd.get('comentario') || null,
        descuenta_pago: fd.get('descuenta_pago') === 'on',
      };
      try {
        const { encolado } = await conColaSiHaceFalta('rechazar', payload, () => api(`/admin/ordenes/${id}/rechazar`, { method: 'POST', body: payload }));
        cerrar();
        if (encolado) {
          toast(`Folio ${escapeHtml(folio)} guardado sin conexión — se rechazará al recuperar señal.`, 'neutro');
          quitarDeListaLocal(id);
        } else {
          toast(`Folio ${escapeHtml(folio)} rechazado.`, 'alerta');
          await avanzarSiguiente();
        }
      } catch (e) {
        toast(e.message, 'malo');
      }
    });
  }

  function abrirModalObservar() {
    if (!estado.detalle) return;
    const { root, cerrar } = abrirModal(`
      <h3>Observar folio ${escapeHtml(estado.detalle.folio)}</h3>
      <form id="form-observar">
        <label class="campo">
          <span>¿Qué falta revisar antes de decidir?</span>
          <textarea name="comentario" rows="3" required autofocus></textarea>
        </label>
        <div class="modal-acciones">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--primario">Guardar observación</button>
        </div>
      </form>
    `);
    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-observar').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const comentario = new FormData(ev.target).get('comentario');
      const { id } = estado.detalle;
      const payload = { id, comentario };
      try {
        const { encolado } = await conColaSiHaceFalta('observar', payload, () => api(`/admin/ordenes/${id}/observar`, { method: 'POST', body: payload }));
        cerrar();
        if (encolado) {
          toast('Guardado sin conexión — la observación se enviará al recuperar señal.', 'neutro');
          quitarDeListaLocal(id);
        } else {
          toast('Observación guardada.', 'neutro');
          await avanzarSiguiente();
        }
      } catch (e) {
        toast(e.message, 'malo');
      }
    });
  }

  async function reabrir() {
    if (!estado.detalle) return;
    const { id, folio } = estado.detalle;
    try {
      const { encolado } = await conColaSiHaceFalta('reabrir', { id }, () => api(`/admin/ordenes/${id}/reabrir`, { method: 'POST' }));
      if (encolado) {
        toast(`Folio ${escapeHtml(folio)} guardado sin conexión — se reabrirá al recuperar señal.`, 'neutro');
        quitarDeListaLocal(id);
      } else {
        toast(`Folio ${escapeHtml(folio)} reabierto — el técnico ya puede corregirlo.`, 'ok');
        await avanzarSiguiente();
      }
    } catch (e) {
      toast(e.message, 'malo');
    }
  }

  async function aprobarMasivo() {
    const ids = Array.from(estado.marcadas);
    if (!ids.length) return;
    try {
      const { datos, encolado } = await conColaSiHaceFalta('aprobar_masivo', { ids }, () => api('/admin/ordenes/aprobar-masivo', { method: 'POST', body: { ids } }));
      if (encolado) {
        toast(`${ids.length} aprobaciones guardadas sin conexión — se enviarán al recuperar señal.`, 'neutro');
        estado.marcadas.clear();
        quitarDeListaLocal(ids);
      } else {
        const { resultados } = datos;
        const ok = resultados.filter((r) => r.ok).length;
        const fallidas = resultados.filter((r) => !r.ok);
        if (fallidas.length) {
          toast(`${ok} aprobadas · ${fallidas.length} no se pudieron aprobar (revisa anomalías).`, 'alerta', 6000);
        } else {
          toast(`${ok} órdenes aprobadas.`, 'ok');
        }
        estado.marcadas.clear();
        await cargarLista();
      }
    } catch (e) {
      toast(e.message, 'malo');
    }
  }

  // --- Lightbox de fotos ---------------------------------------------------
  let lightboxFotos = [];
  let lightboxIdx = 0;
  function abrirLightbox(fotos, idx) {
    lightboxFotos = fotos;
    lightboxIdx = idx;
    renderLightbox();
  }
  function renderLightbox() {
    const f = lightboxFotos[lightboxIdx];
    if (!f) return;
    const { root, cerrar } = abrirModal(`
      <div class="lightbox">
        <img src="/api/fotos/${f.id}" alt="${escapeHtml(f.tipo)}">
        <p class="lightbox-caption">${escapeHtml(f.tipo)} · ${(f.tamano_bytes / 1000).toFixed(0)}KB
          ${f.latitud ? ` · <a href="https://maps.google.com/?q=${f.latitud},${f.longitud}" target="_blank" rel="noopener">ver ubicación</a>` : ''}
        </p>
        <div class="lightbox-nav">
          <button type="button" id="lb-prev" ${lightboxIdx === 0 ? 'disabled' : ''}>‹ Anterior</button>
          <button type="button" id="lb-cerrar">Cerrar</button>
          <button type="button" id="lb-next" ${lightboxIdx === lightboxFotos.length - 1 ? 'disabled' : ''}>Siguiente ›</button>
        </div>
      </div>
    `);
    root.querySelector('#lb-cerrar').addEventListener('click', cerrar);
    root.querySelector('#lb-prev')?.addEventListener('click', () => { lightboxIdx--; renderLightbox(); });
    root.querySelector('#lb-next')?.addEventListener('click', () => { lightboxIdx++; renderLightbox(); });
  }

  // --- Atajos de teclado -----------------------------------------------
  function alPresionarTecla(ev) {
    if (enCampoDeTexto(document.activeElement)) return;
    if (!document.getElementById('modal-overlay').hidden) return; // un modal ya maneja su propio Escape

    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const idx = estado.ordenes.findIndex((o) => o.id === estado.seleccionadoId);
      const siguiente = ev.key === 'ArrowDown' ? idx + 1 : idx - 1;
      if (estado.ordenes[siguiente]) seleccionar(estado.ordenes[siguiente].id);
    } else if (ev.key.toLowerCase() === 'a') {
      $acciones.querySelector('#btn-aprobar')?.click();
    } else if (ev.key.toLowerCase() === 'r') {
      $acciones.querySelector('#btn-rechazar')?.click();
    } else if (ev.key.toLowerCase() === 'o') {
      $acciones.querySelector('#btn-observar')?.click();
    }
  }
  document.addEventListener('keydown', alPresionarTecla);

  await cargarLista();

  // Limpieza al salir de la vista (evita atajos fantasma en otras pantallas).
  return () => document.removeEventListener('keydown', alPresionarTecla);
}
