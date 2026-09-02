<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Repositories\ItemFerreteriaRepository;
use App\Repositories\PlanRepository;
use App\Repositories\TipoServicioRepository;

/**
 * Endpoints de solo lectura que el celular cachea para poder validar cosas
 * offline (maleta) o armar el formulario (tipos de servicio + requisitos
 * de foto + kit estándar).
 */
final class CatalogoController
{
    public function tiposServicio(Request $req): void
    {
        Auth::id();
        $repo = new TipoServicioRepository();
        $tipos = $repo->all();
        foreach ($tipos as &$tipo) {
            $tipo['requisitos_foto'] = $repo->requisitosFoto((int) $tipo['id']);
        }
        unset($tipo);
        Response::json(['tipos_servicio' => $tipos]);
    }

    /** Para el selector de plan del formulario "Registrar venta". */
    public function planes(Request $req): void
    {
        Auth::id();
        Response::json(['planes' => (new PlanRepository())->activos()]);
    }

    /**
     * Catálogo completo de ferretería — para que el paso 4 del wizard pueda
     * ofrecer "agregar un ítem fuera del kit", no solo ajustar cantidades de
     * lo que ya trae el kit por defecto (ver docs/tecnico-app.md). No exige
     * admin: cualquier técnico autenticado necesita verlo para su propio
     * cierre. El registro real (`POST /ordenes/{uuid}/ferreteria`) ya
     * aceptaba cualquier item_ferreteria_id válido — esto solo le da al
     * técnico de dónde elegirlo.
     */
    public function itemsFerreteria(Request $req): void
    {
        Auth::id();
        Response::json(['items' => (new ItemFerreteriaRepository())->all()]);
    }

    /** La "maleta virtual": lo que el técnico puede validar aunque no tenga señal. */
    public function maleta(Request $req): void
    {
        $tecnicoId = Auth::id();
        $pdo = Database::connection();

        $stmtEquipos = $pdo->prepare(
            "SELECT e.id, e.numero_serie, e.estado, te.codigo AS tipo_equipo, te.nombre AS tipo_equipo_nombre
             FROM equipos e
             JOIN tipos_equipo te ON te.id = e.tipo_equipo_id
             WHERE e.usuario_actual_id = ? AND e.estado = 'maleta'"
        );
        $stmtEquipos->execute([$tecnicoId]);

        $stmtFerreteria = $pdo->prepare(
            "SELECT i.codigo, i.nombre, i.unidad_medida, s.cantidad_actual
             FROM stock_ferreteria_usuario s
             JOIN items_ferreteria i ON i.id = s.item_ferreteria_id
             WHERE s.usuario_id = ?"
        );
        $stmtFerreteria->execute([$tecnicoId]);

        Response::json([
            'equipos' => $stmtEquipos->fetchAll(),
            'ferreteria' => $stmtFerreteria->fetchAll(),
        ]);
    }
}
