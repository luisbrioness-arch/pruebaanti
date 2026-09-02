<?php
// Temporal — admin + 2 técnicos de prueba para verificar visualmente el
// traspaso entre técnicos en el navegador (no se usa la cuenta real de
// Edwin). Se borra junto con _test_teardown2.php al terminar.
declare(strict_types=1);
$config = require __DIR__ . '/../config/config.php';
$db = $config['db'];
$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=%s', $db['host'], $db['name'], $db['charset'] ?? 'utf8mb4'),
    $db['user'], $db['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
header('Content-Type: text/plain; charset=utf-8');

$hash = password_hash('TestClaude123!', PASSWORD_DEFAULT);
$usuarios = [
    ['zz_test_admin', 'ZZ Test Admin', 'admin'],
    ['zz_test_tecA', 'ZZ Técnico A', 'tecnico'],
    ['zz_test_tecB', 'ZZ Técnico B', 'tecnico'],
];
foreach ($usuarios as [$usuario, $nombre, $rol]) {
    $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE usuario = ?');
    $stmt->execute([$usuario]);
    if ($stmt->fetchColumn()) {
        echo "$usuario ya existía\n";
        continue;
    }
    $pdo->prepare(
        "INSERT INTO usuarios (nombre, usuario, password_hash, rol, porcentaje_reparto) VALUES (?, ?, ?, ?, 100)"
    )->execute([$nombre, $usuario, $hash, $rol]);
    echo "$usuario creado\n";
}
