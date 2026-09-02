<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class KitServicioItemRepository
{
    /** Puede devolver un array vacío a propósito — p. ej. 'retiro' no tiene kit estándar. */
    public function paraTipoServicio(int $tipoServicioId): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT k.*, i.codigo AS item_codigo, i.nombre AS item_nombre, i.unidad_medida
             FROM kits_servicio_item k JOIN items_ferreteria i ON i.id = k.item_ferreteria_id
             WHERE k.tipo_servicio_id = ?"
        );
        $stmt->execute([$tipoServicioId]);
        return $stmt->fetchAll();
    }

    /**
     * Reemplaza el kit completo de un tipo de servicio. No versiona como el
     * tarifario a propósito: el kit es una plantilla de lo que se DEBERÍA
     * usar, no un monto ya cobrado — las órdenes ya enviadas guardan su
     * propio snapshot en orden_ferreteria y no dependen de esta tabla.
     */
    public function reemplazarKit(int $tipoServicioId, array $items): void
    {
        Database::connection()
            ->prepare('DELETE FROM kits_servicio_item WHERE tipo_servicio_id = ?')
            ->execute([$tipoServicioId]);
        $stmt = Database::connection()->prepare(
            'INSERT INTO kits_servicio_item (tipo_servicio_id, item_ferreteria_id, cantidad_estandar) VALUES (?, ?, ?)'
        );
        foreach ($items as $item) {
            $stmt->execute([$tipoServicioId, $item['item_ferreteria_id'], $item['cantidad_estandar']]);
        }
    }
}
