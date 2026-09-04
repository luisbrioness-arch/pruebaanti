<?php
declare(strict_types=1);
require dirname(__DIR__) . '/app/bootstrap.php';
use App\Repositories\EquipoRepository;
use App\Repositories\BodegaRepository;
use App\Repositories\MovimientoEquipoRepository;
header('Content-Type: text/plain; charset=utf-8');

$equipos = new EquipoRepository();
$bodegas = new BodegaRepository();
$movs = new MovimientoEquipoRepository();

$equipo = $equipos->porSerie('TESTDECO0009');
if (!$equipo) { echo "No existe TESTDECO0009.\n"; exit; }

$central = null;
foreach ($bodegas->activas() as $b) {
    if ($b['nombre'] === 'Bodega Central') { $central = $b; break; }
}
if (!$central) { echo "No se encontro Bodega Central.\n"; exit; }

$equipos->actualizarEstado((int) $equipo['id'], 'bodega', null, null, null, (int) $central['id']);
$movs->crear((int) $equipo['id'], 'ajuste_descuadre', null, null, null, 'Restaurado tras prueba del boton Perdido (Claude).');
echo "OK — TESTDECO0009 de vuelta en Bodega Central.\n";
