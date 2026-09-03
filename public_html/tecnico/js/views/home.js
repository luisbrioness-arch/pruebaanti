import { api } from '../api.js';
import { el, escapeHtml, iconoTipoServicio, formatDateTime } from '../utils.js';
import { irA } from '../router.js';
import { setTopbar } from '../topbar.js';
import { toast } from '../toast.js';
import { confirmar } from '../modal.js';
import { listarBorradores, eliminarBorrador, setCatalogo, setMaleta, setCatalogoFerreteria } from '../storage.js';
import { getUsuarioActual } from '../session.js';
import { generarUuid } from '../uuid.js';
import { onColaCambio, colaContar } from '../offline.js';

export async function renderHome(container) {
  setTopbar({ titulo: 'Terreno DTH' });
  const usuario = getUsuarioActual();

  const seccion = el(`
    <section class="home">
      <p class="home-saludo">Hola, <strong>${escapeHtml(usuario?.nombre || '')}</strong></p>

      <p class="campo-ayuda" id="home-pendientes" hidden></p>

      <div class="acciones-principales">
        <button type="button" class="accion-grande acento-fuerte" id="btn-nueva-orden">
          <span class="icono">📡</span>
          <span>Nueva instalación / servicio</span>
        </button>
        <button type="button" class="accion-grande" id="btn-registrar-venta">
          <span class="icono">🧾</span>
          <span>Registrar venta</span>
        </button>
      </div>

      <div>
        <div class="seccion-titulo"><h3>En curso en este celular</h3></div>
        <div class="lista-borradores" id="lista-borradores"></div>
      </div>

      <button type="button" class="btn btn--secundario btn--ancho" id="btn-traspasos">📦 Bodega <span id="badge-traspasos"></span></button>
      <button type="button" class="btn btn--secundario btn--ancho" id="btn-historial">Ver mis órdenes enviadas</button>
      <button type="button" class="btn btn--secundario btn--ancho" id="btn-billetera">Ver mi billetera</button>
    </section>
  `);
  container.appendChild(seccion);

  seccion.querySelector('#btn-nueva-orden').addEventListener('click', () => {
    irA('wizard', { uuid: generarUuid(), paso: 1 });
  });
  seccion.querySelector('#btn-registrar-venta').addEventListener('click', () => {
    irA('venta');
  });
  seccion.querySelector('#btn-traspasos').addEventListener('click', () => irA('traspasos'));
  seccion.querySelector('#btn-historial').addEventListener('click', () => irA('historial'));
  seccion.querySelector('#btn-billetera').addEventListener('click', () => irA('billetera'));

  // Best-effort: si no hay señal, el botón queda sin número — no es crítico,
  // el técnico igual puede entrar a mirar cuando quiera.
  api('/mis-traspasos').then(({ equipos, ferreteria }) => {
    const n = equipos.length + ferreteria.length;
    const $badge = seccion.querySelector('#badge-traspasos');
    if ($badge && n > 0) $badge.textContent = `(${n})`;
  }).catch(() => {});

  pintarBorradores(seccion.querySelector('#lista-borradores'));

  // Refresca los catálogos en segundo plano — el wizard los necesita
  // cacheados para el paso 1 (tipos de servicio) y el paso 2 (maleta,
  // validación instantánea aunque se pierda la señal después).
  refrescarCatalogos();

  async function actualizarBadgePendientes() {
    const $badge = document.getElementById('home-pendientes');
    if (!$badge) return; // la vista ya cambió
    const n = await colaContar().catch(() => 0);
    $badge.hidden = n === 0;
    $badge.textContent = n === 0 ? '' : `⏳ ${n} ${n === 1 ? 'acción guardada' : 'acciones guardadas'} sin conexión, esperando señal para enviarse.`;
    // Un "enviar" que recién terminó de sincronizarse (quizás con la app en
    // segundo plano) saca su orden de esta lista — hay que repintarla, no
    // solo el contador.
    const $lista = document.getElementById('lista-borradores');
    if ($lista) pintarBorradores($lista);
  }
  actualizarBadgePendientes();
  const dejarDeEscucharCola = onColaCambio(actualizarBadgePendientes);
  return dejarDeEscucharCola;
}

function pintarBorradores(contenedor) {
  const borradores = listarBorradores();
  if (!borradores.length) {
    contenedor.innerHTML = '<p class="vacio">No tienes ninguna orden a medio terminar. Toca "Nueva instalación / servicio" para empezar.</p>';
    return;
  }
  contenedor.innerHTML = '';
  for (const b of borradores) {
    const tarjeta = el(`
      <div class="tarjeta-borrador" style="padding-right: 6px;">
        <button type="button" class="icono-tipo" style="border: none;" aria-hidden="true" tabindex="-1">${iconoTipoServicio(b.tipo_servicio)}</button>
        <button type="button" class="tarjeta-borrador-info" style="text-align: left; background: none; border: none; padding: 0;">
          <span class="tarjeta-borrador-folio">${escapeHtml(b.folio || 'Sin folio aún')}</span><br>
          <span class="tarjeta-borrador-meta">${escapeHtml(b.tipo_servicio_nombre || '')} · Paso ${b.paso} de 5 · ${formatDateTime(b.actualizado_en)}</span>
        </button>
        <button type="button" class="btn-icono" aria-label="Quitar de la lista">🗑️</button>
      </div>
    `);
    tarjeta.querySelector('.tarjeta-borrador-info').addEventListener('click', () => {
      irA('wizard', { uuid: b.uuid, paso: b.paso });
    });
    tarjeta.querySelector('.btn-icono').addEventListener('click', (ev) => {
      ev.stopPropagation();
      confirmarQuitar(b);
    });
    contenedor.appendChild(tarjeta);
  }
}

async function confirmarQuitar(borrador) {
  const ok = await confirmar(
    `¿Quitar "${borrador.folio || 'esta orden'}" de la lista? Si ya llegó a crearse en el servidor, seguirá ahí como borrador — esto solo la saca de este celular.`,
    { textoOk: 'Quitar', peligro: true }
  );
  if (!ok) return;
  eliminarBorrador(borrador.uuid);
  pintarBorradores(document.getElementById('lista-borradores'));
}

async function refrescarCatalogos() {
  try {
    const { tipos_servicio } = await api('/catalogo/tipos-servicio');
    setCatalogo(tipos_servicio);
  } catch {
    // sin señal ahora mismo — se usa lo que ya había en caché, o se
    // reintenta la próxima vez que se abra esta pantalla.
  }
  try {
    const maleta = await api('/maleta');
    setMaleta(maleta);
  } catch {
    // idem
  }
  try {
    const { items } = await api('/catalogo/items-ferreteria');
    setCatalogoFerreteria(items);
  } catch {
    // idem — el paso 4 sigue funcionando, solo sin la opción de "agregar
    // fuera del kit" hasta que se cachee con señal al menos una vez.
  }
}
