<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Exceptions\ValidationException;
use App\Repositories\ComisionPlanRepository;
use App\Repositories\PlanRepository;
use App\Repositories\TarifaInstalacionPlanRepository;
use App\Repositories\TarifaServicioRepository;
use App\Repositories\TipoServicioRepository;

/**
 * Editar acá NUNCA reescribe un monto existente — siempre cierra la fila
 * vigente y crea una nueva (ver TarifaServicioRepository::cerrarYCrear).
 * Es la garantía de que una orden ya aprobada no se mueve si el precio
 * cambia después.
 */
final class TarifarioService
{
    private TarifaServicioRepository $tarifas;
    private TipoServicioRepository $tiposServicio;
    private ComisionPlanRepository $comisiones;
    private PlanRepository $planes;
    private TarifaInstalacionPlanRepository $tarifasInstalacionPlan;

    public function __construct()
    {
        $this->tarifas = new TarifaServicioRepository();
        $this->tiposServicio = new TipoServicioRepository();
        $this->comisiones = new ComisionPlanRepository();
        $this->planes = new PlanRepository();
        $this->tarifasInstalacionPlan = new TarifaInstalacionPlanRepository();
    }

    public function listarTarifas(): array
    {
        return $this->tarifas->todasVigentes();
    }

    public function editarTarifa(string $tipoServicioCodigo, float $monto, int $editorId): array
    {
        if ($monto <= 0) {
            throw new ValidationException('El monto debe ser mayor que cero.');
        }
        $tipo = $this->tiposServicio->findByCodigo($tipoServicioCodigo);
        if (!$tipo) {
            throw new ValidationException('Tipo de servicio desconocido: ' . $tipoServicioCodigo);
        }
        Database::transaction(function () use ($tipo, $monto, $editorId) {
            $this->tarifas->cerrarYCrear((int) $tipo['id'], $monto, $editorId);
        });
        return $this->tarifas->vigentePara((int) $tipo['id']);
    }

    /**
     * "Eliminar" una tarifa de tipo de servicio (pedido: "que aplique igual
     * para las Tarifas por tipo de servicio") — ver
     * TarifaServicioRepository::cerrarSinCrear para el porqué del aviso
     * fuerte en el panel: sin tarifa vigente, esa clase de orden queda
     * bloqueada para todos los técnicos hasta que se cargue un monto nuevo.
     */
    public function eliminarTarifa(string $tipoServicioCodigo): array
    {
        $tipo = $this->tiposServicio->findByCodigo($tipoServicioCodigo);
        if (!$tipo) {
            throw new ValidationException('Tipo de servicio desconocido: ' . $tipoServicioCodigo);
        }
        $this->tarifas->cerrarSinCrear((int) $tipo['id']);
        return $this->tarifas->todasVigentes();
    }

    public function listarComisiones(): array
    {
        return $this->comisiones->todasVigentes();
    }

    /**
     * Alta de un plan nuevo (pedido: "que al elegir el plan venga los
     * planes que hay" — antes solo existía 'plan_full', sembrado en el
     * schema, y no había forma de agregar otro sin tocar la base a mano).
     * Nace con su propia comisión vigente — sin esto quedaría sin fila en
     * comisiones_plan y ninguna venta con ese plan podría confirmar su monto.
     */
    public function crearPlan(string $codigo, string $nombre, float $comisionInicial, int $editorId): array
    {
        $codigo = trim($codigo);
        $nombre = trim($nombre);
        if ($codigo === '' || !preg_match('/^[a-z0-9_]+$/', $codigo)) {
            throw new ValidationException('El código del plan debe tener solo minúsculas, números o guion bajo.');
        }
        if ($nombre === '') {
            throw new ValidationException('El nombre del plan no puede estar vacío.');
        }
        if ($this->planes->existeCodigo($codigo)) {
            throw new ValidationException('Ya existe un plan con ese código.');
        }
        if ($comisionInicial <= 0) {
            throw new ValidationException('La comisión inicial debe ser mayor que cero.');
        }

        return Database::transaction(function () use ($codigo, $nombre, $comisionInicial, $editorId) {
            $planId = $this->planes->crear($codigo, $nombre);
            $this->comisiones->cerrarYCrear($planId, $comisionInicial, $editorId);
            return $this->comisiones->vigentePara($planId);
        });
    }

    /**
     * "Borrar" un plan = desactivarlo (ver PlanRepository::cambiarActivo
     * para el porqué). Devuelve la lista completa de comisiones para que el
     * panel pueda repintar la tabla entera de una — el plan no desaparece
     * de acá, solo cambia su columna "Activo" y se saca del selector del
     * técnico.
     */
    public function cambiarActivoPlan(string $codigo, bool $activo): array
    {
        $plan = $this->planes->porCodigoCualquiera($codigo);
        if (!$plan) {
            throw new ValidationException('Plan desconocido: ' . $codigo);
        }
        $this->planes->cambiarActivo((int) $plan['id'], $activo);
        return $this->comisiones->todasVigentes();
    }

