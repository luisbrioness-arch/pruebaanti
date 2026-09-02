// Equipos y ferretería que el admin mandó y todavía no confirmaste. El
// técnico verifica FÍSICAMENTE (serie por serie, cantidad por cantidad) y
// recién ahí acepta — antes de esto, un envío se daba por recibido apenas
// el admin lo mandaba, sin que nadie del otro lado lo comprobara. Si algo
// no cuadra, se rechaza con una nota y vuelve a bodega (o a quien lo tenía
// antes) para que el admin lo corrija.
import { api, ApiError } from '../api.js';
import { el, escapeHtml, formatDateTime } from '../utils.js';
import { irA } from '../router.js';
import { setTopbar } from '../topbar.js';
import { toast } from '../toast.js';
import { abrirModal } from '../modal.js';

export async function renderTraspasos(container) {
  setTopbar({ titulo: 'Traspasos por confirmar', atras: () => irA('home') });

  const seccion = el(`
    <section class="home">
      <div id="traspasos-contenido"><p class="vacio">Cargando…</p></div>
    </section>
  `);
  container.appendChild(seccion);
  const $contenido = seccion.querySelector('#traspasos-contenido');

  await cargar();

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
      $contenido.innerHTML = '<p class="vacio">No tienes nada pendiente de confirmar por ahora.</p>';
      return;
    }
    $contenido.innerHTML = `
      ${equipos.length ? `
        <div class="seccion-titulo"><h3>Equipos</h3></div>
        <div class="lista-borradores" id="lista-equipos"></div>
      ` : ''}
      ${ferreteria.length ? `
        <div class="seccion-titulo" style="margin-top: 18px;"><h3>Ferretería</h3></div>
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
      await cargar();
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
      await cargar();
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
        <p class="campo-error" id="rechazo-error" hidden></p>
        <div class="modal-acciones">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--peligro">Rechazar</button>
        </div>
      </form>
    `);
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
