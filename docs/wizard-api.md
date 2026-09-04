# API del wizard "Cerrar Orden" · Fase 1

> El frontend que consume esta API (PWA del técnico) está documentado en [tecnico-app.md](tecnico-app.md).

Capa de aplicación en [`app/`](../app), front controller en [`public_html/index.php`](../public_html/index.php). Implementa exactamente las reglas fijadas en [modelo-datos-fase1.md](modelo-datos-fase1.md) y probadas en [validate_schema.mjs](../database/tests/validate_schema.mjs). Todas las rutas requieren sesión iniciada (`POST /api/auth/login`), salvo esa misma.

Todas las respuestas son JSON. Los errores tienen esta forma fija:

```json
{ "error": true, "code": "prohibido", "message": "Este equipo no está en tu maleta.", "numero_serie": "8934221100561", "estado_actual": "bodega" }
```

**El celular decide la pantalla mirando `code`, nunca `message`** (el mensaje es para mostrar tal cual o para logs, no para parsear).

## Códigos de error

| code | HTTP | Cuándo aparece |
|---|---|---|
| `no_autenticado` | 401 | Sin sesión o sesión vencida |
| `credenciales_invalidas` | 401 | Login con usuario/clave incorrectos |
| `prohibido` | 403 | El equipo no está en tu maleta, la orden/venta es de otro técnico |
| `no_encontrado` | 404 | Serie, orden o ruta inexistente |
| `validacion` | 422 | Dato faltante, mal formado o fuera de rango |
| `orden_no_editable` | 409 | La orden ya fue enviada; el paso pedido ya no aplica |
| `sin_tarifa_vigente` | 409 | No hay tarifa configurada para ese tipo de servicio — avisar al admin, no es culpa del técnico |
| `metodo_no_permitido` | 405 | Verbo HTTP equivocado para esa ruta |
| `ruta_no_encontrada` | 404 | Endpoint inexistente |
| `error_interno` | 500 | Falla no anticipada — queda en el log del servidor, nunca en la respuesta al cliente en producción |

## Autenticación

```
POST /api/auth/login    { usuario, password } → { usuario: {...} }
POST /api/auth/logout   → { ok: true }
GET  /api/auth/yo       → { usuario: {...} }
```

## Catálogos (para cachear offline)

```
GET /api/catalogo/tipos-servicio
→ { tipos_servicio: [{ id, codigo, nombre, requiere_series, fotos_dinamicas, requisitos_foto: [...] }] }

GET /api/maleta
→ { equipos: [{ id, numero_serie, estado, tipo_equipo, tipo_equipo_nombre }],
    ferreteria: [{ codigo, nombre, unidad_medida, cantidad_actual }] }

GET /api/catalogo/items-ferreteria
→ { items: [{ id, codigo, nombre, unidad_medida, activo }] }
```

`items-ferreteria` es el catálogo COMPLETO (no la maleta de un técnico) — el paso 4 lo usa para el buscador de ítems (ya no hay kit por tipo de servicio, ver `docs/tecnico-app.md`).

El celular debe refrescar `/api/maleta` cada vez que tenga señal y usarla para la validación offline del paso 2 — ver más abajo.

## El wizard, paso a paso

### Paso 1 — crear o reanudar

```
POST /api/ordenes
{ uuid_dispositivo, folio, tipo_servicio, venta_id?, fecha_trabajo_dispositivo? }
→ 201 { id, uuid_dispositivo, folio, estado: "borrador", materiales: [], fotos: [], ferreteria: [] }
```

**Idempotente**: reenviar el mismo `uuid_dispositivo` (reintento sin señal, doble tap) devuelve la orden tal como está, nunca falla ni duplica. `tipo_servicio` es el código (`instalacion_nueva`, `servicio_adicional`, `soporte_falla`, `retiro`), no el id numérico — así el celular no necesita resolver ids desde su caché de catálogo.

`venta_id` es opcional — se manda cuando el técnico elige "esta instalación viene de una venta mía" (ver `GET /api/ventas/pendientes`).

```
GET /api/ordenes/{uuid}
→ el mismo objeto orden, con su estado actual — para reanudar el wizard si la app se cerró a mitad de camino.
```

### Paso 2 — escaneo de materiales

```
POST /api/ordenes/{uuid}/materiales
{ numero_serie, accion: "instalado" | "retirado", ingresado_manual? }
→ 201 { ...orden con materiales actualizado }
```

La validación contra la maleta ocurre **en este momento**, con estos resultados posibles:

- Serie no existe en el sistema → `404 no_encontrado` ("¿la recibiste de otro técnico?")
- `accion: "instalado"` pero el equipo no está en la maleta de este técnico → `403 prohibido`
- `accion: "retirado"` pero el equipo no figura `instalado` → `403 prohibido`
- Ya fue escaneado en esta misma orden → `422 validacion`

**Importante para el modo offline**: si el celular no tiene señal, esta validación debe repetirse en el propio JavaScript contra la copia local de `/api/maleta` antes de mostrarle éxito al técnico — el servidor la vuelve a hacer igual cuando llegue la señal, pero la experiencia de "válido al instante" depende de que el cliente la anticipe.

