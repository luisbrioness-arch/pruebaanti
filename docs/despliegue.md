# Despliegue en cPanel (terreno.hogartv.cl)

Checklist para subir el sistema al hosting real y dejarlo operando. Nada
de esto necesita Node ni Composer — es PHP vanilla servido tal cual.

## 0. Conectar el subdominio (hosting nuevo, dominio en otra cuenta)

Este cPanel es una cuenta distinta de donde vive el resto de `hogartv.cl`
(otro hosting, con DirectAdmin) — solo se va a usar para el subdominio
`terreno.hogartv.cl`. El dominio raíz `hogartv.cl` y su DNS siguen
administrados donde estaban antes; hay que apuntar **solo ese subdominio**
hacia el cPanel nuevo, sin tocar nada más de `hogartv.cl`.

1. **Conseguir la IP del hosting nuevo** — en cPanel: *Página de inicio* (Home) muestra la "Dirección IP compartida" de la cuenta, o *"Detalles de la cuenta"*. Anótala.
2. **Crear el registro DNS** — donde sea que hoy se administre el DNS de `hogartv.cl` (el panel de DirectAdmin del otro hosting, o el panel del registrador del dominio si el DNS no vive ahí): agregar un registro
   ```
   Tipo A   Nombre: terreno   Valor: <IP del cPanel nuevo>   TTL: automático
   ```
   Esto NO se hace en el cPanel nuevo — se hace donde vive el DNS de `hogartv.cl` hoy. Si el hosting nuevo en vez de IP fija te da un hostname para CNAME, usa eso en lugar del registro A (revisa el correo de bienvenida del hosting).
3. **Dar de alta el subdominio en el cPanel nuevo** — en *Dominios* → *Crear un dominio*, escribir `terreno.hogartv.cl` como dominio completo. cPanel puede pedir tratarlo como "Addon Domain" ya que la cuenta no es dueña de `hogartv.cl` — está bien, acéptalo así. **En el mismo paso, fijar el Document Root a la carpeta `public/` del proyecto** (ej. `public_html/terreno_dth/public`, subiendo el resto del proyecto un nivel arriba de esa ruta) — evita tener que moverlo después.
4. **Esperar la propagación del DNS** (minutos a un par de horas) y activar **AutoSSL** para `terreno.hogartv.cl` desde *SSL/TLS Status* del cPanel nuevo apenas el dominio resuelva — el login no funciona sin HTTPS (ver punto 7 más abajo).
5. Confirmar que resuelve antes de seguir: `https://terreno.hogartv.cl/` debería llegar al cPanel nuevo (aunque sea con un error de PHP o 404, no un timeout ni la página de otro hosting) — eso ya dice que el DNS y el vhost están conectados.

## 1. Subir los archivos

Sube **todo el proyecto**, no solo `public/` — `app/`, `config/`,
`database/`, `storage/` también tienen que existir en el servidor (fuera
del document root, ver más abajo). Excluye `.claude/` y cualquier carpeta
`.tmp_*` si quedó alguna suelta — no son parte del sistema.

## 2. Document root → `public/`

Si ya lo fijaste al crear el dominio en el paso 0, este punto es solo
confirmarlo: en *Dominios* del cPanel nuevo, el Document Root de
`terreno.hogartv.cl` debe apuntar a la carpeta `public/` del proyecto,
**no** a la raíz. `app/`, `config/` y `database/` quedan un nivel arriba,
fuera de lo servible — el `.htaccess` de la raíz es solo un cinturón de
seguridad extra por si un error de configuración apunta ahí igual.

## 3. Versión de PHP

Selector de PHP del hosting (MultiPHP Manager en cPanel, PHP Selector en
DirectAdmin) → **PHP 8.1 o superior** para este (sub)dominio — usa la más
alta que tengas disponible, 8.1 es el mínimo, no lo ideal. El sistema trae
un guard en [`app/bootstrap.php`](../app/bootstrap.php) que corta con un
mensaje claro si el hosting sirve algo más viejo — si ves ese mensaje en
vez de la app, es este paso.

Si el selector de tu hosting solo permite fijar la versión **global de la
cuenta** (afectando a todos los dominios, no solo a este subdominio) — como
pasa en algunas cuentas DirectAdmin con varios sitios — revisa primero si
hay una opción de anular la versión **por dominio individual** antes de
tocar la global, para no afectar otros sitios que dependan de una versión
distinta.

Extensiones PHP necesarias (casi cualquier cPanel las trae activas por
defecto, pero conviene confirmar en "Select PHP Version" → Extensions):
`pdo_mysql`, `gd` o `fileinfo` (para el sniff de MIME real en
`FotoController`), `session`.

