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
}
