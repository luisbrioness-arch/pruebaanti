<?php

declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Controllers\AdminAuditoriaController;
use App\Controllers\AdminBilleteraController;
use App\Controllers\AdminBodegaController;
use App\Controllers\AdminConflictoController;
use App\Controllers\AdminIndicadoresController;
use App\Controllers\AdminOrdenController;
use App\Controllers\AdminReporteController;
use App\Controllers\AdminTarifarioController;
use App\Controllers\AdminUsuarioController;
use App\Controllers\AuthController;
use App\Controllers\BilleteraController;
use App\Controllers\CatalogoController;
use App\Controllers\FotoController;
use App\Controllers\OrdenController;
use App\Controllers\ReporteController;
use App\Controllers\TecnicoBodegaController;
use App\Controllers\VentaController;
use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Core\Router;
use App\Exceptions\ApiException;

Auth::start();

$router = new Router();

// --- Autenticación ---------------------------------------------------------
$router->post('/api/auth/login', fn(Request $r) => (new AuthController())->login($r));
$router->post('/api/auth/logout', fn(Request $r) => (new AuthController())->logout($r));
$router->get('/api/auth/yo', fn(Request $r) => (new AuthController())->yo($r));

// --- Catálogos y maleta offline ---------------------------------------------
$router->get('/api/catalogo/tipos-servicio', fn(Request $r) => (new CatalogoController())->tiposServicio($r));
$router->get('/api/catalogo/planes', fn(Request $r) => (new CatalogoController())->planes($r));
$router->get('/api/catalogo/items-ferreteria', fn(Request $r) => (new CatalogoController())->itemsFerreteria($r));

// Fotos — el único camino autorizado para ver el archivo (vive fuera de /public)
$router->get('/api/fotos/{id}', fn(Request $r) => (new FotoController())->servir($r));
$router->get('/api/maleta', fn(Request $r) => (new CatalogoController())->maleta($r));

// --- Wizard "Cerrar Orden" (ver docs/wizard-api.md) -------------------------
$router->post('/api/ordenes', fn(Request $r) => (new OrdenController())->crear($r));
$router->get('/api/mis-ordenes', fn(Request $r) => (new OrdenController())->misOrdenes($r));
$router->get('/api/ordenes/{uuid}', fn(Request $r) => (new OrdenController())->estado($r));
$router->post('/api/ordenes/{uuid}/materiales', fn(Request $r) => (new OrdenController())->agregarMaterial($r));
$router->delete('/api/ordenes/{uuid}/materiales/{equipoId}', fn(Request $r) => (new OrdenController())->quitarMaterial($r));
$router->post('/api/ordenes/{uuid}/fotos', fn(Request $r) => (new OrdenController())->agregarFoto($r));
$router->post('/api/ordenes/{uuid}/ferreteria', fn(Request $r) => (new OrdenController())->registrarFerreteria($r));
$router->patch('/api/ordenes/{uuid}/cierre', fn(Request $r) => (new OrdenController())->cierre($r));
$router->post('/api/ordenes/{uuid}/enviar', fn(Request $r) => (new OrdenController())->enviar($r));

// --- Registro de venta -------------------------------------------------------
$router->post('/api/ventas', fn(Request $r) => (new VentaController())->crear($r));
$router->get('/api/ventas/pendientes', fn(Request $r) => (new VentaController())->pendientes($r));
$router->get('/api/ventas/{id}', fn(Request $r) => (new VentaController())->detalle($r));

// --- Billetera propia (ver docs/liquidacion-billetera.md) -------------------
$router->get('/api/mi-billetera', fn(Request $r) => (new BilleteraController())->mia($r));

// --- Traspasos pendientes de confirmar por el propio técnico (ver docs/bodegas-traspasos.md) ---
$router->get('/api/mis-traspasos', fn(Request $r) => (new TecnicoBodegaController())->pendientes($r));
$router->post('/api/mis-traspasos/equipos/{id}/aceptar', fn(Request $r) => (new TecnicoBodegaController())->aceptarEquipo($r));
$router->post('/api/mis-traspasos/equipos/{id}/rechazar', fn(Request $r) => (new TecnicoBodegaController())->rechazarEquipo($r));
$router->post('/api/mis-traspasos/ferreteria/{id}/aceptar', fn(Request $r) => (new TecnicoBodegaController())->aceptarFerreteria($r));
$router->post('/api/mis-traspasos/ferreteria/{id}/rechazar', fn(Request $r) => (new TecnicoBodegaController())->rechazarFerreteria($r));

// --- Reportar bug o pedir un cambio (cualquier usuario con sesión) ----------
$router->post('/api/reportes', fn(Request $r) => (new ReporteController())->crear($r));

