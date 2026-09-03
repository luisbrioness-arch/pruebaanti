<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class PlanRepository
{
    public function porCodigo(string $codigo): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM planes WHERE codigo = ? AND activo = 1');
        $stmt->execute([$codigo]);
        return $stmt->fetch() ?: null;
    }

    /** Para el selector del formulario de venta — el técnico elige por nombre, no de memoria el código. */
    public function activos(): array
    {
        return Database::connection()
            ->query('SELECT id, codigo, nombre FROM planes WHERE activo = 1 ORDER BY nombre')
            ->fetchAll();
    }

    public function existeCodigo(string $codigo): bool
    {
        $stmt = Database::connection()->prepare('SELECT 1 FROM planes WHERE codigo = ? LIMIT 1');
        $stmt->execute([$codigo]);
        return (bool) $stmt->fetchColumn();
    }

    public function crear(string $codigo, string $nombre): int
    {
        $stmt = Database::connection()->prepare('INSERT INTO planes (codigo, nombre) VALUES (?, ?)');
        $stmt->execute([$codigo, $nombre]);
        return (int) Database::connection()->lastInsertId();
    }
}
