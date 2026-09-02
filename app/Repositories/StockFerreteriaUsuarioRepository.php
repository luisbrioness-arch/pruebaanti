<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class StockFerreteriaUsuarioRepository
{
    /**
     * Suma (o resta, si $delta es negativo) al stock teórico del técnico.
     * Si la fila no existe todavía la crea en el mismo movimiento — un
     * técnico nuevo no debería fallar por no tener una fila en 0 precreada.
     *
     * FOR UPDATE asume que esto se llama dentro de Database::transaction();
     * evita que dos envíos simultáneos del mismo técnico pisen el cálculo.
     */
    public function ajustar(int $usuarioId, int $itemFerreteriaId, float $delta): void
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT id FROM stock_ferreteria_usuario WHERE usuario_id = ? AND item_ferreteria_id = ? FOR UPDATE'
        );
        $stmt->execute([$usuarioId, $itemFerreteriaId]);
        $fila = $stmt->fetch();

        if ($fila) {
            $pdo->prepare('UPDATE stock_ferreteria_usuario SET cantidad_actual = cantidad_actual + ? WHERE id = ?')
                ->execute([$delta, $fila['id']]);
            return;
        }
        $pdo->prepare(
            'INSERT INTO stock_ferreteria_usuario (usuario_id, item_ferreteria_id, cantidad_actual) VALUES (?, ?, ?)'
        )->execute([$usuarioId, $itemFerreteriaId, $delta]);
    }

    /** Sin $usuarioId: el stock de ferretería de todos los técnicos, para el panel admin. */
    public function listar(?int $usuarioId): array
    {
        $sql = "SELECT s.*, u.nombre AS tecnico_nombre, i.codigo AS item_codigo, i.nombre AS item_nombre, i.unidad_medida
                FROM stock_ferreteria_usuario s
                JOIN usuarios u ON u.id = s.usuario_id
                JOIN items_ferreteria i ON i.id = s.item_ferreteria_id
                WHERE 1=1";
        $params = [];
        if ($usuarioId !== null) {
            $sql .= ' AND s.usuario_id = :usuario_id';
            $params['usuario_id'] = $usuarioId;
        }
        $sql .= ' ORDER BY u.nombre, i.nombre';
        $stmt = Database::connection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
}
