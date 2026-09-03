<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

/** Mismo patrón versionado que TarifaServicioRepository/ComisionPlanRepository — nunca UPDATE del monto vigente. */
final class TarifaInstalacionPlanRepository
{
    public function vigentePara(int $planId): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM tarifas_instalacion_plan WHERE plan_id = ? AND vigente_hasta IS NULL LIMIT 1'
        );
        $stmt->execute([$planId]);
        return $stmt->fetch() ?: null;
    }

    public function todasVigentes(): array
    {
        return Database::connection()->query(
            "SELECT t.*, p.codigo AS plan_codigo, p.nombre AS plan_nombre
             FROM tarifas_instalacion_plan t
             JOIN planes p ON p.id = t.plan_id
             WHERE t.vigente_hasta IS NULL
             ORDER BY p.nombre"
        )->fetchAll();
    }

    public function cerrarYCrear(int $planId, float $monto, int $creadoPor): int
    {
        $ahora = date('Y-m-d H:i:s');
        Database::connection()
            ->prepare('UPDATE tarifas_instalacion_plan SET vigente_hasta = ? WHERE plan_id = ? AND vigente_hasta IS NULL')
            ->execute([$ahora, $planId]);

        $stmt = Database::connection()->prepare(
            'INSERT INTO tarifas_instalacion_plan (plan_id, monto, vigente_desde, vigente_hasta, creado_por)
             VALUES (?, ?, ?, NULL, ?)'
        );
        $stmt->execute([$planId, $monto, $ahora, $creadoPor]);
        return (int) Database::connection()->lastInsertId();
    }
}
