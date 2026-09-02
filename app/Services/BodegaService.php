<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Exceptions\ApiException;
use App\Exceptions\NotFoundException;
use App\Exceptions\ValidationException;
use App\Repositories\EntregaFerreteriaPendienteRepository;
use App\Repositories\EquipoRepository;
use App\Repositories\ItemFerreteriaRepository;
use App\Repositories\KitServicioItemRepository;
use App\Repositories\MovimientoEquipoRepository;
use App\Repositories\MovimientoFerreteriaRepository;
use App\Repositories\StockFerreteriaUsuarioRepository;
use App\Repositories\TipoEquipoRepository;
use App\Repositories\TipoServicioRepository;
use App\Repositories\UsuarioRepository;

/**
 * Sin este servicio, el wizard del técnico no tiene nada que escanear: es
 * la puerta de entrada del inventario al sistema (respuesta 5: los equipos
 * y la ferretería existen porque alguien los dio de alta acá primero).
 *
 * "Bodegas" (pedido admin): la bodega central es equipos.estado = 'bodega'
 * (sin dueño) y la bodega de cada técnico es su 'maleta' (usuario_actual_id
 * = él) — ya existían como concepto, solo faltaba que lo que se manda de
 * una a otra pase por una confirmación del que recibe (ver más abajo) en
 * vez de aplicarse solo. Ver docs/bodegas-traspasos.md.
 */
final class BodegaService
{
    private EquipoRepository $equipos;
    private TipoEquipoRepository $tiposEquipo;
    private MovimientoEquipoRepository $movimientosEquipo;
    private ItemFerreteriaRepository $itemsFerreteria;
    private StockFerreteriaUsuarioRepository $stockFerreteria;
    private MovimientoFerreteriaRepository $movimientosFerreteria;
    private EntregaFerreteriaPendienteRepository $entregasFerreteriaPendientes;
    private UsuarioRepository $usuarios;
    private KitServicioItemRepository $kits;
    private TipoServicioRepository $tiposServicio;

    public function __construct()
    {
        $this->equipos = new EquipoRepository();
        $this->tiposEquipo = new TipoEquipoRepository();
        $this->movimientosEquipo = new MovimientoEquipoRepository();
        $this->itemsFerreteria = new ItemFerreteriaRepository();
        $this->stockFerreteria = new StockFerreteriaUsuarioRepository();
        $this->movimientosFerreteria = new MovimientoFerreteriaRepository();
        $this->entregasFerreteriaPendientes = new EntregaFerreteriaPendienteRepository();
        $this->usuarios = new UsuarioRepository();
        $this->kits = new KitServicioItemRepository();
        $this->tiposServicio = new TipoServicioRepository();
    }

    public function listarEquipos(?string $estado, ?int $tecnicoId): array
    {
        return $this->equipos->listar($estado, $tecnicoId);
    }

    public function altaEquipo(string $tipoEquipoCodigo, string $numeroSerie): array
    {
        $tipo = $this->tiposEquipo->porCodigo($tipoEquipoCodigo);
        if (!$tipo) {
            throw new ValidationException('Tipo de equipo desconocido: ' . $tipoEquipoCodigo);
        }
        $numeroSerie = trim($numeroSerie);
        if ($numeroSerie === '') {
            throw new ValidationException('El número de serie no puede estar vacío.');
        }
        if ($this->equipos->porSerie($numeroSerie)) {
            throw new ValidationException('Ya existe un equipo registrado con esa serie.');
        }

        $id = $this->equipos->crear((int) $tipo['id'], $numeroSerie);
        $this->movimientosEquipo->crear($id, 'ingreso_bodega', null, null, null, 'Alta inicial en bodega');
        return $this->equipos->find($id);
    }

    /**
     * Envía un equipo de bodega a un técnico — queda 'en_transito' hasta
     * que el técnico confirma que lo recibió con la serie correcta (ver
     * aceptarEquipo/rechazarEquipo). Antes esto aplicaba al toque; ahora es
     * un pedido que el otro lado tiene que aceptar.
     */
    public function asignarAMaleta(int $equipoId, int $tecnicoId): array
    {
        $equipo = $this->requerirEquipo($equipoId);
        if ($equipo['estado'] !== 'bodega') {
            throw new ApiException(
                'Solo se puede enviar un equipo que está en bodega (estado actual: ' . $equipo['estado'] . ').',
                409,
                'estado_invalido'
            );
        }
        if (!$this->usuarios->find($tecnicoId)) {
            throw new ValidationException('Técnico inexistente.');
        }

        $this->equipos->actualizarEstado($equipoId, 'en_transito', $tecnicoId, null, null);
        $this->movimientosEquipo->crear($equipoId, 'traspaso_pendiente', null, $tecnicoId, null);
        return $this->equipos->find($equipoId);
    }

