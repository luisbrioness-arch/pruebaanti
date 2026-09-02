// Envoltorio único sobre fetch() para /api/*. Ver docs/wizard-api.md y
// docs/admin-api.md para la forma exacta de cada respuesta y cada error.

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
 * @param {string} path        ej. '/admin/ordenes?estado=enviada'
 * @param {{method?:string, body?:any}} opts
 */
export async function api(path, opts = {}) {
  const { method = 'GET', body } = opts;
  const fetchOpts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    fetchOpts.headers['Content-Type'] = 'application/json';
    fetchOpts.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(BASE + path, fetchOpts);
  } catch {
    throw new ApiError('No hay conexión con el servidor. Revisa tu red e intenta de nuevo.', 'sin_conexion', 0, {});
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // respuesta vacía (204) o no-JSON — se deja data en null
  }

  if (!res.ok || (data && data.error)) {
    const message = (data && data.message) || `Error inesperado (${res.status}).`;
    const code = (data && data.code) || 'error';
    throw new ApiError(message, code, res.status, data || {});
  }
  return data;
}
