<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Exceptions\ValidationException;
use App\Repositories\UsuarioRepository;

final class AdminUsuarioController
{
    public function listar(Request $req): void
    {
        Auth::requireAdmin();
        Response::json(['usuarios' => (new UsuarioRepository())->activos()]);
    }

    /** Alta de técnicos (o admins) desde el panel — ya no hace falta tocar la base a mano. */
    public function crear(Request $req): void
    {
        Auth::requireAdmin();
        $repo = new UsuarioRepository();

        $nombre = trim((string) $req->input('nombre', ''));
        $usuario = trim((string) $req->input('usuario', ''));
        $password = (string) $req->input('password', '');
        $email = $req->input('email');
        $rol = (string) $req->input('rol', 'tecnico');
        $porcentaje = $req->input('porcentaje_reparto', 100);

        if ($nombre === '') {
            throw new ValidationException('El nombre no puede estar vacío.');
        }
        if ($usuario === '' || !preg_match('/^[a-z0-9_.]+$/', $usuario)) {
            throw new ValidationException('El usuario debe tener solo minúsculas, números, punto o guion bajo.');
        }
        if ($repo->existeUsuario($usuario)) {
            throw new ValidationException('Ya existe un usuario con ese nombre de acceso.');
        }
        if (strlen($password) < 8) {
            throw new ValidationException('La contraseña debe tener al menos 8 caracteres.');
        }
        if (!in_array($rol, ['admin', 'tecnico'], true)) {
            throw new ValidationException('Rol inválido.');
        }
        $porcentaje = (float) $porcentaje;
        if ($porcentaje <= 0 || $porcentaje > 100) {
            throw new ValidationException('El porcentaje de reparto debe estar entre 1 y 100.');
        }

        $id = $repo->crear([
            'nombre' => $nombre,
            'usuario' => $usuario,
            'email' => $email !== null && trim((string) $email) !== '' ? trim((string) $email) : null,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'rol' => $rol,
            'porcentaje_reparto' => $porcentaje,
        ]);

        $creado = $repo->find($id);
        unset($creado['password_hash']);
        Response::json($creado, 201);
    }
}