## 4. Base de datos

1. Crear la base de datos y el usuario MySQL desde cPanel, y anotar host/nombre/usuario/contraseña.
2. Importar [`database/schema_fase1.sql`](../database/schema_fase1.sql) completo (ya incluye las tablas de Fase 2 — Liquidación y Billetera — no hace falta un segundo archivo).
3. **Generar el hash real de la contraseña de Edwin** — el schema deja el usuario admin sembrado con un placeholder:
   ```sql
   INSERT INTO usuarios (nombre, usuario, password_hash, rol, porcentaje_reparto)
   VALUES ('Edwin', 'edwin', '__REEMPLAZAR_CON_HASH_REAL__', 'admin', 100.00);
   ```
   Ese placeholder **no sirve para loguearse** — hay que reemplazarlo por un hash real de `password_hash()`. Formas de generarlo sin acceso a terminal:
   - Un script PHP de una línea subido temporalmente a `public/` (ej. `hash.php`): `<?php echo password_hash('la-contraseña-real', PASSWORD_DEFAULT);` — abrirlo una vez en el navegador, copiar el resultado, **borrar el archivo enseguida** (nunca dejarlo en producción).
   - phpMyAdmin no genera hashes de `password_hash()` de PHP — no sirve `MD5()`/`SHA1()` de MySQL para esto, el login usa `password_verify()`.
   
   Con el hash copiado: `UPDATE usuarios SET password_hash = '<hash pegado>' WHERE usuario = 'edwin';`

## 5. `config/config.php`

Copiar [`config/config.example.php`](../config/config.example.php) a
`config/config.php` (mismo directorio) y completar `db.host`, `db.name`,
`db.user`, `db.pass` con los datos reales de cPanel. Dejar `app.debug` en
`false` — nunca exponer trazas de error a un técnico o a alguien de
afuera. Este archivo **no debe subirse a ningún repositorio** (ya está en
`.gitignore`).

## 6. `storage/fotos`

Debe existir y ser escribible por PHP (normalmente ya lo es en cPanel sin
tocar nada, porque el proceso PHP corre como el mismo usuario dueño de los
archivos). Vive **fuera** de `public/` a propósito — las fotos tienen GPS
implícito y no deben quedar servibles por URL directa; se sirven solo a
través de `GET /api/fotos/{id}` con control de acceso.

## 7. HTTPS

El subdominio necesita certificado SSL activo (AutoSSL de cPanel alcanza).
`Auth::start()` fija la cookie de sesión con `'secure' => true` — sin
HTTPS, la sesión nunca se guarda y el login parece "no hacer nada". Si se
necesita probar por HTTP puro en algún momento, ese es el único valor a
cambiar temporalmente en [`app/Core/Auth.php`](../app/Core/Auth.php).

## 8. Prueba de humo (en este orden)

1. `https://terreno.hogartv.cl/admin/` → login con `edwin` / la contraseña recién fijada.
2. Panel admin carga (Auditoría vacía es normal si no hay nada aún) y **no** muestra el mensaje de "PHP requiere 8.1+".
3. `https://terreno.hogartv.cl/tecnico/` en el celular → login con un técnico de prueba (crear uno con `rol='tecnico'` y su propio hash, mismo procedimiento del punto 4) → completar una orden de punta a punta (los 5 pasos) con señal real.
4. Apagar datos móviles a mitad del wizard, seguir avanzando, confirmar que queda "guardado sin conexión", y que al reactivar la señal se sincroniza solo.
5. Instalar la PWA del técnico ("Agregar a pantalla de inicio") y confirmar que abre sin barra de navegador.
6. En el panel admin: aprobar la orden de prueba, y en Billetera confirmar que aparece como pendiente por liquidar para ese técnico.

## Notas

- No hay build step ni `npm install` en el servidor — todo el JS del
  frontend (`public/admin/js/`, `public/tecnico/js/`) se sirve tal cual,
  como módulos ES nativos.
- Las dos librerías vendorizadas (`html5-qrcode.min.js`, `compressor.min.js`
  bajo `public/tecnico/js/vendor/`) ya están en el repo — no se descargan en
  el servidor.
- Si en algún momento se agrega un segundo técnico o cambia algún
  `porcentaje_reparto`, es un `UPDATE` directo sobre `usuarios` — no hay
  hoy una pantalla de admin para gestionar usuarios más allá de lo que ya
  cubre `AdminUsuarioController`.
