<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Exceptions\NotFoundException;
use App\Exceptions\ValidationException;
use App\Repositories\OrdenRepository;
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

    /**
     * Detalle completo de una venta y de su orden técnica asociada (si existe).
     */
    public function detalleVenta(Request $req): void
    {
        Auth::requireAdmin();
        $id = (int) $req->param('id');
        $venta = (new VentaRepository())->findConDetalle($id);
        if (!$venta) {
            throw new NotFoundException('Venta comercial no encontrada.');
        }
        Response::json($venta);
    }

    /**
     * Reagendar la fecha de instalación solicitada por el cliente y registrar nota.
     */
    public function reagendarVenta(Request $req): void
    {
        Auth::requireAdmin();
        $id = (int) $req->param('id');
        $repo = new VentaRepository();
        $venta = $repo->find($id);
        if (!$venta) {
            throw new NotFoundException('Venta comercial no encontrada.');
        }

        $fecha = trim((string) $req->input('fecha_instalacion_solicitada', ''));
        if ($fecha === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
            throw new ValidationException('Debe ingresar una fecha válida (formato AAAA-MM-DD).');
        }

        $observacion = $req->input('observacion');
        $repo->asegurarColumnaObservacion();

        $campos = ['fecha_instalacion_solicitada' => $fecha];
        if ($observacion !== null) {
            $campos['observacion'] = trim((string) $observacion);
        }

        $repo->actualizar($id, $campos);

        $actualizada = $repo->findConDetalle($id);
        Response::json([
            'ok' => true,
            'mensaje' => 'Visita reagendada correctamente.',
            'venta' => $actualizada,
        ]);
    }

    /**
     * Anular una venta si el cliente desiste o no continuará el servicio.
     */
    public function anularVenta(Request $req): void
    {
        Auth::requireAdmin();
        $id = (int) $req->param('id');
        $repo = new VentaRepository();
        $venta = $repo->find($id);
        if (!$venta) {
            throw new NotFoundException('Venta comercial no encontrada.');
        }
        if ($venta['estado'] === 'instalada') {
            throw new ValidationException('No se puede anular una venta que ya figura como instalada.');
        }

        $motivo = trim((string) $req->input('motivo', ''));
        $repo->asegurarColumnaObservacion();

        $campos = ['estado' => 'anulada'];
        if ($motivo !== '') {
            $campos['observacion'] = $motivo;
        }

        $repo->actualizar($id, $campos);

        Response::json([
            'ok' => true,
            'mensaje' => 'Venta anulada correctamente.',
        ]);
    }

    /**
     * Historial (pedido: "elimina auditoria y crea un link de historial
     * ordenes vendidas y ordenes instaladas con fecha") — reemplaza a la
     * cola de auditoría en el nav del panel. tecnico_id filtra a la vez
     * técnico vendedor (ventas) y técnico ejecutor (órdenes), porque son la
     * misma persona en este sistema. desde/hasta son fechas YYYY-MM-DD.
     */
    public function historial(Request $req): void
    {
        Auth::requireAdmin();
        [$tecnicoId, $desde, $hasta] = $this->leerFiltrosHistorial($req);
        Response::json([
            'ventas' => (new VentaRepository())->historial($tecnicoId, $desde, $hasta),
            'ordenes' => (new OrdenRepository())->historial($tecnicoId, $desde, $hasta),
        ]);
    }

    /** @return array{0: ?int, 1: ?string, 2: ?string} */
    private function leerFiltrosHistorial(Request $req): array
    {
        $tecnicoIdCrudo = $req->input('tecnico_id');
        $tecnicoId = ($tecnicoIdCrudo !== null && $tecnicoIdCrudo !== '') ? (int) $tecnicoIdCrudo : null;

        $desde = $this->fechaOpcional($req, 'desde');
        $hasta = $this->fechaOpcional($req, 'hasta');

        return [$tecnicoId, $desde, $hasta];
    }

    private function fechaOpcional(Request $req, string $campo): ?string
    {
        $valor = trim((string) $req->input($campo, ''));
        if ($valor === '') {
            return null;
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $valor)) {
            throw new ValidationException("Fecha inválida en \"$campo\": $valor");
        }
        return $valor;
    }
}
