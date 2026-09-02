// Paso 3 — evidencia fotográfica. Puede (y debe) subir fotos con la orden
// todavía en 'borrador' — no espera al envío final del paso 5 (ver
// wizard-api.md). Slots fijos para instalación/soporte, dinámicos (uno por
// equipo retirado) para retiro — lo decide tipos_servicio.fotos_dinamicas.
import { api, ApiError } from '../../api.js';
import { el, escapeHtml } from '../../utils.js';
import { toast } from '../../toast.js';
import { comprimirImagen } from '../../compress.js';
import { obtenerUbicacion, fechaHoraSql } from '../../geo.js';
import { encolar } from '../../offline.js';

export async function renderPaso3(container, ctx) {
  const tipoServicio = ctx.getTipoServicio();
  if (!tipoServicio) {
    container.appendChild(el(`
      <section class="wizard-paso">
        <p class="vacio vacio--error">No se pudo determinar el tipo de servicio de esta orden (sin conexión y sin caché guardada). Revisa tu señal.</p>
        <button type="button" class="btn btn--secundario" id="paso3-reintentar">Reintentar</button>
      </section>
    `));
    container.querySelector('#paso3-reintentar').addEventListener('click', () => renderPaso3(container, ctx));
    return;
  }

  const esDinamico = Number(tipoServicio.fotos_dinamicas) === 1;

  function calcularSlots() {
    const orden = ctx.getOrden();
    if (esDinamico) {
      return orden.materiales
        .filter((m) => m.accion === 'retirado')
        .map((m) => ({ tipo: 'equipo_retirado', equipoId: m.equipo_id, etiqueta: m.numero_serie, obligatoria: true }));
    }
    return (tipoServicio.requisitos_foto || [])
      .slice()
      .sort((a, b) => a.orden_visualizacion - b.orden_visualizacion)
      .map((r) => ({ tipo: r.codigo, equipoId: null, etiqueta: r.etiqueta, obligatoria: Number(r.obligatoria) === 1 }));
  }

  const seccion = el(`
    <div style="display: contents;">
    <section class="wizard-paso">
      <h2>Fotos</h2>
      <p class="wizard-paso-intro">${esDinamico ? 'Una foto por cada equipo retirado.' : 'Las marcadas con * son obligatorias.'}</p>
      <div class="grid-fotos" id="grid-fotos"></div>
      <button type="button" class="btn btn--secundario btn--ancho" id="btn-foto-adicional">+ Agregar foto adicional</button>
    </section>
    <div class="wizard-acciones">
      <button type="button" class="btn btn--secundario" id="paso3-atras">Atrás</button>
      <button type="button" class="btn btn--primario btn--ancho" id="paso3-siguiente">Siguiente</button>
    </div>
    </div>
  `);
  container.appendChild(seccion);

  const $grid = seccion.querySelector('#grid-fotos');
  const $siguiente = seccion.querySelector('#paso3-siguiente');

  function fotoDeSlot(slot) {
    return ctx.getOrden().fotos.find((f) => f.tipo === slot.tipo && (f.equipo_id ?? null) === (slot.equipoId ?? null)) || null;
  }

  function todoListo() {
    return calcularSlots().filter((s) => s.obligatoria).every((s) => fotoDeSlot(s));
  }

  function pintarFoto(foto, etiqueta) {
    if (!foto) return `<span class="slot-icono">📷</span>`;
    if (foto._local) return `<span class="slot-icono">⏳</span>`;
    return `<img src="/api/fotos/${foto.id}" alt="">`;
  }

  function pintar() {
    $grid.innerHTML = '';
    for (const slot of calcularSlots()) {
      const foto = fotoDeSlot(slot);
      const nodo = el(`
        <label class="slot-foto ${foto ? 'tiene-foto' : ''} ${slot.obligatoria ? 'obligatoria' : ''}">
          ${pintarFoto(foto)}
          <span class="slot-etiqueta">${escapeHtml(slot.etiqueta)}${foto?._local ? ' (sin conexión)' : ''}</span>
          ${foto ? '<span class="slot-cambiar">Cambiar</span>' : ''}
          <input type="file" accept="image/*" capture="environment">
        </label>
      `);
      nodo.querySelector('input').addEventListener('change', (ev) => subirFoto(slot, ev.target.files[0], nodo));
      $grid.appendChild(nodo);
    }

    // 'adicional' nunca es un slot fijo obligatorio — se listan solo para verlas, se agregan más abajo.
    for (const foto of ctx.getOrden().fotos.filter((f) => f.tipo === 'adicional')) {
      $grid.appendChild(el(`
        <div class="slot-foto tiene-foto">
          ${pintarFoto(foto)}
          <span class="slot-etiqueta">Adicional${foto._local ? ' (sin conexión)' : ''}</span>
        </div>
      `));
    }

    $siguiente.disabled = !todoListo();
  }

  async function subirFoto(slot, archivo, nodo) {
    if (!archivo) return;
    const spinner = el('<div class="slot-spinner">Comprimiendo…</div>');
    nodo.appendChild(spinner);

    // Declarados afuera del try: si el paso que falla es el envío (no la
    // compresión), encolarFotoOffline() reutiliza lo que ya se comprimió en
    // vez de repetir el trabajo.
    let comprimida = null;
    let campos = null;
    try {
      comprimida = await comprimirImagen(archivo);
      spinner.textContent = 'Subiendo…';
      const ubicacion = await obtenerUbicacion();

      campos = {
        tipo: slot.tipo,
        equipo_id: slot.equipoId !== null ? slot.equipoId : undefined,
        latitud: ubicacion ? ubicacion.lat : undefined,
        longitud: ubicacion ? ubicacion.lng : undefined,
        tomada_en: fechaHoraSql(),
      };

      const form = new FormData();
      form.append('foto', comprimida, 'foto.jpg');
      for (const [clave, valor] of Object.entries(campos)) {
        if (valor !== undefined) form.append(clave, String(valor));
      }

      const resultado = await api(`/ordenes/${encodeURIComponent(ctx.uuid)}/fotos`, { method: 'POST', form });
      ctx.setOrden(resultado.orden);
      pintar();
      toast('Foto subida.', 'ok');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'sin_conexion') {
        await encolarFotoOffline(slot, archivo, comprimida, campos);
        return;
      }
      toast(e.message, 'malo');
      spinner.remove();
    }
  }

  async function encolarFotoOffline(slot, archivoOriginal, comprimidaYaHecha, camposYaHechos) {
    const comprimida = comprimidaYaHecha || await comprimirImagen(archivoOriginal).catch(() => archivoOriginal);
    const campos = camposYaHechos || { tipo: slot.tipo, equipo_id: slot.equipoId !== null ? slot.equipoId : undefined, tomada_en: fechaHoraSql() };
    try {
      await encolar('foto', ctx.uuid, { blob: comprimida, campos });
    } catch {
      toast('No se pudo guardar la foto sin conexión en este dispositivo.', 'malo');
      pintar();
      return;
    }
    const ordenActual = ctx.getOrden();
    const fotosSinEsteSlot = slot.tipo === 'adicional'
      ? ordenActual.fotos
      : ordenActual.fotos.filter((f) => !(f.tipo === slot.tipo && (f.equipo_id ?? null) === (slot.equipoId ?? null)));
    ctx.setOrden({
      ...ordenActual,
      fotos: [...fotosSinEsteSlot, { id: null, tipo: slot.tipo, equipo_id: slot.equipoId, _local: true }],
    });
    pintar();
    toast('Sin conexión — la foto quedó guardada en este celular.', 'neutro');
  }

  seccion.querySelector('#btn-foto-adicional').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.addEventListener('change', () => {
      const archivo = input.files[0];
      if (!archivo) return;
      const marcador = el('<div class="slot-foto"><span class="slot-icono">📷</span><span class="slot-etiqueta">Adicional</span></div>');
      $grid.appendChild(marcador);
      subirFoto({ tipo: 'adicional', equipoId: null }, archivo, marcador);
    });
    input.click();
  });

  seccion.querySelector('#paso3-atras').addEventListener('click', () => ctx.irPaso(2));
  $siguiente.addEventListener('click', () => ctx.irPaso(4));

  pintar();
}
