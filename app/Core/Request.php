<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Envoltorio único sobre $_GET/$_POST/php://input/$_FILES. El wizard manda
 * JSON en los pasos normales y multipart/form-data cuando sube una foto —
 * esta clase resuelve la diferencia una sola vez, para que los controllers
 * no tengan que preguntarse de dónde viene cada dato.
 */
final class Request
{
    private array $json = [];

    /** Parámetros de ruta ({uuid}, {equipoId}, ...) — los llena el Router. */
    public array $params = [];

    public function __construct()
    {
        $raw = file_get_contents('php://input');
        if ($raw !== false && $raw !== '' && str_starts_with($this->contentType(), 'application/json')) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $this->json = $decoded;
            }
        }
    }

    public function contentType(): string
    {
        return $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
    }

    public function method(): string
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        // Algunos clientes/proxies no dejan mandar PATCH o DELETE nativos.
        if ($method === 'POST' && isset($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
            return strtoupper($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);
        }
        return $method;
    }

    public function path(): string
    {
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH) ?? '/';
        return $path === '/' ? '/' : rtrim($path, '/');
    }

    /** Busca en JSON, luego POST, luego GET — en ese orden de prioridad. */
    public function input(string $key, $default = null)
    {
        if (array_key_exists($key, $this->json)) {
            return $this->json[$key];
        }
        if (array_key_exists($key, $_POST)) {
            return $_POST[$key];
        }
        if (array_key_exists($key, $_GET)) {
            return $_GET[$key];
        }
        return $default;
    }

    public function all(): array
    {
        return array_merge($_GET, $_POST, $this->json);
    }

    public function file(string $key): ?array
    {
        return $_FILES[$key] ?? null;
    }

    public function param(string $key, $default = null)
    {
        return $this->params[$key] ?? $default;
    }
}
