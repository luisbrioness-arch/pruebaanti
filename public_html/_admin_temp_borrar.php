<?php
declare(strict_types=1);
$config = require __DIR__ . '/../config/config.php';
$db = $config['db'];
$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=%s', $db['host'], $db['name'], $db['charset'] ?? 'utf8mb4'),
    $db['user'], $db['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
header('Content-Type: text/plain; charset=utf-8');
// NO se borra la fila: comisiones_plan.creado_por (FK) apunta a esta cuenta
// en las comisiones que acaba de crear — borrarla rompería esa referencia
// real. Se desactiva (no puede loguearse más) y listo, mismo criterio que
// el resto del sistema: nunca borrar historial real.
$stmt = $pdo->prepare("UPDATE usuarios SET activo = 0 WHERE usuario = 'zz_temp_admin'");
$stmt->execute();
echo 'Cuenta temporal desactivada: ' . $stmt->rowCount() . "\n";
