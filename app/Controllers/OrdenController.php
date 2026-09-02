<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Repositories\OrdenRepository;
use App\Services\OrdenWizardService;

final class OrdenController
{
    public function crear(Request $req): void
    {
        $orden = (new OrdenWizardService())->crearOReanudarBorrador(Auth::id(), $req->all());
        Response::json($orden, 201);
    }

    /**
     * Historial propio — a diferencia de /api/admin/ordenes, acá tecnico_id
     * es SIEMPRE el usuario logueado, nunca un parámetro: un técnico no
     * puede pedir el historial de otro. Sin fecha límite ni paginación —
     * en Fase 1 el volumen por técnico es bajo.
     */
    public function misOrdenes(Request $req): void
    {
        $estado = $req->input('estado');
        Response::json(['ordenes' => (new OrdenRepository())->listar(
            $estado !== null ? (string) $estado : null,
            Auth::id(),
            masRecientePrimero: true
        )]);
    }

    public function estado(Request $req): void
    {
        $orden = (new OrdenWizardService())->obtenerEstado(Auth::id(), (string) $req->param('uuid'));
        Response::json($orden);
    }

    public function agregarMaterial(Request $req): void
    {
        $orden = (new OrdenWizardService())->agregarMaterial(Auth::id(), (string) $req->param('uuid'), $req->all());
        Response::json($orden, 201);
    }

    public function quitarMaterial(Request $req): void
    {
        $accion = (string) $req->input('accion', 'instalado');
        $orden = (new OrdenWizardService())->quitarMaterial(
            Auth::id(), (string) $req->param('uuid'), (int) $req->param('equipoId'), $accion
        );
        Response::json($orden);
    }

    public function agregarFoto(Request $req): void
    {
        $archivo = $req->file('foto');
        if (!$archivo) {
            Response::error('Falta el archivo "foto" en el formulario.', 422, 'validacion');
            return;
        }
        $resultado = (new OrdenWizardService())->agregarFoto(
            Auth::id(), (string) $req->param('uuid'), $req->all(), $archivo
        );
        Response::json($resultado, 201);
    }

    public function registrarFerreteria(Request $req): void
    {
        $items = $req->input('items', []);
        $orden = (new OrdenWizardService())->registrarFerreteria(
            Auth::id(), (string) $req->param('uuid'), is_array($items) ? $items : []
        );
        Response::json($orden);
    }

    public function cierre(Request $req): void
    {
        $orden = (new OrdenWizardService())->actualizarCierreTecnico(Auth::id(), (string) $req->param('uuid'), $req->all());
        Response::json($orden);
    }

    public function enviar(Request $req): void
    {
        $orden = (new OrdenWizardService())->enviar(Auth::id(), (string) $req->param('uuid'));
        Response::json($orden);
    }
}
