// Orquesta los 5 pasos de "Cerrar Orden" (ver docs/wizard-api.md). La orden
// vive en el servidor desde que el paso 1 tiene éxito — pero si no hay señal
// ni para ESO, el wizard sigue funcionando sobre un snapshot local (ver
// storage.js: guardarOrdenLocal) mientras la cola de offline.js espera para
// mandar todo en orden apenas vuelva la conexión.
import { api } from '../../api.js';
import { el, escapeHtml, formatDateTime } from '../../utils.js';
import { irA } from '../../router.js';
import { setTopbar } from '../../topbar.js';
import {
  guardarBorrador, eliminarBorrador, getCatalogo, setCatalogo,
  guardarOrdenLocal, obtenerOrdenLocal, eliminarOrdenLocal,
} from '../../storage.js';
import { onColaCambio, colaContar } from '../../offline.js';
import { renderPaso1 } from './paso1-datos.js';
import { renderPaso2 } from './paso2-escaneo.js';
import { renderPaso3 } from './paso3-fotos.js';
import { renderPaso4 } from './paso4-cierre.js';
import { renderPaso5 } from './paso5-enviar.js';

const PASOS = [
  { n: 1, etiqueta: 'Datos', render: renderPaso1 },
  { n: 2, etiqueta: 'Equipos', render: renderPaso2 },
  { n: 3, etiqueta: 'Fotos', render: renderPaso3 },
  { n: 4, etiqueta: 'Cierre', render: renderPaso4 },
  { n: 5, etiqueta: 'Enviar', render: renderPaso5 },
];

