# Liquidación y billetera (Fase 2)

Fase 2 del sistema: cerrar períodos de pago para cada técnico y llevar un
registro de cuánto se le debe (o se le ha pagado) a lo largo del tiempo.
Cerrar períodos y registrar pagos/ajustes es exclusivo del panel admin; el
técnico solo tiene una vista de solo lectura de su propia billetera en la
PWA (ver "Mi billetera" al final).

## Por qué "cerrar período" no usa un rango de fechas elegido a mano

La primera idea obvia — "elige un desde y un hasta, y liquida lo que caiga
adentro" — tiene un problema real: una orden se aprueba (o una venta se
marca instalada) en un momento que no necesariamente coincide con cuándo
Edwin decide sentarse a cerrar el mes. Si el corte es por fecha, algo
aprobado el día 30 pero recién revisado el día 2 del mes siguiente se queda
fuera de ambos períodos, o hay que andar reabriendo períodos ya cerrados.

En cambio, "cerrar período" acá significa: **agarra todo lo que esté
actualmente pendiente** — toda orden en estado `aprobada` y toda venta en
estado `instalada` que todavía no tenga `periodo_liquidacion_id` asignado —
en el momento exacto en que se aprieta el botón. No importa cuándo se
aprobó cada cosa; importa que no se haya liquidado todavía. Así nada se
pierde por quedar "entre medio" de dos cortes.

Los campos `fecha_desde` / `fecha_hasta` que quedan grabados en
`periodos_liquidacion` son solo un **registro informativo** de qué rango
cubrió ese cierre (el mínimo de las fechas de las órdenes/ventas incluidas,
y el momento del cierre) — nunca son el criterio de selección. Sirven para
mostrar el histórico ("este cierre cubrió del 16 al 31 de agosto"), no para
decidir qué entra.

## El patrón de ledger (igual que equipos y ferretería)

Igual que `movimientos_equipo` y `movimientos_ferreteria`, la billetera de
un técnico **no es una columna de saldo mutable** en `usuarios` — es la
suma de todos los renglones de `movimientos_billetera`:

```sql
SELECT COALESCE(SUM(monto), 0) FROM movimientos_billetera WHERE tecnico_id = ?
```

Esto evita toda la clase de bugs de "el saldo quedó desincronizado por un
update que se saltó una fila" — el saldo siempre se puede recalcular desde
cero a partir del historial, y el historial mismo (quién movió qué, cuándo
y por qué) es la fuente de verdad, no un derivado que se guarda aparte.

Cada renglón de `movimientos_billetera` tiene un `tipo_movimiento`:

- **`liquidacion`** — se crea automáticamente al cerrar un período. Monto
  positivo, igual al total de órdenes + ventas incluidas en ese cierre.
  Esto "acredita" la plata a favor del técnico — todavía no significa que
  se le pagó de verdad.
- **`pago`** — se crea manualmente cuando Edwin efectivamente le transfirió
  o le pagó en efectivo al técnico. Siempre se guarda en negativo (resta
  del saldo), aunque el monto que se ingresa en el formulario es positivo.
- **`ajuste`** — para corregir errores puntuales (una liquidación mal
  calculada, una compensación que no encaja en las otras dos categorías).
  Puede ser positivo o negativo, y requiere una observación obligatoria
  explicando el motivo — a diferencia de pago y liquidación, un ajuste no
  se explica solo por su tipo, así que sin una razón escrita quedaría un
  número suelto en el historial sin forma de auditarlo después.

## Qué pasa con las órdenes y ventas al cerrar

- **Órdenes**: pasan de `aprobada` a `estado = 'liquidada'` y se les fija
  `periodo_liquidacion_id`. El estado `liquidada` ya existía en el ENUM de
  `ordenes` desde el schema de Fase 1.
- **Ventas**: se les fija `periodo_liquidacion_id`, pero el `estado` se
  deja tal cual (`instalada`) — no existe un estado "liquidada" para
  ventas porque el ciclo de vida de una venta no lo necesita; el campo
  `periodo_liquidacion_id IS NULL` ya alcanza para saber si está pendiente.

