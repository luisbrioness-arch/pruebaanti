<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Exceptions\ValidationException;
use App\Services\AuditoriaService;

final class AdminAuditoriaController
{
    public function listar(Request $req): void
    {
        Auth::requireAdmin();
        $estado = $req->input('estado');
        $tecnicoId = $req->input('tecnico_id');
        $servicio = new AuditoriaService();
        Response::json(['ordenes' => $servicio->listarCola(
            $estado !== null ? (string) $estado : null,
            $tecnicoId !== null ? (int) $tecnicoId : null
        )]);
    }

    public function detalle(Request $req): void
    {
        Auth::requireAdmin();
        Response::json((new AuditoriaService())->detalle((int) $req->param('id')));
    }

    public function aprobar(Request $req): void
    {
        $admin = Auth::requireAdmin();
        Response::json((new AuditoriaService())->aprobar((int) $req->param('id'), (int) $admin['id']));
    }

    public function aprobarMasivo(Request $req): void
    {
        $admin = Auth::requireAdmin();
        $ids = $req->input('ids', []);
        if (!is_array($ids) || empty($ids)) {
            throw new ValidationException('Falta la lista de ids a aprobar.');
        }
        Response::json(['resultados' => (new AuditoriaService())->aprobarMasivo($ids, (int) $admin['id'])]);
    }

    public function rechazar(Request $req): void
    {
        $admin = Auth::requireAdmin();
        $motivo = (string) $req->input('motivo', '');
        if ($motivo === '') {
            throw new ValidationException('Falta el motivo del rechazo.');
        }
        $comentario = $req->input('comentario');
        $descuentaPago = (bool) $req->input('descuenta_pago', false);
        Response::json((new AuditoriaService())->rechazar(
            (int) $req->param('id'), (int) $admin['id'], $motivo, $comentario !== null ? (string) $comentario : null, $descuentaPago
        ));
    }

    public function observar(Request $req): void
    {
        $admin = Auth::requireAdmin();
        $comentario = (string) $req->input('comentario', '');
        if ($comentario === '') {
            throw new ValidationException('Falta el comentario de la observación.');
        }
        Response::json((new AuditoriaService())->observar((int) $req->param('id'), (int) $admin['id'], $comentario));
    }

    public function reabrir(Request $req): void
    {
        Auth::requireAdmin();
        Response::json((new AuditoriaService())->reabrir((int) $req->param('id')));
    }
}
