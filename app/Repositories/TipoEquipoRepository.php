<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class TipoEquipoRepository
{
    public function asegurarColumnaActivo(): void
    {
        try {
            Database::connection()->exec('ALTER TABLE tipos_equipo ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1');
        } catch (\Throwable $e) {
            // Ya existe la columna
        }
    }

    public function find(int $id): ?array
    {
        $this->asegurarColumnaActivo();
        $stmt = Database::connection()->prepare('SELECT * FROM tipos_equipo WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function porCodigo(string $codigo): ?array
    {
        $this->asegurarColumnaActivo();
        $stmt = Database::connection()->prepare('SELECT * FROM tipos_equipo WHERE codigo = ? AND activo = 1');
        $stmt->execute([$codigo]);
        return $stmt->fetch() ?: null;
    }

    public function all(): array
    {
        $this->asegurarColumnaActivo();
        return Database::connection()->query('SELECT * FROM tipos_equipo WHERE activo = 1 ORDER BY nombre')->fetchAll();
    }

    public function existeCodigo(string $codigo, ?int $excluirId = null): bool
    {
        $this->asegurarColumnaActivo();
        if ($excluirId !== null) {
            $stmt = Database::connection()->prepare('SELECT 1 FROM tipos_equipo WHERE codigo = ? AND id != ? LIMIT 1');
            $stmt->execute([$codigo, $excluirId]);
            return (bool) $stmt->fetchColumn();
        }
        $stmt = Database::connection()->prepare('SELECT 1 FROM tipos_equipo WHERE codigo = ? AND activo = 1 LIMIT 1');
        $stmt->execute([$codigo]);
        return (bool) $stmt->fetchColumn();
    }

    public function buscarPorCodigoCualquiera(string $codigo): ?array
    {
        $this->asegurarColumnaActivo();
        $stmt = Database::connection()->prepare('SELECT * FROM tipos_equipo WHERE codigo = ? LIMIT 1');
        $stmt->execute([$codigo]);
        return $stmt->fetch() ?: null;
    }

    public function reactivar(int $id, string $nombre): void
    {
        $this->asegurarColumnaActivo();
        $stmt = Database::connection()->prepare('UPDATE tipos_equipo SET activo = 1, nombre = ? WHERE id = ?');
        $stmt->execute([$nombre, $id]);
    }

    public function crear(string $codigo, string $nombre): int
    {
        $this->asegurarColumnaActivo();
        $stmt = Database::connection()->prepare('INSERT INTO tipos_equipo (codigo, nombre, activo) VALUES (?, ?, 1)');
        $stmt->execute([$codigo, $nombre]);
        return (int) Database::connection()->lastInsertId();
    }

    public function actualizar(int $id, string $codigo, string $nombre): void
    {
        $this->asegurarColumnaActivo();
        $stmt = Database::connection()->prepare('UPDATE tipos_equipo SET codigo = ?, nombre = ? WHERE id = ?');
        $stmt->execute([$codigo, $nombre, $id]);
    }

    public function eliminar(int $id): array
    {
        $this->asegurarColumnaActivo();
        $enUso = 0;
        try {
            $enUso = (int) Database::connection()->query('SELECT COUNT(*) FROM equipos WHERE tipo_equipo_id = ' . (int) $id)->fetchColumn();
        } catch (\Throwable $e) {}

        if ($enUso > 0) {
            $stmt = Database::connection()->prepare('UPDATE tipos_equipo SET activo = 0 WHERE id = ?');
            $stmt->execute([$id]);
            return ['accion' => 'desactivado', 'mensaje' => "El tipo tiene {$enUso} equipo(s) asociado(s). Se ha desactivado del catálogo."];
        }

        $stmt = Database::connection()->prepare('DELETE FROM tipos_equipo WHERE id = ?');
        $stmt->execute([$id]);
        return ['accion' => 'eliminado', 'mensaje' => 'Tipo de equipo eliminado correctamente.'];
    }
}
