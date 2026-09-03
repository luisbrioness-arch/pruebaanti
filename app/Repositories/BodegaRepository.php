<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

/** Bodegas físicas (ver database/schema_fase1.sql) — "Bodega Central" siempre existe, sembrada en el schema. */
final class BodegaRepository
{
    public function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM bodegas WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function activas(): array
    {
        return Database::connection()->query('SELECT * FROM bodegas WHERE activa = 1 ORDER BY nombre')->fetchAll();
    }

    public function crear(string $nombre): int
    {
        $stmt = Database::connection()->prepare('INSERT INTO bodegas (nombre) VALUES (?)');
        $stmt->execute([$nombre]);
        return (int) Database::connection()->lastInsertId();
    }

    public function existeNombre(string $nombre): bool
    {
        $stmt = Database::connection()->prepare('SELECT 1 FROM bodegas WHERE nombre = ? LIMIT 1');
        $stmt->execute([$nombre]);
        return (bool) $stmt->fetchColumn();
    }
}
