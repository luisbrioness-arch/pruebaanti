<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class OrdenFerreteriaRepository
{
    /** Con nombre/código del ítem ya resueltos — el detalle de auditoría los necesita, no solo el id. */
    public function paraOrden(int $ordenId): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT ordf.*, i.codigo AS item_codigo, i.nombre AS item_nombre, i.unidad_medida
             FROM orden_ferreteria ordf
             JOIN items_ferreteria i ON i.id = ordf.item_ferreteria_id
             WHERE ordf.orden_id = ?"
        );
        $stmt->execute([$ordenId]);
        return $stmt->fetchAll();
    }

    public function agregar(int $ordenId, int $itemFerreteriaId, float $cantidadEstandar, float $cantidadFinal, bool $ajustadoManualmente): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO orden_ferreteria (orden_id, item_ferreteria_id, cantidad_estandar, cantidad_final, ajustado_manualmente)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$ordenId, $itemFerreteriaId, $cantidadEstandar, $cantidadFinal, $ajustadoManualmente ? 1 : 0]);
        return (int) Database::connection()->lastInsertId();
    }

    /** El paso 4 se manda completo desde el celular — reemplazar todo es más simple y seguro que hacer un diff. */
    public function eliminarDeOrden(int $ordenId): void
    {
        Database::connection()->prepare('DELETE FROM orden_ferreteria WHERE orden_id = ?')->execute([$ordenId]);
    }
}
