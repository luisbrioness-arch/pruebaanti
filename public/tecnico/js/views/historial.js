// Historial propio — órdenes ya enviadas al servidor (a diferencia de
// Inicio, que solo lista los borradores todavía en curso en ESTE celular).
import { api } from '../api.js';
import { el, escapeHtml, formatDateTime, iconoTipoServicio } from '../utils.js';
import { irA } from '../router.js';
import { setTopbar } from '../topbar.js';

const ESTADO_LABEL = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  observada: 'Observada',
  aprobada: 'Aprobada',
  rechazada_corregible: 'Rechazada (corregible)',
  rechazada_penalizada: 'Rechazada (sin pago)',
  conflicto: 'En conflicto',
  liquidada: 'Liquidada',
};

const ESTADO_TONO = {
  enviada: 'pendiente',
  observada: 'pendiente',
  aprobada: 'ok',
  rechazada_corregible: 'alerta',
  rechazada_penalizada: 'malo',
  conflicto: 'malo',
  liquidada: 'ok',
};

export async function renderHistorial(container) {
  setTopbar({ titulo: 'Mis órdenes', atras: () => irA('home') });

  const seccion = el(`
    <section class="home">
      <div id="historial-lista"><p class="vacio">Cargando…</p></div>
    </section>
  `);
  container.appendChild(seccion);

  const $lista = seccion.querySelector('#historial-lista');
  try {
    const { ordenes } = await api('/mis-ordenes');
    pintar($lista, ordenes);
  } catch (e) {
    $lista.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
  }
}

function pintar(contenedor, ordenes) {
  if (!ordenes.length) {
    contenedor.innerHTML = '<p class="vacio">Todavía no has enviado ninguna orden.</p>';
    return;
  }
  contenedor.innerHTML = '';
  for (const o of ordenes) {
    const tono = ESTADO_TONO[o.estado] || 'neutro';
    const etiqueta = ESTADO_LABEL[o.estado] || o.estado;
    const tarjeta = el(`
      <button type="button" class="tarjeta-borrador">
        <span class="icono-tipo">${iconoTipoServicio(o.tipo_servicio_codigo)}</span>
        <span class="tarjeta-borrador-info">
          <span class="tarjeta-borrador-folio">${escapeHtml(o.folio)}</span>
          <span class="pill pill--${tono === 'malo' ? 'alerta' : tono === 'pendiente' ? 'manual' : 'ok'}" style="margin-left: 8px;">${escapeHtml(etiqueta)}</span><br>
          <span class="tarjeta-borrador-meta">${escapeHtml(o.tipo_servicio_nombre)} · ${formatDateTime(o.creado_en)}${o.monto_tecnico ? ' · $' + Number(o.monto_tecnico).toLocaleString('es-CL') : ''}</span>
        </span>
        <span class="chevron">›</span>
      </button>
    `);
    tarjeta.addEventListener('click', () => irA('wizard', { uuid: o.uuid_dispositivo, paso: 5 }));
    contenedor.appendChild(tarjeta);
  }
}
