<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class VentaRepository
{
    public function find(int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM ventas WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    /**
     * Igual que find(), con el nombre del plan ya resuelto — para que el
     * wizard del técnico (paso 2) pueda mostrar "este plan trae N decos"
     * sin tener que pedir el catálogo completo de planes solo para eso.
     */
    public function findConPlan(int $id): ?array
    {
        $stmt = Database::connection()->prepare(
            'SELECT v.*, p.nombre AS plan_nombre FROM ventas v JOIN planes p ON p.id = v.plan_id WHERE v.id = ?'
        );
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function crear(array $datos): int
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO ventas (numero_venta_tuves, cliente_nombre, cliente_rut, cliente_direccion, cliente_telefono, fecha_instalacion_solicitada, comuna, plan_id, vendedor_id, estado)
             VALUES (:numero_venta_tuves, :cliente_nombre, :cliente_rut, :cliente_direccion, :cliente_telefono, :fecha_instalacion_solicitada, :comuna, :plan_id, :vendedor_id, :estado)'
        );
        $stmt->execute($datos);
        return (int) Database::connection()->lastInsertId();
    }

    public function asegurarColumnaObservacion(): void
    {
        try {
            Database::connection()->exec('ALTER TABLE ventas ADD COLUMN observacion TEXT NULL AFTER fecha_instalacion_solicitada');
        } catch (\Throwable $e) {
            // Ya existe la columna
        }
    }

    /** Mismo cuidado que OrdenRepository::actualizar() — $campos solo con claves fijas del código, nunca del request. */
    public function actualizar(int $id, array $campos): void
    {
        if (!$campos) {
            return;
        }
        $sets = [];
        foreach (array_keys($campos) as $columna) {
            $sets[] = "$columna = :$columna";
        }
        $sql = 'UPDATE ventas SET ' . implode(', ', $sets) . ' WHERE id = :id';
        $campos['id'] = $id;
        Database::connection()->prepare($sql)->execute($campos);
    }

    /** Ventas propias todavía sin instalación asociada — para el selector del paso 1. */
    public function pendientesDe(int $vendedorId): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT v.*, p.nombre AS plan_nombre
             FROM ventas v JOIN planes p ON p.id = v.plan_id
             WHERE v.vendedor_id = ? AND v.estado = 'registrada'
             ORDER BY v.creado_en DESC"
        );
        $stmt->execute([$vendedorId]);
        return $stmt->fetchAll();
    }

    /**
     * Detalle completo de una venta con vendedor, plan, y si existe, la orden
     * técnica asociada con sus materiales (equipos/decos), fotos y ferretería.
     */
    public function findConDetalle(int $id): ?array
    {
        $stmt = Database::connection()->prepare(
            "SELECT v.*, p.nombre AS plan_nombre, p.codigo AS plan_codigo, u.nombre AS vendedor_nombre, u.email AS vendedor_email
             FROM ventas v
             JOIN planes p ON p.id = v.plan_id
             LEFT JOIN usuarios u ON u.id = v.vendedor_id
             WHERE v.id = ?"
        );
        $stmt->execute([$id]);
        $venta = $stmt->fetch();
        if (!$venta) {
            return null;
        }

        // Buscar si existe una orden asociada a esta venta
        $stmtOrden = Database::connection()->prepare(
            "SELECT o.*, u.nombre AS tecnico_nombre, u.email AS tecnico_email, ts.nombre AS tipo_servicio_nombre
             FROM ordenes o
             JOIN usuarios u ON u.id = o.tecnico_id
             JOIN tipos_servicio ts ON ts.id = o.tipo_servicio_id
             WHERE o.venta_id = ?
             ORDER BY o.id DESC LIMIT 1"
        );
        $stmtOrden->execute([$id]);
        $orden = $stmtOrden->fetch() ?: null;

        // Fallback: si no tiene venta_id explícito pero el folio de la orden coincide con el N° TuVes
        if (!$orden && !empty($venta['numero_venta_tuves'])) {
            $stmtOrden = Database::connection()->prepare(
                "SELECT o.*, u.nombre AS tecnico_nombre, u.email AS tecnico_email, ts.nombre AS tipo_servicio_nombre
                 FROM ordenes o
                 JOIN usuarios u ON u.id = o.tecnico_id
                 JOIN tipos_servicio ts ON ts.id = o.tipo_servicio_id
                 WHERE o.folio = ?
                 ORDER BY o.id DESC LIMIT 1"
            );
            $stmtOrden->execute([$venta['numero_venta_tuves']]);
            $orden = $stmtOrden->fetch() ?: null;
        }

        if ($orden) {
            $orden['materiales'] = (new OrdenMaterialRepository())->paraOrden((int) $orden['id']);
            $orden['fotos'] = (new OrdenFotoRepository())->paraOrden((int) $orden['id']);
            $orden['ferreteria'] = (new OrdenFerreteriaRepository())->paraOrden((int) $orden['id']);
        }

        $venta['orden'] = $orden;
        return $venta;
    }

    /**
     * Todas las ventas sin instalar (de cualquier técnico), ordenadas por la
     * fecha que pidió el cliente — las más próximas (o ya vencidas) primero,
     * las que no tienen fecha cargada van al final. Para "Pendientes de
     * instalar" en Inicio del panel admin. Incluye estado y folio de la orden
     * si ya fue vinculada en terreno.
     */
    public function pendientesInstalarTodas(int $limite = 20): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT v.*, p.nombre AS plan_nombre, u.nombre AS vendedor_nombre,
                    o.id AS orden_id, o.folio AS orden_folio, o.estado AS orden_estado,
                    ut.nombre AS tecnico_nombre
             FROM ventas v
             JOIN planes p ON p.id = v.plan_id
             LEFT JOIN usuarios u ON u.id = v.vendedor_id
             LEFT JOIN ordenes o ON o.venta_id = v.id
             LEFT JOIN usuarios ut ON ut.id = o.tecnico_id
             WHERE v.estado = 'registrada'
             ORDER BY (v.fecha_instalacion_solicitada IS NULL) ASC, v.fecha_instalacion_solicitada ASC
             LIMIT ?"
        );
        $stmt->bindValue(1, $limite, \PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    /**
     * Historial de ventas para el panel admin (pedido: "crea un link de
     * historial ordenes vendidas y ordenes instaladas con fecha"). Filtra
     * por fecha de VENTA (creado_en), no por la fecha de instalación
     * pedida — esa se muestra como columna aparte para comparar ambas.
     * Incluye cualquier estado (registrada/instalada/anulada), a diferencia
     * de pendientesDe()/pendientesInstalarTodas() que solo miran 'registrada'.
     */
    public function historial(?int $vendedorId, ?string $desde, ?string $hasta): array
    {
        $sql = "SELECT v.*, p.nombre AS plan_nombre, u.nombre AS vendedor_nombre
                FROM ventas v
                JOIN planes p ON p.id = v.plan_id
                LEFT JOIN usuarios u ON u.id = v.vendedor_id
                WHERE 1=1";
        $params = [];
        if ($vendedorId !== null) {
            $sql .= ' AND v.vendedor_id = :vendedor_id';
            $params['vendedor_id'] = $vendedorId;
        }
        if ($desde !== null) {
            $sql .= ' AND DATE(v.creado_en) >= :desde';
            $params['desde'] = $desde;
        }
        if ($hasta !== null) {
            $sql .= ' AND DATE(v.creado_en) <= :hasta';
            $params['hasta'] = $hasta;
        }
        $sql .= ' ORDER BY v.creado_en DESC';
        $stmt = Database::connection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /** Ventas instaladas de un vendedor que todavía no entraron a ningún cierre de liquidación. */
    /** @param bool $bloqueando ver OrdenRepository::pendientesDeLiquidar — mismo motivo (doble cierre = doble pago). */
    public function pendientesDeLiquidar(int $vendedorId, bool $bloqueando = false): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT * FROM ventas
             WHERE vendedor_id = ? AND estado = 'instalada' AND periodo_liquidacion_id IS NULL
             ORDER BY creado_en ASC" . ($bloqueando ? ' FOR UPDATE' : '')
        );
        $stmt->execute([$vendedorId]);
        return $stmt->fetchAll();
    }

    /**
     * Detalle de las ventas que un cierre de período dejó marcadas (pedido/
     * reporte #11: "que se vean los trabajos liquidados todo lo que se ha
     * completado como venta o instalacion") — mismo shape que historial().
     */
    public function porPeriodo(int $periodoId): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT v.*, p.nombre AS plan_nombre, u.nombre AS vendedor_nombre
             FROM ventas v
             JOIN planes p ON p.id = v.plan_id
             JOIN usuarios u ON u.id = v.vendedor_id
             WHERE v.periodo_liquidacion_id = ?
             ORDER BY v.creado_en ASC"
        );
        $stmt->execute([$periodoId]);
        return $stmt->fetchAll();
    }

    /** Las ata al período que se acaba de cerrar — el estado 'instalada' no cambia, solo queda marcada como ya pagada. */
    public function marcarLiquidadas(array $ids, int $periodoId): void
    {
        if (!$ids) {
            return;
        }
        $marcadores = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::connection()->prepare(
            "UPDATE ventas SET periodo_liquidacion_id = ? WHERE id IN ($marcadores)"
        );
        $stmt->execute([$periodoId, ...$ids]);
    }
}
