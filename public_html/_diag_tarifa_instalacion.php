<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';
use App\Core\Database;
header('Content-Type: application/json');
$pdo = Database::connection();
$ts = $pdo->query("SELECT * FROM tipos_servicio WHERE codigo = 'instalacion_nueva'")->fetch();
$vigente = null;
$historial = [];
if ($ts) {
    $stmt = $pdo->prepare("SELECT * FROM tarifas_servicio WHERE tipo_servicio_id = ? ORDER BY vigente_desde DESC");
    $stmt->execute([$ts['id']]);
    $historial = $stmt->fetchAll();
    foreach ($historial as $h) {
        if ($h['vigente_hasta'] === null) { $vigente = $h; break; }
    }
}
echo json_encode(['tipo_servicio' => $ts, 'vigente' => $vigente, 'historial' => $historial], JSON_PRETTY_PRINT);