// --- Panel admin (ver docs/admin-api.md) ------------------------------------
// Indicadores (mejora 7)
$router->get('/api/admin/indicadores', fn(Request $r) => (new AdminIndicadoresController())->resumen($r));

// Auditoría
$router->get('/api/admin/ordenes', fn(Request $r) => (new AdminAuditoriaController())->listar($r));
$router->get('/api/admin/ordenes/{id}', fn(Request $r) => (new AdminAuditoriaController())->detalle($r));
$router->post('/api/admin/ordenes/{id}/aprobar', fn(Request $r) => (new AdminAuditoriaController())->aprobar($r));
$router->post('/api/admin/ordenes/aprobar-masivo', fn(Request $r) => (new AdminAuditoriaController())->aprobarMasivo($r));
$router->post('/api/admin/ordenes/{id}/rechazar', fn(Request $r) => (new AdminAuditoriaController())->rechazar($r));
$router->post('/api/admin/ordenes/{id}/observar', fn(Request $r) => (new AdminAuditoriaController())->observar($r));
$router->post('/api/admin/ordenes/{id}/reabrir', fn(Request $r) => (new AdminAuditoriaController())->reabrir($r));

// Registro retroactivo (trabajo hecho en terreno sin pasar por el wizard del celular)
$router->post('/api/admin/ordenes/retroactiva', fn(Request $r) => (new AdminOrdenController())->crearRetroactiva($r));
$router->get('/api/admin/ventas/pendientes', fn(Request $r) => (new AdminOrdenController())->ventasPendientes($r));
$router->get('/api/admin/ventas/pendientes-instalar', fn(Request $r) => (new AdminOrdenController())->ventasPendientesInstalar($r));

// Historial (reemplaza a Auditoría en el nav — pedido: "elimina auditoria y
// crea un link de historial ordenes vendidas y ordenes instaladas con fecha")
$router->get('/api/admin/historial', fn(Request $r) => (new AdminOrdenController())->historial($r));

// Conflictos de sincronización
$router->get('/api/admin/conflictos', fn(Request $r) => (new AdminConflictoController())->listar($r));
$router->post('/api/admin/conflictos/{id}/resolver', fn(Request $r) => (new AdminConflictoController())->resolver($r));

// Tarifario y comisiones (versionados — nunca se sobreescriben)
$router->get('/api/admin/tarifas', fn(Request $r) => (new AdminTarifarioController())->listarTarifas($r));
$router->put('/api/admin/tarifas/{tipoServicio}', fn(Request $r) => (new AdminTarifarioController())->editarTarifa($r));
$router->delete('/api/admin/tarifas/{tipoServicio}', fn(Request $r) => (new AdminTarifarioController())->eliminarTarifa($r));
$router->put('/api/admin/tarifas/{tipoServicio}/nombre', fn(Request $r) => (new AdminTarifarioController())->editarNombreTarifa($r));
$router->get('/api/admin/comisiones', fn(Request $r) => (new AdminTarifarioController())->listarComisiones($r));
$router->put('/api/admin/comisiones/{plan}', fn(Request $r) => (new AdminTarifarioController())->editarComision($r));
$router->post('/api/admin/planes', fn(Request $r) => (new AdminTarifarioController())->crearPlan($r));
$router->put('/api/admin/planes/{plan}/activo', fn(Request $r) => (new AdminTarifarioController())->cambiarActivoPlan($r));
$router->put('/api/admin/planes/{plan}/nombre', fn(Request $r) => (new AdminTarifarioController())->editarNombrePlan($r));
$router->get('/api/admin/tarifas-instalacion', fn(Request $r) => (new AdminTarifarioController())->listarTarifasInstalacion($r));
$router->put('/api/admin/tarifas-instalacion/{plan}', fn(Request $r) => (new AdminTarifarioController())->editarTarifaInstalacion($r));
$router->delete('/api/admin/tarifas-instalacion/{plan}', fn(Request $r) => (new AdminTarifarioController())->eliminarTarifaInstalacion($r));

// Usuarios
$router->get('/api/admin/usuarios', fn(Request $r) => (new AdminUsuarioController())->listar($r));
$router->post('/api/admin/usuarios', fn(Request $r) => (new AdminUsuarioController())->crear($r));

// Liquidación y billetera
$router->get('/api/admin/billetera/saldos', fn(Request $r) => (new AdminBilleteraController())->saldos($r));
$router->get('/api/admin/billetera/{tecnicoId}', fn(Request $r) => (new AdminBilleteraController())->resumen($r));
$router->get('/api/admin/billetera/{tecnicoId}/pendiente', fn(Request $r) => (new AdminBilleteraController())->pendiente($r));
$router->post('/api/admin/billetera/{tecnicoId}/cerrar', fn(Request $r) => (new AdminBilleteraController())->cerrar($r));
$router->post('/api/admin/billetera/{tecnicoId}/pago', fn(Request $r) => (new AdminBilleteraController())->pago($r));
$router->post('/api/admin/billetera/{tecnicoId}/ajuste', fn(Request $r) => (new AdminBilleteraController())->ajuste($r));

