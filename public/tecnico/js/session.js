// Estado de sesión compartido — separado de app.js para que las vistas
// puedan leerlo sin crear una dependencia circular con el arranque.
let usuarioActual = null;

export function setUsuarioActual(usuario) {
  usuarioActual = usuario;
}

export function getUsuarioActual() {
  return usuarioActual;
}
