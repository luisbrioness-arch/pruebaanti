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
import { getUsuarioActual } from '../session.js';

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
  const usuario = getUsuarioActual();
  $contenido.innerHTML = `
    <div class="billetera-tarjeta">
      <div class="billetera-tarjeta-top">
        <span class="billetera-tarjeta-chip">CUENTA TÉCNICO</span>
        <span class="billetera-tarjeta-logo">DTH TERRENO</span>
      </div>
      <div class="billetera-tarjeta-saldo">
        <span class="billetera-tarjeta-label">Saldo Disponible</span>
        <span class="billetera-tarjeta-monto ${saldo < 0 ? 'valor-negativo' : ''}">${formatMoney(saldo)}</span>
      </div>
      <div class="billetera-tarjeta-sub">
        Titular: <strong>${escapeHtml(usuario?.nombre || 'Técnico')}</strong>
      </div>
    </div>

    ${(pendiente && pendiente.monto_total > 0) ? `
      <div class="tarjeta-resumen-pendiente" style="margin-top: 14px;">
        <span class="icono">⏳</span>
        <div>
          <strong>Por acreditar: ${formatMoney(pendiente.monto_total)}</strong>
          <p>
            ${pendiente.ordenes.length} orden(es) aprobada(s) y ${pendiente.ventas.length} venta(s) instalada(s).
            Se transferirá a tu saldo cuando administración cierre el período en curso.
          </p>
        </div>
      </div>
    ` : ''}

    <div class="seccion-titulo" style="margin-top: 18px;">
      <h3>Historial de Movimientos</h3>
    </div>
    <div class="lista-borradores">
      ${movimientos.length ? movimientos.map((m) => {
        const montoNum = Number(m.monto);
        const esPositivo = montoNum > 0;
        const icono = m.tipo_movimiento === 'liquidacion' ? '💰' : (m.tipo_movimiento === 'pago' ? '🏦' : '⚖️');
        const iconoClase = esPositivo ? 'movimiento-icono--mas' : 'movimiento-icono--menos';
        return `
          <div class="movimiento-fila">
            <div class="movimiento-icono ${iconoClase}">${icono}</div>
            <div class="movimiento-detalle">
              <div class="movimiento-titulo">${escapeHtml(ETIQUETA_MOVIMIENTO[m.tipo_movimiento] || m.tipo_movimiento)}</div>
              <div class="movimiento-fecha">${formatDateTime(m.creado_en)}${m.observacion ? ' · ' + escapeHtml(m.observacion) : ''}</div>
            </div>
            <div class="movimiento-monto ${esPositivo ? 'movimiento-monto--pos' : 'movimiento-monto--neg'}">
              ${esPositivo ? '+' : ''}${formatMoney(montoNum)}
            </div>
          </div>
        `;
      }).join('') : '<p class="vacio">No registras movimientos recientes en tu cuenta.</p>'}
    </div>

    <div class="seccion-titulo" style="margin-top: 20px;">
      <h3>Períodos y Cierres Liquidados</h3>
    </div>
    <div class="lista-borradores">
      ${periodos.length ? periodos.map((p) => `
        <div class="tarjeta-borrador" style="cursor: default;">
          <div class="icono-tipo" style="background: var(--ok-suave); color: var(--ok);">✓</div>
          <span class="tarjeta-borrador-info">
            <span class="tarjeta-borrador-folio">${formatMoney(p.monto_total)} liquidado</span><br>
            <span class="tarjeta-borrador-meta">${formatDateTime(p.fecha_desde)} al ${formatDateTime(p.fecha_hasta)} · Cerrado por ${escapeHtml(p.cerrado_por_nombre || 'Admin')}</span>
          </span>
        </div>
      `).join('') : '<p class="vacio">Todavía no se ha cerrado ningún período para tu cuenta.</p>'}
    </div>
  `;
}
