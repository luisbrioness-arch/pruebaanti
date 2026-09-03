<?php
// Script de un solo uso — aplica a producción el esquema de "bodegas
// físicas" + stock central de ferretería trackeado (ver database/schema_fase1.sql
// y docs/bodegas-traspasos.md). Idempotente. Abrir una vez y BORRAR.
declare(strict_types=1);

$config = require __DIR__ . '/../config/config.php';
$db = $config['db'];
$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=%s', $db['host'], $db['name'], $db['charset'] ?? 'utf8mb4'),
    $db['user'],
    $db['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

header('Content-Type: text/plain; charset=utf-8');

function columnaExiste(PDO $pdo, string $tabla, string $columna): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?");
    $stmt->execute([$tabla, $columna]);
    return (bool) $stmt->fetchColumn();
}
function constraintExiste(PDO $pdo, string $tabla, string $nombre): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?");
    $stmt->execute([$tabla, $nombre]);
    return (bool) $stmt->fetchColumn();
}
function tablaExiste(PDO $pdo, string $tabla): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?");
    $stmt->execute([$tabla]);
    return (bool) $stmt->fetchColumn();
}

echo "== Migración: bodegas físicas + stock central ==\n\n";

if (!tablaExiste($pdo, 'bodegas')) {
    $pdo->exec("CREATE TABLE bodegas (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(80) NOT NULL,
        activa TINYINT(1) NOT NULL DEFAULT 1,
        creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_bodegas_nombre (nombre)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    echo "OK: tabla bodegas creada\n";
} else {
    echo "SKIP: tabla bodegas ya existía\n";
}

$stmt = $pdo->prepare('SELECT id FROM bodegas WHERE nombre = ?');
$stmt->execute(['Bodega Central']);
$bodegaCentralId = $stmt->fetchColumn();
if (!$bodegaCentralId) {
    $pdo->prepare('INSERT INTO bodegas (nombre) VALUES (?)')->execute(['Bodega Central']);
    $bodegaCentralId = (int) $pdo->lastInsertId();
    echo "OK: 'Bodega Central' sembrada (id=$bodegaCentralId)\n";
} else {
    echo "SKIP: 'Bodega Central' ya existía (id=$bodegaCentralId)\n";
}

if (!columnaExiste($pdo, 'equipos', 'bodega_id')) {
    $pdo->exec('ALTER TABLE equipos ADD COLUMN bodega_id INT UNSIGNED NULL AFTER origen_pendiente_id');
    echo "OK: equipos.bodega_id agregada\n";
} else {
    echo "SKIP: equipos.bodega_id ya existía\n";
}
if (!constraintExiste($pdo, 'equipos', 'fk_equipo_bodega')) {
    $pdo->exec('ALTER TABLE equipos ADD CONSTRAINT fk_equipo_bodega FOREIGN KEY (bodega_id) REFERENCES bodegas(id)');
    echo "OK: FK fk_equipo_bodega agregada\n";
} else {
    echo "SKIP: FK fk_equipo_bodega ya existía\n";
}

$actualizados = $pdo->prepare("UPDATE equipos SET bodega_id = ? WHERE estado = 'bodega' AND bodega_id IS NULL");
$actualizados->execute([$bodegaCentralId]);
echo 'OK: ' . $actualizados->rowCount() . " equipos en bodega sin bodega_id, backfillados a 'Bodega Central'\n";

if (!tablaExiste($pdo, 'stock_ferreteria_central')) {
    $pdo->exec("CREATE TABLE stock_ferreteria_central (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        bodega_id INT UNSIGNED NOT NULL,
        item_ferreteria_id INT UNSIGNED NOT NULL,
        cantidad_actual DECIMAL(10,2) NOT NULL DEFAULT 0,
        actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_stockcentral (bodega_id, item_ferreteria_id),
        CONSTRAINT fk_stockcentral_bodega FOREIGN KEY (bodega_id) REFERENCES bodegas(id),
        CONSTRAINT fk_stockcentral_item FOREIGN KEY (item_ferreteria_id) REFERENCES items_ferreteria(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    echo "OK: tabla stock_ferreteria_central creada\n";
} else {
    echo "SKIP: tabla stock_ferreteria_central ya existía\n";
}

if (!tablaExiste($pdo, 'movimientos_ferreteria_central')) {
    $pdo->exec("CREATE TABLE movimientos_ferreteria_central (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        bodega_id INT UNSIGNED NOT NULL,
        item_ferreteria_id INT UNSIGNED NOT NULL,
        tipo_movimiento ENUM('ingreso','egreso_pendiente','reingreso_rechazo','ajuste_descuadre') NOT NULL,
        cantidad DECIMAL(10,2) NOT NULL,
        entrega_pendiente_id INT UNSIGNED NULL,
        observacion VARCHAR(255) NULL,
        creado_por INT UNSIGNED NOT NULL,
        creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_movferrcentral_bodega FOREIGN KEY (bodega_id) REFERENCES bodegas(id),
        CONSTRAINT fk_movferrcentral_item FOREIGN KEY (item_ferreteria_id) REFERENCES items_ferreteria(id),
        CONSTRAINT fk_movferrcentral_entrega FOREIGN KEY (entrega_pendiente_id) REFERENCES entregas_ferreteria_pendientes(id),
        CONSTRAINT fk_movferrcentral_creadopor FOREIGN KEY (creado_por) REFERENCES usuarios(id),
        KEY idx_movferrcentral (bodega_id, item_ferreteria_id, creado_en)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    echo "OK: tabla movimientos_ferreteria_central creada\n";
} else {
    echo "SKIP: tabla movimientos_ferreteria_central ya existía\n";
}

if (!columnaExiste($pdo, 'entregas_ferreteria_pendientes', 'bodega_id')) {
    $pdo->exec('ALTER TABLE entregas_ferreteria_pendientes ADD COLUMN bodega_id INT UNSIGNED NULL AFTER tecnico_id');
    echo "OK: entregas_ferreteria_pendientes.bodega_id agregada\n";
} else {
    echo "SKIP: entregas_ferreteria_pendientes.bodega_id ya existía\n";
}
if (!constraintExiste($pdo, 'entregas_ferreteria_pendientes', 'fk_entregaferrpend_bodega')) {
    $pdo->exec('ALTER TABLE entregas_ferreteria_pendientes ADD CONSTRAINT fk_entregaferrpend_bodega FOREIGN KEY (bodega_id) REFERENCES bodegas(id)');
    echo "OK: FK fk_entregaferrpend_bodega agregada\n";
} else {
    echo "SKIP: FK fk_entregaferrpend_bodega ya existía\n";
}

echo "\n== Listo. BORRA ESTE ARCHIVO AHORA. ==\n";