    /**
     * Traspaso directo entre maletas, sin pasar por bodega (respuesta 9):
     * cubre el caso real de que un técnico le entregue un equipo a otro en
     * terreno, sin que ninguno de los dos pise la bodega ese día. Igual que
     * asignarAMaleta, ahora queda 'en_transito' esperando que el técnico
     * destino confirme — origen_pendiente_id guarda de qué maleta salió,
     * para devolverlo ahí si lo rechaza.
     */
    public function traspasarEquipo(int $equipoId, int $tecnicoDestinoId): array
    {
        $equipo = $this->requerirEquipo($equipoId);
        if ($equipo['estado'] !== 'maleta') {
            throw new ApiException(
                'Solo se puede traspasar un equipo que está en la maleta de un técnico (estado actual: ' . $equipo['estado'] . ').',
                409,
                'estado_invalido'
            );
        }
        $tecnicoOrigenId = $equipo['usuario_actual_id'] !== null ? (int) $equipo['usuario_actual_id'] : null;
        if ($tecnicoOrigenId === null) {
            // No debería pasar nunca (estado 'maleta' implica dueño), pero si
            // la base quedó inconsistente por otra vía, mejor cortar acá que
            // registrar un traspaso sin origen real.
            throw new ApiException('Este equipo figura en maleta pero sin técnico asignado — revisa el dato a mano.', 409, 'estado_invalido');
        }
        if ($tecnicoDestinoId === $tecnicoOrigenId) {
            throw new ValidationException('El técnico de destino tiene que ser distinto del que ya tiene el equipo.');
        }
        if (!$this->usuarios->find($tecnicoDestinoId)) {
            throw new ValidationException('Técnico de destino inexistente.');
        }

        $this->equipos->actualizarEstado($equipoId, 'en_transito', $tecnicoDestinoId, null, $tecnicoOrigenId);
        $this->movimientosEquipo->crear($equipoId, 'traspaso_pendiente', $tecnicoOrigenId, $tecnicoDestinoId, null);
        return $this->equipos->find($equipoId);
    }

    /** El admin se arrepiente de un envío que el técnico todavía no confirmó — vuelve a donde estaba. */
    public function cancelarTraspasoEquipo(int $equipoId): array
    {
        return Database::transaction(function () use ($equipoId) {
            $equipo = $this->equipos->find($equipoId, bloqueando: true);
            if (!$equipo) {
                throw new NotFoundException('Equipo no encontrado.');
            }
            if ($equipo['estado'] !== 'en_transito') {
                throw new ApiException('Este equipo no tiene un envío pendiente de cancelar.', 409, 'estado_invalido');
            }
            $tecnicoDestinoId = (int) $equipo['usuario_actual_id'];
            $origenId = $equipo['origen_pendiente_id'] !== null ? (int) $equipo['origen_pendiente_id'] : null;

            if ($origenId === null) {
                $this->equipos->actualizarEstado($equipoId, 'bodega', null, null, null);
            } else {
                $this->equipos->actualizarEstado($equipoId, 'maleta', $origenId, null, null);
            }
            $this->movimientosEquipo->crear($equipoId, 'traspaso_cancelado', $tecnicoDestinoId, $origenId, null, 'Cancelado por el admin antes de que el técnico confirmara.');
            return $this->equipos->find($equipoId);
        });
    }

    /** Equipos en camino hacia $tecnicoId, esperando que los confirme. */
    public function equiposPendientesPara(int $tecnicoId): array
    {
        return $this->equipos->pendientesPara($tecnicoId);
    }

    /** El técnico revisó las series físicamente y están correctas. */
    public function aceptarEquipo(int $equipoId, int $tecnicoId): array
    {
        return Database::transaction(function () use ($equipoId, $tecnicoId) {
            $equipo = $this->equipos->find($equipoId, bloqueando: true);
            if (!$equipo) {
                throw new NotFoundException('Equipo no encontrado.');
            }
            if ($equipo['estado'] !== 'en_transito' || (int) $equipo['usuario_actual_id'] !== $tecnicoId) {
                throw new ApiException('Este equipo no está esperando tu confirmación.', 409, 'estado_invalido');
            }
            $origenId = $equipo['origen_pendiente_id'] !== null ? (int) $equipo['origen_pendiente_id'] : null;

            $this->equipos->actualizarEstado($equipoId, 'maleta', $tecnicoId, null, null);
            $this->movimientosEquipo->crear(
                $equipoId,
                $origenId === null ? 'asignacion_maleta' : 'traspaso',
                $origenId,
                $tecnicoId,
                null
            );
            return $this->equipos->find($equipoId);
        });
    }

