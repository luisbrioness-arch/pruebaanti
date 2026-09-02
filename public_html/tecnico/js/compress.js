// Envoltorio sobre Compressor.js (vendorizada en js/vendor/, ver
// docs/tecnico-app.md). El servidor rechaza fotos de más de 400KB — acá se
// apunta a 300KB con margen, probando calidades cada vez más agresivas
// hasta lograrlo o agotar los intentos (nunca sube el límite del servidor,
// eso sería tapar el síntoma).
const CALIDADES = [0.7, 0.55, 0.4, 0.3, 0.2];
const OBJETIVO_BYTES = 300000;
const DIMENSION_MAXIMA = 1600;

function comprimirUnaVez(archivo, calidad) {
  return new Promise((resolve, reject) => {
    if (typeof Compressor === 'undefined') {
      reject(new Error('No se pudo cargar el compresor de imágenes.'));
      return;
    }
    new Compressor(archivo, {
      quality: calidad,
      maxWidth: DIMENSION_MAXIMA,
      maxHeight: DIMENSION_MAXIMA,
      mimeType: 'image/jpeg',
      success: resolve,
      error: reject,
    });
  });
}

/** @returns {Promise<Blob>} nunca garantiza llegar a OBJETIVO_BYTES, pero siempre lo intenta en serio antes de rendirse. */
export async function comprimirImagen(archivo) {
  let actual = archivo;
  for (const calidad of CALIDADES) {
    actual = await comprimirUnaVez(actual, calidad);
    if (actual.size <= OBJETIVO_BYTES) break;
  }
  return actual;
}
