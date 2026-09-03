<?php
// Script de un solo uso — agrega cliente_rut/cliente_direccion a ventas
// (pedido: "al registrar venta que deje agregar más datos del cliente como
// rut y direccion"). Idempotente. Abrir una vez y BORRAR.
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

echo "== Migración: cliente_rut / cliente_direccion en ventas ==\n\n";

if (!columnaExiste($pdo, 'ventas', 'cliente_rut')) {
    $pdo->exec("ALTER TABLE ventas ADD COLUMN cliente_rut VARCHAR(20) NULL AFTER cliente_nombre");
    echo "OK: ventas.cliente_rut agregada\n";
} else {
    echo "SKIP: ventas.cliente_rut ya existía\n";
}

if (!columnaExiste($pdo, 'ventas', 'cliente_direccion')) {
    $pdo->exec("ALTER TABLE ventas ADD COLUMN cliente_direccion VARCHAR(255) NULL AFTER cliente_rut");
    echo "OK: ventas.cliente_direccion agregada\n";
} else {
    echo "SKIP: ventas.cliente_direccion ya existía\n";
}

echo "\n== Listo. BORRA ESTE ARCHIVO AHORA. ==\n";
