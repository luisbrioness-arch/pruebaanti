-- ============================================================================
-- SISTEMA TERRENO DTH · Esquema de base de datos · FASE 1
-- ============================================================================
-- Alcance de esta fase: bodega serializada, ferretería por cantidad, órdenes
-- de trabajo con evidencia fotográfica, tarifario versionado.
-- Explícitamente NO incluye en esta fase (tablas para Fase 2/3 al final del
-- archivo, creadas pero sin lógica de aplicación todavía): billetera,
-- liquidación, ventas, control de stock físico.
--
-- Motor: MySQL 5.7+ / MariaDB 10.3+ (compatible con hosting compartido cPanel)
-- Charset: utf8mb4 en todo — nombres y direcciones chilenas usan tildes y ñ.
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- USUARIOS
-- ----------------------------------------------------------------------------
-- Aunque Fase 1 opera con un solo usuario al 100%, la tabla ya contempla el
-- porcentaje de reparto por persona (definición: "el mismo % aplica a venta
-- e instalación", por eso es un solo campo y no dos).
-- ----------------------------------------------------------------------------
CREATE TABLE usuarios (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre                  VARCHAR(120)    NOT NULL,
    usuario                 VARCHAR(60)     NOT NULL,
    email                   VARCHAR(160)    NULL,
    password_hash           VARCHAR(255)    NOT NULL,
    rol                     ENUM('admin','tecnico') NOT NULL DEFAULT 'tecnico',
    porcentaje_reparto      DECIMAL(5,2)    NOT NULL DEFAULT 100.00, -- 70.00 / 80.00 / 100.00
    activo                  TINYINT(1)      NOT NULL DEFAULT 1,
    creado_en               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                             ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_usuarios_usuario (usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- CATÁLOGO DE SERVICIOS Y TARIFARIO VERSIONADO
-- ----------------------------------------------------------------------------
-- Regla dura: "editar un precio hoy no puede cambiar lo que se liquidó el mes
-- pasado". Por eso el precio no vive como columna en tipos_servicio, sino en
-- una tabla de versiones con vigencia. La orden, al crearse, copia el monto
-- vigente a orden.monto_bruto (ver más abajo) — así ni siquiera depende de
-- reconsultar el histórico para cuadrar liquidaciones futuras.
-- ----------------------------------------------------------------------------
CREATE TABLE tipos_servicio (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo                  VARCHAR(40)     NOT NULL,   -- 'instalacion_nueva','servicio_adicional','soporte_falla','retiro'
    nombre                  VARCHAR(80)     NOT NULL,
    requiere_series         TINYINT(1)      NOT NULL DEFAULT 1,
    fotos_dinamicas         TINYINT(1)      NOT NULL DEFAULT 0, -- 1 = retiro (1 foto por equipo escaneado)
    activo                  TINYINT(1)      NOT NULL DEFAULT 1,
    orden_visualizacion     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    UNIQUE KEY uk_tipos_servicio_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tipos_servicio_foto_requisito (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tipo_servicio_id        INT UNSIGNED    NOT NULL,
    codigo                  VARCHAR(40)     NOT NULL,   -- 'antena','deco_principal'
    etiqueta                VARCHAR(120)    NOT NULL,   -- lo que ve el técnico en el slot
    criterio_aceptacion     VARCHAR(255)    NOT NULL,   -- el mismo texto que usará el auditor
    obligatoria             TINYINT(1)      NOT NULL DEFAULT 1,
    orden_visualizacion     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT fk_fotoreq_tiposervicio FOREIGN KEY (tipo_servicio_id)
        REFERENCES tipos_servicio(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tarifas_servicio (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tipo_servicio_id        INT UNSIGNED    NOT NULL,
    monto                   DECIMAL(10,0)   NOT NULL,
    vigente_desde           DATETIME        NOT NULL,
    vigente_hasta           DATETIME        NULL,       -- NULL = vigente actualmente
    creado_por              INT UNSIGNED    NOT NULL,
    creado_en               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tarifa_tiposervicio FOREIGN KEY (tipo_servicio_id)
        REFERENCES tipos_servicio(id),
    CONSTRAINT fk_tarifa_usuario FOREIGN KEY (creado_por)
        REFERENCES usuarios(id),
    KEY idx_tarifa_vigencia (tipo_servicio_id, vigente_desde, vigente_hasta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Al editar el precio desde el admin: la app cierra la fila vigente
-- (vigente_hasta = NOW()) e inserta una nueva con vigente_hasta = NULL.
-- Nunca hacer UPDATE del monto sobre la fila vigente.

-- ----------------------------------------------------------------------------
-- VENTAS — alcance mínimo, adelantado desde Fase 2
-- ----------------------------------------------------------------------------
-- El módulo completo de ventas (comisión repartida por %, pipeline, caídas)
-- es Fase 2. Pero el técnico único de Fase 1 ya vende e instala hoy, a veces
-- el mismo día (respuestas 11, 21, 23) — sin esta tabla no hay forma de saber
-- qué instalación vino de una venta propia. Se adelanta solo lo mínimo:
-- catálogo de planes, comisión versionada (mismo patrón que tarifas_servicio)
-- y la venta en sí, referenciada al sistema de TuVes, nunca duplicando sus
-- datos (regla: "tiene un sistema, solo se referencia a ese modelo").
-- ----------------------------------------------------------------------------
CREATE TABLE planes (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo                  VARCHAR(40)     NOT NULL,
    nombre                  VARCHAR(80)     NOT NULL,
    activo                  TINYINT(1)      NOT NULL DEFAULT 1,
    UNIQUE KEY uk_planes_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE comisiones_plan (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    plan_id                 INT UNSIGNED    NOT NULL,
    monto                   DECIMAL(10,0)   NOT NULL,
    vigente_desde           DATETIME        NOT NULL,
    vigente_hasta           DATETIME        NULL,
    creado_por              INT UNSIGNED    NOT NULL,
    creado_en               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_comisionplan_plan FOREIGN KEY (plan_id)
        REFERENCES planes(id),
    CONSTRAINT fk_comisionplan_usuario FOREIGN KEY (creado_por)
        REFERENCES usuarios(id),
    KEY idx_comisionplan_vigencia (plan_id, vigente_desde, vigente_hasta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Versionada por el mismo motivo que tarifas_servicio: editar la comisión de
-- un plan no puede alterar una venta ya confirmada.

CREATE TABLE ventas (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    numero_venta_tuves      VARCHAR(40)     NOT NULL,   -- referencia al sistema de TuVes, no se duplica su ficha
    cliente_nombre          VARCHAR(160)    NOT NULL,
    comuna                  VARCHAR(80)     NOT NULL,
    plan_id                 INT UNSIGNED    NOT NULL,
    vendedor_id             INT UNSIGNED    NOT NULL,
    estado                  ENUM('registrada','instalada','anulada') NOT NULL DEFAULT 'registrada',

    -- Snapshots, mismo patrón que ordenes: se completan cuando la instalación
    -- asociada llega a 'enviada' (regla 20: el hito que paga es la instalación).
    monto_comision          DECIMAL(10,0)   NULL,
    porcentaje_aplicado     DECIMAL(5,2)    NULL,
    monto_vendedor          DECIMAL(10,0)   NULL,

    creado_en               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_ventas_numero_tuves (numero_venta_tuves),
    CONSTRAINT fk_venta_plan FOREIGN KEY (plan_id)
        REFERENCES planes(id),
    CONSTRAINT fk_venta_vendedor FOREIGN KEY (vendedor_id)
        REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- INVENTARIO SERIALIZADO
-- ----------------------------------------------------------------------------
CREATE TABLE tipos_equipo (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo                  VARCHAR(40)     NOT NULL,   -- 'decodificador','tarjeta','lnb','control_remoto'
    nombre                  VARCHAR(80)     NOT NULL,
    UNIQUE KEY uk_tiposequipo_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE equipos (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tipo_equipo_id          INT UNSIGNED    NOT NULL,
    numero_serie            VARCHAR(60)     NOT NULL,
    estado                  ENUM(
                                'bodega',
                                'maleta',
                                'instalado',
                                'retirado',
                                'falla_fabrica',
                                'devuelto_tuves',
                                'perdido'
                            ) NOT NULL DEFAULT 'bodega',
    usuario_actual_id       INT UNSIGNED    NULL,       -- quién lo tiene en su maleta; NULL si está en bodega
    orden_instalacion_id    INT UNSIGNED    NULL,       -- se completa cuando queda 'instalado' (FK se agrega tras crear ordenes)
    creado_en               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                             ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_equipos_serie (numero_serie),
    CONSTRAINT fk_equipo_tipoequipo FOREIGN KEY (tipo_equipo_id)
        REFERENCES tipos_equipo(id),
    CONSTRAINT fk_equipo_usuario FOREIGN KEY (usuario_actual_id)
        REFERENCES usuarios(id),
    KEY idx_equipos_estado (estado),
    KEY idx_equipos_usuario (usuario_actual_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Historial de movimientos del equipo. Es la fuente de verdad; 'equipos.estado'
-- es solo la foto del último movimiento, para no tener que recalcularla en
-- cada consulta. Misma razón que la billetera: si alguien pregunta "¿dónde
-- estuvo este decodificador?", tiene que existir la línea, no una suposición.
CREATE TABLE movimientos_equipo (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    equipo_id               INT UNSIGNED    NOT NULL,
    tipo_movimiento         ENUM(
                                'ingreso_bodega',
                                'asignacion_maleta',
                                'traspaso',
                                'instalacion',
                                'retiro',
                                'falla_fabrica',
                                'devolucion_tuves',
                                'ajuste_descuadre'
                            ) NOT NULL,
    usuario_origen_id       INT UNSIGNED    NULL,       -- quién entregaba (traspaso) o tenía el equipo
    usuario_destino_id      INT UNSIGNED    NULL,       -- quién recibe
    orden_id                INT UNSIGNED    NULL,       -- se agrega FK tras crear tabla ordenes
    observacion             VARCHAR(255)    NULL,
    creado_en               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_movequipo_equipo FOREIGN KEY (equipo_id)
        REFERENCES equipos(id),
    CONSTRAINT fk_movequipo_usrorigen FOREIGN KEY (usuario_origen_id)
        REFERENCES usuarios(id),
    CONSTRAINT fk_movequipo_usrdestino FOREIGN KEY (usuario_destino_id)
        REFERENCES usuarios(id),
    KEY idx_movequipo_equipo (equipo_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- FERRETERÍA (inventario por cantidad, no por serie)
-- ----------------------------------------------------------------------------
CREATE TABLE items_ferreteria (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo                  VARCHAR(40)     NOT NULL,   -- 'grampa_7mm','conector_rg6','amarra','tarugo','tirafondo','cable_rg6_m'
    nombre                  VARCHAR(80)     NOT NULL,
    unidad_medida           ENUM('unidad','metro') NOT NULL DEFAULT 'unidad',
    activo                  TINYINT(1)      NOT NULL DEFAULT 1,
    UNIQUE KEY uk_itemferr_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Kit estándar por tipo de servicio: lo que el wizard precarga en el paso 4.
CREATE TABLE kits_servicio_item (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tipo_servicio_id        INT UNSIGNED    NOT NULL,
    item_ferreteria_id      INT UNSIGNED    NOT NULL,
    cantidad_estandar       DECIMAL(8,2)    NOT NULL,
    CONSTRAINT fk_kititem_tiposervicio FOREIGN KEY (tipo_servicio_id)
        REFERENCES tipos_servicio(id),
    CONSTRAINT fk_kititem_item FOREIGN KEY (item_ferreteria_id)
        REFERENCES items_ferreteria(id),
    UNIQUE KEY uk_kititem (tipo_servicio_id, item_ferreteria_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Stock teórico de ferretería por técnico (su "maleta" de consumibles).
-- Es una tabla derivada — se reconstruye sumando movimientos_ferreteria —
-- pero se mantiene materializada por rendimiento (se lee en cada wizard).
CREATE TABLE stock_ferreteria_usuario (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id              INT UNSIGNED    NOT NULL,
    item_ferreteria_id      INT UNSIGNED    NOT NULL,
    cantidad_actual         DECIMAL(10,2)   NOT NULL DEFAULT 0,
    actualizado_en          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                             ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_stockferr_usuario FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id),
    CONSTRAINT fk_stockferr_item FOREIGN KEY (item_ferreteria_id)
        REFERENCES items_ferreteria(id),
    UNIQUE KEY uk_stockferr (usuario_id, item_ferreteria_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE movimientos_ferreteria (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_ferreteria_id      INT UNSIGNED    NOT NULL,
    usuario_id              INT UNSIGNED    NOT NULL,
    tipo_movimiento         ENUM(
                                'entrega_bodega',
                                'consumo_orden',
                                'traspaso_entrada',
                                'traspaso_salida',
                                'ajuste_descuadre'
                            ) NOT NULL,
    cantidad                DECIMAL(10,2)   NOT NULL,   -- positivo = entra, negativo = sale
    orden_id                INT UNSIGNED    NULL,       -- FK se agrega tras crear tabla ordenes
    observacion             VARCHAR(255)    NULL,
    creado_en               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_movferr_item FOREIGN KEY (item_ferreteria_id)
        REFERENCES items_ferreteria(id),
    CONSTRAINT fk_movferr_usuario FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id),
    KEY idx_movferr_usuario (usuario_id, item_ferreteria_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- ÓRDENES DE TRABAJO — tabla central
-- ----------------------------------------------------------------------------
CREATE TABLE ordenes (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    -- Identidad e idempotencia offline. El celular genera este UUID al crear
    -- el borrador. Si "Enviar" se dispara dos veces o la red responde tarde,
    -- el servidor reconoce que es la misma orden por este campo, no por folio.
    uuid_dispositivo        CHAR(36)        NOT NULL,

    folio                   VARCHAR(30)     NOT NULL,
    tipo_servicio_id        INT UNSIGNED    NOT NULL,
    tecnico_id              INT UNSIGNED    NOT NULL,
    venta_id                INT UNSIGNED    NULL,       -- si esta instalación viene de una venta propia (elegida en el wizard)

    estado                  ENUM(
                                'borrador',          -- creada en el server al paso 1, incompleta: recibe fotos/materiales antes del envío final (paso 5)
                                'enviada',            -- llegó al server, pendiente de auditoría
                                'observada',          -- Edwin pidió algo antes de decidir
                                'aprobada',
                                'rechazada_corregible',   -- vuelve al técnico, puede reenviar
                                'rechazada_penalizada',   -- cierra sin pago
                                'conflicto',          -- folio o serie ya existía al sincronizar
                                'liquidada'           -- quedó dentro de un período cerrado
                            ) NOT NULL DEFAULT 'enviada',

    -- Snapshots: lo que se cobra queda fijo al momento de aprobar, sin
    -- importar que el tarifario o el % del técnico cambien después.
    monto_bruto             DECIMAL(10,0)   NULL,     -- copiado de tarifas_servicio vigente
    porcentaje_aplicado     DECIMAL(5,2)    NULL,     -- copiado de usuarios.porcentaje_reparto
    monto_tecnico           DECIMAL(10,0)   NULL,     -- = monto_bruto * porcentaje_aplicado / 100

    -- Datos de cierre técnico (paso 4 del wizard)
    senal_porcentaje        TINYINT UNSIGNED NULL,
    calidad_porcentaje      TINYINT UNSIGNED NULL,
    satelite                VARCHAR(20)     NULL,
    metros_cable            DECIMAL(6,1)    NULL,
    observaciones           VARCHAR(500)    NULL,
    latitud                 DECIMAL(10,7)   NULL,
    longitud                DECIMAL(10,7)   NULL,

    -- Auditoría
    auditor_id              INT UNSIGNED    NULL,
    fecha_auditoria         DATETIME        NULL,
    motivo_rechazo          VARCHAR(60)     NULL,     -- 'mala_instalacion','foto_ilegible','serie_incorrecta','datos_incompletos','no_corresponde'
    comentario_auditoria    VARCHAR(500)    NULL,

    -- Conciliación con TuVes (regla 4: la empresa absorbe, pero queda registrado)
    pagada_por_tuves        TINYINT(1)      NULL,     -- NULL = sin conciliar todavía
    fecha_conciliacion      DATETIME        NULL,

    -- Trazabilidad de origen
    creado_por_admin        TINYINT(1)      NOT NULL DEFAULT 0, -- registro retroactivo cargado por el admin desde PC
    fecha_trabajo_dispositivo DATETIME      NOT NULL,  -- cuándo el técnico dice que hizo el trabajo (reloj del celular)
    creado_en               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP, -- cuándo llegó al server
    actualizado_en          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                             ON UPDATE CURRENT_TIMESTAMP,

    periodo_liquidacion_id  INT UNSIGNED    NULL,      -- se completa en Fase 2

    UNIQUE KEY uk_ordenes_uuid (uuid_dispositivo),
    KEY idx_ordenes_folio (folio),
    KEY idx_ordenes_tecnico_estado (tecnico_id, estado),
    CONSTRAINT fk_orden_tiposervicio FOREIGN KEY (tipo_servicio_id)
        REFERENCES tipos_servicio(id),
    CONSTRAINT fk_orden_tecnico FOREIGN KEY (tecnico_id)
        REFERENCES usuarios(id),
    CONSTRAINT fk_orden_auditor FOREIGN KEY (auditor_id)
        REFERENCES usuarios(id),
    CONSTRAINT fk_orden_venta FOREIGN KEY (venta_id)
        REFERENCES ventas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Nota deliberada sobre folio: NO es UNIQUE. Un folio puede repetirse en
-- conflicto (dos técnicos, mala sincronía) y eso debe *guardarse*, no
-- rechazarse en el INSERT. El duplicado real se detecta en la capa de
-- aplicación al sincronizar y se marca 'conflicto' — ver docs/modelo-datos-fase1.md.

-- Ahora que existen 'ordenes', se completan las FK pendientes:
ALTER TABLE equipos
    ADD CONSTRAINT fk_equipo_ordeninstalacion FOREIGN KEY (orden_instalacion_id)
        REFERENCES ordenes(id);

ALTER TABLE movimientos_equipo
    ADD CONSTRAINT fk_movequipo_orden FOREIGN KEY (orden_id)
        REFERENCES ordenes(id);

ALTER TABLE movimientos_ferreteria
    ADD CONSTRAINT fk_movferr_orden FOREIGN KEY (orden_id)
        REFERENCES ordenes(id);

-- Series escaneadas/ingresadas en la orden (paso 2 del wizard)
CREATE TABLE orden_materiales (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    orden_id                INT UNSIGNED    NOT NULL,
    equipo_id               INT UNSIGNED    NOT NULL,
    accion                  ENUM('instalado','retirado') NOT NULL,
    ingresado_manual        TINYINT(1)      NOT NULL DEFAULT 0, -- regla dura: se marca siempre que no vino del escáner
    creado_en               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ordenmat_orden FOREIGN KEY (orden_id)
        REFERENCES ordenes(id),
    CONSTRAINT fk_ordenmat_equipo FOREIGN KEY (equipo_id)
        REFERENCES equipos(id),
    UNIQUE KEY uk_ordenmat (orden_id, equipo_id, accion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Consumo de ferretería (paso 4). Se registra siempre, sea el kit estándar
-- tal cual o ajustado a mano — así el histórico queda parejo para calcular
-- el stock teórico sin distinguir casos.
CREATE TABLE orden_ferreteria (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    orden_id                INT UNSIGNED    NOT NULL,
    item_ferreteria_id      INT UNSIGNED    NOT NULL,
    cantidad_estandar       DECIMAL(8,2)    NOT NULL,   -- lo que proponía el kit
    cantidad_final          DECIMAL(8,2)    NOT NULL,   -- lo que efectivamente se descontó
    ajustado_manualmente    TINYINT(1)      NOT NULL DEFAULT 0,
    CONSTRAINT fk_ordenferr_orden FOREIGN KEY (orden_id)
        REFERENCES ordenes(id),
    CONSTRAINT fk_ordenferr_item FOREIGN KEY (item_ferreteria_id)
        REFERENCES items_ferreteria(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Evidencia fotográfica (paso 3). Slots fijos para instalación/reparación,
-- dinámicos para retiro (1 fila por equipo escaneado — equipo_id se llena
-- solo en ese caso).
CREATE TABLE orden_fotos (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    orden_id                INT UNSIGNED    NOT NULL,
    tipo                    ENUM('antena','deco_principal','equipo_retirado','adicional') NOT NULL,
    equipo_id               INT UNSIGNED    NULL,       -- se llena solo para 'equipo_retirado'
    ruta_archivo            VARCHAR(255)    NOT NULL,
    tamano_bytes            INT UNSIGNED    NOT NULL,
    latitud                 DECIMAL(10,7)   NULL,
    longitud                DECIMAL(10,7)   NULL,
    tomada_en               DATETIME        NOT NULL,   -- reloj del celular al capturar
    subida_en               DATETIME        NULL,       -- se completa cuando el server confirma recepción
    archivada               TINYINT(1)      NOT NULL DEFAULT 0, -- regla retención: 1 año en hosting, luego se mueve fuera
    CONSTRAINT fk_ordenfoto_orden FOREIGN KEY (orden_id)
        REFERENCES ordenes(id),
    CONSTRAINT fk_ordenfoto_equipo FOREIGN KEY (equipo_id)
        REFERENCES equipos(id),
    KEY idx_ordenfoto_archivada (archivada, tomada_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Nota: 'subida_en' es el campo que gobierna cuándo el celular puede borrar
-- su copia local — nunca antes de que este campo tenga valor (regla dura).

-- Conflictos detectados al sincronizar (folio o serie duplicados offline).
-- La orden entra igual, en estado 'conflicto', y no se audita ni liquida
-- hasta que el admin la resuelva aquí.
CREATE TABLE conflictos_sincronizacion (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    orden_id                INT UNSIGNED    NOT NULL,
    tipo                    ENUM('folio_duplicado','serie_duplicada') NOT NULL,
    orden_conflicto_id      INT UNSIGNED    NULL,       -- la otra orden involucrada, si aplica
    descripcion             VARCHAR(255)    NOT NULL,
    resuelto                TINYINT(1)      NOT NULL DEFAULT 0,
    resuelto_por            INT UNSIGNED    NULL,
    resuelto_en             DATETIME        NULL,
    creado_en               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_conflicto_orden FOREIGN KEY (orden_id)
        REFERENCES ordenes(id),
    CONSTRAINT fk_conflicto_resolutor FOREIGN KEY (resuelto_por)
        REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- LIQUIDACIÓN Y BILLETERA — Fase 2, adelantada (ver docs/liquidacion-billetera.md)
-- ----------------------------------------------------------------------------
-- El "período de liquidación" es un cierre puntual, no un calendario fijo:
-- el admin lo cierra cuando quiere pagarle a un técnico, y agarra TODO lo
-- que ese técnico tenga aprobado/instalado y sin liquidar todavía — no un
-- rango de fechas que el admin tenga que acertar a mano (eso dejaría huecos
-- si una orden se aprueba tarde, después de que ya se cerró "el mes").
-- fecha_desde/fecha_hasta quedan como registro de qué rango cubrió el
-- cierre, no como el criterio que decide qué entra.
CREATE TABLE periodos_liquidacion (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tecnico_id              INT UNSIGNED    NOT NULL,
    fecha_desde             DATETIME        NOT NULL,   -- la fecha_auditoria/creado_en más antigua de lo que entró en este cierre
    fecha_hasta             DATETIME        NOT NULL,   -- momento del cierre
    monto_ordenes           DECIMAL(10,0)   NOT NULL DEFAULT 0,  -- suma de monto_tecnico de las órdenes incluidas
    monto_ventas            DECIMAL(10,0)   NOT NULL DEFAULT 0,  -- suma de monto_vendedor de las ventas incluidas
    monto_total             DECIMAL(10,0)   NOT NULL DEFAULT 0,  -- monto_ordenes + monto_ventas — lo que este cierre acredita en la billetera
    observaciones           VARCHAR(500)    NULL,
    cerrado_por             INT UNSIGNED    NOT NULL,
    creado_en               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_periodo_tecnico FOREIGN KEY (tecnico_id)
        REFERENCES usuarios(id),
    CONSTRAINT fk_periodo_cerradopor FOREIGN KEY (cerrado_por)
        REFERENCES usuarios(id),
    KEY idx_periodo_tecnico (tecnico_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Billetera del técnico: mismo patrón que movimientos_equipo/movimientos_ferreteria
-- — nunca se guarda un "saldo" mutable, se calcula sumando esta tabla. Con el
-- volumen de Fase 1/2 (un puñado de técnicos) no hace falta materializarlo
-- aparte; si el volumen crece, se puede agregar una tabla de saldo cacheado
-- después sin tocar el modelo (mismo argumento que se usó para no
-- materializar equipos.estado como única fuente de verdad).
CREATE TABLE movimientos_billetera (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tecnico_id              INT UNSIGNED    NOT NULL,
    tipo_movimiento         ENUM(
                                'liquidacion',   -- positivo: se le acredita lo que ganó en un cierre
                                'pago',          -- negativo: Edwin le pagó de verdad (transferencia, efectivo)
                                'ajuste'         -- manual, en cualquier sentido — la app exige observación en este caso
                            ) NOT NULL,
    monto                   DECIMAL(10,0)   NOT NULL,   -- positivo = a favor del técnico, negativo = pago realizado
    periodo_liquidacion_id  INT UNSIGNED    NULL,       -- se completa solo cuando tipo_movimiento = 'liquidacion'
    observacion             VARCHAR(255)    NULL,
    creado_por              INT UNSIGNED    NOT NULL,
    creado_en               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_movbilletera_tecnico FOREIGN KEY (tecnico_id)
        REFERENCES usuarios(id),
    CONSTRAINT fk_movbilletera_periodo FOREIGN KEY (periodo_liquidacion_id)
        REFERENCES periodos_liquidacion(id),
    CONSTRAINT fk_movbilletera_creadopor FOREIGN KEY (creado_por)
        REFERENCES usuarios(id),
    KEY idx_movbilletera_tecnico (tecnico_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ahora que existe 'periodos_liquidacion', se completan las FK pendientes:
ALTER TABLE ordenes
    ADD CONSTRAINT fk_orden_periodo FOREIGN KEY (periodo_liquidacion_id)
        REFERENCES periodos_liquidacion(id);

-- 'ventas' nunca tuvo esta columna (se adelantó desde Fase 2 solo lo mínimo
-- para instalación — ver modelo-datos-fase1.md); se agrega recién ahora que
-- hace falta de verdad.
ALTER TABLE ventas
    ADD COLUMN periodo_liquidacion_id INT UNSIGNED NULL AFTER monto_vendedor,
    ADD CONSTRAINT fk_venta_periodo FOREIGN KEY (periodo_liquidacion_id)
        REFERENCES periodos_liquidacion(id);

-- REPORTES — bugs/cambios que cualquier usuario (técnico o admin) deja
-- desde donde esté; Edwin los revisa en una bandeja nueva del panel admin.
-- 'pantalla' la captura el frontend solo (qué vista estaba abierta), nunca
-- la escribe el usuario — es contexto para depurar, no un campo de formulario.
CREATE TABLE reportes (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id      INT UNSIGNED    NOT NULL,
    tipo            ENUM('bug','cambio') NOT NULL,
    descripcion     VARCHAR(1000)   NOT NULL,
    pantalla        VARCHAR(100)    NULL,
    estado          ENUM('abierto','resuelto') NOT NULL DEFAULT 'abierto',
    resuelto_por    INT UNSIGNED    NULL,
    resuelto_en     DATETIME        NULL,
    creado_en       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reporte_usuario FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id),
    CONSTRAINT fk_reporte_resueltopor FOREIGN KEY (resuelto_por)
        REFERENCES usuarios(id),
    KEY idx_reporte_estado (estado, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- DATOS SEMILLA MÍNIMOS
-- ============================================================================

INSERT INTO usuarios (nombre, usuario, password_hash, rol, porcentaje_reparto)
VALUES ('Edwin', 'edwin', '__REEMPLAZAR_CON_HASH_REAL__', 'admin', 100.00);

INSERT INTO tipos_servicio (codigo, nombre, requiere_series, fotos_dinamicas, orden_visualizacion) VALUES
('instalacion_nueva',   'Instalación nueva',    1, 0, 1),
('servicio_adicional',  'Servicio adicional',   1, 0, 2),
('soporte_falla',       'Soporte / Falla',      1, 0, 3),
('retiro',              'Retiro',               1, 1, 4);

-- Requisitos de foto para instalación y soporte (2 fotos fijas)
INSERT INTO tipos_servicio_foto_requisito (tipo_servicio_id, codigo, etiqueta, criterio_aceptacion, orden_visualizacion)
SELECT id, 'antena', 'Antena instalada', 'Antena visible, apuntada, sin obstrucciones', 1
FROM tipos_servicio WHERE codigo IN ('instalacion_nueva','servicio_adicional','soporte_falla');

INSERT INTO tipos_servicio_foto_requisito (tipo_servicio_id, codigo, etiqueta, criterio_aceptacion, orden_visualizacion)
SELECT id, 'deco_principal', 'Decodificador principal', 'Decodificador y TV encendidos, con señal visible', 2
FROM tipos_servicio WHERE codigo IN ('instalacion_nueva','servicio_adicional','soporte_falla');
-- Retiro no lleva fila aquí: sus fotos se generan dinámicamente, una por
-- cada equipo escaneado (tipos_servicio.fotos_dinamicas = 1).

INSERT INTO tipos_equipo (codigo, nombre) VALUES
('decodificador', 'Decodificador'),
('tarjeta',        'Tarjeta (Smart Card)'),
('lnb',            'LNB'),
('control_remoto', 'Control remoto');

INSERT INTO items_ferreteria (codigo, nombre, unidad_medida) VALUES
('grampa_7mm',    'Grampa 7 mm',        'unidad'),
('conector_rg6',  'Conector RG6',       'unidad'),
('amarra',        'Amarra plástica',    'unidad'),
('tarugo',        'Tarugo',             'unidad'),
('tirafondo',     'Tirafondo',          'unidad'),
('cable_rg6_m',   'Cable RG6',          'metro');

-- Kit estándar de ejemplo para instalación nueva — Edwin lo ajusta desde el
-- panel admin según el kit real que usa.
INSERT INTO kits_servicio_item (tipo_servicio_id, item_ferreteria_id, cantidad_estandar)
SELECT ts.id, i.id, v.cantidad
FROM tipos_servicio ts
JOIN (
    SELECT 'grampa_7mm' codigo, 20 cantidad UNION ALL
    SELECT 'conector_rg6', 2 UNION ALL
    SELECT 'amarra', 5 UNION ALL
    SELECT 'tarugo', 4 UNION ALL
    SELECT 'tirafondo', 4 UNION ALL
    SELECT 'cable_rg6_m', 15
) v ON 1=1
JOIN items_ferreteria i ON i.codigo = v.codigo
WHERE ts.codigo = 'instalacion_nueva';

-- Tarifa vigente de ejemplo para cada tipo de servicio — AJUSTAR a los
-- montos reales desde el panel admin antes de operar. Sin esta fila, ninguna
-- orden puede calcular monto_bruto (ver docs/modelo-datos-fase1.md).
INSERT INTO tarifas_servicio (tipo_servicio_id, monto, vigente_desde, vigente_hasta, creado_por)
SELECT ts.id, v.monto, '2026-01-01 00:00:00', NULL, u.id
FROM tipos_servicio ts
JOIN (
    SELECT 'instalacion_nueva' codigo, 30000 monto UNION ALL
    SELECT 'servicio_adicional', 15000 UNION ALL
    SELECT 'soporte_falla', 12000 UNION ALL
    SELECT 'retiro', 8000
) v ON v.codigo = ts.codigo
JOIN usuarios u ON u.usuario = 'edwin';

-- Plan y comisión de ejemplo — AJUSTAR a los planes y montos reales de TuVes.
INSERT INTO planes (codigo, nombre) VALUES ('plan_full', 'Plan Full');

INSERT INTO comisiones_plan (plan_id, monto, vigente_desde, vigente_hasta, creado_por)
SELECT p.id, 12000, '2026-01-01 00:00:00', NULL, u.id
FROM planes p JOIN usuarios u ON u.usuario = 'edwin'
WHERE p.codigo = 'plan_full';
