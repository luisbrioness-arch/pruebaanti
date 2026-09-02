# Bodegas y traspasos pendientes de confirmación

Pedido: *"admin debe tener acceso para ingresar nuevos técnicos"*, *"en técnico
me falta una pestaña que deje aceptar cuando hagan un traspaso de equipos (el
técnico verifica visualmente que sean correctas las series de los equipos
entregados y cantidad de ferretería después acepta el pedido)"* y *"tenemos
que tener 'bodegas' — una bodega central desde donde saldrán todos los
pedidos […] y una bodega para cada técnico"*.

## "Bodegas" — ya existían, con otro nombre

No hizo falta una tabla `bodegas` nueva: el modelo de Fase 1 ya distinguía
exactamente eso, solo que sin llamarlo así.

- **Bodega central** = `equipos.estado = 'bodega'` (sin dueño, `usuario_actual_id
  = NULL`). Ahí nace un equipo cuando se da de alta (`BodegaService::altaEquipo`
  — la "recepción de lo de TuVes").
- **Bodega de cada técnico** = su `maleta` (`equipos.estado = 'maleta'`,
  `usuario_actual_id` = él). Igual con `stock_ferreteria_usuario`, ya
  particionado por `usuario_id`.

Lo único que faltaba de verdad era el paso siguiente: nada de lo que salía de
una bodega hacia la otra pasaba por una confirmación de quien lo recibía.

## El problema real: todo se aplicaba al toque

Antes de este cambio, `asignarAMaleta`, `traspasarEquipo` y
`entregarFerreteria` movían el equipo/stock en el mismo request del admin. Un
técnico podía tener equipos "en su maleta" según el sistema que en realidad
nunca recibió, o con una serie distinta a la que el admin creyó estar
mandando — no había ningún punto donde alguien verificara físicamente antes
de que quedara asentado.

## Diseño: estado intermedio + confirmación

**Equipos** (serializados, se pueden "reservar" con su propio estado):

- `asignarAMaleta`/`traspasarEquipo` ya no dejan el equipo en `maleta` —
  lo dejan en un estado nuevo, **`en_transito`**, con `usuario_actual_id` ya
  apuntando al técnico destino (para que se vea "en camino" en la tabla del
  admin) y `origen_pendiente_id` guardando de dónde salió (`NULL` = bodega
  central, un id = la maleta de ese técnico) — para poder devolverlo ahí
  mismo si lo rechaza.
- El técnico ve estos equipos en `GET /api/mis-traspasos` y decide:
  - **Aceptar** (`POST /api/mis-traspasos/equipos/{id}/aceptar`) → pasa a
    `maleta` de verdad. Se registra recién ahora el movimiento real
    (`asignacion_maleta` o `traspaso`, según si vino de bodega o de otro
    técnico) — el envío en sí ya quedó registrado como `traspaso_pendiente`.
  - **Rechazar** (`POST /api/mis-traspasos/equipos/{id}/rechazar`, con
    `observacion` obligatoria) → vuelve a `bodega` o a la maleta de origen,
    con el motivo guardado en `movimientos_equipo` (tipo
    `traspaso_rechazado`) para que el admin sepa qué corregir.
- El admin puede arrepentirse de un envío mientras el técnico no lo haya
  resuelto: `POST /api/admin/equipos/{id}/cancelar-traspaso` (tipo
  `traspaso_cancelado`).

**Ferretería** (cantidad, no serializada — no hay una fila que "reservar"):

- `entregarFerreteria` ya no toca `stock_ferreteria_usuario` ni
  `movimientos_ferreteria` — crea una fila en la tabla nueva
  `entregas_ferreteria_pendientes` (`estado = 'pendiente'`).
- El técnico la ve en el mismo `GET /api/mis-traspasos` (clave `ferreteria`)
  y **recién al aceptar** (`POST /api/mis-traspasos/ferreteria/{id}/aceptar`)
  se escribe el movimiento real (`entrega_bodega`) y se ajusta el stock. Si
  rechaza, no hay nada que revertir — nunca se aplicó nada.
- El admin ve todo lo pendiente en `GET /api/admin/ferreteria/pendientes` y
  puede cancelarlo con `POST /api/admin/ferreteria/pendientes/{id}/cancelar`.

Todas las transiciones de aceptar/rechazar/cancelar corren dentro de
`Database::transaction()` con `SELECT ... FOR UPDATE` sobre la fila que se
está resolviendo (mismo patrón que el fix de doble liquidación, ver
`liquidacion-billetera.md`) — dos confirmaciones casi simultáneas del mismo
envío no pueden aplicarse dos veces.

## Por qué NO es un "pedido" atómico con equipos + ferretería juntos

Se consideró modelar cada envío como un pedido único (una tabla `traspasos`
con líneas de equipo y de ferretería, aceptado o rechazado como un todo). Se
descartó por ahora: el admin de hecho arma los envíos por separado (un
equipo o un lote de equipos del mismo tipo desde la pestaña Equipos, una
entrega de ferretería desde la pestaña Ferretería — nunca hay un botón que
junte ambas cosas en un solo formulario), y las bulk actions ya mandan un
equipo a la vez al servidor. Atarlos en un pedido único habría significado
rediseñar esos flujos sin que el admin lo hubiera pedido. El técnico igual
ve todo junto en una sola pantalla ("Traspasos por confirmar"), solo que
acepta/rechaza cada equipo y cada entrega de ferretería por su cuenta — si
más adelante hace falta que un envío grande se acepte o rechace todo junto,
es una tabla `traspasos` (cabecera) + líneas, sin tocar el resto del diseño.

## Por qué la aceptación del técnico NO pasa por la cola offline

`js/offline.js` del técnico (`encolar`) está pensado para acciones atadas a
una orden (tiene un `uuid` de por medio). Aceptar/rechazar un traspaso no
tiene una orden asociada — mismo caso que ya tenía `reportar.js` (ver
`reportes.md`). Se resolvió igual: llamada directa a `api()`, con el mismo
manejo de `ApiError.code === 'sin_conexion'` mostrando un mensaje de
"reintenta con señal" en vez de perder el clic.

## Alta de usuarios

`AdminUsuarioController::crear` (`POST /api/admin/usuarios`) — ver
`admin-api.md`. Reemplaza el flujo manual que documentaba `despliegue.md`
(que sigue vigente solo para sembrar el primer admin, porque hace falta
estar logueado para usar este endpoint).

## Migración de esquema en producción

Los cambios de esquema (columna nueva en `equipos`, valores nuevos en dos
ENUM, tabla nueva) se aplicaron a la base ya desplegada con un script de un
solo uso (`public_html/migrar_traspasos.php`, idempotente — mismo patrón que
`hash.php` en `despliegue.md`): se abrió una vez por HTTP y se borró
enseguida. `database/schema_fase1.sql` ya incluye estos cambios para
cualquier instalación nueva.
