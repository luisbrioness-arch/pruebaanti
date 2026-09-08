<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class OrdenRepository
{
    public function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM ordenes WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function porUuid(string $uuidDispositivo): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM ordenes WHERE uuid_dispositivo = ?');
        $stmt->execute([$uuidDispositivo]);
        return $stmt->fetch() ?: null;
    }

    /**
     * Busca otra orden con el mismo folio que deba considerarse un
     * conflicto real, no una reutilización legítima del folio.
     *
     * ASUNCIÓN DE NEGOCIO (no confirmada con Edwin — revisar):
     * se marca conflicto solo si el folio repetido es de OTRO técnico, o del
     * MISMO técnico el MISMO día (indicio de doble carga por error). Si el
     * mismo técnico reutiliza un folio semanas después — típico de una
     * visita de garantía sobre la misma instalación — no se bloquea, porque
     * eso sí puede ser trabajo real y rechazarlo perdería la visita.
     */
    public function folioEnConflicto(string $folio, string $uuidPropio, int $tecnicoId, string $fechaTrabajoDispositivo): ?array
    {
        $dia = substr($fechaTrabajoDispositivo, 0, 10);
        $stmt = Database::connection()->prepare(
            "SELECT * FROM ordenes
             WHERE folio = :folio
               AND uuid_dispositivo != :uuid
               AND estado != 'conflicto'
               AND (tecnico_id != :tecnico_id OR DATE(fecha_trabajo_dispositivo) = :dia)
             LIMIT 1"
        );
        $stmt->execute([
            'folio' => $folio,
            'uuid' => $uuidPropio,
            'tecnico_id' => $tecnicoId,
            'dia' => $dia,
        ]);
        return $stmt->fetch() ?: null;
    }

    /**
     * Cola de auditoría (por defecto, más antigua primero — "primero en
     * cola, primero atendido") y también el historial propio del técnico
     * (con $masRecientePrimero = true, más natural para una lista personal).
     * Nombre de técnico y tipo de servicio ya resueltos para no golpear la
     * base de nuevo por cada fila.
     */
    public function listar(?string $estado, ?int $tecnicoId, bool $masRecientePrimero = false): array
    {
        $sql = "SELECT o.*, u.nombre AS tecnico_nombre, ts.nombre AS tipo_servicio_nombre, ts.codigo AS tipo_servicio_codigo
                FROM ordenes o
                JOIN usuarios u ON u.id = o.tecnico_id
                JOIN tipos_servicio ts ON ts.id = o.tipo_servicio_id
                WHERE 1=1";
        $params = [];
        if ($estado !== null) {
            $sql .= ' AND o.estado = :estado';
            $params['estado'] = $estado;
        }
        if ($tecnicoId !== null) {
            $sql .= ' AND o.tecnico_id = :tecnico_id';
            $params['tecnico_id'] = $tecnicoId;
        }
        $sql .= $masRecientePrimero ? ' ORDER BY o.creado_en DESC' : ' ORDER BY o.creado_en ASC';
        $stmt = Database::connection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * Historial general de órdenes para el panel admin (pedido: "crea un
     * link de historial ordenes vendidas y ordenes instaladas con fecha" —
     * reemplaza a la cola de auditoría que ya no existe). Muestra TODO lo
     * que pasó del paso 5 en adelante (nunca 'borrador') — incluidas
     * rechazadas y en conflicto, con su estado como columna, para no perder
     * la única visibilidad que quedaba sobre conflictos tras sacar
     * Auditoría del panel. Ordenado por la fecha real de trabajo (la que
     * dice el técnico que hizo el trabajo), más reciente primero.
     */
    public function historial(?int $tecnicoId, ?string $desde, ?string $hasta): array
    {
        $sql = "SELECT o.*, u.nombre AS tecnico_nombre, ts.nombre AS tipo_servicio_nombre,
                       v.cliente_nombre AS venta_cliente_nombre,
                       v.comuna AS venta_comuna,
                       v.cliente_direccion AS venta_cliente_direccion,
                       v.cliente_telefono AS venta_cliente_telefono
                FROM ordenes o
                JOIN usuarios u ON u.id = o.tecnico_id
                JOIN tipos_servicio ts ON ts.id = o.tipo_servicio_id
                LEFT JOIN ventas v ON v.id = o.venta_id
                WHERE o.estado != 'borrador'";
        $params = [];
        if ($tecnicoId !== null) {
            $sql .= ' AND o.tecnico_id = :tecnico_id';
            $params['tecnico_id'] = $tecnicoId;
        }
        if ($desde !== null) {
            $sql .= ' AND DATE(o.fecha_trabajo_dispositivo) >= :desde';
            $params['desde'] = $desde;
        }
        if ($hasta !== null) {
            $sql .= ' AND DATE(o.fecha_trabajo_dispositivo) <= :hasta';
            $params['hasta'] = $hasta;
        }
        $sql .= ' ORDER BY o.fecha_trabajo_dispositivo DESC';
        $stmt = Database::connection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function crear(array $datos): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO ordenes
                (uuid_dispositivo, folio, tipo_servicio_id, tecnico_id, venta_id, estado, fecha_trabajo_dispositivo, creado_por_admin)
             VALUES
                (:uuid_dispositivo, :folio, :tipo_servicio_id, :tecnico_id, :venta_id, :estado, :fecha_trabajo_dispositivo, :creado_por_admin)'
        );
        $stmt->execute($datos);
        return (int) Database::connection()->lastInsertId();
    }

    /** Órdenes aprobadas de un técnico que todavía no entraron a ningún cierre de liquidación. */
    /**
     * @param bool $bloqueando true SOLO desde dentro de la transacción que
     *   cierra un período (ver LiquidacionService::cerrarPeriodo). Sin el
     *   FOR UPDATE, dos cierres simultáneos —un doble clic alcanza— leen las
     *   mismas órdenes pendientes y ambos acreditan el mismo trabajo: el
     *   técnico queda pagado dos veces. Con el bloqueo, el segundo espera al
     *   primero y al releer ya no encuentra nada pendiente.
     */
    public function pendientesDeLiquidar(int $tecnicoId, bool $bloqueando = false): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT * FROM ordenes
             WHERE tecnico_id = ? AND estado = 'aprobada' AND periodo_liquidacion_id IS NULL
             ORDER BY fecha_auditoria ASC" . ($bloqueando ? ' FOR UPDATE' : '')
        );
        $stmt->execute([$tecnicoId]);
        return $stmt->fetchAll();
    }

    /**
     * Detalle de las órdenes que un cierre de período dejó 'liquidada'
     * (pedido/reporte #11: "que se vean los trabajos liquidados todo lo
     * que se ha completado como venta o instalacion") — mismo shape que
     * historial() para reusar la misma tabla del lado del panel.
     */
    public function porPeriodo(int $periodoId): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT o.*, u.nombre AS tecnico_nombre, ts.nombre AS tipo_servicio_nombre,
                    v.cliente_nombre AS venta_cliente_nombre
             FROM ordenes o
             JOIN usuarios u ON u.id = o.tecnico_id
             JOIN tipos_servicio ts ON ts.id = o.tipo_servicio_id
             LEFT JOIN ventas v ON v.id = o.venta_id
             WHERE o.periodo_liquidacion_id = ?
             ORDER BY o.fecha_trabajo_dispositivo ASC"
        );
        $stmt->execute([$periodoId]);
        return $stmt->fetchAll();
    }

    /** Las deja 'liquidada' y las ata al período que se acaba de cerrar — ver LiquidacionService. */
    public function marcarLiquidadas(array $ids, int $periodoId): void
    {
        if (!$ids) {
            return;
        }
        $marcadores = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::connection()->prepare(
            "UPDATE ordenes SET estado = 'liquidada', periodo_liquidacion_id = ? WHERE id IN ($marcadores)"
        );
        $stmt->execute([$periodoId, ...$ids]);
    }

    /**
     * ADVERTENCIA: $campos arma el UPDATE usando sus propias claves como
     * nombres de columna — nunca llamar esto con claves que vengan directo
     * del cuerpo de una petición HTTP. Todos los llamados actuales pasan
     * arrays con claves fijas en el código (ver OrdenWizardService).
     */
    public function actualizar(int $id, array $campos): void
    {
        if (!$campos) {
            return;
        }
        $sets = [];
        foreach (array_keys($campos) as $columna) {
            $sets[] = "$columna = :$columna";
        }
        $sql = 'UPDATE ordenes SET ' . implode(', ', $sets) . ' WHERE id = :id';
        $campos['id'] = $id;
        Database::connection()->prepare($sql)->execute($campos);
    }
}
