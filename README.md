# Terreno DTH

Sistema de operación en terreno para una contratista de instalaciones DTH
(TV satelital): registro de órdenes de trabajo, control de inventario
(equipos y ferretería), auditoría, liquidación y billetera por técnico.

Dos frontends vanilla (sin build step) sobre una única API PHP:

- **`public/tecnico/`** — PWA instalable para el técnico en terreno (celular), con cola de escritura offline.
- **`public/admin/`** — panel de escritorio para Edwin (admin), con su propia cola de escritura offline.

## Stack

PHP vanilla + MySQL en hosting compartido (sin Composer, sin Node en
producción). HTML5/CSS/JS vanilla en el frontend, sin framework ni build
step — todo se sirve tal cual.

## Documentación

- [`docs/despliegue.md`](docs/despliegue.md) — cómo poner esto en un hosting real (PHP, base de datos, permisos, HTTPS).
- [`docs/wizard-api.md`](docs/wizard-api.md) — contrato completo de la API del wizard técnico.
- [`docs/admin-api.md`](docs/admin-api.md) — panel admin: auditoría, conflictos, tarifario, bodega, cola offline.
- [`docs/tecnico-app.md`](docs/tecnico-app.md) — la PWA del técnico.
- [`docs/liquidacion-billetera.md`](docs/liquidacion-billetera.md) — cierre de períodos y billetera por técnico.
- [`docs/modelo-datos-fase1.md`](docs/modelo-datos-fase1.md) — modelo de datos.

## Estructura

```
app/            Backend PHP (Controllers, Services, Repositories, Core)
config/         config.php (real, fuera de git) + config.example.php (plantilla)
database/       schema_fase1.sql + scripts de prueba (no se despliegan)
public/         Document root del hosting — index.php, admin/, tecnico/
storage/fotos/  Fotos de órdenes (fuera de /public a propósito, servidas con control de acceso)
```

## Despliegue

Automático vía GitHub Actions al hacer push a `main` (ver
`.github/workflows/deploy.yml`). Detalle completo del hosting en
[`docs/despliegue.md`](docs/despliegue.md).
