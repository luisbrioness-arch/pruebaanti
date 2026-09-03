<?php
// Diagnóstico de un solo uso — prueba OrdenWizardService::calcularMontoBruto
// (privado) por reflexión, sin tener que fabricar una orden completa con
// equipos escaneados/fotos. Arma sus propios datos de prueba y los borra
// al final. Borrar este archivo apenas termine.
declare(strict_types=1);
require dirname(__DIR__) . '/app/bootstrap.php';

use App\Services\OrdenWizardService;

header('Content-Type: text/plain; charset=utf-8');
$config = require __DIR__ . '/../config/config.php';
$db = $config['db'];
$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=%s', $db['host'], $db['name'], $db['charset'] ?? 'utf8mb4'),
    $db['user'], $db['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

function invocar(OrdenWizardService $svc, array $orden): float
{
    $ref = new ReflectionMethod($svc, 'calcularMontoBruto');
    $ref->setAccessible(true);
    return $ref->invoke($svc, $orden);
}

$svc = new OrdenWizardService();

// Datos reales ya existentes: tipo_servicio 'instalacion_nueva', plan
// 'plan_basico_2_decos' (con tarifa de instalación seteada a 14000 más abajo),
// y una venta de prueba enlazándolos.
$tipoServicioId = (int) $pdo->query("SELECT id FROM tipos_servicio WHERE codigo = 'instalacion_nueva'")->fetchColumn();
$planId = (int) $pdo->query("SELECT id FROM planes WHERE codigo = 'plan_basico_2_decos'")->fetchColumn();
$vendedorId = (int) $pdo->query("SELECT id FROM usuarios WHERE usuario = 'edwin'")->fetchColumn();

if (!$tipoServicioId || !$planId || !$vendedorId) {
    die("Faltan datos base (tipo_servicio/plan/edwin) — no se puede probar.\n");
}

// Venta de prueba, enlazada al plan.
$pdo->prepare("INSERT INTO ventas (numero_venta_tuves, cliente_nombre, comuna, plan_id, vendedor_id, estado) VALUES ('ZZDIAG-001', 'ZZ Diag', 'Santiago', ?, ?, 'registrada')")
    ->execute([$planId, $vendedorId]);
$ventaId = (int) $pdo->lastInsertId();

echo "== Caso 1: instalacion_nueva CON venta, plan CON tarifa de instalación vigente ==\n";
$orden = ['tipo_servicio_id' => $tipoServicioId, 'venta_id' => $ventaId];
$monto = invocar($svc, $orden);
echo "monto_bruto calculado: $monto (esperado: 14000, la tarifa que le pusimos al plan)\n\n";

echo "== Caso 2: instalacion_nueva SIN venta (venta_id null) ==\n";
$orden2 = ['tipo_servicio_id' => $tipoServicioId, 'venta_id' => null];
$monto2 = invocar($svc, $orden2);
$tarifaPlana = (float) $pdo->query("SELECT monto FROM tarifas_servicio WHERE tipo_servicio_id = $tipoServicioId AND vigente_hasta IS NULL")->fetchColumn();
echo "monto_bruto calculado: $monto2 (esperado: $tarifaPlana, la tarifa plana de tarifas_servicio)\n\n";

// Limpieza
$pdo->prepare("DELETE FROM ventas WHERE id = ?")->execute([$ventaId]);
echo "Venta de prueba borrada.\n";
