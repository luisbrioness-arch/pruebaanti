<?php
// Script temporal — pedido: "casilla en el registro de venta del tecnico"
// para una venta directa de TuVes sin vendedor interno. Hace nullable
// ventas.vendedor_id (hoy NOT NULL) — el FK existente (fk_venta_vendedor)
// no necesita tocarse: MySQL permite NULL en una columna con FK sin
// problema, solo deja de validarse contra usuarios cuando el valor es NULL.
// Idempotente: MODIFY COLUMN corrido dos veces no rompe nada.
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Core\Database;

header('Content-Type: text/plain; charset=utf-8');

Database::connection()->exec(
    'ALTER TABLE ventas MODIFY COLUMN vendedor_id INT UNSIGNED NULL'
);

echo "OK — ventas.vendedor_id ahora acepta NULL.\n";
