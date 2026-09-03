<?php
// Limpia lo que _diag_autoaprobar.php dejó colgado (orden id=3, equipo id=9,
// usuario id=16) — el orden de borrado en el script original no consideró
// equipos.orden_instalacion_id -> ordenes.id. Acá se borra el equipo ANTES
// que la orden para no chocar con esa FK.
declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

use App\Core\Database;

header('Content-Type: application/json');
$pdo = Database::connection();
$resultado = [];

try {
    $orden = $pdo->query("SELECT id FROM ordenes WHERE folio = 'ZZ-TEST-FOLIO'")->fetch();
    $equipo = $pdo->query("SELECT id FROM equipos WHERE numero_serie LIKE 'ZZ-TEST-AUD-%'")->fetch();
    $usuario = $pdo->query("SELECT id FROM usuarios WHERE usuario LIKE 'zz_test_auditoria_%'")->fetch();

    if ($equipo) {
        $pdo->prepare('DELETE FROM movimientos_equipo WHERE equipo_id = ?')->execute([$equipo['id']]);
    }
    if ($orden) {
        $pdo->prepare('DELETE FROM orden_materiales WHERE orden_id = ?')->execute([$orden['id']]);
    }
    if ($equipo) {
        $pdo->prepare('DELETE FROM equipos WHERE id = ?')->execute([$equipo['id']]);
        $resultado['equipo_borrado'] = $equipo['id'];
    }
    if ($orden) {
        $pdo->prepare('DELETE FROM ordenes WHERE id = ?')->execute([$orden['id']]);
        $resultado['orden_borrada'] = $orden['id'];
    }
    if ($usuario) {
        $pdo->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$usuario['id']]);
        $resultado['usuario_borrado'] = $usuario['id'];
    }

    $resultado['ok'] = true;
    echo json_encode($resultado, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} catch (\Throwable $e) {
    $resultado['error'] = $e->getMessage();
    http_response_code(500);
    echo json_encode($resultado, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}
