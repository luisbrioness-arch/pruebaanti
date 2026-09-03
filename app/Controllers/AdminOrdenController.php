<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Exceptions\ValidationException;
use App\Repositories\VentaRepository;
use App\Services\OrdenWizardService;

/**
 * Registro retroactivo: el admin carga desde el PC una orden que el técnico
 * ya ejecutó en terreno sin pasar por el wizard del celular. Ver
 * OrdenWizardService::crearRetroactiva() para las reglas de negocio.
 */
final class AdminOrdenController
{
    public function crearRetroactiva(Request $req): void
    {
        Auth::requireAdmin();
        $orden = (new OrdenWizardService())->crearRetroactiva($req->all());
        Response::json($orden, 201);
    }

    /**
     * Ventas sin instalar de UN técnico elegido por el admin — a diferencia
     * de VentaController::pendientes() (que solo ve las propias del técnico
     * logueado), acá el admin necesita mirar las de cualquiera para poder
     * enlazarlas al cargar el registro retroactivo.
     */
    public function ventasPendientes(Request $req): void
    {
        Auth::requireAdmin();
        $tecnicoId = (int) $req->input('tecnico_id', 0);
        if (!$tecnicoId) {
            throw new ValidationException('Falta tecnico_id.');
        }
        Response::json(['ventas' => (new VentaRepository())->pendientesDe($tecnicoId)]);
    }

    /**
     * Todas las ventas sin instalar, de cualquier técnico, ordenadas por
     * fecha solicitada por el cliente — para "Pendientes de instalar" en
     * Inicio del panel (pedido: "que aparezca en el dashboard del edwin
     * como pendiente de instalar dependiendo de la fecha de instalación
     * solicitada por el cliente").
     */
    public function ventasPendientesInstalar(Request $req): void
    {
        Auth::requireAdmin();
        Response::json(['ventas' => (new VentaRepository())->pendientesInstalarTodas()]);
    }
}
