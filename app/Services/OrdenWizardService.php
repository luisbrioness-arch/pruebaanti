<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Exceptions\ApiException;
use App\Exceptions\ForbiddenException;
use App\Exceptions\NotFoundException;
use App\Exceptions\ValidationException;
use App\Repositories\ComisionPlanRepository;
use App\Repositories\ConflictoSincronizacionRepository;
use App\Repositories\EquipoRepository;
use App\Repositories\ItemFerreteriaRepository;
use App\Repositories\MovimientoEquipoRepository;
use App\Repositories\MovimientoFerreteriaRepository;
use App\Repositories\OrdenFerreteriaRepository;
use App\Repositories\OrdenFotoRepository;
use App\Repositories\OrdenMaterialRepository;
use App\Repositories\OrdenRepository;
use App\Repositories\StockFerreteriaUsuarioRepository;
use App\Repositories\TarifaInstalacionPlanRepository;
use App\Repositories\TarifaServicioRepository;
use App\Repositories\TipoServicioRepository;
use App\Repositories\UsuarioRepository;
use App\Repositories\VentaRepository;

/**
 * Orquesta los 5 pasos del wizard "Cerrar Orden" tal como quedaron cerrados
 * en docs/modelo-datos-fase1.md. Reglas que este servicio hace cumplir y
 * que ya se probaron en database/tests/validate_schema.mjs:
 *
 *  - uuid_dispositivo es la identidad real de la orden: crear es idempotente.
 *  - Un equipo se valida contra la maleta del técnico EN EL MOMENTO del
 *    escaneo (paso 2), no al enviar.
 *  - La orden existe en el servidor desde el paso 1 ('borrador'), porque las
 *    fotos empiezan a subir en segundo plano antes del envío final.
 *  - El consumo físico (equipos + ferretería) se confirma al ENVIAR
 *    (paso 5) — el técnico ya usó las grampas y dejó el equipo instalado.
 *  - La orden que se envía sin chocar con un folio queda 'aprobada' en el
 *    mismo instante (auto-aprobación, ver confirmarEnviada más abajo) — ya
 *    no espera revisión manual de un administrador.
 *  - Un folio repetido no se rechaza: la orden entra en estado 'conflicto'
 *    y espera resolución del administrador.
 *  - Si la orden viene de una venta propia, la comisión se confirma en el
 *    mismo instante que el monto de la orden.
 */
final class OrdenWizardService
{
    private OrdenRepository $ordenes;
    private OrdenMaterialRepository $materiales;
    private OrdenFerreteriaRepository $ordenFerreteria;
    private OrdenFotoRepository $fotos;
    private TipoServicioRepository $tiposServicio;
    private TarifaServicioRepository $tarifas;
    private TarifaInstalacionPlanRepository $tarifasInstalacionPlan;
    private EquipoRepository $equipos;
    private MovimientoEquipoRepository $movimientosEquipo;
    private ItemFerreteriaRepository $itemsFerreteria;
    private StockFerreteriaUsuarioRepository $stockFerreteria;
    private MovimientoFerreteriaRepository $movimientosFerreteria;
    private UsuarioRepository $usuarios;
    private VentaRepository $ventas;
    private ComisionPlanRepository $comisiones;
    private ConflictoSincronizacionRepository $conflictos;

    public function __construct()
    {
        $this->ordenes = new OrdenRepository();
        $this->materiales = new OrdenMaterialRepository();
        $this->ordenFerreteria = new OrdenFerreteriaRepository();
        $this->fotos = new OrdenFotoRepository();
        $this->tiposServicio = new TipoServicioRepository();
        $this->tarifas = new TarifaServicioRepository();
        $this->tarifasInstalacionPlan = new TarifaInstalacionPlanRepository();
        $this->equipos = new EquipoRepository();
        $this->movimientosEquipo = new MovimientoEquipoRepository();
        $this->itemsFerreteria = new ItemFerreteriaRepository();
        $this->stockFerreteria = new StockFerreteriaUsuarioRepository();
        $this->movimientosFerreteria = new MovimientoFerreteriaRepository();
        $this->usuarios = new UsuarioRepository();
        $this->ventas = new VentaRepository();
        $this->comisiones = new ComisionPlanRepository();
        $this->conflictos = new ConflictoSincronizacionRepository();
    }

