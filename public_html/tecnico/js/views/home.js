import { api } from '../api.js';
import { el, escapeHtml, iconoTipoServicio, formatDateTime } from '../utils.js';
import { irA } from '../router.js';
import { setTopbar } from '../topbar.js';
import { toast } from '../toast.js';
import { confirmar } from '../modal.js';
import { listarBorradores, eliminarBorrador, setCatalogo, setMaleta, getMaleta, setCatalogoFerreteria, setCatalogoPlanes } from '../storage.js';
import { getUsuarioActual } from '../session.js';
import { generarUuid } from '../uuid.js';
import { onColaCambio, colaContar } from '../offline.js';

export async function renderHome(container) {
  setTopbar({ titulo: 'Terreno DTH' });
  const usuario = getUsuarioActual();
  const iniciales = (usuario?.nombre || 'T')
    .split(' ')
    .filter(Boolean)
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const seccion = el(`
    <section class="home">
      <div class="home-perfil-card">
        <div class="home-perfil-info">
          <div class="home-avatar">${escapeHtml(iniciales)}</div>
          <div>
            <div class="home-saludo">Hola, <strong>${escapeHtml(usuario?.nombre || 'Técnico')}</strong></div>
            <div class="home-rol">Técnico en Terreno · DTH</div>
          </div>
        </div>
      </div>

      <div id="home-contenedor-alerta-stock"></div>

      <p class="campo-ayuda" id="home-pendientes" hidden></p>

      <div class="hub-grid">
        <div class="hub-card hub-card--destacado" id="btn-nueva-orden" role="button" tabindex="0">
          <span class="hub-card-icono">📡</span>
          <div>
            <span class="hub-card-titulo">Nueva Instalación / OT</span>
            <span class="hub-card-desc">Iniciar orden de trabajo en 5 pasos</span>
          </div>
        </div>

        <div class="hub-card" id="btn-registrar-venta" role="button" tabindex="0">
          <span class="hub-card-icono">🧾</span>
          <div>
            <span class="hub-card-titulo">Venta Directa</span>
            <span class="hub-card-desc">Registrar suscripción</span>
          </div>
        </div>

        <div class="hub-card" id="btn-traspasos" role="button" tabindex="0">
          <span class="hub-badge" id="badge-traspasos" hidden></span>
          <span class="hub-card-icono">📦</span>
          <div>
            <span class="hub-card-titulo">Mi Maleta</span>
            <span class="hub-card-desc">Bodega y traspasos</span>
          </div>
        </div>

        <div class="hub-card" id="btn-billetera" role="button" tabindex="0">
          <span class="hub-card-icono">💳</span>
          <div>
            <span class="hub-card-titulo">Mi Billetera</span>
            <span class="hub-valor" id="home-saldo-valor">Consultando…</span>
          </div>
        </div>

        <div class="hub-card" id="btn-historial" role="button" tabindex="0">
          <span class="hub-card-icono">📋</span>
          <div>
            <span class="hub-card-titulo">Mis Envíos</span>
            <span class="hub-card-desc">Historial y estados</span>
          </div>
        </div>
      </div>

      <div>
        <div class="seccion-titulo" style="margin-top: 6px; margin-bottom: 8px;">
          <h3>Borradores en este celular</h3>
        </div>
        <div class="lista-borradores" id="lista-borradores"></div>
      </div>
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

  // Consulta asíncrona de saldo para la tarjeta de billetera
  api('/mi-billetera').then(({ saldo }) => {
    const $saldo = seccion.querySelector('#home-saldo-valor');
    if ($saldo) {
      $saldo.textContent = '$' + Math.round(Number(saldo)).toLocaleString('es-CL');
      if (Number(saldo) < 0) $saldo.classList.add('valor-negativo');
    }
  }).catch(() => {
    const $saldo = seccion.querySelector('#home-saldo-valor');
    if ($saldo) $saldo.textContent = 'Ver saldo';
  });

  // Best-effort traspasos pendientes
  api('/mis-traspasos').then(({ equipos, ferreteria }) => {
    const n = (equipos?.length || 0) + (ferreteria?.length || 0);
    const $badge = seccion.querySelector('#badge-traspasos');
    if ($badge && n > 0) {
      $badge.textContent = `${n} por recibir`;
      $badge.hidden = false;
    }
  }).catch(() => {});

  pintarBorradores(seccion.querySelector('#lista-borradores'));

  function actualizarAvisoStockMaleta(maleta) {
    if (!maleta || !maleta.equipos) return;
    const decos = maleta.equipos.filter((e) => /deco/i.test(e.tipo_equipo_nombre));
    const $desc = seccion.querySelector('#btn-traspasos .hub-card-desc');
    const $alerta = seccion.querySelector('#home-contenedor-alerta-stock');

    if ($desc) {
      if (decos.length === 0) {
        $desc.innerHTML = '<span style="color: #dc2626; font-weight: 800;">🚨 0 decos (sin stock)</span>';
      } else if (decos.length === 1) {
        $desc.innerHTML = '<span style="color: #ea580c; font-weight: 700;">⚠️ 1 deco (crítico)</span>';
      } else {
        $desc.innerHTML = `<span style="color: #047857; font-weight: 600;">✅ ${decos.length} decos listos</span>`;
      }
    }

    if ($alerta) {
      if (decos.length < 2) {
        const esCero = decos.length === 0;
        $alerta.innerHTML = `
          <div style="background: ${esCero ? '#fef2f2' : '#fff7ed'}; border: 1.5px solid ${esCero ? '#ef4444' : '#ea580c'}; border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.3rem;">${esCero ? '🚨' : '⚠️'}</span>
              <div style="font-size: 0.82rem; color: ${esCero ? '#991b1b' : '#9a3412'}; line-height: 1.35;">
                <strong>${esCero ? 'Sin decodificadores disponibles' : 'Stock bajo de decodificadores'}</strong><br>
                ${esCero ? 'No tienes decos para nuevas instalaciones. Pide recarga a bodega central.' : 'Solo te queda 1 decodificador en tu maleta técnica.'}
              </div>
            </div>
            <button type="button" class="btn btn--chico" id="btn-ir-maleta-alerta" style="background: ${esCero ? '#dc2626' : '#ea580c'}; color: #fff; border: none; font-size: 0.76rem; font-weight: 700; white-space: nowrap; padding: 6px 11px; border-radius: 6px; cursor: pointer;">Ver Maleta</button>
          </div>
        `;
        $alerta.querySelector('#btn-ir-maleta-alerta')?.addEventListener('click', () => irA('traspasos'));
      } else {
        $alerta.innerHTML = '';
      }
    }
  }
  actualizarAvisoStockMaleta(getMaleta());

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
    const decos = (maleta?.equipos || []).filter((e) => /deco/i.test(e.tipo_equipo_nombre));
    const $desc = document.querySelector('#btn-traspasos .hub-card-desc');
    if ($desc) {
      if (decos.length < 2) {
        $desc.innerHTML = `<span style="color: #ea580c; font-weight: 700;">⚠️ ${decos.length} deco${decos.length === 1 ? '' : 's'} en maleta</span>`;
      } else {
        $desc.textContent = `${decos.length} decos disponibles`;
      }
    }
  } catch {
    // idem
  }
  try {
    const { items } = await api('/catalogo/items-ferreteria');
    setCatalogoFerreteria(items);
  } catch {
    // idem — el paso 4 sigue funcionando, solo sin el buscador de
    // ferretería (no hay de dónde sacar los nombres) hasta que se cachee
    // con señal al menos una vez.
  }
  try {
    const { planes } = await api('/catalogo/planes');
    setCatalogoPlanes(planes);
  } catch {
    // idem — la venta directa sigue funcionando offline si ya se cargó una vez
  }
}
