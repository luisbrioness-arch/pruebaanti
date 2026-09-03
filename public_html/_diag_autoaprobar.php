<?php
// Diagnóstico temporal — verifica que confirmarEnviada() ahora deja la
// orden 'aprobada' (auto-aprobación) y que OrdenRepository::historial() /
// VentaRepository::historial() la muestran sin error de SQL. Se borra
// apenas termine de usarse — no es parte del producto.
declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

use App\Core\Database;
use App\Repositories\OrdenRepository;
use App\Repositories\UsuarioRepository;
use App\Repositories\VentaRepository;
use App\Services\OrdenWizardService;

header('Content-Type: application/json');

$pdo = Database::connection();
$resultado = ['pasos' => []];

try {
    // 1. Técnico de prueba
    $usuarios = new UsuarioRepository();
    $tecnicoId = $usuarios->crear([
        'nombre' => 'ZZ Test Auditoria',
        'usuario' => 'zz_test_auditoria_' . time(),
        'email' => null,
        'password_hash' => password_hash('temporal12345', PASSWORD_DEFAULT),
        'rol' => 'tecnico',
        'porcentaje_reparto' => 70,
    ]);
    $resultado['pasos'][] = "tecnico creado id=$tecnicoId";

    // 2. Equipo de prueba, en la maleta de ese técnico
    $tipoEquipoId = (int) $pdo->query('SELECT id FROM tipos_equipo LIMIT 1')->fetchColumn();
    $serie = 'ZZ-TEST-AUD-' . time();
    $pdo->prepare(
        'INSERT INTO equipos (tipo_equipo_id, numero_serie, estado, usuario_actual_id) VALUES (?, ?, "maleta", ?)'
    )->execute([$tipoEquipoId, $serie, $tecnicoId]);
    $equipoId = (int) $pdo->lastInsertId();
    $resultado['pasos'][] = "equipo creado id=$equipoId serie=$serie";

    // 3. Orden en 'borrador' con ese material ya escaneado (paso 2 del wizard)
    $tipoServicio = $pdo->query("SELECT id FROM tipos_servicio WHERE codigo = 'soporte_falla'")->fetch();
    $tipoServicioId = (int) $tipoServicio['id'];
    $uuid = 'zz-test-' . bin2hex(random_bytes(8));
    $pdo->prepare(
        'INSERT INTO ordenes (uuid_dispositivo, folio, tipo_servicio_id, tecnico_id, estado, fecha_trabajo_dispositivo, creado_por_admin)
         VALUES (?, ?, ?, ?, "borrador", NOW(), 0)'
    )->execute([$uuid, 'ZZ-TEST-FOLIO', $tipoServicioId, $tecnicoId]);
    $ordenId = (int) $pdo->lastInsertId();
    $resultado['pasos'][] = "orden creada id=$ordenId estado=borrador";

    $pdo->prepare('INSERT INTO orden_materiales (orden_id, equipo_id, accion) VALUES (?, ?, "instalado")')
        ->execute([$ordenId, $equipoId]);

    // 4. Llamar confirmarEnviada() (privado) vía reflexión — es exactamente
    //    el método que se cambió para la auto-aprobación.
    $svc = new OrdenWizardService();
    $metodo = new ReflectionMethod($svc, 'confirmarEnviada');
    $metodo->setAccessible(true);
    $metodo->invoke($svc, $ordenId, $tecnicoId);

    $orden = $pdo->prepare('SELECT * FROM ordenes WHERE id = ?');
    $orden->execute([$ordenId]);
    $ordenFinal = $orden->fetch();

    $resultado['orden_estado'] = $ordenFinal['estado'];
    $resultado['orden_fecha_auditoria'] = $ordenFinal['fecha_auditoria'];
    $resultado['orden_auditor_id'] = $ordenFinal['auditor_id'];
    $resultado['orden_monto_tecnico'] = $ordenFinal['monto_tecnico'];
    $resultado['check_auto_aprobada'] = ($ordenFinal['estado'] === 'aprobada' && $ordenFinal['fecha_auditoria'] !== null)
        ? 'OK' : 'FALLA';

    // 5. Verificar que Historial (nuevas queries) la muestra sin error SQL.
    $historialOrdenes = (new OrdenRepository())->historial($tecnicoId, null, null);
    $resultado['check_historial_ordenes'] = (count($historialOrdenes) === 1 && $historialOrdenes[0]['id'] === $ordenId)
        ? 'OK' : 'FALLA (esperaba 1 fila, la de prueba)';

    $historialVentas = (new VentaRepository())->historial($tecnicoId, null, null);
    $resultado['check_historial_ventas'] = is_array($historialVentas) ? 'OK (sin error SQL)' : 'FALLA';

    // 6. Limpieza — se borra todo lo que este script creó.
    $pdo->prepare('DELETE FROM movimientos_equipo WHERE orden_id = ?')->execute([$ordenId]);
    $pdo->prepare('DELETE FROM orden_materiales WHERE orden_id = ?')->execute([$ordenId]);
    $pdo->prepare('DELETE FROM ordenes WHERE id = ?')->execute([$ordenId]);
    $pdo->prepare('DELETE FROM equipos WHERE id = ?')->execute([$equipoId]);
    $pdo->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$tecnicoId]);
    $resultado['limpieza'] = 'ok — orden, material, movimiento, equipo y usuario de prueba borrados';

    echo json_encode($resultado, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} catch (\Throwable $e) {
    $resultado['error'] = $e->getMessage();
    $resultado['trace'] = explode("\n", $e->getTraceAsString());
    http_response_code(500);
    echo json_encode($resultado, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}
