<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;

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
}
