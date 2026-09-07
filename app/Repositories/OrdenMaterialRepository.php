<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class OrdenMaterialRepository
{
    public function paraOrden(int $ordenId): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT om.*, e.numero_serie, e.tipo_equipo_id, te.nombre AS tipo_equipo_nombre
             FROM orden_materiales om
             JOIN equipos e ON e.id = om.equipo_id
             LEFT JOIN tipos_equipo te ON te.id = e.tipo_equipo_id
             WHERE om.orden_id = ?"
        );
        $stmt->execute([$ordenId]);
        return $stmt->fetchAll();
    }

    public function existe(int $ordenId, int $equipoId, string $accion): bool
    {
        $stmt = Database::connection()->prepare(
            'SELECT 1 FROM orden_materiales WHERE orden_id = ? AND equipo_id = ? AND accion = ?'
        );
        $stmt->execute([$ordenId, $equipoId, $accion]);
        return (bool) $stmt->fetchColumn();
    }

    public function agregar(int $ordenId, int $equipoId, string $accion, bool $ingresadoManual): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO orden_materiales (orden_id, equipo_id, accion, ingresado_manual) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$ordenId, $equipoId, $accion, $ingresadoManual ? 1 : 0]);
        return (int) Database::connection()->lastInsertId();
    }

    public function eliminar(int $ordenId, int $equipoId, string $accion): void
    {
        Database::connection()
            ->prepare('DELETE FROM orden_materiales WHERE orden_id = ? AND equipo_id = ? AND accion = ?')
            ->execute([$ordenId, $equipoId, $accion]);
    }
}
