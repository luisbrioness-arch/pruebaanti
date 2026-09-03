<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class VentaRepository
{
    public function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM ventas WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function crear(array $datos): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO ventas (numero_venta_tuves, cliente_nombre, cliente_rut, cliente_direccion, cliente_telefono, fecha_instalacion_solicitada, comuna, plan_id, vendedor_id, estado)
             VALUES (:numero_venta_tuves, :cliente_nombre, :cliente_rut, :cliente_direccion, :cliente_telefono, :fecha_instalacion_solicitada, :comuna, :plan_id, :vendedor_id, :estado)'
        );
        $stmt->execute($datos);
        return (int) Database::connection()->lastInsertId();
    }

    /** Mismo cuidado que OrdenRepository::actualizar() — $campos solo con claves fijas del código, nunca del request. */
    public function actualizar(int $id, array $campos): void
    {
        if (!$campos) {
            return;
        }
        $sets = [];
        foreach (array_keys($campos) as $columna) {
            $sets[] = "$columna = :$columna";
        }
        $sql = 'UPDATE ventas SET ' . implode(', ', $sets) . ' WHERE id = :id';
        $campos['id'] = $id;
        Database::connection()->prepare($sql)->execute($campos);
    }

    /** Ventas propias todavía sin instalación asociada — para el selector del paso 1. */
    public function pendientesDe(int $vendedorId): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT v.*, p.nombre AS plan_nombre
             FROM ventas v JOIN planes p ON p.id = v.plan_id
             WHERE v.vendedor_id = ? AND v.estado = 'registrada'
             ORDER BY v.creado_en DESC"
        );
        $stmt->execute([$vendedorId]);
        return $stmt->fetchAll();
    }

    /**
     * Todas las ventas sin instalar (de cualquier técnico), ordenadas por la
     * fecha que pidió el cliente — las más próximas (o ya vencidas) primero,
     * las que no tienen fecha cargada van al final. Para "Pendientes de
     * instalar" en Inicio del panel admin.
     */
    public function pendientesInstalarTodas(int $limite = 20): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT v.*, p.nombre AS plan_nombre, u.nombre AS vendedor_nombre
             FROM ventas v
             JOIN planes p ON p.id = v.plan_id
             JOIN usuarios u ON u.id = v.vendedor_id
             WHERE v.estado = 'registrada'
             ORDER BY (v.fecha_instalacion_solicitada IS NULL) ASC, v.fecha_instalacion_solicitada ASC
             LIMIT ?"
        );
        $stmt->bindValue(1, $limite, \PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    /** Ventas instaladas de un vendedor que todavía no entraron a ningún cierre de liquidación. */
    /** @param bool $bloqueando ver OrdenRepository::pendientesDeLiquidar — mismo motivo (doble cierre = doble pago). */
    public function pendientesDeLiquidar(int $vendedorId, bool $bloqueando = false): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT * FROM ventas
             WHERE vendedor_id = ? AND estado = 'instalada' AND periodo_liquidacion_id IS NULL
             ORDER BY creado_en ASC" . ($bloqueando ? ' FOR UPDATE' : '')
        );
        $stmt->execute([$vendedorId]);
        return $stmt->fetchAll();
    }

    /** Las ata al período que se acaba de cerrar — el estado 'instalada' no cambia, solo queda marcada como ya pagada. */
    public function marcarLiquidadas(array $ids, int $periodoId): void
    {
        if (!$ids) {
            return;
        }
        $marcadores = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::connection()->prepare(
            "UPDATE ventas SET periodo_liquidacion_id = ? WHERE id IN ($marcadores)"
        );
        $stmt->execute([$periodoId, ...$ids]);
    }
}
