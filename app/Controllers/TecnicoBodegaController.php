<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Exceptions\ValidationException;
use App\Services\BodegaService;

/**
 * Lo que un técnico ve y confirma de su lado: equipos y ferretería que el
 * admin le mandó y todavía no acepta. A diferencia de /api/admin/equipos/*,
 * acá el técnico SIEMPRE es Auth::id() — nadie confirma la entrega de otro
 * (ver docs/bodegas-traspasos.md).
 */
final class TecnicoBodegaController
{
    public function pendientes(Request $req): void
    {
        $tecnicoId = Auth::id();
        $service = new BodegaService();
        Response::json([
            'equipos' => $service->equiposPendientesPara($tecnicoId),
            'ferreteria' => $service->entregasFerreteriaPendientesPara($tecnicoId),
        ]);
    }

    public function aceptarEquipo(Request $req): void
    {
        Response::json((new BodegaService())->aceptarEquipo((int) $req->param('id'), Auth::id()));
    }

    public function rechazarEquipo(Request $req): void
    {
        $observacion = trim((string) $req->input('observacion', ''));
        if ($observacion === '') {
            throw new ValidationException('Contá qué está mal para poder corregirlo.');
        }
        Response::json((new BodegaService())->rechazarEquipo((int) $req->param('id'), Auth::id(), $observacion));
    }

    public function aceptarFerreteria(Request $req): void
    {
        Response::json((new BodegaService())->aceptarFerreteria((int) $req->param('id'), Auth::id()));
    }

    public function rechazarFerreteria(Request $req): void
    {
        $observacion = trim((string) $req->input('observacion', ''));
        if ($observacion === '') {
            throw new ValidationException('Contá qué está mal para poder corregirlo.');
        }
        Response::json((new BodegaService())->rechazarFerreteria((int) $req->param('id'), Auth::id(), $observacion));
    }
}
