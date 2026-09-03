<?php
// URGENTE: "Instalación nueva" se quedó sin tarifa vigente (cerrada hoy sin
// reemplazo, probablemente por una prueba anterior de la funcionalidad
// "Eliminar"). Restaura el monto original de $30.000 usando el mismo
// TarifarioService::editarTarifa que usa el endpoint real, para que quede
// la fila de historial correcta.
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';
use App\Core\Database;
use App\Services\TarifarioService;

header('Content-Type: application/json');
$pdo = Database::connection();
$edwin = $pdo->query("SELECT id FROM usuarios WHERE usuario = 'edwin'")->fetch();
if (!$edwin) {
    http_response_code(500);
    echo json_encode(['error' => 'No se encontró a Edwin']);
    exit;
}

try {
    $resultado = (new TarifarioService())->editarTarifa('instalacion_nueva', 30000, (int) $edwin['id']);
    echo json_encode(['ok' => true, 'tarifa' => $resultado]);
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
