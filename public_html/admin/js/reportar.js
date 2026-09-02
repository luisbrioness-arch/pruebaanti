// Botón "Reportar" del topbar — cualquier vista puede estar abierta cuando
// Edwin encuentra un bug o quiere pedir un cambio; esto no depende de en
// qué pantalla esté. Captura el hash actual (qué vista estaba viendo) como
// contexto automático — no le pedimos al usuario que lo escriba.
import { api } from './api.js';
import { abrirModal } from './modal.js';
import { toast } from './toast.js';
import { conColaSiHaceFalta } from './offline.js';

export function abrirModalReportar() {
  const { root, cerrar } = abrirModal(`
    <h3>Reportar un problema</h3>
    <p class="modal-explicacion">Cuéntanos qué encontraste — un bug, algo que no se ve bien, o algo que te gustaría que funcionara distinto.</p>
    <form id="form-reportar">
      <label class="campo">
        <span>Tipo</span>
        <select name="tipo">
          <option value="bug">Bug — algo no funciona como debería</option>
          <option value="cambio">Cambio — me gustaría que fuera distinto</option>
        </select>
      </label>
      <label class="campo">
        <span>Descripción</span>
        <textarea name="descripcion" rows="4" required placeholder="Qué pasó, en qué pantalla, qué esperabas que pasara…" autofocus></textarea>
      </label>
      <p class="campo-error" id="reportar-error" hidden></p>
      <div class="modal-acciones">
        <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
        <button type="submit" class="btn btn--primario">Enviar reporte</button>
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
    const payload = {
      tipo: fd.get('tipo'),
      descripcion: fd.get('descripcion'),
      pantalla: location.hash || '#auditoria',
    };
    try {
      const { encolado } = await conColaSiHaceFalta(
        'reportar', payload,
        () => api('/reportes', { method: 'POST', body: payload })
      );
      cerrar();
      toast(encolado ? 'Reporte guardado sin conexión — se enviará al recuperar señal.' : 'Reporte enviado — gracias.', encolado ? 'neutro' : 'ok');
    } catch (e) {
      $error.textContent = e.message;
      $error.hidden = false;
      $submit.disabled = false;
    }
  });
}
