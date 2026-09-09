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
      <div class="historial-busqueda-barra" style="margin-bottom: 12px; position: relative;">
        <input type="search" id="filtro-historial-tecnico" placeholder="Buscar folio, cliente, N° TuVes..." style="width: 100%; box-sizing: border-box; padding: 11px 14px 11px 38px; border-radius: var(--radio-chico); border: 1.5px solid var(--borde-fuerte); background: var(--superficie); font-size: 15px; color: var(--tinta);">
        <svg style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--tinta-3);" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </div>
      <div id="historial-conteo" style="font-size: 12px; font-weight: 600; color: var(--tinta-2); margin-bottom: 10px; display: none;"></div>
      <div id="historial-lista"><p class="vacio">Cargando…</p></div>
    </section>
  `);
  container.appendChild(seccion);

  const $lista = seccion.querySelector('#historial-lista');
  const $input = seccion.querySelector('#filtro-historial-tecnico');
  const $conteo = seccion.querySelector('#historial-conteo');

  try {
    const { ordenes } = await api('/mis-ordenes');
    const todasLasOrdenes = Array.isArray(ordenes) ? ordenes : [];

    function aplicarFiltro() {
      const q = ($input.value || '').trim().toLowerCase();
      if (!q) {
        $conteo.style.display = 'none';
        pintar($lista, todasLasOrdenes);
        return;
      }
      const filtradas = todasLasOrdenes.filter((o) => {
        const valores = [
          o.folio,
          o.cliente_nombre,
          o.cliente_rut,
          o.numero_orden_tuves,
          o.tipo_servicio_nombre,
          o.estado,
          ESTADO_LABEL[o.estado],
        ];
        return valores.some((v) => v && String(v).toLowerCase().includes(q));
      });
      $conteo.textContent = `Mostrando ${filtradas.length} de ${todasLasOrdenes.length} órdenes`;
      $conteo.style.display = 'block';
      pintar($lista, filtradas, q);
    }

    $input.addEventListener('input', aplicarFiltro);
    pintar($lista, todasLasOrdenes);
  } catch (e) {
    $lista.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
  }
}

function pintar(contenedor, ordenes, query = '') {
  if (!ordenes.length) {
    if (query) {
      contenedor.innerHTML = `<p class="vacio">No se encontraron órdenes que coincidan con "<strong>${escapeHtml(query)}</strong>".</p>`;
    } else {
      contenedor.innerHTML = '<p class="vacio">Todavía no has enviado ninguna orden.</p>';
    }
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
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <span class="tarjeta-borrador-folio">${escapeHtml(o.folio)}</span>
            <span class="pill pill--${tono === 'malo' ? 'alerta' : tono === 'pendiente' ? 'manual' : 'ok'}">${escapeHtml(etiqueta)}</span>
          </div>
          ${o.cliente_nombre ? `<div style="font-weight: 600; font-size: 14px; color: var(--tinta); margin: 3px 0 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">👤 ${escapeHtml(o.cliente_nombre)}${o.cliente_rut ? ` <span style="font-size: 12px; color: var(--tinta-3); font-weight: 400;">(${escapeHtml(o.cliente_rut)})</span>` : ''}</div>` : ''}
          <span class="tarjeta-borrador-meta">
            ${escapeHtml(o.tipo_servicio_nombre)}
            ${o.numero_orden_tuves ? ` · TuVes: <strong>#${escapeHtml(o.numero_orden_tuves)}</strong>` : ''}
            · ${formatDateTime(o.creado_en)}
            ${o.monto_tecnico ? ' · $' + Number(o.monto_tecnico).toLocaleString('es-CL') : ''}
          </span>
        </span>
        <span class="chevron">›</span>
      </button>
    `);
    tarjeta.addEventListener('click', () => irA('wizard', { uuid: o.uuid_dispositivo, paso: 5 }));
    contenedor.appendChild(tarjeta);
  }
}

