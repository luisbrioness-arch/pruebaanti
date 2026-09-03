<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Services\IndicadoresService;

final class AdminIndicadoresController
{
    public function resumen(Request $req): void
    {
        Auth::requireAdmin();
        Response::json((new IndicadoresService())->resumen());
    }
}
