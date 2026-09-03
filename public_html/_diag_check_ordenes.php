<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';
use App\Core\Database;
header('Content-Type: application/json');
$pdo = Database::connection();
$rows = $pdo->query(
    "SELECT id, folio, estado, tecnico_id, creado_en, fecha_trabajo_dispositivo FROM ordenes WHERE creado_en >= DATE_FORMAT(NOW(), '%Y-%m-01')"
)->fetchAll();
echo json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
