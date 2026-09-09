import { api } from './api.js';
import { route, startRouter } from './router.js';
import { procesarCola, onColaCambio, colaContar } from './offline.js';
import { renderLogin } from './views/login.js';
import { renderHistorial } from './views/historial.js';
import { renderTarifario } from './views/tarifario.js';
import { renderBodega } from './views/bodega.js';
import { renderBilletera } from './views/billetera.js';
import { renderUsuarios } from './views/usuarios.js';
import { renderGuia } from './views/guia.js';
import { renderInicio } from './views/inicio.js';
import { initModoReportar } from './reportar.js';
import { initAjustes } from './ajustes.js';
import { confirmar } from './modal.js';

route('inicio', renderInicio);
route('historial', renderHistorial);
route('tarifario', renderTarifario);
route('bodega', renderBodega);
route('billetera', renderBilletera);
route('usuarios', renderUsuarios);
route('guia', renderGuia);

const $shell = document.getElementById('shell');
const $loginScreen = document.getElementById('login-screen');
const $loginContainer = document.getElementById('login-form-container');
const $pendientesBadge = document.getElementById('pendientes-badge');

async function actualizarBadgePendientes() {
  const n = await colaContar().catch(() => 0);
  $pendientesBadge.hidden = n === 0;
  $pendientesBadge.textContent = n === 0 ? '' : `⏳ ${n} sin enviar`;
}
onColaCambio(actualizarBadgePendientes);

function mostrarLogin(mensaje) {
  $shell.hidden = true;
  $loginScreen.hidden = false;
  renderLogin($loginContainer, boot);
  if (mensaje) {
    const errorP = $loginContainer.querySelector('.login-error');
    if (errorP) { errorP.textContent = mensaje; errorP.hidden = false; }
  }
}

function iniciarRelojAdmin() {
  const cont = document.getElementById('admin-reloj-fecha-hora');
  if (!cont) return;

  function tick() {
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-CL', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const fecha = ahora.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    cont.innerHTML = `
      <span class="reloj-item"><span class="reloj-hora">🕒 ${hora}</span></span>
      <span class="reloj-item"><span class="reloj-fecha">📅 ${fecha}</span></span>
    `;
  }
  tick();
  setInterval(tick, 1000);
}

async function boot() {
  try {
    const { usuario } = await api('/auth/yo');
    if (usuario.rol !== 'admin') {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      mostrarLogin('Esta cuenta no tiene permisos de administrador.');
      return;
    }
    document.getElementById('usuario-nombre').textContent = usuario.nombre;
    $shell.hidden = false;
    $loginScreen.hidden = true;
    iniciarRelojAdmin();
    startRouter();
    actualizarBadgePendientes();
    procesarCola();
    initModoReportar();
    initAjustes();
  } catch {
    mostrarLogin();
  }
}

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  const siCerrar = await confirmar('¿Estás seguro de que deseas cerrar sesión?', {
    textoOk: 'Cerrar sesión',
    textoCancelar: 'Cancelar',
    peligro: true,
  });
  if (!siCerrar) return;

  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  location.hash = '';
  boot();
});

boot();
