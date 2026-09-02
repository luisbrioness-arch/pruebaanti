<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Exceptions\ValidationException;
use App\Repositories\ComisionPlanRepository;
use App\Repositories\PlanRepository;
use App\Repositories\TarifaServicioRepository;
use App\Repositories\TipoServicioRepository;

/**
 * Editar acá NUNCA reescribe un monto existente — siempre cierra la fila
 * vigente y crea una nueva (ver TarifaServicioRepository::cerrarYCrear).
 * Es la garantía de que una orden ya aprobada no se mueve si el precio
 * cambia después.
 */
final class TarifarioService
{
    private TarifaServicioRepository $tarifas;
    private TipoServicioRepository $tiposServicio;
    private ComisionPlanRepository $comisiones;
    private PlanRepository $planes;

    public function __construct()
    {
        $this->tarifas = new TarifaServicioRepository();
        $this->tiposServicio = new TipoServicioRepository();
        $this->comisiones = new ComisionPlanRepository();
        $this->planes = new PlanRepository();
    }

    public function listarTarifas(): array
    {
        return $this->tarifas->todasVigentes();
    }

    public function editarTarifa(string $tipoServicioCodigo, float $monto, int $editorId): array
    {
        if ($monto <= 0) {
            throw new ValidationException('El monto debe ser mayor que cero.');
        }
        $tipo = $this->tiposServicio->findByCodigo($tipoServicioCodigo);
        if (!$tipo) {
            throw new ValidationException('Tipo de servicio desconocido: ' . $tipoServicioCodigo);
        }
        Database::transaction(function () use ($tipo, $monto, $editorId) {
            $this->tarifas->cerrarYCrear((int) $tipo['id'], $monto, $editorId);
        });
        return $this->tarifas->vigentePara((int) $tipo['id']);
    }

    public function listarComisiones(): array
    {
        return $this->comisiones->todasVigentes();
    }

    public function editarComision(string $planCodigo, float $monto, int $editorId): array
    {
        if ($monto <= 0) {
            throw new ValidationException('El monto debe ser mayor que cero.');
        }
        $plan = $this->planes->porCodigo($planCodigo);
        if (!$plan) {
            throw new ValidationException('Plan desconocido: ' . $planCodigo);
        }
        Database::transaction(function () use ($plan, $monto, $editorId) {
            $this->comisiones->cerrarYCrear((int) $plan['id'], $monto, $editorId);
        });
        return $this->comisiones->vigentePara((int) $plan['id']);
    }
}
