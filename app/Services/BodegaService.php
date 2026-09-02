<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\ApiException;
use App\Exceptions\NotFoundException;
use App\Exceptions\ValidationException;
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
 */
final class BodegaService
{
    private EquipoRepository $equipos;
    private TipoEquipoRepository $tiposEquipo;
    private MovimientoEquipoRepository $movimientosEquipo;
    private ItemFerreteriaRepository $itemsFerreteria;
    private StockFerreteriaUsuarioRepository $stockFerreteria;
    private MovimientoFerreteriaRepository $movimientosFerreteria;
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

    /** Asigna un equipo de bodega a la maleta de un técnico. */
    public function asignarAMaleta(int $equipoId, int $tecnicoId): array
    {
        $equipo = $this->requerirEquipo($equipoId);
        if ($equipo['estado'] !== 'bodega') {
            throw new ApiException(
                'Solo se puede asignar un equipo que está en bodega (estado actual: ' . $equipo['estado'] . ').',
                409,
                'estado_invalido'
            );
        }
        if (!$this->usuarios->find($tecnicoId)) {
            throw new ValidationException('Técnico inexistente.');
        }

        $this->equipos->actualizarEstado($equipoId, 'maleta', $tecnicoId, null);
        $this->movimientosEquipo->crear($equipoId, 'asignacion_maleta', null, $tecnicoId, null);
        return $this->equipos->find($equipoId);
    }

    /**
     * Traspaso directo entre maletas, sin pasar por bodega (respuesta 9):
     * cubre el caso real de que un técnico le entregue un equipo a otro en
     * terreno, sin que ninguno de los dos pise la bodega ese día. El equipo
     * sigue en 'maleta' — solo cambia de dueño — y queda una fila propia en
     * movimientos_equipo (tipo 'traspaso', con origen Y destino) para que la
     * trazabilidad no se pierda como sí pasaría si esto se modelara como un
     * ingreso_bodega + asignacion_maleta que nunca ocurrieron de verdad.
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

        $this->equipos->actualizarEstado($equipoId, 'maleta', $tecnicoDestinoId, null);
        $this->movimientosEquipo->crear($equipoId, 'traspaso', $tecnicoOrigenId, $tecnicoDestinoId, null);
        return $this->equipos->find($equipoId);
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

    /** Entrega de ferretería de bodega a un técnico — el mismo mecanismo que ya se probó en validate_schema.mjs. */
    public function entregarFerreteria(string $itemCodigo, int $tecnicoId, float $cantidad): array
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

        $this->movimientosFerreteria->crear((int) $item['id'], $tecnicoId, 'entrega_bodega', $cantidad, null);
        $this->stockFerreteria->ajustar($tecnicoId, (int) $item['id'], $cantidad);

        return ['item' => $item, 'tecnico_id' => $tecnicoId, 'cantidad_entregada' => $cantidad];
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
