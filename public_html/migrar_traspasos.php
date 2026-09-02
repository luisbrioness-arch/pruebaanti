<?php
// Script de un solo uso — aplica a producción los cambios de esquema para
// "Traspasos pendientes de confirmación" (ver database/schema_fase1.sql).
// Idempotente: se puede correr más de una vez sin romper nada. Abrir una
// vez en el navegador y BORRAR ESTE ARCHIVO enseguida (mismo patrón que
// hash.php en docs/despliegue.md).
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
    $stmt = $pdo->prepare(
        "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?"
    );
    $stmt->execute([$tabla, $columna]);
    return (bool) $stmt->fetchColumn();
}

function constraintExiste(PDO $pdo, string $tabla, string $nombre): bool
{
    $stmt = $pdo->prepare(
        "SELECT 1 FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?"
    );
    $stmt->execute([$tabla, $nombre]);
    return (bool) $stmt->fetchColumn();
}

function tablaExiste(PDO $pdo, string $tabla): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?");
    $stmt->execute([$tabla]);
    return (bool) $stmt->fetchColumn();
}

echo "== Migración: traspasos pendientes de confirmación ==\n\n";

// 1) equipos.estado gana 'en_transito' — MODIFY es seguro de re-correr.
$pdo->exec("ALTER TABLE equipos MODIFY COLUMN estado ENUM(
    'bodega','maleta','en_transito','instalado','retirado','falla_fabrica','devuelto_tuves','perdido'
) NOT NULL DEFAULT 'bodega'");
echo "OK: equipos.estado admite 'en_transito'\n";

// 2) equipos.origen_pendiente_id
if (!columnaExiste($pdo, 'equipos', 'origen_pendiente_id')) {
    $pdo->exec("ALTER TABLE equipos ADD COLUMN origen_pendiente_id INT UNSIGNED NULL AFTER usuario_actual_id");
    echo "OK: equipos.origen_pendiente_id agregada\n";
} else {
    echo "SKIP: equipos.origen_pendiente_id ya existía\n";
}
if (!constraintExiste($pdo, 'equipos', 'fk_equipo_origenpendiente')) {
    $pdo->exec("ALTER TABLE equipos ADD CONSTRAINT fk_equipo_origenpendiente FOREIGN KEY (origen_pendiente_id) REFERENCES usuarios(id)");
    echo "OK: FK fk_equipo_origenpendiente agregada\n";
} else {
    echo "SKIP: FK fk_equipo_origenpendiente ya existía\n";
}

// 3) movimientos_equipo.tipo_movimiento gana 3 valores nuevos.
$pdo->exec("ALTER TABLE movimientos_equipo MODIFY COLUMN tipo_movimiento ENUM(
    'ingreso_bodega','asignacion_maleta','traspaso','traspaso_pendiente','traspaso_rechazado','traspaso_cancelado',
    'instalacion','retiro','falla_fabrica','devolucion_tuves','ajuste_descuadre'
) NOT NULL");
echo "OK: movimientos_equipo.tipo_movimiento admite los tipos nuevos\n";

// 4) tabla nueva
if (!tablaExiste($pdo, 'entregas_ferreteria_pendientes')) {
    $pdo->exec("CREATE TABLE entregas_ferreteria_pendientes (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        item_ferreteria_id INT UNSIGNED NOT NULL,
        tecnico_id INT UNSIGNED NOT NULL,
        cantidad DECIMAL(10,2) NOT NULL,
        estado ENUM('pendiente','aceptada','rechazada') NOT NULL DEFAULT 'pendiente',
        observacion_tecnico VARCHAR(255) NULL,
        creado_por INT UNSIGNED NOT NULL,
        creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resuelto_en DATETIME NULL,
        CONSTRAINT fk_entregaferrpend_item FOREIGN KEY (item_ferreteria_id) REFERENCES items_ferreteria(id),
        CONSTRAINT fk_entregaferrpend_tecnico FOREIGN KEY (tecnico_id) REFERENCES usuarios(id),
        CONSTRAINT fk_entregaferrpend_creadopor FOREIGN KEY (creado_por) REFERENCES usuarios(id),
        KEY idx_entregaferrpend_tecnico (tecnico_id, estado)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    echo "OK: tabla entregas_ferreteria_pendientes creada\n";
} else {
    echo "SKIP: tabla entregas_ferreteria_pendientes ya existía\n";
}

echo "\n== Listo. BORRA ESTE ARCHIVO AHORA. ==\n";
