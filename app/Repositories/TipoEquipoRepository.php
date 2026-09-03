<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class TipoEquipoRepository
{
    public function porCodigo(string $codigo): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM tipos_equipo WHERE codigo = ?');
        $stmt->execute([$codigo]);
        return $stmt->fetch() ?: null;
    }

    public function all(): array
    {
        return Database::connection()->query('SELECT * FROM tipos_equipo ORDER BY nombre')->fetchAll();
    }

    public function existeCodigo(string $codigo): bool
    {
        $stmt = Database::connection()->prepare('SELECT 1 FROM tipos_equipo WHERE codigo = ? LIMIT 1');
        $stmt->execute([$codigo]);
        return (bool) $stmt->fetchColumn();
    }

    public function crear(string $codigo, string $nombre): int
    {
        $stmt = Database::connection()->prepare('INSERT INTO tipos_equipo (codigo, nombre) VALUES (?, ?)');
        $stmt->execute([$codigo, $nombre]);
        return (int) Database::connection()->lastInsertId();
    }
}
