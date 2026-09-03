<?php
declare(strict_types=1);
$config = require __DIR__ . '/../config/config.php';
$db = $config['db'];
$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=%s', $db['host'], $db['name'], $db['charset'] ?? 'utf8mb4'),
    $db['user'], $db['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
header('Content-Type: text/plain; charset=utf-8');
$stmt = $pdo->prepare('SELECT id FROM planes WHERE codigo = ?');
$stmt->execute(['zz_test_plan']);
if ($id = $stmt->fetchColumn()) {
    $pdo->prepare('DELETE FROM comisiones_plan WHERE plan_id = ?')->execute([$id]);
    $pdo->prepare('DELETE FROM planes WHERE id = ?')->execute([$id]);
    echo "Plan de prueba borrado (id=$id)\n";
} else {
    echo "No existía\n";
}
