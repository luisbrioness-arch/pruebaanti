<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

final class EquipoRepository
{
    /**
     * @param bool $bloqueando SELECT ... FOR UPDATE — usar dentro de
     *   Database::transaction() cuando el llamador va a decidir un cambio de
     *   estado en base a lo leído (aceptar/rechazar un traspaso), para que
     *   dos confirmaciones casi simultáneas del mismo equipo no pisen la
     *   misma fila dos veces (mismo motivo que LiquidacionService::cerrarPeriodo).
     */
    public function find(int $id, bool $bloqueando = false): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM equipos WHERE id = ?' . ($bloqueando ? ' FOR UPDATE' : ''));
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function porSerie(string $numeroSerie): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM equipos WHERE numero_serie = ?');
        $stmt->execute([$numeroSerie]);
        return $stmt->fetch() ?: null;
    }

    /** Buscador del admin — coincidencia parcial, no hace falta la serie exacta. */
    public function buscarPorSerie(string $q): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT e.*, te.nombre AS tipo_equipo_nombre, u.nombre AS tecnico_nombre
             FROM equipos e
             JOIN tipos_equipo te ON te.id = e.tipo_equipo_id
             LEFT JOIN usuarios u ON u.id = e.usuario_actual_id
             WHERE e.numero_serie LIKE ?
             ORDER BY e.numero_serie ASC
             LIMIT 30"
        );
        $stmt->execute(['%' . $q . '%']);
        return $stmt->fetchAll();
    }

    /**
     * @param int|null $origenPendienteId Solo tiene sentido junto con
     *   estado 'en_transito' cuando vino de OTRO TÉCNICO: de dónde salió,
     *   para poder devolverlo ahí si lo rechaza (NULL = vino de una bodega,
     *   o no aplica). Se limpia (pasando null) en cuanto el equipo sale de
     *   'en_transito', para cualquier lado.
     * @param int|null $bodegaId Qué bodega física lo tiene — el llamador es
     *   responsable de pasar el valor correcto en cada transición (ver
     *   BodegaService, cada método explica de dónde sale el suyo).
     */
    public function actualizarEstado(
        int $id,
        string $estado,
        ?int $usuarioActualId,
        ?int $ordenInstalacionId,
        ?int $origenPendienteId = null,
        ?int $bodegaId = null
    ): void {
        $stmt = Database::connection()->prepare(
            'UPDATE equipos SET estado = ?, usuario_actual_id = ?, orden_instalacion_id = ?, origen_pendiente_id = ?, bodega_id = ? WHERE id = ?'
        );
        $stmt->execute([$estado, $usuarioActualId, $ordenInstalacionId, $origenPendienteId, $bodegaId, $id]);
    }

    /** Equipos en camino hacia este técnico, esperando que los confirme (ver docs/bodegas-traspasos.md). */
    public function pendientesPara(int $tecnicoId): array
    {
        $stmt = Database::connection()->prepare(
            "SELECT e.*, te.nombre AS tipo_equipo_nombre, uo.nombre AS origen_nombre
             FROM equipos e
             JOIN tipos_equipo te ON te.id = e.tipo_equipo_id
             LEFT JOIN usuarios uo ON uo.id = e.origen_pendiente_id
             WHERE e.estado = 'en_transito' AND e.usuario_actual_id = ?
             ORDER BY e.actualizado_en ASC"
        );
        $stmt->execute([$tecnicoId]);
        return $stmt->fetchAll();
    }

    /** Alta en bodega — siempre nace en estado 'bodega', sin dueño, en la bodega física que eligió el admin. */
    public function crear(int $tipoEquipoId, string $numeroSerie, int $bodegaId): int
    {
        $stmt = Database::connection()->prepare(
            "INSERT INTO equipos (tipo_equipo_id, numero_serie, estado, bodega_id) VALUES (?, ?, 'bodega', ?)"
        );
        $stmt->execute([$tipoEquipoId, $numeroSerie, $bodegaId]);
        return (int) Database::connection()->lastInsertId();
    }

    public function listar(?string $estado, ?int $tecnicoId, ?int $bodegaId = null): array
    {
        $sql = "SELECT e.*, te.codigo AS tipo_equipo_codigo, te.nombre AS tipo_equipo_nombre, u.nombre AS tecnico_nombre, b.nombre AS bodega_nombre
                FROM equipos e
                JOIN tipos_equipo te ON te.id = e.tipo_equipo_id
                LEFT JOIN usuarios u ON u.id = e.usuario_actual_id
                LEFT JOIN bodegas b ON b.id = e.bodega_id
                WHERE 1=1";
        $params = [];
        if ($estado !== null) {
            $sql .= ' AND e.estado = :estado';
            $params['estado'] = $estado;
        }
        if ($tecnicoId !== null) {
            $sql .= ' AND e.usuario_actual_id = :tecnico_id';
            $params['tecnico_id'] = $tecnicoId;
        }
        if ($bodegaId !== null) {
            $sql .= ' AND e.bodega_id = :bodega_id';
            $params['bodega_id'] = $bodegaId;
        }
        $sql .= ' ORDER BY te.nombre ASC, e.numero_serie ASC, e.id DESC';
        $stmt = Database::connection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
}
