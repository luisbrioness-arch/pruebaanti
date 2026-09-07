<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Exceptions\ForbiddenException;
use App\Exceptions\NotFoundException;
use App\Exceptions\ValidationException;
use App\Repositories\UsuarioRepository;

final class AdminUsuarioController
{
    public function listar(Request $req): void
    {
        Auth::requireAdmin();
        Response::json(['usuarios' => (new UsuarioRepository())->todos()]);
    }

    /** Alta de técnicos (o admins) desde el panel */
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

    /** Edición de datos de usuario */
    public function actualizar(Request $req): void
    {
        Auth::requireAdmin();
        $id = (int) $req->param('id');
        $repo = new UsuarioRepository();
        $usuarioActual = $repo->find($id);
        if (!$usuarioActual) {
            throw new NotFoundException('Usuario no encontrado.');
        }

        $nombre = trim((string) $req->input('nombre', $usuarioActual['nombre']));
        $email = $req->input('email', $usuarioActual['email']);
        $rol = (string) $req->input('rol', $usuarioActual['rol']);
        $porcentaje = $req->input('porcentaje_reparto', $usuarioActual['porcentaje_reparto']);

        if ($nombre === '') {
            throw new ValidationException('El nombre no puede estar vacío.');
        }
        if (!in_array($rol, ['admin', 'tecnico'], true)) {
            throw new ValidationException('Rol inválido.');
        }
        $porcentaje = (float) $porcentaje;
        if ($porcentaje <= 0 || $porcentaje > 100) {
            throw new ValidationException('El porcentaje de reparto debe estar entre 1 y 100.');
        }

        // Si es el propio admin, evitar que se degrade a sí mismo de admin a técnico
        if ($id === Auth::id() && $rol !== 'admin') {
            throw new ForbiddenException('No puedes quitarte el rol de Administrador a ti mismo.');
        }

        $repo->actualizar($id, [
            'nombre' => $nombre,
            'email' => $email !== null && trim((string) $email) !== '' ? trim((string) $email) : null,
            'rol' => $rol,
            'porcentaje_reparto' => $porcentaje,
        ]);

        $actualizado = $repo->find($id);
        unset($actualizado['password_hash']);
        Response::json($actualizado);
    }

    /** Activar o desactivar cuenta */
    public function cambiarActivo(Request $req): void
    {
        Auth::requireAdmin();
        $id = (int) $req->param('id');
        $repo = new UsuarioRepository();
        $usuario = $repo->find($id);
        if (!$usuario) {
            throw new NotFoundException('Usuario no encontrado.');
        }

        // Evitar que el admin se desactive a sí mismo
        if ($id === Auth::id()) {
            throw new ForbiddenException('No puedes desactivar tu propia cuenta de administrador.');
        }

        $activo = (int) (bool) $req->input('activo', !(bool) $usuario['activo']);
        $repo->actualizar($id, ['activo' => $activo]);

        $actualizado = $repo->find($id);
        unset($actualizado['password_hash']);
        Response::json($actualizado);
    }

    /** Restablecer contraseña desde el panel admin */
    public function cambiarPassword(Request $req): void
    {
        Auth::requireAdmin();
        $id = (int) $req->param('id');
        $repo = new UsuarioRepository();
        $usuario = $repo->find($id);
        if (!$usuario) {
            throw new NotFoundException('Usuario no encontrado.');
        }

        $password = (string) $req->input('password', '');
        if (strlen($password) < 8) {
            throw new ValidationException('La contraseña debe tener al menos 8 caracteres.');
        }

        $repo->actualizar($id, [
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        ]);

        Response::json(['ok' => true, 'mensaje' => 'Contraseña actualizada correctamente.']);
    }
}
