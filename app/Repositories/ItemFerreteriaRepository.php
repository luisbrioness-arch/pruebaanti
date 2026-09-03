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

    /** A diferencia de porCodigo(), no filtra por activo — para no dejar crear un código repetido aunque esté desactivado. */
    public function existeCodigo(string $codigo): bool
    {
        $stmt = Database::connection()->prepare('SELECT 1 FROM items_ferreteria WHERE codigo = ? LIMIT 1');
        $stmt->execute([$codigo]);
        return (bool) $stmt->fetchColumn();
    }

    public function crear(string $codigo, string $nombre, string $unidadMedida): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO items_ferreteria (codigo, nombre, unidad_medida) VALUES (?, ?, ?)'
        );
        $stmt->execute([$codigo, $nombre, $unidadMedida]);
        return (int) Database::connection()->lastInsertId();
    }
}
