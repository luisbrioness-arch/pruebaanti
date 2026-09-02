<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\ValidationException;
use App\Repositories\OrdenFotoRepository;
use RuntimeException;

/**
 * Guarda el archivo en disco (fuera del webroot) y deja la fila en
 * orden_fotos. 'subida_en' es el campo que el celular consulta para saber
 * si ya puede borrar su copia local — por eso solo se llena cuando el
 * archivo YA quedó físicamente guardado, nunca antes.
 */
final class FotoUploadService
{
    // Margen sobre los 300kb objetivo de Compressor.js en el cliente. Si
    // llega más pesado que esto, algo falló en la compresión del celular —
    // mejor avisar ahora que dejar pasar fotos gigantes a un hosting con
    // 50GB de cupo total.
    private const MAX_BYTES = 400000;

    private const MIME_PERMITIDOS = ['image/jpeg', 'image/webp', 'image/png'];

    public function guardar(array $archivo, array $meta): array
    {
        $this->validarArchivo($archivo);

        $config = require dirname(__DIR__, 2) . '/config/config.php';
        $carpetaBase = rtrim($config['storage']['fotos_path'], '/');
        $subcarpeta = date('Y') . '/' . date('m');
        $carpetaDestino = $carpetaBase . '/' . $subcarpeta;

        if (!is_dir($carpetaDestino) && !mkdir($carpetaDestino, 0755, true) && !is_dir($carpetaDestino)) {
            throw new RuntimeException('No se pudo crear el directorio de almacenamiento de fotos.');
        }

        $mime = $this->mimeReal($archivo['tmp_name']);
        $extension = match ($mime) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg',
        };
        $nombreArchivo = bin2hex(random_bytes(16)) . '.' . $extension;
        $rutaAbsoluta = $carpetaDestino . '/' . $nombreArchivo;
        $rutaRelativa = 'fotos/' . $subcarpeta . '/' . $nombreArchivo;

        if (!move_uploaded_file($archivo['tmp_name'], $rutaAbsoluta)) {
            throw new RuntimeException('No se pudo guardar la foto en el servidor.');
        }

        $id = (new OrdenFotoRepository())->crear([
            'orden_id' => $meta['orden_id'],
            'tipo' => $meta['tipo'],
            'equipo_id' => $meta['equipo_id'],
            'ruta_archivo' => $rutaRelativa,
            'tamano_bytes' => (int) $archivo['size'],
            'latitud' => $meta['latitud'] !== null && $meta['latitud'] !== '' ? (float) $meta['latitud'] : null,
            'longitud' => $meta['longitud'] !== null && $meta['longitud'] !== '' ? (float) $meta['longitud'] : null,
            'tomada_en' => $meta['tomada_en'],
            'subida_en' => date('Y-m-d H:i:s'),
        ]);

        // Recién ahora, con la foto nueva ya insertada, se limpia cualquier
        // foto previa del mismo slot (una repetición/retake del técnico).
        // El orden importa: si esto fallara, queda una foto de más, nunca cero.
        (new OrdenFotoRepository())->eliminarOtrasEnSlot((int) $meta['orden_id'], $meta['tipo'], $meta['equipo_id'], $id);

        return ['id' => $id, 'ruta' => $rutaRelativa, 'tamano_bytes' => (int) $archivo['size']];
    }

    private function validarArchivo(array $archivo): void
    {
        if (!isset($archivo['tmp_name'], $archivo['error']) || !is_uploaded_file($archivo['tmp_name'])) {
            throw new ValidationException('No se recibió ningún archivo de foto.');
        }
        if ($archivo['error'] !== UPLOAD_ERR_OK) {
            throw new ValidationException('Error al subir la foto (código ' . $archivo['error'] . ').');
        }
        if ((int) $archivo['size'] > self::MAX_BYTES) {
            $kb = round($archivo['size'] / 1000);
            throw new ValidationException("La foto pesa {$kb}KB — revisa la compresión en el celular antes de reintentar.");
        }
        $mime = $this->mimeReal($archivo['tmp_name']);
        if (!in_array($mime, self::MIME_PERMITIDOS, true)) {
            throw new ValidationException('Formato de imagen no permitido: ' . $mime);
        }
    }

    /** Nunca confiar en la extensión del archivo ni en el content-type que manda el cliente. */
    private function mimeReal(string $rutaTemporal): string
    {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $rutaTemporal) ?: 'application/octet-stream';
        finfo_close($finfo);
        return $mime;
    }
}
