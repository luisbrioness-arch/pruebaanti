<?php
// Script de un solo uso — agrega fecha_instalacion_solicitada a ventas
// (pedido: "que aparezca en el dashboard del edwin como pendiente de
// instalar dependiendo de la fecha de instalación solicitada por el
// cliente"). Idempotente. Abrir una vez y BORRAR.
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

$stmt = $pdo->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ventas' AND column_name = 'fecha_instalacion_solicitada'");
$stmt->execute();
if ($stmt->fetchColumn()) {
    echo "SKIP: ventas.fecha_instalacion_solicitada ya existía\n";
} else {
    $pdo->exec("ALTER TABLE ventas ADD COLUMN fecha_instalacion_solicitada DATE NULL AFTER cliente_telefono");
    echo "OK: ventas.fecha_instalacion_solicitada agregada\n";
}

echo "\n== Listo. BORRA ESTE ARCHIVO AHORA. ==\n";
