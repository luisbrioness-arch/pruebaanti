<?php
declare(strict_types=1);
$config = require __DIR__ . '/../config/config.php';
$db = $config['db'];
$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=%s', $db['host'], $db['name'], $db['charset'] ?? 'utf8mb4'),
    $db['user'], $db['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
header('Content-Type: text/plain; charset=utf-8');
$hash = password_hash('TestClaude123!', PASSWORD_DEFAULT);
$stmt = $pdo->prepare('SELECT id FROM usuarios WHERE usuario = ?');
$stmt->execute(['zz_temp_admin3']);
if ($stmt->fetchColumn()) {
    echo "ya existía\n";
} else {
    $pdo->prepare("INSERT INTO usuarios (nombre, usuario, password_hash, rol, porcentaje_reparto) VALUES ('ZZ Temp Admin 3', 'zz_temp_admin3', ?, 'admin', 100)")->execute([$hash]);
    echo "creado\n";
}
