// "Modo inspección" — botón flotante siempre visible; al activarlo, clic en
// cualquier elemento de la pantalla para reportarlo. Captura sola la
// pantalla (hash actual) y una descripción del elemento clickeado (tag,
// selector, texto) — el usuario solo escribe QUÉ pasa, no DÓNDE, porque eso
// ya quedó capturado. Adaptado del patrón de otro proyecto del cliente
// (debug-mode.ts) a este stack vanilla — ver docs/reportes.md.
import { api } from './api.js';
import { abrirModal } from './modal.js';
import { toast } from './toast.js';
import { conColaSiHaceFalta } from './offline.js';

const ATTR_UI = 'data-reportar-ui';
let modoActivo = false;
let elementoResaltado = null;

function truncar(texto, max = 100) {
  const limpio = String(texto ?? '').replace(/\s+/g, ' ').trim();
  return limpio.length <= max ? limpio : limpio.slice(0, max - 1) + '…';
}

function construirSelector(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const partes = [];
  let actual = el;
  while (actual && actual !== document.body && partes.length < 4) {
    const padre = actual.parentElement;
    if (!padre) { partes.unshift(actual.tagName.toLowerCase()); break; }
    const hermanos = [...padre.children].filter((c) => c.tagName === actual.tagName);
    const indice = hermanos.indexOf(actual) + 1;
    partes.unshift(`${actual.tagName.toLowerCase()}:nth-of-type(${indice})`);
    actual = padre;
  }
  return partes.join(' > ');
}

function esUiPropia(el) {
  return !!el && el.closest(`[${ATTR_UI}]`) !== null;
}

function limpiarResaltado() {
  elementoResaltado?.classList.remove('reportar-resaltado');
  elementoResaltado = null;
}

function activarModo(activo) {
  modoActivo = activo;
  document.body.classList.toggle('reportar-eligiendo', activo);
  if (!activo) limpiarResaltado();
}

function onMouseMove(ev) {
  if (!modoActivo) return;
  const objetivo = document.elementFromPoint(ev.clientX, ev.clientY);
  if (!objetivo || esUiPropia(objetivo)) { limpiarResaltado(); return; }
  if (objetivo !== elementoResaltado) {
    limpiarResaltado();
    elementoResaltado = objetivo;
    elementoResaltado.classList.add('reportar-resaltado');
  }
}

function onClickCaptura(ev) {
  if (!modoActivo) return;
  const objetivo = ev.target;
  if (esUiPropia(objetivo)) return;
  ev.preventDefault();
  ev.stopPropagation();
  activarModo(false);
  abrirDialogoReporte(objetivo);
}

function abrirDialogoReporte(el) {
  const tag = el.tagName.toLowerCase();
  const texto = truncar(el.textContent);
  const selector = construirSelector(el);
  const elemento = `${tag}${selector ? ` \`${selector}\`` : ''}${texto ? ` — "${texto}"` : ''}`;
  const pantalla = location.hash || '#auditoria';

  const { root, cerrar } = abrirModal(`
    <h3>Reportar un problema</h3>
    <p class="modal-explicacion">Describe qué está mal con lo que elegiste — ya sabemos dónde fue.</p>
    <dl class="reportar-contexto">
      <div><dt>Pantalla</dt><dd><code>${escapeHtml(pantalla)}</code></dd></div>
      <div><dt>Elemento</dt><dd>${escapeHtml(elemento)}</dd></div>
    </dl>
    <form id="form-reportar">
      <label class="campo">
        <span>Tipo</span>
        <select name="tipo">
          <option value="bug">Bug — algo no funciona como debería</option>
          <option value="cambio">Cambio — me gustaría que fuera distinto</option>
        </select>
      </label>
      <label class="campo">
        <span>Descripción</span>
        <textarea name="descripcion" rows="3" required placeholder="Qué está mal…" autofocus></textarea>
      </label>
      <p class="campo-error" id="reportar-error" hidden></p>
      <div class="modal-acciones">
        <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
        <button type="submit" class="btn btn--primario">Enviar reporte</button>
      </div>
    </form>
  `);

  root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
  root.querySelector('#form-reportar').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const $error = root.querySelector('#reportar-error');
    $error.hidden = true;
    const $submit = ev.target.querySelector('button[type="submit"]');
    $submit.disabled = true;
    const payload = { tipo: fd.get('tipo'), descripcion: fd.get('descripcion'), pantalla, elemento };
    try {
      const { encolado } = await conColaSiHaceFalta(
        'reportar', payload,
        () => api('/reportes', { method: 'POST', body: payload })
      );
      cerrar();
      toast(encolado ? 'Reporte guardado sin conexión — se enviará al recuperar señal.' : 'Reporte enviado — gracias.', encolado ? 'neutro' : 'ok');
    } catch (e) {
      $error.textContent = e.message;
      $error.hidden = false;
      $submit.disabled = false;
    }
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function crearFab() {
  if (document.querySelector(`[${ATTR_UI}="fab"]`)) return;
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.setAttribute(ATTR_UI, 'fab');
  fab.className = 'reportar-fab';
  fab.title = 'Reportar un problema — elige el elemento en pantalla';
  fab.textContent = '🐞';
  fab.addEventListener('click', () => {
    activarModo(!modoActivo);
    fab.classList.toggle('reportar-fab--activo', modoActivo);
    if (modoActivo) toast('Haz clic en el elemento con el problema (Esc para cancelar)', 'neutro');
  });
  document.body.appendChild(fab);

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && modoActivo) {
      activarModo(false);
      fab.classList.remove('reportar-fab--activo');
    }
  });
}

export function initModoReportar() {
  crearFab();
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClickCaptura, true);
}
