<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Exceptions\NotFoundException;
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
        // Pedido: "casilla en el registro de venta del técnico" para una
        // venta directa de TuVes que él no vendió — sin vendedor, la
        // comisión de venta simplemente no se calcula (ver
        // OrdenWizardService::confirmarVenta), pero sigue apareciendo en
        // "pendientes de instalar" como cualquier otra venta.
        $sinVendedor = (bool) $req->input('sin_vendedor', false);
        $vendedorId = $sinVendedor ? null : Auth::id();

        $numero = trim((string) $req->input('numero_venta_tuves', ''));
        $cliente = trim((string) $req->input('cliente_nombre', ''));
        $comuna = trim((string) $req->input('comuna', ''));
        $planCodigo = (string) $req->input('plan', '');
        // Opcionales — el sistema de TuVes sigue siendo la ficha real del
        // cliente, esto es solo una referencia rápida para el vendedor/técnico.
        $rut = trim((string) $req->input('cliente_rut', ''));
        $direccion = trim((string) $req->input('cliente_direccion', ''));
        $telefono = trim((string) $req->input('cliente_telefono', ''));
        // También opcional, pero es lo que alimenta "pendientes de instalar"
        // en Inicio del admin — sin fecha, la venta simplemente no aparece
        // ahí (no bloquea el registro).
        $fechaInstalacion = trim((string) $req->input('fecha_instalacion_solicitada', ''));

        if ($numero === '' || $cliente === '' || $comuna === '' || $planCodigo === '') {
            throw new ValidationException('Faltan datos de la venta (número TuVes, cliente, comuna o plan).');
        }
        if ($fechaInstalacion !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaInstalacion)) {
            throw new ValidationException('Fecha de instalación inválida.');
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
            'fecha_instalacion_solicitada' => $fechaInstalacion !== '' ? $fechaInstalacion : null,
            'comuna' => $comuna,
            'plan_id' => $plan['id'],
            'vendedor_id' => $vendedorId,
            'estado' => 'registrada',
        ]);

        Response::json($repo->find($id), 201);
    }

    /**
     * Pedido: "si la venta viene de otro lugar ya sea directa de tuvez o
     * otro tecnico esa no se paga al que instala si no al que vendio" —
     * para que eso sea posible primero hace falta poder VER la venta de
     * otro técnico acá. Antes esto era solo `pendientesDe(Auth::id())`
     * (las propias); ahora trae las de todos, marcando cuál es de quién
     * (`vendedor_nombre`) para que el técnico sepa qué está enlazando.
     */
    public function pendientes(Request $req): void
    {
        Response::json(['ventas' => (new VentaRepository())->pendientesInstalarTodas(200)]);
    }

    /**
     * El nombre del plan ya resuelto — la usa el wizard (paso 2) para
     * mostrar "este plan trae N decos" cuando la orden viene enlazada a una
     * venta (pedido: "que aqui aparezcan si este plan por ejemplo era de 3
     * decos 3 series a instalar"). Ya no está restringida al dueño de la
     * venta — cualquier técnico puede instalar la venta de otro (ver
     * pendientes() arriba), así que necesita poder leer su detalle igual.
     */
    public function detalle(Request $req): void
    {
        $id = (int) $req->param('id');
        $venta = (new VentaRepository())->findConPlan($id);
        if (!$venta) {
            throw new NotFoundException('Venta no encontrada.');
        }
        Response::json($venta);
    }
}
