<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Exceptions\ForbiddenException;
use App\Exceptions\NotFoundException;
use App\Repositories\OrdenFotoRepository;
use App\Repositories\OrdenRepository;

/**
 * Sirve el archivo de una foto de orden. 'storage/fotos' vive deliberadamente
 * fuera de /public (ver config/config.example.php: son fotos con GPS
 * implícito, no deben quedar servibles sin control) — este es el único
 * camino autorizado para verlas, tanto desde el wizard del técnico como
 * desde el lightbox de auditoría del panel admin.
 */
final class FotoController
{
    public function servir(Request $req): void
    {
        $foto = (new OrdenFotoRepository())->find((int) $req->param('id'));
        if (!$foto) {
            throw new NotFoundException('Foto no encontrada.');
        }

        $orden = (new OrdenRepository())->find((int) $foto['orden_id']);
        $usuario = Auth::user();
        if (!$orden || ($usuario['rol'] !== 'admin' && (int) $orden['tecnico_id'] !== (int) $usuario['id'])) {
            throw new ForbiddenException('No tienes acceso a esta foto.');
        }

        $config = require dirname(__DIR__, 2) . '/config/config.php';
        // ruta_archivo se guarda como "fotos/2026/08/xxxx.jpg", relativa a
        // storage/ (no a storage/fotos/) — ver FotoUploadService::guardar().
        $raizStorage = dirname(rtrim($config['storage']['fotos_path'], '/'));
        $absoluta = $raizStorage . '/' . ltrim($foto['ruta_archivo'], '/');

        $raizReal = realpath($raizStorage);
        $absolutaReal = realpath($absoluta);
        if ($absolutaReal === false || $raizReal === false || !str_starts_with($absolutaReal, $raizReal)) {
            throw new NotFoundException('Foto no encontrada.');
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $absolutaReal) ?: 'application/octet-stream';
        finfo_close($finfo);

        Response::archivo($absolutaReal, $mime);
    }
}
