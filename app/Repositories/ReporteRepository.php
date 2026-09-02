<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class ReporteRepository
{
    public function crear(int $usuarioId, string $tipo, string $descripcion, ?string $pantalla): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO reportes (usuario_id, tipo, descripcion, pantalla)
             VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$usuarioId, $tipo, $descripcion, $pantalla]);
        return (int) Database::connection()->lastInsertId();
    }

    public function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM reportes WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    /** @param string|null $estado null = todos, 'abierto'/'resuelto' = filtrado */
    public function listar(?string $estado): array
    {
        $sql = "SELECT r.*, u.nombre AS usuario_nombre, ru.nombre AS resuelto_por_nombre
                FROM reportes r
                JOIN usuarios u ON u.id = r.usuario_id
                LEFT JOIN usuarios ru ON ru.id = r.resuelto_por";
        $params = [];
        if ($estado !== null) {
            $sql .= ' WHERE r.estado = ?';
            $params[] = $estado;
        }
        $sql .= ' ORDER BY r.creado_en DESC';
        $stmt = Database::connection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function marcarResuelto(int $id, int $resueltoPor): void
    {
        Database::connection()
            ->prepare('UPDATE reportes SET estado = ?, resuelto_por = ?, resuelto_en = ? WHERE id = ?')
            ->execute(['resuelto', $resueltoPor, date('Y-m-d H:i:s'), $id]);
    }

    public function reabrir(int $id): void
    {
        Database::connection()
            ->prepare('UPDATE reportes SET estado = ?, resuelto_por = NULL, resuelto_en = NULL WHERE id = ?')
            ->execute(['abierto', $id]);
    }
}
