<?php
// Script de un solo uso — agrega cliente_telefono a ventas (pedido:
// "agrega también un campo de teléfono del cliente"). Idempotente.
// Abrir una vez y BORRAR.
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

$stmt = $pdo->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ventas' AND column_name = 'cliente_telefono'");
$stmt->execute();
if ($stmt->fetchColumn()) {
    echo "SKIP: ventas.cliente_telefono ya existía\n";
} else {
    $pdo->exec("ALTER TABLE ventas ADD COLUMN cliente_telefono VARCHAR(20) NULL AFTER cliente_direccion");
    echo "OK: ventas.cliente_telefono agregada\n";
}

echo "\n== Listo. BORRA ESTE ARCHIVO AHORA. ==\n";
