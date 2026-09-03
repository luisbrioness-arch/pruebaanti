<?php

declare(strict_types=1);

/**
 * Smoke test SIN base de datos real: confirma que el autoload resuelve
 * todas las clases de app/, que no hay errores de sintaxis, y que las
 * dependencias entre clases (los "use") apuntan a algo que existe y es
 * instanciable. NO reemplaza probar contra MySQL real — para eso hace
 * falta correr esto con una base de pruebas conectada (ver docs/wizard-api.md).
 *
 * Uso: php database/tests/smoke_test_app.php
 */

require dirname(__DIR__, 2) . '/app/bootstrap.php';

$clases = [
    App\Core\Database::class,
    App\Core\Request::class,
    App\Core\Response::class,
    App\Core\Router::class,
    App\Core\Auth::class,
    App\Exceptions\ApiException::class,
    App\Exceptions\ValidationException::class,
    App\Exceptions\NotFoundException::class,
    App\Exceptions\ForbiddenException::class,
    App\Repositories\UsuarioRepository::class,
    App\Repositories\TipoServicioRepository::class,
    App\Repositories\TarifaServicioRepository::class,
    App\Repositories\EquipoRepository::class,
    App\Repositories\ItemFerreteriaRepository::class,
    App\Repositories\StockFerreteriaUsuarioRepository::class,
    App\Repositories\OrdenRepository::class,
    App\Repositories\OrdenMaterialRepository::class,
    App\Repositories\OrdenFerreteriaRepository::class,
    App\Repositories\OrdenFotoRepository::class,
    App\Repositories\MovimientoEquipoRepository::class,
    App\Repositories\MovimientoFerreteriaRepository::class,
    App\Repositories\PlanRepository::class,
    App\Repositories\ComisionPlanRepository::class,
    App\Repositories\VentaRepository::class,
    App\Repositories\ConflictoSincronizacionRepository::class,
    App\Repositories\TipoEquipoRepository::class,
    App\Services\FotoUploadService::class,
    App\Services\OrdenWizardService::class,
    App\Services\AuditoriaService::class,
    App\Services\BodegaService::class,
    App\Services\TarifarioService::class,
    App\Services\ConflictoService::class,
    App\Controllers\AuthController::class,
    App\Controllers\OrdenController::class,
    App\Controllers\CatalogoController::class,
    App\Controllers\VentaController::class,
    App\Controllers\AdminAuditoriaController::class,
    App\Controllers\AdminBodegaController::class,
    App\Controllers\AdminTarifarioController::class,
    App\Controllers\AdminConflictoController::class,
];

$fallos = 0;
foreach ($clases as $clase) {
    try {
        if (!class_exists($clase)) {
            throw new RuntimeException('la clase no existe / no cargó');
        }
        // Instanciar los repositorios y servicios confirma que sus
        // constructores (y los "new" que encadenan hacia otras clases)
        // no explotan por una referencia rota — sin tocar la base de datos.
        $reflexion = new ReflectionClass($clase);
        if (!$reflexion->isAbstract() && !$reflexion->isInterface()) {
            $constructor = $reflexion->getConstructor();
            if ($constructor === null || $constructor->getNumberOfRequiredParameters() === 0) {
                $reflexion->newInstance();
            }
        }
        echo "OK   $clase\n";
    } catch (Throwable $e) {
        echo "FAIL $clase — " . $e->getMessage() . "\n";
        $fallos++;
    }
}

// Verifica también que el router arma y matchea patrones sin explotar,
// sin necesitar un servidor HTTP real.
try {
    $router = new App\Core\Router();
    $router->post('/api/ordenes/{uuid}/materiales', function () {});
    $router->put('/api/admin/tarifas/{tipoServicio}', function () {});
    $reflexionRouter = new ReflectionClass($router);
    $rutas = $reflexionRouter->getProperty('routes');
    $rutas->setAccessible(true);
    $valor = $rutas->getValue($router);
    if (!preg_match($valor[0]['regex'], '/api/ordenes/abc-123/materiales', $m) || $m['uuid'] !== 'abc-123') {
        throw new RuntimeException('el patrón de ruta con {uuid} no matcheó como se esperaba');
    }
    echo "OK   Router — patrón {uuid} matchea correctamente\n";
} catch (Throwable $e) {
    echo "FAIL Router — " . $e->getMessage() . "\n";
    $fallos++;
}

echo "\n" . (count($clases) + 1 - $fallos) . "/" . (count($clases) + 1) . " comprobaciones correctas.\n";
exit($fallos ? 1 : 0);