    /**
     * Paso 1. Idempotente: si el uuid ya existe (doble tap, reintento sin
     * señal), devuelve la orden tal como está en vez de fallar o duplicar.
     */
    public function crearOReanudarBorrador(int $tecnicoId, array $datos): array
    {
        $uuid = $this->requerido($datos, 'uuid_dispositivo');

        $existente = $this->ordenes->porUuid($uuid);
        if ($existente) {
            if ((int) $existente['tecnico_id'] !== $tecnicoId) {
                throw new ForbiddenException('Esta orden pertenece a otro técnico.');
            }
            return $this->estadoCompleto($existente);
        }

        $folio = trim((string) $this->requerido($datos, 'folio'));
        if ($folio === '') {
            throw new ValidationException('El folio no puede estar vacío.');
        }

        $tipoServicioCodigo = (string) $this->requerido($datos, 'tipo_servicio');
        $tipoServicio = $this->tiposServicio->findByCodigo($tipoServicioCodigo);
        if (!$tipoServicio) {
            throw new ValidationException('Tipo de servicio desconocido: ' . $tipoServicioCodigo);
        }

        // Pedido: "si la venta viene de otro lugar ya sea directa de tuvez
        // o otro tecnico" — cualquier técnico puede instalar cualquier
        // venta pendiente, no solo las que él mismo registró. La comisión
        // de venta sigue yendo a quien la vendió (`venta.vendedor_id`, ver
        // confirmarVenta()) sin importar quién la instala — este cambio no
        // toca esa parte, solo destraba el enlace.
        $ventaId = null;
        if (!empty($datos['venta_id'])) {
            $venta = $this->ventas->find((int) $datos['venta_id']);
            if (!$venta) {
                throw new ValidationException('La venta indicada no existe.');
            }
            if ($venta['estado'] !== 'registrada') {
                throw new ValidationException('Esa venta ya fue instalada o anulada.');
            }
            $ventaId = (int) $venta['id'];
        }

        $fechaTrabajo = $datos['fecha_trabajo_dispositivo'] ?? date('Y-m-d H:i:s');

        $id = $this->ordenes->crear([
            'uuid_dispositivo' => $uuid,
            'folio' => $folio,
            'tipo_servicio_id' => $tipoServicio['id'],
            'tecnico_id' => $tecnicoId,
            'venta_id' => $ventaId,
            'estado' => 'borrador',
            'fecha_trabajo_dispositivo' => $fechaTrabajo,
            'creado_por_admin' => 0,
        ]);

        return $this->estadoCompleto($this->ordenes->find($id));
    }

    /** Para que el celular pueda reanudar el wizard si la app se cerró a mitad de camino. */
    public function obtenerEstado(int $tecnicoId, string $uuid): array
    {
        $orden = $this->obtenerOrdenDelTecnico($tecnicoId, $uuid);
        return $this->estadoCompleto($orden);
    }

    /**
     * Paso 2. La validación contra la maleta ocurre acá, no al enviar —
     * es lo que permite avisarle al técnico en el momento del escaneo.
     */
    public function agregarMaterial(int $tecnicoId, string $uuid, array $datos): array
    {
        $orden = $this->obtenerOrdenDelTecnico($tecnicoId, $uuid, soloEditable: true);
        $this->verificarConsumoNoConfirmado($orden);

        $numeroSerie = trim((string) $this->requerido($datos, 'numero_serie'));
        $accion = (string) $this->requerido($datos, 'accion');
        if (!in_array($accion, ['instalado', 'retirado'], true)) {
            throw new ValidationException('accion inválida (debe ser "instalado" o "retirado"): ' . $accion);
        }
        $ingresadoManual = !empty($datos['ingresado_manual']);

        $equipo = $this->validarEquipoParaAccion($tecnicoId, $numeroSerie, $accion);

        if ($this->materiales->existe($orden['id'], (int) $equipo['id'], $accion)) {
            throw new ValidationException('Este equipo ya fue escaneado en esta orden.');
        }

        $this->materiales->agregar($orden['id'], (int) $equipo['id'], $accion, $ingresadoManual);

        return $this->estadoCompleto($this->ordenes->find($orden['id']));
    }

    public function quitarMaterial(int $tecnicoId, string $uuid, int $equipoId, string $accion): array
    {
        $orden = $this->obtenerOrdenDelTecnico($tecnicoId, $uuid, soloEditable: true);
        $this->verificarConsumoNoConfirmado($orden);
        $this->materiales->eliminar($orden['id'], $equipoId, $accion);
        return $this->estadoCompleto($this->ordenes->find($orden['id']));
    }

