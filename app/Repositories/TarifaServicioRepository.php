<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class TarifaServicioRepository
{
    /** La tarifa activa hoy — nunca la última creada, sino la que tiene vigente_hasta NULL. */
    public function vigentePara(int $tipoServicioId): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT * FROM tarifas_servicio WHERE tipo_servicio_id = ? AND vigente_hasta IS NULL LIMIT 1'
        );
        $stmt->execute([$tipoServicioId]);
        return $stmt->fetch() ?: null;
    }

    public function todasVigentes(): array
    {
        return Database::connection()->query(
            "SELECT t.*, ts.codigo AS tipo_servicio_codigo, ts.nombre AS tipo_servicio_nombre
             FROM tarifas_servicio t
             JOIN tipos_servicio ts ON ts.id = t.tipo_servicio_id
             WHERE t.vigente_hasta IS NULL
             ORDER BY ts.orden_visualizacion"
        )->fetchAll();
    }

    /**
     * Editar una tarifa NUNCA hace UPDATE sobre el monto vigente — cierra la
     * fila actual (vigente_hasta = ahora) y crea una nueva. Así una orden ya
     * aprobada, que guardó su propio snapshot, nunca se ve afectada.
     */
    public function cerrarYCrear(int $tipoServicioId, float $monto, int $creadoPor): int
    {
        $ahora = date('Y-m-d H:i:s');
        Database::connection()
            ->prepare('UPDATE tarifas_servicio SET vigente_hasta = ? WHERE tipo_servicio_id = ? AND vigente_hasta IS NULL')
            ->execute([$ahora, $tipoServicioId]);

        $stmt = Database::connection()->prepare(
            'INSERT INTO tarifas_servicio (tipo_servicio_id, monto, vigente_desde, vigente_hasta, creado_por)
             VALUES (?, ?, ?, NULL, ?)'
        );
        $stmt->execute([$tipoServicioId, $monto, $ahora, $creadoPor]);
        return (int) Database::connection()->lastInsertId();
    }

    /**
     * "Eliminar" una tarifa de tipo de servicio (pedido: "que aplique igual
     * para las Tarifas por tipo de servicio") — cierra la fila vigente sin
     * crear otra. A DIFERENCIA de instalación por plan, acá no hay monto
     * plano al que caer: sin fila vigente, OrdenWizardService::calcularMontoBruto
     * lanza 409 sin_tarifa_vigente y ningún técnico puede cerrar una orden
     * de ese tipo de servicio hasta que se cargue un monto nuevo. El panel
     * avisa esto antes de confirmar (ver tarifario.js).
     */
    public function cerrarSinCrear(int $tipoServicioId): void
    {
        Database::connection()
            ->prepare('UPDATE tarifas_servicio SET vigente_hasta = ? WHERE tipo_servicio_id = ? AND vigente_hasta IS NULL')
            ->execute([date('Y-m-d H:i:s'), $tipoServicioId]);
    }
}
