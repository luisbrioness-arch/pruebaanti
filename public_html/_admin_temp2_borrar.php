<?php
declare(strict_types=1);
$config = require __DIR__ . '/../config/config.php';
$db = $config['db'];
$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=%s', $db['host'], $db['name'], $db['charset'] ?? 'utf8mb4'),
    $db['user'], $db['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
header('Content-Type: text/plain; charset=utf-8');
// No se borra: tarifas_instalacion_plan.creado_por (FK) apunta a esta
// cuenta en las 4 tarifas reales que acaba de crear. Se desactiva.
$stmt = $pdo->prepare("UPDATE usuarios SET activo = 0 WHERE usuario = 'zz_temp_admin2'");
$stmt->execute();
echo 'Cuenta temporal desactivada: ' . $stmt->rowCount() . "\n";