    /**
     * Paso 3. La foto sube apenas está lista, antes del envío final del
     * paso 5 — por eso la orden debe existir server-side desde el paso 1.
     */
    public function agregarFoto(int $tecnicoId, string $uuid, array $meta, array $archivo): array
    {
        $orden = $this->obtenerOrdenDelTecnico($tecnicoId, $uuid, soloEditable: true);

        $tipo = (string) $this->requerido($meta, 'tipo');
        if (!in_array($tipo, ['antena', 'deco_principal', 'equipo_retirado', 'adicional'], true)) {
            throw new ValidationException('tipo de foto inválido: ' . $tipo);
        }

        $equipoId = null;
        if ($tipo === 'equipo_retirado') {
            $equipoId = (int) $this->requerido($meta, 'equipo_id');
            if (!$this->materiales->existe($orden['id'], $equipoId, 'retirado')) {
                throw new ValidationException('Esa foto debe corresponder a un equipo ya escaneado como retirado en esta orden.');
            }
        }

        $guardada = (new FotoUploadService())->guardar($archivo, [
            'orden_id' => $orden['id'],
            'tipo' => $tipo,
            'equipo_id' => $equipoId,
            'latitud' => $meta['latitud'] ?? null,
            'longitud' => $meta['longitud'] ?? null,
            'tomada_en' => $meta['tomada_en'] ?? date('Y-m-d H:i:s'),
        ]);

        return [
            'foto' => $guardada,
            'orden' => $this->estadoCompleto($this->ordenes->find($orden['id'])),
        ];
    }

    /**
     * Paso 4. El técnico manda exactamente lo que usó (puede ser nada) — ya
     * no hay kit estándar que precargar (ver resolverItemsFerreteria).
     * Siempre queda cantidad_estandar y cantidad_final guardadas, aunque la
     * primera ahora sea siempre 0, para que el histórico de orden_ferreteria
     * mantenga la misma forma de siempre.
     */
    public function registrarFerreteria(int $tecnicoId, string $uuid, array $items): array
    {
        $orden = $this->obtenerOrdenDelTecnico($tecnicoId, $uuid, soloEditable: true);
        $this->verificarConsumoNoConfirmado($orden);

        $resueltos = $this->resolverItemsFerreteria($items);

        $this->ordenFerreteria->eliminarDeOrden($orden['id']); // idempotente ante un reenvío del paso 4
        foreach ($resueltos as $item) {
            $this->ordenFerreteria->agregar(
                $orden['id'],
                $item['item_ferreteria_id'],
                $item['cantidad_estandar'],
                $item['cantidad_final'],
                ajustadoManualmente: $item['ajustado_manualmente']
            );
        }

        return $this->estadoCompleto($this->ordenes->find($orden['id']));
    }

    public function actualizarCierreTecnico(int $tecnicoId, string $uuid, array $datos): array
    {
        $orden = $this->obtenerOrdenDelTecnico($tecnicoId, $uuid, soloEditable: true);

        $campos = array_intersect_key($datos, array_flip([
            'senal_porcentaje', 'calidad_porcentaje', 'metros_cable',
            'observaciones', 'latitud', 'longitud',
        ]));
        foreach (['senal_porcentaje', 'calidad_porcentaje'] as $campoPorcentaje) {
            if (isset($campos[$campoPorcentaje]) && ($campos[$campoPorcentaje] < 0 || $campos[$campoPorcentaje] > 100)) {
                throw new ValidationException("$campoPorcentaje debe estar entre 0 y 100.");
            }
        }

        if ($campos) {
            $this->ordenes->actualizar($orden['id'], $campos);
        }
        return $this->estadoCompleto($this->ordenes->find($orden['id']));
    }

    /**
     * Paso 5. Todo en una transacción: snapshot de precio/%, confirmación
     * física de equipos y ferretería, confirmación de comisión si hay venta
     * enlazada, y detección de folio en conflicto.
     */
    public function enviar(int $tecnicoId, string $uuid): array
    {
        $orden = $this->obtenerOrdenDelTecnico($tecnicoId, $uuid, soloEditable: true);

        return Database::transaction(function () use ($orden, $tecnicoId) {
            $conflicto = $this->ordenes->folioEnConflicto(
                $orden['folio'], $orden['uuid_dispositivo'], $tecnicoId, $orden['fecha_trabajo_dispositivo']
            );
            if ($conflicto) {
                $this->ordenes->actualizar($orden['id'], ['estado' => 'conflicto']);
                $this->conflictos->crear(
                    $orden['id'],
                    'folio_duplicado',
                    (int) $conflicto['id'],
                    "Folio {$orden['folio']} ya existe en la orden #{$conflicto['id']}"
                );
                return $this->estadoCompleto($this->ordenes->find($orden['id']));
            }

            $materiales = $this->materiales->paraOrden($orden['id']);
            if (empty($materiales)) {
                throw new ValidationException('La orden no tiene materiales escaneados.');
            }

            $tipoServicio = $this->tiposServicio->find((int) $orden['tipo_servicio_id']);
            $this->validarFotosCompletas($orden, $tipoServicio, $materiales);

            return $this->confirmarEnviada((int) $orden['id'], $tecnicoId);
        });
    }

