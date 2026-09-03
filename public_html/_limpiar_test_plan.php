<?php
// Borra por completo el plan de prueba "zz_test_plan_borrar" (código) usado
// para verificar el botón Eliminar/Reactivar de Tarifario — nunca se usó en
// ninguna venta, así que se puede borrar de verdad (a diferencia de un plan
// real, que solo se desactiva).
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';
use App\Core\Database;
header('Content-Type: application/json');
$pdo = Database::connection();
$resultado = [];
try {
    $plan = $pdo->prepare('SELECT id FROM planes WHERE codigo = ?');
    $plan->execute(['zz_test_plan_borrar']);
    $plan = $plan->fetch();
    if ($plan) {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM ventas WHERE plan_id = ?');
        $stmt->execute([$plan['id']]);
        $numVentas = (int) $stmt->fetchColumn();
        if ($numVentas > 0) {
            throw new \RuntimeException("Este plan tiene $numVentas venta(s) real(es) — no se borra.");
        }
        $pdo->prepare('DELETE FROM comisiones_plan WHERE plan_id = ?')->execute([$plan['id']]);
        $pdo->prepare('DELETE FROM tarifas_instalacion_plan WHERE plan_id = ?')->execute([$plan['id']]);
        $pdo->prepare('DELETE FROM planes WHERE id = ?')->execute([$plan['id']]);
        $resultado['plan_borrado'] = $plan['id'];
    } else {
        $resultado['plan_borrado'] = null;
    }
    $resultado['ok'] = true;
    echo json_encode($resultado);
} catch (\Throwable $e) {
    $resultado['error'] = $e->getMessage();
    http_response_code(500);
    echo json_encode($resultado);
}
