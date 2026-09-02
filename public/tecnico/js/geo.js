/** Mejor esfuerzo, nunca bloquea el flujo: si el GPS tarda o el técnico niega el permiso, sigue sin coordenadas. */
export function obtenerUbicacion(timeoutMs = 6000) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    const listo = { resuelto: false };
    const terminar = (valor) => {
      if (listo.resuelto) return;
      listo.resuelto = true;
      resolve(valor);
    };
    navigator.geolocation.getCurrentPosition(
      (pos) => terminar({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => terminar(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
    );
    setTimeout(() => terminar(null), timeoutMs + 500);
  });
}

/** 'YYYY-MM-DD HH:mm:ss' en hora local — el formato que espera la columna DATETIME. */
export function fechaHoraSql(fecha = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;
}
