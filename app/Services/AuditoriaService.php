<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\ApiException;
use App\Exceptions\NotFoundException;
use App\Repositories\OrdenFerreteriaRepository;
use App\Repositories\OrdenFotoRepository;
use App\Repositories\OrdenMaterialRepository;
use App\Repositories\OrdenRepository;

/**
 * El módulo que mueve una orden de 'enviada' a 'aprobada' / 'rechazada'.
 *
 * SIN PANTALLA EN EL PANEL desde que se auto-aprueba al enviar (pedido:
 * "elimina auditoria" — ver OrdenWizardService::confirmarEnviada()). Una
 * orden ya no queda 'enviada' esperando revisión: nace 'aprobada'. Esta
 * clase se deja intacta por si algún día hace falta una corrección manual
 * puntual desde la API directa (aprobar/rechazar/observar/reabrir siguen
 * andando), pero en el uso normal del día a día no se llama a nada de acá.
 */
final class AuditoriaService
{
    private OrdenRepository $ordenes;
    private OrdenMaterialRepository $materiales;
    private OrdenFotoRepository $fotos;
    private OrdenFerreteriaRepository $ordenFerreteria;

    public function __construct()
    {
        $this->ordenes = new OrdenRepository();
        $this->materiales = new OrdenMaterialRepository();
        $this->fotos = new OrdenFotoRepository();
        $this->ordenFerreteria = new OrdenFerreteriaRepository();
    }

    public function listarCola(?string $estado, ?int $tecnicoId): array
    {
        $ordenes = $this->ordenes->listar($estado ?? 'enviada', $tecnicoId);
        foreach ($ordenes as &$orden) {
            $orden['anomalias'] = $this->detectarAnomalias($orden);
        }
        return $ordenes;
    }

    public function detalle(int $ordenId): array
    {
        $orden = $this->obtenerOrden($ordenId);
        return $this->conDetalle($orden);
    }

    public function aprobar(int $ordenId, int $auditorId): array
    {
        $this->requerirAuditable($ordenId);
        $this->ordenes->actualizar($ordenId, [
            'estado' => 'aprobada',
            'auditor_id' => $auditorId,
            'fecha_auditoria' => date('Y-m-d H:i:s'),
        ]);
        return $this->detalle($ordenId);
    }

    /**
     * Solo aprueba las que no tienen ninguna anomalía marcada — el diseño
     * original fue explícito en esto: un "aprobar todo" sin filtro vuelve
     * la auditoría decorativa. Las que tienen anomalías o no están en un
     * estado auditable se listan como no procesadas, sin abortar el resto.
     */
    public function aprobarMasivo(array $ordenIds, int $auditorId): array
    {
        $resultados = [];
        foreach ($ordenIds as $idCrudo) {
            $id = (int) $idCrudo;
            $orden = $this->ordenes->find($id);
            if (!$orden) {
                $resultados[] = ['id' => $id, 'ok' => false, 'motivo' => 'no_encontrada'];
                continue;
            }
            if (!in_array($orden['estado'], ['enviada', 'observada'], true)) {
                $resultados[] = ['id' => $id, 'ok' => false, 'motivo' => 'estado_no_auditable'];
                continue;
            }
            $anomalias = $this->detectarAnomalias($orden);
            if ($anomalias) {
                $resultados[] = ['id' => $id, 'ok' => false, 'motivo' => 'tiene_anomalias', 'anomalias' => $anomalias];
                continue;
            }
            $this->ordenes->actualizar($id, [
                'estado' => 'aprobada', 'auditor_id' => $auditorId, 'fecha_auditoria' => date('Y-m-d H:i:s'),
            ]);
            $resultados[] = ['id' => $id, 'ok' => true];
        }
        return $resultados;
    }

