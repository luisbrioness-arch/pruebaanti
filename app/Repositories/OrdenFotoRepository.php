<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class OrdenFotoRepository
{
    public function paraOrden(int $ordenId): array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM orden_fotos WHERE orden_id = ?');
        $stmt->execute([$ordenId]);
        return $stmt->fetchAll();
    }

    public function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM orden_fotos WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function crear(array $datos): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO orden_fotos
                (orden_id, tipo, equipo_id, ruta_archivo, tamano_bytes, latitud, longitud, tomada_en, subida_en)
             VALUES
                (:orden_id, :tipo, :equipo_id, :ruta_archivo, :tamano_bytes, :latitud, :longitud, :tomada_en, :subida_en)'
        );
        $stmt->execute($datos);
        return (int) Database::connection()->lastInsertId();
    }

    /**
     * Borra cualquier OTRA foto del mismo slot (mismo tipo + mismo equipo,
     * o mismo tipo sin equipo para los slots fijos). Se llama DESPUÉS de
     * insertar la foto nueva, nunca antes — así, si algo falla a mitad de
     * camino, la orden se queda con una foto de más en vez de sin ninguna.
     *
     * 'adicional' nunca se toca: ahí sí se permiten varias fotos por orden.
     */
    public function eliminarOtrasEnSlot(int $ordenId, string $tipo, ?int $equipoId, int $exceptoId): void
    {
        if ($tipo === 'adicional') {
            return;
        }
        if ($equipoId === null) {
            $stmt = Database::connection()->prepare(
                'DELETE FROM orden_fotos WHERE orden_id = ? AND tipo = ? AND equipo_id IS NULL AND id != ?'
            );
            $stmt->execute([$ordenId, $tipo, $exceptoId]);
            return;
        }
        $stmt = Database::connection()->prepare(
            'DELETE FROM orden_fotos WHERE orden_id = ? AND tipo = ? AND equipo_id = ? AND id != ?'
        );
        $stmt->execute([$ordenId, $tipo, $equipoId, $exceptoId]);
    }
}
