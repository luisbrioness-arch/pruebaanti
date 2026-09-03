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

    /** Línea de tiempo completa de un equipo — para el buscador por serie del admin. */
    public function historialDeEquipo(int $equipoId): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT m.*, uo.nombre AS origen_nombre, ud.nombre AS destino_nombre, o.folio AS orden_folio
             FROM movimientos_equipo m
             LEFT JOIN usuarios uo ON uo.id = m.usuario_origen_id
             LEFT JOIN usuarios ud ON ud.id = m.usuario_destino_id
             LEFT JOIN ordenes o ON o.id = m.orden_id
             WHERE m.equipo_id = ?
             ORDER BY m.creado_en DESC, m.id DESC"
        );
        $stmt->execute([$equipoId]);
        return $stmt->fetchAll();
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
