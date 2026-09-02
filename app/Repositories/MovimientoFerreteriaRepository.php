<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class MovimientoFerreteriaRepository
{
    public function crear(int $itemFerreteriaId, int $usuarioId, string $tipoMovimiento, float $cantidad, ?int $ordenId, ?string $observacion = null): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO movimientos_ferreteria (item_ferreteria_id, usuario_id, tipo_movimiento, cantidad, orden_id, observacion)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$itemFerreteriaId, $usuarioId, $tipoMovimiento, $cantidad, $ordenId, $observacion]);
        return (int) Database::connection()->lastInsertId();
    }
}
