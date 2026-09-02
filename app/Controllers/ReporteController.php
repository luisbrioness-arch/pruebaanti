<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Exceptions\ValidationException;
use App\Repositories\ReporteRepository;

/**
 * Reportar un bug o pedir un cambio, desde donde sea que esté el usuario —
 * técnico o admin, cualquiera con sesión puede mandar uno. Ver
 * AdminReporteController para la bandeja donde Edwin los revisa.
 */
final class ReporteController
{
    private const TIPOS_VALIDOS = ['bug', 'cambio'];

    public function crear(Request $req): void
    {
        $usuarioId = Auth::id();
        $tipo = (string) $req->input('tipo', '');
        if (!in_array($tipo, self::TIPOS_VALIDOS, true)) {
            throw new ValidationException('Tipo de reporte inválido — debe ser "bug" o "cambio".');
        }
        $descripcion = trim((string) $req->input('descripcion', ''));
        if ($descripcion === '') {
            throw new ValidationException('La descripción no puede estar vacía.');
        }
        $pantalla = $req->input('pantalla');
        $id = (new ReporteRepository())->crear($usuarioId, $tipo, $descripcion, $pantalla !== null ? (string) $pantalla : null);
        Response::json((new ReporteRepository())->find($id), 201);
    }
}