    /** El técnico encontró una discrepancia (serie que no corresponde, no llegó, etc.) — vuelve a donde estaba. */
    public function rechazarEquipo(int $equipoId, int $tecnicoId, string $observacion): array
    {
        return Database::transaction(function () use ($equipoId, $tecnicoId, $observacion) {
            $equipo = $this->equipos->find($equipoId, bloqueando: true);
            if (!$equipo) {
                throw new NotFoundException('Equipo no encontrado.');
            }
            if ($equipo['estado'] !== 'en_transito' || (int) $equipo['usuario_actual_id'] !== $tecnicoId) {
                throw new ApiException('Este equipo no está esperando tu confirmación.', 409, 'estado_invalido');
            }
            $origenId = $equipo['origen_pendiente_id'] !== null ? (int) $equipo['origen_pendiente_id'] : null;

            if ($origenId === null) {
                $this->equipos->actualizarEstado($equipoId, 'bodega', null, null, null);
            } else {
                $this->equipos->actualizarEstado($equipoId, 'maleta', $origenId, null, null);
            }
            $this->movimientosEquipo->crear($equipoId, 'traspaso_rechazado', $tecnicoId, $origenId, null, $observacion);
            return $this->equipos->find($equipoId);
        });
    }

    /** El equipo viene malo de fábrica — sale de la maleta sin culpar ni descontar al técnico. */
    public function marcarFallaFabrica(int $equipoId, ?string $observacion): array
    {
        $equipo = $this->requerirEquipo($equipoId);
        $tecnicoActual = $equipo['usuario_actual_id'] !== null ? (int) $equipo['usuario_actual_id'] : null;

        $this->equipos->actualizarEstado($equipoId, 'falla_fabrica', null, null);
        $this->movimientosEquipo->crear($equipoId, 'falla_fabrica', $tecnicoActual, null, null, $observacion);
        return $this->equipos->find($equipoId);
    }

    /**
     * El retorno físico a bodega tras un retiro es un evento propio, no
     * parte de la orden de retiro (ver docs/modelo-datos-fase1.md) — puede
     * pasar días después, cuando el técnico junta varios retiros en un viaje.
     */
    public function ingresoABodega(int $equipoId): array
    {
        $equipo = $this->requerirEquipo($equipoId);
        if ($equipo['estado'] !== 'retirado') {
            throw new ApiException(
                'Solo se puede ingresar a bodega un equipo que está "retirado" (estado actual: ' . $equipo['estado'] . ').',
                409,
                'estado_invalido'
            );
        }
        $tecnicoActual = $equipo['usuario_actual_id'] !== null ? (int) $equipo['usuario_actual_id'] : null;

        $this->equipos->actualizarEstado($equipoId, 'bodega', null, null);
        $this->movimientosEquipo->crear($equipoId, 'ingreso_bodega', $tecnicoActual, null, null);
        return $this->equipos->find($equipoId);
    }

    public function listarStockFerreteria(?int $tecnicoId): array
    {
        return $this->stockFerreteria->listar($tecnicoId);
    }

    /**
     * Entrega de ferretería de bodega a un técnico. Igual que con los
     * equipos, ya no se aplica al stock al toque: queda pendiente hasta que
     * el técnico confirma la cantidad recibida (ver aceptarFerreteria).
     */
    public function entregarFerreteria(string $itemCodigo, int $tecnicoId, float $cantidad, int $creadoPorId): array
    {
        $item = $this->itemsFerreteria->porCodigo($itemCodigo);
        if (!$item) {
            throw new ValidationException('Ítem de ferretería desconocido: ' . $itemCodigo);
        }
        if ($cantidad <= 0) {
            throw new ValidationException('La cantidad a entregar debe ser mayor que cero.');
        }
        if (!$this->usuarios->find($tecnicoId)) {
            throw new ValidationException('Técnico inexistente.');
        }

        $id = $this->entregasFerreteriaPendientes->crear((int) $item['id'], $tecnicoId, $cantidad, $creadoPorId);
        return $this->entregasFerreteriaPendientes->find($id);
    }

    /** El admin cancela una entrega que el técnico todavía no confirmó. */
    public function cancelarEntregaFerreteria(int $entregaId): array
    {
        return Database::transaction(function () use ($entregaId) {
            $entrega = $this->entregasFerreteriaPendientes->find($entregaId, bloqueando: true);
            if (!$entrega || $entrega['estado'] !== 'pendiente') {
                throw new ApiException('Esta entrega no está pendiente de cancelar.', 409, 'estado_invalido');
            }
            $this->entregasFerreteriaPendientes->marcarResuelta($entregaId, 'rechazada', 'Cancelada por el admin antes de que el técnico confirmara.');
            return $this->entregasFerreteriaPendientes->find($entregaId);
        });
    }

