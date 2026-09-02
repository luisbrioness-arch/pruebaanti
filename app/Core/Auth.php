<?php

declare(strict_types=1);

namespace App\Core;

use App\Exceptions\ApiException;
use App\Exceptions\ForbiddenException;
use App\Repositories\IntentoLoginRepository;
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

    /** Intentos fallidos permitidos (por usuario y por IP) antes de bloquear. */
    private const MAX_INTENTOS = 8;
    /** Ventana en minutos sobre la que se cuentan esos intentos. */
    private const VENTANA_MINUTOS = 15;

    public static function attempt(string $usuario, string $password): array
    {
        $intentos = new IntentoLoginRepository();
        $ip = self::ip();

        // Sin esto, el login queda abierto a fuerza bruta: es el único
        // endpoint público del sistema y una contraseña débil se adivina en
        // minutos. Se cuenta por usuario Y por IP: lo primero frena el
        // ataque contra una cuenta concreta, lo segundo frena probar muchos
        // usuarios distintos desde el mismo origen.
        if ($intentos->fallidosRecientes($usuario, $ip, self::VENTANA_MINUTOS) >= self::MAX_INTENTOS) {
            throw new ApiException(
                'Demasiados intentos fallidos. Espera ' . self::VENTANA_MINUTOS . ' minutos e intenta de nuevo.',
                429,
                'demasiados_intentos'
            );
        }

        $repo = new UsuarioRepository();
        $user = $repo->findByUsuario($usuario);
        if (!$user || !(int) $user['activo'] || !password_verify($password, $user['password_hash'])) {
            $intentos->registrarFallido($usuario, $ip);
            throw new ApiException('Usuario o contraseña incorrectos', 401, 'credenciales_invalidas');
        }

        // Contra fijación de sesión: el id que traía el navegador antes de
        // autenticarse no debe seguir siendo válido después.
        session_regenerate_id(true);

        $intentos->limpiarDe($usuario, $ip);
        $_SESSION['usuario_id'] = (int) $user['id'];
        unset($user['password_hash']);
        return $user;
    }

    /** IP del cliente, tal como la ve el servidor (sin confiar en cabeceras de proxy que cualquiera puede falsear). */
    private static function ip(): string
    {
        return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
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