    /**
     * "Los planes van subiendo por cantidad de decos" (confirmado por
     * Edwin) — cada plan ya trae su cantidad de decos en el nombre ("Plan
     * Básico 2 Decos"), así que la instalación cobra según el plan que
     * vendió, sin pedirle al técnico ningún dato nuevo. Solo aplica a
     * 'instalacion_nueva'; los demás tipos de servicio (soporte, retiro,
     * adicional) no varían por plan. Si la orden no tiene venta enlazada, o
     * ese plan todavía no tiene una fila en tarifas_instalacion_plan, se
     * cae al monto plano de tarifas_servicio — mismo comportamiento que
     * había antes de esto para todos los casos.
     */
    private function calcularMontoBruto(array $orden): float
    {
        $tipoServicio = $this->tiposServicio->find((int) $orden['tipo_servicio_id']);
        if ($tipoServicio && $tipoServicio['codigo'] === 'instalacion_nueva') {
            if (!empty($orden['venta_id'])) {
                $venta = $this->ventas->find((int) $orden['venta_id']);
                if ($venta) {
                    $tarifaPlan = $this->tarifasInstalacionPlan->vigentePara((int) $venta['plan_id']);
                    if ($tarifaPlan) {
                        return (float) $tarifaPlan['monto'];
                    }
                }
            }

            // Si es instalación nueva sin venta vinculada, calcular por decos instalados
            $materiales = $this->materiales->paraOrden((int) $orden['id']);
            $numDecos = max(1, count(array_filter($materiales, fn($m) => $m['accion'] === 'instalado')));
            // Escalonamiento TuVes oficial: 1 Deco = $12.000, 2 = $14.000, 3 = $16.000, 4 = $18.000
            $escalonamiento = [1 => 12000.0, 2 => 14000.0, 3 => 16000.0, 4 => 18000.0];
            return $escalonamiento[min(4, $numDecos)] ?? 12000.0;
        }

        $tarifa = $this->tarifas->vigentePara((int) $orden['tipo_servicio_id']);
        if ($tarifa) {
            return (float) $tarifa['monto'];
        }

        // Fallbacks de seguridad para garantizar continuidad operativa en terreno
        $fallbacks = [
            'soporte_falla' => 12000.0,
            'servicio_adicional' => 15000.0,
            'retiro' => 8000.0,
        ];
        $codigo = $tipoServicio['codigo'] ?? '';
        return $fallbacks[$codigo] ?? 12000.0;
    }

    /**
     * Lo que hace que una orden efectivamente cuente como trabajo confirmado:
     * snapshot de tarifa/monto, consumo físico de equipos y ferretería, y
     * confirmación de la venta enlazada si la hay. Se llama en tres momentos
     * — nunca duplicada entre ellos, para que no puedan divergir:
     *
     *  - enviar(), cuando el folio NO está en conflicto.
     *  - crearRetroactiva(), cuando el folio NO está en conflicto.
     *  - ConflictoService::resolver('aceptar'), cuando una orden que había
     *    quedado en 'conflicto' resulta ser trabajo legítimo (ej. visita de
     *    garantía). Antes de existir este método compartido, "aceptar" solo
     *    cambiaba el estado a mano y la orden quedaba con monto NULL y sin
     *    confirmar nada físico, aunque después se aprobara en auditoría.
     *
     * Requiere que la orden YA tenga sus materiales guardados en
     * orden_materiales — eso lo garantiza el llamador en los tres casos:
     * el wizard los guarda en el paso 2 (antes de que exista folio en
     * conflicto o no), y crearRetroactiva() los guarda antes de decidir si
     * hubo conflicto.
     *
     * **Auto-aprobación** (pedido: "elimina auditoria" — Edwin decidió que
     * el paso de revisión manual antes de pagar ya no hace falta): la orden
     * pasa directo a 'aprobada' con `fecha_auditoria` = ahora, en vez de
     * quedar 'enviada' esperando que alguien la audite. `auditor_id` queda
     * NULL — nadie la revisó, se aprobó sola al enviarse. Esto también
     * habilita de inmediato la venta enlazada (confirmarVenta más abajo) y
     * hace que la orden ya cuente para liquidar en Billetera. El módulo de
     * auditoría (aprobar/rechazar/observar/reabrir, ver AuditoriaService)
     * sigue existiendo por dentro para una corrección manual puntual vía
     * API, pero ya no tiene pantalla en el panel — ver Historial.
     */
    private function confirmarEnviada(int $ordenId, int $tecnicoId): array
    {
        $orden = $this->ordenes->find($ordenId);
        if (!$orden) {
            throw new NotFoundException('Orden no encontrada.');
        }

        $materiales = $this->materiales->paraOrden($ordenId);
        if (empty($materiales)) {
            throw new ValidationException('La orden no tiene materiales escaneados.');
        }

        $montoBruto = $this->calcularMontoBruto($orden);

        $tecnico = $this->usuarios->find($tecnicoId);
        $porcentaje = (float) $tecnico['porcentaje_reparto'];

        $this->ordenes->actualizar($ordenId, [
            'estado' => 'aprobada',
            'fecha_auditoria' => date('Y-m-d H:i:s'),
            'monto_bruto' => $montoBruto,
            'porcentaje_aplicado' => $porcentaje,
            'monto_tecnico' => round($montoBruto * $porcentaje / 100),
        ]);

        $this->confirmarConsumoFisico($ordenId, $materiales, $tecnicoId);

        if (!empty($orden['venta_id'])) {
            $this->confirmarVenta((int) $orden['venta_id']);
        }

        return $this->estadoCompleto($this->ordenes->find($ordenId));
    }