export async function renderWizard(container, params) {
  const uuid = params.uuid;
  if (!uuid) {
    irA('home');
    return;
  }

  setTopbar({ titulo: 'Cargando…', atras: () => irA('home') });

  let orden = null;
  try {
    orden = await api(`/ordenes/${encodeURIComponent(uuid)}`);
    eliminarOrdenLocal(uuid); // el servidor ya tiene la verdad — el respaldo local ya no hace falta
  } catch (e) {
    if (e.code === 'sin_conexion') {
      // Sin señal: si esta orden se venía trabajando offline, seguimos
      // sobre ese snapshot. Si nunca se guardó nada, es como si fuera 404 —
      // una orden realmente nueva no necesita conexión para el paso 1.
      orden = obtenerOrdenLocal(uuid);
    } else if (e.code !== 'no_encontrado') {
      container.appendChild(el(`
        <section class="wizard-paso">
          <p class="vacio vacio--error">${escapeHtml(e.message)}</p>
          <button type="button" class="btn btn--secundario" id="wizard-reintentar">Reintentar</button>
        </section>
      `));
      container.querySelector('#wizard-reintentar').addEventListener('click', () => renderWizard(container, params));
      setTopbar({ titulo: 'Orden', atras: () => irA('home') });
      return;
    }
    // 404 = todavía no se creó en el servidor — normal para una orden nueva.
  }

  if (orden && orden.estado !== 'borrador') {
    eliminarBorrador(uuid);
    renderYaCerrada(container, orden);
    return;
  }
  if (orden && orden._enviarPendiente) {
    renderEnvioPendiente(container, orden);
    return;
  }

  // El paso 1 no se puede revisitar una vez que la orden existe: folio y
  // tipo de servicio quedan fijos desde que se crea (no hay endpoint para
  // cambiarlos). Por eso el paso mínimo alcanzable con una orden ya creada
  // es el 2, sin importar qué diga la URL o un borrador local viejo.
  let pasoActual = orden ? Math.max(2, Number(params.paso) || 2) : 1;

  let catalogo = getCatalogo() || [];
  let tipoServicio = orden ? (catalogo.find((t) => t.id === orden.tipo_servicio_id) || null) : null;

  // Reanudando una orden en un celular sin caché local (reinstalación,
  // datos borrados): el paso 3 necesita sí o sí requisitos_foto/fotos_dinamicas
  // del tipo de servicio, así que no se puede seguir sin esto.
  if (orden && !tipoServicio) {
    try {
      const { tipos_servicio } = await api('/catalogo/tipos-servicio');
      catalogo = tipos_servicio;
      setCatalogo(tipos_servicio);
      tipoServicio = catalogo.find((t) => t.id === orden.tipo_servicio_id) || null;
    } catch {
      // sigue sin catálogo — paso3 lo vuelve a intentar y muestra su propio error si hace falta.
    }
  }

  const shell = el(`
    <div style="display: contents;">
      <div class="wizard-progreso" id="wizard-progreso"></div>
      <p class="wizard-progreso-label" id="wizard-progreso-label"></p>
      <p class="campo-ayuda" id="wizard-pendientes" style="padding: 0 16px 8px;" hidden></p>
      <div id="wizard-paso-contenido" style="display: contents;"></div>
    </div>
  `);
  container.appendChild(shell);
  const $contenido = shell.querySelector('#wizard-paso-contenido');

  function pintarProgreso() {
    shell.querySelector('#wizard-progreso').innerHTML = PASOS.map((p) => `
      <div class="wizard-progreso-paso ${p.n < pasoActual ? 'hecho' : ''} ${p.n === pasoActual ? 'activo' : ''}"></div>
    `).join('');
    shell.querySelector('#wizard-progreso-label').textContent = `Paso ${pasoActual} de 5 · ${PASOS[pasoActual - 1].etiqueta}`;
    setTopbar({ titulo: orden?.folio ? `Folio ${orden.folio}` : 'Nueva orden', atras: () => irA('home') });
    actualizarBadgePendientes();
  }

  async function actualizarBadgePendientes() {
    const $badge = shell.querySelector('#wizard-pendientes');
    if (!$badge) return;
    const n = await colaContar(uuid).catch(() => 0);
    $badge.hidden = n === 0;
    $badge.textContent = n === 0 ? '' : (n === 1
      ? '⏳ 1 acción guardada sin conexión — se enviará sola al recuperar señal.'
      : `⏳ ${n} acciones guardadas sin conexión — se enviarán solas al recuperar señal.`);
  }
  const dejarDeEscucharCola = onColaCambio(actualizarBadgePendientes);

  function guardarLocal() {
    guardarBorrador({
      uuid,
      folio: orden?.folio || '',
      tipo_servicio: tipoServicio?.codigo || '',
      tipo_servicio_nombre: tipoServicio?.nombre || '',
      paso: pasoActual,
    });
    if (orden) guardarOrdenLocal(uuid, orden);
    // Mantiene la URL en sincronía para sobrevivir a que el sistema mate la
    // app en segundo plano (típico en Android) — sin disparar hashchange,
    // que volvería a montar todo el wizard desde cero en cada paso.
    history.replaceState(null, '', `#wizard?uuid=${encodeURIComponent(uuid)}&paso=${pasoActual}`);
  }

  const ctx = {
    uuid,
    getOrden: () => orden,
    // tipoServicioExplicito: paso1 lo pasa directo porque puede haber
    // refrescado el catálogo recién ahora — más confiable que releer el
    // array que este wizard.js cerró al montarse, que puede estar vacío
    // en un celular sin caché todavía.
    setOrden(nuevaOrden, tipoServicioExplicito) {
      orden = nuevaOrden;
      if (tipoServicioExplicito) {
        tipoServicio = tipoServicioExplicito;
      } else if (!tipoServicio) {
        tipoServicio = catalogo.find((t) => t.id === orden.tipo_servicio_id) || null;
      }
      guardarOrdenLocal(uuid, orden);
    },
    getTipoServicio: () => tipoServicio,
    getCatalogo: () => catalogo,
    async irPaso(n) {
      if (orden && orden.estado !== 'borrador') {
        eliminarBorrador(uuid);
        $contenido.innerHTML = '';
        renderYaCerrada(container, orden);
        return;
      }
      if (orden && orden._enviarPendiente) {
        $contenido.innerHTML = '';
        renderEnvioPendiente(container, orden);
        return;
      }
      pasoActual = n;
      guardarLocal();
      await pintarPaso();
    },
    irHome: () => irA('home'),
  };

  async function pintarPaso() {
    pintarProgreso();
    $contenido.innerHTML = '';
    await PASOS[pasoActual - 1].render($contenido, ctx);
  }

  guardarLocal();
  await pintarPaso();
  return dejarDeEscucharCola;
}

