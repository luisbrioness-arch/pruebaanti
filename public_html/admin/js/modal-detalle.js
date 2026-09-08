import { api } from './api.js';
import {
  escapeHtml, formatMoney, formatDateTime, badge, ESTADO_LABEL,
} from './utils.js';
import { abrirModal } from './modal.js';
import { toast } from './toast.js';

/**
 * Calcula el texto y tono para la fecha solicitada de instalación.
 */
export function etiquetaFecha(fechaStr) {
  if (!fechaStr) return { texto: 'Sin fecha agendada', tono: 'neutro' };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaStr + 'T00:00:00');
  const dias = Math.round((fecha - hoy) / 86400000);
  const fechaFmt = fecha.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (dias < 0) return { texto: `${fechaFmt} — vencida hace ${-dias} día${-dias === 1 ? '' : 's'}`, tono: 'malo' };
  if (dias === 0) return { texto: `${fechaFmt} — ¡Hoy!`, tono: 'alerta' };
  if (dias <= 3) return { texto: `${fechaFmt} — en ${dias} día${dias === 1 ? '' : 's'}`, tono: 'ok' };
  return { texto: fechaFmt, tono: 'neutro' };
}

/**
 * Deduce la cantidad esperada de decodificadores a partir del nombre del plan.
 */
function deducirDecosDePlan(planNombre) {
  if (!planNombre) return 1;
  const match = planNombre.match(/(\d+)\s*deco/i);
  if (match) return parseInt(match[1], 10);
  if (/premium/i.test(planNombre)) return 2;
  return 1;
}

/**
 * Abre el modal integral con detalle de cliente, fechas de venta e instalación,
 * y equipos/decodificadores asignados o instalados en terreno.
 *
 * @param {Object} v Venta (o resumen de venta)
 * @param {Function} [onActualizar] Callback opcional al actualizar/reagendar
 */