    /**
     * Punto de entrada para ConflictoService::resolver('aceptar') — el
     * único lugar fuera de este servicio que necesita disparar
     * confirmarEnviada(). No se expone el helper directamente porque su
     * contrato (requiere materiales ya guardados) es un detalle interno.
     */
    public function confirmarOrdenAceptadaTrasConflicto(int $ordenId, int $tecnicoId): array
    {
        return $this->confirmarEnviada($ordenId, $tecnicoId);
    }

    /**
     * Registro retroactivo: el admin carga desde el PC una orden que el
     * técnico ejecutó en terreno sin pasar por el wizard del celular (se le
     * cayó la app, se olvidó el teléfono, reporte en papel). No hay pasos
     * 1-5 ni fotos — todo llega junto y la orden nace directo en 'enviada'
     * (o 'conflicto' si el folio choca), igual que si el wizard ya hubiera
     * terminado. Comparte con enviar() las mismas reglas de negocio sobre
     * equipos, ferretería, tarifa vigente y confirmación de venta — nunca
     * las duplica — para que no puedan divergir entre los dos caminos.
     *
     * Fotos: deliberadamente NO se exigen. Si el trabajo se hizo sin el
     * wizard, tampoco existen fotos capturadas por la cámara del wizard;
     * exigirlas acá solo bloquearía el registro sin ganar evidencia real.
     */
    public function crearRetroactiva(array $datos): array
    {
        $folio = trim((string) $this->requerido($datos, 'folio'));
        if ($folio === '') {
            throw new ValidationException('El folio no puede estar vacío.');
        }

        $tecnicoId = (int) $this->requerido($datos, 'tecnico_id');
        $tecnico = $this->usuarios->find($tecnicoId);
        if (!$tecnico || !(int) $tecnico['activo']) {
            throw new ValidationException('El técnico indicado no existe o está inactivo.');
        }

        $tipoServicioCodigo = (string) $this->requerido($datos, 'tipo_servicio');
        $tipoServicio = $this->tiposServicio->findByCodigo($tipoServicioCodigo);
        if (!$tipoServicio) {
            throw new ValidationException('Tipo de servicio desconocido: ' . $tipoServicioCodigo);
        }

        $fechaTrabajo = trim((string) $this->requerido($datos, 'fecha_trabajo'));
        $timestampTrabajo = strtotime($fechaTrabajo);
        if ($timestampTrabajo === false) {
            throw new ValidationException('fecha_trabajo inválida.');
        }
        if ($timestampTrabajo > time()) {
            throw new ValidationException('Un registro retroactivo no puede tener fecha futura — para eso está el wizard normal.');
        }

        foreach (['senal_porcentaje', 'calidad_porcentaje'] as $campoPorcentaje) {
            if (isset($datos[$campoPorcentaje]) && ($datos[$campoPorcentaje] < 0 || $datos[$campoPorcentaje] > 100)) {
                throw new ValidationException("$campoPorcentaje debe estar entre 0 y 100.");
            }
        }

        // Mismo criterio que crearOReanudarBorrador(): la venta enlazada no
        // tiene que ser del técnico seleccionado — la comisión sigue yendo
        // a quien la vendió, sin importar quién instala.
        $ventaId = null;
        if (!empty($datos['venta_id'])) {
            $venta = $this->ventas->find((int) $datos['venta_id']);
            if (!$venta) {
                throw new ValidationException('La venta indicada no existe.');
            }
            if ($venta['estado'] !== 'registrada') {
                throw new ValidationException('Esa venta ya fue instalada o anulada.');
            }
            $ventaId = (int) $venta['id'];
        }

        $materialesEntrada = $datos['materiales'] ?? [];
        if (empty($materialesEntrada)) {
            throw new ValidationException('Debes indicar al menos un equipo instalado o retirado.');
        }
        $seriesVistas = [];
        $materialesValidados = [];
        foreach ($materialesEntrada as $m) {
            $numeroSerie = trim((string) ($m['numero_serie'] ?? ''));
            $accion = (string) ($m['accion'] ?? '');
            if ($numeroSerie === '' || !in_array($accion, ['instalado', 'retirado'], true)) {
                throw new ValidationException('Cada material necesita numero_serie y accion ("instalado" o "retirado").');
            }
            $clave = $numeroSerie . '|' . $accion;
            if (isset($seriesVistas[$clave])) {
                throw new ValidationException("La serie $numeroSerie está repetida con la misma acción.");
            }
            $seriesVistas[$clave] = true;
            $equipo = $this->validarEquipoParaAccion($tecnicoId, $numeroSerie, $accion);
            $materialesValidados[] = ['equipo_id' => (int) $equipo['id'], 'accion' => $accion];
        }

        $itemsFerreteria = $this->resolverItemsFerreteria($datos['ferreteria'] ?? []);

        $fechaTrabajoSql = date('Y-m-d H:i:s', $timestampTrabajo);
        $camposCierre = array_intersect_key($datos, array_flip([
            'senal_porcentaje', 'calidad_porcentaje', 'metros_cable', 'observaciones',
        ]));

        // La tarifa vigente NO se valida acá arriba a propósito — se valida
        // dentro de confirmarEnviada(), igual que en enviar(). Así, si el
        // folio choca, la orden puede quedar en 'conflicto' sin exigir
        // todavía una tarifa que solo hace falta al confirmarla de verdad
        // (ahora mismo, o después, si el admin acepta el conflicto).
        return Database::transaction(function () use (
            $folio, $tecnicoId, $tipoServicio, $fechaTrabajoSql, $ventaId,
            $materialesValidados, $itemsFerreteria, $camposCierre
        ) {
            $uuid = $this->generarUuid();
            $conflicto = $this->ordenes->folioEnConflicto($folio, $uuid, $tecnicoId, $fechaTrabajoSql);

            $id = $this->ordenes->crear([
                'uuid_dispositivo' => $uuid,
                'folio' => $folio,
                'tipo_servicio_id' => $tipoServicio['id'],
                'tecnico_id' => $tecnicoId,
                'venta_id' => $ventaId,
                // Placeholder: si no hay conflicto, confirmarEnviada() la deja en 'enviada' de verdad.
                'estado' => 'conflicto',
                'fecha_trabajo_dispositivo' => $fechaTrabajoSql,
                'creado_por_admin' => 1,
            ]);

            if ($camposCierre) {
                $this->ordenes->actualizar($id, $camposCierre);
            }

            // Los materiales y la ferretería quedan guardados SIEMPRE, haya
            // o no conflicto — igual que en el wizard normal, donde ya
            // existen desde los pasos 2 y 4 antes de que enviar() sepa si
            // hay folio en conflicto. Así, si el admin después acepta el
            // conflicto (ConflictoService::resolver), confirmarEnviada()
            // tiene de dónde sacar los materiales para confirmar de verdad.
            foreach ($materialesValidados as $m) {
                $this->materiales->agregar($id, $m['equipo_id'], $m['accion'], ingresadoManual: true);
            }
            foreach ($itemsFerreteria as $item) {
                $this->ordenFerreteria->agregar(
                    $id,
                    $item['item_ferreteria_id'],
                    $item['cantidad_estandar'],
                    $item['cantidad_final'],
                    ajustadoManualmente: $item['ajustado_manualmente']
                );
            }

            if ($conflicto) {
                $this->conflictos->crear(
                    $id,
                    'folio_duplicado',
                    (int) $conflicto['id'],
                    "Folio $folio ya existe en la orden #{$conflicto['id']}"
                );
                return $this->estadoCompleto($this->ordenes->find($id));
            }

            return $this->confirmarEnviada($id, $tecnicoId);
        });
    }

