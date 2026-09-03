<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

/**
 * Ver database/schema_fase1.sql (entregas_ferreteria_pendientes): a
 * diferencia de un equipo (que se puede "reservar" cambiándole el estado),
 * una entrega de ferretería es solo una cantidad — esta tabla es la
 * intención, y solo se refleja en stock_ferreteria_usuario /
 * movimientos_ferreteria cuando el técnico la confirma.
 */
final class EntregaFerreteriaPendienteRepository
{
    /** @param bool $bloqueando ver EquipoRepository::find — mismo motivo. */
    public function find(int $id, bool $bloqueando = false): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM entregas_ferreteria_pendientes WHERE id = ?' . ($bloqueando ? ' FOR UPDATE' : '')
        );
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function crear(int $itemFerreteriaId, int $tecnicoId, float $cantidad, int $creadoPorId, int $bodegaId): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO entregas_ferreteria_pendientes (item_ferreteria_id, tecnico_id, cantidad, creado_por, bodega_id)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$itemFerreteriaId, $tecnicoId, $cantidad, $creadoPorId, $bodegaId]);
        return (int) Database::connection()->lastInsertId();
    }

    public function pendientesPara(int $tecnicoId): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT p.*, i.codigo AS item_codigo, i.nombre AS item_nombre, i.unidad_medida
             FROM entregas_ferreteria_pendientes p
             JOIN items_ferreteria i ON i.id = p.item_ferreteria_id
             WHERE p.tecnico_id = ? AND p.estado = 'pendiente'
             ORDER BY p.creado_en ASC"
        );
        $stmt->execute([$tecnicoId]);
        return $stmt->fetchAll();
    }

    /** Para el admin — visibilidad de todo lo que está esperando confirmación, de cualquier técnico. */
    public function pendientesTodas(): array
    {
        return Database::connection()->query(
            "SELECT p.*, i.nombre AS item_nombre, i.unidad_medida, u.nombre AS tecnico_nombre
             FROM entregas_ferreteria_pendientes p
             JOIN items_ferreteria i ON i.id = p.item_ferreteria_id
             JOIN usuarios u ON u.id = p.tecnico_id
             WHERE p.estado = 'pendiente'
             ORDER BY p.creado_en ASC"
        )->fetchAll();
    }

    public function marcarResuelta(int $id, string $estado, ?string $observacionTecnico): void
    {
        $stmt = Database::connection()->prepare(
            'UPDATE entregas_ferreteria_pendientes SET estado = ?, observacion_tecnico = ?, resuelto_en = NOW() WHERE id = ?'
        );
        $stmt->execute([$estado, $observacionTecnico, $id]);
    }
}
