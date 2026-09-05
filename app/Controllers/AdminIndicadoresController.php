<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Exceptions\ValidationException;
use App\Services\IndicadoresService;

final class AdminIndicadoresController
{
    /**
     * Pedido/reporte #7: "que tambien deje cambiar para mirar de forma
     * rapida otros periodos" — recibe un mes puntual (`mes=YYYY-MM`) y
     * calcula el 1° y el último día de ESE mes; sin parámetro, es el mes
     * actual del servidor. No se acepta un desde/hasta arbitrario desde el
     * cliente para no tener que validar rangos raros — "otros períodos"
     * hoy significa "otro mes", que es lo que se pidió.
     */
    public function resumen(Request $req): void
    {
        Auth::requireAdmin();
        $mes = trim((string) $req->input('mes', ''));
        if ($mes !== '' && !preg_match('/^\d{4}-\d{2}$/', $mes)) {
            throw new ValidationException('Formato de mes inválido (esperado YYYY-MM).');
        }
        $primerDiaMes = $mes !== '' ? $mes . '-01' : date('Y-m-01');
        $desde = $primerDiaMes;
        $hasta = date('Y-m-t', strtotime($primerDiaMes));
        Response::json((new IndicadoresService())->resumen($desde, $hasta));
    }
}
