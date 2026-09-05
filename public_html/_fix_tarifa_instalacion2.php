<?php
declare(strict_types=1);
require dirname(__DIR__) . '/app/bootstrap.php';
use App\Services\TarifarioService;
header('Content-Type: text/plain; charset=utf-8');

$usuarios = new \App\Repositories\UsuarioRepository();
$edwin = $usuarios->findByUsuario('edwin');

$resultado = (new TarifarioService())->editarTarifa('instalacion_nueva', 30000, (int) $edwin['id']);
echo json_encode($resultado) . "\n";
