<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Exceptions\ValidationException;
use App\Services\ConflictoService;

final class AdminConflictoController
{
    public function listar(Request $req): void
    {
        Auth::requireAdmin();
        Response::json(['conflictos' => (new ConflictoService())->listarPendientes()]);
    }

    public function resolver(Request $req): void
    {
        $admin = Auth::requireAdmin();
        $accion = (string) $req->input('accion', '');
        if ($accion === '') {
            throw new ValidationException('Falta la acción ("invalidar" o "aceptar").');
        }
        $comentario = $req->input('comentario');
        Response::json((new ConflictoService())->resolver(
            (int) $req->param('id'), $accion, (int) $admin['id'], $comentario !== null ? (string) $comentario : null
        ));
    }
}
