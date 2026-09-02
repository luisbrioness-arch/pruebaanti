<?php

declare(strict_types=1);

// Falla clara y temprana en vez de un error de sintaxis críptico en algún
// archivo que use match/argumentos con nombre — esto de acá es deliberadamente
// código viejo-compatible (nada de str_starts_with ni sintaxis 8.0+) para que
// el propio chequeo corra incluso en un hosting con PHP más viejo.
const PHP_MINIMO = '8.1.0';
if (version_compare(PHP_VERSION, PHP_MINIMO, '<')) {
    http_response_code(500);
    die(
        'Este sistema requiere PHP ' . PHP_MINIMO . ' o superior (versión activa: ' . PHP_VERSION . '). '
        . 'Cambia la versión en el selector de PHP del hosting para este (sub)dominio.'
    );
}

// Autoload propio, sin Composer — el hosting compartido no siempre lo tiene
// disponible y para una app de este tamaño un mapeo PSR-4 a mano alcanza.
spl_autoload_register(function (string $class): void {
    $prefix = 'App\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = substr($class, strlen($prefix));
    $path = dirname(__DIR__) . '/app/' . str_replace('\\', '/', $relative) . '.php';
    if (is_file($path)) {
        require $path;
    }
});

$config = require dirname(__DIR__) . '/config/config.php';
date_default_timezone_set($config['app']['timezone'] ?? 'America/Santiago');
