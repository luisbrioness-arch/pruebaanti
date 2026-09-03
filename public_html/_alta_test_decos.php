<?php
// Script temporal — pedido: "generame el alta de 10 decos con series
// genericas para yo hacer el proceso de traspaso". Idempotente: si una
// serie ya existe, la salta en vez de fallar. Se borra apenas se confirma
// que corrió bien (mismo patrón que los demás scripts _*.php de este
// repo).
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Services\BodegaService;
use App\Repositories\BodegaRepository;

header('Content-Type: text/plain; charset=utf-8');

$bodegas = new BodegaRepository();
$central = null;
foreach ($bodegas->activas() as $b) {
    if ($b['nombre'] === 'Bodega Central') { $central = $b; break; }
}
if (!$central) {
    http_response_code(500);
    echo "No se encontró 'Bodega Central'.\n";
    exit;
}

$servicio = new BodegaService();
$creados = [];
$saltados = [];
for ($i = 1; $i <= 10; $i++) {
    $serie = sprintf('TESTDECO%04d', $i);
    try {
        $servicio->altaEquipo('decodificador', $serie, (int) $central['id']);
        $creados[] = $serie;
    } catch (\App\Exceptions\ValidationException $e) {
        // "Ya existe un equipo registrado con esa serie" — reintento seguro
        $saltados[] = $serie;
    }
}

echo "Creados (" . count($creados) . "): " . implode(', ', $creados) . "\n";
echo "Ya existían (" . count($saltados) . "): " . implode(', ', $saltados) . "\n";
