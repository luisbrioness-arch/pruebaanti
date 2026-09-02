<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class ConflictoSincronizacionRepository
{
    public function crear(int $ordenId, string $tipo, ?int $ordenConflictoId, string $descripcion): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO conflictos_sincronizacion (orden_id, tipo, orden_conflicto_id, descripcion)
             VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$ordenId, $tipo, $ordenConflictoId, $descripcion]);
        return (int) Database::connection()->lastInsertId();
    }

    public function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM conflictos_sincronizacion WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function pendientes(): array
    {
        return Database::connection()->query(
            "SELECT c.*, o.folio, o.tecnico_id, u.nombre AS tecnico_nombre
             FROM conflictos_sincronizacion c
             JOIN ordenes o ON o.id = c.orden_id
             JOIN usuarios u ON u.id = o.tecnico_id
             WHERE c.resuelto = 0
             ORDER BY c.creado_en ASC"
        )->fetchAll();
    }

    public function marcarResuelto(int $id, int $resueltoPor): void
    {
        Database::connection()
            ->prepare('UPDATE conflictos_sincronizacion SET resuelto = 1, resuelto_por = ?, resuelto_en = ? WHERE id = ?')
            ->execute([$resueltoPor, date('Y-m-d H:i:s'), $id]);
    }
}
