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
}
