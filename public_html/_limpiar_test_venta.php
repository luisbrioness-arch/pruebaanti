<?php
declare(strict_types=1);
require dirname(__DIR__) . '/app/bootstrap.php';
use App\Core\Database;
header('Content-Type: text/plain; charset=utf-8');
$stmt = Database::connection()->prepare("DELETE FROM ventas WHERE numero_venta_tuves = 'zz9999' AND estado = 'registrada'");
$stmt->execute();
echo "Borradas: " . $stmt->rowCount() . "\n";
