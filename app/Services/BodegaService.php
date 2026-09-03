<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Exceptions\ApiException;
use App\Exceptions\NotFoundException;
use App\Exceptions\ValidationException;
use App\Repositories\BodegaRepository;
use App\Repositories\EntregaFerreteriaPendienteRepository;
use App\Repositories\EquipoRepository;
use App\Repositories\ItemFerreteriaRepository;
use App\Repositories\MovimientoEquipoRepository;
use App\Repositories\MovimientoFerreteriaCentralRepository;
use App\Repositories\MovimientoFerreteriaRepository;
use App\Repositories\StockFerreteriaCentralRepository;
use App\Repositories\StockFerreteriaUsuarioRepository;
use App\Repositories\TipoEquipoRepository;
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
    private BodegaRepository $bodegas;
    private StockFerreteriaCentralRepository $stockFerreteriaCentral;
    private MovimientoFerreteriaCentralRepository $movimientosFerreteriaCentral;
    private UsuarioRepository $usuarios;

    public function __construct()
    {
        $this->equipos = new EquipoRepository();
        $this->tiposEquipo = new TipoEquipoRepository();
        $this->movimientosEquipo = new MovimientoEquipoRepository();
        $this->itemsFerreteria = new ItemFerreteriaRepository();
        $this->stockFerreteria = new StockFerreteriaUsuarioRepository();
        $this->movimientosFerreteria = new MovimientoFerreteriaRepository();
        $this->entregasFerreteriaPendientes = new EntregaFerreteriaPendienteRepository();
        $this->bodegas = new BodegaRepository();
        $this->stockFerreteriaCentral = new StockFerreteriaCentralRepository();
        $this->movimientosFerreteriaCentral = new MovimientoFerreteriaCentralRepository();
        $this->usuarios = new UsuarioRepository();
    }

    public function listarBodegas(): array
    {
        return $this->bodegas->activas();
    }

    public function crearBodega(string $nombre): array
    {
        $nombre = trim($nombre);
        if ($nombre === '') {
            throw new ValidationException('El nombre de la bodega no puede estar vacío.');
        }
        if ($this->bodegas->existeNombre($nombre)) {
            throw new ValidationException('Ya existe una bodega con ese nombre.');
        }
        $id = $this->bodegas->crear($nombre);
        return $this->bodegas->find($id);
    }

    /**
     * Alta de un tipo de equipo nuevo en el catálogo (pedido: "en bodega se
     * puedan agregar nuevos items" — hasta ahora solo se podía dar de alta
     * una SERIE de un tipo que ya existía; crear el tipo en sí requería
     * tocar la base a mano).
     */
    public function crearTipoEquipo(string $codigo, string $nombre): array
    {
        $codigo = trim($codigo);
        $nombre = trim($nombre);
        if ($codigo === '' || !preg_match('/^[a-z0-9_]+$/', $codigo)) {
            throw new ValidationException('El código debe tener solo minúsculas, números o guion bajo.');
        }
        if ($nombre === '') {
            throw new ValidationException('El nombre no puede estar vacío.');
        }
        if ($this->tiposEquipo->existeCodigo($codigo)) {
            throw new ValidationException('Ya existe un tipo de equipo con ese código.');
        }
        $id = $this->tiposEquipo->crear($codigo, $nombre);
        return $this->tiposEquipo->porCodigo($codigo) ?? ['id' => $id, 'codigo' => $codigo, 'nombre' => $nombre];
    }

    /** Mismo criterio que crearTipoEquipo(), para el catálogo de ferretería. */
    public function crearItemFerreteria(string $codigo, string $nombre, string $unidadMedida): array
    {
        $codigo = trim($codigo);
        $nombre = trim($nombre);
        if ($codigo === '' || !preg_match('/^[a-z0-9_]+$/', $codigo)) {
            throw new ValidationException('El código debe tener solo minúsculas, números o guion bajo.');
        }
        if ($nombre === '') {
            throw new ValidationException('El nombre no puede estar vacío.');
        }
        if (!in_array($unidadMedida, ['unidad', 'metro'], true)) {
            throw new ValidationException('Unidad de medida inválida (debe ser "unidad" o "metro").');
        }
        if ($this->itemsFerreteria->existeCodigo($codigo)) {
            throw new ValidationException('Ya existe un ítem de ferretería con ese código.');
        }
        $id = $this->itemsFerreteria->crear($codigo, $nombre, $unidadMedida);
        return $this->itemsFerreteria->find($id);
    }

    private function requerirBodega(int $bodegaId): array
    {
        $bodega = $this->bodegas->find($bodegaId);
        if (!$bodega) {
            throw new ValidationException('Bodega inexistente.');
        }
        return $bodega;
    }

    public function listarEquipos(?string $estado, ?int $tecnicoId, ?int $bodegaId = null): array
    {
        return $this->equipos->listar($estado, $tecnicoId, $bodegaId);
    }

    /** Buscador por serie (parcial) — para saber "¿dónde ha estado este equipo?" sin recorrer las tablas por estado. */
    public function buscarEquiposPorSerie(string $q): array
    {
        return $this->equipos->buscarPorSerie($q);
    }

    public function historialEquipo(int $equipoId): array
    {
        $equipo = $this->requerirEquipo($equipoId);
        return [
            'equipo' => $equipo,
            'movimientos' => $this->movimientosEquipo->historialDeEquipo($equipoId),
        ];
    }

    public function altaEquipo(string $tipoEquipoCodigo, string $numeroSerie, int $bodegaId): array
    {
        $tipo = $this->tiposEquipo->porCodigo($tipoEquipoCodigo);
        if (!$tipo) {
            throw new ValidationException('Tipo de equipo desconocido: ' . $tipoEquipoCodigo);
        }
        $this->requerirBodega($bodegaId);
        $numeroSerie = trim($numeroSerie);
        if ($numeroSerie === '') {
            throw new ValidationException('El número de serie no puede estar vacío.');
        }
        if ($this->equipos->porSerie($numeroSerie)) {
            throw new ValidationException('Ya existe un equipo registrado con esa serie.');
        }

        $id = $this->equipos->crear((int) $tipo['id'], $numeroSerie, $bodegaId);
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

        // Se conserva la bodega de origen (no se limpia) — así, si el
        // técnico lo rechaza, cancelarTraspasoEquipo/rechazarEquipo saben a
        // cuál devolverlo sin tener que volver a preguntarlo.
        $this->equipos->actualizarEstado($equipoId, 'en_transito', $tecnicoId, null, null, $equipo['bodega_id'] !== null ? (int) $equipo['bodega_id'] : null);
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

        $this->equipos->actualizarEstado($equipoId, 'en_transito', $tecnicoDestinoId, null, $tecnicoOrigenId, null);
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
            $bodegaId = $equipo['bodega_id'] !== null ? (int) $equipo['bodega_id'] : null;

            if ($origenId === null) {
                $this->equipos->actualizarEstado($equipoId, 'bodega', null, null, null, $bodegaId);
            } else {
                $this->equipos->actualizarEstado($equipoId, 'maleta', $origenId, null, null, null);
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

            $this->equipos->actualizarEstado($equipoId, 'maleta', $tecnicoId, null, null, null);
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
            $bodegaId = $equipo['bodega_id'] !== null ? (int) $equipo['bodega_id'] : null;

            if ($origenId === null) {
                $this->equipos->actualizarEstado($equipoId, 'bodega', null, null, null, $bodegaId);
            } else {
                $this->equipos->actualizarEstado($equipoId, 'maleta', $origenId, null, null, null);
            }
            $this->movimientosEquipo->crear($equipoId, 'traspaso_rechazado', $tecnicoId, $origenId, null, $observacion);
            return $this->equipos->find($equipoId);
        });
    }

    /**
     * El equipo viene malo de fábrica — sale de la maleta sin culpar ni
     * descontar al técnico. Pedido: "nos falta una bodega de reversa donde
     * lleguen los con falla, retiro o reparaciones" — antes quedaba con
     * bodega_id NULL (flotando, invisible en cualquier listado por
     * ubicación); ahora el admin elige a qué bodega física llega de verdad
     * (puede ser la misma "Bodega Central" o una dedicada tipo "Reversa"
     * que se crea igual que cualquier otra desde Ubicaciones — no hace
     * falta una tabla nueva para eso).
     */
    public function marcarFallaFabrica(int $equipoId, ?string $observacion, int $bodegaId): array
    {
        $this->requerirBodega($bodegaId);
        $equipo = $this->requerirEquipo($equipoId);
        $tecnicoActual = $equipo['usuario_actual_id'] !== null ? (int) $equipo['usuario_actual_id'] : null;

        $this->equipos->actualizarEstado($equipoId, 'falla_fabrica', null, null, null, $bodegaId);
        $this->movimientosEquipo->crear($equipoId, 'falla_fabrica', $tecnicoActual, null, null, $observacion);
        return $this->equipos->find($equipoId);
    }

    /**
     * El retorno físico a bodega tras un retiro (o tras salir reparado de
     * la bodega de reversa) es un evento propio, no parte de la orden de
     * retiro (ver docs/modelo-datos-fase1.md) — puede pasar días después,
     * cuando el técnico junta varios retiros en un viaje. El admin elige a
     * QUÉ bodega física vuelve (puede ser distinta de la que lo mandó
     * originalmente, ej. de la Reversa de vuelta a Central una vez
     * reparado).
     */
    public function ingresoABodega(int $equipoId, int $bodegaId): array
    {
        $this->requerirBodega($bodegaId);
        $equipo = $this->requerirEquipo($equipoId);
        if (!in_array($equipo['estado'], ['retirado', 'falla_fabrica'], true)) {
            throw new ApiException(
                'Solo se puede ingresar a bodega un equipo que está "retirado" o "falla_fabrica" (estado actual: ' . $equipo['estado'] . ').',
                409,
                'estado_invalido'
            );
        }
        $tecnicoActual = $equipo['usuario_actual_id'] !== null ? (int) $equipo['usuario_actual_id'] : null;

        $this->equipos->actualizarEstado($equipoId, 'bodega', null, null, null, $bodegaId);
        $this->movimientosEquipo->crear($equipoId, 'ingreso_bodega', $tecnicoActual, null, null);
        return $this->equipos->find($equipoId);
    }

    public function listarStockFerreteria(?int $tecnicoId): array
    {
        return $this->stockFerreteria->listar($tecnicoId);
    }

    /** Stock real de ferretería en las bodegas físicas (mejora 8: antes esto ni se guardaba). */
    public function listarStockCentral(?int $bodegaId): array
    {
        return $this->stockFerreteriaCentral->listar($bodegaId);
    }

    /** Ingreso real a una bodega (compra, recepción de TuVes) — lo único que hace crecer el stock central. */
    public function ingresarFerreteriaCentral(string $itemCodigo, int $bodegaId, float $cantidad, ?string $observacion, int $creadoPorId): array
    {
        $item = $this->itemsFerreteria->porCodigo($itemCodigo);
        if (!$item) {
            throw new ValidationException('Ítem de ferretería desconocido: ' . $itemCodigo);
        }
        if ($cantidad <= 0) {
            throw new ValidationException('La cantidad a ingresar debe ser mayor que cero.');
        }
        $this->requerirBodega($bodegaId);

        $this->stockFerreteriaCentral->ajustar($bodegaId, (int) $item['id'], $cantidad);
        $this->movimientosFerreteriaCentral->crear($bodegaId, (int) $item['id'], 'ingreso', $cantidad, null, $observacion, $creadoPorId);
        return ['item' => $item, 'bodega_id' => $bodegaId, 'cantidad_ingresada' => $cantidad];
    }

    /**
     * Entrega de ferretería de UNA bodega física a un técnico. El stock
     * central se descuenta (reserva) YA, en este mismo momento — no al
     * aceptar — para que dos entregas casi simultáneas del mismo ítem no
     * alcancen a mandar más de lo que hay de verdad. Al técnico todavía no
     * le llega nada a SU stock hasta que confirma la cantidad recibida (ver
     * aceptarFerreteria); si rechaza o el admin cancela, se reingresa a la
     * misma bodega (ver rechazarFerreteria/cancelarEntregaFerreteria).
     */
    public function entregarFerreteria(string $itemCodigo, int $tecnicoId, float $cantidad, int $creadoPorId, int $bodegaId): array
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
        $this->requerirBodega($bodegaId);

        return Database::transaction(function () use ($item, $tecnicoId, $cantidad, $creadoPorId, $bodegaId) {
            $itemId = (int) $item['id'];
            if (!$this->stockFerreteriaCentral->debitarSiAlcanza($bodegaId, $itemId, $cantidad)) {
                throw new ApiException('No hay suficiente stock en esa bodega para entregar esa cantidad.', 409, 'stock_insuficiente');
            }
            $entregaId = $this->entregasFerreteriaPendientes->crear($itemId, $tecnicoId, $cantidad, $creadoPorId, $bodegaId);
            $this->movimientosFerreteriaCentral->crear($bodegaId, $itemId, 'egreso_pendiente', -$cantidad, $entregaId, null, $creadoPorId);
            return $this->entregasFerreteriaPendientes->find($entregaId);
        });
    }

    /** El admin cancela una entrega que el técnico todavía no confirmó — reingresa el stock a la bodega de origen. */
    public function cancelarEntregaFerreteria(int $entregaId, int $canceladoPorId): array
    {
        return Database::transaction(function () use ($entregaId, $canceladoPorId) {
            $entrega = $this->entregasFerreteriaPendientes->find($entregaId, bloqueando: true);
            if (!$entrega || $entrega['estado'] !== 'pendiente') {
                throw new ApiException('Esta entrega no está pendiente de cancelar.', 409, 'estado_invalido');
            }
            $this->reingresarABodega($entrega, $canceladoPorId, 'Cancelada por el admin antes de que el técnico confirmara.');
            $this->entregasFerreteriaPendientes->marcarResuelta($entregaId, 'rechazada', 'Cancelada por el admin antes de que el técnico confirmara.');
            return $this->entregasFerreteriaPendientes->find($entregaId);
        });
    }

    /** Reingresa a la bodega que la había debitado — si la entrega es de antes de que existiera bodega_id, no hay a dónde devolverla y se deja constancia. */
    private function reingresarABodega(array $entrega, int $creadoPorId, string $observacion): void
    {
        if ($entrega['bodega_id'] === null) {
            return;
        }
        $bodegaId = (int) $entrega['bodega_id'];
        $itemId = (int) $entrega['item_ferreteria_id'];
        $cantidad = (float) $entrega['cantidad'];
        $this->stockFerreteriaCentral->ajustar($bodegaId, $itemId, $cantidad);
        $this->movimientosFerreteriaCentral->crear($bodegaId, $itemId, 'reingreso_rechazo', $cantidad, (int) $entrega['id'], $observacion, $creadoPorId);
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

    /** El técnico contó y la cantidad no coincide — se reingresa a la bodega que la había debitado, nada queda en su stock. */
    public function rechazarFerreteria(int $entregaId, int $tecnicoId, string $observacion): array
    {
        return Database::transaction(function () use ($entregaId, $tecnicoId, $observacion) {
            $entrega = $this->entregasFerreteriaPendientes->find($entregaId, bloqueando: true);
            if (!$entrega || $entrega['estado'] !== 'pendiente' || (int) $entrega['tecnico_id'] !== $tecnicoId) {
                throw new ApiException('Esta entrega no está esperando tu confirmación.', 409, 'estado_invalido');
            }
            $this->reingresarABodega($entrega, $tecnicoId, 'Rechazada por el técnico: ' . $observacion);
            $this->entregasFerreteriaPendientes->marcarResuelta($entregaId, 'rechazada', $observacion);
            return $this->entregasFerreteriaPendientes->find($entregaId);
        });
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
