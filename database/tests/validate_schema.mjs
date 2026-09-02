// Motor mínimo de validación de esquema — NO es un motor SQL de propósito
// general. Lee el DDL real de schema_fase1.sql, extrae tablas/columnas/
// ENUM/NOT NULL/UNIQUE/FOREIGN KEY, y hace cumplir esas mismas reglas al
// insertar/actualizar filas. Sirve para probar que un caso de negocio real
// pasa por el esquema sin violar sus propias restricciones — no reemplaza
// probarlo en MySQL/MariaDB real antes de producción.
//
// Uso: node database/tests/validate_schema.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, '..', 'schema_fase1.sql');

// ---------------------------------------------------------------------------
// 1. Parser de DDL (suficiente para el estilo de este archivo, no genérico)
// ---------------------------------------------------------------------------

function splitTopLevel(str, sep = ',') {
  const parts = [];
  let depth = 0, current = '', inStr = false, strCh = null;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      current += c;
      if (c === strCh && str[i - 1] !== '\\') inStr = false;
      continue;
    }
    if (c === "'" || c === '"') { inStr = true; strCh = c; current += c; continue; }
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === sep && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += c;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function stripComments(sql) {
  // Elimina comentarios "-- ..." tanto de línea completa como al final de
  // una línea de código (p. ej. "campo NULL, -- nota"), respetando strings.
  let out = '';
  let inStr = false, strCh = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (inStr) {
      out += c;
      if (c === strCh && sql[i - 1] !== '\\') inStr = false;
      continue;
    }
    if (c === "'" || c === '"') { inStr = true; strCh = c; out += c; continue; }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    out += c;
  }
  return out;
}

function parseSchema(sql) {
  const clean = stripComments(sql);
  const statements = splitTopLevel(clean, ';');
  const tables = {};

  const getTable = (name) => (tables[name] ??= {
    columns: {}, primaryKey: [], uniqueKeys: [], foreignKeys: [], columnOrder: [],
  });

  for (const stmtRaw of statements) {
    const stmt = stmtRaw.trim();
    if (!stmt) continue;

    let m;
    if ((m = /^CREATE TABLE\s+(\w+)\s*\(([\s\S]+)\)\s*ENGINE/i.exec(stmt))) {
      const [, tableName, body] = m;
      const t = getTable(tableName);
      const parts = splitTopLevel(body, ',');
      for (const part of parts) {
        if (/^PRIMARY KEY/i.test(part)) {
          const cols = /\(([^)]+)\)/.exec(part)[1].split(',').map(s => s.trim());
          t.primaryKey = cols;
        } else if (/^UNIQUE KEY/i.test(part)) {
          const cols = /\(([^)]+)\)/.exec(part)[1].split(',').map(s => s.trim());
          t.uniqueKeys.push(cols);
        } else if (/^KEY\s/i.test(part)) {
          // índice plano, no restringe integridad — se ignora a propósito
        } else if (/^CONSTRAINT/i.test(part)) {
          const fk = /FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+(\w+)\s*\(([^)]+)\)/i.exec(part);
          if (fk) {
            t.foreignKeys.push({
              cols: fk[1].split(',').map(s => s.trim()),
              refTable: fk[2],
              refCols: fk[3].split(',').map(s => s.trim()),
            });
          }
        } else {
          // definición de columna
          const nameMatch = /^(\w+)\s+(.+)$/.exec(part);
          if (!nameMatch) continue;
          const [, colName, rest] = nameMatch;
          const notNull = /NOT NULL/i.test(rest);
          const autoIncrement = /AUTO_INCREMENT/i.test(rest);
          const inlinePk = /PRIMARY KEY/i.test(rest);
          const enumMatch = /ENUM\(([^)]+)\)/i.exec(rest);
          const enumValues = enumMatch
            ? splitTopLevel(enumMatch[1], ',').map(s => s.replace(/^'|'$/g, ''))
            : null;
          const defaultMatch = /DEFAULT\s+('[^']*'|\d+(\.\d+)?|CURRENT_TIMESTAMP)/i.exec(rest);
          t.columns[colName] = {
            notNull, autoIncrement, enumValues,
            hasDefault: !!defaultMatch,
            defaultValue: defaultMatch ? defaultMatch[1].replace(/^'|'$/g, '') : undefined,
          };
          t.columnOrder.push(colName);
          if (inlinePk) t.primaryKey = [colName];
        }
      }
    } else if ((m = /^ALTER TABLE\s+(\w+)\s+ADD CONSTRAINT\s+\w+\s+FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+(\w+)\s*\(([^)]+)\)/i.exec(stmt))) {
      const [, tableName, cols, refTable, refCols] = m;
      const t = getTable(tableName);
      t.foreignKeys.push({
        cols: cols.split(',').map(s => s.trim()),
        refTable,
        refCols: refCols.split(',').map(s => s.trim()),
      });
    }
    // INSERTs del archivo se ignoran aquí: se reproducen explícitamente más
    // abajo como parte del escenario, para que el rastro de datos sea legible.
  }
  return tables;
}

