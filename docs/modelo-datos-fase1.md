# Modelo de datos · Fase 1

Esquema completo en [`database/schema_fase1.sql`](../database/schema_fase1.sql). Validado ejecutablemente en [`database/tests/validate_schema.mjs`](../database/tests/validate_schema.mjs) contra tres casos reales (instalación, venta con instalación derivada, retiro parcial) — correr con `node database/tests/validate_schema.mjs`. Este documento explica las decisiones que no son obvias leyendo el SQL solo.

## Alcance

Incluye: usuarios, tarifario versionado, inventario serializado, ferretería por cantidad, órdenes de trabajo, evidencia fotográfica, conflictos de sincronización, y un módulo mínimo de ventas (`planes`, `comisiones_plan`, `ventas`) **adelantado desde Fase 2**.

Ese adelanto no estaba en el plan original — se agregó al validar el caso de venta y encontrar que la tabla no existía. Se justifica porque el técnico único de Fase 1 ya vende e instala hoy, a veces el mismo día (respuestas 11, 21, 23); sin `ventas`, no hay forma de saber qué instalación vino de una venta propia, aunque solo haya una persona operando. Lo que sigue en Fase 2, sin cambios a lo ya construido: reparto por porcentaje real entre varios técnicos, billetera, liquidación, control de stock físico. Los campos que ya los anticipan (`ordenes.periodo_liquidacion_id`, `usuarios.porcentaje_reparto`) están declarados desde ahora para no alterar tablas ya en producción cuando llegue el segundo técnico.

## Diagrama de relaciones (Fase 1)

```
usuarios ──┬─< equipos (usuario_actual_id)
           ├─< movimientos_equipo (origen / destino)
           ├─< stock_ferreteria_usuario
           ├─< movimientos_ferreteria
           └─< ordenes (tecnico_id, auditor_id)

tipos_servicio ──┬─< tarifas_servicio (versionado)
                 ├─< tipos_servicio_foto_requisito
                 └─< ordenes

tipos_equipo ──< equipos ──┬─< movimientos_equipo
                            └─< orden_materiales >── ordenes

items_ferreteria ──┬─< stock_ferreteria_usuario
                    ├─< movimientos_ferreteria
                    └─< orden_ferreteria >── ordenes

planes ──< comisiones_plan (versionado, mismo patrón que tarifas_servicio)
planes ──< ventas ──> usuarios (vendedor_id)
ventas ──< ordenes (venta_id · opcional, se enlaza al crear la instalación)

ordenes ──┬─< orden_materiales
          ├─< orden_ferreteria
          ├─< orden_fotos ──> equipos (solo en retiro)
          └─< conflictos_sincronizacion
```

## Cuatro decisiones que sostienen todo lo demás

### 1. Snapshot en la orden, no referencia viva al tarifario

`ordenes.monto_bruto`, `porcentaje_aplicado` y `monto_tecnico` son copias congeladas al momento de aprobar, no columnas calculadas ni JOIN contra `tarifas_servicio` / `usuarios.porcentaje_reparto`.

**Por qué:** si Edwin sube el precio de una instalación en octubre, las órdenes de septiembre no pueden moverse. Guardar el snapshot en la fila hace esa garantía automática — no depende de que nadie recuerde filtrar por fecha en un reporte.

`tarifas_servicio` sigue existiendo como tabla de versiones (con `vigente_desde` / `vigente_hasta`) porque igual se necesita saber "qué tarifa regía tal día" para auditoría, pero la orden ya no depende de consultarla después de aprobada.

### 2. `movimientos_equipo` y `movimientos_ferreteria` son la fuente de verdad; el estado actual es una foto

`equipos.estado` y `stock_ferreteria_usuario.cantidad_actual` son columnas materializadas por rendimiento — se leen en cada pantalla del wizard y recalcularlas desde cero en cada carga sería lento en hosting compartido. Pero **nunca se editan directo**: todo cambio pasa por insertar una fila en la tabla de movimientos, y un trigger o la capa de aplicación actualiza la foto.

**Por qué:** es el mismo principio que ya cerramos para la billetera — "cuando alguien reclame, tiene que existir la línea con fecha y motivo". Un decodificador que aparece "perdido" sin una fila en `movimientos_equipo` que lo explique es un dato en el que no se puede confiar.

### 3. `uuid_dispositivo` para idempotencia, `folio` deliberadamente no-único

