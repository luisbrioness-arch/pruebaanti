// Mi billetera — de solo lectura. El técnico ve su saldo, lo que tiene
// pendiente de que Edwin cierre en un período, y su historial de cierres y
// movimientos. Cerrar un período, registrar un pago o un ajuste son
// acciones exclusivas del panel admin (ver docs/liquidacion-billetera.md) —
// acá no hay ningún botón que escriba nada, así que esta vista no necesita
// pasar por la cola de escritura offline: si no hay señal, simplemente no
// hay datos nuevos que mostrar todavía.
import { api } from '../api.js';
import { el, escapeHtml, formatDateTime } from '../utils.js';
import { irA } from '../router.js';
import { setTopbar } from '../topbar.js';

const ETIQUETA_MOVIMIENTO = {
  liquidacion: 'Liquidación',
  pago: 'Pago',
  ajuste: 'Ajuste',
};

function formatMoney(n) {
  return '$' + Math.round(Number(n)).toLocaleString('es-CL');
}

export async function renderBilletera(container) {
  setTopbar({ titulo: 'Mi billetera', atras: () => irA('home') });

  const seccion = el(`
    <section class="home">
      <div id="billetera-contenido"><p class="vacio">Cargando…</p></div>
    </section>
  `);
  container.appendChild(seccion);

  const $contenido = seccion.querySelector('#billetera-contenido');
  try {
    const datos = await api('/mi-billetera');
    pintar($contenido, datos);
  } catch (e) {
    $contenido.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
  }
}

function pintar($contenido, { saldo, movimientos, periodos, pendiente }) {
  $contenido.innerHTML = `
    <div class="saldo-tecnico">
      <span class="saldo-tecnico-etiqueta">Saldo actual</span>
      <span class="saldo-tecnico-monto ${saldo < 0 ? 'valor-negativo' : ''}">${formatMoney(saldo)}</span>
    </div>

    ${pendiente.monto_total > 0 ? `
      <div class="seccion-titulo" style="margin-top: 18px;"><h3>Pendiente por liquidar</h3></div>
      <p class="campo-ayuda">
        ${pendiente.ordenes.length} orden(es) aprobada(s) y ${pendiente.ventas.length} venta(s) instalada(s),
        por ${formatMoney(pendiente.monto_total)} en total. Esto se acredita a tu billetera cuando Edwin
        cierre el próximo período.
      </p>
    ` : ''}

    <div class="seccion-titulo" style="margin-top: 18px;"><h3>Historial de cierres</h3></div>
    <div class="lista-borradores">
      ${periodos.length ? periodos.map((p) => `
        <div class="tarjeta-borrador" style="cursor: default;">
          <span class="tarjeta-borrador-info">
            <span class="tarjeta-borrador-folio">${formatMoney(p.monto_total)}</span><br>
            <span class="tarjeta-borrador-meta">${formatDateTime(p.fecha_desde)} — ${formatDateTime(p.fecha_hasta)} · cerrado por ${escapeHtml(p.cerrado_por_nombre)}</span>
          </span>
        </div>
      `).join('') : '<p class="vacio">Todavía no se te ha cerrado ningún período.</p>'}
    </div>

    <div class="seccion-titulo" style="margin-top: 18px;"><h3>Movimientos</h3></div>
    <div class="lista-borradores">
      ${movimientos.length ? movimientos.map((m) => `
        <div class="tarjeta-borrador" style="cursor: default;">
          <span class="tarjeta-borrador-info">
            <span class="tarjeta-borrador-folio">${escapeHtml(ETIQUETA_MOVIMIENTO[m.tipo_movimiento] || m.tipo_movimiento)}</span>
            <span class="valor-monto ${Number(m.monto) < 0 ? 'valor-negativo' : ''}" style="float: right; font-weight: 700;">${formatMoney(m.monto)}</span><br>
            <span class="tarjeta-borrador-meta">${formatDateTime(m.creado_en)}${m.observacion ? ' · ' + escapeHtml(m.observacion) : ''}</span>
          </span>
        </div>
      `).join('') : '<p class="vacio">Todavía no tienes ningún movimiento.</p>'}
    </div>
  `;
}
