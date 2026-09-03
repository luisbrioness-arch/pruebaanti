<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class ComisionPlanRepository
{
    public function vigentePara(int $planId): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM comisiones_plan WHERE plan_id = ? AND vigente_hasta IS NULL LIMIT 1'
        );
        $stmt->execute([$planId]);
        return $stmt->fetch() ?: null;
    }

    public function todasVigentes(): array
    {
        return Database::connection()->query(
            "SELECT c.*, p.codigo AS plan_codigo, p.nombre AS plan_nombre, p.activo AS plan_activo
             FROM comisiones_plan c
             JOIN planes p ON p.id = c.plan_id
             WHERE c.vigente_hasta IS NULL
             ORDER BY p.nombre"
        )->fetchAll();
    }

    /** Mismo patrón que TarifaServicioRepository::cerrarYCrear — nunca UPDATE del monto vigente. */
    public function cerrarYCrear(int $planId, float $monto, int $creadoPor): int
    {
        $ahora = date('Y-m-d H:i:s');
        Database::connection()
            ->prepare('UPDATE comisiones_plan SET vigente_hasta = ? WHERE plan_id = ? AND vigente_hasta IS NULL')
            ->execute([$ahora, $planId]);

        $stmt = Database::connection()->prepare(
            'INSERT INTO comisiones_plan (plan_id, monto, vigente_desde, vigente_hasta, creado_por)
             VALUES (?, ?, ?, NULL, ?)'
        );
        $stmt->execute([$planId, $monto, $ahora, $creadoPor]);
        return (int) Database::connection()->lastInsertId();
    }
}
