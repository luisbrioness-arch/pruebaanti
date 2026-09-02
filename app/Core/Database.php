<?php

declare(strict_types=1);

namespace App\Core;

use PDO;
use PDOException;
use Throwable;

/**
 * Conexión PDO única por request. Sin pool de conexiones — no tiene sentido
 * en PHP tradicional (una petición, un proceso), y menos en hosting
 * compartido donde el límite de conexiones simultáneas es bajo.
 */
final class Database
{
    private static ?PDO $connection = null;

    public static function connection(): PDO
    {
        if (self::$connection === null) {
            $config = require dirname(__DIR__, 2) . '/config/config.php';
            $db = $config['db'];
            $dsn = sprintf(
                'mysql:host=%s;dbname=%s;charset=%s',
                $db['host'],
                $db['name'],
                $db['charset'] ?? 'utf8mb4'
            );
            try {
                self::$connection = new PDO($dsn, $db['user'], $db['pass'], [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]);
            } catch (PDOException $e) {
                // No exponer credenciales ni el DSN completo en el mensaje.
                throw new PDOException('No se pudo conectar a la base de datos.', (int) $e->getCode());
            }
        }
        return self::$connection;
    }

    /**
     * Envuelve $fn en una transacción. Todo el envío del wizard (paso 5) y
     * cualquier operación que toque más de una tabla debe pasar por acá —
     * es la única forma de garantizar que "orden enviada" y "equipo
     * instalado" y "stock descontado" queden consistentes entre sí.
     *
     * @template T
     * @param callable(PDO):T $fn
     * @return T
     */
    public static function transaction(callable $fn)
    {
        $pdo = self::connection();
        $yaEnTransaccion = $pdo->inTransaction();
        if (!$yaEnTransaccion) {
            $pdo->beginTransaction();
        }
        try {
            $resultado = $fn($pdo);
            if (!$yaEnTransaccion) {
                $pdo->commit();
            }
            return $resultado;
        } catch (Throwable $e) {
            if (!$yaEnTransaccion && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
