<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Exceptions\NotFoundException;
use App\Exceptions\ValidationException;
use App\Repositories\ConflictoSincronizacionRepository;
use App\Repositories\OrdenRepository;

/**
 * Resuelve lo que OrdenWizardService detectó pero no puede decidir solo:
 * dos técnicos (o el mismo, el mismo día) usaron el mismo folio. La orden
 * queda en 'conflicto' — nunca se pierde trabajo hecho — hasta que un
 * humano decide acá cuál es la válida.
 */
final class ConflictoService
{
    private ConflictoSincronizacionRepository $conflictos;
    private OrdenRepository $ordenes;

    public function __construct()
    {
        $this->conflictos = new ConflictoSincronizacionRepository();
        $this->ordenes = new OrdenRepository();
    }

    public function listarPendientes(): array
    {
        return $this->conflictos->pendientes();
    }

    /**
     * accion:
     *  - 'invalidar'  → la orden en conflicto se cierra sin pago (folio duplicado por error real)
     *  - 'aceptar'    → era una visita legítima (ej. garantía): se confirma
     *    como si nunca hubiera chocado el folio — snapshot de monto, consumo
     *    físico de equipos/ferretería y comisión de venta si corresponde
     *    (ver OrdenWizardService::confirmarOrdenAceptadaTrasConflicto). Antes
     *    de este fix, "aceptar" solo cambiaba el estado a mano: la orden
     *    volvía a 'enviada' pero quedaba con monto NULL y sin descontar
     *    nada del inventario, aunque después se aprobara en auditoría.
     */
    public function resolver(int $conflictoId, string $accion, int $resueltoPorId, ?string $comentario = null): array
    {
        $conflicto = $this->conflictos->find($conflictoId);
        if (!$conflicto) {
            throw new NotFoundException('Conflicto no encontrado.');
        }
        if ((int) $conflicto['resuelto'] === 1) {
            throw new ValidationException('Este conflicto ya fue resuelto.');
        }
        if (!in_array($accion, ['invalidar', 'aceptar'], true)) {
            throw new ValidationException('Acción inválida: ' . $accion . ' (debe ser "invalidar" o "aceptar").');
        }

        $ordenId = (int) $conflicto['orden_id'];

        return Database::transaction(function () use ($ordenId, $accion, $resueltoPorId, $comentario, $conflictoId) {
            if ($accion === 'invalidar') {
                $this->ordenes->actualizar($ordenId, [
                    'estado' => 'rechazada_penalizada',
                    'motivo_rechazo' => 'no_corresponde',
                    'comentario_auditoria' => $comentario ?? 'Folio duplicado — resuelto como conflicto real.',
                    'auditor_id' => $resueltoPorId,
                    'fecha_auditoria' => date('Y-m-d H:i:s'),
                ]);
            } else { // 'aceptar'
                $orden = $this->ordenes->find($ordenId);
                if (!$orden) {
                    throw new NotFoundException('Orden no encontrada.');
                }
                (new OrdenWizardService())->confirmarOrdenAceptadaTrasConflicto($ordenId, (int) $orden['tecnico_id']);
            }

            $this->conflictos->marcarResuelto($conflictoId, $resueltoPorId);
            return $this->conflictos->find($conflictoId);
        });
    }
}