El celular genera un UUID al crear el borrador (paso 1 del wizard). Ese es el identificador real de la orden ante el servidor. Si "Enviar" se dispara dos veces por mala señal, el servidor ve el mismo UUID y no duplica.

El `folio` sí puede repetirse en la tabla — a propósito. Es un dato que viene de terreno y dos técnicos sin señal pueden escanear folios que resultan coincidir al sincronizar. Rechazar ese INSERT en la base sería perder trabajo ya hecho. En cambio, la capa de aplicación detecta el folio repetido al sincronizar y crea una fila en `conflictos_sincronizacion`, dejando la orden en estado `conflicto` — visible, no perdida, no liquidable hasta que Edwin la resuelva.

### 4. Evidencia fotográfica: catálogo fijo para instalación/reparación, generado para retiro

`tipos_servicio_foto_requisito` define los slots fijos (antena, decodificador principal) para los servicios donde siempre son las mismas dos fotos. Retiro tiene `fotos_dinamicas = 1` en `tipos_servicio` y no tiene filas en esa tabla — sus fotos salen de `orden_fotos.equipo_id`, una fila por cada equipo que el técnico escaneó como retirado. La app arma los slots en el momento, no desde un catálogo.

`orden_fotos.subida_en` es el campo que gobierna cuándo el celular puede borrar su copia local de la foto — nunca antes de que tenga valor. Y `archivada` es el campo que ejecuta la regla de retención de un año: pasado ese plazo, un proceso mueve el archivo fuera del hosting y marca la fila, sin borrar el registro ni la ruta histórica.

## Ferretería: por qué existe `cantidad_estandar` junto a `cantidad_final`

En `orden_ferreteria` se guardan ambos valores siempre, incluso cuando el técnico no tocó nada. Así el histórico queda parejo: no hay que distinguir "órdenes con ajuste" de "órdenes sin ajuste" para sumar consumo real. `ajustado_manualmente` es solo la marca visual para que el control de stock (Fase 3) sepa dónde mirar primero.

## Lo que salió de validar venta y retiro

### Venta: el enlace es de la orden hacia la venta, no al revés

`ordenes.venta_id` es la única dirección del vínculo. No existe `ventas.orden_instalacion_id` — sería una columna redundante, y guardar el mismo dato en dos lugares es exactamente lo que se evitó con los snapshots (una sola fuente de verdad, todo lo demás se consulta). Para saber qué orden instaló una venta: `SELECT * FROM ordenes WHERE venta_id = ?`.

`venta_id` es **nullable** a propósito: no toda orden viene de una venta propia (folios asignados individualmente, respuesta 11), y no toda venta se instala de inmediato — puede quedar `registrada` sin ninguna orden asociada por un tiempo, sin que eso sea un error (`estado='registrada'` es un estado válido en reposo, no una falla). El plazo de hasta 3 días entre venta e instalación (respuesta 21) no se fuerza en la base: es una alerta de aplicación, no una restricción — forzarla en el esquema impediría registrar una instalación tardía real, que es justo el tipo de dato que después hay que poder auditar, no rechazar.

### Venta: la comisión se confirma en el mismo momento que el monto de la orden

El paso 5 del wizard de instalación (cuando `orden.venta_id` no es nulo) hace dos snapshots en el mismo instante: el de la orden (`monto_bruto`, `monto_tecnico`) y el de la venta (`monto_comision`, `monto_vendedor`), ambos tomando el porcentaje vigente del mismo usuario. Es deliberado que sea un solo momento — evita que exista un estado intermedio donde la orden ya diga "enviada" pero la venta todavía no sepa que se instaló.

