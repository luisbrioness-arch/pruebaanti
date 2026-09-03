<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Exceptions\ValidationException;
use App\Repositories\PlanRepository;
use App\Repositories\VentaRepository;

/**
 * Registro de venta — flujo separado y más corto que "Cerrar Orden"
 * (ver docs/wizard-api.md). No incluye reparto por %, eso es Fase 2; acá
 * solo se deja la venta guardada para poder enlazarla luego a una orden.
 */
final class VentaController
{
    public function crear(Request $req): void
    {
        $vendedorId = Auth::id();

        $numero = trim((string) $req->input('numero_venta_tuves', ''));
        $cliente = trim((string) $req->input('cliente_nombre', ''));
        $comuna = trim((string) $req->input('comuna', ''));
        $planCodigo = (string) $req->input('plan', '');
        // Opcionales — el sistema de TuVes sigue siendo la ficha real del
        // cliente, esto es solo una referencia rápida para el vendedor/técnico.
        $rut = trim((string) $req->input('cliente_rut', ''));
        $direccion = trim((string) $req->input('cliente_direccion', ''));
        $telefono = trim((string) $req->input('cliente_telefono', ''));

        if ($numero === '' || $cliente === '' || $comuna === '' || $planCodigo === '') {
            throw new ValidationException('Faltan datos de la venta (número TuVes, cliente, comuna o plan).');
        }

        $plan = (new PlanRepository())->porCodigo($planCodigo);
        if (!$plan) {
            throw new ValidationException('Plan desconocido: ' . $planCodigo);
        }

        $repo = new VentaRepository();
        $id = $repo->crear([
            'numero_venta_tuves' => $numero,
            'cliente_nombre' => $cliente,
            'cliente_rut' => $rut !== '' ? $rut : null,
            'cliente_direccion' => $direccion !== '' ? $direccion : null,
            'cliente_telefono' => $telefono !== '' ? $telefono : null,
            'comuna' => $comuna,
            'plan_id' => $plan['id'],
            'vendedor_id' => $vendedorId,
            'estado' => 'registrada',
        ]);

        Response::json($repo->find($id), 201);
    }

    public function pendientes(Request $req): void
    {
        Response::json(['ventas' => (new VentaRepository())->pendientesDe(Auth::id())]);
    }
}
