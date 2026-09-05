<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Exceptions\ValidationException;
use App\Repositories\UsuarioRepository;

final class AuthController
{
    public function login(Request $req): void
    {
        $usuario = (string) $req->input('usuario', '');
        $password = (string) $req->input('password', '');
        $user = Auth::attempt($usuario, $password);
        Response::json(['usuario' => $user]);
    }

    public function logout(Request $req): void
    {
        Auth::logout();
        Response::json(['ok' => true]);
    }

    public function yo(Request $req): void
    {
        Response::json(['usuario' => Auth::user()]);
    }

    /**
     * "Ajustes" — pedido: "crea un boton de ajustes con ajustes basicos
     * como cambiar nombre cambiar clave y cosas del perfil". Cualquier
     * usuario logueado edita SU PROPIO perfil (Auth::id(), no un id del
     * request) — nombre y/o contraseña, ambos opcionales pero al menos uno
     * tiene que venir. Cambiar la contraseña exige la actual, igual que
     * cualquier "cambiar clave" — si alguien deja la sesión abierta, no
     * alcanza con tener acceso al panel para robarle la cuenta.
     */
    public function actualizarPerfil(Request $req): void
    {
        $usuarioId = Auth::id();
        $repo = new UsuarioRepository();
        $usuario = $repo->find($usuarioId);

        $nombre = $req->input('nombre');
        $passwordActual = (string) $req->input('password_actual', '');
        $passwordNueva = $req->input('password_nueva');

        $campos = [];
        if ($nombre !== null && trim((string) $nombre) !== '') {
            $campos['nombre'] = trim((string) $nombre);
        }
        if ($passwordNueva !== null && $passwordNueva !== '') {
            if (!password_verify($passwordActual, $usuario['password_hash'])) {
                throw new ValidationException('La contraseña actual no es correcta.');
            }
            if (strlen((string) $passwordNueva) < 8) {
                throw new ValidationException('La contraseña nueva debe tener al menos 8 caracteres.');
            }
            $campos['password_hash'] = password_hash((string) $passwordNueva, PASSWORD_DEFAULT);
        }
        if (!$campos) {
            throw new ValidationException('No hay ningún cambio para guardar.');
        }

        $repo->actualizar($usuarioId, $campos);
        $actualizado = $repo->find($usuarioId);
        unset($actualizado['password_hash']);
        Response::json(['usuario' => $actualizado]);
    }
}
