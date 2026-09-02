<?php
declare(strict_types=1);
$config = require __DIR__ . '/../config/config.php';
$db = $config['db'];
$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=%s', $db['host'], $db['name'], $db['charset'] ?? 'utf8mb4'),
    $db['user'], $db['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
header('Content-Type: text/plain; charset=utf-8');

echo "-- equipos columns --\n";
foreach ($pdo->query("SHOW COLUMNS FROM equipos")->fetchAll(PDO::FETCH_ASSOC) as $c) {
    echo $c['Field'] . ' : ' . $c['Type'] . "\n";
}
echo "\n-- movimientos_equipo.tipo_movimiento --\n";
foreach ($pdo->query("SHOW COLUMNS FROM movimientos_equipo WHERE Field = 'tipo_movimiento'")->fetchAll(PDO::FETCH_ASSOC) as $c) {
    echo $c['Type'] . "\n";
}
echo "\n-- entregas_ferreteria_pendientes exists? --\n";
echo $pdo->query("SHOW TABLES LIKE 'entregas_ferreteria_pendientes'")->fetchColumn() ?: 'NO' , "\n";

echo "\n-- row counts --\n";
echo "equipos: " . $pdo->query("SELECT COUNT(*) FROM equipos")->fetchColumn() . "\n";
echo "usuarios: " . $pdo->query("SELECT COUNT(*) FROM usuarios")->fetchColumn() . "\n";
