<?php
// Borra la orden de prueba ZZTEST-DECOS-1 (borrador, nunca enviada) usada
// para verificar el aviso de "cuántos decos trae el plan" en el paso 2 del
// wizard. No toca la venta real (id=10) que quedó enlazada — un borrador
// nunca la modifica, solo confirmarEnviada() lo haría.
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';
use App\Core\Database;
header('Content-Type: application/json');
$pdo = Database::connection();
$resultado = [];
try {
    $orden = $pdo->query("SELECT id FROM ordenes WHERE folio = 'ZZTEST-DECOS-1'")->fetch();
    if ($orden) {
        $pdo->prepare('DELETE FROM ordenes WHERE id = ?')->execute([$orden['id']]);
        $resultado['orden_borrada'] = $orden['id'];
    } else {
        $resultado['orden_borrada'] = null;
    }
    $resultado['ok'] = true;
    echo json_encode($resultado);
} catch (\Throwable $e) {
    $resultado['error'] = $e->getMessage();
    http_response_code(500);
    echo json_encode($resultado);
}
