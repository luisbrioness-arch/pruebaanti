// Paso 2 — escaneo de materiales. La validación contra la maleta ocurre en
// el servidor apenas se manda cada serie (ver wizard-api.md). Offline, solo
// "instalar" se puede encolar de verdad (ver offline.js): la maleta
// cacheada ya trae el equipo_id real de cada serie propia, así que no hace
// falta preguntarle nada al servidor para saber a qué equipo corresponde.
// "Retirar" no tiene esa suerte — un equipo instalado en la casa del
// cliente no está en ninguna caché local — así que sigue exigiendo conexión.
import { api, ApiError } from '../../api.js';
import { el, escapeHtml, hayConexion } from '../../utils.js';
import { toast } from '../../toast.js';
import { abrirScanner } from '../../scanner.js';
import { getMaleta } from '../../storage.js';
import { encolar, desencolarMaterial } from '../../offline.js';

export async function renderPaso2(container, ctx) {
  const seccion = el(`
    <div style="display: contents;">
    <section class="wizard-paso">
      <h2>Equipos</h2>
      <div class="segmentado" id="segmentado-accion">
        <button type="button" data-accion="instalado" class="activo">Instalar</button>
        <button type="button" data-accion="retirado">Retirar</button>
      </div>

      <button type="button" class="escaneo-cta" id="btn-escanear">
        <span class="icono">📷</span>
        <p>Escanear código de la serie</p>
      </button>

      <div class="entrada-manual">
        <input type="text" id="input-manual" placeholder="O escribe la serie a mano" autocomplete="off" autocapitalize="characters">
        <button type="button" class="btn btn--secundario" id="btn-agregar-manual">Agregar</button>
      </div>

      <div>
        <div class="seccion-titulo"><h3>Escaneados en esta orden</h3></div>
        <div class="lista-materiales" id="lista-materiales"></div>
      </div>
    </section>
    <div class="wizard-acciones">
      <button type="button" class="btn btn--primario btn--ancho" id="paso2-siguiente" disabled>Siguiente</button>
    </div>
    </div>
  `);
  container.appendChild(seccion);

  let accion = 'instalado';
  const $segmentado = seccion.querySelector('#segmentado-accion');
  $segmentado.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-accion]');
    if (!btn) return;
    accion = btn.dataset.accion;
    $segmentado.querySelectorAll('button').forEach((b) => b.classList.toggle('activo', b === btn));
  });

  const $lista = seccion.querySelector('#lista-materiales');
  const $siguiente = seccion.querySelector('#paso2-siguiente');
  const $inputManual = seccion.querySelector('#input-manual');

  function pintarLista() {
    const materiales = ctx.getOrden().materiales;
    $siguiente.disabled = materiales.length === 0;
    if (!materiales.length) {
      $lista.innerHTML = '<p class="vacio">Todavía no escaneas ningún equipo.</p>';
      return;
    }
    $lista.innerHTML = '';
    for (const m of materiales) {
      const fila = el(`
        <div class="item-material">
          <span class="item-material-info">
            <span class="item-material-serie">${escapeHtml(m.numero_serie)}</span><br>
            <span class="item-material-meta">
              ${m.accion === 'instalado' ? 'Instalado' : 'Retirado'}
              ${m.ingresado_manual ? '· <span class="pill pill--manual">Manual</span>' : ''}
            </span>
          </span>
          <button type="button" class="btn-icono" aria-label="Quitar">✕</button>
        </div>
      `);
      fila.querySelector('.btn-icono').addEventListener('click', () => quitarMaterial(m));
      $lista.appendChild(fila);
    }
  }

  async function agregarSerie(numeroSerie, accionElegida, ingresadoManual) {
    numeroSerie = numeroSerie.trim();
    if (!numeroSerie) return;

    const yaEscaneado = ctx.getOrden().materiales.some((m) => m.numero_serie === numeroSerie && m.accion === accionElegida);
    if (yaEscaneado) {
      toast('Este equipo ya fue escaneado en esta orden.', 'malo');
      return;
    }

    if (!hayConexion()) {
      if (accionElegida === 'retirado') {
        toast('Sin conexión: un retiro necesita confirmarse contra el servidor. Reintenta cuando tengas señal.', 'malo');
        return;
      }
      const maleta = getMaleta();
      const equipoCacheado = maleta?.equipos.find((eq) => eq.numero_serie === numeroSerie);
      if (!equipoCacheado) {
        toast('Sin conexión: esta serie no aparece en tu maleta guardada. Revisa cuando tengas señal.', 'malo');
        return;
      }
      await encolarInstaladoOffline(equipoCacheado, ingresadoManual);
      return;
    }

    const cuerpo = { numero_serie: numeroSerie, accion: accionElegida, ingresado_manual: ingresadoManual };
    try {
      const nuevaOrden = await api(`/ordenes/${encodeURIComponent(ctx.uuid)}/materiales`, { method: 'POST', body: cuerpo });
      ctx.setOrden(nuevaOrden);
      pintarLista();
      toast(`${numeroSerie} agregado.`, 'ok');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'sin_conexion' && accionElegida === 'instalado') {
        // El fetch en sí falló recién ahora (navigator.onLine mentía) —
        // mismo camino que si lo hubiéramos detectado antes de intentar.
        const maleta = getMaleta();
        const equipoCacheado = maleta?.equipos.find((eq) => eq.numero_serie === numeroSerie);
        if (equipoCacheado) {
          await encolarInstaladoOffline(equipoCacheado, ingresadoManual);
          return;
        }
      }
      toast(e.message, 'malo');
    }
  }

  async function encolarInstaladoOffline(equipoCacheado, ingresadoManual) {
    const cuerpo = { numero_serie: equipoCacheado.numero_serie, accion: 'instalado', ingresado_manual: ingresadoManual };
    try {
      await encolar('material', ctx.uuid, cuerpo);
    } catch {
      toast('No se pudo guardar sin conexión en este dispositivo.', 'malo');
      return;
    }
    const ordenActual = ctx.getOrden();
    ctx.setOrden({
      ...ordenActual,
      materiales: [...ordenActual.materiales, {
        equipo_id: equipoCacheado.id,
        numero_serie: equipoCacheado.numero_serie,
        accion: 'instalado',
        ingresado_manual: ingresadoManual ? 1 : 0,
      }],
    });
    pintarLista();
    toast(`${equipoCacheado.numero_serie} guardado sin conexión — se enviará al recuperar señal.`, 'neutro');
  }

  async function quitarMaterial(material) {
    // Si este material todavía no se mandó (se agregó offline y sigue en la
    // cola), quitarlo es solo desencolarlo — no hay nada que borrar en un
    // servidor que ni sabe que existe.
    const desencolado = await desencolarMaterial(ctx.uuid, material.numero_serie, material.accion).catch(() => false);
    if (desencolado) {
      const ordenActual = ctx.getOrden();
      ctx.setOrden({
        ...ordenActual,
        materiales: ordenActual.materiales.filter((m) => !(m.numero_serie === material.numero_serie && m.accion === material.accion)),
      });
      pintarLista();
      return;
    }

    try {
      const nuevaOrden = await api(
        `/ordenes/${encodeURIComponent(ctx.uuid)}/materiales/${material.equipo_id}?accion=${material.accion}`,
        { method: 'DELETE' }
      );
      ctx.setOrden(nuevaOrden);
      pintarLista();
    } catch (e) {
      toast(e.message, 'malo');
    }
  }

  seccion.querySelector('#btn-escanear').addEventListener('click', async () => {
    const resultado = await abrirScanner();
    if (resultado) {
      await agregarSerie(resultado.serie, accion, resultado.manual);
    }
  });

  seccion.querySelector('#btn-agregar-manual').addEventListener('click', async () => {
    await agregarSerie($inputManual.value, accion, true);
    $inputManual.value = '';
  });
  $inputManual.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') seccion.querySelector('#btn-agregar-manual').click();
  });

  $siguiente.addEventListener('click', () => ctx.irPaso(3));

  pintarLista();
}
