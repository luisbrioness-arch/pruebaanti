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

    /** Alta de catálogo (pedido: "en bodega se puedan agregar nuevos items") — ver BodegaService::crearTipoEquipo. */
    public function crearTipoEquipo(Request $req): void
    {
        Auth::requireAdmin();
        $tipo = (new BodegaService())->crearTipoEquipo(
            (string) $req->input('codigo', ''), (string) $req->input('nombre', '')
        );
        Response::json(['tipos_equipo' => (new TipoEquipoRepository())->all(), 'creado' => $tipo], 201);
    }

    public function crearItemFerreteria(Request $req): void
    {
        Auth::requireAdmin();
        $item = (new BodegaService())->crearItemFerreteria(
            (string) $req->input('codigo', ''), (string) $req->input('nombre', ''), (string) $req->input('unidad_medida', 'unidad')
        );
        Response::json(['items' => (new ItemFerreteriaRepository())->all(), 'creado' => $item], 201);
    }

    public function listarEquipos(Request $req): void
    {
        Auth::requireAdmin();
        $estado = $req->input('estado');
        $tecnicoId = $req->input('tecnico_id');
        $bodegaId = $req->input('bodega_id');
        Response::json(['equipos' => (new BodegaService())->listarEquipos(
            $estado !== null ? (string) $estado : null,
            $tecnicoId !== null ? (int) $tecnicoId : null,
            $bodegaId !== null ? (int) $bodegaId : null
        )]);
    }

    /** Bodegas físicas (mejora 9). */
    public function listarBodegas(Request $req): void
    {
        Auth::requireAdmin();
        Response::json(['bodegas' => (new BodegaService())->listarBodegas()]);
    }

    public function crearBodega(Request $req): void
    {
        Auth::requireAdmin();
        Response::json((new BodegaService())->crearBodega((string) $req->input('nombre', '')), 201);
    }

    /**
     * Todo lo que le falta confirmar a UN técnico, visto por el admin —
     * mismo shape que /api/mis-traspasos pero para cualquier tecnico_id.
     * Base de la guía de despacho (se imprime desde acá).
     */
    public function traspasosPendientesDeTecnico(Request $req): void
    {
        Auth::requireAdmin();
        $tecnicoId = (int) $req->param('tecnicoId');
        $service = new BodegaService();
        Response::json([
            'equipos' => $service->equiposPendientesPara($tecnicoId),
            'ferreteria' => $service->entregasFerreteriaPendientesPara($tecnicoId),
        ]);
    }

    /** Buscador por serie (respuesta 2 de las mejoras) — coincidencia parcial. */
    public function buscarEquipos(Request $req): void
    {
        Auth::requireAdmin();
        $q = trim((string) $req->input('q', ''));
        if ($q === '') {
            throw new ValidationException('Escribe al menos parte de la serie para buscar.');
        }
        Response::json(['equipos' => (new BodegaService())->buscarEquiposPorSerie($q)]);
    }

    public function historialEquipo(Request $req): void
    {
        Auth::requireAdmin();
        Response::json((new BodegaService())->historialEquipo((int) $req->param('id')));
    }

    public function altaEquipo(Request $req): void
    {
        Auth::requireAdmin();
        $tipo = (string) $req->input('tipo_equipo', '');
        $serie = (string) $req->input('numero_serie', '');
        $bodegaId = (int) $req->input('bodega_id', 0);
        if ($tipo === '' || $serie === '' || !$bodegaId) {
            throw new ValidationException('Faltan tipo_equipo, numero_serie o bodega_id.');
        }
        Response::json((new BodegaService())->altaEquipo($tipo, $serie, $bodegaId), 201);
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

    /** El admin cancela un envío (asignación o traspaso) que el técnico todavía no confirmó. */
    public function cancelarTraspasoEquipo(Request $req): void
    {
        Auth::requireAdmin();
        Response::json((new BodegaService())->cancelarTraspasoEquipo((int) $req->param('id')));
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
        $bodegaId = (int) $req->input('bodega_id', 0);
        if (!$bodegaId) {
            throw new ValidationException('Falta bodega_id.');
        }
        Response::json((new BodegaService())->ingresoABodega((int) $req->param('id'), $bodegaId));
    }

    public function stockFerreteria(Request $req): void
    {
        Auth::requireAdmin();
        $tecnicoId = $req->input('tecnico_id');
        Response::json(['stock' => (new BodegaService())->listarStockFerreteria(
            $tecnicoId !== null ? (int) $tecnicoId : null
        )]);
    }

    /** Stock real por bodega física (mejora 8). */
    public function stockCentral(Request $req): void
    {
        Auth::requireAdmin();
        $bodegaId = $req->input('bodega_id');
        Response::json(['stock' => (new BodegaService())->listarStockCentral(
            $bodegaId !== null ? (int) $bodegaId : null
        )]);
    }

    /** Ingreso real a una bodega (compra, recepción de TuVes) — lo único que hace crecer el stock central. */
    public function ingresoFerreteriaCentral(Request $req): void
    {
        $admin = Auth::requireAdmin();
        $itemCodigo = (string) $req->input('item_codigo', '');
        $bodegaId = (int) $req->input('bodega_id', 0);
        $cantidad = (float) $req->input('cantidad', 0);
        $observacion = $req->input('observacion');
        if ($itemCodigo === '' || !$bodegaId) {
            throw new ValidationException('Faltan item_codigo o bodega_id.');
        }
        Response::json((new BodegaService())->ingresarFerreteriaCentral(
            $itemCodigo, $bodegaId, $cantidad, $observacion !== null ? (string) $observacion : null, (int) $admin['id']
        ), 201);
    }

    public function entregarFerreteria(Request $req): void
    {
        $admin = Auth::requireAdmin();
        $itemCodigo = (string) $req->input('item_codigo', '');
        $tecnicoId = (int) $req->input('tecnico_id', 0);
        $cantidad = (float) $req->input('cantidad', 0);
        $bodegaId = (int) $req->input('bodega_id', 0);
        if ($itemCodigo === '' || !$tecnicoId || !$bodegaId) {
            throw new ValidationException('Faltan item_codigo, tecnico_id o bodega_id.');
        }
        Response::json((new BodegaService())->entregarFerreteria($itemCodigo, $tecnicoId, $cantidad, (int) $admin['id'], $bodegaId), 201);
    }

    /** Entregas de ferretería esperando confirmación, de cualquier técnico — solo visibilidad. */
    public function entregasFerreteriaPendientes(Request $req): void
    {
        Auth::requireAdmin();
        Response::json(['pendientes' => (new BodegaService())->entregasFerreteriaPendientesTodas()]);
    }

    /** El admin cancela una entrega de ferretería que el técnico todavía no confirmó. */
    public function cancelarEntregaFerreteria(Request $req): void
    {
        $admin = Auth::requireAdmin();
        Response::json((new BodegaService())->cancelarEntregaFerreteria((int) $req->param('id'), (int) $admin['id']));
    }
}
