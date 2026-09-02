/**
 * uuid_dispositivo es la identidad real de la orden (ver
 * docs/modelo-datos-fase1.md) — se genera acá, una sola vez por orden, y
 * viaja con ella en cada paso del wizard para que reintentar sin señal
 * nunca duplique nada en el servidor.
 */
export function generarUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback para navegadores viejos sin crypto.randomUUID (poco probable en
  // un celular moderno, pero mejor no romper la app entera por esto).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