export function abrirModalDetalleVenta(v, onActualizar) {
  const { texto: fechaTexto, tono: fechaTono } = etiquetaFecha(v.fecha_instalacion_solicitada);
  const inicial = (v.cliente_nombre || 'C').trim().charAt(0).toUpperCase();
  const telLimpio = (v.cliente_telefono || '').replace(/\D/g, '');
  const direccionCompleta = [v.cliente_direccion, v.comuna].filter(Boolean).join(', ');
  const mapsUrl = direccionCompleta ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccionCompleta)}` : null;

  const { root, cerrar } = abrirModal(`
    <div class="modal-banner-cliente">
      <div class="modal-banner-cliente-info">
        <div class="modal-banner-avatar">${escapeHtml(inicial)}</div>
        <div>
          <div class="modal-banner-nombre">${escapeHtml(v.cliente_nombre || 'Cliente sin nombre')}</div>
          <div class="modal-banner-sub">
            RUT: <strong>${escapeHtml(v.cliente_rut || 'No informado')}</strong> · 📍 ${escapeHtml(v.comuna || 'Sin comuna')}
          </div>
        </div>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
        ${v.cliente_telefono ? `
          <a href="tel:${escapeHtml(v.cliente_telefono)}" class="btn btn--chico btn--secundario" style="color: #0f766e; background: #fff; font-weight: 700; text-decoration: none; border: none; box-shadow: 0 2px 6px rgba(0,0,0,0.15);" title="Llamar al cliente">
            📞 ${escapeHtml(v.cliente_telefono)}
          </a>
          ${telLimpio ? `
            <a href="https://wa.me/${telLimpio.startsWith('56') ? telLimpio : ('56' + telLimpio)}" target="_blank" rel="noopener" class="btn btn--chico" style="background: #22C55E; color: #fff; font-weight: 700; text-decoration: none; border: none; box-shadow: 0 2px 6px rgba(0,0,0,0.15);" title="Contactar por WhatsApp">
              💬 WhatsApp
            </a>
          ` : ''}
        ` : '<span style="font-size: 0.8rem; opacity: 0.8;">Sin teléfono</span>'}
      </div>
    </div>

    <div class="modal-detalle-grid">
      <!-- Tarjeta 1: Registro Comercial y Cliente -->
      <div class="detalle-bloque">
        <div class="detalle-bloque-titulo">
          <span>💼 Registro de Venta y Cliente</span>
          <span class="card-bloque-tag card-bloque-tag--indigo">${escapeHtml(v.plan_nombre || 'Plan Estándar')}</span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Cliente / Titular:</span>
          <span class="detalle-campo-valor">
            <strong>${escapeHtml(v.cliente_nombre || '—')}</strong>
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">RUT Cliente:</span>
          <span class="detalle-campo-valor" style="font-family: var(--fuente-mono, monospace);">
            ${escapeHtml(v.cliente_rut || 'No registrado')}
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Dirección Domicilio:</span>
          <span class="detalle-campo-valor" style="max-width: 65%; line-height: 1.3;">
            ${escapeHtml(v.cliente_direccion || '—')}
            ${mapsUrl ? `
              <br><a href="${mapsUrl}" target="_blank" rel="noopener" style="font-size: 0.76rem; color: #0284C7; text-decoration: none; font-weight: 700;">🗺️ Ver mapa</a>
            ` : ''}
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Comuna:</span>
          <span class="detalle-campo-valor">
            📍 ${escapeHtml(v.comuna || 'Sin comuna')}
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Quién vendió:</span>
          <span class="detalle-campo-valor">
            <span class="usuario-pill" style="font-weight: 700;">${escapeHtml(v.vendedor_nombre || 'TuVes (Venta directa)')}</span>
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">📅 Fecha de Venta:</span>
          <span class="detalle-campo-valor" style="color: var(--tinta); font-weight: 700;">
            ${formatDateTime(v.creado_en)}
          </span>
        </div>

        <div class="detalle-campo-fila" style="align-items: flex-start; padding-top: 8px;">
          <span class="detalle-campo-label" style="padding-top: 2px;">📅 Fecha Solicitada:</span>
          <span class="detalle-campo-valor" style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span id="modal-fecha-chip" class="chip chip--${fechaTono}">${escapeHtml(fechaTexto)}</span>
              <button type="button" class="btn btn--chico btn--secundario" id="btn-toggle-reagendar" style="font-size: 0.74rem; padding: 3px 8px; border-radius: 6px; border-color: var(--acento); color: var(--acento-2); font-weight: 700;" title="Reprogramar visita para otro día">
                📅 Reagendar
              </button>
            </div>
          </span>
        </div>

        <!-- Panel Desplegable para Reagendar la Visita -->
        <div id="caja-reagendar" style="display: none; background: #f0fdfa; border: 1.5px solid #0d9488; border-radius: 10px; padding: 12px; margin-top: 8px; margin-bottom: 8px; box-shadow: 0 4px 12px rgba(13, 148, 136, 0.1);">
          <div style="font-weight: 800; font-size: 0.84rem; color: #0f766e; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <span>📅 Reprogramar Visita en Terreno</span>
          </div>
          <label class="campo" style="margin-bottom: 8px;">
            <span style="font-size: 0.78rem; font-weight: 700; color: #0f766e;">Nueva fecha acordada con cliente:</span>
            <input type="date" id="input-nueva-fecha" value="${v.fecha_instalacion_solicitada || ''}" class="input-fecha-moderno" required style="width: 100%; font-size: 0.9rem; padding: 6px 10px;">
          </label>
          <label class="campo" style="margin-bottom: 10px;">
            <span style="font-size: 0.78rem; font-weight: 700; color: #0f766e;">Motivo de reagendamiento:</span>
            <input type="text" id="input-motivo-reagendar" value="${escapeHtml(v.observacion || '')}" placeholder="Ej: Cliente no estaba en casa, pide para el sábado..." style="width: 100%; font-size: 0.85rem; padding: 6px 10px; border: 1.5px solid var(--borde-fuerte); border-radius: 8px;">
          </label>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <button type="button" class="btn btn--chico btn--secundario" id="btn-cancelar-reagendar">Cancelar</button>
            <button type="button" class="btn btn--chico btn--primario" id="btn-confirmar-reagendar">Guardar nueva fecha</button>
          </div>
        </div>

        <div class="detalle-campo-fila" id="fila-observacion" ${v.observacion ? '' : 'style="display: none;"'}>
          <span class="detalle-campo-label">Nota de visita:</span>
          <span class="detalle-campo-valor" id="valor-observacion" style="color: #b45309; font-size: 0.82rem; max-width: 65%; line-height: 1.25; font-style: italic;">
            ${escapeHtml(v.observacion || '')}
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">N° Venta TuVes / ID:</span>
          <span class="detalle-campo-valor" style="font-family: var(--fuente-mono, monospace);">
            ${escapeHtml(v.numero_venta_tuves || v.numero_orden_tuves || ('#' + v.id))}
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Comisión Vendedor:</span>
          <span class="detalle-campo-valor">
            <span class="badge-monto badge-monto--positivo">${formatMoney(v.monto_vendedor || 0)}</span>
          </span>
        </div>
      </div>

      <!-- Tarjeta 2: Instalación en Terreno y Equipos -->
      <div class="detalle-bloque detalle-bloque--destacado">
        <div class="detalle-bloque-titulo">
          <span>🛠️ Instalación y Equipos</span>
          <span id="modal-orden-estado-tag"><span class="chip chip--alerta">Consultando…</span></span>
        </div>

        <div id="modal-orden-contenido">
          <div class="cargando-bloque" style="padding: 24px 10px;">
            <div class="spinner"></div>
            <p style="font-size: 0.85rem;">Consultando detalles de instalación y equipos…</p>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-acciones" style="margin-top: 18px; display: flex; justify-content: space-between; align-items: center;">
      <button type="button" class="btn btn--texto btn--chico" id="btn-anular-venta" style="color: var(--malo); font-size: 0.82rem;" title="Anular si el cliente desiste definitivamente">
        ✕ Anular esta venta
      </button>
      <button type="button" class="btn btn--primario" id="btn-cerrar-modal">Cerrar</button>
    </div>
  `, { amplio: true });

  root.querySelector('#btn-cerrar-modal').addEventListener('click', cerrar);

  // Toggle para caja de reagendamiento
  const $cajaReagendar = root.querySelector('#caja-reagendar');
  root.querySelector('#btn-toggle-reagendar').addEventListener('click', () => {
    const visible = $cajaReagendar.style.display !== 'none';
    $cajaReagendar.style.display = visible ? 'none' : 'block';
    if (!visible) {
      const $input = root.querySelector('#input-nueva-fecha');
      if ($input) $input.focus();
    }
  });
  root.querySelector('#btn-cancelar-reagendar').addEventListener('click', () => {
    $cajaReagendar.style.display = 'none';
  });

  // Guardar nueva fecha reagendada
  root.querySelector('#btn-confirmar-reagendar').addEventListener('click', async () => {
    const $btnConfirmar = root.querySelector('#btn-confirmar-reagendar');
    const nuevaFecha = root.querySelector('#input-nueva-fecha').value.trim();
    const motivo = root.querySelector('#input-motivo-reagendar').value.trim();

    if (!nuevaFecha) {
      toast('Debes seleccionar una nueva fecha para la visita.', 'alerta');
      return;
    }

    $btnConfirmar.disabled = true;
    $btnConfirmar.textContent = 'Guardando…';

    try {
      await api(`/admin/ventas/${v.id}/reagendar`, {
        method: 'PUT',
        body: {
          fecha_instalacion_solicitada: nuevaFecha,
          observacion: motivo,
        },
      });

      toast(`Visita reprogramada exitosamente para el ${nuevaFecha}.`, 'ok');
      v.fecha_instalacion_solicitada = nuevaFecha;
      v.observacion = motivo;

      const { texto: nTexto, tono: nTono } = etiquetaFecha(nuevaFecha);
      const $chip = root.querySelector('#modal-fecha-chip');
      if ($chip) {
        $chip.className = `chip chip--${nTono}`;
        $chip.textContent = nTexto;
      }

      const $filaObs = root.querySelector('#fila-observacion');
      const $valObs = root.querySelector('#valor-observacion');
      if ($filaObs && $valObs) {
        $valObs.textContent = motivo || '';
        $filaObs.style.display = motivo ? 'flex' : 'none';
      }

      $cajaReagendar.style.display = 'none';
      if (typeof onActualizar === 'function') onActualizar();
    } catch (err) {
      toast(err.message || 'Error al reprogramar visita.', 'malo');
    } finally {
      $btnConfirmar.disabled = false;
      $btnConfirmar.textContent = 'Guardar nueva fecha';
    }
  });

  // Anular venta si el cliente desiste
  root.querySelector('#btn-anular-venta').addEventListener('click', async () => {
    const motivo = prompt('¿Motivo por el cual se anula la venta? (ej: cliente desistió, fuera de cobertura, etc.):');
    if (motivo === null) return;
    try {
      await api(`/admin/ventas/${v.id}/anular`, {
        method: 'PUT',
        body: { motivo: motivo || 'Anulada por cliente' },
      });
      toast('Venta anulada correctamente.', 'ok');
      cerrar();
      if (typeof onActualizar === 'function') onActualizar();
    } catch (err) {
      toast(err.message || 'Error al anular venta.', 'malo');
    }
  });

  // Consulta asíncrona de los detalles técnicos completos
  api(`/admin/ventas/${v.id}`).then((detalle) => {
    const $estadoTag = root.querySelector('#modal-orden-estado-tag');
    const $ordenContenido = root.querySelector('#modal-orden-contenido');
    if (!$ordenContenido) return; // Modal cerrado

    const orden = detalle.orden;
    const esInstalada = v.estado === 'instalada' || (orden && ['aprobada', 'liquidada'].includes(orden.estado));
    const cantidadDecos = deducirDecosDePlan(v.plan_nombre);

    if (!orden) {
      if (esInstalada) {
        // Venta marcada instalada pero sin registro directo de orden en DB
        if ($estadoTag) $estadoTag.innerHTML = badge('instalada');
        $ordenContenido.innerHTML = `
          <div class="detalle-campo-fila">
            <span class="detalle-campo-label">📅 Fecha de Instalación:</span>
            <span class="detalle-campo-valor" style="color: #047857; font-weight: 700;">
              ${formatDateTime(v.actualizado_en || v.creado_en)}
            </span>
          </div>
          <div class="detalle-campo-fila">
            <span class="detalle-campo-label">Técnico Instalador:</span>
            <span class="detalle-campo-valor">
              <strong style="color: var(--acento-2);">${escapeHtml(v.vendedor_nombre || 'Técnico Autorizado')}</strong>
            </span>
          </div>
          <div class="detalle-campo-fila">
            <span class="detalle-campo-label">Estado de Ejecución:</span>
            <span class="detalle-campo-valor">
              <span class="chip chip--ok">Completada y Operativa</span>
            </span>
          </div>
          <div style="margin-top: 14px;">
            <span class="detalle-campo-label" style="display: block; margin-bottom: 6px; font-weight: 700;">📺 Equipos Entregados e Instalados:</span>
            <div class="lista-equipos-instalados">
              ${Array.from({ length: cantidadDecos }).map((_, i) => `
                <div class="item-equipo-instalado">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 1.2rem;">📺</span>
                    <div>
                      <strong>Decodificador HD TuVes #${i + 1}</strong>
                      <div style="font-family: var(--fuente-mono, monospace); font-size: 0.78rem; color: var(--tinta-2);">
                        Tarjeta TuVes + Antena DTH
                      </div>
                    </div>
                  </div>
                  <span class="chip chip--ok" style="font-size: 0.72rem;">Instalado conforme</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      } else {
        // Venta en espera de instalación técnica
        if ($estadoTag) $estadoTag.innerHTML = '<span class="chip chip--alerta">Pendiente Terreno</span>';
        $ordenContenido.innerHTML = `
          <div class="aviso-orden-pendiente">
            <div class="aviso-orden-pendiente-icono">⏳</div>
            <div class="aviso-orden-pendiente-titulo">Pendiente de visita técnica en terreno</div>
            <div class="aviso-orden-pendiente-desc">
              Esta suscripción comercial fue registrada y está agendada para el <strong>${escapeHtml(v.fecha_instalacion_solicitada || 'próximo turno')}</strong>.
              El instalador escaneará los números de serie de los decodificadores desde su app móvil al momento de concluir la visita.
            </div>
          </div>
          <div style="margin-top: 14px;">
            <span class="detalle-campo-label" style="display: block; margin-bottom: 6px; font-weight: 700;">📺 Equipos requeridos por plan contratado:</span>
            <div class="lista-equipos-instalados">
              <div class="item-equipo-instalado">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 1.2rem;">📦</span>
                  <div>
                    <strong>${cantidadDecos} Decodificador(es) HD + Tarjeta(s) Smartcard</strong>
                    <div style="font-size: 0.78rem; color: var(--tinta-3);">
                      Plan: ${escapeHtml(v.plan_nombre || 'Estándar')}
                    </div>
                  </div>
                </div>
                <span class="chip chip--alerta" style="font-size: 0.72rem;">Por asignar en terreno</span>
              </div>
            </div>
          </div>
        `;
      }
      return;
    }

    // Si existe orden técnica vinculada en terreno:
    if ($estadoTag) $estadoTag.innerHTML = badge(orden.estado);

    const tieneMateriales = orden.materiales && orden.materiales.length > 0;
    const tieneFotos = orden.fotos && orden.fotos.length > 0;
    const tieneFerreteria = orden.ferreteria && orden.ferreteria.length > 0;
    const fechaInstalacionReal = formatDateTime(orden.fecha_trabajo_dispositivo || orden.creado_en);

    $ordenContenido.innerHTML = `
      <div class="detalle-campo-fila">
        <span class="detalle-campo-label">Folio OT:</span>
        <span class="detalle-campo-valor" style="font-weight: 800; font-family: var(--fuente-mono, monospace);">
          ${escapeHtml(orden.folio || ('#' + orden.id))}
        </span>
      </div>

      <div class="detalle-campo-fila">
        <span class="detalle-campo-label">Técnico Instalador:</span>
        <span class="detalle-campo-valor">
          <strong style="color: var(--acento-2);">${escapeHtml(orden.tecnico_nombre || 'No asignado')}</strong>
        </span>
      </div>

      <div class="detalle-campo-fila">
        <span class="detalle-campo-label">📅 Fecha de Instalación:</span>
        <span class="detalle-campo-valor" style="color: #047857; font-weight: 700;">
          ${fechaInstalacionReal}
        </span>
      </div>

      <div class="detalle-campo-fila">
        <span class="detalle-campo-label">Tipo de Servicio:</span>
        <span class="detalle-campo-valor">
          ${escapeHtml(orden.tipo_servicio_nombre || 'Instalación Nueva')}
        </span>
      </div>

      <div class="detalle-campo-fila">
        <span class="detalle-campo-label">Monto Técnico Servicio:</span>
        <span class="detalle-campo-valor">
          <span class="badge-monto badge-monto--positivo">${formatMoney(orden.monto_tecnico || 0)}</span>
        </span>
      </div>

      <!-- Equipos y Decodificadores -->
      <div style="margin-top: 14px;">
        <span class="detalle-campo-label" style="display: block; margin-bottom: 6px; font-weight: 700;">
          📺 Equipos y Decodificadores (${tieneMateriales ? orden.materiales.length : cantidadDecos}):
        </span>
        <div class="lista-equipos-instalados">
          ${tieneMateriales ? orden.materiales.map(m => `
            <div class="item-equipo-instalado">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.2rem;">📺</span>
                <div>
                  <strong>${escapeHtml(m.tipo_equipo_nombre || 'Decodificador HD')}</strong>
                  <div style="font-family: var(--fuente-mono, monospace); font-size: 0.78rem; color: #1E293B; font-weight: 700;">
                    Serie: ${escapeHtml(m.numero_serie || '—')}
                  </div>
                </div>
              </div>
              <span class="chip chip--${m.accion === 'instalado' ? 'ok' : 'alerta'}" style="font-size: 0.72rem;">
                ${escapeHtml(m.accion || 'instalado')}
              </span>
            </div>
          `).join('') : `
            ${Array.from({ length: cantidadDecos }).map((_, i) => `
              <div class="item-equipo-instalado">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 1.2rem;">📺</span>
                  <div>
                    <strong>Decodificador HD TuVes #${i + 1}</strong>
                    <div style="font-size: 0.78rem; color: var(--tinta-2);">
                      Conforme al plan: ${escapeHtml(v.plan_nombre || 'Estándar')}
                    </div>
                  </div>
                </div>
                <span class="chip chip--ok" style="font-size: 0.72rem;">Instalado</span>
              </div>
            `).join('')}
          `}
        </div>
      </div>

      <!-- Ferretería e Insumos consumidos -->
      ${tieneFerreteria ? `
        <div style="margin-top: 12px;">
          <span class="detalle-campo-label" style="display: block; margin-bottom: 4px; font-weight: 700;">🔩 Insumos y Ferretería:</span>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${orden.ferreteria.map(f => `
              <span class="chip chip--neutro" style="font-size: 0.76rem;">
                ${escapeHtml(f.nombre)}: <strong>${escapeHtml(f.cantidad)} ${escapeHtml(f.unidad_medida)}</strong>
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Parámetros de Señal -->
      ${(orden.senal_porcentaje || orden.calidad_porcentaje) ? `
        <div style="margin-top: 12px; background: #f8fafc; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--borde);">
          <div style="font-size: 0.78rem; font-weight: 700; color: var(--tinta-2); margin-bottom: 4px;">📶 Parámetros de Antena DTH:</div>
          <div style="display: flex; gap: 14px; font-size: 0.8rem;">
            <span>Señal: <strong>${orden.senal_porcentaje || '—'}%</strong></span>
            <span>Calidad: <strong>${orden.calidad_porcentaje || '—'}%</strong></span>
            ${orden.satelite ? `<span>Satélite: <strong>${escapeHtml(orden.satelite)}</strong></span>` : ''}
            ${orden.metros_cable ? `<span>Cable: <strong>${orden.metros_cable}m</strong></span>` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Galería de fotos -->
      ${tieneFotos ? `
        <div style="margin-top: 12px;">
          <span class="detalle-campo-label" style="display: block; margin-bottom: 4px; font-weight: 700;">📸 Fotos de Terreno:</span>
          <div class="galeria-fotos-orden">
            ${orden.fotos.map(f => {
              const src = f.url || ('/api/fotos/' + f.id);
              return `
                <a href="${src}" target="_blank" rel="noopener" class="galeria-foto-card" title="Ver foto en tamaño original">
                  <img src="${src}" alt="${escapeHtml(f.tipo_foto || f.tipo || 'Foto OT')}" loading="lazy">
                  <span class="galeria-foto-etiqueta">${escapeHtml(f.tipo_foto || (f.tipo || 'Evidencia').replace(/_/g, ' '))}</span>
                </a>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Nota de Cierre del Servicio Técnico -->
      <div class="bloque-nota-cierre" style="margin-top: 14px; background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 1.1rem;">📝</span>
            <strong style="font-size: 0.88rem; color: #1e293b;">Nota de Cierre / Diagnóstico Técnico:</strong>
          </div>
          <button type="button" class="btn btn--chico btn--secundario" id="btn-toggle-editar-nota-venta" style="padding: 2px 10px; font-size: 0.75rem; font-weight: 600;">
            ${orden.observaciones ? '✏️ Editar nota' : '+ Agregar nota de cierre'}
          </button>
        </div>

        <div id="vista-nota-cierre-venta">
          ${orden.observaciones ? `
            <div style="background: #ffffff; border-left: 4px solid #10b981; padding: 10px 12px; border-radius: 6px; font-size: 0.84rem; color: #1e293b; line-height: 1.45; box-shadow: 0 1px 3px rgba(0,0,0,0.05); word-break: break-word;">
              <div style="font-size: 0.72rem; color: #047857; font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
                <span>✅</span> <span>DIAGNÓSTICO Y TRABAJO REALIZADO:</span>
              </div>
              <div style="white-space: pre-wrap;">${escapeHtml(orden.observaciones)}</div>
            </div>
          ` : `
            <div style="background: #fffbeb; border: 1px dashed #f59e0b; border-radius: 6px; padding: 10px 12px; font-size: 0.82rem; color: #92400e; line-height: 1.4;">
              <span>⚠️ <strong>Sin nota de cierre registrada.</strong> Presiona <strong>+ Agregar nota de cierre</strong> para registrarla.</span>
            </div>
          `}
        </div>

        <div id="form-edicion-nota-venta" hidden style="margin-top: 8px;">
          <textarea id="input-nota-cierre-venta" class="input" rows="3" style="width: 100%; font-size: 0.84rem; padding: 8px 10px; border: 1.5px solid #0284c7; border-radius: 6px; resize: vertical; box-sizing: border-box; line-height: 1.4;" placeholder="Escribe el diagnóstico técnico, problemas o trabajo realizado...">${escapeHtml(orden.observaciones || '')}</textarea>
          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px;">
            <button type="button" class="btn btn--chico btn--secundario" id="btn-cancelar-edicion-nota-venta">Cancelar</button>
            <button type="button" class="btn btn--chico btn--primario" id="btn-guardar-nota-cierre-venta">Guardar Nota de Cierre</button>
          </div>
        </div>
      </div>
    `;

    // Conectar eventos para nota de cierre en modal de venta
    const $btnToggleVenta = $ordenContenido.querySelector('#btn-toggle-editar-nota-venta');
    const $vistaNotaVenta = $ordenContenido.querySelector('#vista-nota-cierre-venta');
    const $formNotaVenta = $ordenContenido.querySelector('#form-edicion-nota-venta');
    const $inputNotaVenta = $ordenContenido.querySelector('#input-nota-cierre-venta');
    const $btnCancelarVenta = $ordenContenido.querySelector('#btn-cancelar-edicion-nota-venta');
    const $btnGuardarVenta = $ordenContenido.querySelector('#btn-guardar-nota-cierre-venta');

    function refrescarVistaNotaVenta(texto) {
      if (texto) {
        $vistaNotaVenta.innerHTML = `
          <div style="background: #ffffff; border-left: 4px solid #10b981; padding: 10px 12px; border-radius: 6px; font-size: 0.84rem; color: #1e293b; line-height: 1.45; box-shadow: 0 1px 3px rgba(0,0,0,0.05); word-break: break-word;">
            <div style="font-size: 0.72rem; color: #047857; font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
              <span>✅</span> <span>DIAGNÓSTICO Y TRABAJO REALIZADO:</span>
            </div>
            <div style="white-space: pre-wrap;">${escapeHtml(texto)}</div>
          </div>
        `;
        $btnToggleVenta.textContent = '✏️ Editar nota';
      } else {
        $vistaNotaVenta.innerHTML = `
          <div style="background: #fffbeb; border: 1px dashed #f59e0b; border-radius: 6px; padding: 10px 12px; font-size: 0.82rem; color: #92400e; line-height: 1.4;">
            <span>⚠️ <strong>Sin nota de cierre registrada.</strong> Presiona <strong>+ Agregar nota de cierre</strong> para registrarla.</span>
          </div>
        `;
        $btnToggleVenta.textContent = '+ Agregar nota de cierre';
      }
    }

    $btnToggleVenta?.addEventListener('click', () => {
      const abrir = $formNotaVenta.hidden;
      $formNotaVenta.hidden = !abrir;
      $vistaNotaVenta.hidden = abrir;
      if (abrir) {
        $inputNotaVenta.value = orden.observaciones || '';
        $inputNotaVenta.focus();
      }
    });

    $btnCancelarVenta?.addEventListener('click', () => {
      $formNotaVenta.hidden = true;
      $vistaNotaVenta.hidden = false;
      $inputNotaVenta.value = orden.observaciones || '';
    });

    $btnGuardarVenta?.addEventListener('click', async () => {
      const nuevaNota = $inputNotaVenta.value.trim();
      $btnGuardarVenta.disabled = true;
      $btnGuardarVenta.textContent = 'Guardando…';
      try {
        await api(`/admin/ordenes/${orden.id}/nota-cierre`, {
          method: 'PUT',
          body: { observaciones: nuevaNota }
        });
        orden.observaciones = nuevaNota;
        refrescarVistaNotaVenta(nuevaNota);
        $formNotaVenta.hidden = true;
        $vistaNotaVenta.hidden = false;
        toast('Nota de cierre guardada con éxito.', 'ok');
        if (typeof onActualizar === 'function') {
          onActualizar();
        }
      } catch (err) {
        toast('Error al guardar la nota: ' + err.message, 'error');
      } finally {
        $btnGuardarVenta.disabled = false;
        $btnGuardarVenta.textContent = 'Guardar Nota de Cierre';
      }
    });
  }).catch((err) => {
    const $ordenContenido = root.querySelector('#modal-orden-contenido');
    if ($ordenContenido) {
      $ordenContenido.innerHTML = `
        <div class="callout-aviso callout-aviso--error" style="margin-top: 10px;">
          <div class="callout-texto">No se pudieron cargar los detalles técnicos: ${escapeHtml(err.message)}</div>
        </div>
      `;
    }
  });
}

/**
 * Abre el modal detallado cuando se presiona directamente una orden de trabajo.
 *
 * @param {Object} o Resumen de la orden de trabajo
 * @param {Function} [onActualizar] Callback opcional
 */
export async function abrirModalDetalleOrden(o, onActualizar) {
  const folioTxt = o.folio || ('#' + o.id);
  const clienteNom = o.venta_cliente_nombre || o.cliente_nombre || 'Cliente OT';
  const clienteTel = o.venta_cliente_telefono || o.cliente_telefono || '';
  const comuna = o.venta_comuna || o.comuna || 'Sin comuna';
  const direccion = o.venta_cliente_direccion || o.cliente_direccion || '—';
  const telLimpio = clienteTel.replace(/\D/g, '');
  const direccionCompleta = [direccion, comuna].filter(Boolean).join(', ');
  const mapsUrl = direccionCompleta ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccionCompleta)}` : null;
  const inicial = clienteNom.trim().charAt(0).toUpperCase();

  const { root, cerrar } = abrirModal(`
    <div class="modal-banner-cliente">
      <div class="modal-banner-cliente-info">
        <div class="modal-banner-avatar">${escapeHtml(inicial)}</div>
        <div>
          <div class="modal-banner-nombre">${escapeHtml(clienteNom)}</div>
          <div class="modal-banner-sub">
            Folio OT: <strong>${escapeHtml(folioTxt)}</strong> · 📍 ${escapeHtml(comuna)}
          </div>
        </div>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
        ${clienteTel ? `
          <a href="tel:${escapeHtml(clienteTel)}" class="btn btn--chico btn--secundario" style="color: #0f766e; background: #fff; font-weight: 700; text-decoration: none; border: none; box-shadow: 0 2px 6px rgba(0,0,0,0.15);" title="Llamar al cliente">
            📞 ${escapeHtml(clienteTel)}
          </a>
          ${telLimpio ? `
            <a href="https://wa.me/${telLimpio.startsWith('56') ? telLimpio : ('56' + telLimpio)}" target="_blank" rel="noopener" class="btn btn--chico" style="background: #22C55E; color: #fff; font-weight: 700; text-decoration: none; border: none; box-shadow: 0 2px 6px rgba(0,0,0,0.15);" title="Contactar por WhatsApp">
              💬 WhatsApp
            </a>
          ` : ''}
        ` : '<span style="font-size: 0.8rem; opacity: 0.8;">Sin teléfono</span>'}
      </div>
    </div>

    <div class="modal-detalle-grid">
      <!-- Columna 1: Datos de la Intervención y Cliente -->
      <div class="detalle-bloque">
        <div class="detalle-bloque-titulo">
          <span>📋 Ficha de Servicio y Cliente</span>
          <span class="card-bloque-tag card-bloque-tag--amber">${escapeHtml(o.tipo_servicio_nombre || 'Servicio DTH')}</span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Cliente / Titular:</span>
          <span class="detalle-campo-valor">
            <strong>${escapeHtml(clienteNom)}</strong>
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Dirección Domicilio:</span>
          <span class="detalle-campo-valor" style="max-width: 65%; line-height: 1.3;">
            ${escapeHtml(direccion)}
            ${mapsUrl ? `
              <br><a href="${mapsUrl}" target="_blank" rel="noopener" style="font-size: 0.76rem; color: #0284C7; text-decoration: none; font-weight: 700;">🗺️ Ver mapa</a>
            ` : ''}
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Comuna:</span>
          <span class="detalle-campo-valor">
            📍 ${escapeHtml(comuna)}
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Técnico Ejecutor:</span>
          <span class="detalle-campo-valor">
            <strong style="color: var(--acento-2);">${escapeHtml(o.tecnico_nombre || 'No asignado')}</strong>
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">📅 Fecha Trabajo / Instalación:</span>
          <span class="detalle-campo-valor" style="color: #047857; font-weight: 700;">
            ${formatDateTime(o.fecha_trabajo_dispositivo || o.creado_en)}
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">📅 Fecha de Ingreso:</span>
          <span class="detalle-campo-valor" style="color: var(--tinta-2);">
            ${formatDateTime(o.creado_en)}
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Folio de Orden:</span>
          <span class="detalle-campo-valor" style="font-family: var(--fuente-mono, monospace); font-weight: 800;">
            ${escapeHtml(folioTxt)}
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Monto Técnico:</span>
          <span class="detalle-campo-valor">
            <span class="badge-monto badge-monto--positivo">${formatMoney(o.monto_tecnico || 0)}</span>
          </span>
        </div>

        <div class="detalle-campo-fila">
          <span class="detalle-campo-label">Estado de la Orden:</span>
          <span class="detalle-campo-valor">
            ${badge(o.estado)}
          </span>
        </div>
      </div>

      <!-- Columna 2: Equipos e Insumos en Terreno -->
      <div class="detalle-bloque detalle-bloque--destacado">
        <div class="detalle-bloque-titulo">
          <span>📺 Equipos y Evidencia de Terreno</span>
          <span>${badge(o.estado)}</span>
        </div>

        <div id="modal-orden-equipos-contenido">
          <div class="cargando-bloque" style="padding: 24px 10px;">
            <div class="spinner"></div>
            <p style="font-size: 0.85rem;">Consultando equipos y materiales…</p>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-acciones" style="margin-top: 18px; display: flex; justify-content: flex-end;">
      <button type="button" class="btn btn--primario" id="btn-cerrar-modal">Cerrar</button>
    </div>
  `, { amplio: true });

  root.querySelector('#btn-cerrar-modal').addEventListener('click', cerrar);

  // Consulta asíncrona de los equipos exactos de la orden
  try {
    const ordenDetalle = await api(`/admin/ordenes/${o.id}`);
    const $equiposContenido = root.querySelector('#modal-orden-equipos-contenido');
    if (!$equiposContenido) return;

    const materiales = ordenDetalle.materiales || [];
    const ferreteria = ordenDetalle.ferreteria || [];
    const fotos = ordenDetalle.fotos || [];

    $equiposContenido.innerHTML = `
      <!-- Lista de Equipos Serializados -->
      <div>
        <span class="detalle-campo-label" style="display: block; margin-bottom: 6px; font-weight: 700;">
          📺 Equipos y Decodificadores (${materiales.length}):
        </span>
        <div class="lista-equipos-instalados">
          ${materiales.length ? materiales.map(m => `
            <div class="item-equipo-instalado">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.2rem;">📺</span>
                <div>
                  <strong>${escapeHtml(m.tipo_equipo_nombre || 'Decodificador')}</strong>
                  <div style="font-family: var(--fuente-mono, monospace); font-size: 0.78rem; color: #1E293B; font-weight: 700;">
                    Serie: ${escapeHtml(m.numero_serie || '—')}
                  </div>
                </div>
              </div>
              <span class="chip chip--${m.accion === 'instalado' ? 'ok' : 'alerta'}" style="font-size: 0.72rem;">
                ${escapeHtml(m.accion || 'instalado')}
              </span>
            </div>
          `).join('') : `
            <div class="vacio-tarjeta vacio-tarjeta--compacta" style="margin: 0; padding: 12px;">
              <p class="vacio-desc" style="margin: 0;">No se registraron números de serie en esta intervención.</p>
            </div>
          `}
        </div>
      </div>

      <!-- Ferretería e Insumos -->
      ${ferreteria.length ? `
        <div style="margin-top: 12px;">
          <span class="detalle-campo-label" style="display: block; margin-bottom: 4px; font-weight: 700;">🔩 Insumos y Ferretería:</span>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${ferreteria.map(f => `
              <span class="chip chip--neutro" style="font-size: 0.76rem;">
                ${escapeHtml(f.nombre)}: <strong>${escapeHtml(f.cantidad)} ${escapeHtml(f.unidad_medida)}</strong>
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Parámetros técnicos -->
      ${(ordenDetalle.senal_porcentaje || ordenDetalle.calidad_porcentaje) ? `
        <div style="margin-top: 12px; background: #f8fafc; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--borde);">
          <div style="font-size: 0.78rem; font-weight: 700; color: var(--tinta-2); margin-bottom: 4px;">📶 Parámetros de Antena DTH:</div>
          <div style="display: flex; gap: 14px; font-size: 0.8rem;">
            <span>Señal: <strong>${ordenDetalle.senal_porcentaje || '—'}%</strong></span>
            <span>Calidad: <strong>${ordenDetalle.calidad_porcentaje || '—'}%</strong></span>
            ${ordenDetalle.satelite ? `<span>Satélite: <strong>${escapeHtml(ordenDetalle.satelite)}</strong></span>` : ''}
            ${ordenDetalle.metros_cable ? `<span>Cable: <strong>${ordenDetalle.metros_cable}m</strong></span>` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Galería de fotos -->
      ${fotos.length ? `
        <div style="margin-top: 12px;">
          <span class="detalle-campo-label" style="display: block; margin-bottom: 4px; font-weight: 700;">📸 Fotos de Terreno:</span>
          <div class="galeria-fotos-orden">
            ${fotos.map(f => {
              const src = f.url || ('/api/fotos/' + f.id);
              return `
                <a href="${src}" target="_blank" rel="noopener" class="galeria-foto-card" title="Ver foto en tamaño original">
                  <img src="${src}" alt="${escapeHtml(f.tipo_foto || f.tipo || 'Foto OT')}" loading="lazy">
                  <span class="galeria-foto-etiqueta">${escapeHtml(f.tipo_foto || (f.tipo || 'Evidencia').replace(/_/g, ' '))}</span>
                </a>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Nota de Cierre / Diagnóstico Técnico -->
      <div class="bloque-nota-cierre" style="margin-top: 14px; background: #f8fafc; border: 1.5px solid ${((ordenDetalle.tipo_servicio_codigo === 'soporte_falla') || (ordenDetalle.tipo_servicio_nombre && ordenDetalle.tipo_servicio_nombre.toLowerCase().includes('soporte')) || (o.tipo_servicio_nombre && o.tipo_servicio_nombre.toLowerCase().includes('soporte'))) ? '#f59e0b' : '#cbd5e1'}; border-radius: 8px; padding: 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 1.1rem;">📝</span>
            <strong style="font-size: 0.88rem; color: #1e293b;">Nota de Cierre / Diagnóstico Técnico:</strong>
            ${((ordenDetalle.tipo_servicio_codigo === 'soporte_falla') || (ordenDetalle.tipo_servicio_nombre && ordenDetalle.tipo_servicio_nombre.toLowerCase().includes('soporte')) || (o.tipo_servicio_nombre && o.tipo_servicio_nombre.toLowerCase().includes('soporte'))) ? '<span class="card-bloque-tag card-bloque-tag--amber" style="font-size: 0.7rem; padding: 2px 6px;">Soporte / Falla</span>' : ''}
          </div>
          <button type="button" class="btn btn--chico btn--secundario" id="btn-toggle-editar-nota" style="padding: 2px 10px; font-size: 0.75rem; font-weight: 600;">
            ${ordenDetalle.observaciones ? '✏️ Editar nota' : '+ Agregar nota de cierre'}
          </button>
        </div>

        <div id="vista-nota-cierre">
          ${ordenDetalle.observaciones ? `
            <div style="background: #ffffff; border-left: 4px solid #10b981; padding: 10px 12px; border-radius: 6px; font-size: 0.84rem; color: #1e293b; line-height: 1.45; box-shadow: 0 1px 3px rgba(0,0,0,0.05); word-break: break-word;">
              <div style="font-size: 0.72rem; color: #047857; font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
                <span>✅</span> <span>DIAGNÓSTICO Y SOLUCIÓN EN TERRENO:</span>
              </div>
              <div style="white-space: pre-wrap;">${escapeHtml(ordenDetalle.observaciones)}</div>
            </div>
          ` : `
            <div style="background: #fffbeb; border: 1px dashed #f59e0b; border-radius: 6px; padding: 10px 12px; font-size: 0.82rem; color: #92400e; line-height: 1.4;">
              <span>⚠️ <strong>Sin nota de cierre registrada.</strong> ${((ordenDetalle.tipo_servicio_codigo === 'soporte_falla') || (ordenDetalle.tipo_servicio_nombre && ordenDetalle.tipo_servicio_nombre.toLowerCase().includes('soporte')) || (o.tipo_servicio_nombre && o.tipo_servicio_nombre.toLowerCase().includes('soporte'))) ? 'En servicios técnicos de soporte o falla es fundamental registrar el diagnóstico y solución.' : ''} Presiona <strong>+ Agregar nota de cierre</strong> para registrarla.</span>
            </div>
          `}
        </div>

        <div id="form-edicion-nota" hidden style="margin-top: 8px;">
          <textarea id="input-nota-cierre" class="input" rows="3" style="width: 100%; font-size: 0.84rem; padding: 8px 10px; border: 1.5px solid #0284c7; border-radius: 6px; resize: vertical; box-sizing: border-box; line-height: 1.4;" placeholder="Escribe el diagnóstico técnico, causa de la falla y solución ejecutada en terreno...">${escapeHtml(ordenDetalle.observaciones || '')}</textarea>
          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px;">
            <button type="button" class="btn btn--chico btn--secundario" id="btn-cancelar-edicion-nota">Cancelar</button>
            <button type="button" class="btn btn--chico btn--primario" id="btn-guardar-nota-cierre">Guardar Nota de Cierre</button>
          </div>
        </div>
      </div>
    `;

    // Conectar eventos para edición de nota de cierre
    const $btnToggle = $equiposContenido.querySelector('#btn-toggle-editar-nota');
    const $vistaNota = $equiposContenido.querySelector('#vista-nota-cierre');
    const $formNota = $equiposContenido.querySelector('#form-edicion-nota');
    const $inputNota = $equiposContenido.querySelector('#input-nota-cierre');
    const $btnCancelar = $equiposContenido.querySelector('#btn-cancelar-edicion-nota');
    const $btnGuardar = $equiposContenido.querySelector('#btn-guardar-nota-cierre');
    const esSoporteOrden = ((ordenDetalle.tipo_servicio_codigo === 'soporte_falla') || (ordenDetalle.tipo_servicio_nombre && ordenDetalle.tipo_servicio_nombre.toLowerCase().includes('soporte')) || (o.tipo_servicio_nombre && o.tipo_servicio_nombre.toLowerCase().includes('soporte')));

    function refrescarVistaNota(texto) {
      if (texto) {
        $vistaNota.innerHTML = `
          <div style="background: #ffffff; border-left: 4px solid #10b981; padding: 10px 12px; border-radius: 6px; font-size: 0.84rem; color: #1e293b; line-height: 1.45; box-shadow: 0 1px 3px rgba(0,0,0,0.05); word-break: break-word;">
            <div style="font-size: 0.72rem; color: #047857; font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
              <span>✅</span> <span>DIAGNÓSTICO Y SOLUCIÓN EN TERRENO:</span>
            </div>
            <div style="white-space: pre-wrap;">${escapeHtml(texto)}</div>
          </div>
        `;
        $btnToggle.textContent = '✏️ Editar nota';
      } else {
        $vistaNota.innerHTML = `
          <div style="background: #fffbeb; border: 1px dashed #f59e0b; border-radius: 6px; padding: 10px 12px; font-size: 0.82rem; color: #92400e; line-height: 1.4;">
            <span>⚠️ <strong>Sin nota de cierre registrada.</strong> ${esSoporteOrden ? 'En servicios técnicos de soporte o falla es fundamental registrar el diagnóstico y solución.' : ''} Presiona <strong>+ Agregar nota de cierre</strong> para registrarla.</span>
          </div>
        `;
        $btnToggle.textContent = '+ Agregar nota de cierre';
      }
    }

    $btnToggle?.addEventListener('click', () => {
      const abrir = $formNota.hidden;
      $formNota.hidden = !abrir;
      $vistaNota.hidden = abrir;
      if (abrir) {
        $inputNota.value = ordenDetalle.observaciones || '';
        $inputNota.focus();
      }
    });

    $btnCancelar?.addEventListener('click', () => {
      $formNota.hidden = true;
      $vistaNota.hidden = false;
      $inputNota.value = ordenDetalle.observaciones || '';
    });

    $btnGuardar?.addEventListener('click', async () => {
      const nuevaNota = $inputNota.value.trim();
      $btnGuardar.disabled = true;
      $btnGuardar.textContent = 'Guardando…';
      try {
        await api(`/admin/ordenes/${o.id}/nota-cierre`, {
          method: 'PUT',
          body: { observaciones: nuevaNota }
        });
        ordenDetalle.observaciones = nuevaNota;
        o.observaciones = nuevaNota;
        refrescarVistaNota(nuevaNota);
        $formNota.hidden = true;
        $vistaNota.hidden = false;
        toast('Nota de cierre guardada con éxito.', 'ok');
        if (typeof onActualizar === 'function') {
          onActualizar();
        }
      } catch (err) {
        toast('Error al guardar la nota: ' + err.message, 'error');
      } finally {
        $btnGuardar.disabled = false;
        $btnGuardar.textContent = 'Guardar Nota de Cierre';
      }
    });

  } catch (err) {
    const $equiposContenido = root.querySelector('#modal-orden-equipos-contenido');
    if ($equiposContenido) {
      $equiposContenido.innerHTML = `
        <div class="callout-aviso callout-aviso--error" style="margin-top: 10px;">
          <div class="callout-texto">No se pudieron cargar los equipos: ${escapeHtml(err.message)}</div>
        </div>
      `;
    }
  }
}
