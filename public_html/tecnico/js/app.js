import { api } from './api.js';
import { route, startRouter } from './router.js';
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

async function boot() {
  try {
    const { usuario } = await api('/auth/yo');
    setUsuarioActual(usuario);
    $shell.hidden = false;
    $loginScreen.hidden = true;
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
