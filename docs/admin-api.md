# API del panel admin · Fase 1

Capa de aplicación en `app/Services/{Auditoria,Bodega,Tarifario,Conflicto}Service.php` y `app/Controllers/Admin*Controller.php`, rutas en [`public_html/index.php`](../public_html/index.php). Todas requieren `Auth::requireAdmin()` — sesión con `rol = 'admin'`, hoy solo Edwin.

Validado end-to-end con una base SQLite real inyectada en `Database` por reflexión (mismo patrón de rigor que `database/tests/validate_schema.mjs`, pero ejercitando las clases PHP reales en vez de reimplementar las reglas): alta de equipos, wizard completo, auditoría, edición de tarifa y resolución de conflicto, 27/27 pasos correctos. No se deja ese arnés en el repo — es una prueba de humo, no parte del producto.

## Por qué existía este vacío y qué lo destapó

El wizard del técnico ya validaba contra la maleta y confirmaba consumo físico al enviar — pero **nada creaba esos equipos ni los asignaba a nadie**, y **ninguna orden podía pasar de `enviada` a `aprobada`**. Sin este panel, el sistema entero era inoperable desde el primer día: no había nada que escanear, y lo escaneado nunca se cerraba.

Construir la auditoría real reveló además un bug de concurrencia genuino: reabrir una orden rechazada para corregirla y reenviarla habría vuelto a descontar la ferretería y duplicar los movimientos de equipo. Se corrigió bloqueando la edición de materiales/ferretería una vez confirmado el consumo físico — ver la sección "Reabrir" más abajo.

## Auditoría (ya no tiene pantalla en el panel)

