# Despliegue (DirectAdmin + Git nativo)

Checklist real de cómo quedó desplegado el sistema — DirectAdmin, con
deploy automático vía el repositorio Git nativo del panel + un webhook de
GitHub. Nada de esto necesita Composer ni Node en producción — es PHP
vanilla servido tal cual.

## 0. Por qué esta ruta (y no cPanel + FTP)

Se intentó primero un hosting cPanel separado (con FTP-Deploy-Action de
GitHub Actions) — se abandonó por una cuenta con la sesión de phpMyAdmin
rota (usuario interno mal sincronizado, sin arreglo posible desde el panel
de usuario) y sin SSH en el plan. Se migró al DirectAdmin donde ya vivía
`hogartv.cl`, que sí tenía SSH disponible en un upgrade de plan — eso abrió
la puerta al Git nativo del panel, más simple y confiable que FTP.

## 1. Crear el subdominio

**Usar siempre Document Root "Por Defecto"**, nunca "Personalizado" — un
intento con ruta personalizada (`domains/terreno_dth/public`) produjo un
403 Forbidden persistente y nunca se pudo determinar la causa exacta contra
la interfaz de usuario (se descartaron permisos, dueño de archivo, SSL,
DNS, WAF — con acceso de servidor real probablemente se hubiera resuelto,
pero no vale la pena el tiempo: "Por Defecto" funciona directo).

1. **Administración de subdominios** → nombre del subdominio → Document
   Root **"Por Defecto"** → `/domains/<subdominio>.hogartv.cl/public_html`.
2. Esto fija la carpeta servible en `public_html/` (no `public/`) — el
   repositorio usa ese nombre exacto por esto mismo.

## 2. Repositorio Git nativo (Avanzada → Git)

1. **Claves SSH** → crear una llave nueva **sin contraseña** (una llave con
   passphrase rompe la automatización) y **sin marcar "Autorizar"** (esa
   opción es para llaves que dejan ENTRAR a este servidor, no para que el
   servidor salga hacia GitHub).
2. Copiar la **llave pública** (`.pub`) y agregarla en GitHub → repo →
   **Settings → Deploy keys → Add deploy key** — **sin** "Allow write
   access" (el servidor solo necesita leer).
3. **Git → Inicializar Repositorio**:
   - Dominio: `hogartv.cl`
   - Nombre: cualquiera (ej. `terreno_git`) — es solo una etiqueta interna,
     no tiene que coincidir con el subdominio.
   - Remoto: `git@github.com:<usuario>/<repo>.git`
   - Archivo de llave: **ruta relativa** al home de la cuenta, no absoluta
     — `.ssh/<nombre_de_la_llave>` (con el punto inicial, sin `/home/...`
     adelante; el panel rechaza tanto rutas absolutas como el nombre solo).
4. Una vez creado, entrar al repositorio → **MODIFICAR**:
   - Despliegue Rama: `main`
   - Despliegue Carpeta: **ruta relativa al home**, ej.
     `domains/<subdominio>.hogartv.cl` (sin barra inicial).
5. Botón **DESPLIEGUE** para el primer checkout manual.

**Confirmado con una prueba deliberada:** el despliegue NO borra archivos
que no están en el repositorio (se creó un archivo de prueba en la carpeta
de destino, se corrió el despliegue de nuevo, y sobrevivió) — por eso
`config/config.php` y `storage/fotos/*` (ambos en `.gitignore`, nunca en
el repo) quedan intactos en cada despliegue.

## 3. Webhook (deploy automático en cada push)

En **Git → repositorio → detalle** aparece una **Webhook URL** única. En
GitHub → repo → **Settings → Webhooks → Add webhook**: pegar esa URL,
Content type `application/json`, evento "Just the push event". Con esto,
cada `git push` a `main` dispara el deploy solo, sin GitHub Actions ni FTP.

## 4. Versión de PHP

**PHP 8.1+** (el mínimo real del código, ver `app/bootstrap.php`). Se
gestiona por cuenta completa en la mayoría de los planes DirectAdmin
compartidos (no por subdominio individual) — revisar en **PHP Selector**;
si ya está en 8.1 o superior para toda la cuenta, no hay nada que hacer.
**Cuidado si en algún momento se sube la versión global**: afecta a TODOS
los dominios de la cuenta, no solo a este — revisar primero si el panel
ofrece una anulación por dominio individual antes de tocar la versión
global.

## 5. Base de datos

1. Crear la base de datos y el usuario MySQL desde DirectAdmin (**Bases de
   datos MySQL**), con todos los privilegios otorgados al usuario sobre esa
   base.
2. Importar [`database/schema_fase1.sql`](../database/schema_fase1.sql)
   completo vía phpMyAdmin (ya incluye las tablas de Fase 2 — Liquidación y
   Billetera — no hace falta un segundo archivo).