// ---------------------------------------------------------------------------
// 2. Motor de restricciones en memoria
// ---------------------------------------------------------------------------

class ConstraintError extends Error {}

function buildDb(schema) {
  const state = {};
  for (const name of Object.keys(schema)) state[name] = { rows: [], nextId: 1 };

  function checkRow(table, row, { excludeRowRef = null } = {}) {
    const t = schema[table];
    for (const col of t.columnOrder) {
      const def = t.columns[col];
      const val = row[col];
      if (val === undefined || val === null) {
        if (def.notNull && !def.autoIncrement) {
          throw new ConstraintError(`[${table}.${col}] viola NOT NULL (valor ausente)`);
        }
        continue;
      }
      if (def.enumValues && !def.enumValues.includes(val)) {
        throw new ConstraintError(`[${table}.${col}] "${val}" no está en ENUM(${def.enumValues.join(',')})`);
      }
    }
    for (const cols of [t.primaryKey, ...t.uniqueKeys]) {
      if (!cols || !cols.length) continue;
      const vals = cols.map(c => row[c]);
      if (vals.some(v => v === undefined || v === null)) continue; // NULL no colisiona (semántica SQL estándar)
      const dupe = state[table].rows.find(r =>
        r !== excludeRowRef && cols.every(c => r[c] === row[c])
      );
      if (dupe) throw new ConstraintError(`[${table}] duplicado en (${cols.join(',')}) = (${vals.join(',')})`);
    }
    for (const fk of t.foreignKeys) {
      const vals = fk.cols.map(c => row[c]);
      if (vals.every(v => v === undefined || v === null)) continue; // FK nullable, no aplica
      const refRows = state[fk.refTable].rows;
      const found = refRows.find(r => fk.refCols.every((rc, i) => r[rc] === vals[i]));
      if (!found) {
        throw new ConstraintError(
          `[${table}.${fk.cols.join(',')}] FK rota → ${fk.refTable}.${fk.refCols.join(',')} = (${vals.join(',')}) no existe`
        );
      }
    }
  }

  return {
    insert(table, data) {
      const t = schema[table];
      if (!t) throw new Error(`tabla desconocida: ${table}`);
      const row = { ...data };
      for (const col of t.columnOrder) {
        const def = t.columns[col];
        if (row[col] === undefined) {
          if (def.autoIncrement) row[col] = state[table].nextId;
          else if (def.hasDefault) {
            row[col] = def.defaultValue === 'CURRENT_TIMESTAMP' ? '(now)' : def.defaultValue;
          }
        }
      }
      checkRow(table, row);
      if (t.primaryKey.length === 1 && t.columns[t.primaryKey[0]]?.autoIncrement) {
        state[table].nextId = Math.max(state[table].nextId, row[t.primaryKey[0]] + 1);
      }
      state[table].rows.push(row);
      return row;
    },
    update(table, matchFn, patch) {
      const rows = state[table].rows.filter(matchFn);
      if (!rows.length) throw new Error(`update sin filas coincidentes en ${table}`);
      for (const row of rows) {
        const updated = { ...row, ...patch };
        checkRow(table, updated, { excludeRowRef: row });
        Object.assign(row, patch);
      }
      return rows;
    },
    find(table, matchFn) { return state[table].rows.filter(matchFn); },
    one(table, matchFn) {
      const rows = state[table].rows.filter(matchFn);
      if (rows.length !== 1) throw new Error(`se esperaba 1 fila en ${table}, hay ${rows.length}`);
      return rows[0];
    },
    dump(table) { return state[table].rows; },
  };
}

// ---------------------------------------------------------------------------
// 3. Escenario real: una instalación nueva de punta a punta
// ---------------------------------------------------------------------------

const sql = readFileSync(SCHEMA_PATH, 'utf-8');
const schema = parseSchema(sql);

const results = [];
function step(desc, fn) {
  try {
    fn();
    results.push({ desc, ok: true });
  } catch (e) {
    results.push({ desc, ok: false, error: e.message });
  }
}
function expectFail(desc, fn) {
  try {
    fn();
    results.push({ desc, ok: false, error: 'se esperaba que fallara y no falló' });
  } catch (e) {
    results.push({ desc, ok: true, note: `rechazado correctamente: ${e.message}` });
  }
}

