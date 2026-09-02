<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class UsuarioRepository
{
    public function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM usuarios WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function findByUsuario(string $usuario): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM usuarios WHERE usuario = ?');
        $stmt->execute([$usuario]);
        return $stmt->fetch() ?: null;
    }

    /** Para selectores del panel admin (asignar equipo, entregar ferretería) — nunca incluye password_hash. */
    public function activos(): array
    {
        $filas = Database::connection()
            ->query('SELECT id, nombre, usuario, rol, porcentaje_reparto FROM usuarios WHERE activo = 1 ORDER BY nombre')
            ->fetchAll();
        return $filas;
    }
}
