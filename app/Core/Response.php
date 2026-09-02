<?php

declare(strict_types=1);

namespace App\Core;

final class Response
{
    public static function json($data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /**
     * Envía un archivo binario tal cual (fotos de órdenes — ver
     * FotoController). El nombre del archivo lo decide FotoUploadService al
     * subir (hash aleatorio), nunca el nombre original del cliente.
     */
    public static function archivo(string $rutaAbsoluta, string $mime): void
    {
        http_response_code(200);
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . (string) filesize($rutaAbsoluta));
        // Inmutable: el mismo id de foto nunca cambia de contenido una vez subida.
        header('Cache-Control: private, max-age=31536000, immutable');
        header('X-Content-Type-Options: nosniff');
        readfile($rutaAbsoluta);
    }

    /**
     * Forma fija de error: { error: true, code, message, ...extra }.
     * El celular decide qué pantalla mostrar mirando "code", no "message"
     * (message es para logs/debug humano, code es el contrato con el cliente).
     */
    public static function error(string $message, int $status = 400, string $code = 'error', array $extra = []): void
    {
        self::json(array_merge([
            'error' => true,
            'code' => $code,
            'message' => $message,
        ], $extra), $status);
    }
}