const db = buildDb(schema);

// --- Semilla (réplica de lo que trae schema_fase1.sql) ---------------------

step('Seed: usuario Edwin (admin, 100%)', () => {
  db.insert('usuarios', {
    nombre: 'Edwin', usuario: 'edwin', password_hash: 'x', rol: 'admin', porcentaje_reparto: 100.00,
  });
});

step('Seed: tipos_servicio', () => {
  ['instalacion_nueva', 'servicio_adicional', 'soporte_falla', 'retiro'].forEach((codigo, i) => {
    db.insert('tipos_servicio', {
      codigo, nombre: codigo, requiere_series: 1,
      fotos_dinamicas: codigo === 'retiro' ? 1 : 0, orden_visualizacion: i + 1,
    });
  });
});

step('Seed: requisitos de foto (instalación nueva)', () => {
  const ts = db.one('tipos_servicio', r => r.codigo === 'instalacion_nueva');
  db.insert('tipos_servicio_foto_requisito', {
    tipo_servicio_id: ts.id, codigo: 'antena', etiqueta: 'Antena instalada',
    criterio_aceptacion: 'Antena visible, apuntada, sin obstrucciones', orden_visualizacion: 1,
  });
  db.insert('tipos_servicio_foto_requisito', {
    tipo_servicio_id: ts.id, codigo: 'deco_principal', etiqueta: 'Decodificador principal',
    criterio_aceptacion: 'Decodificador y TV encendidos, con señal visible', orden_visualizacion: 2,
  });
});

step('Seed: tipos_equipo', () => {
  ['decodificador', 'tarjeta', 'lnb', 'control_remoto'].forEach(codigo =>
    db.insert('tipos_equipo', { codigo, nombre: codigo }));
});

step('Seed: items_ferreteria', () => {
  [['grampa_7mm', 'unidad'], ['conector_rg6', 'unidad'], ['amarra', 'unidad'],
   ['tarugo', 'unidad'], ['tirafondo', 'unidad'], ['cable_rg6_m', 'metro']]
    .forEach(([codigo, um]) => db.insert('items_ferreteria', { codigo, nombre: codigo, unidad_medida: um }));
});

step('Seed: kit estándar de instalación nueva', () => {
  const ts = db.one('tipos_servicio', r => r.codigo === 'instalacion_nueva');
  const cantidades = { grampa_7mm: 20, conector_rg6: 2, amarra: 5, tarugo: 4, tirafondo: 4, cable_rg6_m: 15 };
  for (const [codigo, cantidad] of Object.entries(cantidades)) {
    const item = db.one('items_ferreteria', r => r.codigo === codigo);
    db.insert('kits_servicio_item', { tipo_servicio_id: ts.id, item_ferreteria_id: item.id, cantidad_estandar: cantidad });
  }
});

// --- HALLAZGO 1: sin esto, no se puede calcular monto_bruto -----------------
expectFail('Sin tarifa vigente seedeada, snapshot de precio falla al crear la orden', () => {
  const ts = db.one('tipos_servicio', r => r.codigo === 'instalacion_nueva');
  const tarifaVigente = db.find('tarifas_servicio', r => r.tipo_servicio_id === ts.id && r.vigente_hasta === null)[0];
  if (!tarifaVigente) throw new ConstraintError('no hay tarifa vigente para instalacion_nueva — el seed original no la incluye');
});

step('FIX aplicado: seed de tarifa vigente para los 4 tipos de servicio', () => {
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  const montos = { instalacion_nueva: 30000, servicio_adicional: 15000, soporte_falla: 12000, retiro: 8000 };
  for (const [codigo, monto] of Object.entries(montos)) {
    const ts = db.one('tipos_servicio', r => r.codigo === codigo);
    db.insert('tarifas_servicio', {
      tipo_servicio_id: ts.id, monto, vigente_desde: '2026-01-01', vigente_hasta: null, creado_por: edwin.id,
    });
  }
});

step('Seed: plan y comisión de venta (adelantado desde Fase 2)', () => {
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  const plan = db.insert('planes', { codigo: 'plan_full', nombre: 'Plan Full' });
  db.insert('comisiones_plan', {
    plan_id: plan.id, monto: 12000, vigente_desde: '2026-01-01', vigente_hasta: null, creado_por: edwin.id,
  });
});

// --- Bodega: equipos ya asignados a la maleta del técnico -------------------

