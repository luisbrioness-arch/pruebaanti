<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;

/**
 * Dashboard de indicadores para Edwin (mejora 7) — de solo lectura, arma
 * todo con COUNT/SUM directos sobre tablas que ya existen, sin tocar nada.
 * No es un reemplazo de las pantallas operativas (Auditoría, Bodega,
 * Billetera) — es el resumen de "cómo viene el mes" que ninguna de esas
 * pantallas da de un vistazo.
 */
final class IndicadoresService
{
    public function resumen(): array
    {
        $pdo = Database::connection();

        $ordenesPorEstadoMes = $pdo->query(
            "SELECT estado, COUNT(*) AS n FROM ordenes
             WHERE creado_en >= DATE_FORMAT(NOW(), '%Y-%m-01')
             GROUP BY estado"
        )->fetchAll();

        // Tiles accionables de Inicio (pedido: "que diga instalaciones este
        // mes y otro ventas este mes ... y a la derecha el valor en dinero
        // que lo que llevamos"). Solo cuenta lo confirmado (aprobada/
        // liquidada) — una rechazada no suma acá, por eso además ya no
        // hace falta un tile aparte de "Rechazadas".
        $instalacionesMes = $pdo->query(
            "SELECT COUNT(*) AS n, COALESCE(SUM(o.monto_bruto), 0) AS monto
             FROM ordenes o
             JOIN tipos_servicio ts ON ts.id = o.tipo_servicio_id
             WHERE ts.codigo = 'instalacion_nueva'
               AND o.creado_en >= DATE_FORMAT(NOW(), '%Y-%m-01')
               AND o.estado IN ('aprobada', 'liquidada')"
        )->fetch();

        // Ventas: se cuentan todas las registradas este mes (actividad de
        // venta), pero el monto solo suma la comisión ya confirmada
        // (instalada) — una venta todavía 'registrada' no tiene
        // monto_comision hasta que se instale.
        $ventasMes = $pdo->query(
            "SELECT COUNT(*) AS n, COALESCE(SUM(monto_comision), 0) AS monto
             FROM ventas
             WHERE creado_en >= DATE_FORMAT(NOW(), '%Y-%m-01')"
        )->fetch();

        $liquidadoMes = (float) $pdo->query(
            "SELECT COALESCE(SUM(monto), 0) FROM movimientos_billetera
             WHERE tipo_movimiento = 'liquidacion' AND creado_en >= DATE_FORMAT(NOW(), '%Y-%m-01')"
        )->fetchColumn();

        $saldoPendienteTotal = (float) $pdo->query(
            'SELECT COALESCE(SUM(monto), 0) FROM movimientos_billetera'
        )->fetchColumn();

        $equiposPorEstado = $pdo->query(
            'SELECT estado, COUNT(*) AS n FROM equipos GROUP BY estado'
        )->fetchAll();

        $ferreteriaPendienteConfirmar = (int) $pdo->query(
            "SELECT COUNT(*) FROM entregas_ferreteria_pendientes WHERE estado = 'pendiente'"
        )->fetchColumn();

        $traspasosRechazados30d = (int) $pdo->query(
            "SELECT COUNT(*) FROM movimientos_equipo
             WHERE tipo_movimiento = 'traspaso_rechazado' AND creado_en >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
        )->fetchColumn();

        $entregasRechazadas30d = (int) $pdo->query(
            "SELECT COUNT(*) FROM entregas_ferreteria_pendientes
             WHERE estado = 'rechazada' AND resuelto_en >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
        )->fetchColumn();

        $reportesAbiertos = (int) $pdo->query(
            "SELECT COUNT(*) FROM reportes WHERE estado = 'abierto'"
        )->fetchColumn();

        // Estos dos NO se limitan al mes — son la cola de trabajo real de
        // Edwin ahora mismo, no un indicador histórico (una orden enviada
        // hace 5 semanas sigue esperando auditoría igual que una de hoy).
        $pendientesAuditoria = (int) $pdo->query(
            "SELECT COUNT(*) FROM ordenes WHERE estado = 'enviada'"
        )->fetchColumn();
        $conflictosAbiertos = (int) $pdo->query(
            "SELECT COUNT(*) FROM ordenes WHERE estado = 'conflicto'"
        )->fetchColumn();

        // Traspasos/entregas que llevan 3+ días sin que el técnico confirme
        // (mismo umbral que el aviso visual de Bodega, ver bodega.js).
        $traspasosEquipoViejos = (int) $pdo->query(
            "SELECT COUNT(*) FROM equipos WHERE estado = 'en_transito' AND actualizado_en < DATE_SUB(NOW(), INTERVAL 3 DAY)"
        )->fetchColumn();
        $entregasFerreteriaViejas = (int) $pdo->query(
            "SELECT COUNT(*) FROM entregas_ferreteria_pendientes WHERE estado = 'pendiente' AND creado_en < DATE_SUB(NOW(), INTERVAL 3 DAY)"
        )->fetchColumn();

        return [
            'ordenes_por_estado_mes' => $ordenesPorEstadoMes,
            'instalaciones_mes' => ['n' => (int) $instalacionesMes['n'], 'monto' => (float) $instalacionesMes['monto']],
            'ventas_mes' => ['n' => (int) $ventasMes['n'], 'monto' => (float) $ventasMes['monto']],
            'liquidado_mes' => $liquidadoMes,
            'saldo_pendiente_total' => $saldoPendienteTotal,
            'equipos_por_estado' => $equiposPorEstado,
            'ferreteria_pendiente_confirmar' => $ferreteriaPendienteConfirmar,
            'traspasos_rechazados_30d' => $traspasosRechazados30d,
            'entregas_rechazadas_30d' => $entregasRechazadas30d,
            'reportes_abiertos' => $reportesAbiertos,
            'pendientes_auditoria' => $pendientesAuditoria,
            'conflictos_abiertos' => $conflictosAbiertos,
            'traspasos_equipo_viejos' => $traspasosEquipoViejos,
            'entregas_ferreteria_viejas' => $entregasFerreteriaViejas,
        ];
    }
}
