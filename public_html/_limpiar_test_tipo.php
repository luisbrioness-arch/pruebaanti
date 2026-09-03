<?php
// Borra el tipo de equipo de prueba "zz_test_tipo" usado para verificar
// la pestaña Catálogo de Bodega — nunca se usó en ningún equipo real.
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';
use App\Core\Database;
header('Content-Type: application/json');
$pdo = Database::connection();
$resultado = [];
try {
    $tipo = $pdo->prepare('SELECT id FROM tipos_equipo WHERE codigo = ?');
    $tipo->execute(['zz_test_tipo']);
    $tipo = $tipo->fetch();
    if ($tipo) {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM equipos WHERE tipo_equipo_id = ?');
        $stmt->execute([$tipo['id']]);
        $numEquipos = (int) $stmt->fetchColumn();
        if ($numEquipos > 0) {
            throw new \RuntimeException("Este tipo tiene $numEquipos equipo(s) real(es) -- no se borra.");
        }
        $pdo->prepare('DELETE FROM tipos_equipo WHERE id = ?')->execute([$tipo['id']]);
        $resultado['tipo_borrado'] = $tipo['id'];
    } else {
        $resultado['tipo_borrado'] = null;
    }
    $resultado['ok'] = true;
    echo json_encode($resultado);
} catch (\Throwable $e) {
    $resultado['error'] = $e->getMessage();
    http_response_code(500);
    echo json_encode($resultado);
}