step('Bodega: 3 equipos entregados a la maleta de Edwin', () => {
  const deco = db.one('tipos_equipo', r => r.codigo === 'decodificador');
  const tarjeta = db.one('tipos_equipo', r => r.codigo === 'tarjeta');
  const lnb = db.one('tipos_equipo', r => r.codigo === 'lnb');
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');

  const e1 = db.insert('equipos', { tipo_equipo_id: deco.id, numero_serie: '8934221100561', estado: 'maleta', usuario_actual_id: edwin.id });
  db.insert('movimientos_equipo', { equipo_id: e1.id, tipo_movimiento: 'asignacion_maleta', usuario_destino_id: edwin.id });

  const e2 = db.insert('equipos', { tipo_equipo_id: tarjeta.id, numero_serie: 'SC-5512-0088', estado: 'maleta', usuario_actual_id: edwin.id });
  db.insert('movimientos_equipo', { equipo_id: e2.id, tipo_movimiento: 'asignacion_maleta', usuario_destino_id: edwin.id });

  // Este LNB llegó por traspaso de otro técnico y quedó con la serie tecleada
  // a mano en el papel de bodega — existe en el sistema, pero su ingreso
  // original fue manual. Igual es un equipo válido y asignado.
  const e3 = db.insert('equipos', { tipo_equipo_id: lnb.id, numero_serie: 'LNB-77201', estado: 'maleta', usuario_actual_id: edwin.id });
  db.insert('movimientos_equipo', { equipo_id: e3.id, tipo_movimiento: 'asignacion_maleta', usuario_destino_id: edwin.id });
});

step('Bodega: stock inicial de ferretería entregado a Edwin (cubre el kit completo)', () => {
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  const cantidades = { grampa_7mm: 100, conector_rg6: 20, amarra: 50, tarugo: 40, tirafondo: 40, cable_rg6_m: 100 };
  for (const [codigo, cantidad] of Object.entries(cantidades)) {
    const item = db.one('items_ferreteria', r => r.codigo === codigo);
    db.insert('movimientos_ferreteria', { item_ferreteria_id: item.id, usuario_id: edwin.id, tipo_movimiento: 'entrega_bodega', cantidad });
    db.insert('stock_ferreteria_usuario', { usuario_id: edwin.id, item_ferreteria_id: item.id, cantidad_actual: cantidad });
  }
});

// --- El wizard, paso a paso -------------------------------------------------

let orden;
step('Paso 1: técnico crea el borrador — folio 482917, instalación nueva', () => {
  const ts = db.one('tipos_servicio', r => r.codigo === 'instalacion_nueva');
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  orden = db.insert('ordenes', {
    uuid_dispositivo: 'a1b2c3d4-0001-4000-8000-000000000001',
    folio: '482917',
    tipo_servicio_id: ts.id,
    tecnico_id: edwin.id,
    estado: 'borrador', // ver HALLAZGO 2 más abajo — este valor es el punto en discusión
    fecha_trabajo_dispositivo: '2026-08-30 14:32:00',
  });
});

// --- HALLAZGO 2: fotos empiezan a subir en el paso 3, pero la orden recién
// se "envía" en el paso 5. orden_fotos.orden_id es NOT NULL → la orden debe
// existir server-side ANTES del envío final para que esto funcione.
step('Paso 3 (antes del envío final): sube la foto de la antena — requiere que la orden YA exista server-side', () => {
  db.insert('orden_fotos', {
    orden_id: orden.id, tipo: 'antena', ruta_archivo: '/fotos/2026/08/482917_antena.jpg',
    tamano_bytes: 287000, latitud: -33.4489, longitud: -70.6693,
    tomada_en: '2026-08-30 14:40:00', subida_en: '2026-08-30 14:40:12',
  });
});
results.at(-1).note = 'Confirma que estado=\'borrador\' debe aceptarse server-side (no solo en el celular) — ver hallazgo en el informe.';

step('Paso 2: escaneo de materiales — decodificador y tarjeta por cámara, LNB a mano', () => {
  const deco = db.one('equipos', r => r.numero_serie === '8934221100561');
  const tarjeta = db.one('equipos', r => r.numero_serie === 'SC-5512-0088');
  const lnb = db.one('equipos', r => r.numero_serie === 'LNB-77201');
  db.insert('orden_materiales', { orden_id: orden.id, equipo_id: deco.id, accion: 'instalado', ingresado_manual: 0 });
  db.insert('orden_materiales', { orden_id: orden.id, equipo_id: tarjeta.id, accion: 'instalado', ingresado_manual: 0 });
  db.insert('orden_materiales', { orden_id: orden.id, equipo_id: lnb.id, accion: 'instalado', ingresado_manual: 1 });
});

