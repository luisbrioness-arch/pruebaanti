<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Repositories\ReporteRepository;

final class AdminReporteController
{
    public function listar(Request $req): void
    {
        Auth::requireAdmin();
        $estado = $req->input('estado');
        Response::json(['reportes' => (new ReporteRepository())->listar($estado !== null ? (string) $estado : null)]);
    }

    public function resolver(Request $req): void
    {
        $admin = Auth::requireAdmin();
        (new ReporteRepository())->marcarResuelto((int) $req->param('id'), (int) $admin['id']);
        Response::json((new ReporteRepository())->find((int) $req->param('id')));
    }

    public function reabrir(Request $req): void
    {
        Auth::requireAdmin();
        (new ReporteRepository())->reabrir((int) $req->param('id'));
        Response::json((new ReporteRepository())->find((int) $req->param('id')));
    }
}
