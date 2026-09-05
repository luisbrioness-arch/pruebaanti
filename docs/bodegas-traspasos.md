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
ve todo junto en una sola pantalla ("Mi bodega" → botón "📦 Bodega" en
Inicio, pedido explícito: *"la app de técnico tiene que tener un botón de
bodega para revisar si hay traspasos a su bodega"*), solo que
acepta/rechaza cada equipo y cada entrega de ferretería por su cuenta — si
más adelante hace falta que un envío grande se acepte o rechace todo junto,
es una tabla `traspasos` (cabecera) + líneas, sin tocar el resto del diseño.

**"Mi bodega" también muestra la maleta confirmada, no solo lo pendiente**
— debajo de "Traspasos por confirmar" hay una sección de solo lectura ("Mi
maleta ahora mismo") con los equipos y la ferretería que ya son suyos de
verdad. No hizo falta ningún endpoint nuevo: reusa `GET /api/maleta`
(`CatalogoController::maleta`), que ya existía para la validación offline
del wizard — mismo dato, una pantalla más que lo muestra.

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

## Bodegas físicas de verdad (segunda vuelta)

Pedido posterior: *"que el administrador tenga acceso a una bodega
principal, y que se puedan ver las bodegas de los técnicos"* + *"tenemos
que tener 'bodegas' — una central […] y una para cada técnico"*.

Se agregó la tabla `bodegas` (id, nombre, activa) — sembrada con **"Bodega
Central"** para que la instalación existente no tuviera que elegir nada.
Cada equipo en estado `bodega` (o `en_transito` viniendo de una bodega, no
de otro técnico) sabe de cuál — `equipos.bodega_id`. Ese dato se **conserva
sin tocar** mientras el equipo pasa por `en_transito`: así, si el técnico
rechaza el envío o el admin lo cancela, ya está resuelto a cuál bodega
devolverlo, sin tener que volver a preguntarlo (`BodegaService::asignarAMaleta`
guarda el `bodega_id` de origen; `cancelarTraspasoEquipo`/`rechazarEquipo`
solo lo leen de vuelta).

Panel admin → **Bodega → Ubicaciones** (antes "Bodegas" — se renombró para
no confundirse con el nombre de la sección entera, ver "Reorganización de
menús" más abajo): crear más bodegas físicas (ej. si abren sucursal en otra
ciudad). Al dar de alta un equipo o hacer un ingreso de ferretería, ahora
hay que elegir a cuál bodega entra.

Panel admin → **Bodega → Bodega técnicos** (submenú de nivel 1, junto a
"Bodega principal" — ver "Reorganización de menús" más abajo): elegís un
técnico y ves de un vistazo su maleta completa (equipos) y su stock de
ferretería ya confirmado — reusa los mismos endpoints que ya existían
(`GET /admin/equipos?estado=maleta&tecnico_id=`,
`GET /admin/ferreteria/stock?tecnico_id=`), sin backend nuevo.

## Reorganización de menús (pedido: "mejora estos menus que sean mas
intuitivos y que arriba solo sea bodega - bodega tecnicos", ajustado
después a "que dentro de bodega existan 2 submenu uno de bodega principal
y otro bodega tecnicos")

El nav de arriba tenía un solo ítem "Bodega" con seis pestañas debajo
(Equipos, Ferretería, Kits estándar, Buscar por serie, Bodegas, Bodegas de
técnicos) — mezclaba inventario general con la pregunta "¿qué tiene ESTE
técnico?", que es un punto de partida distinto. El primer intento sacó
"Bodega técnicos" a su propio ítem de nav; el pedido siguiente lo devolvió
adentro de "Bodega", pero como su propio submenú de primer nivel en vez de
una pestaña más entre seis. Quedó así — **"Bodega" (nav de arriba) → dos
submenús de nivel 1**:

- **"Bodega principal"**: las 6 pestañas de siempre (nivel 2), con dos
  agregados:
  - **"Catálogo"** (pestaña nueva): antes no había forma de crear un tipo
    de equipo o ítem de ferretería nuevo sin tocar la base a mano — solo
    se podía dar de alta una serie/cantidad de un tipo que YA existía. Ver
    `docs/admin-api.md`.
  - **"Asignar a técnicos"** (pestaña nueva): el "Enviar"/"Traspasar" que
    antes vivía embebido en cada fila de Equipos se saca de ahí — Equipos
    pasa a ser solo inventario (ver, filtrar, dar de alta, falla de
    fábrica), y asignar/traspasar (con selección masiva) vive en un solo
    lugar.
  - "Bodegas" → **"Ubicaciones"**: mismo contenido, nombre menos confuso
    junto al "Bodega" del nav de arriba.
- **"Bodega técnicos"**: antes la pestaña "Bodegas de técnicos" (y, por un
  momento, su propio ítem de nav) — misma lógica de siempre, ahora vive
  como submenú dentro de `admin/js/views/bodega.js`
  (`renderVistaTecnicos`/`cargarBodegaTecnico`), no en un archivo aparte.
  Deep link: `#bodega?vista=tecnicos` (el acceso rápido de Inicio apunta
  ahí). `#bodega?tab=asignar` (implica `vista=principal`) sigue siendo el
  link que usa la tabla de Equipos para mandar a "Asignar a técnicos".
- **"Kits estándar" desapareció** — pedido aparte, ver "Kit estándar" en
  `docs/admin-api.md`.

## Stock de ferretería central, trackeado de verdad (antes no existía)

Hasta acá, la ferretería "de bodega" no estaba en ninguna tabla — `entregar`
simplemente le acreditaba al técnico sin descontarle a nadie, confiando en
que Edwin llevara la cuenta de memoria. Ahora:

- **`stock_ferreteria_central`** (bodega + ítem → cantidad) y
  **`movimientos_ferreteria_central`** (ledger: `ingreso`, `egreso_pendiente`,
  `reingreso_rechazo`, `ajuste_descuadre`) — mismo patrón de siempre
  (materializada + historial).
- **Ingreso real** (`POST /admin/ferreteria/ingreso`) es la ÚNICA forma de
  hacer crecer el stock central — compra, recepción de TuVes.
- **`entregarFerreteria` ahora descuenta del stock central AL MOMENTO DE
  CREAR la entrega pendiente**, no al confirmarla — a diferencia de los
  equipos (que se "reservan" solo cambiando de estado), acá no hay una fila
  que reservar, así que el descuento tiene que pasar ya, con
  `SELECT ... FOR UPDATE` (`StockFerreteriaCentralRepository::debitarSiAlcanza`)
  para que dos entregas casi simultáneas del mismo ítem no manden más de lo
  que hay. Si no alcanza, `409 stock_insuficiente` y no se crea nada.
- Si el técnico **rechaza** o el admin **cancela**, se reingresa a la MISMA
  bodega que lo había debitado (`entregas_ferreteria_pendientes.bodega_id`
  guarda cuál).
- El stock **del técnico** (`stock_ferreteria_usuario`) sigue sin tocarse
  hasta que él confirma — eso no cambió.

## Guía de despacho

Pedido: *"generar guías de despacho al realizar traspaso de bodega a
técnicos"*. Se implementó como un **comprobante interno imprimible**, no
como un documento tributario (no reemplaza una guía SII real si algún día
hiciera falta transportar mercadería comercialmente — este sistema no tiene
ni necesita ese circuito).

Desde **Bodega → Bodega técnicos**, al elegir un técnico aparece "Ver
guía de despacho pendiente" → `#guia?tecnicoId=N` (`admin/js/views/guia.js`),
que lista TODO lo que ese técnico tiene pendiente de confirmar en ese
momento (equipos `en_transito` + ferretería pendiente — mismo shape que
`/api/mis-traspasos`, pero para un `tecnico_id` arbitrario vía
`GET /admin/tecnicos/{id}/traspasos-pendientes`, admin-only). Botón
"Imprimir" llama `window.print()`; `@media print` en `admin.css` oculta la
barra de navegación y deja solo el documento.

No se modeló como un "pedido" con snapshot fijo (ver más arriba, "Por qué NO
es un pedido atómico") — la guía siempre muestra el estado ACTUAL de lo
pendiente, no una foto congelada del momento en que se imprimió.

## Dashboard de indicadores → pantalla de Inicio

`GET /admin/indicadores` (`IndicadoresService`) — agregados de solo lectura
sobre tablas que ya existían (`COUNT`/`SUM` directos, sin tabla nueva):
instalaciones y ventas del mes (con su monto), total del mes real (monto
técnico de órdenes aprobadas/liquidadas de cualquier tipo + comisión de
ventas ya instaladas — reemplaza a un antiguo "Liquidado" que dependía de
un cierre manual de billetera y casi siempre daba $0), equipos por estado,
ferretería pendiente de confirmar, traspasos y entregas rechazados en los
últimos 30 días, más contadores que NO son del mes sino de la cola de
trabajo real ahora mismo (ventas sin instalar todavía, conflictos sin
resolver — el de "órdenes esperando auditoría" se sacó de acá, ver más
abajo) y los mismos avisos de "3+ días sin confirmar" que ya se ven en
Bodega, más una versión sin ese umbral (reporte #19: "que aqui tambien
aparezca si un tecnico no ha aceptado algun traspaso") para los traspasos
de equipo recién enviados que todavía no llegan a ser urgentes. El aviso de
saldo pendiente en billetera se sacó de acá (reporte #19: "que esto no sea
algo importante") junto con la simplificación de Billetera (ver más abajo).

Nació como una pestaña separada "Indicadores" y se fusionó en **Inicio**
(pedido: *"falta una pantalla de inicio con accesos a las otras partes y con
información importante"*) — ahora es la pantalla de aterrizaje por defecto
(`admin/js/views/inicio.js`, ruta `#inicio`, reemplaza a `#auditoria` como
default en `router.js` y como destino de `topbar-marca`). Combina accesos
directos a cada sección (tarjetas grandes) con una lista de alertas
accionables (solo se muestran las que tienen algo pendiente, cada una linkea
a la pantalla que corresponde), una tabla de **"Ventas pendientes de
instalar"** (ver abajo) y un resumen chico del mes — no reemplaza
Historial/Bodega/Billetera para el trabajo del día a día, es el primer
vistazo antes de entrar a cualquiera de ellas.

## Ventas pendientes de instalar (en Inicio)

Pedido: *"si creamos una venta que aparezca en el dashboard del edwin como
pendiente de instalar dependiendo de la fecha de instalación solicitada por
el cliente"*. `ventas.fecha_instalacion_solicitada` (opcional) es lo que el
técnico carga al registrar la venta — no bloquea el registro si no la sabe
todavía.

`GET /admin/ventas/pendientes-instalar` (`VentaRepository::pendientesInstalarTodas`)
trae TODAS las ventas en estado `registrada` (de cualquier técnico, no solo
uno), ordenadas por esa fecha — las vencidas y las más próximas primero, las
sin fecha cargada al final (no desaparecen, solo quedan sin urgencia). El
front (`inicio.js`) calcula "vencida hace N días" / "hoy" / "en N días" en
el cliente, sin librería de fechas — mismo criterio de "3 días" que ya usan
los avisos de Bodega para marcar algo en rojo.

No hay ninguna acción posible desde esta tabla (no es un botón de "marcar
instalada") — una venta sale de la lista sola cuando la orden de instalación
que la enlaza (`orden.venta_id`) se envía y `confirmarVenta()` la pasa a
`estado = 'instalada'`, el mismo mecanismo que ya existía.

## Avisos de traspasos que llevan mucho tiempo sin confirmar

Sin infraestructura de notificaciones (push, email) en el sistema, el aviso
es puramente visual: en Bodega (equipos `en_transito` y ferretería
pendiente), un chip pasa de "⏳ esperando" (ámbar) a "⚠ esperando hace N
días" (rojo) a partir de `DIAS_AVISO_PENDIENTE = 3` días — calculado en el
cliente a partir de `actualizado_en`/`creado_en`, sin endpoint nuevo.

## Buscador por número de serie

**Bodega → Buscar por serie** — coincidencia parcial
(`GET /admin/equipos/buscar?q=`, `LIKE '%q%'`, máx. 30 resultados) y, al
elegir uno, su historial completo (`GET /admin/equipos/{id}/historial`) leído
directo de `movimientos_equipo` — el dato ya existía, solo faltaba una
pantalla para consultarlo por serie en vez de tener que saber en qué estado
filtrar.

## Rastreo de un equipo instalado, y bodega de "reversa"

Dos pedidos relacionados, ninguno necesitó tocar el esquema:

- **"Rastreo"** — botón nuevo en Equipos, solo para `estado = 'instalado'`.
  Abre un modal con el mismo `GET /admin/equipos/{id}/historial` que ya usaba
  "Buscar por serie", pero con un resumen arriba: quién lo instaló, cuándo, en
  qué orden y — si esa orden viene de una venta propia — cliente, dirección,
  teléfono y un link al mapa con el GPS que tomó el técnico al cerrar la
  orden. Una orden sin venta propia no tiene cliente registrado en el
  sistema (la ficha real sigue siendo la de TuVes); en ese caso solo se ve
  folio + técnico + GPS.

- **"Bodega de reversa"** (pedido: "nos falta una bodega de reversa donde
  lleguen los con falla, retiro o reparaciones") — antes, marcar un equipo
  "Falla de fábrica" lo dejaba con `bodega_id = NULL`: invisible en cualquier
  filtro por ubicación, sin forma de saber dónde estaba físicamente ni de
  reingresarlo después de repararlo. Ahora:
  - "Falla de fábrica" pide elegir a qué bodega llega (mismo selector que ya
    usaba el reingreso de un "retirado").
  - `ingresoABodega()` (el mismo endpoint que ya devolvía un "retirado" a
    stock bueno) ahora también acepta equipos en `falla_fabrica` — así un
    equipo reparado vuelve a `estado = 'bodega'` eligiendo destino, igual que
    un retiro.
  - No hace falta ninguna bodega "especial" en el código: el admin crea una
    bodega llamada como quiera (ej. "Bodega Reversa") desde **Ubicaciones**
    — ya existía ese formulario — y la elige en esos selectores como
    cualquier otra. `equipos.listar()` ya traía `bodega_nombre`, así que
    filtrar Equipos por esa bodega ya muestra fallas/retiros/reparaciones
    juntos, separados de la Bodega Central.

## Migración de esquema en producción

Los cambios de esquema (columna nueva en `equipos`, valores nuevos en dos
ENUM, tabla nueva) se aplicaron a la base ya desplegada con un script de un
solo uso (`public_html/migrar_traspasos.php`, idempotente — mismo patrón que
`hash.php` en `despliegue.md`): se abrió una vez por HTTP y se borró
enseguida. `database/schema_fase1.sql` ya incluye estos cambios para
cualquier instalación nueva.