expectFail('Control de integridad: escanear una serie que no existe en ningún lado del sistema', () => {
  db.insert('orden_materiales', { orden_id: orden.id, equipo_id: 99999, accion: 'instalado', ingresado_manual: 1 });
});

step('Paso 3: sube la foto del decodificador principal', () => {
  db.insert('orden_fotos', {
    orden_id: orden.id, tipo: 'deco_principal', ruta_archivo: '/fotos/2026/08/482917_deco.jpg',
    tamano_bytes: 264000, latitud: -33.4489, longitud: -70.6693,
    tomada_en: '2026-08-30 14:44:00', subida_en: '2026-08-30 14:44:09',
  });
});

step('Paso 4: consumo de ferretería (kit estándar, sin ajustes) + cierre técnico', () => {
  const ts = db.one('tipos_servicio', r => r.codigo === 'instalacion_nueva');
  const kit = db.find('kits_servicio_item', r => r.tipo_servicio_id === ts.id);
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  for (const k of kit) {
    db.insert('orden_ferreteria', {
      orden_id: orden.id, item_ferreteria_id: k.item_ferreteria_id,
      cantidad_estandar: k.cantidad_estandar, cantidad_final: k.cantidad_estandar, ajustado_manualmente: 0,
    });
    db.insert('movimientos_ferreteria', {
      item_ferreteria_id: k.item_ferreteria_id, usuario_id: edwin.id,
      tipo_movimiento: 'consumo_orden', cantidad: -k.cantidad_estandar, orden_id: orden.id,
    });
    const stockRow = db.one('stock_ferreteria_usuario', r => r.usuario_id === edwin.id && r.item_ferreteria_id === k.item_ferreteria_id);
    db.update('stock_ferreteria_usuario', r => r === stockRow, { cantidad_actual: stockRow.cantidad_actual - k.cantidad_estandar });
  }
  db.update('ordenes', r => r === orden, {
    senal_porcentaje: 78, calidad_porcentaje: 91, satelite: '55.5W', metros_cable: 22,
  });
});

step('Paso 5: enviar — snapshot de tarifa/%, consumo físico se confirma, equipos pasan a instalado', () => {
  const ts = db.one('tipos_servicio', r => r.codigo === 'instalacion_nueva');
  const tarifa = db.one('tarifas_servicio', r => r.tipo_servicio_id === ts.id && r.vigente_hasta === null);
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  const monto_bruto = tarifa.monto;
  const monto_tecnico = monto_bruto * (edwin.porcentaje_reparto / 100);

  db.update('ordenes', r => r === orden, {
    estado: 'enviada', monto_bruto, porcentaje_aplicado: edwin.porcentaje_reparto, monto_tecnico,
  });

  // Regla clarificada: el consumo físico (equipos + ferretería) se confirma
  // al ENVIAR, no al aprobar — el técnico ya usó las grampas y dejó el
  // equipo instalado, sin importar lo que decida la auditoría después.
  for (const om of db.find('orden_materiales', r => r.orden_id === orden.id)) {
    db.update('equipos', r => r.id === om.equipo_id, { estado: 'instalado', usuario_actual_id: null, orden_instalacion_id: orden.id });
    db.insert('movimientos_equipo', { equipo_id: om.equipo_id, tipo_movimiento: 'instalacion', usuario_origen_id: edwin.id, orden_id: orden.id });
  }
});

step('Auditoría: Edwin aprueba la orden (autoauditoría en Fase 1, single-user)', () => {
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  db.update('ordenes', r => r === orden, {
    estado: 'aprobada', auditor_id: edwin.id, fecha_auditoria: '2026-08-30 20:00:00',
  });
});

step('Verificación final: estado consistente en las 5 tablas involucradas', () => {
  const final = db.one('ordenes', r => r.id === orden.id);
  if (final.estado !== 'aprobada') throw new Error('la orden no quedó aprobada');
  if (final.monto_tecnico !== 30000) throw new Error(`monto_tecnico esperado 30000, fue ${final.monto_tecnico}`);
  const equiposInstalados = db.find('equipos', r => r.orden_instalacion_id === orden.id);
  if (equiposInstalados.length !== 3) throw new Error('deberían quedar 3 equipos instalados');
  const fotos = db.find('orden_fotos', r => r.orden_id === orden.id);
  if (fotos.length !== 2) throw new Error('deberían existir 2 fotos');
  const stockGrampa = db.one('stock_ferreteria_usuario', r => {
    const item = db.one('items_ferreteria', i => i.id === r.item_ferreteria_id);
    return item.codigo === 'grampa_7mm';
  });
  if (stockGrampa.cantidad_actual !== 80) throw new Error(`stock grampas esperado 80, fue ${stockGrampa.cantidad_actual}`);
});

