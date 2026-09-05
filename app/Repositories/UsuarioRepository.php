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

    public function existeUsuario(string $usuario): bool
    {
        $stmt = Database::connection()->prepare('SELECT 1 FROM usuarios WHERE usuario = ? LIMIT 1');
        $stmt->execute([$usuario]);
        return (bool) $stmt->fetchColumn();
    }

    /** Alta de un técnico (o admin) nuevo — $datos ya trae password_hash, nunca la contraseña en claro. */
    public function crear(array $datos): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO usuarios (nombre, usuario, email, password_hash, rol, porcentaje_reparto)
             VALUES (:nombre, :usuario, :email, :password_hash, :rol, :porcentaje_reparto)'
        );
        $stmt->execute($datos);
        return (int) Database::connection()->lastInsertId();
    }

    /**
     * Para "Ajustes" (editar el propio perfil): $campos solo con 'nombre'
     * y/o 'password_hash' — mismo cuidado que OrdenRepository::actualizar(),
     * las claves las arma el controller, nunca vienen directo del request.
     */
    public function actualizar(int $id, array $campos): void
    {
        if (!$campos) {
            return;
        }
        $sets = [];
        foreach (array_keys($campos) as $columna) {
            $sets[] = "$columna = :$columna";
        }
        $sql = 'UPDATE usuarios SET ' . implode(', ', $sets) . ' WHERE id = :id';
        $campos['id'] = $id;
        Database::connection()->prepare($sql)->execute($campos);
    }
}
