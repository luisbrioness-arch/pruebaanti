<?php

declare(strict_types=1);

// Script para sembrar datos de prueba: decodificadores en bodega, 10 ventas y 10 órdenes de trabajo
if (($_GET['key'] ?? '') !== 'terreno_seed_2026') {
    http_response_code(403);
    echo json_encode(['error' => 'Acceso no autorizado']);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

require_once dirname(__DIR__) . '/app/Core/Database.php';

use App\Core\Database;

try {
    $pdo = Database::connection();

    // 1. Obtener datos de referencia
    $usuarios = $pdo->query("SELECT id, nombre, rol, porcentaje_reparto FROM usuarios WHERE activo = 1")->fetchAll();
    if (empty($usuarios)) {
        throw new Exception("No hay usuarios activos");
    }
    $tecnico = $usuarios[0]; // Edwin u otro
    $tecnicoId = (int) $tecnico['id'];
    $porcentajeReparto = (float) $tecnico['porcentaje_reparto'];

    $bodegas = $pdo->query("SELECT id, nombre FROM bodegas LIMIT 1")->fetchAll();
    $bodegaId = !empty($bodegas) ? (int) $bodegas[0]['id'] : 1;

    $tiposEquipo = $pdo->query("SELECT id, codigo, nombre FROM tipos_equipo WHERE codigo LIKE '%deco%' OR nombre LIKE '%Deco%'")->fetchAll();
    if (empty($tiposEquipo)) {
        $tiposEquipo = $pdo->query("SELECT id, codigo, nombre FROM tipos_equipo LIMIT 1")->fetchAll();
    }
    $tipoDecoId = (int) $tiposEquipo[0]['id'];

    $planes = $pdo->query("SELECT id, codigo, nombre FROM planes WHERE activo = 1")->fetchAll();
    if (empty($planes)) {
        throw new Exception("No hay planes configurados");
    }

    $tiposServicio = $pdo->query("SELECT id, codigo, nombre FROM tipos_servicio WHERE activo = 1")->fetchAll();
    if (empty($tiposServicio)) {
        throw new Exception("No hay tipos de servicio configurados");
    }

    $pdo->beginTransaction();

    // 2. Generar 15 Decodificadores en Bodega
    $decosCreados = [];
    $numRandomBase = rand(10000, 89999);
    for ($i = 1; $i <= 15; $i++) {
        $serie = sprintf("TUV-DEC-2026-%04d", $numRandomBase + $i);
        // Verificar si ya existe
        $check = $pdo->prepare("SELECT id FROM equipos WHERE numero_serie = ?");
        $check->execute([$serie]);
        if (!$check->fetch()) {
            $stmt = $pdo->prepare("INSERT INTO equipos (tipo_equipo_id, numero_serie, estado, bodega_id, creado_en) VALUES (?, ?, 'bodega', ?, NOW())");
            $stmt->execute([$tipoDecoId, $serie, $bodegaId]);
            $equipoId = (int) $pdo->lastInsertId();

            // Movimiento inicial de alta en bodega
            $stmtMov = $pdo->prepare("INSERT INTO movimientos_equipo (equipo_id, tipo_movimiento, usuario_origen_id, usuario_destino_id, creado_en) VALUES (?, 'alta_bodega', NULL, NULL, NOW())");
            $stmtMov->execute([$equipoId]);
            $decosCreados[] = $serie;
        }
    }

    // 3. Generar 10 Ventas (algunas registradas pendientes, otras instaladas)
    $clientesMuestra = [
        ['nombre' => 'Carlos Mendoza Riquelme', 'rut' => '15.482.910-3', 'dir' => 'Av. O Higgins 1240', 'comuna' => 'Chillán', 'tel' => '+56987654321'],
        ['nombre' => 'Patricia Morales Soto', 'rut' => '16.732.194-K', 'dir' => 'Los Carrera 450', 'comuna' => 'San Carlos', 'tel' => '+56976543210'],
        ['nombre' => 'Juan Pablo Navarrete', 'rut' => '14.289.431-7', 'dir' => 'Pasaje Las Lilas 89', 'comuna' => 'Chillán Viejo', 'tel' => '+56965432109'],
        ['nombre' => 'Andrea Valenzuela Pino', 'rut' => '17.842.109-2', 'dir' => 'Calle Prat 321', 'comuna' => 'Bulnes', 'tel' => '+56954321098'],
        ['nombre' => 'Rodrigo Sepúlveda Castro', 'rut' => '13.910.482-1', 'dir' => 'Camino Las Mariposas Km 4', 'comuna' => 'Chillán', 'tel' => '+56943210987'],
        ['nombre' => 'Camila Fuentes Arriagada', 'rut' => '18.192.483-5', 'dir' => 'Calle Freire 780', 'comuna' => 'Quirihue', 'tel' => '+56932109876'],
        ['nombre' => 'Mauricio Garrido Silva', 'rut' => '15.932.108-9', 'dir' => 'Av. Independencia 540', 'comuna' => 'Coelemu', 'tel' => '+56921098765'],
        ['nombre' => 'Daniela Herrera Campos', 'rut' => '17.109.843-8', 'dir' => 'Pasaje Los Aromos 23', 'comuna' => 'Yungay', 'tel' => '+56910987654'],
        ['nombre' => 'Francisco Baeza Muñoz', 'rut' => '14.832.109-4', 'dir' => 'Calle Serrano 102', 'comuna' => 'Pinto', 'tel' => '+56909876543'],
        ['nombre' => 'Marcela Toledo Vásquez', 'rut' => '16.482.910-1', 'dir' => 'Av. Balmaceda 890', 'comuna' => 'Quillón', 'tel' => '+56998765432'],
    ];

    $ventasCreadas = [];
    $hoy = new DateTime();

    foreach ($clientesMuestra as $idx => $c) {
        $plan = $planes[$idx % count($planes)];
        $numTuves = 'TUV-' . rand(100000, 999999);
        
        // 5 pendientes de instalar para que el dashboard tenga trabajo por hacer, 5 ya instaladas con comisión
        $esInstalada = ($idx >= 5);
        $estado = $esInstalada ? 'instalada' : 'registrada';
        
        // Días de fecha solicitada: algunas hoy, otras en 1 día, en 2 días, o sin fecha
        $diasOffset = ($idx - 2);
        $fechaSoli = (clone $hoy)->modify("+$diasOffset days")->format('Y-m-d');
        if ($idx === 4) $fechaSoli = null; // una sin fecha

        $montoComision = 15000 + (($idx % 4) * 5000); // 15k, 20k, 25k, 30k
        $montoVendedor = $esInstalada ? round($montoComision * ($porcentajeReparto / 100)) : null;

        $stmtV = $pdo->prepare("
            INSERT INTO ventas (
                numero_venta_tuves, cliente_nombre, cliente_rut, cliente_direccion, cliente_telefono,
                fecha_instalacion_solicitada, comuna, plan_id, vendedor_id, estado,
                monto_comision, porcentaje_aplicado, monto_vendedor, creado_en
            ) VALUES (
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, NOW()
            )
        ");

        $stmtV->execute([
            $numTuves, $c['nombre'], $c['rut'], $c['dir'], $c['tel'],
            $fechaSoli, $c['comuna'], $plan['id'], $tecnicoId, $estado,
            $esInstalada ? $montoComision : null,
            $esInstalada ? $porcentajeReparto : null,
            $montoVendedor
        ]);

        $ventasCreadas[] = [
            'id' => (int) $pdo->lastInsertId(),
            'cliente' => $c['nombre'],
            'plan' => $plan['nombre'],
            'estado' => $estado,
            'comuna' => $c['comuna']
        ];
    }

    // 4. Generar 10 Órdenes de Servicio / Instalación
    $ordenesCreadas = [];
    $folioBase = rand(50000, 80000);

    for ($j = 0; $j < 10; $j++) {
        $folio = "OT-" . ($folioBase + $j);
        $tipoServ = $tiposServicio[$j % count($tiposServicio)];
        $diasAtras = rand(1, 6);
        $fechaTrabajo = (clone $hoy)->modify("-$diasAtras days")->format('Y-m-d H:i:s');
        $uuid = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );

        // Si es una instalación nueva, la podemos enlazar a una de las ventas instaladas
        $ventaEnlazadaId = ($j < count($ventasCreadas) && $ventasCreadas[$j]['estado'] === 'instalada')
            ? $ventasCreadas[$j]['id']
            : null;

        $montoBruto = 12000 + (($j % 4) * 2000); // 12k, 14k, 16k, 18k
        $montoTecnico = round($montoBruto * ($porcentajeReparto / 100));

        $stmtO = $pdo->prepare("
            INSERT INTO ordenes (
                uuid_dispositivo, folio, tipo_servicio_id, tecnico_id, venta_id,
                estado, fecha_trabajo_dispositivo, fecha_auditoria,
                monto_bruto, porcentaje_aplicado, monto_tecnico, creado_por_admin, creado_en
            ) VALUES (
                ?, ?, ?, ?, ?,
                'aprobada', ?, NOW(),
                ?, ?, ?, 0, NOW()
            )
        ");

        $stmtO->execute([
            $uuid, $folio, $tipoServ['id'], $tecnicoId, $ventaEnlazadaId,
            $fechaTrabajo, $montoBruto, $porcentajeReparto, $montoTecnico
        ]);

        $ordenId = (int) $pdo->lastInsertId();

        // Registrar material instalado ficticio en orden_materiales
        if (!empty($decosCreados) && isset($decosCreados[$j % count($decosCreados)])) {
            $serieUsada = $decosCreados[$j % count($decosCreados)];
            $eq = $pdo->prepare("SELECT id FROM equipos WHERE numero_serie = ?");
            $eq->execute([$serieUsada]);
            $eqRow = $eq->fetch();
            if ($eqRow) {
                $eqId = (int) $eqRow['id'];
                $pdo->prepare("INSERT INTO orden_materiales (orden_id, equipo_id, accion) VALUES (?, ?, 'instalado')")->execute([$ordenId, $eqId]);
            }
        }

        $ordenesCreadas[] = [
            'id' => $ordenId,
            'folio' => $folio,
            'tipo' => $tipoServ['nombre'],
            'monto_tecnico' => $montoTecnico,
            'fecha' => $fechaTrabajo
        ];
    }

    $pdo->commit();

    echo json_encode([
        'ok' => true,
        'mensaje' => 'Datos sembrados con éxito',
        'decos_bodega' => count($decosCreados),
        'ventas' => count($ventasCreadas),
        'ordenes' => count($ordenesCreadas),
        'resumen' => [
            'ventas_pendientes' => 5,
            'ventas_instaladas' => 5,
            'ordenes_aprobadas' => 10,
            'decos_agregados' => $decosCreados
        ]
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => $e->getMessage(),
        'trace' => $e->getFile() . ':' . $e->getLine()
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}
