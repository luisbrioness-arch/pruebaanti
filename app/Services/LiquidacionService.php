<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Exceptions\ValidationException;
use App\Repositories\MovimientoBilleteraRepository;
use App\Repositories\OrdenRepository;
use App\Repositories\PeriodoLiquidacionRepository;
use App\Repositories\UsuarioRepository;
use App\Repositories\VentaRepository;

/**
 * Fase 2 adelantada (ver docs/liquidacion-billetera.md): cierra lo que un
 * técnico tiene aprobado/instalado y sin pagar, y lleva la billetera —
 * cuánto se le acreditó, cuánto se le pagó, cuánto le queda pendiente.
 *
 * "Cerrar un período" no es elegir un rango de fechas: agarra TODO lo
 * pendiente de ESE técnico en el momento del cierre. Elegir fechas a mano
 * dejaría huecos (una orden aprobada después de "cerrar el mes" nunca
 * entraría a ningún período). fecha_desde/fecha_hasta en el período creado
 * son solo el registro de qué rango cubrió, no el criterio de selección.
 */
final class LiquidacionService
{
    private OrdenRepository $ordenes;
    private VentaRepository $ventas;
    private PeriodoLiquidacionRepository $periodos;
    private MovimientoBilleteraRepository $movimientos;
    private UsuarioRepository $usuarios;

    public function __construct()
    {
        $this->ordenes = new OrdenRepository();
        $this->ventas = new VentaRepository();
        $this->periodos = new PeriodoLiquidacionRepository();
        $this->movimientos = new MovimientoBilleteraRepository();
        $this->usuarios = new UsuarioRepository();
    }

    /** Vista previa de lo que un cierre incluiría ahora mismo, sin cerrar nada todavía. */
    public function pendientePorLiquidar(int $tecnicoId): array
    {
        $ordenes = $this->ordenes->pendientesDeLiquidar($tecnicoId);
        $ventas = $this->ventas->pendientesDeLiquidar($tecnicoId);
        $montoOrdenes = (float) array_sum(array_column($ordenes, 'monto_tecnico'));
        $montoVentas = (float) array_sum(array_column($ventas, 'monto_vendedor'));
        return [
            'ordenes' => $ordenes,
            'ventas' => $ventas,
            'monto_ordenes' => $montoOrdenes,
            'monto_ventas' => $montoVentas,
            'monto_total' => $montoOrdenes + $montoVentas,
        ];
    }

    public function cerrarPeriodo(int $tecnicoId, int $cerradoPorId, ?string $observaciones): array
    {
        if (!$this->usuarios->find($tecnicoId)) {
            throw new ValidationException('Técnico inexistente.');
        }

        return Database::transaction(function () use ($tecnicoId, $cerradoPorId, $observaciones) {
            // Lectura CON BLOQUEO (ver los repositorios): si entran dos
            // cierres a la vez —un doble clic en el botón alcanza— el
            // segundo espera acá, y al continuar ya no ve nada pendiente,
            // así que corta abajo en vez de acreditar el mismo trabajo dos
            // veces en la billetera del técnico.
            $ordenes = $this->ordenes->pendientesDeLiquidar($tecnicoId, bloqueando: true);
            $ventas = $this->ventas->pendientesDeLiquidar($tecnicoId, bloqueando: true);
            if (!$ordenes && !$ventas) {
                throw new ValidationException('No hay nada pendiente de liquidar para este técnico.');
            }

            $montoOrdenes = (float) array_sum(array_column($ordenes, 'monto_tecnico'));
            $montoVentas = (float) array_sum(array_column($ventas, 'monto_vendedor'));

            $fechaDesde = min(array_merge(
                array_column($ordenes, 'fecha_auditoria'),
                array_column($ventas, 'creado_en')
            ));

            $periodoId = $this->periodos->crear([
                'tecnico_id' => $tecnicoId,
                'fecha_desde' => $fechaDesde,
                'fecha_hasta' => date('Y-m-d H:i:s'),
                'monto_ordenes' => $montoOrdenes,
                'monto_ventas' => $montoVentas,
                'monto_total' => $montoOrdenes + $montoVentas,
                'observaciones' => $observaciones,
                'cerrado_por' => $cerradoPorId,
            ]);

            $this->ordenes->marcarLiquidadas(array_column($ordenes, 'id'), $periodoId);
            $this->ventas->marcarLiquidadas(array_column($ventas, 'id'), $periodoId);

            $this->movimientos->crear([
                'tecnico_id' => $tecnicoId,
                'tipo_movimiento' => 'liquidacion',
                'monto' => $montoOrdenes + $montoVentas,
                'periodo_liquidacion_id' => $periodoId,
                'observacion' => null,
                'creado_por' => $cerradoPorId,
            ]);

            return $this->periodos->find($periodoId);
        });
    }

    /** Edwin le pagó de verdad (transferencia, efectivo) — descuenta de la billetera. */
    public function registrarPago(int $tecnicoId, float $monto, int $creadoPorId, ?string $observacion): array
    {
        if (!$this->usuarios->find($tecnicoId)) {
            throw new ValidationException('Técnico inexistente.');
        }
        if ($monto <= 0) {
            throw new ValidationException('El monto del pago debe ser mayor que cero.');
        }
        $this->movimientos->crear([
            'tecnico_id' => $tecnicoId,
            'tipo_movimiento' => 'pago',
            'monto' => -$monto,
            'periodo_liquidacion_id' => null,
            'observacion' => $observacion,
            'creado_por' => $creadoPorId,
        ]);
        return $this->resumenDe($tecnicoId);
    }

    /** Corrección manual en cualquier sentido — exige observación, porque sin eso nadie entiende después por qué se movió. */
    public function registrarAjuste(int $tecnicoId, float $monto, int $creadoPorId, string $observacion): array
    {
        if (!$this->usuarios->find($tecnicoId)) {
            throw new ValidationException('Técnico inexistente.');
        }
        if ($monto === 0.0) {
            throw new ValidationException('El ajuste no puede ser cero.');
        }
        if (trim($observacion) === '') {
            throw new ValidationException('Un ajuste manual necesita una observación.');
        }
        $this->movimientos->crear([
            'tecnico_id' => $tecnicoId,
            'tipo_movimiento' => 'ajuste',
            'monto' => $monto,
            'periodo_liquidacion_id' => null,
            'observacion' => $observacion,
            'creado_por' => $creadoPorId,
        ]);
        return $this->resumenDe($tecnicoId);
    }

    public function resumenDe(int $tecnicoId): array
    {
        return [
            'saldo' => $this->movimientos->saldoDe($tecnicoId),
            'movimientos' => $this->movimientos->listarPorTecnico($tecnicoId),
            'periodos' => $this->periodos->listarPorTecnico($tecnicoId),
        ];
    }

    public function saldosDeTodos(): array
    {
        return $this->movimientos->saldosDeTodos();
    }
}
