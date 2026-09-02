import { api } from '../api.js';
import { toast } from '../toast.js';
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
    </section>
  `));

  const $tarifas = container.querySelector('#tabla-tarifas');
  const $comisiones = container.querySelector('#tabla-comisiones');

  async function cargar() {
    try {
      const [{ tarifas }, { comisiones }] = await Promise.all([
        api('/admin/tarifas'),
        api('/admin/comisiones'),
      ]);
      renderTabla($tarifas, tarifas, {
        codigoCampo: 'tipo_servicio_codigo',
        nombreCampo: 'tipo_servicio_nombre',
        endpoint: (codigo) => `/admin/tarifas/${encodeURIComponent(codigo)}`,
        tipoAccion: 'editar_tarifa',
      });
      renderTabla($comisiones, comisiones, {
        codigoCampo: 'plan_codigo',
        nombreCampo: 'plan_nombre',
        endpoint: (codigo) => `/admin/comisiones/${encodeURIComponent(codigo)}`,
        tipoAccion: 'editar_comision',
      });
    } catch (e) {
      $tarifas.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  function renderTabla($contenedor, filas, cfg) {
    if (!filas.length) {
      $contenedor.innerHTML = '<p class="vacio">Nada configurado todavía.</p>';
      return;
    }
    $contenedor.innerHTML = `
      <table class="tabla tabla--editable">
        <thead><tr><th>Nombre</th><th>Monto vigente</th><th>Desde</th><th>Editar</th></tr></thead>
        <tbody></tbody>
      </table>
    `;
    const $tbody = $contenedor.querySelector('tbody');
    for (const fila of filas) {
      const codigo = fila[cfg.codigoCampo];
      const tr = el(`
        <tr>
          <td>${escapeHtml(fila[cfg.nombreCampo])}</td>
          <td class="celda-monto">${formatMoney(fila.monto)}</td>
          <td class="celda-desde">${formatDateTime(fila.vigente_desde)}</td>
          <td>
            <form class="form-inline">
              <input type="number" name="monto" min="1" step="1" placeholder="Nuevo monto" required>
              <button type="submit" class="btn btn--secundario btn--chico">Guardar</button>
            </form>
          </td>
        </tr>
      `);
      tr.querySelector('form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const monto = Number(new FormData(ev.target).get('monto'));
        if (!monto || monto <= 0) return;
        const boton = ev.target.querySelector('button');
        boton.disabled = true;
        const payload = { codigo, monto };
        try {
          const { encolado } = await conColaSiHaceFalta(
            cfg.tipoAccion, payload,
            () => api(cfg.endpoint(codigo), { method: 'PUT', body: { monto } }),
            codigo
          );
          if (encolado) {
            // No hay forma de refrescar de verdad sin conexión — se pinta el
            // cambio directo sobre la fila (el servidor tiene la última
            // palabra cuando la cola lo mande de verdad).
            tr.querySelector('.celda-monto').textContent = `${formatMoney(monto)} (sin conexión)`;
            tr.querySelector('.celda-desde').textContent = 'pendiente de confirmar';
            toast(`${fila[cfg.nombreCampo]}: guardado sin conexión — se aplicará al recuperar señal.`, 'neutro');
            boton.disabled = false;
          } else {
            toast(`${fila[cfg.nombreCampo]} actualizado a ${formatMoney(monto)}.`, 'ok');
            await cargar();
          }
        } catch (e) {
          toast(e.message, 'malo');
          boton.disabled = false;
        }
      });
      $tbody.appendChild(tr);
    }
  }

  await cargar();
}