```
DELETE /api/ordenes/{uuid}/materiales/{equipoId}?accion=instalado
→ orden actualizada, sin ese material
```

### Paso 3 — fotos

```
POST /api/ordenes/{uuid}/fotos   (multipart/form-data)
campos: foto (archivo), tipo, equipo_id? (solo si tipo=equipo_retirado), latitud?, longitud?, tomada_en?
→ 201 { foto: { id, ruta, tamano_bytes }, orden: {...} }
```

- `tipo` ∈ `antena | deco_principal | equipo_retirado | adicional`.
- `equipo_retirado` exige que ese `equipo_id` ya esté escaneado como `retirado` en el paso 2 — si no, `422 validacion`.
- Repetir una foto del mismo slot (`antena`, `deco_principal`, o el mismo `equipo_retirado`) **reemplaza** la anterior, no la duplica — es el botón "Cambiar" del paso 3 del diseño.
- `adicional` sí permite varias por orden.
- Rechaza archivos de más de 400 KB (margen sobre los 300 KB objetivo de `Compressor.js` en el cliente) — si esto se dispara seguido, revisar la compresión del lado del celular, no subir el límite del servidor.
- La subida funciona con la orden en estado `borrador` — puede (y debe) empezar antes del envío final del paso 5, apenas la foto está lista.

### Paso 4 — ferretería

```
POST /api/ordenes/{uuid}/ferreteria
{ items: [{ item_ferreteria_id, cantidad_final }, ...] }   // items: [] o ausente = la orden no consumió ferretería (ya no hay kit que aplicar de oficio)
→ { ...orden con ferreteria actualizada }
```

Reemplaza siempre el conjunto completo de la orden (no hace diff) — si el técnico corrige un ajuste y reenvía este paso, la respuesta refleja el último envío.

```
PATCH /api/ordenes/{uuid}/cierre
{ senal_porcentaje?, calidad_porcentaje?, metros_cable?, observaciones?, latitud?, longitud? }
```

**Actualización — se sacó el campo "Satélite"** (pedido: *"elimina satelite"*). Ya no está en el formulario del paso 4 ni lo acepta este endpoint; la columna `ordenes.satelite` queda en el schema por las órdenes viejas que ya la tenían cargada, pero nada nuevo la escribe.

### Paso 5 — enviar

```
POST /api/ordenes/{uuid}/enviar
→ { ...orden con estado "aprobada" (o "conflicto") }
```

En una sola transacción:

1. **Detecta folio en conflicto.** Regla aplicada (ver `OrdenRepository::folioEnConflicto` — **asunción de negocio pendiente de confirmar con Edwin**): es conflicto si el folio ya existe en otro técnico, o en el mismo técnico el mismo día. Si el mismo técnico reutiliza el folio semanas después (posible visita de garantía), no se bloquea. Si hay conflicto, la orden queda en estado `conflicto` y el resto de este paso no ocurre — no se cobra, no se mueve inventario.
2. Valida que existan los materiales y las fotos obligatorias para el tipo de servicio (fijas o dinámicas según `fotos_dinamicas`).
3. Toma la tarifa vigente y el `porcentaje_reparto` del técnico, calcula y **congela** `monto_bruto` / `porcentaje_aplicado` / `monto_tecnico` en la orden. Si no hay tarifa vigente configurada: `409 sin_tarifa_vigente` (mensaje explícito para que el técnico avise, no un error genérico).
4. Confirma el consumo físico: cada equipo pasa a `instalado` o `retirado` (con su fila en `movimientos_equipo`), y cada línea de ferretería genera su `movimientos_ferreteria` y descuenta `stock_ferreteria_usuario`.
5. Si la orden tiene `venta_id`, confirma la venta: `estado → instalada`, y congela `monto_comision` / `monto_vendedor` con la comisión vigente del plan y el `porcentaje_reparto` de `venta.vendedor_id` (quien registró la venta — no necesariamente el técnico que instala; ver `docs/modelo-datos-fase1.md` sobre el fix de este punto).
6. La orden queda en `aprobada` directo, con `fecha_auditoria` = este mismo instante. **Auto-aprobación** (pedido: *"elimina auditoria..."* — ver [admin-api.md](admin-api.md#auditoría-ya-no-tiene-pantalla-en-el-panel)): ya no existe el paso intermedio `enviada` esperando revisión manual de Edwin antes de contar como trabajo pagable — todo lo de este paso 5 (incluido el consumo físico del punto 4) ocurre en la misma transacción que la aprobación, no antes de ella.

Después de `enviar()`, la orden ya no es editable por el técnico (`409 orden_no_editable` en cualquier paso 1-4). Reabrir una orden rechazada sigue siendo posible vía API directa (`AuditoriaService::reabrir`, sin pantalla en el panel) — no está en el alcance de este wizard técnico.

## Venta

```
POST /api/ventas
{ numero_venta_tuves, cliente_nombre, comuna, plan: "plan_full", sin_vendedor: false }
→ 201 { id, numero_venta_tuves, estado: "registrada", vendedor_id, ... }

GET /api/ventas/pendientes
→ { ventas: [...] }   // TODAS las pendientes (estado "registrada"), no solo las propias — para el selector del paso 1

GET /api/ventas/{id}
→ { ...venta, plan_nombre }
```

**Cross-técnico y venta directa de TuVes** (pedido: *"si la venta viene de
otro lugar ya sea directa de tuvez o otro tecnico esa no se paga al que
instala si no al que vendio"*) — dos cambios relacionados:
- `GET /api/ventas/pendientes` y `GET /api/ventas/{id}` ya NO están
  restringidas al técnico dueño de la venta (antes tiraban 403). Cualquier
  técnico puede enlazar (paso 1) o registrar retroactivamente (admin) la
  venta de otro — el selector muestra `vendedor_nombre` para que quede
  claro de quién es. La comisión se sigue acreditando siempre a
  `venta.vendedor_id`, nunca a quien instala (ver `docs/modelo-datos-fase1.md`).
- `POST /api/ventas` acepta `sin_vendedor: true` (casilla "Venta directa de
  TuVes — yo no la vendí" en el formulario) — la venta queda con
  `vendedor_id = NULL`. Al instalarse, pasa a `estado='instalada'` igual
  que cualquier otra, pero sin `monto_comision`/`monto_vendedor`: no hay
  nadie a quien pagarle la venta.

`GET /api/ventas/{id}` (pedido: *"que aqui aparezcan si este plan por
ejemplo era de 3 decos 3 series a instalar"*) lo usa el paso 2 del wizard
cuando la orden tiene `venta_id`: extrae la cantidad de decos del
`plan_nombre` (mismo patrón que `tarifas_instalacion_plan` — el nombre ya
trae la cantidad, "Plan Básico 3 Decos") y muestra "llevas N/3 escaneados"
mientras el técnico va marcando equipos como instalados. Es solo un aviso
visual — no bloquea "Siguiente" ni valida nada contra el servidor.

**Actualización — se revirtió la decisión de no pedir RUT/dirección**
(pedido explícito: *"al registrar venta que deje agregar más datos del
cliente como rut y direccion"*, más tarde también *"un campo de teléfono
del cliente"*). `cliente_rut`, `cliente_direccion` y `cliente_telefono` son
columnas nuevas en `ventas`, las tres **opcionales** (nunca bloquean el
registro) — siguen sin ser la ficha real del cliente, eso sigue viviendo en
TuVes; son solo una referencia rápida para el vendedor o quien instale. Ver
[admin-api.md](admin-api.md) y `app/Controllers/VentaController.php`.

**`fecha_instalacion_solicitada`** (también opcional) es distinta a las
anteriores — no es solo referencia, alimenta directo "Ventas pendientes de
instalar" en la pantalla de Inicio del admin (pedido: *"que aparezca en el
dashboard del edwin como pendiente de instalar dependiendo de la fecha de
instalación solicitada por el cliente"*). Sin fecha cargada, la venta sigue
apareciendo ahí (al final de la lista, sin urgencia) — no se pierde, solo no
tiene con qué ordenarla. Ver `GET /admin/ventas/pendientes-instalar` en
[admin-api.md](admin-api.md).

## Qué falta para completar la Fase 1 (no es parte de este wizard técnico)

- **Auditoría** (aprobar/rechazar/observar), **registro retroactivo del admin** (respuesta 12), **traspasos de equipo** (respuesta 9) y **tarifario/bodega** — módulo del administrador, ver [admin-api.md](admin-api.md).
- **Control de stock físico** (Fase 3) y **liquidación mensual** (Fase 2) — dependen de tener más de un técnico operando, como ya se acordó.

## Notas de despliegue

- **PHP 8.1+** (el código usa una sola sintaxis 8.1-only — array spread con llaves string en `BilleteraController` — el resto es compatible desde 8.0). Se subió el mínimo desde 8.0 porque 8.0 ya está fuera de soporte de seguridad oficial de PHP.net; se dejó en 8.1 en vez de forzar 8.3 porque en hostings CloudLinux (habitual en cPanel/DirectAdmin compartido) el proveedor suele mantener parches de seguridad propios para versiones "EOL" más allá del fin de vida oficial — usar la versión más alta que tenga el hosting sigue siendo lo ideal, pero 8.1 no es un riesgo real en esos casos. `app/bootstrap.php` corta con un mensaje claro si el (sub)dominio corre una versión más vieja, en vez de fallar con un error de sintaxis críptico en el primer archivo que use `match` o argumentos con nombre.
- El **document root del subdominio `terreno.hogartv.cl` debe apuntar a `/public`**, no a la raíz del proyecto — el `.htaccess` de la raíz bloquea el acceso directo como respaldo si esto se configura mal.
- Copiar `config/config.example.php` a `config/config.php` y completar las credenciales reales de MySQL antes de desplegar. `config/config.php` está en `.gitignore`.
- `storage/fotos/` debe existir con permisos de escritura para el usuario de PHP (`755` suele bastar en cPanel).