/**
 * El técnico ya tocó "Enviar orden" pero no había señal — la acción quedó
 * en la cola (ver offline.js), no hay forma de saber todavía si el
 * servidor la va a aceptar como 'enviada' o marcarla 'conflicto'. Por eso
 * NO es la misma pantalla que renderYaCerrada(): acá la única certeza es
 * "ya no se puede seguir editando desde acá", igual que el servidor haría
 * con orden_no_editable una vez que de verdad reciba el envío.
 */
function renderEnvioPendiente(container, orden) {
  setTopbar({ titulo: `Folio ${orden.folio}`, atras: () => irA('home') });
  container.appendChild(el(`
    <section class="wizard-paso" style="padding-bottom: 24px; align-items: center; text-align: center;">
      <span style="font-size: 3rem;">⏳</span>
      <h2>Envío guardado, esperando señal</h2>
      <p class="wizard-paso-intro">
        Ya tocaste "Enviar orden" — quedó guardada en este celular y se manda sola apenas
        recuperes conexión. No hace falta que hagas nada más; esta orden ya no se puede
        seguir editando desde acá.
      </p>
      <button type="button" class="btn btn--primario" id="envio-pendiente-volver">Volver al inicio</button>
    </section>
  `));
  container.querySelector('#envio-pendiente-volver').addEventListener('click', () => irA('home'));
}

function renderYaCerrada(container, orden) {
  setTopbar({ titulo: `Folio ${orden.folio}`, atras: () => irA('home') });
  const estadoTexto = {
    enviada: 'Enviada — pendiente de revisión.',
    observada: 'El administrador pidió una corrección.',
    aprobada: 'Aprobada.',
    rechazada_corregible: 'Rechazada, pero corregible — pídele al administrador que la reabra.',
    rechazada_penalizada: 'Rechazada, sin pago.',
    conflicto: 'En conflicto de folio — el administrador la va a revisar.',
    liquidada: 'Liquidada.',
  }[orden.estado] || orden.estado;

  const detalles = [];
  if (orden.monto_tecnico !== null && orden.monto_tecnico !== undefined) {
    detalles.push(`<div class="resumen-fila"><span>Monto</span><span>$${Number(orden.monto_tecnico).toLocaleString('es-CL')}</span></div>`);
  }
  if (orden.motivo_rechazo) {
    detalles.push(`<div class="resumen-fila"><span>Motivo</span><span>${escapeHtml(orden.motivo_rechazo)}</span></div>`);
  }
  if (orden.comentario_auditoria) {
    detalles.push(`<div class="resumen-fila"><span>Comentario</span><span>${escapeHtml(orden.comentario_auditoria)}</span></div>`);
  }
  if (orden.fecha_auditoria) {
    detalles.push(`<div class="resumen-fila"><span>Revisada</span><span>${formatDateTime(orden.fecha_auditoria)}</span></div>`);
  }

  container.appendChild(el(`
    <section class="wizard-paso" style="padding-bottom: 24px; align-items: center; text-align: center;">
      <h2>Esta orden ya se envió</h2>
      <p class="wizard-paso-intro">${escapeHtml(estadoTexto)}</p>
      <p class="campo-ayuda">Enviada el ${formatDateTime(orden.creado_en)}.</p>
      ${detalles.length ? `<div class="resumen-bloque" style="width: 100%; text-align: left;">${detalles.join('')}</div>` : ''}
      <button type="button" class="btn btn--primario" id="wizard-cerrada-volver">Volver al inicio</button>
    </section>
  `));
  container.querySelector('#wizard-cerrada-volver').addEventListener('click', () => irA('home'));
}