    /**
     * Aplica de una vez el descuento físico de equipos y ferretería de una
     * orden — equipos pasan a instalado/retirado y se descuenta el stock de
     * ferretería del técnico, dejando el rastro en movimientos_equipo y
     * movimientos_ferreteria. Se usa tanto al enviar() el wizard como al
     * cargar un registro retroactivo, porque en ambos casos el trabajo
     * físico ya ocurrió y hay que confirmarlo pase lo que pase después en
     * auditoría.
     *
     * Idempotente por orden: si ya existe un movimientos_equipo para esta
     * orden (reenvío tras reabrir un rechazo corregible) no repite nada —
     * repetir duplicaría el descuento de ferretería y las filas de movimiento.
     */
    private function confirmarConsumoFisico(int $ordenId, array $materiales, int $tecnicoId): void
    {
        if ($this->movimientosEquipo->existeParaOrden($ordenId)) {
            return;
        }

        foreach ($materiales as $material) {
            $equipoId = (int) $material['equipo_id'];
            if ($material['accion'] === 'instalado') {
                $this->equipos->actualizarEstado($equipoId, 'instalado', null, $ordenId);
                $this->movimientosEquipo->crear($equipoId, 'instalacion', $tecnicoId, null, $ordenId);
            } else { // 'retirado'
                $this->equipos->actualizarEstado($equipoId, 'retirado', null, null);
                $this->movimientosEquipo->crear($equipoId, 'retiro', null, $tecnicoId, $ordenId);
            }
        }

        foreach ($this->ordenFerreteria->paraOrden($ordenId) as $consumo) {
            $cantidad = (float) $consumo['cantidad_final'];
            $this->movimientosFerreteria->crear(
                (int) $consumo['item_ferreteria_id'], $tecnicoId, 'consumo_orden', -$cantidad, $ordenId
            );
            $this->stockFerreteria->ajustar($tecnicoId, (int) $consumo['item_ferreteria_id'], -$cantidad);
        }
    }

