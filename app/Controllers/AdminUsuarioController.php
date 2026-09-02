<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Repositories\UsuarioRepository;

/** Solo lectura — el alta de usuarios sigue siendo manual en Fase 1 (1 a 4 personas). */
final class AdminUsuarioController
{
    public function listar(Request $req): void
    {
        Auth::requireAdmin();
        Response::json(['usuarios' => (new UsuarioRepository())->activos()]);
    }
}
