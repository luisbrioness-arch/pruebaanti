<?php

declare(strict_types=1);

namespace App\Core;

use App\Exceptions\ApiException;
use App\Exceptions\ForbiddenException;
use App\Repositories\UsuarioRepository;

/**
 * Autenticación por sesión PHP — no JWT, no OAuth. Es una app interna de
 * la contratista, servida desde un único subdominio propio; una cookie de
 * sesión de toda la vida resuelve esto sin capas extra.
 */
final class Auth
{
    public static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            // 'secure' exige HTTPS. El subdominio de producción lo tiene;
            // si se prueba en local por http, cambiar esto a false ahí.
            'secure' => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_name('terreno_dth_sesion');
        session_start();
    }

    public static function attempt(string $usuario, string $password): array
    {
        $repo = new UsuarioRepository();
        $user = $repo->findByUsuario($usuario);
        if (!$user || !(int) $user['activo'] || !password_verify($password, $user['password_hash'])) {
            throw new ApiException('Usuario o contraseña incorrectos', 401, 'credenciales_invalidas');
        }
        $_SESSION['usuario_id'] = (int) $user['id'];
        unset($user['password_hash']);
        return $user;
    }

    public static function logout(): void
    {
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
    }

    /** Id del usuario autenticado. Lanza 401 si no hay sesión. */
    public static function id(): int
    {
        if (empty($_SESSION['usuario_id'])) {
            throw new ApiException('No autenticado', 401, 'no_autenticado');
        }
        return (int) $_SESSION['usuario_id'];
    }

    public static function user(): array
    {
        $repo = new UsuarioRepository();
        $user = $repo->find(self::id());
        if (!$user) {
            throw new ApiException('Sesión inválida', 401, 'no_autenticado');
        }
        unset($user['password_hash']);
        return $user;
    }

    /** Para las rutas /api/admin/*. Edwin hoy, y quien más tenga rol admin después. */
    public static function requireAdmin(): array
    {
        $user = self::user();
        if ($user['rol'] !== 'admin') {
            throw new ForbiddenException('Esta acción requiere permisos de administrador.');
        }
        return $user;
    }
}
