<?php
declare(strict_types=1);
$config = require __DIR__ . '/../config/config.php';
$db = $config['db'];
$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=%s', $db['host'], $db['name'], $db['charset'] ?? 'utf8mb4'),
    $db['user'], $db['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
header('Content-Type: text/plain; charset=utf-8');
$stmt = $pdo->prepare("DELETE FROM ventas WHERE numero_venta_tuves = 'ZZTEST-VENTA-001'");
$stmt->execute();
echo 'Borradas: ' . $stmt->rowCount() . "\n";
