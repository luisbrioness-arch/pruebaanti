<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class PeriodoLiquidacionRepository
{
    public function crear(array $datos): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO periodos_liquidacion
                (tecnico_id, fecha_desde, fecha_hasta, monto_ordenes, monto_ventas, monto_total, observaciones, cerrado_por)
             VALUES
                (:tecnico_id, :fecha_desde, :fecha_hasta, :monto_ordenes, :monto_ventas, :monto_total, :observaciones, :cerrado_por)'
        );
        $stmt->execute($datos);
        return (int) Database::connection()->lastInsertId();
    }

    public function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM periodos_liquidacion WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    /** Historial de cierres de un técnico, más reciente primero. */
    public function listarPorTecnico(int $tecnicoId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT p.*, u.nombre AS cerrado_por_nombre
             FROM periodos_liquidacion p
             JOIN usuarios u ON u.id = p.cerrado_por
             WHERE p.tecnico_id = ?
             ORDER BY p.creado_en DESC'
        );
        $stmt->execute([$tecnicoId]);
        return $stmt->fetchAll();
    }
}