// --- Caso de conflicto: segundo técnico con el mismo folio ------------------

step('Escenario de conflicto: se registra un folio duplicado sin bloquear la orden', () => {
  const ts = db.one('tipos_servicio', r => r.codigo === 'soporte_falla');
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  const ordenDup = db.insert('ordenes', {
    uuid_dispositivo: 'a1b2c3d4-0002-4000-8000-000000000002',
    folio: '482917', // mismo folio, a propósito
    tipo_servicio_id: ts.id, tecnico_id: edwin.id,
    estado: 'conflicto', fecha_trabajo_dispositivo: '2026-08-30 15:10:00',
  });
  db.insert('conflictos_sincronizacion', {
    orden_id: ordenDup.id, tipo: 'folio_duplicado', orden_conflicto_id: orden.id,
    descripcion: 'Folio 482917 ya existe en la orden #' + orden.id,
  });
});

expectFail('Confirmación negativa: uuid_dispositivo sí es único (no debe permitir duplicarlo)', () => {
  db.insert('ordenes', {
    uuid_dispositivo: 'a1b2c3d4-0001-4000-8000-000000000001', // repetido a propósito
    folio: '999999', tipo_servicio_id: 1, tecnico_id: 1,
    estado: 'enviada', fecha_trabajo_dispositivo: '2026-08-30 16:00:00',
  });
});

// ---------------------------------------------------------------------------
// CASO 2: VENTA + INSTALACIÓN DERIVADA
// ---------------------------------------------------------------------------
// Edwin vende un Plan Full a un cliente nuevo, y dos días después él mismo
// hace la instalación (respuestas 11/21/23: técnico único vende e instala,
// hasta 3 días entre ambos hitos). La comisión se confirma recién cuando la
// instalación llega a 'enviada' (regla 20), no cuando se registra la venta.

let venta, ordenVenta;

step('Venta: Edwin registra la venta de un Plan Full', () => {
  const plan = db.one('planes', r => r.codigo === 'plan_full');
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  venta = db.insert('ventas', {
    numero_venta_tuves: 'V-882134',
    cliente_nombre: 'Ana Rojas',
    comuna: 'Puente Alto',
    plan_id: plan.id,
    vendedor_id: edwin.id,
    estado: 'registrada',
  });
});

expectFail('Control de integridad: no se puede vender el mismo número de venta TuVes dos veces', () => {
  const plan = db.one('planes', r => r.codigo === 'plan_full');
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  db.insert('ventas', {
    numero_venta_tuves: 'V-882134', cliente_nombre: 'Otro cliente', comuna: 'Maipú',
    plan_id: plan.id, vendedor_id: edwin.id, estado: 'registrada',
  });
});

step('Paso 1 (2 días después): crea la orden de instalación y la enlaza a la venta', () => {
  const ts = db.one('tipos_servicio', r => r.codigo === 'instalacion_nueva');
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  ordenVenta = db.insert('ordenes', {
    uuid_dispositivo: 'a1b2c3d4-0003-4000-8000-000000000003',
    folio: '482930',
    tipo_servicio_id: ts.id, tecnico_id: edwin.id, venta_id: venta.id,
    estado: 'borrador', fecha_trabajo_dispositivo: '2026-09-01 10:15:00',
  });
});

expectFail('Control de integridad: no se puede enlazar una orden a una venta inexistente', () => {
  db.insert('ordenes', {
    uuid_dispositivo: 'a1b2c3d4-0099-4000-8000-000000000099',
    folio: '999998', tipo_servicio_id: 1, tecnico_id: 1, venta_id: 99999,
    estado: 'borrador', fecha_trabajo_dispositivo: '2026-09-01 10:16:00',
  });
});

step('Paso 5: al enviar la instalación, se confirma la venta y su comisión (snapshot)', () => {
  const ts = db.one('tipos_servicio', r => r.codigo === 'instalacion_nueva');
  const tarifa = db.one('tarifas_servicio', r => r.tipo_servicio_id === ts.id && r.vigente_hasta === null);
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  db.update('ordenes', r => r === ordenVenta, {
    estado: 'enviada', monto_bruto: tarifa.monto,
    porcentaje_aplicado: edwin.porcentaje_reparto,
    monto_tecnico: tarifa.monto * (edwin.porcentaje_reparto / 100),
  });

  // La venta se confirma en el mismo momento — es el hito que define regla 20.
  const comision = db.one('comisiones_plan', r => r.plan_id === venta.plan_id && r.vigente_hasta === null);
  db.update('ventas', r => r === venta, {
    estado: 'instalada', monto_comision: comision.monto,
    porcentaje_aplicado: edwin.porcentaje_reparto,
    monto_vendedor: comision.monto * (edwin.porcentaje_reparto / 100),
  });
});

