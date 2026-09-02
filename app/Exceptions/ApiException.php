<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

/**
 * Excepción con forma HTTP incluida. El front controller la atrapa y la
 * convierte 1:1 en la respuesta JSON — así cada servicio lanza el error con
 * el código exacto que el celular necesita para decidir qué pantalla mostrar
 * (ver docs/wizard-api.md), sin que el controller tenga que traducir nada.
 */
class ApiException extends RuntimeException
{
    private int $status;
    private string $errorCode;
    private array $extra;

    public function __construct(string $message, int $status = 400, string $errorCode = 'error', array $extra = [])
    {
        parent::__construct($message);
        $this->status = $status;
        $this->errorCode = $errorCode;
        $this->extra = $extra;
    }

    public function status(): int
    {
        return $this->status;
    }

    public function code(): string
    {
        return $this->errorCode;
    }

    public function extra(): array
    {
        return $this->extra;
    }
}
