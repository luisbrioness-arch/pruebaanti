<?php

declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Core\Database;

header('Content-Type: application/json; charset=utf-8');

try {
    $pdo = Database::connection();

    // 1. Obtener ID del admin 'edwin' o primer admin disponible
    $stmtAdmin = $pdo->prepare("SELECT id FROM usuarios WHERE usuario = 'edwin' LIMIT 1");
    $stmtAdmin->execute();
    $adminId = $stmtAdmin->fetchColumn();

    if (!$adminId) {
        $stmtAdmin2 = $pdo->query("SELECT id FROM usuarios WHERE rol = 'admin' ORDER BY id ASC LIMIT 1");
        $adminId = $stmtAdmin2->fetchColumn();
    }

    if (!$adminId) {
        http_response_code(500);
        echo json_encode(['error' => true, 'message' => 'No se encontró un usuario administrador.']);
        exit;
    }

    $adminId = (int) $adminId;
    $ahora = date('Y-m-d H:i:s');

    // Desactivar el plan de ejemplo antiguo si existe
    $pdo->exec("UPDATE planes SET activo = 0 WHERE codigo = 'plan_full'");

    $planes = [
        [
            'codigo' => 'plan_basico_1deco',
            'nombre' => 'Plan Básico 1 Deco',
            'comision' => 15000,
            'instalacion' => 12000,
        ],
        [
            'codigo' => 'plan_basico_2decos',
            'nombre' => 'Plan Básico 2 Decos',
            'comision' => 20000,
            'instalacion' => 14000,
        ],
        [
            'codigo' => 'plan_basico_3decos',
            'nombre' => 'Plan Básico 3 Decos',
            'comision' => 25000,
            'instalacion' => 16000,
        ],
        [
            'codigo' => 'plan_basico_4decos',
            'nombre' => 'Plan Básico 4 Decos',
            'comision' => 30000,
            'instalacion' => 18000,
        ],
        [
            'codigo' => 'plan_premium_1deco',
            'nombre' => 'Plan Premium (TNT Sports) 1 Deco',
            'comision' => 20000,
            'instalacion' => 12000,
        ],
        [
            'codigo' => 'plan_premium_2decos',
            'nombre' => 'Plan Premium (TNT Sports) 2 Decos',
            'comision' => 25000,
            'instalacion' => 14000,
        ],
        [
            'codigo' => 'plan_premium_3decos',
            'nombre' => 'Plan Premium (TNT Sports) 3 Decos',
            'comision' => 25000,
            'instalacion' => 16000,
        ],
        [
            'codigo' => 'plan_premium_4decos',
            'nombre' => 'Plan Premium (TNT Sports) 4 Decos',
            'comision' => 30000,
            'instalacion' => 18000,
        ],
    ];

    $resultados = [];

    foreach ($planes as $p) {
        // A) Upsert en tabla planes
        $stmtPlan = $pdo->prepare("
            INSERT INTO planes (codigo, nombre, activo)
            VALUES (?, ?, 1)
            ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), activo = 1
        ");
        $stmtPlan->execute([$p['codigo'], $p['nombre']]);

        // Obtener ID del plan
        $stmtId = $pdo->prepare("SELECT id FROM planes WHERE codigo = ? LIMIT 1");
        $stmtId->execute([$p['codigo']]);
        $planId = (int) $stmtId->fetchColumn();

        // B) Gestionar Comisión vigente
        $stmtCom = $pdo->prepare("SELECT id, monto FROM comisiones_plan WHERE plan_id = ? AND vigente_hasta IS NULL LIMIT 1");
        $stmtCom->execute([$planId]);
        $comVigente = $stmtCom->fetch();

        if (!$comVigente) {
            $stmtNuevaCom = $pdo->prepare("
                INSERT INTO comisiones_plan (plan_id, monto, vigente_desde, vigente_hasta, creado_por)
                VALUES (?, ?, ?, NULL, ?)
            ");
            $stmtNuevaCom->execute([$planId, $p['comision'], $ahora, $adminId]);
        } elseif ((float) $comVigente['monto'] !== (float) $p['comision']) {
            $pdo->prepare("UPDATE comisiones_plan SET vigente_hasta = ? WHERE id = ?")
                ->execute([$ahora, $comVigente['id']]);
            $stmtNuevaCom = $pdo->prepare("
                INSERT INTO comisiones_plan (plan_id, monto, vigente_desde, vigente_hasta, creado_por)
                VALUES (?, ?, ?, NULL, ?)
            ");
            $stmtNuevaCom->execute([$planId, $p['comision'], $ahora, $adminId]);
        }

        // C) Gestionar Tarifa Instalación por Plan vigente
        $stmtInst = $pdo->prepare("SELECT id, monto FROM tarifas_instalacion_plan WHERE plan_id = ? AND vigente_hasta IS NULL LIMIT 1");
        $stmtInst->execute([$planId]);
        $instVigente = $stmtInst->fetch();

        if (!$instVigente) {
            $stmtNuevaInst = $pdo->prepare("
                INSERT INTO tarifas_instalacion_plan (plan_id, monto, vigente_desde, vigente_hasta, creado_por)
                VALUES (?, ?, ?, NULL, ?)
            ");
            $stmtNuevaInst->execute([$planId, $p['instalacion'], $ahora, $adminId]);
        } elseif ((float) $instVigente['monto'] !== (float) $p['instalacion']) {
            $pdo->prepare("UPDATE tarifas_instalacion_plan SET vigente_hasta = ? WHERE id = ?")
                ->execute([$ahora, $instVigente['id']]);
            $stmtNuevaInst = $pdo->prepare("
                INSERT INTO tarifas_instalacion_plan (plan_id, monto, vigente_desde, vigente_hasta, creado_por)
                VALUES (?, ?, ?, NULL, ?)
            ");
            $stmtNuevaInst->execute([$planId, $p['instalacion'], $ahora, $adminId]);
        }

        $resultados[] = [
            'codigo' => $p['codigo'],
            'nombre' => $p['nombre'],
            'comision' => $p['comision'],
            'instalacion' => $p['instalacion'],
        ];
    }

    echo json_encode([
        'ok' => true,
        'mensaje' => 'Planes, comisiones y tarifas de instalación configurados con éxito.',
        'total' => count($resultados),
        'planes' => $resultados,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'error' => true,
        'message' => $e->getMessage(),
    ]);
}
