// Botón "🐞" del topbar — reportar un bug o pedir un cambio desde donde sea
// que esté el técnico. A diferencia del resto de la app, esto NO pasa por
// la cola de offline.js: esa cola está pensada para acciones ligadas a una
// orden (necesita un uuid); un reporte es independiente de cualquier orden.
// Sin señal, se avisa que se intente de nuevo más tarde — mismo criterio ya
// documentado para "retirar" un equipo (ver docs/tecnico-app.md).
import { api, ApiError } from './api.js';
import { abrirModal } from './modal.js';
import { toast } from './toast.js';

export function abrirModalReportar() {
  const { root, cerrar } = abrirModal(`
    <h3>Reportar un problema</h3>
    <p class="modal-explicacion">Un bug, algo que no se ve bien, o algo que te gustaría que funcionara distinto.</p>
    <form id="form-reportar">
      <label class="campo">
        <span>Tipo</span>
        <select name="tipo">
          <option value="bug">Bug — algo no funciona</option>
          <option value="cambio">Cambio — me gustaría que fuera distinto</option>
        </select>
      </label>
      <label class="campo">
        <span>Descripción</span>
        <textarea name="descripcion" rows="4" required placeholder="Qué pasó, en qué pantalla…" autofocus></textarea>
      </label>
      <p class="campo-error" id="reportar-error" hidden></p>
      <div class="modal-acciones">
        <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
        <button type="submit" class="btn btn--primario">Enviar</button>
      </div>
    </form>
  `);

  root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
  root.querySelector('#form-reportar').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const $error = root.querySelector('#reportar-error');
    $error.hidden = true;
    const $submit = ev.target.querySelector('button[type="submit"]');
    $submit.disabled = true;
    try {
      await api('/reportes', {
        method: 'POST',
        body: { tipo: fd.get('tipo'), descripcion: fd.get('descripcion'), pantalla: location.hash || '#home' },
      });
      cerrar();
      toast('Reporte enviado — gracias.', 'ok');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'sin_conexion') {
        $error.textContent = 'Sin conexión ahora mismo — intenta de nuevo cuando tengas señal.';
      } else {
        $error.textContent = e.message;
      }
      $error.hidden = false;
      $submit.disabled = false;
    }
  });
}
