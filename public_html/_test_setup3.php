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
foreach ([['zz_test_admin', 'ZZ Test Admin', 'admin'], ['zz_test_tec', 'ZZ Test Tecnico', 'tecnico']] as [$u, $n, $r]) {
    $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE usuario = ?');
    $stmt->execute([$u]);
    if ($stmt->fetchColumn()) { echo "$u ya existía\n"; continue; }
    $pdo->prepare("INSERT INTO usuarios (nombre, usuario, password_hash, rol, porcentaje_reparto) VALUES (?, ?, ?, ?, 100)")->execute([$n, $u, $hash, $r]);
    echo "$u creado\n";
}
