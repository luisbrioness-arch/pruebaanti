<?php
declare(strict_types=1);
$config = require __DIR__ . '/../config/config.php';
$db = $config['db'];
$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=%s', $db['host'], $db['name'], $db['charset'] ?? 'utf8mb4'),
    $db['user'], $db['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
header('Content-Type: text/plain; charset=utf-8');

// Revertir el ingreso de demo (25 amarra plástica a Bodega Central)
$pdo->exec("DELETE FROM movimientos_ferreteria_central WHERE observacion IS NULL AND cantidad = 25 AND tipo_movimiento = 'ingreso'");
$pdo->exec("UPDATE stock_ferreteria_central SET cantidad_actual = 0 WHERE cantidad_actual = 25");
echo "Ingreso de demo revertido\n";

$stmt = $pdo->prepare("SELECT id FROM usuarios WHERE usuario = 'zz_test_admin'");
$stmt->execute();
if ($id = $stmt->fetchColumn()) {
    $pdo->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
    echo "zz_test_admin borrado\n";
}
