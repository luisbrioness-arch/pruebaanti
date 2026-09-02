# Reportes (bugs y pedidos de cambio)

Botón "🐞 Reportar" — en el topbar del panel admin y de la app técnico —
para que cualquiera con sesión deje un bug o pida un cambio desde donde
esté, sin salir de la app. Edwin los revisa en una bandeja nueva del panel
admin (**Reportes**).

## Por qué base de datos y no archivos (a diferencia de otro proyecto)

El patrón de referencia (`debug-mode.ts` / `debug_report.php` de otro
proyecto del cliente) guarda cada reporte como un archivo `.md` en el
servidor, pensado para un sitio público sin login que el desarrollador
revisa bajando los archivos por FTP/SSH. Acá el contexto es distinto:

- Los usuarios (técnicos, Edwin) **ya están autenticados** — no hace falta
  el mecanismo de activación por `?debug=1` + clave secreta de un sitio
  público.
- Este hosting **no tiene SSH** en el plan actual, así que no hay forma
  simple de "bajar los archivos .md" para revisarlos — sí hay panel admin
  con base de datos, que es justo lo que ya usan el resto de las
  funcionalidades (Auditoría, Conflictos, etc.).

Por eso los reportes quedan en la tabla `reportes` y se ven en una vista
del panel, no como archivos sueltos en el servidor.

## Modelo

```sql
reportes: id, usuario_id, tipo ('bug'|'cambio'), descripcion, pantalla,
          estado ('abierto'|'resuelto'), resuelto_por, resuelto_en, creado_en
```

`pantalla` la captura el frontend solo (`location.hash` al momento de
abrir el modal) — nunca la escribe el usuario, es contexto para depurar
más rápido, no un campo de formulario.

## Endpoints

- `POST /api/reportes` — cualquier usuario con sesión (`Auth::id()`, sin
  restricción de rol). Body: `{ tipo, descripcion, pantalla? }`.
- `GET /api/admin/reportes?estado=abierto|resuelto` — admin, lista
  reportes (sin el parámetro, trae todos).
- `POST /api/admin/reportes/{id}/resolver` — admin, marca resuelto.
- `POST /api/admin/reportes/{id}/reabrir` — admin, por si se marcó por
  error.

## Frontend

- **Panel admin**: [`js/reportar.js`](../public_html/admin/js/reportar.js)
  (modal, botón en el topbar) + [`js/views/reportes.js`](../public_html/admin/js/views/reportes.js)
  (bandeja, filtro por estado). El envío pasa por la cola de escritura
  offline del admin (`conColaSiHaceFalta`), igual que el resto de las
  acciones de ese panel.
- **App técnico**: [`js/reportar.js`](../public_html/tecnico/js/reportar.js)
  (mismo modal, botón 🐞 en el topbar). **No pasa por la cola offline** del
  técnico — esa cola está pensada para acciones ligadas a una orden
  (necesita un `uuid`); un reporte es independiente de cualquier orden. Sin
  señal, se avisa que se reintente más tarde — mismo criterio ya usado para
  "retirar" un equipo (ver [tecnico-app.md](tecnico-app.md)).
