<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class MovimientoFerreteriaCentralRepository
{
    public function crear(
        int $bodegaId,
        int $itemFerreteriaId,
        string $tipoMovimiento,
        float $cantidad,
        ?int $entregaPendienteId,
        ?string $observacion,
        int $creadoPorId
    ): int {
        $stmt = Database::connection()->prepare(
            'INSERT INTO movimientos_ferreteria_central
                (bodega_id, item_ferreteria_id, tipo_movimiento, cantidad, entrega_pendiente_id, observacion, creado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$bodegaId, $itemFerreteriaId, $tipoMovimiento, $cantidad, $entregaPendienteId, $observacion, $creadoPorId]);
        return (int) Database::connection()->lastInsertId();
    }
}
