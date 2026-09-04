<?php
// Script temporal — agrega 'perdido' al ENUM de movimientos_equipo.tipo_movimiento
// (equipos.estado ya tenía 'perdido' desde el diseño original, pero el
// movimiento que lo registra nunca se agregó). MODIFY COLUMN es
// idempotente: correrlo dos veces no rompe nada.
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Core\Database;

header('Content-Type: text/plain; charset=utf-8');

Database::connection()->exec(
    "ALTER TABLE movimientos_equipo
        MODIFY COLUMN tipo_movimiento ENUM(
            'ingreso_bodega',
            'asignacion_maleta',
            'traspaso',
            'traspaso_pendiente',
            'traspaso_rechazado',
            'traspaso_cancelado',
            'instalacion',
            'retiro',
            'falla_fabrica',
            'devolucion_tuves',
            'perdido',
            'ajuste_descuadre'
        ) NOT NULL"
);

echo "OK — 'perdido' agregado al ENUM de movimientos_equipo.tipo_movimiento.\n";
