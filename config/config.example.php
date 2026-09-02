<?php

declare(strict_types=1);

// Credenciales reales del hosting — NO subir este archivo a un repositorio
// público. Copiar el patrón de config.example.php si se necesita otro entorno
// (ej. una base de datos de pruebas separada).

return [
    'db' => [
        'host' => '127.0.0.1',
        'name' => 'CAMBIAR_nombre_bd',
        'user' => 'CAMBIAR_usuario_bd',
        'pass' => 'CAMBIAR_password_bd',
        'charset' => 'utf8mb4',
    ],
    'storage' => [
        // Fuera de /public a propósito: son fotos de instalaciones (con GPS
        // implícito en muchos casos) y no deben quedar servibles sin control.
        'fotos_path' => dirname(__DIR__) . '/storage/fotos',
    ],
    'app' => [
        'timezone' => 'America/Santiago',
        // false en producción: nunca exponer trazas de error al cliente.
        'debug' => false,
    ],
];
