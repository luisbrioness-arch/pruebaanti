# Reportes (bugs y pedidos de cambio) — modo inspección

Herramienta **solo para el desarrollador** (Luis) — nunca visible para
Edwin ni los técnicos en el uso normal de la app. Se activa entrando con
`?debug=1` en la URL (ej. `https://dth.hogartv.cl/admin/?debug=1`); queda
guardado en `sessionStorage` mientras dure la pestaña, así que no hace
falta repetir el parámetro al navegar entre vistas de la misma sesión —
pero si se cierra la pestaña o se abre en otra, hay que volver a agregarlo.

Con el modo activo aparece un botón flotante 🐞 (esquina inferior derecha).
Al tocarlo se activa "modo inspección": el cursor cambia a cruceta, y el
siguiente clic en cualquier elemento de la pantalla lo selecciona y abre un
formulario para describir el problema — solo se escribe **qué** está mal,
nunca **dónde**, porque el elemento y la pantalla ya quedaron capturados
solos. Sin campo de "tipo" (bug/cambio) — la descripción libre ya lo
explica, clasificarlo aparte no aportaba nada.

Patrón adaptado de `debug-mode.ts` / `debug_report.php` de otro proyecto
del cliente, con un ajuste deliberado por el contexto distinto: **base de
datos, no archivos `.md`** — ese otro proyecto es un sitio público sin
login, revisado bajando archivos por FTP/SSH; acá los usuarios ya están
autenticados y este hosting no tiene SSH, así que la base de datos (que
este sistema ya usa para todo lo demás) es más práctica que archivos
sueltos en el servidor. La clave secreta de aquel proyecto no hizo falta
replicarla — acá el `?debug=1` ya es suficiente porque nadie más que Luis
tiene motivo para escribirlo.

**Sin bandeja de admin a propósito** — Edwin no ve nada de esto (ni el
botón, ni una pantalla de reportes). El flujo real es: Luis activa el modo,
reporta algo, y se lo cuenta a Claude directo (pegando la descripción, o
pidiéndole que consulte la tabla) → Claude lo arregla y hace push. No hay
UI de "marcar resuelto" ni estado — la fila en `reportes` es solo el
registro de que se pidió.

## Modelo

```sql
reportes: id, usuario_id, tipo ('bug'|'cambio'), descripcion,
          pantalla, elemento, estado ('abierto'|'resuelto'),
          resuelto_por, resuelto_en, creado_en
```

`pantalla` (`location.hash`) y `elemento` (tag + selector CSS + texto del
elemento clickeado, ej. `button #btn-nueva-orden — "Nueva instalación"`)
los captura el frontend solo — nunca los escribe el usuario. `estado` /
`resuelto_por` / `resuelto_en` quedan en el modelo por si algún día hace
falta una bandeja, pero hoy nada los actualiza (no hay endpoint de
resolver/reabrir).

## Endpoint

- `POST /api/reportes` — cualquier usuario con sesión (`Auth::id()`, sin
  restricción de rol). Body: `{ tipo, descripcion, pantalla?, elemento? }`.

No hay endpoints de admin para esto — ver nota de "sin bandeja" arriba.

## Frontend

Mismo módulo `reportar.js` en ambas apps (duplicado, no compartido — mismo
criterio que el resto del proyecto: `public_html/admin/js/reportar.js` y
`public_html/tecnico/js/reportar.js`), con la lógica de selección de
elemento calcada de `debug-mode.ts` (resaltado al pasar el mouse,
`elementFromPoint`, selector por `nth-of-type` si no hay `id`) pero usando
el sistema de modal ya existente de cada app en vez de un overlay armado a
mano.

- **Panel admin**: el envío pasa por la cola de escritura offline
  (`conColaSiHaceFalta`), igual que el resto de las acciones de ese panel.
- **App técnico**: **no** pasa por la cola offline — esa cola está pensada
  para acciones ligadas a una orden (necesita un `uuid`); un reporte es
  independiente de cualquier orden. Sin señal, se avisa que se reintente
  más tarde — mismo criterio ya usado para "retirar" un equipo (ver
  [tecnico-app.md](tecnico-app.md)).

Validado en navegador real en ambas apps: FAB visible, modo inspección
activa/desactiva con el botón y con Escape, clic en un elemento real
(botón, link de navegación) captura tag/selector/texto correctamente y
**no dispara la acción real de ese elemento** (`preventDefault` +
`stopPropagation` antes de que el evento llegue al handler original),
envío online y — en el panel admin — sin conexión con sincronización
posterior confirmada.
