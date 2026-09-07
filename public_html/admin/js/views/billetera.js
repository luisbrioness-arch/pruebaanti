import { api } from '../api.js';
import { toast } from '../toast.js';
import { abrirModal } from '../modal.js';
import { conColaSiHaceFalta } from '../offline.js';
import { escapeHtml, formatMoney, formatDateTime, el } from '../utils.js';

const ETIQUETA_MOVIMIENTO = {
  liquidacion: 'Liquidación',
  pago: 'Pago',
  ajuste: 'Ajuste',
};

export async function renderBilletera(container) {
  container.appendChild(el(`
    <div class="vista-contenedor">
      <div class="vista-cabecera">
        <div>
          <h2 class="vista-titulo">Billetera y Liquidaciones</h2>
          <p class="vista-subtitulo">
            Control de saldos por técnico, registro de pagos y seguimiento contable de trabajos pendientes.
          </p>
        </div>
      </div>

      <div class="subtabs-contenedor-tecnicos">
        <div class="subtabs-etiqueta-tecnicos">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span>Técnico:</span>
        </div>
        <nav class="subtabs subtabs--tecnicos" id="subtabs-tecnico"></nav>
      </div>

      <div id="detalle-tecnico"></div>
    </div>
  `));

  const $subtabsTecnico = container.querySelector('#subtabs-tecnico');
  const $detalle = container.querySelector('#detalle-tecnico');

  const { usuarios } = await api('/admin/usuarios');

  for (const u of usuarios) {
    const inicial = (u.nombre || 'T').trim().charAt(0).toUpperCase();
    const btn = el(`
      <button type="button" class="subtab" data-id="${u.id}">
        <span class="subtab-avatar">${escapeHtml(inicial)}</span>
        <span>${escapeHtml(u.nombre)}</span>
      </button>
    `);
    btn.addEventListener('click', () => {
      marcarTecnicoActivo(u.id);
      cargarDetalle(Number(u.id));
    });
    $subtabsTecnico.appendChild(btn);
  }

  function marcarTecnicoActivo(tecnicoId) {
    $subtabsTecnico.querySelectorAll('.subtab').forEach((b) => {
      b.classList.toggle('subtab--activo', String(b.dataset.id) === String(tecnicoId));
    });
  }

  // Carga automática del primer técnico para evitar pantalla en blanco
  if (usuarios && usuarios.length > 0) {
    marcarTecnicoActivo(usuarios[0].id);
    cargarDetalle(Number(usuarios[0].id));
  } else {
    $detalle.innerHTML = `
      <div class="card-bloque">
        <div class="vacio-tarjeta">
          <div class="vacio-icono">👤</div>
          <p class="vacio-titulo">No hay técnicos registrados</p>
          <p class="vacio-desc">Crea cuentas de técnicos en la sección de Usuarios para gestionar sus billeteras.</p>
        </div>
      </div>
    `;
  }

  async function cargarDetalle(tecnicoId) {
    $detalle.innerHTML = `
      <div class="cargando-bloque">
        <div class="spinner"></div>
        <p>Cargando información contable…</p>
      </div>
    `;
    try {
      const [resumen, pendiente] = await Promise.all([
        api(`/admin/billetera/${tecnicoId}`),
        api(`/admin/billetera/${tecnicoId}/pendiente`),
      ]);
      pintarDetalle(tecnicoId, resumen, pendiente);
    } catch (e) {
      $detalle.innerHTML = `
        <div class="callout-aviso" style="border-color: #FECACA; background: #FEF2F2; color: #991B1B;">
          <div class="callout-icono" style="color: #DC2626;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <div class="callout-texto">
            <strong>Error al cargar la billetera:</strong> ${escapeHtml(e.message)}
          </div>
        </div>
      `;
    }
  }

  function pintarDetalle(tecnicoId, resumen, pendiente) {
    const nombreTecnico = usuarios.find((u) => u.id === tecnicoId)?.nombre || `Técnico #${tecnicoId}`;
    const esSaldoNegativo = Number(resumen.saldo) < 0;
    const tienePendientes = Number(pendiente.monto_total) > 0;

    $detalle.innerHTML = `
      <!-- KPI Grid -->
      <div class="billetera-kpi-grid">
        <!-- Tarjeta Saldo en Billetera -->
        <div class="billetera-kpi-card ${esSaldoNegativo ? 'billetera-kpi-card--saldo-negativo' : 'billetera-kpi-card--saldo'}">
          <div class="billetera-kpi-cabecera">
            <div class="billetera-kpi-info">
              <span class="card-bloque-tag ${esSaldoNegativo ? 'card-bloque-tag--amber' : 'card-bloque-tag--teal'}">
                ${esSaldoNegativo ? 'Saldo deudor' : 'Disponible en billetera'}
              </span>
              <h3 class="billetera-kpi-titulo">Saldo actual de ${escapeHtml(nombreTecnico)}</h3>
              <p class="billetera-kpi-desc">
                ${esSaldoNegativo ? 'Saldo retenido o a favor de la empresa.' : 'Fondos netos disponibles para transferir o pagar al técnico.'}
              </p>
            </div>
            <div class="billetera-kpi-icono ${esSaldoNegativo ? 'icono--alerta' : 'icono--ok'}">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                <line x1="12" y1="8" x2="12" y2="16"></line>
                <line x1="8" y1="12" x2="16" y2="12"></line>
              </svg>
            </div>
          </div>

          <div class="billetera-kpi-monto-fila">
            <span class="billetera-monto-grande ${esSaldoNegativo ? 'celda-negativa' : 'celda-positiva'}">
              ${formatMoney(resumen.saldo)}
            </span>
            <span class="billetera-monto-etiqueta">CLP</span>
          </div>

          <div class="billetera-acciones-fila">
            <button type="button" class="btn btn--primario btn-con-icono" id="btn-registrar-pago">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"></line>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
              <span>+ Registrar Pago</span>
            </button>
            <button type="button" class="btn btn--secundario btn-con-icono" id="btn-registrar-ajuste">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span>Ajuste manual</span>
            </button>
          </div>
        </div>

        <!-- Tarjeta Pendiente por Liquidar -->
        <div class="billetera-kpi-card billetera-kpi-card--pendiente">
          <div class="billetera-kpi-cabecera">
            <div class="billetera-kpi-info">
              <span class="card-bloque-tag card-bloque-tag--indigo">Pendiente de cierre</span>
              <h3 class="billetera-kpi-titulo">Pendiente por liquidar</h3>
              <p class="billetera-kpi-desc">Trabajos en terreno completados y aprobados sin cierre contable.</p>
            </div>
            <div class="billetera-kpi-icono icono--indigo">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
          </div>

          <div class="billetera-kpi-monto-fila">
            <span class="billetera-monto-grande">
              ${formatMoney(pendiente.monto_total || 0)}
            </span>
            <span class="billetera-monto-etiqueta">CLP</span>
          </div>

          <div class="billetera-desglose">
            ${tienePendientes ? `
              <div class="desglose-item">
                <div class="desglose-icono">🛠️</div>
                <div class="desglose-detalle">
                  <span class="desglose-texto">${(pendiente.ordenes || []).length} orden(es) aprobada(s)</span>
                  <span class="desglose-monto">${formatMoney(pendiente.monto_ordenes || 0)}</span>
                </div>
              </div>
              <div class="desglose-item">
                <div class="desglose-icono">📡</div>
                <div class="desglose-detalle">
                  <span class="desglose-texto">${(pendiente.ventas || []).length} venta(s) instalada(s)</span>
                  <span class="desglose-monto">${formatMoney(pendiente.monto_ventas || 0)}</span>
                </div>
              </div>
            ` : `
              <div class="desglose-item">
                <div class="desglose-icono">✨</div>
                <div class="desglose-detalle">
                  <span class="desglose-texto" style="color: #059669; font-weight: 600;">Todo al día</span>
                  <span class="desglose-monto">$0</span>
                </div>
              </div>
            `}
          </div>
        </div>
      </div>

      <!-- Secciones de Detalle -->
      <div class="billetera-secciones">
        <!-- Bloque 1: Movimientos de billetera -->
        <section class="card-bloque">
          <div class="card-bloque-cabecera">
            <div class="card-bloque-titular">
              <span class="card-bloque-tag card-bloque-tag--indigo">Libro diario</span>
              <h3>Movimientos de billetera</h3>
              <p class="card-bloque-bajada">Auditoría cronológica de abonos, cargos, transferencias y liquidaciones de ${escapeHtml(nombreTecnico)}.</p>
            </div>
            <span class="badge-monto badge-monto--mudo">${resumen.movimientos.length} movimiento(s)</span>
          </div>
          <div class="card-bloque-body">
            ${resumen.movimientos.length ? `
              <div class="tabla-envoltorio">
                <table class="tabla">
                  <thead>
                    <tr>
                      <th>Fecha y hora</th>
                      <th>Tipo</th>
                      <th>Monto</th>
                      <th>Observación</th>
                      <th>Registrado por</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${resumen.movimientos.map((m) => {
                      const esNegativo = Number(m.monto) < 0;
                      let tipoClase = 'tag-mov--pago';
                      if (m.tipo_movimiento === 'liquidacion') tipoClase = 'tag-mov--liquidacion';
                      else if (m.tipo_movimiento === 'ajuste') tipoClase = 'tag-mov--ajuste';

                      return `
                        <tr>
                          <td>
                            <div class="celda-fecha-contenedor">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                              </svg>
                              <span>${formatDateTime(m.creado_en)}</span>
                            </div>
                          </td>
                          <td>
                            <span class="tag-mov ${tipoClase}">
                              ${ETIQUETA_MOVIMIENTO[m.tipo_movimiento] || m.tipo_movimiento}
                            </span>
                          </td>
                          <td>
                            <span class="badge-monto ${esNegativo ? 'badge-monto--negativo' : 'badge-monto--positivo'}">
                              ${esNegativo ? '' : '+'}${formatMoney(m.monto)}
                            </span>
                          </td>
                          <td class="celda-observacion">${escapeHtml(m.observacion || '—')}</td>
                          <td>
                            <span class="usuario-pill">${escapeHtml(m.creado_por_nombre || 'Sistema')}</span>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div class="vacio-tarjeta">
                <div class="vacio-icono">💳</div>
                <p class="vacio-titulo">Sin movimientos contables</p>
                <p class="vacio-desc">Aún no se registran pagos ni movimientos contables para este técnico.</p>
              </div>
            `}
          </div>
        </section>

        <!-- Bloque 2: Historial de cierres -->
        <section class="card-bloque">
          <div class="card-bloque-cabecera">
            <div class="card-bloque-titular">
              <span class="card-bloque-tag card-bloque-tag--teal">Cierres contables</span>
              <h3>Historial de cierres</h3>
              <p class="card-bloque-bajada">Cierres periódicos consolidados emitidos para ${escapeHtml(nombreTecnico)}.</p>
            </div>
            <span class="badge-monto badge-monto--mudo">${resumen.periodos.length} cierre(s)</span>
          </div>
          <div class="card-bloque-body">
            ${resumen.periodos.length ? `
              <div class="tabla-envoltorio">
                <table class="tabla">
                  <thead>
                    <tr>
                      <th>Fecha de cierre</th>
                      <th>Rango del período</th>
                      <th>Órdenes</th>
                      <th>Ventas</th>
                      <th>Total liquidado</th>
                      <th>Cerrado por</th>
                      <th style="text-align: right;">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${resumen.periodos.map((p) => `
                      <tr>
                        <td>
                          <div class="celda-fecha-contenedor">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                              <line x1="16" y1="2" x2="16" y2="6"></line>
                              <line x1="8" y1="2" x2="8" y2="6"></line>
                              <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            <strong>${formatDateTime(p.creado_en)}</strong>
                          </div>
                        </td>
                        <td style="font-size: 0.82rem; color: var(--tinta-2);">
                          ${formatDateTime(p.fecha_desde)} — ${formatDateTime(p.fecha_hasta)}
                        </td>
                        <td><span class="badge-monto badge-monto--mudo">${formatMoney(p.monto_ordenes)}</span></td>
                        <td><span class="badge-monto badge-monto--mudo">${formatMoney(p.monto_ventas)}</span></td>
                        <td><span class="badge-monto badge-monto--positivo">${formatMoney(p.monto_total)}</span></td>
                        <td><span class="usuario-pill">${escapeHtml(p.cerrado_por_nombre || 'Sistema')}</span></td>
                        <td style="text-align: right;">
                          <button type="button" class="btn-accion btn-accion--editar" data-ver-periodo="${p.id}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            <span>Ver detalle</span>
                          </button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div class="vacio-tarjeta">
                <div class="vacio-icono">📁</div>
                <p class="vacio-titulo">Sin cierres todavía</p>
                <p class="vacio-desc">Los períodos consolidados y liquidados se archivarán automáticamente en este listado.</p>
              </div>
            `}
          </div>
        </section>
      </div>
    `;

    $detalle.querySelector('#btn-registrar-pago').addEventListener('click', () => abrirModalPago(tecnicoId, nombreTecnico));
    $detalle.querySelector('#btn-registrar-ajuste').addEventListener('click', () => abrirModalAjuste(tecnicoId, nombreTecnico));
    $detalle.querySelectorAll('[data-ver-periodo]').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalDetallePeriodo(Number(btn.dataset.verPeriodo)));
    });
  }

  async function abrirModalDetallePeriodo(periodoId) {
    const { root, cerrar } = abrirModal(`
      <div class="modal-encabezado-icono">
        <div class="modal-icono-circulo modal-icono-circulo--teal">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        </div>
        <div>
          <h3 style="margin: 0; font-size: 1.15rem;">Detalle del cierre contable</h3>
          <p style="margin: 3px 0 0; font-size: 0.82rem; color: var(--tinta-2);">
            Órdenes de terreno y suscripciones comerciales acreditadas en este período.
          </p>
        </div>
      </div>
      <div id="detalle-periodo-contenido" style="margin-top: 18px;">
        <div class="cargando-bloque" style="padding: 30px;">
          <div class="spinner"></div>
          <p>Cargando detalle…</p>
        </div>
      </div>
      <div class="modal-acciones" style="margin-top: 20px;">
        <button type="button" class="btn btn--secundario" id="btn-cerrar-detalle">Cerrar</button>
      </div>
    `);
    root.querySelector('#btn-cerrar-detalle').addEventListener('click', cerrar);
    const $contenido = root.querySelector('#detalle-periodo-contenido');
    try {
      const { ordenes, ventas } = await api(`/admin/billetera/periodos/${periodoId}/detalle`);
      $contenido.innerHTML = `
        <h4 style="margin: 0 0 10px; font-size: 0.95rem; display: flex; align-items: center; gap: 8px;">
          <span>Órdenes instaladas</span>
          <span class="badge-monto badge-monto--mudo">${ordenes.length}</span>
        </h4>
        ${ordenes.length ? `
          <div class="tabla-envoltorio" style="margin-bottom: 20px;">
            <table class="tabla">
              <thead><tr><th>Folio</th><th>Tipo</th><th>Cliente</th><th>Fecha</th><th style="text-align: right;">Monto</th></tr></thead>
              <tbody>
                ${ordenes.map((o) => `
                  <tr>
                    <td><strong>${escapeHtml(o.folio)}</strong></td>
                    <td>${escapeHtml(o.tipo_servicio_nombre)}</td>
                    <td>${escapeHtml(o.venta_cliente_nombre || '—')}</td>
                    <td style="font-size: 0.8rem; color: var(--tinta-2);">${formatDateTime(o.fecha_trabajo_dispositivo)}</td>
                    <td style="text-align: right;"><span class="badge-monto badge-monto--positivo">${formatMoney(o.monto_tecnico)}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<p class="vacio" style="margin-bottom: 20px;">Ninguna orden en este cierre.</p>'}

        <h4 style="margin: 0 0 10px; font-size: 0.95rem; display: flex; align-items: center; gap: 8px;">
          <span>Ventas instaladas</span>
          <span class="badge-monto badge-monto--mudo">${ventas.length}</span>
        </h4>
        ${ventas.length ? `
          <div class="tabla-envoltorio">
            <table class="tabla">
              <thead><tr><th>Cliente</th><th>Plan</th><th>Comuna</th><th style="text-align: right;">Monto</th></tr></thead>
              <tbody>
                ${ventas.map((v) => `
                  <tr>
                    <td><strong>${escapeHtml(v.cliente_nombre)}</strong></td>
                    <td>${escapeHtml(v.plan_nombre)}</td>
                    <td>${escapeHtml(v.comuna)}</td>
                    <td style="text-align: right;"><span class="badge-monto badge-monto--positivo">${formatMoney(v.monto_vendedor)}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<p class="vacio">Ninguna venta en este cierre.</p>'}
      `;
    } catch (e) {
      $contenido.innerHTML = `<p class="vacio vacio--error">${escapeHtml(e.message)}</p>`;
    }
  }

  function abrirModalPago(tecnicoId, nombreTecnico) {
    const { root, cerrar } = abrirModal(`
      <div class="modal-encabezado-icono">
        <div class="modal-icono-circulo modal-icono-circulo--teal">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"></line>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
        </div>
        <div>
          <h3 style="margin: 0; font-size: 1.15rem;">Registrar pago a ${escapeHtml(nombreTecnico)}</h3>
          <p style="margin: 3px 0 0; font-size: 0.82rem; color: var(--tinta-2);">
            Descuenta el monto abonado de la billetera tras realizar una transferencia o pago en efectivo.
          </p>
        </div>
      </div>
      <form id="form-pago" style="margin-top: 18px;">
        <label class="campo">
          <span>Monto pagado (CLP)</span>
          <div class="input-con-prefijo">
            <span class="input-prefijo">$</span>
            <input type="number" name="monto" min="1" step="1" placeholder="Ej: 50000" required autofocus>
          </div>
        </label>
        <label class="campo" style="margin-top: 14px;">
          <span>Observación o N° de comprobante</span>
          <input type="text" name="observacion" placeholder="Ej: Transferencia Banco Estado N° 583921">
        </label>
        <div class="modal-acciones" style="margin-top: 22px;">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--primario btn-con-icono">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Confirmar pago</span>
          </button>
        </div>
      </form>
    `);
    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-pago').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const $submit = ev.target.querySelector('button[type="submit"]');
      if ($submit.disabled) return;
      $submit.disabled = true;
      const fd = new FormData(ev.target);
      const payload = { monto: Number(fd.get('monto')), observacion: fd.get('observacion') || null };
      if (!payload.monto || payload.monto <= 0) {
        $submit.disabled = false;
        return;
      }
      try {
        const { encolado } = await conColaSiHaceFalta(
          'registrar_pago', { tecnicoId, ...payload },
          () => api(`/admin/billetera/${tecnicoId}/pago`, { method: 'POST', body: payload })
        );
        cerrar();
        if (encolado) {
          toast(`Pago a ${nombreTecnico} guardado sin conexión — se aplicará al recuperar señal.`, 'neutro');
        } else {
          toast('Pago registrado correctamente.', 'ok');
          await cargarDetalle(tecnicoId);
        }
      } catch (e) {
        toast(e.message, 'malo');
        $submit.disabled = false;
      }
    });
  }

  function abrirModalAjuste(tecnicoId, nombreTecnico) {
    const { root, cerrar } = abrirModal(`
      <div class="modal-encabezado-icono">
        <div class="modal-icono-circulo modal-icono-circulo--indigo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </div>
        <div>
          <h3 style="margin: 0; font-size: 1.15rem;">Ajuste manual — ${escapeHtml(nombreTecnico)}</h3>
          <p style="margin: 3px 0 0; font-size: 0.82rem; color: var(--tinta-2);">
            Corrección puntual. Monto positivo suma a favor del técnico; monto negativo resta.
          </p>
        </div>
      </div>
      <form id="form-ajuste" style="margin-top: 18px;">
        <label class="campo">
          <span>Monto de ajuste (CLP, permite negativos)</span>
          <div class="input-con-prefijo">
            <span class="input-prefijo">$</span>
            <input type="number" name="monto" step="1" placeholder="Ej: 15000 o -5000" required autofocus>
          </div>
        </label>
        <label class="campo" style="margin-top: 14px;">
          <span>Motivo obligatorio del ajuste</span>
          <textarea name="observacion" rows="2" required placeholder="Describe el motivo de este ajuste contable…"></textarea>
        </label>
        <div class="modal-acciones" style="margin-top: 22px;">
          <button type="button" class="btn btn--secundario" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn--primario btn-con-icono">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Aplicar ajuste</span>
          </button>
        </div>
      </form>
    `);
    root.querySelector('#btn-cancelar').addEventListener('click', cerrar);
    root.querySelector('#form-ajuste').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const $submit = ev.target.querySelector('button[type="submit"]');
      if ($submit.disabled) return;
      $submit.disabled = true;
      const fd = new FormData(ev.target);
      const payload = { monto: Number(fd.get('monto')), observacion: fd.get('observacion') };
      if (!payload.monto || !payload.observacion.trim()) {
        $submit.disabled = false;
        return;
      }
      try {
        const { encolado } = await conColaSiHaceFalta(
          'registrar_ajuste', { tecnicoId, ...payload },
          () => api(`/admin/billetera/${tecnicoId}/ajuste`, { method: 'POST', body: payload })
        );
        cerrar();
        if (encolado) {
          toast(`Ajuste a ${nombreTecnico} guardado sin conexión — se aplicará al recuperar señal.`, 'neutro');
        } else {
          toast('Ajuste registrado correctamente.', 'ok');
          await cargarDetalle(tecnicoId);
        }
      } catch (e) {
        toast(e.message, 'malo');
        $submit.disabled = false;
      }
    });
  }
}
