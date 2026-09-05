<?php
// Script temporal — limpia todo lo que creó _test_detalle_periodo.php:
// el técnico de prueba, sus órdenes, el período de liquidación y el
// movimiento de billetera asociado.
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Core\Database;

header('Content-Type: text/plain; charset=utf-8');

$pdo = Database::connection();
$stmt = $pdo->prepare("SELECT id FROM usuarios WHERE usuario = 'zz_test_liq'");
$stmt->execute();
$tecnicoId = $stmt->fetchColumn();

if (!$tecnicoId) {
    echo "No existe el usuario de prueba — nada que limpiar.\n";
    exit;
}

$pdo->prepare('DELETE FROM movimientos_billetera WHERE tecnico_id = ?')->execute([$tecnicoId]);
$borradasOrdenes = $pdo->prepare('DELETE FROM ordenes WHERE tecnico_id = ?');
$borradasOrdenes->execute([$tecnicoId]);
$nOrdenes = $borradasOrdenes->rowCount();
$borradosPeriodos = $pdo->prepare('DELETE FROM periodos_liquidacion WHERE tecnico_id = ?');
$borradosPeriodos->execute([$tecnicoId]);
$nPeriodos = $borradosPeriodos->rowCount();
$pdo->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$tecnicoId]);

echo "Borrado: usuario id=$tecnicoId, $nOrdenes orden(es), $nPeriodos periodo(s), movimientos de billetera.\n";
