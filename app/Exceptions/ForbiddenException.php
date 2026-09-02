<?php

declare(strict_types=1);

namespace App\Exceptions;

/**
 * El recurso existe pero no le pertenece a este técnico — un equipo que no
 * está en su maleta, una orden de otro, una venta ajena. No es un error de
 * formato (422): es una regla de propiedad/pertenencia (403).
 */
final class ForbiddenException extends ApiException
{
    public function __construct(string $message, array $extra = [])
    {
        parent::__construct($message, 403, 'prohibido', $extra);
    }
}
