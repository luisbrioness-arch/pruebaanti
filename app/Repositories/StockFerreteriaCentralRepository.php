<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

/** Stock real de ferretería en una bodega física — mismo patrón que StockFerreteriaUsuarioRepository. */
final class StockFerreteriaCentralRepository
{
    /** Suma o resta (delta negativo) al stock. Igual que la versión por técnico: usar dentro de una transacción. */
    public function ajustar(int $bodegaId, int $itemFerreteriaId, float $delta): void
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT id FROM stock_ferreteria_central WHERE bodega_id = ? AND item_ferreteria_id = ? FOR UPDATE'
        );
        $stmt->execute([$bodegaId, $itemFerreteriaId]);
        $fila = $stmt->fetch();

        if ($fila) {
            $pdo->prepare('UPDATE stock_ferreteria_central SET cantidad_actual = cantidad_actual + ? WHERE id = ?')
                ->execute([$delta, $fila['id']]);
            return;
        }
        $pdo->prepare(
            'INSERT INTO stock_ferreteria_central (bodega_id, item_ferreteria_id, cantidad_actual) VALUES (?, ?, ?)'
        )->execute([$bodegaId, $itemFerreteriaId, $delta]);
    }

    /**
     * Descuenta SOLO si alcanza — para reservar stock al crear una entrega
     * pendiente (ver BodegaService::entregarFerreteria). Bloquea la fila
     * (o su ausencia) para que dos entregas casi simultáneas del mismo ítem
     * no descuenten sobre un stock que la otra ya se llevó.
     */
    public function debitarSiAlcanza(int $bodegaId, int $itemFerreteriaId, float $cantidad): bool
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT id, cantidad_actual FROM stock_ferreteria_central WHERE bodega_id = ? AND item_ferreteria_id = ? FOR UPDATE'
        );
        $stmt->execute([$bodegaId, $itemFerreteriaId]);
        $fila = $stmt->fetch();
        $actual = $fila ? (float) $fila['cantidad_actual'] : 0.0;
        if ($actual < $cantidad) {
            return false;
        }
        if ($fila) {
            $pdo->prepare('UPDATE stock_ferreteria_central SET cantidad_actual = cantidad_actual - ? WHERE id = ?')
                ->execute([$cantidad, $fila['id']]);
        }
        return true;
    }

    public function listar(?int $bodegaId): array
    {
        $sql = "SELECT s.*, b.nombre AS bodega_nombre, i.codigo AS item_codigo, i.nombre AS item_nombre, i.unidad_medida
                FROM stock_ferreteria_central s
                JOIN bodegas b ON b.id = s.bodega_id
                JOIN items_ferreteria i ON i.id = s.item_ferreteria_id
                WHERE 1=1";
        $params = [];
        if ($bodegaId !== null) {
            $sql .= ' AND s.bodega_id = :bodega_id';
            $params['bodega_id'] = $bodegaId;
        }
        $sql .= ' ORDER BY b.nombre, i.nombre';
        $stmt = Database::connection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
}
