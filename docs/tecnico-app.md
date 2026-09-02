# App técnico (PWA) · Fase 1

Frontend en [`public/tecnico/`](../public/tecnico), HTML5/CSS/JS vanilla, sin build step — mismo criterio que el panel admin ([admin-api.md](admin-api.md)). Habla con la misma API documentada en [wizard-api.md](wizard-api.md); esto es solo la interfaz que el técnico toca con el pulgar en terreno.

## Qué se construyó

```
public/tecnico/
  manifest.webmanifest, sw.js          — PWA instalable, cáscara cacheada + Background Sync
  icons/                                — icon.svg + PNG 192/512 (ver "Íconos" abajo)
  index.html, css/tecnico.css
  js/
    app.js, session.js, router.js, topbar.js, toast.js, modal.js, utils.js
    api.js, storage.js, db.js, offline.js, uuid.js, geo.js, compress.js, scanner.js
    views/login.js, home.js, venta.js, historial.js
    views/wizard/wizard.js + paso{1..5}-*.js
    vendor/html5-qrcode.min.js, vendor/compressor.min.js
```

- **Login → Inicio → wizard de 5 pasos**, calcado del contrato de `wizard-api.md`. El paso 1 crea la orden (única vez que folio/tipo de servicio se fijan); los pasos 2-4 llaman cada uno su endpoint apenas el técnico interactúa (no se junta todo para el final); el paso 5 muestra un resumen y llama `enviar()`.
- **"Registrar venta"** — pantalla corta aparte, como en el diseño original.
- **"Mis órdenes enviadas"** (`historial.js`, `GET /api/mis-ordenes`) — a diferencia de Inicio (que solo lista los borradores en curso en ESTE celular, vía `localStorage`), esto trae del servidor el historial real: estado, monto, motivo de rechazo si aplica. Tocar una orden reutiliza la pantalla de "ya cerrada" del wizard.
- **La orden vive en el servidor desde el paso 1 — salvo que no haya señal ni para eso**, en cuyo caso el wizard sigue funcionando sobre un snapshot local mientras la cola de `offline.js` espera para mandar todo (ver la sección de abajo). Con señal, cada paso vuelve a pedir `/api/ordenes/{uuid}` en vez de confiar en un dato viejo.
- **Catálogo y maleta cacheados** (`storage.js`) para que el paso 1 (tipos de servicio) y el paso 2 (validación instantánea contra la maleta) no dependan de la señal del momento.

## Escaneo de equipos (paso 2)

Cámara con **html5-qrcode** (vendorizada, ver "Librerías de terceros" abajo) — lee QR y códigos de barras 1D. Al lado, siempre visible, un campo de texto para escribir la serie a mano: el escaneo nunca es la única puerta de entrada, porque un código rayado o mal impreso es la realidad del terreno.

Validación offline: si el celular está sin señal, `instalar` se valida contra la copia local de `/api/maleta` antes de intentar nada (evita el viaje redondo inútil); `retirar` no se puede pre-validar así (la maleta local no sabe qué hay instalado en la casa del cliente), así que sin señal simplemente se avisa que hace falta conexión. Con señal, siempre manda al servidor — la copia local es solo una ayuda de UX, nunca la autoridad.

## Fotos (paso 3)

- Slots fijos (antena, decodificador) para instalación/soporte; un slot dinámico por cada equipo retirado para retiro — igual que `tipos_servicio.fotos_dinamicas` en el backend.
- Compresión con **Compressor.js** (vendorizada) apuntando a 300KB con margen sobre el límite real del servidor (400KB) — reintenta con calidad más baja hasta 5 veces antes de rendirse y dejar que el servidor decida.
- GPS adjunto en cada foto cuando el celular lo entrega (mejor esfuerzo, nunca bloquea si el técnico niega el permiso o el GPS tarda).
- Las fotos se suben apenas se toman, con la orden todavía en `borrador` — no esperan al envío final.

## Ferretería + cierre (paso 4)

Al entrar, si la orden todavía no tiene nada guardado, se llama `/ferreteria` con `items: []` para que el servidor resuelva el kit estándar — desde ahí el técnico ajusta cantidades con un stepper, quita cualquier fila (kit o agregada) con el ícono 🗑️, y puede agregar un ítem que el kit no trae eligiéndolo de `GET /api/catalogo/items-ferreteria` (catálogo completo, cacheado en `storage.js` desde Inicio — ver `setCatalogoFerreteria`/`getCatalogoFerreteria`). El backend (`OrdenWizardService::resolverItemsFerreteria`) ya aceptaba cualquier `item_ferreteria_id` válido desde el principio — lo único que faltaba era la UI para elegir uno fuera del kit.

