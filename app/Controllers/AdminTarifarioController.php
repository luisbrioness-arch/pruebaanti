<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Exceptions\ValidationException;
use App\Services\TarifarioService;

final class AdminTarifarioController
{
    public function listarTarifas(Request $req): void
    {
        Auth::requireAdmin();
        Response::json(['tarifas' => (new TarifarioService())->listarTarifas()]);
    }

    public function editarTarifa(Request $req): void
    {
        $admin = Auth::requireAdmin();
        $monto = $req->input('monto');
        if ($monto === null || (float) $monto <= 0) {
            throw new ValidationException('Falta un monto válido (mayor que cero).');
        }
        Response::json((new TarifarioService())->editarTarifa(
            (string) $req->param('tipoServicio'), (float) $monto, (int) $admin['id']
        ));
    }

    /** "Eliminar" una tarifa de tipo de servicio — ver TarifarioService::eliminarTarifa. */
    public function eliminarTarifa(Request $req): void
    {
        Auth::requireAdmin();
        Response::json(['tarifas' => (new TarifarioService())->eliminarTarifa(
            (string) $req->param('tipoServicio')
        )]);
    }

    public function listarComisiones(Request $req): void
    {
        Auth::requireAdmin();
        Response::json(['comisiones' => (new TarifarioService())->listarComisiones()]);
    }

    public function crearPlan(Request $req): void
    {
        $admin = Auth::requireAdmin();
        $codigo = (string) $req->input('codigo', '');
        $nombre = (string) $req->input('nombre', '');
        $comision = $req->input('comision_inicial');
        if ($comision === null) {
            throw new ValidationException('Falta la comisión inicial del plan.');
        }
        (new TarifarioService())->crearPlan($codigo, $nombre, (float) $comision, (int) $admin['id']);
        Response::json(['comisiones' => (new TarifarioService())->listarComisiones()], 201);
    }

    /** "Borrar" un plan (pedido: "falta opcion de borrar planes") — ver TarifarioService::cambiarActivoPlan. */
    public function cambiarActivoPlan(Request $req): void
    {
        Auth::requireAdmin();
        $activo = (bool) $req->input('activo');
        Response::json(['comisiones' => (new TarifarioService())->cambiarActivoPlan(
            (string) $req->param('plan'), $activo
        )]);
    }

    public function editarComision(Request $req): void
    {
        $admin = Auth::requireAdmin();
        $monto = $req->input('monto');
        if ($monto === null || (float) $monto <= 0) {
            throw new ValidationException('Falta un monto válido (mayor que cero).');
        }
        Response::json((new TarifarioService())->editarComision(
            (string) $req->param('plan'), (float) $monto, (int) $admin['id']
        ));
    }

    /** Instalación por plan (respuesta: "los planes van subiendo por cantidad de decos"). */
    public function listarTarifasInstalacion(Request $req): void
    {
        Auth::requireAdmin();
        Response::json(['tarifas_instalacion' => (new TarifarioService())->listarTarifasInstalacion()]);
    }

    public function editarTarifaInstalacion(Request $req): void
    {
        $admin = Auth::requireAdmin();
        $monto = $req->input('monto');
        if ($monto === null || (float) $monto <= 0) {
            throw new ValidationException('Falta un monto válido (mayor que cero).');
        }
        Response::json((new TarifarioService())->editarTarifaInstalacion(
            (string) $req->param('plan'), (float) $monto, (int) $admin['id']
        ));
    }

    /** "Eliminar" una fila de instalación por plan — ver TarifarioService::eliminarTarifaInstalacion. */
    public function eliminarTarifaInstalacion(Request $req): void
    {
        Auth::requireAdmin();
        Response::json(['tarifas_instalacion' => (new TarifarioService())->eliminarTarifaInstalacion(
            (string) $req->param('plan')
        )]);
    }
}
