<?php
declare(strict_types=1);
require dirname(__DIR__) . '/app/bootstrap.php';
use App\Core\Database;
header('Content-Type: text/plain; charset=utf-8');

$stmt = Database::connection()->prepare(
    "SELECT ts.codigo, tsv.* FROM tarifas_servicio tsv
     JOIN tipos_servicio ts ON ts.id = tsv.tipo_servicio_id
     WHERE ts.codigo = 'instalacion_nueva'
     ORDER BY tsv.vigente_desde DESC"
);
$stmt->execute();
foreach ($stmt->fetchAll() as $row) {
    echo json_encode($row) . "\n";
}
