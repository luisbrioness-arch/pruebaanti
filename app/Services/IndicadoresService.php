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
    /**
     * Pedido/reporte #7: "Que diga periodo septiembre del 1 al 30 y que
     * cambie cuando sea otro mes y que tambien deje cambiar para mirar de
     * forma rapida otros periodos" — antes "este mes" era literal
     * (DATE_FORMAT(NOW(),'%Y-%m-01'), sin forma de mirar otro). $desde/
     * $hasta (YYYY-MM-DD, ambos inclusive) reemplazan eso; por defecto son
     * el 1° y el último día del mes actual (ver AdminIndicadoresController).
     */
    public function resumen(string $desde, string $hasta): array
    {
        $pdo = Database::connection();
        // Exclusivo del lado de arriba — así una orden de las 23:50 del
        // último día del período no queda afuera por comparar solo la fecha.
        $hastaExclusivo = $hasta . ' 23:59:59';

        // Tiles accionables de Inicio (pedido: "que diga instalaciones este
        // mes y otro ventas este mes ... y a la derecha el valor en dinero
        // que lo que llevamos"). Solo cuenta lo confirmado (aprobada/
        // liquidada) — una rechazada no suma acá, por eso además ya no
        // hace falta un tile aparte de "Rechazadas".
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) AS n, COALESCE(SUM(o.monto_bruto), 0) AS monto
             FROM ordenes o
             JOIN tipos_servicio ts ON ts.id = o.tipo_servicio_id
             WHERE ts.codigo = 'instalacion_nueva'
               AND o.creado_en BETWEEN :desde AND :hasta
               AND o.estado IN ('aprobada', 'liquidada')"
        );
        $stmt->execute(['desde' => $desde, 'hasta' => $hastaExclusivo]);
        $instalacionesMes = $stmt->fetch();

        // Ventas: se cuentan todas las registradas en el período (actividad
        // de venta), pero el monto solo suma la comisión ya confirmada
        // (instalada) — una venta todavía 'registrada' no tiene
        // monto_comision hasta que se instale.
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) AS n, COALESCE(SUM(monto_comision), 0) AS monto
             FROM ventas
             WHERE creado_en BETWEEN :desde AND :hasta"
        );
        $stmt->execute(['desde' => $desde, 'hasta' => $hastaExclusivo]);
        $ventasMes = $stmt->fetch();

        // Pedido: "eliminemos el concepto de aprobadas si se instala ya es
        // sumada ... en liquidado cambiarlo por total mes con solo lo que
        // se ha instalado y las ventas que si se hayan instalado" —
        // "Liquidado" mostraba el momento en que Edwin cierra un período de
        // billetera, que en la práctica casi siempre daba $0 (los cierres
        // son manuales y esporádicos). "Total mes" es la plata real que
        // generaron las órdenes aprobadas/liquidadas de CUALQUIER tipo de
        // servicio en el período (monto_tecnico, no el bruto) más la
        // comisión de las ventas ya instaladas (mismo filtro por creado_en
        // que "Ventas este mes", para que ambos tiles hablen del mismo período).
        $stmt = $pdo->prepare(
            "SELECT COALESCE(SUM(monto_tecnico), 0) FROM ordenes
             WHERE estado IN ('aprobada', 'liquidada')
               AND creado_en BETWEEN :desde AND :hasta"
        );
        $stmt->execute(['desde' => $desde, 'hasta' => $hastaExclusivo]);
        $totalMesOrdenes = (float) $stmt->fetchColumn();

        $stmt = $pdo->prepare(
            "SELECT COALESCE(SUM(monto_vendedor), 0) FROM ventas
             WHERE estado = 'instalada'
               AND creado_en BETWEEN :desde AND :hasta"
        );
        $stmt->execute(['desde' => $desde, 'hasta' => $hastaExclusivo]);
        $totalMesVentas = (float) $stmt->fetchColumn();
        $totalMes = $totalMesOrdenes + $totalMesVentas;

        // Reemplaza al tile "Aprobadas" (redundante con "Instalaciones este
        // mes" — una orden aprobada de instalación ya se cuenta ahí). Esta
        // es la cola real de ventas sin instalar todavía, igual criterio
        // que pendientes_auditoria/conflictos_abiertos: no se limita al mes,
        // es el trabajo pendiente de HOY.
        $ventasPorInstalar = (int) $pdo->query(
            "SELECT COUNT(*) FROM ventas WHERE estado = 'registrada'"
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
            'periodo' => ['desde' => $desde, 'hasta' => $hasta],
            'instalaciones_mes' => ['n' => (int) $instalacionesMes['n'], 'monto' => (float) $instalacionesMes['monto']],
            'ventas_mes' => ['n' => (int) $ventasMes['n'], 'monto' => (float) $ventasMes['monto']],
            'total_mes' => $totalMes,
            'ventas_por_instalar' => $ventasPorInstalar,
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