    /** Entregas de ferretería esperando que $tecnicoId confirme la cantidad recibida. */
    public function entregasFerreteriaPendientesPara(int $tecnicoId): array
    {
        return $this->entregasFerreteriaPendientes->pendientesPara($tecnicoId);
    }

    /** Para el admin — todo lo pendiente, de cualquier técnico. */
    public function entregasFerreteriaPendientesTodas(): array
    {
        return $this->entregasFerreteriaPendientes->pendientesTodas();
    }

    /** El técnico contó físicamente y la cantidad está correcta — recién ahora se mueve el stock de verdad. */
    public function aceptarFerreteria(int $entregaId, int $tecnicoId): array
    {
        return Database::transaction(function () use ($entregaId, $tecnicoId) {
            $entrega = $this->entregasFerreteriaPendientes->find($entregaId, bloqueando: true);
            if (!$entrega || $entrega['estado'] !== 'pendiente' || (int) $entrega['tecnico_id'] !== $tecnicoId) {
                throw new ApiException('Esta entrega no está esperando tu confirmación.', 409, 'estado_invalido');
            }
            $this->movimientosFerreteria->crear((int) $entrega['item_ferreteria_id'], $tecnicoId, 'entrega_bodega', (float) $entrega['cantidad'], null);
            $this->stockFerreteria->ajustar($tecnicoId, (int) $entrega['item_ferreteria_id'], (float) $entrega['cantidad']);
            $this->entregasFerreteriaPendientes->marcarResuelta($entregaId, 'aceptada', null);
            return $this->entregasFerreteriaPendientes->find($entregaId);
        });
    }

    /** El técnico contó y la cantidad no coincide — no se aplica nada al stock. */
    public function rechazarFerreteria(int $entregaId, int $tecnicoId, string $observacion): array
    {
        return Database::transaction(function () use ($entregaId, $tecnicoId, $observacion) {
            $entrega = $this->entregasFerreteriaPendientes->find($entregaId, bloqueando: true);
            if (!$entrega || $entrega['estado'] !== 'pendiente' || (int) $entrega['tecnico_id'] !== $tecnicoId) {
                throw new ApiException('Esta entrega no está esperando tu confirmación.', 409, 'estado_invalido');
            }
            $this->entregasFerreteriaPendientes->marcarResuelta($entregaId, 'rechazada', $observacion);
            return $this->entregasFerreteriaPendientes->find($entregaId);
        });
    }

    public function obtenerKit(string $tipoServicioCodigo): array
    {
        $tipo = $this->tiposServicio->findByCodigo($tipoServicioCodigo);
        if (!$tipo) {
            throw new ValidationException('Tipo de servicio desconocido: ' . $tipoServicioCodigo);
        }
        return $this->kits->paraTipoServicio((int) $tipo['id']);
    }

    /**
     * Reemplaza el kit completo — igual que el paso 4 del wizard, se manda
     * la lista entera, no un diff. { items: [{ item_codigo, cantidad_estandar }] }
     */
    public function actualizarKit(string $tipoServicioCodigo, array $items): array
    {
        $tipo = $this->tiposServicio->findByCodigo($tipoServicioCodigo);
        if (!$tipo) {
            throw new ValidationException('Tipo de servicio desconocido: ' . $tipoServicioCodigo);
        }

        $itemsResueltos = [];
        foreach ($items as $item) {
            $codigo = (string) ($item['item_codigo'] ?? '');
            $itemFerreteria = $this->itemsFerreteria->porCodigo($codigo);
            if (!$itemFerreteria) {
                throw new ValidationException('Ítem de ferretería desconocido: ' . $codigo);
            }
            $cantidad = (float) ($item['cantidad_estandar'] ?? -1);
            if ($cantidad < 0) {
                throw new ValidationException("Cantidad inválida para el ítem $codigo.");
            }
            $itemsResueltos[] = ['item_ferreteria_id' => $itemFerreteria['id'], 'cantidad_estandar' => $cantidad];
        }

        $this->kits->reemplazarKit((int) $tipo['id'], $itemsResueltos);
        return $this->kits->paraTipoServicio((int) $tipo['id']);
    }

    private function requerirEquipo(int $equipoId): array
    {
        $equipo = $this->equipos->find($equipoId);
        if (!$equipo) {
            throw new NotFoundException('Equipo no encontrado.');
        }
        return $equipo;
    }
}
