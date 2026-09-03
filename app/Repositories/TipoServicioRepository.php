<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class TipoServicioRepository
{
    public function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM tipos_servicio WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function findByCodigo(string $codigo): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM tipos_servicio WHERE codigo = ? AND activo = 1');
        $stmt->execute([$codigo]);
        return $stmt->fetch() ?: null;
    }

    public function all(): array
    {
        return Database::connection()
            ->query('SELECT * FROM tipos_servicio WHERE activo = 1 ORDER BY orden_visualizacion')
            ->fetchAll();
    }

    public function requisitosFoto(int $tipoServicioId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM tipos_servicio_foto_requisito WHERE tipo_servicio_id = ? ORDER BY orden_visualizacion'
        );
        $stmt->execute([$tipoServicioId]);
        return $stmt->fetchAll();
    }

    /**
     * Pedido: "un boton de editar que deje editar todos los campos ya sea
     * nombre y valor". El nombre es solo la etiqueta que ve el técnico/admin
     * — `codigo` (lo que usa el código de negocio, ej. 'instalacion_nueva')
     * nunca cambia acá.
     */
    public function actualizarNombre(int $id, string $nombre): void
    {
        Database::connection()->prepare('UPDATE tipos_servicio SET nombre = ? WHERE id = ?')->execute([$nombre, $id]);
    }
}
