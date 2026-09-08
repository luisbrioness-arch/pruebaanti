import { api } from './api.js';
import { route, startRouter, renderRoute } from './router.js';
import { setUsuarioActual } from './session.js';
import { procesarCola } from './offline.js';
import { renderLogin } from './views/login.js';
import { renderHome } from './views/home.js';
import { renderVenta } from './views/venta.js';
import { renderHistorial } from './views/historial.js';
import { renderBilletera } from './views/billetera.js';
import { renderTraspasos } from './views/traspasos.js';
import { renderWizard } from './views/wizard/wizard.js';
import { initModoReportar } from './reportar.js';

route('home', renderHome);
route('venta', renderVenta);
route('historial', renderHistorial);
route('billetera', renderBilletera);
route('traspasos', renderTraspasos);
route('wizard', renderWizard);

const $shell = document.getElementById('shell');
const $loginScreen = document.getElementById('login-screen');
const $loginContainer = document.getElementById('login-form-container');
const $offlineBanner = document.getElementById('offline-banner');

function mostrarLogin(mensaje) {
  $shell.hidden = true;
  $loginScreen.hidden = false;
  renderLogin($loginContainer, boot);
  if (mensaje) {
    const errorP = $loginContainer.querySelector('.login-error');
    if (errorP) {
      errorP.textContent = mensaje;
      errorP.hidden = false;
    }
  }
}

function iniciarRelojTecnico() {
  const elReloj = document.getElementById('topbar-reloj');
  if (!elReloj) return;

  function tick() {
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-CL', { hour12: false, hour: '2-digit', minute: '2-digit' });
    elReloj.textContent = `🕒 ${hora}`;
  }
  tick();
  setInterval(tick, 1000);
}

function iniciarPullToRefresh() {
  const $ptr = document.getElementById('ptr-indicador');
  const $ptrTexto = $ptr?.querySelector('.ptr-texto');
  if (!$ptr) return;

  let inicioY = 0;
  let distY = 0;
  let tirando = false;
  let cargando = false;
  const UMBRAL = 75; // px requeridos para activar actualización

  function puedeTirar() {
    if (cargando) return false;
    // Si hay un modal visible, no activar
    const modal = document.getElementById('modal-overlay');
    if (modal && !modal.hidden) return false;

    // Verificar si el scroll de la ventana o del contenedor principal está arriba
    const scrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (scrollY > 5) return false;

    const $view = document.getElementById('view');
    if ($view && $view.scrollTop > 5) return false;

    // Si algún elemento interno scrolleable (ej. wizard-paso) no está al tope, evitar
    const pasoScroll = document.querySelector('.wizard-paso');
    if (pasoScroll && pasoScroll.scrollTop > 5) return false;

    return true;
  }

  window.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    if (!puedeTirar()) return;
    inicioY = e.touches[0].clientY;
    tirando = true;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!tirando || cargando) return;
    const actualY = e.touches[0].clientY;
    const diff = actualY - inicioY;

    if (diff <= 0) {
      $ptr.classList.remove('ptr--visible', 'ptr--listo');
      $ptr.style.transform = '';
      return;
    }

    // Resistencia elástica tipo iOS/Android
    distY = Math.min(diff * 0.45, 110);
    $ptr.classList.add('ptr--visible');
    $ptr.style.transform = `translate(-50%, ${distY - 50}px)`;

    if (distY >= UMBRAL) {
      $ptr.classList.add('ptr--listo');
      if ($ptrTexto) $ptrTexto.textContent = 'Suelta para actualizar';
    } else {
      $ptr.classList.remove('ptr--listo');
      if ($ptrTexto) $ptrTexto.textContent = 'Desliza para actualizar';
    }
  }, { passive: true });

  window.addEventListener('touchend', async () => {
    if (!tirando || cargando) return;
    tirando = false;

    if (distY >= UMBRAL) {
      cargando = true;
      $ptr.classList.remove('ptr--listo');
      $ptr.classList.add('ptr--cargando');
      if ($ptrTexto) $ptrTexto.textContent = 'Actualizando…';

      try {
        // Ejecutar sincronización de cola offline y re-renderizar vista actual
        await procesarCola().catch(() => {});
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          // Solicitar comprobación de actualización del service worker en segundo plano
          navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).catch(() => {});
        }
        await renderRoute();
      } catch {
        // En caso de fallo crítico en el DOM, forzar recarga limpia
        location.reload();
      } finally {
        setTimeout(() => {
          $ptr.classList.remove('ptr--cargando', 'ptr--visible');
          $ptr.style.transform = '';
          if ($ptrTexto) $ptrTexto.textContent = 'Desliza para actualizar';
          cargando = false;
          distY = 0;
        }, 350);
      }
    } else {
      $ptr.classList.remove('ptr--visible', 'ptr--listo');
      $ptr.style.transform = '';
      distY = 0;
    }
  });

  window.addEventListener('touchcancel', () => {
    tirando = false;
    if (!cargando) {
      $ptr.classList.remove('ptr--visible', 'ptr--listo');
      $ptr.style.transform = '';
      distY = 0;
    }
  });
}

async function boot() {
  try {
    const { usuario } = await api('/auth/yo');
    setUsuarioActual(usuario);
    $shell.hidden = false;
    $loginScreen.hidden = true;
    iniciarRelojTecnico();
    iniciarPullToRefresh();
    startRouter();
    // Cada vez que se abre la app es un buen momento para intentar vaciar
    // lo que haya quedado pendiente de un rato sin señal (ver offline.js).
    procesarCola();
    initModoReportar();
  } catch {
    mostrarLogin();
  }
}

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  setUsuarioActual(null);
  location.hash = '';
  mostrarLogin();
});

function actualizarBannerOffline() {
  $offlineBanner.hidden = navigator.onLine;
}
window.addEventListener('online', actualizarBannerOffline);
window.addEventListener('offline', actualizarBannerOffline);
actualizarBannerOffline();

// Registro del service worker — cáscara de la app instalable y rápida en
// mala señal, más un intento de Background Sync como bonus (ver sw.js y
// js/offline.js para dónde vive de verdad la cola de escritura offline).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* PWA no crítica para operar */ });
  });
}

boot();
