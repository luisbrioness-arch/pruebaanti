<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Exceptions\ValidationException;
use App\Repositories\ItemFerreteriaRepository;
use App\Repositories\TipoEquipoRepository;
use App\Services\BodegaService;

final class AdminBodegaController
{
    /** Catálogos para poblar selects del formulario de alta — no dependen de BodegaService. */
    public function catalogoTiposEquipo(Request $req): void
    {
        Auth::requireAdmin();
        Response::json(['tipos_equipo' => (new TipoEquipoRepository())->all()]);
    }

    public function catalogoItemsFerreteria(Request $req): void
    {
        Auth::requireAdmin();
        Response::json(['items' => (new ItemFerreteriaRepository())->all()]);
    }

    public function listarEquipos(Request $req): void
    {
        Auth::requireAdmin();
        $estado = $req->input('estado');
        $tecnicoId = $req->input('tecnico_id');
        Response::json(['equipos' => (new BodegaService())->listarEquipos(
            $estado !== null ? (string) $estado : null,
            $tecnicoId !== null ? (int) $tecnicoId : null
        )]);
    }

    public function altaEquipo(Request $req): void
    {
        Auth::requireAdmin();
        $tipo = (string) $req->input('tipo_equipo', '');
        $serie = (string) $req->input('numero_serie', '');
        if ($tipo === '' || $serie === '') {
            throw new ValidationException('Faltan tipo_equipo o numero_serie.');
        }
        Response::json((new BodegaService())->altaEquipo($tipo, $serie), 201);
    }

    public function asignarEquipo(Request $req): void
    {
        Auth::requireAdmin();
        $tecnicoId = (int) $req->input('tecnico_id', 0);
        if (!$tecnicoId) {
            throw new ValidationException('Falta tecnico_id.');
        }
        Response::json((new BodegaService())->asignarAMaleta((int) $req->param('id'), $tecnicoId));
    }

    public function traspasarEquipo(Request $req): void
    {
        Auth::requireAdmin();
        $tecnicoDestinoId = (int) $req->input('tecnico_destino_id', 0);
        if (!$tecnicoDestinoId) {
            throw new ValidationException('Falta tecnico_destino_id.');
        }
        Response::json((new BodegaService())->traspasarEquipo((int) $req->param('id'), $tecnicoDestinoId));
    }

    public function fallaFabrica(Request $req): void
    {
        Auth::requireAdmin();
        $observacion = $req->input('observacion');
        Response::json((new BodegaService())->marcarFallaFabrica(
            (int) $req->param('id'), $observacion !== null ? (string) $observacion : null
        ));
    }

    public function ingresoBodega(Request $req): void
    {
        Auth::requireAdmin();
        Response::json((new BodegaService())->ingresoABodega((int) $req->param('id')));
    }

    public function stockFerreteria(Request $req): void
    {
        Auth::requireAdmin();
        $tecnicoId = $req->input('tecnico_id');
        Response::json(['stock' => (new BodegaService())->listarStockFerreteria(
            $tecnicoId !== null ? (int) $tecnicoId : null
        )]);
    }

    public function entregarFerreteria(Request $req): void
    {
        Auth::requireAdmin();
        $itemCodigo = (string) $req->input('item_codigo', '');
        $tecnicoId = (int) $req->input('tecnico_id', 0);
        $cantidad = (float) $req->input('cantidad', 0);
        if ($itemCodigo === '' || !$tecnicoId) {
            throw new ValidationException('Faltan item_codigo o tecnico_id.');
        }
        Response::json((new BodegaService())->entregarFerreteria($itemCodigo, $tecnicoId, $cantidad), 201);
    }

    public function obtenerKit(Request $req): void
    {
        Auth::requireAdmin();
        Response::json(['kit' => (new BodegaService())->obtenerKit((string) $req->param('tipoServicio'))]);
    }

    public function actualizarKit(Request $req): void
    {
        Auth::requireAdmin();
        $items = $req->input('items', []);
        Response::json(['kit' => (new BodegaService())->actualizarKit(
            (string) $req->param('tipoServicio'), is_array($items) ? $items : []
        )]);
    }
}
