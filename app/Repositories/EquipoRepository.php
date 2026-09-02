<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class EquipoRepository
{
    public function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM equipos WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function porSerie(string $numeroSerie): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM equipos WHERE numero_serie = ?');
        $stmt->execute([$numeroSerie]);
        return $stmt->fetch() ?: null;
    }

    public function actualizarEstado(int $id, string $estado, ?int $usuarioActualId, ?int $ordenInstalacionId): void
    {
        $stmt = Database::connection()->prepare(
            'UPDATE equipos SET estado = ?, usuario_actual_id = ?, orden_instalacion_id = ? WHERE id = ?'
        );
        $stmt->execute([$estado, $usuarioActualId, $ordenInstalacionId, $id]);
    }

    /** Alta en bodega — siempre nace en estado 'bodega', sin dueño. */
    public function crear(int $tipoEquipoId, string $numeroSerie): int
    {
        $stmt = Database::connection()->prepare(
            "INSERT INTO equipos (tipo_equipo_id, numero_serie, estado) VALUES (?, ?, 'bodega')"
        );
        $stmt->execute([$tipoEquipoId, $numeroSerie]);
        return (int) Database::connection()->lastInsertId();
    }

    public function listar(?string $estado, ?int $tecnicoId): array
    {
        $sql = "SELECT e.*, te.codigo AS tipo_equipo_codigo, te.nombre AS tipo_equipo_nombre, u.nombre AS tecnico_nombre
                FROM equipos e
                JOIN tipos_equipo te ON te.id = e.tipo_equipo_id
                LEFT JOIN usuarios u ON u.id = e.usuario_actual_id
                WHERE 1=1";
        $params = [];
        if ($estado !== null) {
            $sql .= ' AND e.estado = :estado';
            $params['estado'] = $estado;
        }
        if ($tecnicoId !== null) {
            $sql .= ' AND e.usuario_actual_id = :tecnico_id';
            $params['tecnico_id'] = $tecnicoId;
        }
        $sql .= ' ORDER BY e.creado_en DESC';
        $stmt = Database::connection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
}
