<?php
// Borra todo lo creado por el smoke test de traspasos (equipos ZZTEST-*,
// usuarios zz_test_*, y sus movimientos/stock asociados). Se corre una vez
// y se borra junto con _test_setup.php.
declare(strict_types=1);
$config = require __DIR__ . '/../config/config.php';
$db = $config['db'];
$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=%s', $db['host'], $db['name'], $db['charset'] ?? 'utf8mb4'),
    $db['user'], $db['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
header('Content-Type: text/plain; charset=utf-8');

$pdo->beginTransaction();
try {
    $idsEquipo = $pdo->query("SELECT id FROM equipos WHERE numero_serie LIKE 'ZZTEST-%'")->fetchAll(PDO::FETCH_COLUMN);
    if ($idsEquipo) {
        $marcadores = implode(',', array_fill(0, count($idsEquipo), '?'));
        $pdo->prepare("DELETE FROM movimientos_equipo WHERE equipo_id IN ($marcadores)")->execute($idsEquipo);
        $pdo->prepare("DELETE FROM equipos WHERE id IN ($marcadores)")->execute($idsEquipo);
        echo "Borrados " . count($idsEquipo) . " equipos de prueba y sus movimientos\n";
    }

    $idsUsuario = $pdo->query("SELECT id FROM usuarios WHERE usuario IN ('zz_test_admin','zz_test_tecnico')")->fetchAll(PDO::FETCH_COLUMN);
    if ($idsUsuario) {
        $marcadores = implode(',', array_fill(0, count($idsUsuario), '?'));
        $pdo->prepare("DELETE FROM movimientos_ferreteria WHERE usuario_id IN ($marcadores)")->execute($idsUsuario);
        $pdo->prepare("DELETE FROM entregas_ferreteria_pendientes WHERE tecnico_id IN ($marcadores) OR creado_por IN ($marcadores)")->execute(array_merge($idsUsuario, $idsUsuario));
        $pdo->prepare("DELETE FROM stock_ferreteria_usuario WHERE usuario_id IN ($marcadores)")->execute($idsUsuario);
        $pdo->prepare("DELETE FROM usuarios WHERE id IN ($marcadores)")->execute($idsUsuario);
        echo "Borrados " . count($idsUsuario) . " usuarios de prueba y su stock/movimientos de ferretería\n";
    }

    $pdo->commit();
    echo "OK\n";
} catch (Throwable $e) {
    $pdo->rollBack();
    echo "ERROR: " . $e->getMessage() . "\n";
}