    /**
     * Reglas de la maleta física, compartidas entre el escaneo del wizard y
     * el registro retroactivo del admin: para instalar el equipo debe estar
     * en la maleta de ESE técnico; para retirar debe figurar instalado.
     */
    private function validarEquipoParaAccion(int $tecnicoId, string $numeroSerie, string $accion): array
    {
        $equipo = $this->equipos->porSerie($numeroSerie);
        if (!$equipo) {
            throw new NotFoundException(
                'Esta serie no existe en el sistema. ¿La recibiste de otro técnico sin traspaso registrado?'
            );
        }
        if ($accion === 'instalado' && (int) ($equipo['usuario_actual_id'] ?? 0) !== $tecnicoId) {
            throw new ForbiddenException('Este equipo no está en la maleta del técnico.', [
                'numero_serie' => $numeroSerie,
                'estado_actual' => $equipo['estado'],
            ]);
        }
        if ($accion === 'retirado' && $equipo['estado'] !== 'instalado') {
            throw new ForbiddenException('Este equipo no figura instalado — no se puede retirar.', [
                'numero_serie' => $numeroSerie,
                'estado_actual' => $equipo['estado'],
            ]);
        }
        return $equipo;
    }

    /**
     * Normaliza los ítems de ferretería de una orden. Ya no existe un "kit
     * estándar" que precargar (pedido: "eliminar el kit standar de todo el
     * proyecto que no exista" — el wizard del técnico ya venía sin usarlo
     * desde antes, ver paso4-cierre.js: busca y agrega uno por uno lo que
     * usó). Si no llega ningún ítem, la orden simplemente no consumió
     * ferretería — no es un error ni se completa con nada de oficio; hay
     * tipos de servicio (soporte sin cambio de equipo, por ejemplo) que de
     * verdad no gastan nada. `cantidad_estandar` queda en 0 y
     * `ajustado_manualmente` siempre en true — todo lo que llega acá lo
     * eligió el técnico a mano, no hay una referencia contra la cual medir
     * "ajuste". Compartido entre el paso 4 del wizard y el registro
     * retroactivo.
     */
    private function resolverItemsFerreteria(array $itemsSolicitados): array
    {
        $resueltos = [];
        foreach ($itemsSolicitados as $item) {
            $itemId = (int) ($item['item_ferreteria_id'] ?? 0);
            if (!$itemId || !$this->itemsFerreteria->find($itemId)) {
                throw new ValidationException('Ítem de ferretería inválido: ' . ($item['item_ferreteria_id'] ?? '(vacío)'));
            }
            $cantidadFinal = (float) ($item['cantidad_final'] ?? -1);
            if ($cantidadFinal < 0) {
                throw new ValidationException("Cantidad inválida para el ítem $itemId.");
            }
            $resueltos[] = [
                'item_ferreteria_id' => $itemId,
                'cantidad_estandar' => 0.0,
                'cantidad_final' => $cantidadFinal,
                'ajustado_manualmente' => true,
            ];
        }
        return $resueltos;
    }