step('Verificación: la venta quedó instalada con su comisión calculada', () => {
  const v = db.one('ventas', r => r.id === venta.id);
  if (v.estado !== 'instalada') throw new Error('la venta debería quedar instalada');
  if (v.monto_vendedor !== 12000) throw new Error(`monto_vendedor esperado 12000, fue ${v.monto_vendedor}`);
  const ligada = db.one('ordenes', r => r.venta_id === venta.id);
  if (ligada.id !== ordenVenta.id) throw new Error('la orden ligada a la venta no es la esperada');
});

step('Venta sin instalar: queda registrada y visible, sin comisión — no es un error', () => {
  const plan = db.one('planes', r => r.codigo === 'plan_full');
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  const ventaPendiente = db.insert('ventas', {
    numero_venta_tuves: 'V-882201', cliente_nombre: 'Jorge Lira', comuna: 'La Florida',
    plan_id: plan.id, vendedor_id: edwin.id, estado: 'registrada',
  });
  if (ventaPendiente.monto_comision !== undefined && ventaPendiente.monto_comision !== null) {
    throw new Error('no debería tener comisión calculada todavía');
  }
});

// ---------------------------------------------------------------------------
// CASO 3: RETIRO PARCIAL
// ---------------------------------------------------------------------------
// El cliente de la primera instalación da de baja el servicio. Edwin retira
// el decodificador y el LNB, pero la tarjeta queda inutilizada y no se
// recupera (motivo habitual: el cliente la perdió). Fotos dinámicas: una
// por cada equipo efectivamente escaneado como retirado — en este caso 2,
// no 3, porque la tarjeta no se retira.

let ordenRetiro;
const decoInstalado = () => db.one('equipos', r => r.numero_serie === '8934221100561');
const lnbInstalado = () => db.one('equipos', r => r.numero_serie === 'LNB-77201');

step('Paso 1: crea la orden de retiro — folio 483010', () => {
  const ts = db.one('tipos_servicio', r => r.codigo === 'retiro');
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  ordenRetiro = db.insert('ordenes', {
    uuid_dispositivo: 'a1b2c3d4-0004-4000-8000-000000000004',
    folio: '483010', tipo_servicio_id: ts.id, tecnico_id: edwin.id,
    estado: 'borrador', fecha_trabajo_dispositivo: '2026-09-15 11:00:00',
  });
});

step('Paso 2: escanea decodificador y LNB como retirados (no la tarjeta)', () => {
  db.insert('orden_materiales', { orden_id: ordenRetiro.id, equipo_id: decoInstalado().id, accion: 'retirado', ingresado_manual: 0 });
  db.insert('orden_materiales', { orden_id: ordenRetiro.id, equipo_id: lnbInstalado().id, accion: 'retirado', ingresado_manual: 0 });
});

step('Paso 3: fotos dinámicas — una por cada equipo escaneado (2, no un número fijo)', () => {
  db.insert('orden_fotos', {
    orden_id: ordenRetiro.id, tipo: 'equipo_retirado', equipo_id: decoInstalado().id,
    ruta_archivo: '/fotos/2026/09/483010_deco.jpg', tamano_bytes: 210000,
    tomada_en: '2026-09-15 11:05:00', subida_en: '2026-09-15 11:05:08',
  });
  db.insert('orden_fotos', {
    orden_id: ordenRetiro.id, tipo: 'equipo_retirado', equipo_id: lnbInstalado().id,
    ruta_archivo: '/fotos/2026/09/483010_lnb.jpg', tamano_bytes: 198000,
    tomada_en: '2026-09-15 11:07:00', subida_en: '2026-09-15 11:07:06',
  });
});

step('Paso 4: sin kit de ferretería para retiro — el paso se salta solo (0 filas en el kit)', () => {
  const ts = db.one('tipos_servicio', r => r.codigo === 'retiro');
  const kit = db.find('kits_servicio_item', r => r.tipo_servicio_id === ts.id);
  if (kit.length !== 0) throw new Error('retiro no debería tener kit estándar seedeado');
});

