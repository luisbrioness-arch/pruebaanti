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

    /** A diferencia de porCodigo(), no filtra por activo (salvo cuando se excluye el ID al editar) */
    public function existeCodigo(string $codigo, ?int $excluirId = null): bool
    {
        if ($excluirId !== null) {
            $stmt = Database::connection()->prepare('SELECT 1 FROM items_ferreteria WHERE codigo = ? AND id != ? LIMIT 1');
            $stmt->execute([$codigo, $excluirId]);
            return (bool) $stmt->fetchColumn();
        }
        $stmt = Database::connection()->prepare('SELECT 1 FROM items_ferreteria WHERE codigo = ? AND activo = 1 LIMIT 1');
        $stmt->execute([$codigo]);
        return (bool) $stmt->fetchColumn();
    }

    public function buscarPorCodigoCualquiera(string $codigo): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM items_ferreteria WHERE codigo = ? LIMIT 1');
        $stmt->execute([$codigo]);
        return $stmt->fetch() ?: null;
    }

    public function reactivar(int $id, string $nombre, string $unidadMedida): void
    {
        $stmt = Database::connection()->prepare('UPDATE items_ferreteria SET activo = 1, nombre = ?, unidad_medida = ? WHERE id = ?');
        $stmt->execute([$nombre, $unidadMedida, $id]);
    }

    public function crear(string $codigo, string $nombre, string $unidadMedida): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO items_ferreteria (codigo, nombre, unidad_medida, activo) VALUES (?, ?, ?, 1)'
        );
        $stmt->execute([$codigo, $nombre, $unidadMedida]);
        return (int) Database::connection()->lastInsertId();
    }

    public function actualizar(int $id, string $codigo, string $nombre, string $unidadMedida): void
    {
        $stmt = Database::connection()->prepare('UPDATE items_ferreteria SET codigo = ?, nombre = ?, unidad_medida = ? WHERE id = ?');
        $stmt->execute([$codigo, $nombre, $unidadMedida, $id]);
    }

    public function eliminar(int $id): array
    {
        $movs = 0;
        try {
            $movs += (int) Database::connection()->query('SELECT COUNT(*) FROM movimientos_ferreteria_central WHERE item_ferreteria_id = ' . (int) $id)->fetchColumn();
        } catch (\Throwable $e) {}
        try {
            $movs += (int) Database::connection()->query('SELECT COUNT(*) FROM movimientos_ferreteria WHERE item_ferreteria_id = ' . (int) $id)->fetchColumn();
        } catch (\Throwable $e) {}
        try {
            $movs += (int) Database::connection()->query('SELECT COUNT(*) FROM orden_ferreteria WHERE item_ferreteria_id = ' . (int) $id)->fetchColumn();
        } catch (\Throwable $e) {}

        if ($movs > 0) {
            $stmt = Database::connection()->prepare('UPDATE items_ferreteria SET activo = 0 WHERE id = ?');
            $stmt->execute([$id]);
            return ['accion' => 'desactivado', 'mensaje' => 'El ítem tiene movimientos registrados. Se ha desactivado del catálogo.'];
        }

        try {
            Database::connection()->exec('DELETE FROM stock_ferreteria_central WHERE item_ferreteria_id = ' . (int) $id . ' AND cantidad_actual = 0');
            Database::connection()->exec('DELETE FROM stock_ferreteria_usuario WHERE item_ferreteria_id = ' . (int) $id . ' AND cantidad_actual = 0');
            Database::connection()->exec('DELETE FROM entregas_ferreteria_pendientes WHERE item_ferreteria_id = ' . (int) $id);
            $stmt = Database::connection()->prepare('DELETE FROM items_ferreteria WHERE id = ?');
            $stmt->execute([$id]);
            return ['accion' => 'eliminado', 'mensaje' => 'Ítem de ferretería eliminado del catálogo.'];
        } catch (\Throwable $e) {
            $stmt = Database::connection()->prepare('UPDATE items_ferreteria SET activo = 0 WHERE id = ?');
            $stmt->execute([$id]);
            return ['accion' => 'desactivado', 'mensaje' => 'El ítem ha sido desactivado del catálogo.'];
        }
    }
}