    /** UUID v4 generado en el servidor — el registro retroactivo no viene de un celular con su propio uuid_dispositivo. */
    private function generarUuid(): string
    {
        $datos = random_bytes(16);
        $datos[6] = chr((ord($datos[6]) & 0x0f) | 0x40);
        $datos[8] = chr((ord($datos[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($datos), 4));
    }

    /**
     * FIX (pedido: "si la venta viene de otro lugar ya sea directa de
     * tuvez o otro tecnico esa no se paga al que instala si no al que
     * vendio") — antes esto recibía el id del TÉCNICO que instala y le
     * acreditaba la comisión a él, sin importar quién había registrado la
     * venta. La comisión es de `venta.vendedor_id` siempre, sea o no la
     * misma persona que termina instalando — instalar una venta ajena no
     * te hace dueño de su comisión.
     */
    private function confirmarVenta(int $ventaId): void
    {
        $venta = $this->ventas->find($ventaId);
        // Si ya no está 'registrada' (otra orden ya la confirmó, o fue
        // anulada), no se reprocesa — evita sobreescribir un snapshot ya hecho.
        if (!$venta || $venta['estado'] !== 'registrada') {
            return;
        }
        // Pedido: "casilla en el registro de venta del técnico" para una
        // venta directa de TuVes sin vendedor interno — sin nadie a quien
        // acreditarle la comisión, la venta igual pasa a 'instalada' (el
        // trabajo se hizo), pero monto_comision/monto_vendedor quedan NULL:
        // no hay comisión que calcular ni repartir.
        if ($venta['vendedor_id'] === null) {
            $this->ventas->actualizar($ventaId, ['estado' => 'instalada']);
            return;
        }
        $comision = $this->comisiones->vigentePara((int) $venta['plan_id']);
        if (!$comision) {
            return; // sin comisión configurada para el plan: se resuelve manualmente, no se bloquea la instalación
        }
        $vendedor = $this->usuarios->find((int) $venta['vendedor_id']);
        $porcentaje = (float) $vendedor['porcentaje_reparto'];
        $this->ventas->actualizar($ventaId, [
            'estado' => 'instalada',
            'monto_comision' => $comision['monto'],
            'porcentaje_aplicado' => $porcentaje,
            'monto_vendedor' => round($comision['monto'] * $porcentaje / 100),
        ]);
    }

    private function validarFotosCompletas(array $orden, array $tipoServicio, array $materiales): void
    {
        $fotos = $this->fotos->paraOrden($orden['id']);

        if ((int) $tipoServicio['fotos_dinamicas'] === 1) {
            $retirados = array_filter($materiales, static fn(array $m) => $m['accion'] === 'retirado');
            if (count($fotos) < count($retirados)) {
                throw new ValidationException('Falta la foto de al menos un equipo retirado.');
            }
            return;
        }

        $tiposSubidos = array_column($fotos, 'tipo');
        foreach ($this->tiposServicio->requisitosFoto((int) $tipoServicio['id']) as $requisito) {
            if ((int) $requisito['obligatoria'] === 1 && !in_array($requisito['codigo'], $tiposSubidos, true)) {
                throw new ValidationException('Falta la foto obligatoria: ' . $requisito['etiqueta']);
            }
        }
    }

    /**
     * Bloquea editar materiales/ferretería si el consumo físico de esta
     * orden ya se confirmó alguna vez (paso 5 ya corrió). Se puede llegar
     * acá con estado='borrador' otra vez después de un reabrir() sobre un
     * rechazo corregible — en ese caso solo se permite corregir fotos y
     * datos de cierre técnico, no qué equipos o ferretería se usaron.
     */
    private function verificarConsumoNoConfirmado(array $orden): void
    {
        if ($this->movimientosEquipo->existeParaOrden((int) $orden['id'])) {
            throw new ApiException(
                'Esta orden ya confirmó su consumo físico — solo se pueden corregir fotos y los datos de cierre.',
                409,
                'consumo_ya_confirmado'
            );
        }
    }

    private function obtenerOrdenDelTecnico(int $tecnicoId, string $uuid, bool $soloEditable = false): array
    {
        $orden = $this->ordenes->porUuid($uuid);
        if (!$orden) {
            throw new NotFoundException('Orden no encontrada.');
        }
        if ((int) $orden['tecnico_id'] !== $tecnicoId) {
            throw new ForbiddenException('Esta orden pertenece a otro técnico.');
        }
        if ($soloEditable && $orden['estado'] !== 'borrador') {
            throw new ApiException('Esta orden ya fue enviada y no se puede editar.', 409, 'orden_no_editable');
        }
        return $orden;
    }

    private function estadoCompleto(array $orden): array
    {
        $orden['materiales'] = $this->materiales->paraOrden((int) $orden['id']);
        $orden['fotos'] = $this->fotos->paraOrden((int) $orden['id']);
        $orden['ferreteria'] = $this->ordenFerreteria->paraOrden((int) $orden['id']);
        return $orden;
    }

    private function requerido(array $datos, string $campo)
    {
        if (!isset($datos[$campo]) || $datos[$campo] === '') {
            throw new ValidationException("Falta el campo requerido: $campo");
        }
        return $datos[$campo];
    }
}