El selector "+ Agregar" solo muestra ítems del catálogo que todavía no están en la lista (se recalcula cada vez que se agrega o quita una fila) y se oculta solo si no hay ninguno disponible o si nunca se pudo cachear el catálogo (sin señal en el primer uso). Validado en navegador real: kit de 2 ítems + catálogo de 3 → el selector ofrece solo el que falta; al agregarlo aparece con cantidad inicial 1 (o 0.5 si su unidad es "metro") y el selector se oculta al agotarse; al quitar un ítem del kit reaparece como opción; el body final enviado a `/ferreteria` refleja exactamente lo que quedó en pantalla (el ítem del kit quitado no se manda, el agregado sí, con su `item_ferreteria_id` real).

## Hallazgo real corregido: las fotos no tenían cómo servirse

`storage/fotos_path` vive deliberadamente fuera de `/public` (fotos con GPS implícito, no deben quedar servibles sin control — ver `config/config.example.php`). Pero **no existía ningún endpoint que las sirviera** — ni para este wizard ni para el lightbox de auditoría del panel admin, que ya estaba en producción apuntando a `/${ruta_archivo}`, una ruta que jamás iba a resolver a nada. Se agregó:

- `GET /api/fotos/{id}` (`FotoController`) — autoriza solo al técnico dueño de la orden o a un admin, resuelve la ruta real bajo `storage/`, valida que no se salga de esa carpeta, y sirve el archivo con el mime real (nunca confía en la extensión).
- Corregidas las dos referencias rotas en `public/admin/js/views/auditoria.js` (miniatura y lightbox) para usar `/api/fotos/{id}`.

## Hallazgo real corregido: la barra de acciones de cada paso no existía en el DOM

El helper compartido `el()` solo devuelve el **primer** nodo raíz de una plantilla — es el mismo patrón que ya usa el panel admin. Los cinco pasos del wizard armaban su plantilla con DOS nodos raíz hermanos (`<section class="wizard-paso">` + `<div class="wizard-acciones">`), así que el `<div>` con los botones "Siguiente"/"Atrás"/"Enviar" se descartaba en silencio: ningún botón de avance existía nunca en el DOM. Se detectó recién al probarlo en un navegador real (`Cannot read properties of null (reading 'addEventListener')`) — visualmente la pantalla se veía completa, pero el wizard era literalmente imposible de avanzar. Se corrigió envolviendo cada plantilla en un único `<div style="display: contents;">` (mismo truco que ya usaba `wizard.js` para su propia cáscara).

**Validado end-to-end en un navegador real** (viewport móvil, servidor mock con multipart real vía `busboy`, sin mocks de las librerías vendorizadas — Compressor.js y el compresor de imágenes corrieron de verdad): login, ambos tipos de fotos (fijas y dinámicas), compresión + subida + miniatura real, stepper de ferretería con edición persistida, resumen correcto, envío exitoso y limpieza del borrador local, reanudar/quitar borradores, registro de venta, banner offline, y errores de validación en pantalla. El bug de la barra de acciones se confirmó roto y luego confirmado arreglado en el mismo navegador.

## Íconos

`icons/icon.svg` es una marca simple (señal/transmisión) generada para este proyecto, rasterizada a PNG 192×192 y 512×512 para el manifest. **Placeholder deliberado** — si Edwin quiere un logo real de la marca, reemplazar esos tres archivos manteniendo los mismos nombres y tamaños; no hace falta tocar el manifest.

## Librerías de terceros vendorizadas

Ninguna se carga desde un CDN (la PWA debe abrir sin internet una vez instalada) — ambas viven en `js/vendor/` como parte del repositorio:

| Librería | Versión | Licencia | Uso |
|---|---|---|---|
| [html5-qrcode](https://github.com/mebjas/html5-qrcode) | 2.3.8 | Apache-2.0 | Lectura de código de barras/QR por cámara (paso 2) |
| [Compressor.js](https://fengyuanchen.github.io/compressorjs) | 1.2.1 | MIT | Compresión de fotos en el cliente antes de subir (paso 3) — es la librería que pedía el diseño original |

### Hallazgo real corregido: la carga inicial se sentía lenta en producción

`html5-qrcode.min.js` pesa ~375 KB sin comprimir — al cargarse como script clásico sin `defer`/`async`, bloqueaba el parseo del resto del HTML hasta terminar de descargarse y ejecutarse, y recién ahí el navegador podía empezar a pedir `compressor.min.js` y después `app.js` (y toda su cadena de imports). En el hosting real esto se notaba como varios segundos de pantalla en blanco antes de que apareciera el formulario de login. Se agregó `defer` a ambos `<script>` vendorizados — el navegador ahora los descarga en paralelo con el resto de la página, y por spec de HTML los tres scripts (los dos clásicos + el módulo `app.js`) siguen ejecutándose en el mismo orden relativo de todas formas, así que `scanner.js`/`paso3-fotos.js` siguen viendo `window.Html5Qrcode`/`window.Compressor` ya definidos cuando los usan. Validado en navegador real contra un servidor estático: los tres scripts cargan en paralelo, ambos globals quedan definidos, y el formulario de login se pinta sin cambios de comportamiento.

## Cola de escritura offline (`js/db.js`, `js/offline.js`)

El wizard completo — crear orden, escanear equipos, fotos, ferretería, cierre técnico y el envío final — funciona de verdad sin señal, no solo "no se rompe". Diseño:

- **IndexedDB** (`db.js`) guarda la cola de acciones pendientes, en el mismo orden en que se crearon (FIFO) — así "crear orden" siempre sale antes que un material de esa misma orden, sin necesidad de agrupar por uuid. Es la única razón para usar IndexedDB en vez de `localStorage`: una foto ya comprimida es un `Blob`, y `localStorage` no guarda binarios.
- **Snapshot local de la orden** (`storage.js`: `guardarOrdenLocal`/`obtenerOrdenLocal`) — mientras haya algo pendiente para una orden, el wizard no depende de `GET /api/ordenes/{uuid}` (que fallaría sin señal): sigue mostrando y editando la última versión local, actualizada de forma optimista en cada acción encolada. Se descarta apenas el servidor vuelve a responder de verdad.
- **`procesarCola()`** drena la cola de a un ítem por vez apenas hay señal (evento `online` de la página, o al abrir la app). Si el problema es de conexión, se detiene ahí mismo — el resto sigue esperando. Si el servidor rechaza un ítem por una razón real (no de red), se descarta con un aviso en vez de trabar todo lo que viene después.
- **Background Sync** (`sw.js`, evento `sync`) — mejor esfuerzo para que la cola también se vacíe con la PWA cerrada. Solo Chrome/Android lo soporta (iOS Safari no tiene esta API), así que nunca es la única vía: el flujo principal (`online` + apertura de la app) cubre todos los navegadores.

**Alcance deliberado — qué SÍ y qué NO se puede encolar:**

| Acción | ¿Se puede hacer offline? | Por qué |
|---|---|---|
| Crear orden (paso 1) | Sí | No depende de nada del servidor más que el catálogo, ya cacheado. |
| Escanear "Instalar" | Sí | El `equipo_id` se resuelve contra la maleta cacheada — no hace falta preguntarle nada al servidor. |
| Escanear "Retirar" | **No** | Un equipo instalado en la casa de un cliente no está en ninguna caché local — no hay forma honesta de saber su `equipo_id` sin preguntarle al servidor. |
| Quitar un material | Solo si todavía está en la cola (no se mandó) | Si ya se sincronizó, hace falta el servidor para borrar la fila real. |
| Fotos | Sí | El `Blob` ya comprimido se guarda en la cola tal cual. |
| Ferretería / cierre técnico | Sí | Si nunca se cargó el kit de ESE tipo de servicio con señal antes, no hay cantidades que precargar — el técnico puede seguir igual con la lista vacía (`storage.js`: `guardarKitCache`/`obtenerKitCache` resuelve esto para las próximas veces). |
| Enviar (paso 5) | Sí | Ver abajo — la orden queda en un estado especial "esperando señal", no en la pantalla de éxito. |

**Enviar sin señal** no muestra "¡Orden enviada!" — eso implicaría una certeza que todavía no existe (no se sabe si el servidor la va a marcar `enviada` o `conflicto` hasta que de verdad la reciba). Muestra una pantalla distinta ("Envío guardado, esperando señal") y la orden ya no se puede seguir editando desde el wizard, igual que pasaría con `orden_no_editable` si el servidor ya la hubiera recibido.

**Validado end-to-end en un navegador real** interceptando `fetch` para simular la caída de señal (no un mock de la lógica, la app real corriendo contra eso): agregar un equipo offline resolviendo su `equipo_id` desde la maleta cacheada, dos fotos offline (comprimidas de verdad con Compressor.js, `Blob`s reales guardados en IndexedDB), ferretería sin kit cacheado disponible, cierre técnico, y el envío final — los 5 quedaron en la cola en el orden correcto. Al restaurar la conexión, `procesarCola()` los mandó todos en orden y el servidor terminó con la orden `enviada`, el material, ambas fotos, la ferretería (con el kit por defecto del servidor, ya que no había uno cacheado) y los datos de cierre, todo correcto. Se encontraron y corrigieron dos bugs reales en el proceso: un error de plural ("acciónes" en vez de "acciones") en los indicadores de pendientes, y que un envío exitoso procesado en segundo plano (sin ninguna pantalla del wizard abierta) no sacaba la orden de la lista "En curso" de Inicio — `procesarCola()` ahora limpia también ese registro cuando un "enviar" se confirma.

## Alcance deliberadamente fuera de esta pasada

- **Reconciliación en vivo de una pantalla abierta**: si el wizard queda mostrando "esperando señal" y la cola se vacía en segundo plano (por ejemplo, vía Background Sync con la app minimizada), esa pantalla no se refresca sola al estado final — hay que volver a Inicio y reabrir la orden. Los datos siempre quedan correctos; es solo una pantalla que puede quedar desactualizada hasta que se navegue.
