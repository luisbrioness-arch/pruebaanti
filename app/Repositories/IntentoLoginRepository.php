<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

/**
 * Registro de intentos fallidos de login, para frenar fuerza bruta contra
 * el único endpoint público del sistema (ver App\Core\Auth::attempt).
 * Solo se guardan los FALLIDOS: un login exitoso borra los del usuario/IP,
 * así que la tabla se mantiene chica sola.
 */
final class IntentoLoginRepository
{
    public function fallidosRecientes(string $usuario, string $ip, int $minutos): int
    {
        // El corte se calcula en PHP y se manda como fecha normal: `INTERVAL
        // ? MINUTE` con un placeholder no es portable entre versiones/motores.
        $desde = date('Y-m-d H:i:s', time() - ($minutos * 60));
        $stmt = Database::connection()->prepare(
            'SELECT COUNT(*) FROM intentos_login
             WHERE (usuario = ? OR ip = ?) AND creado_en >= ?'
        );
        $stmt->execute([$usuario, $ip, $desde]);
        return (int) $stmt->fetchColumn();
    }

    public function registrarFallido(string $usuario, string $ip): void
    {
        Database::connection()
            ->prepare('INSERT INTO intentos_login (usuario, ip) VALUES (?, ?)')
            ->execute([mb_substr($usuario, 0, 100), $ip]);
    }

    public function limpiarDe(string $usuario, string $ip): void
    {
        Database::connection()
            ->prepare('DELETE FROM intentos_login WHERE usuario = ? OR ip = ?')
            ->execute([$usuario, $ip]);
    }
}
