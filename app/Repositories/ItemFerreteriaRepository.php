<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class ItemFerreteriaRepository
{
    public function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM items_ferreteria WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function porCodigo(string $codigo): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM items_ferreteria WHERE codigo = ? AND activo = 1');
        $stmt->execute([$codigo]);
        return $stmt->fetch() ?: null;
    }

    public function all(): array
    {
        return Database::connection()->query('SELECT * FROM items_ferreteria WHERE activo = 1 ORDER BY nombre')->fetchAll();
    }
}
