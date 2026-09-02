<?php

declare(strict_types=1);

namespace App\Exceptions;

/** El recurso pedido no existe — serie no registrada, orden no encontrada, etc. */
final class NotFoundException extends ApiException
{
    public function __construct(string $message)
    {
        parent::__construct($message, 404, 'no_encontrado');
    }
}