    public function rechazar(int $ordenId, int $auditorId, string $motivo, ?string $comentario, bool $descuentaPago): array
    {
        $this->requerirAuditable($ordenId);
        $this->ordenes->actualizar($ordenId, [
            'estado' => $descuentaPago ? 'rechazada_penalizada' : 'rechazada_corregible',
            'motivo_rechazo' => $motivo,
            'comentario_auditoria' => $comentario,
            'auditor_id' => $auditorId,
            'fecha_auditoria' => date('Y-m-d H:i:s'),
        ]);
        return $this->detalle($ordenId);
    }

    public function observar(int $ordenId, int $auditorId, string $comentario): array
    {
        $this->requerirAuditable($ordenId);
        $this->ordenes->actualizar($ordenId, [
            'estado' => 'observada',
            'comentario_auditoria' => $comentario,
            'auditor_id' => $auditorId,
            'fecha_auditoria' => date('Y-m-d H:i:s'),
        ]);
        return $this->detalle($ordenId);
    }

    /**
     * Reabre una orden 'rechazada_corregible' para que el técnico la edite
     * y reenvíe. LÍMITE DELIBERADO: no revierte el consumo físico ya
     * confirmado (equipos/ferretería) ni permite volver a tocarlo desde el
     * wizard — ver OrdenWizardService::verificarConsumoNoConfirmado(). Solo
     * sirve para corregir fotos y datos de cierre técnico (los motivos de
     * rechazo más comunes: foto ilegible, datos incompletos). Si el rechazo
     * fue por "serie_incorrecta" y de verdad hay que cambiar qué equipo
     * quedó instalado, esa corrección la hace el administrador a mano en
     * bodega — no está automatizada.
     */
    public function reabrir(int $ordenId): array
    {
        $orden = $this->obtenerOrden($ordenId);
        if ($orden['estado'] !== 'rechazada_corregible') {
            throw new ApiException(
                'Solo se puede reabrir una orden rechazada de forma corregible.', 409, 'estado_invalido'
            );
        }
        $this->ordenes->actualizar($ordenId, [
            'estado' => 'borrador',
            'monto_bruto' => null,
            'porcentaje_aplicado' => null,
            'monto_tecnico' => null,
        ]);
        return $this->detalle($ordenId);
    }

    /**
     * Señales visibles para el auditor, no una calificación automática de
     * "orden mala" — el criterio de qué hacer con cada una sigue siendo
     * humano. Ver docs/wizard-api.md para el detalle de cada una.
     */
    private function detectarAnomalias(array $orden, ?array $materiales = null): array
    {
        $materiales ??= $this->materiales->paraOrden((int) $orden['id']);
        $anomalias = [];

        if (array_filter($materiales, static fn(array $m) => (int) $m['ingresado_manual'] === 1)) {
            $anomalias[] = 'serie_ingresada_a_mano';
        }
        if ($orden['estado'] === 'conflicto') {
            $anomalias[] = 'folio_en_conflicto';
        }
        if ((int) ($orden['creado_por_admin'] ?? 0) === 1) {
            $anomalias[] = 'registrada_por_admin';
        }
        return $anomalias;
    }

    private function conDetalle(array $orden): array
    {
        $materiales = $this->materiales->paraOrden((int) $orden['id']);
        $orden['materiales'] = $materiales;
        $orden['fotos'] = $this->fotos->paraOrden((int) $orden['id']);
        $orden['ferreteria'] = $this->ordenFerreteria->paraOrden((int) $orden['id']);
        $orden['anomalias'] = $this->detectarAnomalias($orden, $materiales);
        return $orden;
    }

    private function requerirAuditable(int $ordenId): array
    {
        $orden = $this->obtenerOrden($ordenId);
        if (!in_array($orden['estado'], ['enviada', 'observada'], true)) {
            throw new ApiException('Esta orden no está en un estado auditable.', 409, 'estado_invalido');
        }
        return $orden;
    }

    private function obtenerOrden(int $ordenId): array
    {
        $orden = $this->ordenes->find($ordenId);
        if (!$orden) {
            throw new NotFoundException('Orden no encontrada.');
        }
        return $orden;
    }
}