**Sin pestaña propia** desde el pedido *"elimina auditoria y crea un link de
historial ordenes vendidas y ordenes instaladas con fecha"* — Edwin decidió
que el paso de revisión manual antes de pagar ya no hace falta. Desde este
cambio, `OrdenWizardService::confirmarEnviada()` deja la orden directo en
`aprobada` (con `fecha_auditoria` = el mismo instante del envío, `auditor_id`
NULL — nadie la revisó a mano) en vez de dejarla `enviada` esperando cola.
Eso también confirma de inmediato la venta enlazada y hace que la orden ya
cuente para liquidar en Billetera. El reemplazo visual es
[Historial](#historial) más abajo — de solo lectura, sin botones de
aprobar/rechazar.

Todo lo de acá abajo (`AuditoriaService`, `AdminAuditoriaController`, las
rutas `/admin/ordenes/{id}/aprobar|rechazar|observar|reabrir`) **sigue
funcionando por dentro**, para una corrección manual puntual vía API — solo
se quitó `admin/js/views/auditoria.js` y el link de nav (mismo criterio que
con Conflictos, más abajo). En el uso normal del día a día no se llama a
nada de esto: toda orden que se envía sin chocar con un folio nace
`aprobada` sola.

```
GET  /api/admin/ordenes?estado=enviada&tecnico_id=2
→ { ordenes: [{ ...orden, tecnico_nombre, tipo_servicio_nombre, anomalias: [...] }] }
```

`estado` por defecto es `enviada`. Cada orden trae `anomalias`, una lista de señales (no un veredicto) para que el auditor sepa dónde mirar primero:

| anomalía | qué significa |
|---|---|
| `serie_ingresada_a_mano` | al menos un material de esta orden se tecleó, no se escaneó |
| `folio_en_conflicto` | la orden está en estado `conflicto` |
| `registrada_por_admin` | fue un registro retroactivo, no lo cargó el técnico en terreno |

Las miniaturas y el lightbox de fotos apuntan a `GET /api/fotos/{id}` — ver [tecnico-app.md](tecnico-app.md#hallazgo-real-corregido-las-fotos-no-tenían-cómo-servirse) por qué hizo falta agregar ese endpoint (las fotos viven fuera de `/public_html` a propósito).

```
GET  /api/admin/ordenes/{id}          → detalle completo (materiales, fotos, ferretería, anomalías)
POST /api/admin/ordenes/{id}/aprobar
POST /api/admin/ordenes/{id}/rechazar   { motivo, comentario?, descuenta_pago }
POST /api/admin/ordenes/{id}/observar   { comentario }
```

`descuenta_pago: true` → `rechazada_penalizada` (cierra sin pago). `false` → `rechazada_corregible` (el técnico puede corregir y reenviar — ver "Reabrir"). `motivo` es de texto libre en esta fase (`mala_instalacion`, `foto_ilegible`, `serie_incorrecta`, `datos_incompletos`, `no_corresponde` son los sugeridos en el diseño original, no una lista cerrada en la base).

```
POST /api/admin/ordenes/aprobar-masivo   { ids: [1, 2, 3] }
→ { resultados: [{ id, ok, motivo? }] }
```

Aprueba solo las que están en estado auditable y **sin ninguna anomalía**. Las demás quedan listadas como no procesadas, con el motivo — nunca se aborta el lote completo por una fila problemática. Deliberadamente no existe un "aprobar todo" sin este filtro: es la decisión que mantiene la auditoría real y no decorativa.

### Reabrir — el límite que evita el bug de doble consumo

```
POST /api/admin/ordenes/{id}/reabrir
```

Solo funciona sobre `rechazada_corregible`. Vuelve la orden a `borrador` y limpia el snapshot de monto — pero **no revierte nada del consumo físico ya confirmado** (equipos instalados/retirados, ferretería descontada). Desde ese momento, el wizard del técnico:

- **Bloquea** `agregarMaterial`, `quitarMaterial` y `registrarFerreteria` con `409 consumo_ya_confirmado`.
- **Permite** `agregarFoto`, `actualizarCierreTecnico` y un nuevo `enviar()`.

Un reenvío tras reabrir **no vuelve a descontar stock ni a duplicar movimientos** — `enviar()` detecta que ya existe un `movimientos_equipo` para esa orden y salta ese bloque entero. Esto cubre los motivos de rechazo más comunes (foto ilegible, datos incompletos). Si el rechazo fue por `serie_incorrecta` y de verdad hay que cambiar qué equipo quedó instalado, esa corrección la hace el administrador a mano desde bodega (`falla-fabrica` + reasignación) — no está automatizada en el wizard.

## Historial

Reemplaza a Auditoría en el nav (mismo pedido de arriba). Pantalla de solo
lectura en `admin/js/views/historial.js` — dos tablas, filtrables por
técnico y por rango de fechas:

```
GET /api/admin/historial?tecnico_id=&desde=&hasta=
→ { ventas: [{ ...venta, plan_nombre, vendedor_nombre }],
    ordenes: [{ ...orden, tecnico_nombre, tipo_servicio_nombre, venta_cliente_nombre }] }
```

`tecnico_id` filtra a la vez vendedor (ventas) y técnico ejecutor (órdenes)
— son la misma persona en este sistema. `desde`/`hasta` son `YYYY-MM-DD`
(`422 validacion` si no matchean ese formato); ambos opcionales, y cuando
faltan no se filtra por fecha. **Ventas** se filtra por fecha de venta
(`creado_en`) — la fecha de instalación pedida se muestra como columna
aparte, no como filtro. **Órdenes** se filtra por `fecha_trabajo_dispositivo`
(la fecha real del trabajo) y **muestra cualquier estado que no sea
`borrador`** — incluidas rechazadas y en conflicto, con su estado como
columna: es la única visibilidad que queda sobre `conflicto` ahora que
Auditoría no tiene pantalla (ver más abajo).

## Conflictos de sincronización

**Sin pestaña propia en el panel** (pedido: *"elimina la parte de
conflictos"* — se quitó `admin/js/views/conflictos.js`, el link de nav y la
ruta `#conflictos`; el endpoint y la lógica de abajo siguen intactos). Una
orden que cae en `conflicto` sigue existiendo — se ve y se filtra desde
[Historial](#historial) de arriba (columna Estado) — pero ya no hay una
pantalla dedicada con los botones "Invalidar"/"Aceptar"; resolver uno de
estos, hoy, es trabajo directo sobre la base o un ajuste a mano.

```
GET  /api/admin/conflictos                     → pendientes, con folio y técnico ya resueltos
POST /api/admin/conflictos/{id}/resolver        { accion: "invalidar" | "aceptar", comentario? }
```

- `invalidar`: la orden en conflicto era un duplicado real → `rechazada_penalizada`. No confirma nada físico — correcto, nunca debió contar como trabajo real.
- `aceptar`: era una reutilización legítima del folio (ej. visita de garantía) → se confirma como si el folio nunca hubiera chocado: snapshot de `monto_bruto`/`monto_tecnico`, equipos a `instalado`/`retirado`, descuento de ferretería y comisión de venta si corresponde (`OrdenWizardService::confirmarOrdenAceptadaTrasConflicto`, mismo camino interno que usan `enviar()` y `crearRetroactiva()` cuando el folio no choca — nunca duplicado entre los tres).

**Fix aplicado:** antes, `aceptar` solo cambiaba el `estado` a `enviada` sin calcular nada — la orden quedaba con `monto_bruto` NULL y sin descontar equipos ni ferretería, aunque después se aprobara en auditoría. Se corrigió extrayendo la lógica de confirmación (que ya existía en `enviar()`) a un método compartido, reutilizado también por `aceptar`. Validado en el arnés SQLite: aceptar un conflicto tanto del registro retroactivo como del wizard normal ahora calcula el monto y confirma equipos/stock correctamente; `invalidar` y un segundo intento de `aceptar` sobre un conflicto ya resuelto siguen comportándose igual que antes (17 pasos nuevos sobre el total de 49).

Recordatorio: la regla que decide qué entra a este buzón (`OrdenRepository::folioEnConflicto`) es una asunción de negocio marcada como pendiente de confirmar — ver [wizard-api.md](wizard-api.md#paso-5--enviar).

## Tarifario y comisiones

```
GET    /api/admin/tarifas
PUT    /api/admin/tarifas/{tipoServicioCodigo}          { monto }
PUT    /api/admin/tarifas/{tipoServicioCodigo}/nombre   { nombre }
DELETE /api/admin/tarifas/{tipoServicioCodigo}          → cierra la fila vigente sin reemplazarla

GET  /api/admin/comisiones
PUT  /api/admin/comisiones/{planCodigo}        { monto }
POST /api/admin/planes                         { codigo, nombre, comision_inicial }   → 201, alta de plan nuevo
PUT  /api/admin/planes/{planCodigo}/activo     { activo: true|false }   → "borrar" un plan (el panel solo manda false — ver más abajo)
PUT  /api/admin/planes/{planCodigo}/nombre     { nombre }

GET    /api/admin/tarifas-instalacion                → TODOS los planes activos, con o sin fila vigente (monto null si no tienen)
PUT    /api/admin/tarifas-instalacion/{planCodigo}   { monto }
DELETE /api/admin/tarifas-instalacion/{planCodigo}   → cierra la fila vigente sin reemplazarla
```

Editar **nunca** hace `UPDATE` sobre el monto vigente: cierra la fila (`vigente_hasta = ahora`) y crea una nueva. Se probó explícitamente que una orden ya aprobada conserva su `monto_bruto` original después de subir el precio — es la garantía central del versionado.

**Instalación por plan** (confirmado por Edwin: *"los planes van subiendo por cantidad de decos"*) — `tarifas_instalacion_plan`, mismo patrón versionado que lo de arriba, pero indexada por `plan_id` en vez de `tipo_servicio_id`. Cada plan ya trae su cantidad de decos en el nombre (`Plan Básico 2 Decos`), así que no hace falta pedirle nada nuevo al técnico: si una orden de **`instalacion_nueva`** tiene `venta_id` y ese plan tiene una fila vigente acá, `monto_bruto` sale de ahí; si no (orden sin venta, o un plan que todavía no tiene fila), sigue cayendo al monto plano de `tarifas_servicio` como siempre (`OrdenWizardService::calcularMontoBruto`). Los demás tipos de servicio (soporte, retiro, adicional) no varían por plan — solo `instalacion_nueva`. El endpoint `PUT` sirve tanto para crear la primera fila de un plan como para editar una ya existente (mismo `cerrarYCrear`).

**Alta de planes** (pedido: *"que al elegir el plan venga los planes que hay"* — antes solo existía `plan_full`, sembrado en el schema, sin ninguna forma de agregar otro salvo tocar la base a mano). `POST /admin/planes` crea el plan Y su primera comisión vigente en la misma transacción — un plan sin comisión no podría confirmar el monto de ninguna venta que lo use. Botón **"+ Agregar nuevo plan"** al fondo de la tabla "Comisiones por plan" (pedido: *"en cada final de cada campo que aparezca un boton para agregar nuevos planes"* — antes era un formulario fijo al fondo de toda la página; ahora es un modal, pegado a la tabla a la que corresponde). Recién ahí aparece en `GET /catalogo/planes`, el selector que usa `venta.js` del técnico.

**"Borrar" planes** (pedido: *"falta opcion de borrar planes"*, después *"que aplique a todos los planes o instalaciones de tarifario"*) es en realidad desactivar/cerrar, nunca un `DELETE` real de la fila — chocaría contra `comisiones_plan`/`tarifas_instalacion_plan` (todo plan tiene al menos una fila ahí desde que se crea) y contra `ventas.plan_id` si alguna vez se usó. Dos botones separados, ambos rojos y al lado de "Guardar" en su fila:

- **Comisiones por plan** ("Eliminar", con modal de confirmación): `PUT /admin/planes/{planCodigo}/activo` con `{activo: false}` — desactiva el plan entero (`planes.activo`, columna que ya existía en el schema pero nada la exponía). Desactivado, sale de `GET /catalogo/planes` (el selector de "Registrar venta" del técnico, vía `PlanRepository::activos()`) pero sigue intacto en Tarifario — `GET /admin/comisiones` sigue listándolo (con `plan_activo` en la fila), sin botón de acción ahí (**actualización** — pedido: *"que no se pueda reactivar si necesito algo lo vuelvo a ingresar no mas"*: el panel dejó de ofrecer "Reactivar"; el endpoint todavía acepta `{activo: true}` por si hace falta destrabarlo a mano). Un plan desactivado no se puede editar por `PUT /admin/comisiones/{codigo}` (`PlanRepository::porCodigo` sigue filtrando `activo = 1`).
- **Instalación por plan** ("Eliminar", sin modal — es reversible con solo volver a usar "Agregar / actualizar"): `DELETE /admin/tarifas-instalacion/{planCodigo}` cierra la fila vigente de `tarifas_instalacion_plan` sin crear otra (`TarifaInstalacionPlanRepository::cerrarSinCrear`) — no toca el plan en sí, solo hace que esa instalación vuelva a cobrar el monto plano de `tarifas_servicio` hasta que alguien cargue un monto nuevo.
- **Tarifas por tipo de servicio** (pedido: *"que aplique igual para las Tarifas por tipo de servicio"* — "Eliminar" acá SÍ pasa por un modal de confirmación, a diferencia de las otras dos): `DELETE /admin/tarifas/{tipoServicioCodigo}` cierra la fila vigente de `tarifas_servicio` sin crear otra. A diferencia de instalación por plan, acá no hay un monto plano al que caer — es literalmente la tarifa que usa `OrdenWizardService::calcularMontoBruto` como fallback para todo lo demás. Sin fila vigente, cualquier técnico que intente cerrar una orden de ese tipo de servicio recibe `409 sin_tarifa_vigente` hasta que se cargue un monto nuevo — por eso el modal avisa esto explícitamente antes de confirmar.

Los tres botones "Eliminar" son rojos y viven en la misma fila que "Editar" (no debajo) — `.fila-tarifa-acciones` en vez de la `.celda-acciones` que usa Bodega, porque el `min-width: 124px` por botón de esa clase (pensado para textos largos como "Falla de fábrica") sería más ancho que toda la columna acá y forzaría el salto de línea que justamente se pidió evitar.

**Editar nombre y monto juntos, desde un modal** (pedido: *"eliminar esta parte [el formulario Plan+Monto aparte de Instalación por plan] en cambio un boton de editar que deje editar todos los campos ya sea nombre y valor del plan en todos los campos"*) — reemplaza el viejo mini-formulario embebido en cada fila (que solo dejaba tocar el monto; el nombre quedaba fijo desde que se creaba el plan/tipo de servicio). Las tres tablas usan el mismo botón **"Editar"** por fila → modal con Nombre + Monto, ambos pre-cargados con el valor actual:

- `PUT /admin/tarifas/{tipoServicioCodigo}/nombre` y `PUT /admin/planes/{planCodigo}/nombre` — nuevos, solo tocan la columna `nombre` (`codigo` nunca cambia, es lo que usa el resto del sistema para identificar la fila).
- El monto sigue el mismo `PUT` de siempre (`cerrarYCrear`, nunca `UPDATE`).
- Si el modal detecta que el nombre no cambió, no llama al endpoint de nombre; mismo criterio para el monto — evita crear una fila de historial nueva por una edición que no tocó el monto.

**"Instalación por plan" ahora lista TODOS los planes**, no solo los que ya tienen una fila vigente (`GET /admin/tarifas-instalacion`, `TarifaInstalacionPlanRepository::todosLosPlanesConTarifa`, `LEFT JOIN` desde `planes`) — un plan sin tarifa todavía muestra "— (monto plano)" en vez de no aparecer. Esto es lo que permitió sacar el selector de plan aparte: "Editar" en cualquier fila sirve tanto para ponerle su primera tarifa como para cambiar una que ya tenía.

## Bodega — equipos

```
GET  /api/admin/equipos?estado=bodega&tecnico_id=2&bodega_id=1
GET  /api/admin/equipos/buscar?q=8934                                                → coincidencia parcial de serie
GET  /api/admin/equipos/{id}/historial                                               → línea de tiempo completa (movimientos_equipo)
POST /api/admin/equipos                        { tipo_equipo, numero_serie, bodega_id } → alta, nace en 'bodega' de ESA bodega física
POST /api/admin/equipos/{id}/asignar            { tecnico_id }                        → 'bodega' → 'en_transito'
POST /api/admin/equipos/{id}/traspasar          { tecnico_destino_id }                → 'maleta' → 'en_transito'
POST /api/admin/equipos/{id}/cancelar-traspaso                                        → 'en_transito' → vuelve a donde estaba
POST /api/admin/equipos/{id}/falla-fabrica      { observacion? }                      → sale sin culpar al técnico
POST /api/admin/equipos/{id}/ingreso-bodega     { bodega_id }                          → 'retirado' → 'bodega' (la que elija el admin)

GET  /api/admin/bodegas                                                              → bodegas físicas activas
POST /api/admin/bodegas                        { nombre }                            → crear una nueva
GET  /api/admin/tecnicos/{id}/traspasos-pendientes                                   → base de la guía de despacho (ver bodegas-traspasos.md)
GET  /api/admin/indicadores                                                          → alimenta la pantalla de Inicio (#inicio, nueva pantalla de aterrizaje)
```

**Tiles de Inicio — actualizado** (pedido: *"que aqui sean botones accionables y que diga instalaciones este mes y otro ventas este mes eliminar rechazadas y a la derecha el valor en dinero que lo que llevamos"*). `instalaciones_mes` y `ventas_mes` (`{ n, monto }`) son nuevos: `instalaciones_mes` cuenta órdenes de `instalacion_nueva` creadas este mes con estado `aprobada`/`liquidada` (una rechazada no suma — por eso ya no hace falta un tile aparte de "Rechazadas") y `monto` es la suma de `monto_bruto` de esas mismas; `ventas_mes.n` cuenta TODAS las ventas registradas este mes (actividad de venta) pero `ventas_mes.monto` solo suma `monto_comision` de las ya instaladas (una venta `registrada` todavía no tiene comisión confirmada). Cada tile del panel es ahora un link a Historial, no un `<div>` decorativo.

**`asignar`/`traspasar` ya no aplican al toque — quedan pendientes de que el técnico confirme** (ver [bodegas-traspasos.md](bodegas-traspasos.md) para el diseño completo). El equipo pasa a `en_transito` con `usuario_actual_id` ya apuntando al técnico destino (se ve "en camino" en la tabla) hasta que él lo acepta o lo rechaza desde `/api/mis-traspasos/*`. `cancelar-traspaso` es la salida del admin si se equivocó de técnico y todavía no confirmó nada.

`ingreso-bodega` es deliberadamente una acción separada de la orden de retiro: el momento en que el técnico saca el equipo de la casa del cliente y el momento en que ese equipo llega físicamente a la bodega son dos eventos reales, no uno (puede pasar días después, cuando junta varios retiros en un viaje).

`traspasar` (respuesta 9) cubre el caso real de que un técnico le entregue un equipo a otro directamente en terreno, sin que ninguno pise la bodega ese día — antes de esto, la única forma de mover un equipo entre maletas pasaba por `asignar`, que asume que viene de bodega. La fila de `movimientos_equipo` (tipo `traspaso_pendiente` al enviar, `traspaso` al confirmar) guarda origen y destino — la trazabilidad completa, no un salto que parezca que el equipo pasó por bodega sin haberlo hecho.

**Escáner de código de barras en el alta** (reporte #4) — botón "📷 Escanear" junto al campo de N° de serie, misma librería vendorizada que usa la app técnico (`html5-qrcode`, copiada a `public_html/admin/js/vendor/` — duplicada, no compartida entre apps, mismo criterio de siempre). Sin cámara disponible (típico en un panel de escritorio), cae solo al mensaje de "escribe la serie a mano" — nunca bloquea el alta.

**Selección múltiple + acción masiva** (reporte #5) — checkbox por fila en `bodega` o `maleta` (no en `en_transito`: ya está en camino, no hay nada que seleccionar); al seleccionar aparece una barra con la acción que corresponde (Enviar si todos están en `bodega`, Traspasar si todos están en `maleta`) y un único selector de técnico destino para todos. No hay endpoint masivo real en el servidor — se manda una llamada por equipo, una por una (cada una pasa igual por la cola offline si hace falta, y cada una queda pendiente de confirmación por separado); si se mezclan estados en la selección, la barra avisa que no se pueden mover juntos en vez de ofrecer una acción que no tiene sentido.

## Bodega — ferretería

```
GET  /api/admin/ferreteria/stock?tecnico_id=2                      → stock YA CONFIRMADO por cada técnico
GET  /api/admin/ferreteria/stock-central?bodega_id=1                → stock real en las bodegas físicas
POST /api/admin/ferreteria/ingreso              { item_codigo, bodega_id, cantidad, observacion? }  → compra/recepción — única forma de hacer crecer el stock central
POST /api/admin/ferreteria/entregar             { item_codigo, tecnico_id, cantidad, bodega_id }   → descuenta el stock central YA (reserva); queda pendiente hasta que el técnico confirma
GET  /api/admin/ferreteria/pendientes                              → todo lo pendiente, de cualquier técnico
POST /api/admin/ferreteria/pendientes/{id}/cancelar                → el admin cancela y reingresa el stock a la bodega
```

`entregar` ya no acredita nada al técnico al toque — crea una fila en `entregas_ferreteria_pendientes` y recién se aplica a `stock_ferreteria_usuario`/`movimientos_ferreteria` cuando el técnico confirma la cantidad recibida desde `/api/mis-traspasos/ferreteria/{id}/aceptar`. Pero el stock **central** sí se descuenta al crear la entrega (no al confirmarla) — ver [bodegas-traspasos.md](bodegas-traspasos.md) para por qué la asimetría con el flujo de equipos. Si el técnico rechaza o el admin cancela, se reingresa a la misma bodega.

**Kit estándar — eliminado del proyecto entero** (pedido: *"eliminar el kit standar de todo el proyecto que no exista"*). Ya no existe `kits_servicio_item`, ni `/admin/kits/*`, ni la pestaña "Kits estándar" del panel — el wizard del técnico venía sin usarlo desde antes (busca y agrega cada ítem a mano, ver `tecnico-app.md` paso 4) y esto era el resto sin limpiar. `OrdenWizardService::resolverItemsFerreteria` ya no tiene ningún fallback: si no llega ningún ítem, la orden simplemente no consumió ferretería.

## Catálogo — tipos de equipo e ítems de ferretería

```
GET    /api/admin/catalogo/tipos-equipo
POST   /api/admin/catalogo/tipos-equipo           { codigo, nombre }                    → 201
PUT    /api/admin/catalogo/tipos-equipo/{id}      { codigo, nombre }                    → 200
DELETE /api/admin/catalogo/tipos-equipo/{id}                                            → 200
GET    /api/admin/catalogo/items-ferreteria
POST   /api/admin/catalogo/items-ferreteria       { codigo, nombre, unidad_medida? }    → 201, unidad_medida: "unidad"|"metro" (default "unidad")
PUT    /api/admin/catalogo/items-ferreteria/{id}  { codigo, nombre, unidad_medida }     → 200
DELETE /api/admin/catalogo/items-ferreteria/{id}                                        → 200
```

Pedido: *"en bodega se puedan agregar nuevos items"* y *"se tienen que poder editar y borrar los que ya estaban"*. Pestaña "Catálogo" en el panel, dentro de Bodega. Permite crear, modificar nombre/código/unidad y borrar (o desactivar si tiene registros históricos asociados). `codigo` valida contra `^[a-z0-9_]+$` y tiene que ser único.

## Usuarios

```
GET  /api/admin/usuarios                                            → activos, sin password_hash
POST /api/admin/usuarios   { nombre, usuario, password, rol?, email?, porcentaje_reparto? }
```

El alta de técnicos (y de otros admins) ya no requiere tocar la base de datos a mano — antes era el único método (ver `docs/despliegue.md`, sección 5, que sigue aplicando solo para sembrar el PRIMER admin, porque para usar este endpoint hace falta ya estar logueado como uno). `usuario` se valida contra `^[a-z0-9_.]+$` (minúsculas, números, punto, guion bajo — el mismo formato con el que se loguea) y tiene que ser único; `password` se hashea con `password_hash()` antes de guardarse, nunca en claro. `rol` por defecto `'tecnico'`; `porcentaje_reparto` por defecto `100`.

## Registro retroactivo (respuesta 12)

```
POST /api/admin/ordenes/retroactiva
{
  tecnico_id, folio, tipo_servicio, fecha_trabajo,
  materiales: [{ numero_serie, accion: "instalado"|"retirado" }],
  ferreteria?: [{ item_ferreteria_id, cantidad_final }],   // vacío → sin ferretería consumida
  venta_id?, senal_porcentaje?, calidad_porcentaje?, metros_cable?, observaciones?
}
→ 201 orden completa (estado 'enviada' o 'conflicto')

GET  /api/admin/ventas/pendientes?tecnico_id=2   → ventas 'registrada' de ESE técnico, para el selector de venta_id
GET  /api/admin/ventas/pendientes-instalar       → TODAS las ventas 'registrada', de cualquier técnico, ordenadas por fecha_instalacion_solicitada (las sin fecha van al final) — alimenta "Ventas pendientes de instalar" en Inicio
```

Para cuando el técnico hizo el trabajo sin pasar por el wizard del celular (se le cayó la app, se olvidó el teléfono, reporte en papel) y Edwin lo carga después desde el PC. Implementado en `OrdenWizardService::crearRetroactiva()`, compartiendo con `enviar()` — nunca duplicando — las mismas reglas sobre maleta, ferretería, tarifa vigente, folio en conflicto y confirmación de venta.

Decisiones de diseño:

- **No exige fotos ni GPS.** Si el trabajo se hizo sin el wizard, tampoco existen fotos capturadas por su cámara — exigirlas acá solo bloquearía el registro sin ganar evidencia real. Por eso queda marcada como `registrada_por_admin` en la cola de auditoría (ver tabla de anomalías más arriba): es una señal para que el auditor la mire con más cuidado, no un bloqueo.
- **`fecha_trabajo` es obligatoria y no puede ser futura** — es el dato que existe precisamente porque el envío al server llega días después de que el trabajo ocurrió.
- **No hay pasos 1-5**: todo llega en un solo request y la orden nace directo en `enviada` (o `conflicto`), sin pasar por `borrador`.
- **`uuid_dispositivo` se genera en el servidor** (UUID v4) — no viene de un celular.
- Sigue aplicando la regla dura de la maleta: para "instalar" el equipo debe estar en la maleta de ESE técnico; para "retirar" debe figurar `instalado`. El admin no puede saltarse el estado físico del inventario.
- **Los materiales y la ferretería quedan guardados aunque el folio esté en conflicto** (solo se difiere el snapshot de monto y la confirmación física) — así, si el admin acepta el conflicto después, hay de dónde confirmarlo. Ver el fix de "Conflictos de sincronización" más abajo.

Validado en el mismo arnés SQLite mencionado arriba: instalación normal con kit por defecto, rechazo por equipo en maleta ajena, rechazo por fecha futura, rechazo por técnico inactivo, rechazo por falta de tarifa vigente (rollback completo de la transacción, sin dejar nada a medias), folio en conflicto (guarda materiales/ferretería pero no confirma consumo ni monto), venta propia confirmando su comisión, e idempotencia de `confirmarConsumoFisico` — 49/49 pasos, incluida una repetición del flujo normal del wizard para confirmar que el refactor compartido no lo rompió.

**Pendiente de decisión de negocio, no de código:** la falta de fotos/GPS deja estas órdenes con menos evidencia que las del wizard normal. Si Edwin quiere un límite adicional (ej. que un registro retroactivo nunca se apruebe en el lote masivo, o que requiera un comentario obligatorio), es un ajuste chico sobre `AuditoriaService::aprobarMasivo()` — hoy `registrada_por_admin` ya la excluye de "aprobar masivo" por ser una anomalía, así que ese límite ya existe de hecho.

## Cola de escritura offline del panel admin (`public_html/admin/js/db.js`, `js/offline.js`)

Mismo mecanismo que la app técnico (ver [tecnico-app.md](tecnico-app.md)), adaptado a que este panel es una herramienta de escritorio que se deja abierta — no una PWA instalable, así que no tiene service worker ni Background Sync: la cola se vacía sola con el evento `online` de la pestaña o al recargar.

**Diferencia clave con el técnico:** acá TODAS las escrituras se pueden encolar sin excepción. El técnico tenía un caso irresoluble (escanear "retirar" sin poder confirmar el `equipo_id` contra ninguna caché local); el admin no — cada acción de escritura apunta a un id que ya está en pantalla (la fila ya se cargó con señal), así que no hay nada que preguntarle al servidor para saber "a qué le estoy escribiendo".

Cubre las acciones de escritura del panel — entre ellas: editar/eliminar tarifa, editar/eliminar comisión, editar/eliminar instalación por plan, crear/desactivar plan (Tarifario) · alta de equipo, asignar, traspasar, falla de fábrica, ingreso a bodega, entregar ferretería, crear tipo de equipo, crear ítem de ferretería (Bodega) · cerrar período, registrar pago, registrar ajuste (Billetera, ver [liquidacion-billetera.md](liquidacion-billetera.md)). Nota: esta lista no se actualiza en cada cambio — ver `TIPOS_COALESCIBLES`/`RUTAS` en `public_html/admin/js/offline.js` para la lista real y vigente. Tarifas/comisiones se coalescen por código (editar dos veces sin conexión antes de que la primera se mande reemplaza a la anterior, no se apila) — el resto, incluidas las tres de Billetera, son acciones de una sola vez que nunca se pisan entre sí.

**Optimista, pero simple a propósito:** en vez de reconstruir el objeto exacto que devolvería el servidor (anomalías recalculadas, estados derivados, etc. — lo que sí hizo falta en el wizard porque el técnico no puede avanzar sin esos datos), acá alcanza con sacar la fila resuelta de la lista actual o marcarla "pendiente" — el admin no está bloqueado por ningún flujo secuencial, solo necesita saber "esto ya lo mandé, seguirá cuando vuelva la señal" y poder seguir trabajando el resto de la cola en pantalla.

**Validado end-to-end en un navegador real** interceptando `fetch`: aprobar una orden sin conexión (desaparece de la lista, badge de pendientes en el topbar), editar la misma tarifa dos veces sin conexión (coalescencia confirmada — solo se mandó el último valor), y dar de alta un equipo sin conexión — al restaurar la señal, `procesarCola()` mandó las tres acciones en orden y el servidor terminó con la orden aprobada, la tarifa en el último monto editado, y el equipo dado de alta.

## Lo que sigue fuera de esta fase

- **Liquidación mensual y billetera** — implementada como Fase 2 (ver [liquidacion-billetera.md](liquidacion-billetera.md)).
- **Ítem de ferretería fuera del kit** — implementado (ver [tecnico-app.md](tecnico-app.md), sección "Ferretería + cierre (paso 4)").
- **Reconciliación en vivo de pantallas abiertas** — si el admin y un técnico tienen la misma orden abierta al mismo tiempo, no hay ningún mecanismo (websocket, polling) que le avise a uno que el otro la cambió; se entera recién al recargar.
