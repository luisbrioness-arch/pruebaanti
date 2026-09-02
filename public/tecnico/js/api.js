// Envoltorio único sobre fetch() para /api/*. Ver docs/wizard-api.md para la
// forma exacta de cada respuesta y cada error. Mismo contrato que usa el
// panel admin (public/admin/js/api.js) — es la misma API.

const BASE = '/api';

export class ApiError extends Error {
  constructor(message, code, status, extra) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra || {};
  }
}

/**
 * @param {string} path        ej. '/ordenes/abc-123/materiales'
 * @param {{method?:string, body?:any, form?:FormData}} opts
 */
export async function api(path, opts = {}) {
  const { method = 'GET', body, form } = opts;
  const fetchOpts = { method, credentials: 'same-origin', headers: {} };
  if (form !== undefined) {
    fetchOpts.body = form; // el navegador pone el Content-Type multipart con el boundary
  } else if (body !== undefined) {
    fetchOpts.headers['Content-Type'] = 'application/json';
    fetchOpts.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(BASE + path, fetchOpts);
  } catch {
    throw new ApiError('Sin conexión con el servidor. Revisa tu señal e inténtalo de nuevo.', 'sin_conexion', 0, {});
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // respuesta vacía o no-JSON
  }

  if (!res.ok || (data && data.error)) {
    const message = (data && data.message) || `Error inesperado (${res.status}).`;
    const code = (data && data.code) || 'error';
    throw new ApiError(message, code, res.status, data || {});
  }
  return data;
}
