<?php
declare(strict_types=1);
$config = require __DIR__ . '/../config/config.php';
$db = $config['db'];
$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=%s', $db['host'], $db['name'], $db['charset'] ?? 'utf8mb4'),
    $db['user'], $db['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
header('Content-Type: text/plain; charset=utf-8');
$stmt = $pdo->prepare("DELETE FROM ventas WHERE numero_venta_tuves LIKE 'ZZVENC-%'");
$stmt->execute();
echo 'Ventas de prueba borradas: ' . $stmt->rowCount() . "\n";

// zz_temp_admin3 no creó filas con FK apuntando a él (solo ventas, ya
// borradas) — se puede borrar de verdad, a diferencia de los otros temp admin.
$stmt = $pdo->prepare("DELETE FROM usuarios WHERE usuario = 'zz_temp_admin3'");
$stmt->execute();
echo 'Cuenta temporal borrada: ' . $stmt->rowCount() . "\n";
