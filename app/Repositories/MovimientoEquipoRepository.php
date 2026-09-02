<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class MovimientoEquipoRepository
{
    /**
     * Si ya existe al menos un movimiento para esta orden, el consumo físico
     * ya se confirmó una vez — usado para que un reenvío tras "reabrir" no
     * vuelva a instalar/retirar los mismos equipos ni a descontar de nuevo.
     */
    public function existeParaOrden(int $ordenId): bool
    {
        $stmt = Database::connection()->prepare('SELECT 1 FROM movimientos_equipo WHERE orden_id = ? LIMIT 1');
        $stmt->execute([$ordenId]);
        return (bool) $stmt->fetchColumn();
    }

    public function crear(
        int $equipoId,
        string $tipoMovimiento,
        ?int $usuarioOrigenId,
        ?int $usuarioDestinoId,
        ?int $ordenId,
        ?string $observacion = null
    ): int {
        $stmt = Database::connection()->prepare(
            'INSERT INTO movimientos_equipo (equipo_id, tipo_movimiento, usuario_origen_id, usuario_destino_id, orden_id, observacion)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$equipoId, $tipoMovimiento, $usuarioOrigenId, $usuarioDestinoId, $ordenId, $observacion]);
        return (int) Database::connection()->lastInsertId();
    }
}
