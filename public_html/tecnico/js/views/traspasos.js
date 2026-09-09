// "Mi bodega" — dos cosas en una pantalla: lo que el admin mandó y
// todavía no confirmaste (arriba, es lo urgente) y lo que ya es tuyo de
// verdad ahora mismo (abajo, solo para consultar). El técnico verifica
// FÍSICAMENTE (serie por serie, cantidad por cantidad) y recién ahí acepta
// — antes de esto, un envío se daba por recibido apenas el admin lo
// mandaba, sin que nadie del otro lado lo comprobara. Si algo no cuadra,
// se rechaza con una nota y vuelve a bodega (o a quien lo tenía antes)
// para que el admin lo corrija.
import { api, ApiError } from '../api.js';
import { el, escapeHtml, formatDateTime } from '../utils.js';
import { irA } from '../router.js';
import { setTopbar } from '../topbar.js';
import { toast } from '../toast.js';
import { abrirModal } from '../modal.js';

export async function renderTraspasos(container) {
  setTopbar({ titulo: 'Mi bodega', atras: () => irA('home') });

  const seccion = el(`
    <section class="home">
      <div id="traspasos-contenido"><p class="vacio">Cargando…</p></div>
      <div class="seccion-titulo" style="margin-top: 22px;"><h3>Mi maleta ahora mismo</h3></div>
      <div id="maleta-contenido"><p class="vacio">Cargando…</p></div>
    </section>
  `);
  container.appendChild(seccion);
  const $contenido = seccion.querySelector('#traspasos-contenido');
  const $maleta = seccion.querySelector('#maleta-contenido');

  await Promise.all([cargar(), cargarMaleta()]);

  async function cargarMaleta() {
    try {
      const { equipos, ferreteria } = await api('/maleta');
      pintarMaleta(equipos, ferreteria);
    } catch (e) {
      $maleta.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  function pintarMaleta(equipos, ferreteria) {
    if (!equipos.length && !ferreteria.length) {
      $maleta.innerHTML = '<p class="vacio">Todavía no tienes nada confirmado en tu maleta.</p>';
      return;
    }
    const decos = equipos.filter((e) => /deco/i.test(e.tipo_equipo_nombre));
    const alertaBajoStock = decos.length < 2 ? `
      <div style="background: #fff7ed; border: 1.5px solid #ea580c; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 1.3rem;">⚠️</span>
        <div style="font-size: 0.84rem; color: #9a3412;">
          <strong>Stock bajo de decodificadores:</strong> Tienes ${decos.length} unidad${decos.length === 1 ? '' : 'es'} en tu maleta. Recuerda solicitar recarga a bodega central si vas a salir a terreno.
        </div>
      </div>
    ` : '';

    $maleta.innerHTML = `
      ${alertaBajoStock}
      ${equipos.length ? `
        <p class="campo-ayuda" style="margin-bottom: 6px;">Equipos (${equipos.length})</p>
        <div class="lista-borradores" style="margin-bottom: 14px;">
          ${equipos.map((e) => `
            <div class="tarjeta-borrador" style="cursor: default; display: flex; justify-content: space-between; align-items: center;">
              <span class="tarjeta-borrador-info">
                <span class="tarjeta-borrador-folio">${escapeHtml(e.tipo_equipo_nombre)}</span><br>
                <span class="tarjeta-borrador-meta celda-mono">${escapeHtml(e.numero_serie)}</span>
              </span>
              <button type="button" class="btn-copiar-dato" data-copiar="${escapeHtml(e.numero_serie)}" title="Copiar serie" style="display: inline-flex; align-items: center; justify-content: center; background: var(--superficie-2, #f1f5f9); border: 1.5px solid var(--borde-fuerte, #cbd5e1); border-radius: 8px; cursor: pointer; padding: 6px 10px; font-size: 0.85rem; color: var(--tinta); flex-shrink: 0;" aria-label="Copiar serie">📋</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${ferreteria.length ? `
        <p class="campo-ayuda" style="margin-bottom: 6px;">Ferretería (${ferreteria.length})</p>
        <div class="lista-borradores">
          ${ferreteria.map((f) => `
            <div class="tarjeta-borrador" style="cursor: default;">
              <span class="tarjeta-borrador-info">
                <span class="tarjeta-borrador-folio">${escapeHtml(f.nombre)}</span>
                <span style="float: right; font-weight: 700;">${f.cantidad_actual} ${escapeHtml(f.unidad_medida)}</span>
              </span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  }

  async function cargar() {
    try {
      const { equipos, ferreteria } = await api('/mis-traspasos');
      pintar(equipos, ferreteria);
    } catch (e) {
      $contenido.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  function pintar(equipos, ferreteria) {
    if (!equipos.length && !ferreteria.length) {
      $contenido.innerHTML = `
        <div class="seccion-titulo"><h3>Traspasos por confirmar</h3></div>
        <p class="vacio">No tienes nada pendiente de confirmar por ahora.</p>
      `;
      return;
    }
    $contenido.innerHTML = `
      <div class="seccion-titulo"><h3>Traspasos por confirmar</h3></div>
      ${equipos.length ? `
        <p class="campo-ayuda" style="margin-bottom: 6px;">Equipos</p>
        <div class="lista-borradores" id="lista-equipos"></div>
      ` : ''}
      ${ferreteria.length ? `
        <p class="campo-ayuda" style="margin: 14px 0 6px;">Ferretería</p>
        <div class="lista-borradores" id="lista-ferreteria"></div>
      ` : ''}
    `;

    const $listaEquipos = $contenido.querySelector('#lista-equipos');
    for (const eq of equipos) {
      const origen = eq.origen_nombre ? `de ${escapeHtml(eq.origen_nombre)}` : 'de bodega central';
      const tarjeta = el(`
        <div class="tarjeta-borrador" style="cursor: default; flex-direction: column; align-items: stretch; gap: 8px;">
          <span class="tarjeta-borrador-info">
            <span class="tarjeta-borrador-folio">${escapeHtml(eq.tipo_equipo_nombre)} — <span class="celda-mono">${escapeHtml(eq.numero_serie)}</span></span><br>
            <span class="tarjeta-borrador-meta">Viene ${origen} · ${formatDateTime(eq.actualizado_en)}</span>
          </span>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn--primario btn-aceptar" style="flex: 1;">✔ Serie correcta, aceptar</button>
            <button type="button" class="btn btn--secundario btn-rechazar" style="flex: 1;">⚠ Reportar problema</button>
          </div>
        </div>
      `);
      tarjeta.querySelector('.btn-aceptar').addEventListener('click', () => aceptarEquipo(eq, tarjeta));
      tarjeta.querySelector('.btn-rechazar').addEventListener('click', () => rechazarEquipo(eq));
      $listaEquipos.appendChild(tarjeta);
    }

    const $listaFerreteria = $contenido.querySelector('#lista-ferreteria');
    for (const fe of ferreteria) {
      const tarjeta = el(`
        <div class="tarjeta-borrador" style="cursor: default; flex-direction: column; align-items: stretch; gap: 8px;">
          <span class="tarjeta-borrador-info">
            <span class="tarjeta-borrador-folio">${escapeHtml(fe.item_nombre)} — ${fe.cantidad} ${escapeHtml(fe.unidad_medida)}</span><br>
            <span class="tarjeta-borrador-meta">${formatDateTime(fe.creado_en)}</span>
          </span>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn--primario btn-aceptar" style="flex: 1;">✔ Cantidad correcta, aceptar</button>
            <button type="button" class="btn btn--secundario btn-rechazar" style="flex: 1;">⚠ Reportar problema</button>
          </div>
        </div>
      `);
      tarjeta.querySelector('.btn-aceptar').addEventListener('click', () => aceptarFerreteria(fe, tarjeta));
      tarjeta.querySelector('.btn-rechazar').addEventListener('click', () => rechazarFerreteria(fe));
      $listaFerreteria.appendChild(tarjeta);
    }
  }

  async function aceptarEquipo(eq, tarjeta) {
    const botones = tarjeta.querySelectorAll('button');
    botones.forEach((b) => (b.disabled = true));
    try {
      await api(`/mis-traspasos/equipos/${eq.id}/aceptar`, { method: 'POST', body: {} });
      toast(`${eq.numero_serie} confirmado — ya está en tu maleta.`, 'ok');
      await Promise.all([cargar(), cargarMaleta()]);
    } catch (e) {
      toast(mensajeError(e), 'malo');
      botones.forEach((b) => (b.disabled = false));
    }
  }

  async function aceptarFerreteria(fe, tarjeta) {
    const botones = tarjeta.querySelectorAll('button');
    botones.forEach((b) => (b.disabled = true));
    try {
      await api(`/mis-traspasos/ferreteria/${fe.id}/aceptar`, { method: 'POST', body: {} });
      toast(`${fe.item_nombre} confirmado — ya suma a tu stock.`, 'ok');
      await Promise.all([cargar(), cargarMaleta()]);
    } catch (e) {
      toast(mensajeError(e), 'malo');
      botones.forEach((b) => (b.disabled = false));
    }
  }

  function rechazarEquipo(eq) {
    abrirDialogoRechazo(`Reportar problema — ${eq.tipo_equipo_nombre} ${eq.numero_serie}`, async (observacion) => {
      await api(`/mis-traspasos/equipos/${eq.id}/rechazar`, { method: 'POST', body: { observacion } });
      toast(`${eq.numero_serie} rechazado — vuelve a quien lo tenía.`, 'alerta');
      await cargar();
    });
  }

  function rechazarFerreteria(fe) {
    abrirDialogoRechazo(`Reportar problema — ${fe.item_nombre}`, async (observacion) => {
      await api(`/mis-traspasos/ferreteria/${fe.id}/rechazar`, { method: 'POST', body: { observacion } });
      toast(`${fe.item_nombre} rechazado.`, 'alerta');
      await cargar();
    });
  }

  function abrirDialogoRechazo(titulo, onConfirmar) {
    const { root, cerrar } = abrirModal(`
      <h3>${escapeHtml(titulo)}</h3>
      <p class="modal-explicacion">Contá qué está mal (serie distinta, no llegó, cantidad incompleta…) — vuelve a bodega para que se corrija.</p>
      <form id="form-rechazo">
        <label class="campo">
          <span>Qué encontraste</span>
          <textarea name="observacion" rows="3" required placeholder="Ej: la serie no coincide con la que me mandaron…" autofocus></textarea>
        </label>
        <div class="motivos-rapidos" id="motivos-rapidos">
          <button type="button" class="chip-motivo" data-texto="La serie no coincide con lo que me mandaron.">Serie no coincide</button>
          <button type="button" class="chip-motivo" data-texto="No llegó nada.">No llegó nada</button>
          <button type="button" class="chip-motivo" data-texto="Llegó incompleto (falta cantidad o algún equipo).">Llegó incompleto</button>
        </div>
        <p class="campo-error" id="rechazo-error" hidden></p>
        <div class="modal-acciones">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--peligro">Rechazar</button>
        </div>
      </form>
    `);
    // Motivos rápidos: escriben el texto en el campo, el técnico lo puede
    // editar o completar después — no cambian la validación (sigue exigiendo
    // observación no vacía), solo evitan escribir lo mismo siempre a mano
    // en el celular.
    const $textarea = root.querySelector('textarea[name="observacion"]');
    root.querySelectorAll('.chip-motivo').forEach((btn) => {
      btn.addEventListener('click', () => {
        $textarea.value = btn.dataset.texto;
        $textarea.focus();
      });
    });
    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-rechazo').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const observacion = new FormData(ev.target).get('observacion');
      const $error = root.querySelector('#rechazo-error');
      const $submit = ev.target.querySelector('button[type="submit"]');
      $error.hidden = true;
      $submit.disabled = true;
      try {
        await onConfirmar(observacion);
        cerrar();
      } catch (e) {
        $error.textContent = mensajeError(e);
        $error.hidden = false;
        $submit.disabled = false;
      }
    });
  }

  function mensajeError(e) {
    return e instanceof ApiError && e.code === 'sin_conexion'
      ? 'Sin conexión ahora mismo — intenta de nuevo cuando tengas señal.'
      : e.message;
  }
}
