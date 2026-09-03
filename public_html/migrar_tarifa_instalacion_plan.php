<?php
// Script de un solo uso — crea tarifas_instalacion_plan (pedido: "los planes
// van subiendo por cantidad de decos" → la instalación cobra según el plan
// vendido, no un monto plano). Idempotente. Abrir una vez y BORRAR.
declare(strict_types=1);

$config = require __DIR__ . '/../config/config.php';
$db = $config['db'];
$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=%s', $db['host'], $db['name'], $db['charset'] ?? 'utf8mb4'),
    $db['user'],
    $db['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

header('Content-Type: text/plain; charset=utf-8');

$stmt = $pdo->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'tarifas_instalacion_plan'");
$stmt->execute();
if ($stmt->fetchColumn()) {
    echo "SKIP: tabla tarifas_instalacion_plan ya existía\n";
} else {
    $pdo->exec("CREATE TABLE tarifas_instalacion_plan (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        plan_id INT UNSIGNED NOT NULL,
        monto DECIMAL(10,0) NOT NULL,
        vigente_desde DATETIME NOT NULL,
        vigente_hasta DATETIME NULL,
        creado_por INT UNSIGNED NOT NULL,
        creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_tarifainstplan_plan FOREIGN KEY (plan_id) REFERENCES planes(id),
        CONSTRAINT fk_tarifainstplan_usuario FOREIGN KEY (creado_por) REFERENCES usuarios(id),
        KEY idx_tarifainstplan_vigencia (plan_id, vigente_desde, vigente_hasta)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    echo "OK: tabla tarifas_instalacion_plan creada\n";
}

echo "\n== Listo. BORRA ESTE ARCHIVO AHORA. ==\n";