**`monto_bruto` de una `instalacion_nueva` con venta enlazada no siempre sale de `tarifas_servicio`** (confirmado: "los planes van subiendo por cantidad de decos") — si el plan de esa venta tiene una fila vigente en `tarifas_instalacion_plan`, se usa esa en su lugar; si no, cae al monto plano de `tarifas_servicio` como cualquier otro tipo de servicio. Ver [admin-api.md](admin-api.md#tarifario-y-comisiones) y `OrdenWizardService::calcularMontoBruto`.

### Retiro: la orden no lleva el equipo hasta bodega, solo hasta "retirado"

El retiro físico ocurre en dos tiempos que la orden no puede fusionar: el técnico saca el equipo de la casa del cliente (eso es lo que la orden certifica y paga), y en algún momento posterior ese equipo llega físicamente a la bodega — a veces el mismo día, a veces días después, en un viaje que junta el retiro de varios clientes. Por eso `equipos.estado` pasa a `retirado` al enviar la orden, y solo un movimiento `ingreso_bodega` posterior — sin relación con ninguna orden — lo mueve a `bodega`. Tratar esto como un solo paso habría obligado a inventar una ficción ("se recibió en bodega a las 11:03, al mismo tiempo que se retiró") que no corresponde a lo que pasa en la realidad.

### Retiro parcial: cada equipo escaneado es independiente, no hay "la orden completa"

Nada en el esquema exige que un retiro se lleve todos los equipos que quedaron instalados en una dirección. `orden_materiales` es una fila por equipo, así que retirar 2 de 3 (dejar la tarjeta perdida sin retirar, por ejemplo) es simplemente 2 filas en lugar de 3 — no un caso especial. Es la misma razón por la que las fotos de retiro son dinámicas (`tipos_servicio.fotos_dinamicas`): la cantidad de evidencia depende de lo que efectivamente se escaneó, nunca de un número fijo esperado.

### Dos validaciones que el esquema no hace y quedan explícitamente del lado de la aplicación

Ninguna es un defecto — son el mismo tipo de decisión que ya se tomó con el stock de ferretería (ver más abajo): MySQL en hosting compartido no siempre soporta `CHECK` de forma confiable, así que la regla de negocio vive en el código, no en la base.

- **Nada impide crear una orden de retiro sobre un equipo que no está `instalado`.** La FK solo exige que el equipo exista, no que su estado sea coherente con la acción. La app debe impedir escanear como "retirado" algo que ya está en `bodega` o `perdido`.
- **Nada impide vender dos veces el mismo plan al mismo cliente**, más allá de que `numero_venta_tuves` sea único — si TuVes emite dos números distintos para el mismo cliente (error humano), la base no lo detecta. Es exactamente el fraude de "RUT repetido" mencionado en la fase de diseño. `ventas.cliente_rut` ahora existe (se agregó después, opcional — ver `wizard-api.md`), pero **no es obligatorio ni único a nivel de base** (un vendedor puede dejarlo vacío), así que sigue sin haber una restricción real: la única defensa posible sigue siendo una alerta de aplicación, ahora con la opción de comparar por RUT cuando esté cargado, además de `cliente_nombre` + `comuna` — no construida todavía.

## Lo que esta fase deja preparado para más adelante, sin construirlo todavía

- `usuarios.porcentaje_reparto` ya existe y ya se usa para calcular `monto_tecnico` — aunque hoy solo hay un usuario al 100%, la fórmula no cambia cuando entre el segundo técnico.
- `ordenes.periodo_liquidacion_id` queda `NULL` hasta que exista la tabla `periodos_liquidacion` en Fase 2.
- `ordenes.pagada_por_tuves` queda `NULL` (sin conciliar) hasta que se resuelva el pendiente de cómo llega el informe de TuVes — cuando llegue, un proceso de conciliación completa este campo sin tocar nada más de la orden.
- `equipos.estado = 'falla_fabrica'` y `'devuelto_tuves'` ya están en el ENUM aunque la pantalla de bodega para gestionarlos se construye junto con el resto del panel admin.

## Índices pensados para las pantallas ya diseñadas

- `idx_ordenes_tecnico_estado` — sostiene las consultas por técnico+estado: liquidación pendiente (`OrdenRepository::pendientesDeLiquidar`) y el filtro por técnico de Historial en el panel admin (ya no hay cola de auditoría — las órdenes se auto-aprueban al enviarse, ver `docs/admin-api.md`).
- `idx_ordenes_folio` — búsqueda de folio, no unique, permite duplicados de conflicto.
- `idx_ordenfoto_archivada` — el proceso de archivado anual barre por esta columna sin escanear toda la tabla.
- `idx_movequipo_equipo` y `idx_movferr_usuario` — ambas ordenadas por fecha, para pintar el historial de un equipo o de una maleta sin ordenar en memoria.

## Pendiente explícito de este esquema

El campo `ordenes.motivo_rechazo` no incluye todavía el interruptor "¿descuenta pago?" del modal de rechazo — se resuelve con `estado = rechazada_corregible` vs `rechazada_penalizada`, que ya captura esa distinción sin un campo booleano aparte.