Ambos repositorios exponen el mismo par de métodos:
`pendientesDeLiquidar($id)` (qué falta) y `marcarLiquidadas($ids, $periodoId)`
(aplicar el cierre) — ver
[`OrdenRepository.php`](../app/Repositories/OrdenRepository.php) y
[`VentaRepository.php`](../app/Repositories/VentaRepository.php).

## Servicio y validaciones

Toda la lógica vive en
[`LiquidacionService`](../app/Services/LiquidacionService.php):

- `pendientePorLiquidar($tecnicoId)` — arma el resumen que ve el admin
  antes de decidir si cierra: cuántas órdenes, cuántas ventas, y los tres
  montos (`monto_ordenes`, `monto_ventas`, `monto_total`).
- `cerrarPeriodo($tecnicoId, $cerradoPorId, $observaciones)` — todo dentro
  de una transacción. Rechaza si el técnico no existe o si no hay nada
  pendiente (`monto_total <= 0`) — no tiene sentido un período vacío.
  **Las lecturas de pendientes van con `FOR UPDATE`**: sin eso, dos cierres
  simultáneos (un doble clic en el botón alcanzaba) leían las mismas
  órdenes, creaban dos períodos y acreditaban DOS VECES el mismo trabajo en
  la billetera. Con el bloqueo, el segundo cierre espera al primero y al
  releer ya no encuentra pendientes, así que corta con "no hay nada
  pendiente" en vez de duplicar. El modal además deshabilita su botón al
  enviar, para que el doble clic ni siquiera salga del navegador.
- `registrarPago($tecnicoId, $monto, $creadoPorId, $observacion)` — el
  monto debe ser mayor a 0 (se guarda como negativo internamente).
- `registrarAjuste($tecnicoId, $monto, $creadoPorId, $observacion)` — el
  monto no puede ser exactamente 0 (un ajuste de $0 no es un ajuste), y la
  observación es obligatoria y no puede quedar vacía después de un trim.
- `resumenDe($tecnicoId)` — `{ saldo, movimientos, periodos }`, lo que
  pinta la vista de detalle.
- `saldosDeTodos()` — para la grilla de tarjetas de la vista principal;
  solo incluye técnicos con al menos un movimiento (evita ensuciar la
  pantalla con una fila de "$0" para alguien que nunca ha tenido actividad).

Las cuatro rutas de rechazo (pago ≤ 0, ajuste = 0, ajuste sin observación,
técnico inexistente en los tres métodos que lo requieren) están cubiertas
por el test de integración — ver "Validación" más abajo.

## Endpoints