    public function editarComision(string $planCodigo, float $monto, int $editorId): array
    {
        if ($monto <= 0) {
            throw new ValidationException('El monto debe ser mayor que cero.');
        }
        $plan = $this->planes->porCodigo($planCodigo);
        if (!$plan) {
            throw new ValidationException('Plan desconocido: ' . $planCodigo);
        }
        Database::transaction(function () use ($plan, $monto, $editorId) {
            $this->comisiones->cerrarYCrear((int) $plan['id'], $monto, $editorId);
        });
        return $this->comisiones->vigentePara((int) $plan['id']);
    }

    /**
     * Tarifa de instalación según el plan (confirmado: "los planes van
     * subiendo por cantidad de decos" — ver OrdenWizardService::calcularMontoBruto).
     * No exige que todos los planes tengan una fila acá — mientras no la
     * tengan, esa instalación sigue cobrando el monto plano de
     * tarifas_servicio, ni bloquea ni rompe nada.
     */
    public function listarTarifasInstalacion(): array
    {
        // Pedido: "eliminar esta parte [el formulario Plan+Monto separado]
        // en cambio un boton de editar" — lista TODOS los planes (con o
        // sin fila vigente) para poder editar cualquiera desde su propia
        // fila, en vez de necesitar un selector aparte para los que
        // todavía no tienen tarifa. Ver TarifaInstalacionPlanRepository::todosLosPlanesConTarifa.
        return $this->tarifasInstalacionPlan->todosLosPlanesConTarifa();
    }

    public function editarTarifaInstalacion(string $planCodigo, float $monto, int $editorId): array
    {
        if ($monto <= 0) {
            throw new ValidationException('El monto debe ser mayor que cero.');
        }
        $plan = $this->planes->porCodigo($planCodigo);
        if (!$plan) {
            throw new ValidationException('Plan desconocido: ' . $planCodigo);
        }
        Database::transaction(function () use ($plan, $monto, $editorId) {
            $this->tarifasInstalacionPlan->cerrarYCrear((int) $plan['id'], $monto, $editorId);
        });
        return $this->tarifasInstalacionPlan->vigentePara((int) $plan['id']);
    }

    /**
     * "Eliminar" la instalación por plan de un plan puntual (pedido: "que
     * aplique a todos los planes o instalaciones de tarifario") — deja de
     * tener fila vigente, así que esa instalación vuelve al monto plano.
     * No borra el plan en sí (eso es cambiarActivoPlan) ni su historial de
     * montos — ver TarifaInstalacionPlanRepository::cerrarSinCrear.
     */
    public function eliminarTarifaInstalacion(string $planCodigo): array
    {
        $plan = $this->planes->porCodigoCualquiera($planCodigo);
        if (!$plan) {
            throw new ValidationException('Plan desconocido: ' . $planCodigo);
        }
        $this->tarifasInstalacionPlan->cerrarSinCrear((int) $plan['id']);
        return $this->tarifasInstalacionPlan->todosLosPlanesConTarifa();
    }

    /**
     * Editar el NOMBRE de un tipo de servicio (pedido: "un boton de editar
     * que deje editar todos los campos ya sea nombre y valor"). `codigo`
     * nunca cambia — es lo que usa el resto del sistema (wizard, kits ya
     * eliminados, etc.) para identificarlo.
     */
    public function editarNombreTarifa(string $tipoServicioCodigo, string $nombre): array
    {
        $nombre = trim($nombre);
        if ($nombre === '') {
            throw new ValidationException('El nombre no puede estar vacío.');
        }
        $tipo = $this->tiposServicio->findByCodigo($tipoServicioCodigo);
        if (!$tipo) {
            throw new ValidationException('Tipo de servicio desconocido: ' . $tipoServicioCodigo);
        }
        $this->tiposServicio->actualizarNombre((int) $tipo['id'], $nombre);
        return $this->tarifas->todasVigentes();
    }

    /**
     * Editar el NOMBRE de un plan — afecta por igual a como se ve en
     * "Comisiones por plan" e "Instalación por plan" (mismo `planes.nombre`
     * subyacente), y a lo que ve el técnico en "Registrar venta". `codigo`
     * nunca cambia.
     */
    public function editarNombrePlan(string $planCodigo, string $nombre): array
    {
        $nombre = trim($nombre);
        if ($nombre === '') {
            throw new ValidationException('El nombre no puede estar vacío.');
        }
        $plan = $this->planes->porCodigoCualquiera($planCodigo);
        if (!$plan) {
            throw new ValidationException('Plan desconocido: ' . $planCodigo);
        }
        $this->planes->actualizarNombre((int) $plan['id'], $nombre);
        return [
            'comisiones' => $this->comisiones->todasVigentes(),
            'tarifas_instalacion' => $this->tarifasInstalacionPlan->todosLosPlanesConTarifa(),
        ];
    }
}
