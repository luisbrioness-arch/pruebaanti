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

    /**
     * @param int|null $origenPendienteId Solo tiene sentido junto con
     *   estado 'en_transito': de dónde salió, para poder devolverlo ahí si
     *   el técnico lo rechaza (NULL = bodega central). Se limpia (pasando
     *   null) en cuanto el equipo sale de 'en_transito', para cualquier lado.
     */
    public function actualizarEstado(
        int $id,
        string $estado,
        ?int $usuarioActualId,
        ?int $ordenInstalacionId,
        ?int $origenPendienteId = null
    ): void {
        $stmt = Database::connection()->prepare(
            'UPDATE equipos SET estado = ?, usuario_actual_id = ?, orden_instalacion_id = ?, origen_pendiente_id = ? WHERE id = ?'
        );
        $stmt->execute([$estado, $usuarioActualId, $ordenInstalacionId, $origenPendienteId, $id]);
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

    /** Alta en bodega — siempre nace en estado 'bodega', sin dueño. */
    public function crear(int $tipoEquipoId, string $numeroSerie): int
    {
        $stmt = Database::connection()->prepare(
            "INSERT INTO equipos (tipo_equipo_id, numero_serie, estado) VALUES (?, ?, 'bodega')"
        );
        $stmt->execute([$tipoEquipoId, $numeroSerie]);
        return (int) Database::connection()->lastInsertId();
    }

    public function listar(?string $estado, ?int $tecnicoId): array
    {
        $sql = "SELECT e.*, te.codigo AS tipo_equipo_codigo, te.nombre AS tipo_equipo_nombre, u.nombre AS tecnico_nombre
                FROM equipos e
                JOIN tipos_equipo te ON te.id = e.tipo_equipo_id
                LEFT JOIN usuarios u ON u.id = e.usuario_actual_id
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
        $sql .= ' ORDER BY e.creado_en DESC';
        $stmt = Database::connection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
}
