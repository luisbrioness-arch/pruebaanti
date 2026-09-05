<?php
// Script temporal — prueba aislada de LiquidacionService::detalleDePeriodo()
// sin tocar el trabajo pendiente real de Edwin/Juan Pérez: crea un técnico
// y una orden de prueba propios, cierra SU período, imprime el detalle, y
// deja todo listo para que el script de limpieza (_limpiar_test_detalle_periodo.php)
// borre lo creado.
declare(strict_types=1);

ini_set('display_errors', '1');
error_reporting(E_ALL);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Core\Database;
use App\Repositories\UsuarioRepository;
use App\Repositories\OrdenRepository;
use App\Repositories\TipoServicioRepository;
use App\Services\LiquidacionService;

header('Content-Type: text/plain; charset=utf-8');

$usuarios = new UsuarioRepository();
$ordenes = new OrdenRepository();
$tipos = new TipoServicioRepository();

try {
    $tipo = $tipos->findByCodigo('soporte_falla');
    if (!$tipo) { echo "No existe tipo_servicio soporte_falla.\n"; exit; }

    $existente = $usuarios->findByUsuario('zz_test_liq');
    $tecnicoId = $existente ? (int) $existente['id'] : $usuarios->crear([
        'nombre' => 'zz Test Liquidacion',
        'usuario' => 'zz_test_liq',
        'email' => null,
        'password_hash' => password_hash('zzTestPass123', PASSWORD_DEFAULT),
        'rol' => 'tecnico',
        'porcentaje_reparto' => 100,
    ]);

    // Idempotente: si una corrida anterior fallida ya dejó una orden de
    // prueba pendiente (aprobada, sin período todavía) para este técnico,
    // se reusa/corrige en vez de crear otra más al reintentar.
    $stmtBuscar = Database::connection()->prepare(
        "SELECT id FROM ordenes WHERE tecnico_id = ? AND folio = 'zz-test-periodo' AND estado = 'aprobada' AND periodo_liquidacion_id IS NULL LIMIT 1"
    );
    $stmtBuscar->execute([$tecnicoId]);
    $ordenId = $stmtBuscar->fetchColumn();

    if (!$ordenId) {
        $ordenId = $ordenes->crear([
            'uuid_dispositivo' => bin2hex(random_bytes(16)),
            'folio' => 'zz-test-periodo',
            'tipo_servicio_id' => $tipo['id'],
            'tecnico_id' => $tecnicoId,
            'venta_id' => null,
            'estado' => 'borrador',
            'fecha_trabajo_dispositivo' => date('Y-m-d H:i:s'),
            'creado_por_admin' => 1,
        ]);
    }
    // Fuerza directo a 'aprobada' con monto (y fecha_auditoria, que
    // cerrarPeriodo() necesita) — simular todo el wizard (paso1..5) para
    // una orden de prueba es más riesgo que este UPDATE puntual y aislado.
    Database::connection()->prepare(
        "UPDATE ordenes SET estado = 'aprobada', monto_bruto = 1000, porcentaje_aplicado = 100, monto_tecnico = 1000, fecha_auditoria = NOW() WHERE id = ?"
    )->execute([$ordenId]);

    $debugPendientes = $ordenes->pendientesDeLiquidar($tecnicoId);
    echo "DEBUG pendientes=" . json_encode($debugPendientes) . "\n";

    $periodo = (new LiquidacionService())->cerrarPeriodo($tecnicoId, $tecnicoId, 'Prueba aislada de detalleDePeriodo');
    $detalle = (new LiquidacionService())->detalleDePeriodo((int) $periodo['id']);

    echo "periodo_id={$periodo['id']}\n";
    echo "ordenes_en_detalle=" . count($detalle['ordenes']) . "\n";
    echo "ventas_en_detalle=" . count($detalle['ventas']) . "\n";
    echo json_encode($detalle['ordenes'][0] ?? null) . "\n";
} catch (\Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    echo $e->getTraceAsString() . "\n";
}
