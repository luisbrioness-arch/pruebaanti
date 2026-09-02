<?php

declare(strict_types=1);

namespace App\Exceptions;

/** Datos de entrada inválidos o incompletos — el técnico puede corregirlos y reintentar. */
final class ValidationException extends ApiException
{
    public function __construct(string $message, array $extra = [])
    {
        parent::__construct($message, 422, 'validacion', $extra);
    }
}