step('Paso 5: enviar — equipos pasan a "retirado", no a bodega todavía', () => {
  const ts = db.one('tipos_servicio', r => r.codigo === 'retiro');
  const tarifa = db.one('tarifas_servicio', r => r.tipo_servicio_id === ts.id && r.vigente_hasta === null);
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  db.update('ordenes', r => r === ordenRetiro, {
    estado: 'enviada', monto_bruto: tarifa.monto,
    porcentaje_aplicado: edwin.porcentaje_reparto, monto_tecnico: tarifa.monto,
  });
  for (const om of db.find('orden_materiales', r => r.orden_id === ordenRetiro.id)) {
    db.update('equipos', r => r.id === om.equipo_id, { estado: 'retirado', orden_instalacion_id: null });
    db.insert('movimientos_equipo', { equipo_id: om.equipo_id, tipo_movimiento: 'retiro', usuario_destino_id: edwin.id, orden_id: ordenRetiro.id });
  }
});

step('Auditoría: se aprueba el retiro', () => {
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  db.update('ordenes', r => r === ordenRetiro, { estado: 'aprobada', auditor_id: edwin.id, fecha_auditoria: '2026-09-15 20:00:00' });
});

step('Días después: el equipo vuelve físicamente a bodega (evento de bodega, no de la orden)', () => {
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  for (const equipo of [decoInstalado(), lnbInstalado()]) {
    db.update('equipos', r => r.id === equipo.id, { estado: 'bodega', usuario_actual_id: null });
    db.insert('movimientos_equipo', { equipo_id: equipo.id, tipo_movimiento: 'ingreso_bodega', usuario_origen_id: edwin.id });
  }
});

step('Verificación: retiro parcial correcto — deco y LNB en bodega, tarjeta sigue instalada', () => {
  if (decoInstalado().estado !== 'bodega') throw new Error('el decodificador debería estar en bodega');
  if (lnbInstalado().estado !== 'bodega') throw new Error('el LNB debería estar en bodega');
  const tarjeta = db.one('equipos', r => r.numero_serie === 'SC-5512-0088');
  if (tarjeta.estado !== 'instalado') throw new Error('la tarjeta no debió tocarse — sigue instalada donde estaba');
  const fotosRetiro = db.find('orden_fotos', r => r.orden_id === ordenRetiro.id);
  if (fotosRetiro.length !== 2) throw new Error('deberían existir exactamente 2 fotos dinámicas, una por equipo retirado');
});

// --- Nota: la DB no impide retirar un equipo que ya no está "instalado" -----
step('Nota: el motor NO valida que el equipo esté "instalado" antes de marcarlo "retirado" (esperado, ver informe)', () => {
  // El decodificador de este mismo caso YA está en 'bodega' tras el paso anterior.
  // Nada en el esquema impide crear otra orden de retiro sobre él otra vez.
  const equipo = decoInstalado();
  db.update('equipos', r => r.id === equipo.id, { estado: 'retirado' }); // no lanza error
  db.update('equipos', r => r.id === equipo.id, { estado: 'bodega' }); // se revierte para no ensuciar el caso
});

// --- Nota sobre stock negativo (no es una prueba de fallo, es documentación) --

step('Nota: el motor NO impide que el stock de ferretería quede negativo (esperado, ver informe)', () => {
  const edwin = db.one('usuarios', r => r.usuario === 'edwin');
  const item = db.one('items_ferreteria', r => r.codigo === 'amarra');
  const stockRow = db.one('stock_ferreteria_usuario', r => r.usuario_id === edwin.id && r.item_ferreteria_id === item.id);
  db.update('stock_ferreteria_usuario', r => r === stockRow, { cantidad_actual: -3 }); // no lanza error
  if (db.one('stock_ferreteria_usuario', r => r === stockRow).cantidad_actual !== -3) {
    throw new Error('se esperaba poder dejarlo en -3 (sin CHECK en el esquema)');
  }
});

// ---------------------------------------------------------------------------
// 4. Reporte
// ---------------------------------------------------------------------------

console.log('\n=== VALIDACIÓN DEL ESQUEMA · INSTALACIÓN + VENTA + RETIRO ===\n');
let fails = 0;
for (const r of results) {
  const mark = r.ok ? '✅' : '❌';
  console.log(`${mark} ${r.desc}`);
  if (r.note) console.log(`   ↳ ${r.note}`);
  if (!r.ok) { console.log(`   ↳ ERROR: ${r.error}`); fails++; }
}
console.log(`\n${results.length - fails}/${results.length} pasos correctos.\n`);
process.exit(fails ? 1 : 0);