3. **Generar el hash real de la contraseña de Edwin** — el schema deja el
   usuario admin sembrado con un placeholder:
   ```sql
   INSERT INTO usuarios (nombre, usuario, password_hash, rol, porcentaje_reparto)
   VALUES ('Edwin', 'edwin', '__REEMPLAZAR_CON_HASH_REAL__', 'admin', 100.00);
   ```
   Ese placeholder **no sirve para loguearse**. Formas de generar un hash
   real sin acceso a terminal PHP:
   - Un script PHP de una línea subido temporalmente a `public_html/` (ej.
     `hash.php`): `<?php echo password_hash('la-contraseña-real', PASSWORD_DEFAULT);`
     — abrirlo una vez en el navegador, copiar el resultado, **borrar el
     archivo enseguida**.
   - phpMyAdmin no genera hashes de `password_hash()` de PHP — no sirve
     `MD5()`/`SHA1()` de MySQL, el login usa `password_verify()`.

   Con el hash copiado: `UPDATE usuarios SET password_hash = '<hash>' WHERE usuario = 'edwin';`

## 6. `config/config.php`

Se sube **a mano, una sola vez, directo por File Manager** —
**nunca por git** (está en `.gitignore` a propósito). Copiar el patrón de
[`config/config.example.php`](../config/config.example.php) con las
credenciales reales de MySQL de esta cuenta (`host` suele ser `localhost`
en DirectAdmin). Dejar `app.debug` en `false` siempre en producción.

Nota: `Database::connection()` sanitiza el mensaje de error de PDO antes de
propagarlo (nunca expone el DSN ni credenciales) — si hace falta ver el
error real de conexión para diagnosticar algo, subir un script de
diagnóstico de un solo uso que llame a `new PDO(...)` directo y capture
`$e->getMessage()` sin pasar por esa clase, en vez de activar `debug: true`
en la app completa (que igual mostraría el mensaje ya sanitizado).

## 7. `storage/fotos/`

Debe existir y ser escribible por PHP. Vive **fuera** de `public_html/` a
propósito — las fotos tienen GPS implícito y no deben quedar servibles por
URL directa; se sirven solo a través de `GET /api/fotos/{id}` con control
de acceso.

## 8. HTTPS

Certificado Let's Encrypt gestionado por DirectAdmin (a menudo un wildcard
`*.hogartv.cl` que cubre subdominios nuevos automáticamente, sin trámite
aparte). `Auth::start()` fija la cookie de sesión con `'secure' => true` —
sin HTTPS, la sesión nunca se guarda y el login parece "no hacer nada".

## 9. Prueba de humo (en este orden)

1. `https://<subdominio>.hogartv.cl/admin/` → login con `edwin` / la
   contraseña recién fijada.
2. Panel admin carga y **no** muestra el mensaje de "PHP requiere 8.1+".
3. Crear un usuario técnico de prueba (mismo procedimiento del punto 5,
   `rol='tecnico'`) → `https://<subdominio>.hogartv.cl/tecnico/` en el
   celular → login → completar una orden de punta a punta (los 5 pasos)
   con señal real. **Requiere una tarifa vigente** para el tipo de servicio
   usado (Tarifario en el panel admin) — si no hay ninguna, el envío final
   se rechaza correctamente (es una validación real, no un bug).
4. Apagar datos móviles a mitad del wizard, seguir avanzando, confirmar que
   queda "guardado sin conexión", y que al reactivar la señal se sincroniza
   solo.
5. Instalar la PWA del técnico ("Agregar a pantalla de inicio") y confirmar
   que abre sin barra de navegador.
6. En el panel admin: aprobar la orden de prueba, y en Billetera confirmar
   que aparece como pendiente por liquidar para ese técnico.

## Notas

- No hay build step ni `npm install` en el servidor — todo el JS del
  frontend (`public_html/admin/js/`, `public_html/tecnico/js/`) se sirve
  tal cual, como módulos ES nativos.
- Las dos librerías vendorizadas (`html5-qrcode.min.js`, `compressor.min.js`
  bajo `public_html/tecnico/js/vendor/`) ya están en el repo — no se
  descargan en el servidor.
- El `.htaccess` de la raíz del proyecto (pensado originalmente como
  cinturón de seguridad extra, bloqueando acceso directo si el Document
  Root apuntara mal) se **quitó del repositorio** — causó un 403 heredado
  real en dos hostings distintos con configuraciones de `AllowOverride`/
  scope de `.htaccess` más amplias de lo esperado. La protección real ya
  existe por estructura: `app/`, `config/`, `database/`, `storage/` viven
  fuera de `public_html/`, así que nunca son alcanzables por URL sin
  importar qué `.htaccess` haya o no.
- Si en algún momento se agrega un segundo técnico o cambia algún
  `porcentaje_reparto`, es un `UPDATE` directo sobre `usuarios` — no hay
  hoy una pantalla de admin para gestionar usuarios más allá de lo que ya
  cubre `AdminUsuarioController`.
