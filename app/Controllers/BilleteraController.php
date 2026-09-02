<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Services\LiquidacionService;

/**
 * Billetera del propio técnico — de solo lectura. A diferencia de
 * /api/admin/billetera/*, acá tecnico_id es SIEMPRE Auth::id(), nunca un
 * parámetro: un técnico no puede consultar la billetera de otro. Cerrar
 * períodos, registrar pagos y ajustes siguen siendo exclusivos del admin
 * (ver AdminBilleteraController) — esto solo le muestra a Edwin o al
 * técnico su propio saldo e historial.
 */
final class BilleteraController
{
    public function mia(Request $req): void
    {
        $service = new LiquidacionService();
        $tecnicoId = Auth::id();
        Response::json([
            ...$service->resumenDe($tecnicoId),
            'pendiente' => $service->pendientePorLiquidar($tecnicoId),
        ]);
    }
}
