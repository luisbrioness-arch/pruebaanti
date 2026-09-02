<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

/**
 * Mismo patrón que MovimientoEquipoRepository/MovimientoFerreteriaRepository:
 * esta tabla es la única fuente de verdad, nunca se guarda un "saldo"
 * mutable aparte — se calcula sumando (ver saldoDe/saldosDeTodos).
 */
final class MovimientoBilleteraRepository
{
    public function crear(array $datos): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO movimientos_billetera
                (tecnico_id, tipo_movimiento, monto, periodo_liquidacion_id, observacion, creado_por)
             VALUES
                (:tecnico_id, :tipo_movimiento, :monto, :periodo_liquidacion_id, :observacion, :creado_por)'
        );
        $stmt->execute($datos);
        return (int) Database::connection()->lastInsertId();
    }

    /** Historial de movimientos de un técnico, más reciente primero. */
    public function listarPorTecnico(int $tecnicoId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT m.*, u.nombre AS creado_por_nombre
             FROM movimientos_billetera m
             JOIN usuarios u ON u.id = m.creado_por
             WHERE m.tecnico_id = ?
             ORDER BY m.creado_en DESC, m.id DESC'
        );
        $stmt->execute([$tecnicoId]);
        return $stmt->fetchAll();
    }

    public function saldoDe(int $tecnicoId): float
    {
        $stmt = Database::connection()->prepare(
            'SELECT COALESCE(SUM(monto), 0) AS saldo FROM movimientos_billetera WHERE tecnico_id = ?'
        );
        $stmt->execute([$tecnicoId]);
        return (float) $stmt->fetchColumn();
    }

    /** Saldo de cada técnico que tiene al menos un movimiento — para el resumen general del admin. */
    public function saldosDeTodos(): array
    {
        return Database::connection()->query(
            "SELECT u.id AS tecnico_id, u.nombre AS tecnico_nombre, COALESCE(SUM(m.monto), 0) AS saldo
             FROM usuarios u
             JOIN movimientos_billetera m ON m.tecnico_id = u.id
             GROUP BY u.id, u.nombre
             ORDER BY u.nombre"
        )->fetchAll();
    }
}
