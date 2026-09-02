// Envoltorio sobre html5-qrcode (vendorizada en js/vendor/, misma librería
// que usa la app técnico — ver docs/admin-api.md). Abre un modal de cámara
// y resuelve con la serie leída — o con lo que se haya escrito a mano en el
// campo de entrada manual que siempre queda visible al lado (reporte #4:
// "aqui falta un lector de codigo de barra" en el alta de equipo).
import { el } from './utils.js';

/**
 * @returns {Promise<{serie: string, manual: boolean} | null>} null si se cancela
 */
export function abrirScanner() {
  return new Promise((resolve) => {
    const overlay = el(`
      <div class="scanner-modal">
        <div class="scanner-header">
          <h2>Escanear serie</h2>
          <button type="button" class="btn btn--texto" id="scanner-cerrar" aria-label="Cerrar">✕</button>
        </div>
        <div id="scanner-viewport"></div>
        <div class="scanner-footer">
          <p class="scanner-mensaje" id="scanner-mensaje">Apunta al código de barras o QR de la serie.</p>
          <div class="entrada-manual">
            <input type="text" id="scanner-manual-input" placeholder="O escribe la serie a mano" autocomplete="off">
            <button type="button" class="btn btn--secundario" id="scanner-manual-btn">Usar</button>
          </div>
        </div>
      </div>
    `);
    document.body.appendChild(overlay);

    const $mensaje = overlay.querySelector('#scanner-mensaje');
    const $manualInput = overlay.querySelector('#scanner-manual-input');
    let cerrado = false;
    let lector = null;

    if (typeof Html5Qrcode === 'undefined') {
      $mensaje.textContent = 'No se pudo cargar el lector de cámara — escribe la serie a mano.';
    } else {
      lector = new Html5Qrcode('scanner-viewport', { verbose: false });
    }

    async function cerrar(resultado) {
      if (cerrado) return;
      cerrado = true;
      if (lector) {
        try {
          if (lector.isScanning) await lector.stop();
          lector.clear();
        } catch {
          // la cámara ya pudo haberse detenido sola (permiso revocado, tab oculta)
        }
      }
      overlay.remove();
      resolve(resultado);
    }

    overlay.querySelector('#scanner-cerrar').addEventListener('click', () => cerrar(null));
    overlay.querySelector('#scanner-manual-btn').addEventListener('click', () => {
      const valor = $manualInput.value.trim();
      if (valor) cerrar({ serie: valor, manual: true });
    });
    $manualInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); overlay.querySelector('#scanner-manual-btn').click(); }
    });

    if (lector) {
      lector
        .start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (textoDecodificado) => cerrar({ serie: textoDecodificado, manual: false }),
          () => { /* frame sin lectura — normal, se repite muchas veces por segundo */ }
        )
        .catch(() => {
          $mensaje.textContent = 'No se pudo abrir la cámara (¿permiso denegado, o sin webcam?) — escribe la serie a mano.';
        });
    }
  });
}
