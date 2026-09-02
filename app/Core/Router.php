<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Router mínimo por regex — suficiente para ~15 endpoints. No resuelve
 * middlewares ni grupos; si la API crece mucho más, vale la pena revisar,
 * pero para el wizard de Fase 1 agregar eso sería complejidad sin uso.
 */
final class Router
{
    /** @var array<int, array{method:string, regex:string, handler:callable}> */
    private array $routes = [];

    public function get(string $pattern, callable $handler): void
    {
        $this->add('GET', $pattern, $handler);
    }

    public function post(string $pattern, callable $handler): void
    {
        $this->add('POST', $pattern, $handler);
    }

    public function put(string $pattern, callable $handler): void
    {
        $this->add('PUT', $pattern, $handler);
    }

    public function patch(string $pattern, callable $handler): void
    {
        $this->add('PATCH', $pattern, $handler);
    }

    public function delete(string $pattern, callable $handler): void
    {
        $this->add('DELETE', $pattern, $handler);
    }

    private function add(string $method, string $pattern, callable $handler): void
    {
        $regex = preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern);
        $this->routes[] = [
            'method' => $method,
            'regex' => '#^' . $regex . '$#',
            'handler' => $handler,
        ];
    }

    public function dispatch(Request $request): void
    {
        $method = $request->method();
        $path = $request->path();

        $metodosPermitidos = [];
        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $path, $matches)) {
                continue;
            }
            $metodosPermitidos[] = $route['method'];
            if ($route['method'] !== $method) {
                continue;
            }
            $request->params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
            ($route['handler'])($request);
            return;
        }

        if ($metodosPermitidos) {
            Response::error('Método no permitido en esta ruta', 405, 'metodo_no_permitido', [
                'permitidos' => array_values(array_unique($metodosPermitidos)),
            ]);
            return;
        }
        Response::error('Ruta no encontrada', 404, 'ruta_no_encontrada');
    }
}
