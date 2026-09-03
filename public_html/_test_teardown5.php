<?php
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
    $idsEquipo = $pdo->query("SELECT id FROM equipos WHERE numero_serie LIKE 'ZZBTN-%'")->fetchAll(PDO::FETCH_COLUMN);
    if ($idsEquipo) {
        $m = implode(',', array_fill(0, count($idsEquipo), '?'));
        $pdo->prepare("DELETE FROM movimientos_equipo WHERE equipo_id IN ($m)")->execute($idsEquipo);
        $pdo->prepare("DELETE FROM equipos WHERE id IN ($m)")->execute($idsEquipo);
        echo 'Equipos de prueba borrados: ' . count($idsEquipo) . "\n";
    }
    $idsUsuario = $pdo->query("SELECT id FROM usuarios WHERE usuario IN ('zz_test_admin','zz_test_tec')")->fetchAll(PDO::FETCH_COLUMN);
    if ($idsUsuario) {
        $m = implode(',', array_fill(0, count($idsUsuario), '?'));
        $pdo->prepare("DELETE FROM movimientos_ferreteria WHERE usuario_id IN ($m)")->execute($idsUsuario);
        $idsEntrega = $pdo->query("SELECT id FROM entregas_ferreteria_pendientes WHERE tecnico_id IN (" . implode(',', $idsUsuario) . ") OR creado_por IN (" . implode(',', $idsUsuario) . ")")->fetchAll(PDO::FETCH_COLUMN);
        if ($idsEntrega) {
            $me = implode(',', array_fill(0, count($idsEntrega), '?'));
            $pdo->prepare("DELETE FROM movimientos_ferreteria_central WHERE entrega_pendiente_id IN ($me)")->execute($idsEntrega);
        }
        $pdo->prepare("DELETE FROM movimientos_ferreteria_central WHERE creado_por IN ($m)")->execute($idsUsuario);
        $pdo->prepare("DELETE FROM entregas_ferreteria_pendientes WHERE tecnico_id IN ($m) OR creado_por IN ($m)")->execute(array_merge($idsUsuario, $idsUsuario));
        $pdo->prepare("DELETE FROM stock_ferreteria_usuario WHERE usuario_id IN ($m)")->execute($idsUsuario);
        $pdo->prepare("DELETE FROM usuarios WHERE id IN ($m)")->execute($idsUsuario);
        echo 'Usuarios de prueba borrados: ' . count($idsUsuario) . "\n";
    }
    $pdo->commit();
    echo "OK\n";
} catch (Throwable $e) {
    $pdo->rollBack();
    echo 'ERROR: ' . $e->getMessage() . "\n";
}
