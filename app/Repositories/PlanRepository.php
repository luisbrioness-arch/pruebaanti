<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class PlanRepository
{
    public function porCodigo(string $codigo): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM planes WHERE codigo = ? AND activo = 1');
        $stmt->execute([$codigo]);
        return $stmt->fetch() ?: null;
    }

    /** Para el selector del formulario de venta — el técnico elige por nombre, no de memoria el código. */
    public function activos(): array
    {
        return Database::connection()
            ->query('SELECT id, codigo, nombre FROM planes WHERE activo = 1 ORDER BY nombre')
            ->fetchAll();
    }

    public function existeCodigo(string $codigo): bool
    {
        $stmt = Database::connection()->prepare('SELECT 1 FROM planes WHERE codigo = ? LIMIT 1');
        $stmt->execute([$codigo]);
        return (bool) $stmt->fetchColumn();
    }

    public function crear(string $codigo, string $nombre): int
    {
        $stmt = Database::connection()->prepare('INSERT INTO planes (codigo, nombre) VALUES (?, ?)');
        $stmt->execute([$codigo, $nombre]);
        return (int) Database::connection()->lastInsertId();
    }

    /**
     * A diferencia de porCodigo(), no filtra por activo — hace falta para
     * poder encontrar (y reactivar) un plan que ya está desactivado.
     */
    public function porCodigoCualquiera(string $codigo): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM planes WHERE codigo = ?');
        $stmt->execute([$codigo]);
        return $stmt->fetch() ?: null;
    }

    /**
     * "Borrar" un plan (pedido: "falta opcion de borrar planes") es en
     * realidad desactivarlo — un DELETE de verdad chocaría contra
     * comisiones_plan/tarifas_instalacion_plan (todo plan tiene al menos
     * una fila ahí) y contra ventas.plan_id si alguna vez se usó, mismo
     * criterio que usuarios.activo para no perder plata/historia real. Un
     * plan desactivado desaparece del selector de "Registrar venta" del
     * técnico (ver PlanRepository::activos()) pero sigue intacto en
     * Tarifario y en cualquier venta/orden vieja que ya lo haya usado.
     */
    public function cambiarActivo(int $id, bool $activo): void
    {
        $stmt = Database::connection()->prepare('UPDATE planes SET activo = ? WHERE id = ?');
        $stmt->execute([$activo ? 1 : 0, $id]);
    }

    /**
     * Pedido: "un boton de editar que deje editar todos los campos ya sea
     * nombre y valor". `codigo` nunca cambia acá (es lo que usa
     * "Registrar venta" del técnico y las órdenes/ventas ya guardadas).
     */
    public function actualizarNombre(int $id, string $nombre): void
    {
        Database::connection()->prepare('UPDATE planes SET nombre = ? WHERE id = ?')->execute([$nombre, $id]);
    }
}
