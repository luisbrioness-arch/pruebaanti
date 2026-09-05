<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Exceptions\ValidationException;
use App\Services\LiquidacionService;

final class AdminBilleteraController
{
    public function saldos(Request $req): void
    {
        Auth::requireAdmin();
        Response::json(['saldos' => (new LiquidacionService())->saldosDeTodos()]);
    }

    public function resumen(Request $req): void
    {
        Auth::requireAdmin();
        Response::json((new LiquidacionService())->resumenDe((int) $req->param('tecnicoId')));
    }

    public function pendiente(Request $req): void
    {
        Auth::requireAdmin();
        Response::json((new LiquidacionService())->pendientePorLiquidar((int) $req->param('tecnicoId')));
    }

    public function detallePeriodo(Request $req): void
    {
        Auth::requireAdmin();
        Response::json((new LiquidacionService())->detalleDePeriodo((int) $req->param('periodoId')));
    }

    public function cerrar(Request $req): void
    {
        $admin = Auth::requireAdmin();
        $observaciones = $req->input('observaciones');
        $periodo = (new LiquidacionService())->cerrarPeriodo(
            (int) $req->param('tecnicoId'),
            (int) $admin['id'],
            $observaciones !== null ? (string) $observaciones : null
        );
        Response::json($periodo, 201);
    }

    public function pago(Request $req): void
    {
        $admin = Auth::requireAdmin();
        $monto = (float) $req->input('monto', 0);
        if ($monto <= 0) {
            throw new ValidationException('Falta un monto válido.');
        }
        $observacion = $req->input('observacion');
        Response::json((new LiquidacionService())->registrarPago(
            (int) $req->param('tecnicoId'),
            $monto,
            (int) $admin['id'],
            $observacion !== null ? (string) $observacion : null
        ), 201);
    }

    public function ajuste(Request $req): void
    {
        $admin = Auth::requireAdmin();
        $monto = (float) $req->input('monto', 0);
        $observacion = (string) $req->input('observacion', '');
        if ($observacion === '') {
            throw new ValidationException('Un ajuste manual necesita una observación.');
        }
        Response::json((new LiquidacionService())->registrarAjuste(
            (int) $req->param('tecnicoId'),
            $monto,
            (int) $admin['id'],
            $observacion
        ), 201);
    }
}