Todos bajo `Auth::requireAdmin()` salvo `/api/mi-billetera` (ver más abajo), en
[`AdminBilleteraController`](../app/Controllers/AdminBilleteraController.php):

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/admin/billetera/saldos` | Saldo de cada técnico con movimientos (para la grilla resumen) |
| GET | `/api/admin/billetera/{tecnicoId}` | `{ saldo, movimientos, periodos }` de un técnico |
| GET | `/api/admin/billetera/{tecnicoId}/pendiente` | Qué se liquidaría si se cierra período ahora |
| POST | `/api/admin/billetera/{tecnicoId}/cerrar` | Cierra período (body: `{ observaciones }`, opcional) |
| POST | `/api/admin/billetera/{tecnicoId}/pago` | Registra un pago (body: `{ monto, observacion }`) |
| POST | `/api/admin/billetera/{tecnicoId}/ajuste` | Registra un ajuste (body: `{ monto, observacion }`) |

Nota de implementación: `/api/admin/billetera/saldos` está registrada
**antes** que `/api/admin/billetera/{tecnicoId}` en
[`public_html/index.php`](../public_html/index.php) — el `Router` resuelve por orden
de registro y "saldos" calzaría con el wildcard `{tecnicoId}` si estuviera
declarada después.

## Vista y cola offline (panel admin)

[`billetera.js`](../public_html/admin/js/views/billetera.js) sigue el mismo
patrón que el resto del panel: grilla de tarjetas de saldo (clickeables) +
selector de técnico → detalle con saldo grande, bloque de "pendiente por
liquidar" (el botón "Cerrar período" solo aparece si hay algo pendiente),
botones de pago/ajuste, e historiales de cierres y movimientos.

Las tres acciones de escritura pasan por
`conColaSiHaceFalta(tipo, payload, llamadaOnline)`, la misma cola de
[`offline.js`](../public_html/admin/js/offline.js) que ya usan auditoría,
conflictos, tarifario y bodega (ver
[`admin-api.md`](admin-api.md#cola-de-escritura-offline-del-panel-admin)).
A diferencia de tarifas/comisiones/kits, `cerrar_periodo`, `registrar_pago`
y `registrar_ajuste` **no son coalescibles** — cada una es un evento
distinto e independiente (dos pagos seguidos son dos pagos, no una edición
que reemplaza a la anterior), así que ninguna está en
`TIPOS_COALESCIBLES`.

Si se cierra un período (o se registra un pago/ajuste) sin conexión, la
vista no intenta refrescar el detalle ni el resumen de saldos — se muestra
un aviso neutro ("se aplicará al recuperar señal") y la pantalla se queda
con los datos previos hasta la próxima carga, para no mostrar un estado a
medias que después no calce con lo que de verdad pasó en el servidor.

## Validación

**Backend** — 38/38 pasos vía PHP-WASM + SQLite (Reflection sobre
`Database::$connection`), cubriendo `LiquidacionService` completo contra
datos realistas (un técnico con órdenes aprobadas/rechazadas/ya liquidadas
mezcladas y ventas instaladas/ya liquidadas, y un segundo técnico sin
ningún movimiento): filtrado correcto de pendientes, suma de montos,
`fecha_desde` = mínimo de las fechas incluidas, doble liquidación
bloqueada, marcado correcto de órdenes (→ `liquidada`) y ventas (mantienen
`instalada`), aritmética de saldo a través de liquidación → pago → dos
ajustes, las cuatro validaciones de rechazo, exclusión de técnicos sin
movimientos en `saldosDeTodos`, y orden del historial (más reciente
primero).

**Frontend** — navegador real contra un servidor mock, cubriendo: carga de
la grilla de saldos y el detalle de un técnico (saldo, pendiente, ambos
historiales); cierre de período **online** (saldo y tarjetas se actualizan,
el botón "Cerrar período" desaparece al no quedar nada pendiente); registro
de pago y de ajuste **online** (aritmética de saldo correcta en cada paso);
y las mismas tres acciones **sin conexión** (vía `fetch`/`navigator.onLine`
parchados) — las tres se encolan sin pisarse entre sí (badge sube a
"⏳ 3 sin enviar"), y al restaurar la señal (`window.dispatchEvent(new
Event('online'))`) la cola se vacía en orden FIFO y el estado final del
servidor coincide exactamente con lo esperado.

## "Mi billetera" — vista de solo lectura para el técnico

El técnico también puede consultar su propio saldo, su historial de
cierres y sus movimientos desde la PWA, en `#billetera` (botón "Ver mi
billetera" en Inicio). Es la extensión natural del panel admin: reusa
`LiquidacionService::resumenDe()` y `pendientePorLiquidar()` tal cual, sin
lógica nueva.

- **Endpoint**: `GET /api/mi-billetera` — el único de todos los de esta
  fase que NO vive bajo `/api/admin/*` ni exige `Auth::requireAdmin()`.
  Cualquier usuario autenticado (técnico o admin) puede llamarlo, pero
  [`BilleteraController::mia()`](../app/Controllers/BilleteraController.php)
  siempre usa `Auth::id()` como técnico — nunca lee un parámetro de ruta —
  así que estructuralmente no existe forma de pedir la billetera de otro.
- **Sin ninguna acción de escritura**: no hay botón de "cerrar período",
  "pago" ni "ajuste" en esta vista — esas siguen siendo exclusivas del
  panel admin. Por eso tampoco pasa por la cola de escritura offline de la
  PWA (`js/offline.js`/`js/db.js`): si no hay señal, simplemente no hay
  datos nuevos que mostrar, sin nada que encolar.
- Vista: [`public_html/tecnico/js/views/billetera.js`](../public_html/tecnico/js/views/billetera.js).

Validado con: 200 con saldo/movimientos/período correctos (vía PHP-WASM,
sesión de técnico simulada), 401 sin sesión, y — vía navegador real contra
un servidor mock — el botón de acceso desde Inicio, el render completo del
detalle, el estado vacío (saldo $0, sin historial, sin bloque de
"pendiente" cuando no hay nada por liquidar) y la flecha "atrás" volviendo
a Inicio.