// Reportes — sin UI en el panel (ver docs/reportes.md), solo para que
// Claude los consulte y marque resueltos cuando Luis se lo pida.
$router->get('/api/admin/reportes', fn(Request $r) => (new AdminReporteController())->listar($r));
$router->post('/api/admin/reportes/{id}/resolver', fn(Request $r) => (new AdminReporteController())->resolver($r));

// Bodega — catálogos para los formularios
$router->get('/api/admin/catalogo/tipos-equipo', fn(Request $r) => (new AdminBodegaController())->catalogoTiposEquipo($r));
$router->get('/api/admin/catalogo/items-ferreteria', fn(Request $r) => (new AdminBodegaController())->catalogoItemsFerreteria($r));
$router->post('/api/admin/catalogo/tipos-equipo', fn(Request $r) => (new AdminBodegaController())->crearTipoEquipo($r));
$router->post('/api/admin/catalogo/items-ferreteria', fn(Request $r) => (new AdminBodegaController())->crearItemFerreteria($r));

// Bodega — equipos
$router->get('/api/admin/equipos', fn(Request $r) => (new AdminBodegaController())->listarEquipos($r));
$router->post('/api/admin/equipos', fn(Request $r) => (new AdminBodegaController())->altaEquipo($r));
$router->get('/api/admin/equipos/buscar', fn(Request $r) => (new AdminBodegaController())->buscarEquipos($r));
$router->get('/api/admin/equipos/{id}/historial', fn(Request $r) => (new AdminBodegaController())->historialEquipo($r));
$router->post('/api/admin/equipos/{id}/asignar', fn(Request $r) => (new AdminBodegaController())->asignarEquipo($r));
$router->post('/api/admin/equipos/{id}/traspasar', fn(Request $r) => (new AdminBodegaController())->traspasarEquipo($r));
$router->post('/api/admin/equipos/{id}/cancelar-traspaso', fn(Request $r) => (new AdminBodegaController())->cancelarTraspasoEquipo($r));
$router->post('/api/admin/equipos/{id}/falla-fabrica', fn(Request $r) => (new AdminBodegaController())->fallaFabrica($r));
$router->post('/api/admin/equipos/{id}/ingreso-bodega', fn(Request $r) => (new AdminBodegaController())->ingresoBodega($r));

// Bodega — ferretería
$router->get('/api/admin/ferreteria/stock', fn(Request $r) => (new AdminBodegaController())->stockFerreteria($r));
$router->post('/api/admin/ferreteria/entregar', fn(Request $r) => (new AdminBodegaController())->entregarFerreteria($r));
$router->get('/api/admin/ferreteria/pendientes', fn(Request $r) => (new AdminBodegaController())->entregasFerreteriaPendientes($r));
$router->post('/api/admin/ferreteria/pendientes/{id}/cancelar', fn(Request $r) => (new AdminBodegaController())->cancelarEntregaFerreteria($r));
$router->get('/api/admin/ferreteria/stock-central', fn(Request $r) => (new AdminBodegaController())->stockCentral($r));
$router->post('/api/admin/ferreteria/ingreso', fn(Request $r) => (new AdminBodegaController())->ingresoFerreteriaCentral($r));

// Bodegas físicas (mejora 9) y guía de despacho (mejora: "generar guías de despacho")
$router->get('/api/admin/bodegas', fn(Request $r) => (new AdminBodegaController())->listarBodegas($r));
$router->post('/api/admin/bodegas', fn(Request $r) => (new AdminBodegaController())->crearBodega($r));
$router->get('/api/admin/tecnicos/{tecnicoId}/traspasos-pendientes', fn(Request $r) => (new AdminBodegaController())->traspasosPendientesDeTecnico($r));

try {
    $router->dispatch(new Request());
} catch (ApiException $e) {
    Response::error($e->getMessage(), $e->status(), $e->code(), $e->extra());
} catch (\Throwable $e) {
    $config = require dirname(__DIR__) . '/config/config.php';
    error_log('[terreno-dth] ' . $e->getMessage() . "\n" . $e->getTraceAsString());
    if (!empty($config['app']['debug'])) {
        Response::error($e->getMessage(), 500, 'error_interno', ['trace' => explode("\n", $e->getTraceAsString())]);
    } else {
        Response::error('Error interno del servidor.', 500, 'error_interno');
    }
}
