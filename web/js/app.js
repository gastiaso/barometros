/* Barómetro a barómetro: explorador de series de los barómetros del CIS.
   Los datos se sirven por columnas (web/datos/col/*.bin, comprimidas con deflate) y se agregan en el navegador. */
'use strict';

const BASE = 'datos/';
const NR = new Set(['NS', 'NC', 'NR', 'NP']);
const MIN_N = 50;
const MAX_SERIES = 12;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt1 = v => v == null || !isFinite(v) ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt2 = v => v == null || !isFinite(v) ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = v => v.toLocaleString('es-ES');
const mesLargo = m => { const [a, b] = m.split('-'); return `${MESES[+b - 1]} ${a}`; };
const mesCorto = m => { const [a, b] = m.split('-'); return `${MESES_C[+b - 1]} ${a}`; };
const fecha = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1));

/* ================= catálogo ================= */
const PREG = [
  { g: 'Voto', id: 'intencion_voto_r', t: 'Intención directa de voto' },
  { g: 'Voto', id: 'voto_simpatia', t: 'Voto + simpatía' },
  { g: 'Voto', id: 'simpatia', t: 'Partido por el que siente más simpatía' },
  { g: 'Voto', id: 'cercania', t: 'Partido más cercano a sus ideas' },
  { g: 'Voto', id: 'intencion_alternativa', t: 'Intención de voto alternativa' },
  { g: 'Voto', id: 'intencion_voto', t: 'Intención directa: respuesta literal, sin agrupar' },
  { g: 'Voto', id: 'recuerdo_voto', t: 'Recuerdo de voto en las últimas generales' },
  { g: 'Voto', id: 'pref_presidente', t: 'Preferencia como presidente del Gobierno' },
  { g: 'Líderes', id: 'lideres', t: 'Valoración de líderes', tipo: 'medias' },
  { g: 'Líderes', id: 'ministros', t: 'Valoración de ministros', tipo: 'medias' },
  { g: 'Problemas', id: 'prob_esp', t: 'Principales problemas de España', tipo: 'multi', cols: ['prob_esp_1', 'prob_esp_2', 'prob_esp_3'] },
  { g: 'Problemas', id: 'prob_esp_1', t: 'Primer problema de España' },
  { g: 'Problemas', id: 'prob_per', t: 'Problemas que más le afectan personalmente', tipo: 'multi', cols: ['prob_per_1', 'prob_per_2', 'prob_per_3'] },
  { g: 'Problemas', id: 'prob_per_1', t: 'Problema que más le afecta personalmente' },
  { g: 'Economía', id: 'eco_esp', t: 'Situación económica general de España' },
  { g: 'Economía', id: 'eco_per', t: 'Situación económica personal' },
  { g: 'Ideología', id: 'ideologia', t: 'Autoubicación ideológica (media)', tipo: 'media', cols: ['ideologia'] },
  { g: 'Ideología', id: 'ideologia_g', t: 'Autoubicación ideológica (cinco grupos)' },
  { g: 'Ideología', id: 'ideologia_cat', t: 'Autoubicación ideológica (escala 1 a 10)' },
  { g: 'Perfil', id: 'clase_subjetiva', t: 'Clase social subjetiva' },
  { g: 'Perfil', id: 'clase_social', t: 'Clase social subjetiva (detallada)' },
  { g: 'Perfil', id: 'religiosidad', t: 'Religiosidad' },
  { g: 'Perfil', id: 'practica_religiosa', t: 'Asistencia a oficios religiosos' },
  { g: 'Perfil', id: 'sitlab', t: 'Situación laboral' },
  { g: 'Perfil', id: 'estudios', t: 'Nivel de estudios' },
  { g: 'Perfil', id: 'participacion_g', t: 'Participación en las últimas generales' },
  { g: 'Perfil', id: 'estado_civil', t: 'Estado civil' },
  { g: 'Perfil', id: 'ocupacion_g', t: 'Grupo ocupacional' },
  { g: 'Perfil', id: 'ocupacion_r', t: 'Ocupación (grandes grupos de la CNO-11)' },
  { g: 'Perfil', id: 'situacion_profesional', t: 'Situación profesional' },
  { g: 'Perfil', id: 'ingresos_hogar', t: 'Ingresos netos del hogar' },
  { g: 'Perfil', id: 'nacionalidad', t: 'Nacionalidad' },
  { g: 'Perfil', id: 'lugar_nacimiento', t: 'Lugar de nacimiento' },
];
const CRUCES = [
  ['sexo', 'Sexo'], ['edad_g', 'Edad'], ['ccaa', 'Comunidad autónoma'], ['tamuni', 'Tamaño de municipio'],
  ['estudios', 'Nivel de estudios'], ['sitlab', 'Situación laboral'], ['clase_subjetiva', 'Clase social subjetiva'],
  ['religiosidad', 'Religiosidad'], ['ideologia_g', 'Ideología'], ['recuerdo_voto', 'Recuerdo de voto'],
  ['intencion_voto_r', 'Intención directa de voto'], ['voto_simpatia', 'Voto + simpatía'], ['estado_civil', 'Estado civil'],
  ['practica_religiosa', 'Asistencia a oficios religiosos'], ['ocupacion_g', 'Grupo ocupacional'],
  ['situacion_profesional', 'Situación profesional'], ['ingresos_hogar', 'Ingresos del hogar'],
  ['nacionalidad', 'Nacionalidad'], ['lugar_nacimiento', 'Lugar de nacimiento'],
];
const FILTROS = [...CRUCES, ['provincia', 'Provincia']];
// la respuesta literal ya no se ofrece como cruce, pero los enlaces guardados que la usan siguen funcionando
const CRUCE_DE = Object.fromEntries([...FILTROS, ['intencion_voto', 'Intención directa: respuesta literal']]);

const COLOR_PARTIDO = {
  PSOE: '#d8312b', PP: '#2a6fbe', VOX: '#5a9e2c', SUMAR: '#d43f7a', PODEMOS: '#6c3483', UNIDAS_PODEMOS: '#8a4fa6',
  PODEMOS_IU_AV: '#8a4fa6', CS: '#ea7a2a', MAS_PAIS: '#0f9d8a', ERC: '#e2a224', JUNTS: '#25b7c4', PNV: '#2e7d3c',
  EH_BILDU: '#9aa61c', BNG: '#79b2dc', CC: '#e6be00', SALF: '#7a5236', IU: '#b03a3a', COMPROMIS: '#f08c2e',
  NO_VOTARIA: '#55585e', NO_VOTO: '#55585e', NO_VOTA_NINGUNO: '#55585e', BLANCO: '#b9b6b0', NULO: '#9d9a94', NINGUNO: '#958f84', OTRO: '#aeaba5',
};
const PARTIDO_LIDER = {
  lider_pedro_sanchez: 'PSOE', lider_alberto_nunez_feijoo: 'PP', lider_pablo_casado: 'PP', lider_santiago_abascal: 'VOX',
  lider_yolanda_diaz: 'SUMAR', lider_pablo_iglesias: 'PODEMOS', lider_ione_belarra: 'PODEMOS', lider_ines_arrimadas: 'CS',
  lider_inigo_errejon: 'MAS_PAIS',
};
const PARTIDO_CANDIDATO = {
  'Pedro Sánchez': 'PSOE', 'Alberto Núñez Feijóo': 'PP', 'Pablo Casado': 'PP', 'Santiago Abascal': 'VOX', 'Yolanda Díaz': 'SUMAR',
  'Pablo Iglesias': 'PODEMOS', 'Ione Belarra': 'PODEMOS', 'Irene Montero': 'PODEMOS', 'Inés Arrimadas': 'CS', 'Íñigo Errejón': 'MAS_PAIS',
  'Isabel Díaz Ayuso': 'PP', 'Alberto Garzón': 'IU', 'Gabriel Rufián': 'ERC', 'Juan Manuel Moreno Bonilla': 'PP', 'Emiliano García-Page': 'PSOE',
  'Alvise Pérez': 'SALF',
};
const DEFECTO = [
  { preg: 'intencion_voto_r' },
  { preg: 'voto_simpatia' },
  { tipo: 'barras', preg: 'intencion_voto_r', cruce: 'edad_g', ancho: true, cats: ['PSOE', 'PP', 'VOX', 'SUMAR', 'PODEMOS', 'SALF', 'NO_VOTARIA', 'NS'] },
  { tipo: 'transferencias', preg: 'intencion_voto_r', acum: 3, ancho: true },
  { preg: 'lideres' },
  { preg: 'pref_presidente', catsEtq: ['Pedro Sánchez', 'Alberto Núñez Feijóo', 'Santiago Abascal', 'Yolanda Díaz', 'Gabriel Rufián', 'Irene Montero'] },
  { tipo: 'dispersion', grupo: 'voto_simpatia', x: { preg: 'ideologia' }, yEtq: ['prob_esp', 'La vivienda'], acum: 3 },
  { tipo: 'mapa', indEtq: ['prob_esp', 'La vivienda'], acum: 6 },
  { tipo: 'calor', preg: 'prob_esp', ancho: true },
  { preg: 'prob_per' },
  { tipo: 'comparar', preg: 'intencion_voto_r' },
  { preg: 'intencion_voto_r', recuerdo: true },
  { preg: 'eco_esp' },
];
// En el móvil, menos paneles y sin los que necesitan todo el ancho (transferencias, dispersión, mapa, calor)
const DEFECTO_MOVIL = [
  { preg: 'intencion_voto_r' },
  { preg: 'voto_simpatia' },
  { tipo: 'barras', preg: 'intencion_voto_r', cruce: 'edad_g', cats: ['PSOE', 'PP', 'VOX', 'SUMAR', 'PODEMOS', 'SALF', 'NO_VOTARIA', 'NS'] },
  { preg: 'lideres' },
  { preg: 'pref_presidente', catsEtq: ['Pedro Sánchez', 'Alberto Núñez Feijóo', 'Santiago Abascal', 'Yolanda Díaz', 'Gabriel Rufián', 'Irene Montero'] },
  { preg: 'prob_esp' },
  { preg: 'eco_esp' },
];
/* Enlaces con nombre (#vivienda, #lideres…): una selección de paneles cada uno, en la misma notación que DEFECTO */
const PRESETS = {
  voto: [{ preg: 'intencion_voto_r' }, { preg: 'voto_simpatia' }, { tipo: 'comparar', preg: 'intencion_voto_r' }],
  edad: [{ tipo: 'barras', preg: 'intencion_voto_r', cruce: 'edad_g', ancho: true, cats: ['PSOE', 'PP', 'VOX', 'SUMAR', 'PODEMOS', 'SALF', 'NO_VOTARIA', 'NS'] }, { preg: 'intencion_voto_r', cruce: 'edad_g', cat1: 'VOX' }, { preg: 'intencion_voto_r', cruce: 'edad_g', cat1: 'PSOE' }],
  transferencias: [{ tipo: 'transferencias', preg: 'intencion_voto_r', acum: 3, ancho: true }],
  lideres: [{ preg: 'lideres' }, { preg: 'pref_presidente', catsEtq: ['Pedro Sánchez', 'Alberto Núñez Feijóo', 'Santiago Abascal', 'Yolanda Díaz', 'Gabriel Rufián', 'Irene Montero'] }],
  problemas: [{ preg: 'prob_esp' }, { preg: 'prob_per' }, { tipo: 'calor', preg: 'prob_esp', ancho: true }],
  vivienda: [{ preg: 'prob_esp', catsEtq: ['La vivienda'] }, { preg: 'prob_per', catsEtq: ['La vivienda'] }, { preg: 'prob_esp', cruce: 'edad_g', cat1Etq: 'La vivienda' }, { tipo: 'mapa', indEtq: ['prob_esp', 'La vivienda'], acum: 6 }],
  economia: [{ preg: 'eco_esp' }, { preg: 'eco_per' }],
  ideologia: [{ preg: 'ideologia' }, { tipo: 'dispersion', grupo: 'voto_simpatia', x: { preg: 'ideologia' }, yEtq: ['prob_esp', 'La vivienda'], acum: 3 }],
  recuerdo: [{ preg: 'intencion_voto_r', recuerdo: true }, { preg: 'recuerdo_voto' }],
  puntos: [{ tipo: 'puntos', ancho: true }],
};
const esMovil = () => matchMedia('(max-width: 640px)').matches;
const CLAVE = 'bet-paneles-v4';
const NOTA_RECUERDO = 'Reponderado por recuerdo de voto: los pesos del CIS se ajustan para que quienes podían votar reproduzcan la participación de las últimas generales, y quienes recuerdan su voto, el resultado (2019 hasta septiembre de 2023; 2023 desde octubre). Es una estimación propia y no coincide con las tablas del CIS. El margen de error usa el efecto de diseño de los nuevos pesos, mayor que el del CIS.';
const DEFECTO_VEDA = [{ preg: 'prob_esp' }, { preg: 'eco_esp' }, { preg: 'ideologia' }, { preg: 'prob_per' }];

/* ================= datos ================= */
let META, EST = [], ESTI = {}, LAB = {}, LIDERES = [], MINISTROS = [];
const COLS = {}, PEND = {};

/* Descarga con un reintento si falla la red o el servidor; los errores, en español */
async function traer(url, opts, que) {
  let error;
  for (let i = 0; i < 2; i++) {
    if (i) await new Promise(ok => setTimeout(ok, 1000));
    let r;
    try { r = await fetch(url, opts); } catch (e) { error = new Error(`No se ha podido descargar ${que}: sin conexión o el servidor no responde. Vuelve a cargar la página.`); continue; }
    if (r.ok) return r;
    error = new Error(`No se ha podido descargar ${que} (error ${r.status}).`);
    if (r.status < 500) break;
  }
  throw error;
}
async function cargarMeta() {
  const r = await traer(BASE + 'metadatos.json', { cache: 'no-cache' }, 'los metadatos');
  META = await r.json();
  const deff = Object.fromEntries(META.estudios.map(e => [String(e.estudio), e]));
  EST = META.tramos_estudio.map(t => ({ ...t, estudio: String(t.estudio), deff: +deff[String(t.estudio)]?.deff || 1,
    deffRec: +deff[String(t.estudio)]?.deff_recuerdo || +deff[String(t.estudio)]?.deff || 1, info: deff[String(t.estudio)] }));
  EST.forEach((e, i) => { ESTI[e.mes] = i; });
  for (const [k, c] of Object.entries(META.conceptos)) {
    LAB[k] = Object.fromEntries((c.categorias || []).map(x => [x.id, x.etiqueta]));
  }
  LIDERES = Object.keys(META.columnas).filter(k => k.startsWith('lider_'));
  MINISTROS = Object.keys(META.columnas).filter(k => k.startsWith('ministro_'));
}
async function col(name) {
  if (COLS[name]) return COLS[name];
  if (!PEND[name]) PEND[name] = (async () => {
    const info = META.columnas[name];
    if (!info) throw new Error('Columna no disponible: ' + name);
    // la versión de los metadatos evita mezclar columnas de una publicación anterior guardadas en caché
    const r = await traer(BASE + info.archivo + '?v=' + encodeURIComponent(META.generado || ''), undefined, 'la columna ' + name);
    let buf;
    try { buf = await inflar(r); } catch (e) { throw new Error(`No se ha podido leer la columna ${name}: la descarga se ha interrumpido. Vuelve a intentarlo.`); }
    COLS[name] = info.bytes === 1 ? new Uint8Array(buf) : info.bytes === 2 ? new Uint16Array(buf) : new Float32Array(buf);
    return COLS[name];
  })().catch(e => { delete PEND[name]; throw e; });   // un fallo no se queda guardado: el siguiente intento vuelve a descargar
  return PEND[name];
}
/* Los navegadores sin DecompressionStream (Safari anterior a 16.4) cargan fflate solo cuando lo necesitan */
let FFLATE = null;
const cargarFflate = () => FFLATE || (FFLATE = new Promise((ok, ko) => {
  const sc = document.createElement('script');
  sc.src = 'js/vendor/fflate.min.js';
  sc.onload = () => ok(window.fflate);
  sc.onerror = () => ko(new Error('No se ha podido cargar el descompresor de datos.'));
  document.head.appendChild(sc);
}));
async function inflar(r) {
  if (typeof DecompressionStream !== 'undefined') return new Response(r.body.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
  const ff = await cargarFflate();
  const u8 = ff.unzlibSync(new Uint8Array(await r.arrayBuffer()));
  return u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength ? u8.buffer : u8.slice().buffer;
}
const preg = id => {
  const p = PREG.find(x => x.id === id);
  if (!p) return null;
  const tipo = p.tipo || 'cat';
  const cols = [...(p.cols || (tipo === 'medias' ? (p.id === 'ministros' ? MINISTROS : LIDERES) : [p.id]))];
  return { ...p, tipo, cols };
};
const disponible = p => p && p.cols.length && p.cols.every(c => META.columnas[c]);
/* Bloques: suma de respuestas definida por quien usa la herramienta; se tratan como una respuesta más */
const PREFIJO_BLOQUE = 'BLQ:';
const idBloque = b => PREFIJO_BLOQUE + b.nombre;
const esBloque = id => typeof id === 'string' && id.startsWith(PREFIJO_BLOQUE);
const bloquesDe = cfg => (cfg.bloques || []).filter(b => b && b.nombre && b.ids && b.ids.length);
function textoBloques(cfg) {
  const P = preg(cfg.preg), bs = bloquesDe(cfg);
  if (!P || !bs.length) return '';
  return '. ' + bs.map(b => `Bloque «${b.nombre}»: ${b.ids.map(id => etiqueta(P.cols[0], id)).join(' + ')}`).join('. ');
}
// en las barras apiladas cada respuesta cuenta una vez: un bloque elegido aparta a sus miembros y a los bloques que se solapan
function sinSolapes(cats, cfg) {
  const usados = new Set(), out = [];
  const miembros = id => (esBloque(id) ? (bloquesDe(cfg).find(b => idBloque(b) === id)?.ids || []) : [id]);
  [...cats.filter(esBloque), ...cats.filter(id => !esBloque(id))].forEach(id => {
    const m = miembros(id);
    if (m.some(x => usados.has(x))) return;
    m.forEach(x => usados.add(x)); out.push(id);
  });
  return cats.filter(id => out.includes(id));
}
const etiqueta = (concepto, id) => {
  if (esBloque(id)) return id.slice(PREFIJO_BLOQUE.length);
  if (NR.has(id)) return META.no_respuesta[id] || id;
  const persona = /^(lider|ministro)_/;
  if (persona.test(concepto) || persona.test(id)) {
    const k = persona.test(id) ? id : concepto;
    return (META.conceptos[k]?.etiqueta || k).replace(/^Valoración de /, '').replace(/ \(1-10\)$/, '');
  }
  return String(LAB[concepto]?.[id] ?? id).replace(/^\(NO LEER\)\s*/i, '');
};
/* Nombre de una respuesta de P; en una media de una sola escala (ideología), el de la pregunta */
const nombreResp = (P, id) => P.tipo === 'media' ? P.t.replace(/ \(media\)$/, '') : P.tipo === 'medias' ? etiqueta(id, id) : etiqueta(P.cols[0], id);
const nivelesDe = c => META.columnas[c].niveles;
const ordenMeta = (concepto, ids) => {
  const pos = Object.fromEntries((META.conceptos[concepto]?.categorias || []).map((c, i) => [c.id, i]));
  return ids.slice().sort((a, z) => (pos[a] ?? 1e6) - (pos[z] ?? 1e6));
};

/* Agregación: por estudio y grupo (categoría del cruce o total), suma ponderada y n sin ponderar */
async function calcular(cfg) {
  const P = preg(cfg.preg);
  const recuerdo = !!cfg.recuerdo && !!META.columnas.peso_recuerdo;
  const colPeso = recuerdo ? 'peso_recuerdo' : 'peso';
  const need = [...P.cols, colPeso];
  if (cfg.cruce) need.push(cfg.cruce);
  if (cfg.filtro) need.push(cfg.filtro.col);
  await Promise.all(need.map(col));
  const peso = COLS[colPeso];
  const gcol = cfg.cruce ? COLS[cfg.cruce] : null;
  const glev = cfg.cruce ? nivelesDe(cfg.cruce) : ['TOTAL'];
  const G = glev.length;
  const gNP = cfg.cruce ? glev.indexOf('NP') : -1;
  let fcol = null, fcod = -1;
  if (cfg.filtro) { fcol = COLS[cfg.filtro.col]; fcod = nivelesDe(cfg.filtro.col).indexOf(cfg.filtro.val) + 1; }
  const meses = EST.filter(e => (!cfg.desde || e.mes >= cfg.desde) && (!cfg.hasta || e.mes <= cfg.hasta))
    .map(e => (recuerdo ? { ...e, deff: e.deffRec } : e));
  const filas = [];

  if (P.tipo === 'cat' || P.tipo === 'multi') {
    // identificadores comunes a las columnas (las de problemas tienen niveles propios)
    const ids = [], idx = {};
    const mapas = P.cols.map(c => nivelesDe(c).map(id => { if (!(id in idx)) { idx[id] = ids.length; ids.push(id); } return idx[id]; }));
    const bloques = bloquesDe(cfg);
    bloques.forEach(b => { const id = idBloque(b); if (!(id in idx)) { idx[id] = ids.length; ids.push(id); } });
    const enBloque = ids.map(id => bloques.filter(b => b.ids.includes(id)).map(b => idx[idBloque(b)]));
    const isNR = ids.map(id => NR.has(id)), isNP = ids.map(id => id === 'NP');
    const cs = P.cols.map(c => COLS[c]);
    const K = ids.length;
    for (const e of meses) {
      const base = new Float64Array(G), base2 = new Float64Array(G), n = new Uint32Array(G), num = new Float64Array(G * K);
      const marca = new Int32Array(K).fill(-1), pres = new Uint8Array(K);
      for (let r = e.desde; r < e.hasta; r++) {
        // respuestas que existen en el barómetro: las que alguien da en toda la muestra (sin filtro ni cruce)
        for (let j = 0; j < cs.length; j++) {
          const c = cs[j][r]; if (c === 0) continue;
          const k = mapas[j][c - 1]; if (isNP[k] || (isNR[k] && (cfg.exNR || j > 0))) continue;
          pres[k] = 1; for (const kb of enBloque[k]) pres[kb] = 1;
        }
        if (fcol && fcol[r] !== fcod) continue;
        let g = 0;
        if (gcol) { g = gcol[r] - 1; if (g < 0 || g === gNP) continue; }
        const c0 = cs[0][r];
        if (c0 === 0) continue;
        const k0 = mapas[0][c0 - 1];
        if (isNP[k0] || (cfg.exNR && isNR[k0])) continue;
        const w = peso[r];
        base[g] += w; base2[g] += w * w; n[g]++;
        if (P.tipo === 'cat') { num[g * K + k0] += w; for (const kb of enBloque[k0]) num[g * K + kb] += w; continue; }
        for (let j = 0; j < cs.length; j++) {           // hasta tres menciones, sin contar dos veces la misma
          const c = cs[j][r]; if (c === 0) continue;
          const k = mapas[j][c - 1];
          if (isNP[k] || (j > 0 && isNR[k]) || marca[k] === r) continue;
          marca[k] = r; num[g * K + k] += w;
          for (const kb of enBloque[k]) if (marca[kb] !== r) { marca[kb] = r; num[g * K + kb] += w; }   // un bloque cuenta una vez por persona
        }
      }
      const grupos = [];
      for (let g = 0; g < G; g++) {
        const vals = {}, wnum = {};
        // 0 % solo si la respuesta existe ese mes; si no existía, no hay dato
        if (n[g] > 0) for (let k = 0; k < K; k++) if (pres[k]) { vals[ids[k]] = 100 * num[g * K + k] / base[g]; wnum[ids[k]] = num[g * K + k]; }
        grupos.push({ n: n[g], base: base[g], base2: base2[g], vals, wnum });
      }
      filas.push({ e, grupos, pres: ids.filter((id, k) => pres[k]) });
    }
    return { P, cfg, filas, ids: ids.filter(id => id !== 'NP'), glev, unidad: '%' };
  }
  // medias (líderes, ideología)
  const cs = P.cols.map(c => COLS[c]);
  for (const e of meses) {
    const K = cs.length;
    const sw = new Float64Array(G * K), sw2 = new Float64Array(G * K), swx = new Float64Array(G * K), swx2 = new Float64Array(G * K), n = new Uint32Array(G * K);
    for (let r = e.desde; r < e.hasta; r++) {
      if (fcol && fcol[r] !== fcod) continue;
      let g = 0;
      if (gcol) { g = gcol[r] - 1; if (g < 0 || g === gNP) continue; }
      const w = peso[r];
      for (let k = 0; k < K; k++) {
        const v = cs[k][r]; if (v === 0) continue;
        const i = g * K + k; sw[i] += w; sw2[i] += w * w; swx[i] += w * v; swx2[i] += w * v * v; n[i]++;
      }
    }
    const grupos = [];
    for (let g = 0; g < G; g++) {
      const vals = {}, ns = {}, sd = {}, a = {}, a2 = {}, b = {}, c = {};
      for (let k = 0; k < K; k++) {
        const i = g * K + k, id = P.cols[k];
        if (n[i] > 0) { const m = swx[i] / sw[i]; vals[id] = m; ns[id] = n[i]; sd[id] = Math.sqrt(Math.max(0, swx2[i] / sw[i] - m * m)); a[id] = sw[i]; a2[id] = sw2[i]; b[id] = swx[i]; c[id] = swx2[i]; }
      }
      grupos.push({ vals, ns, sd, sw: a, sw2: a2, swx: b, swx2: c });
    }
    filas.push({ e, grupos });
  }
  return { P, cfg, filas, ids: P.cols.slice(), glev, unidad: 'media' };
}

/* Efecto de diseño de Kish de un conjunto de entrevistas: n · Σw² / (Σw)². El del subgrupo, no el del estudio entero,
   porque en los cruces el peso puede estar correlacionado con el grupo (por nivel de estudios desde nov-2023, por ejemplo) */
const kish = (n, sw, sw2) => (n > 0 && sw > 0 && sw2 > 0 ? n * sw2 / (sw * sw) : 1);
const Z = 1.96;
/* Intervalo al 95 % de un porcentaje: Wilson sobre el tamaño efectivo n/deff. No se trunca en 0 porque nunca baja de 0,
   y cubre mejor que Wald cuando p es pequeño o la base es corta (50 entrevistas) */
function intervaloPct(p, n, deff) {
  const ne = n / deff, z2 = Z * Z;
  const centro = (p + z2 / (2 * ne)) / (1 + z2 / ne);
  const semi = Z * Math.sqrt(p * (1 - p) / ne + z2 / (4 * ne * ne)) / (1 + z2 / ne);
  return { se: 100 * Math.sqrt(deff * p * (1 - p) / n), lo: 100 * Math.max(0, centro - semi), hi: 100 * Math.min(1, centro + semi) };
}
/* Series a dibujar a partir de la agregación */
function puntoDe(res, f, g, id) {
  const media = res.unidad === 'media';
  const gr = f.grupos[g]; if (!gr) return { v: null, n: 0 };
  const v = gr.vals[id];
  const n = media ? (gr.ns[id] || 0) : gr.n;
  if (v == null || n < MIN_N) return { v: null, n, omit: v != null && n > 0 };
  if (media) {
    const deff = kish(n, gr.sw[id], gr.sw2?.[id]);
    const se = Math.sqrt(deff * gr.sd[id] ** 2 / n);
    return { v, n, se, deff, lo: v - Z * se, hi: v + Z * se };
  }
  const deff = kish(n, gr.base, gr.base2);
  return { v, n, deff, ...intervaloPct(v / 100, n, deff) };
}
/* Acumula varios barómetros (índices de res.filas) para un grupo y una respuesta: suma de pesos y de casos */
function acumular(res, idxs, g, id) {
  const media = res.unidad === 'media';
  let N = 0, B = 0, S = 0, S2 = 0, D = 0;
  for (const i of idxs) {
    const gr = res.filas[i].grupos[g]; if (!gr) continue;
    if (media) {
      const n = gr.ns[id] || 0; if (!n) continue;
      N += n; B += gr.sw[id]; S += gr.swx[id]; S2 += gr.swx2[id]; D += kish(n, gr.sw[id], gr.sw2?.[id]) * n;
    } else {
      if (!gr.n || !(id in gr.wnum)) continue;          // la respuesta no existía ese mes: el barómetro no cuenta
      N += gr.n; B += gr.base; S += gr.wnum[id]; D += kish(gr.n, gr.base, gr.base2) * gr.n;
    }
  }
  if (!N) return { v: null, n: 0 };
  if (N < MIN_N) return { v: null, n: N, omit: true };
  const deff = D / N;
  if (media) { const m = S / B, sd = Math.sqrt(Math.max(0, S2 / B - m * m)), se = Math.sqrt(deff * sd * sd / N); return { v: m, n: N, se, deff, lo: m - Z * se, hi: m + Z * se }; }
  const p = S / B;
  return { v: 100 * p, n: N, deff, ...intervaloPct(p, N, deff) };
}
/* Los k barómetros consecutivos que terminan en el índice i (los que tienen la pregunta), sin cruzar una ruptura C de
   los conceptos del panel. Con exigirMes, si el barómetro i no tiene la pregunta no hay ventana (media móvil). */
const conDatos = f => f.grupos.some(gr => (gr.n || 0) > 0 || Object.keys(gr.ns || {}).length);
function ventana(res, cfg, i, k, exigirMes = false) {
  if (exigirMes && !conDatos(res.filas[i])) return [];
  const cortes = rupturas(cfg).filter(r => r.tipo === 'C').map(r => r.m);
  const tramo = mes => cortes.filter(c => c <= mes).length;
  const t = tramo(res.filas[i].e.mes), out = [];
  for (let j = i; j >= 0 && j > i - k; j--) {
    if (tramo(res.filas[j].e.mes) !== t) break;
    if (conDatos(res.filas[j])) out.push(j);
  }
  return out;
}
/* Ventana de la media móvil, centrada: el barómetro, el anterior y el siguiente (por índice, como «ventana»), sin cruzar
   una ruptura C. En el último barómetro de cada tramo (o si el siguiente no tiene la pregunta) se toman los dos anteriores,
   y en el primero los dos siguientes; esos puntos se marcan como provisionales. */
function ventanaMovil(res, cfg, i) {
  const F = res.filas;
  if (!conDatos(F[i])) return { idxs: [], centrada: false };
  const cortes = rupturas(cfg).filter(r => r.tipo === 'C').map(r => r.m);
  const tramo = mes => cortes.filter(c => c <= mes).length;
  const t = tramo(F[i].e.mes);
  const mismo = j => j >= 0 && j < F.length && tramo(F[j].e.mes) === t;
  const con = j => mismo(j) && conDatos(F[j]);
  if (con(i - 1) && con(i + 1)) return { idxs: [i - 1, i, i + 1], centrada: true };
  const idxs = [i];
  if (!con(i + 1)) { for (let j = i - 1; j >= i - 2 && mismo(j); j--) if (conDatos(F[j])) idxs.push(j); }
  else { for (let j = i + 1; j <= i + 2 && mismo(j); j++) if (conDatos(F[j])) idxs.push(j); }
  return { idxs, centrada: false };
}
function series(res, cfg) {
  const { P, filas, glev } = res;
  const punto = cfg.movil
    ? (f, g, id) => { const i = filas.indexOf(f); const w = ventanaMovil(res, cfg, i); const pt = acumular(res, w.idxs, g, id); if (pt.v != null && !w.centrada) pt.prov = true; return pt; }
    : (f, g, id) => puntoDe(res, f, g, id);
  const conc = P.tipo === 'multi' ? P.cols[0] : P.cols[0];
  let out;
  if (!cfg.cruce) {
    let cats = cfg.cats && cfg.cats.length ? cfg.cats : catsDefecto(res);
    if (P.tipo === 'cat' && res.ids.filter(id => !NR.has(id)).length <= 7) cats = ordenMeta(conc, cats);
    out = cats.slice(0, MAX_SERIES).map(id => ({
      id, label: nombreResp(P, id),
      pts: filas.map(f => ({ mes: f.e.mes, f, ...punto(f, 0, id) })),
    }));
  } else {
    const cat1 = cfg.cat1 && res.ids.includes(cfg.cat1) ? cfg.cat1 : catsDefecto(res)[0];
    const gs = ordenMeta(cfg.cruce, cfg.gcats && cfg.gcats.length ? cfg.gcats : gruposDefecto(res, cat1));
    out = gs.slice(0, MAX_SERIES).map(gid => {
      const g = glev.indexOf(gid);
      return { id: gid, label: etiqueta(cfg.cruce, gid), pts: filas.map(f => ({ mes: f.e.mes, f, ...punto(f, g, cat1) })) };
    });
    out.cat1 = cat1;
  }
  return out;
}
const ultimoCon = (res, g, id) => {
  for (let i = res.filas.length - 1; i >= 0; i--) { const v = res.filas[i].grupos[g]?.vals[id]; if (v != null) return v; }
  return null;
};
function catsDefecto(res) {
  const { P, ids } = res;
  if (res.unidad === 'media') {
    const rec = ids.filter(id => res.filas.slice(-6).some(f => f.grupos[0].vals[id] != null));
    if (rec.length <= 8) return rec;
    // muchas personas (ministros): las ocho más conocidas en el último barómetro con datos
    const nUlt = id => { for (let i = res.filas.length - 1; i >= 0; i--) { const n = res.filas[i].grupos[0].ns[id]; if (n) return n; } return 0; };
    return rec.sort((a, z) => nUlt(z) - nUlt(a)).slice(0, 8);
  }
  const sust = ids.filter(id => !NR.has(id));
  if (sust.length <= 7) return ordenMeta(P.cols[0], sust);
  // últimos valores (último barómetro con la pregunta), los seis mayores
  return sust.map(id => [id, ultimoCon(res, 0, id) ?? -1]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
}
function gruposDefecto(res, cat1) {
  const lev = ordenMeta(res.cfg.cruce, res.glev.filter(id => !NR.has(id)));
  if (lev.length <= 6) return lev;
  const last = res.filas[res.filas.length - 1];
  return lev.map(id => [id, last.grupos[res.glev.indexOf(id)]?.n ?? 0]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
}

/* ================= rupturas ================= */
function conceptosDe(cfg) {
  const P = preg(cfg.preg);
  const cs = P.tipo === 'medias' ? [...P.cols] : [P.cols[0]];
  if (cfg.cruce) cs.push(cfg.cruce);
  if (cfg.filtro) cs.push(cfg.filtro.col);
  if (cfg.recuerdo) cs.push('recuerdo_voto');
  return cs;
}
const mesesRuptura = r => (r.mes || '').includes('…') ? [r.mes.slice(0, 7)] : (r.mes.match(/\d{4}-\d{2}/g) || []);
function rupturas(cfg) {
  const ids = new Set(conceptosDe(cfg).flatMap(c => META.conceptos[c]?.rupturas || []));
  return META.rupturas
    .filter(r => ids.has(r.ruptura_id) && (r.tipo === 'C' || r.tipo === 'B') && !/descartada/.test(r.estado))
    .flatMap(r => mesesRuptura(r).map(m => ({ ...r, m })));
}
function notasEstudio(cfg, mes) {
  return conceptosDe(cfg).flatMap(c => (META.conceptos[c]?.estudios || []).filter(x => x.mes === mes && x.nivel === 'B' && x.nota).map(x => x.nota));
}
/* Primera frase de la descripción; si es muy larga, se corta en un espacio */
const breveRuptura = d => {
  const s = d.split(/(?<=[.!?»])\s+(?=[A-ZÁÉÍÓÚÑ¿«(])/)[0];
  if (s.length <= 230) return s;
  const c = s.slice(0, 228); return c.slice(0, c.lastIndexOf(' ')) + '…';
};

/* ================= paleta ================= */
let PAL = {};
/* Valores de la paleta clara, por si alguna variable CSS no se resuelve al leerla (hoja aún no aplicada, navegador con
   problemas): un canvas con fillStyle inválido pinta en negro, y un SVG con fill vacío también */
const PAL_DEFECTO = { surface: '#f7f6f3', ink: '#1c1d1f', ink2: '#4f5257', ink3: '#65686d', line: '#dcdad5', line2: '#c4c1bb', acc: '#b2422e',
  cat: ['#d64a33', '#1794b5', '#a93772', '#bc9121', '#284e99', '#6f7d1a', '#8c64b7', '#177c52', '#e8899a', '#3f8fd0', '#b0652a', '#6a5bd8'],
  fontD: "Bahnschrift,'DIN Alternate','DIN 2014','D-DIN','Roboto Condensed','Arial Narrow',sans-serif" };
function leerPaleta() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, d) => cs.getPropertyValue(n).trim() || d;
  PAL = { surface: v('--surface', PAL_DEFECTO.surface), ink: v('--ink', PAL_DEFECTO.ink), ink2: v('--ink2', PAL_DEFECTO.ink2), ink3: v('--ink3', PAL_DEFECTO.ink3),
    line: v('--line', PAL_DEFECTO.line), line2: v('--line2', PAL_DEFECTO.line2), acc: v('--acc', PAL_DEFECTO.acc), band: +v('--band', '') || .12,
    cat: PAL_DEFECTO.cat.map((d, i) => v('--c' + (i + 1), d)), font: getComputedStyle(document.body).fontFamily || 'sans-serif',
    fontD: v('--font-d', PAL_DEFECTO.fontD), completa: !!cs.getPropertyValue('--surface').trim() };
}
function colores(lista, cfg, dim = 'cat') {
  const P = preg(cfg.preg);
  const partidoDe = id => {
    if (dim === 'grupo') return ['recuerdo_voto', 'intencion_voto', 'intencion_voto_r', 'voto_simpatia'].includes(cfg.cruce) ? id : null;
    if (P.tipo === 'medias') return PARTIDO_LIDER[id];
    if (P.id === 'pref_presidente') return PARTIDO_CANDIDATO[etiqueta('pref_presidente', id)];
    return ['intencion_voto', 'voto_simpatia', 'simpatia', 'cercania', 'intencion_alternativa', 'intencion_voto_r', 'recuerdo_voto'].includes(P.id) ? id : null;
  };
  const out = {}, usados = new Set();
  lista.forEach(s => {
    if (s.id === 'NS') out[s.id] = PAL.ink3;
    else if (NR.has(s.id)) out[s.id] = PAL.line2;
    else { const p = partidoDe(s.id); if (p && COLOR_PARTIDO[p] && !usados.has(COLOR_PARTIDO[p])) { out[s.id] = COLOR_PARTIDO[p]; usados.add(out[s.id]); } }
  });
  // un color de la paleta no se usa si se confunde con uno ya asignado (p. ej., el rojo del PSOE)
  const rgb = h => /^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : null;
  const cerca = (a, b) => {
    const p = rgb(a), q = rgb(b); if (!p || !q) return false;
    const rm = (p[0] + q[0]) / 2;
    return Math.sqrt((2 + rm / 256) * (p[0] - q[0]) ** 2 + 4 * (p[1] - q[1]) ** 2 + (2 + (255 - rm) / 256) * (p[2] - q[2]) ** 2) < 80;
  };
  let slot = 0;
  lista.forEach(s => {
    if (out[s.id]) return;
    while (slot < PAL.cat.length && [...usados].some(u => u === PAL.cat[slot] || cerca(u, PAL.cat[slot]))) slot++;
    out[s.id] = PAL.cat[slot % PAL.cat.length]; usados.add(out[s.id]); slot++;
  });
  return out;
}

/* ================= gráfico ================= */
const tip = $('#tip');
function showTip(html, ev) {
  tip.innerHTML = html; tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
  if (y + h > innerHeight - 8) y = ev.clientY - h - 14;
  tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
}
const hideTip = () => { tip.hidden = true; };

function dibujar(host, res, cfg) {
  const ser = series(res, cfg);
  const visibles = ser.filter(s => s.pts.some(p => p.v != null));
  if (!visibles.length) return { vacio: 'No hay datos suficientes para esta combinación (cada punto necesita al menos 50 entrevistas).' };
  const col = colores(ser, cfg, cfg.cruce ? 'grupo' : 'cat');
  const media = res.unidad === 'media';
  const W = Math.max(300, Math.round(host.clientWidth || 600));
  const H = Math.round(Math.max(270, Math.min(440, W * 0.6)));
  const perRow = Math.max(1, Math.min(ser.length, Math.floor(W / (W < 520 ? 150 : 190))));
  const colW = (W - 16) / perRow, maxL = Math.floor((colW - 26) / 6.4);
  const legendRows = ser.length > 1 ? Math.ceil(ser.length / perRow) : 0;
  const m = { l: 40, r: 50, t: 22 + legendRows * 18, b: 28 };
  host.innerHTML = '';
  const svg = d3.select(host).append('svg').attr('xmlns', 'http://www.w3.org/2000/svg').attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', W).attr('height', H).attr('font-family', PAL.font).attr('font-size', 12).style('background', PAL.surface)
    .attr('role', 'img').attr('aria-label', tituloPanel(cfg, res));
  const meses = res.filas.map(f => f.e.mes);
  const x = d3.scaleUtc().domain([fecha(meses[0]), fecha(meses[meses.length - 1])]).range([m.l, W - m.r]);
  const banda = cfg.banda ?? !cfg.cruce;
  const vals = visibles.flatMap(s => s.pts.flatMap(p => p.v == null ? [] : banda ? [p.lo, p.hi, p.v] : [p.v]));
  let lo = d3.min(vals), hi = d3.max(vals);
  if (!media) { lo = 0; hi = Math.max(hi, 5); } else { const pad = (hi - lo) * .15 || .5; lo = Math.max(0, lo - pad); hi = Math.min(10, hi + pad); }
  const y = d3.scaleLinear().domain([lo, hi]).nice().range([H - m.b, m.t]);
  const axis = g => { g.selectAll('text').attr('fill', PAL.ink3).attr('font-size', 11); g.selectAll('line').attr('stroke', PAL.line2); g.selectAll('path').attr('stroke', PAL.line2); };
  svg.append('g').attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(Math.max(3, Math.round((H - m.t - m.b) / 55))).tickSize(-(W - m.l - m.r)).tickFormat(v => media ? fmt1(v) : fmtInt(v)))
    .call(g => { axis(g); g.selectAll('.tick line').attr('stroke', PAL.line); g.select('.domain').remove(); });
  const anos = d3.utcYear.range(d3.utcYear.ceil(x.domain()[0]), d3.utcMonth.offset(x.domain()[1], 1));
  const paso = Math.ceil(anos.length / Math.max(1, Math.floor((W - m.l - m.r) / 55)));
  svg.append('g').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).tickValues(anos.filter((_, i) => i % paso === 0)).tickFormat(d3.utcFormat('%Y')).tickSizeOuter(0)).call(axis);

  // rupturas
  const rup = rupturas(cfg).filter(r => r.m >= meses[0] && r.m <= meses[meses.length - 1]);
  const marcas = cfg.sinRupturas ? [] : [...d3.group(rup, r => r.m)].map(([mes, rs]) => ({ mes, rs, x: x(fecha(mes)), esC: rs.some(r => r.tipo === 'C') }));
  marcas.forEach(mk => {
    const g = svg.append('g');
    g.append('line').attr('x1', mk.x).attr('x2', mk.x).attr('y1', mk.esC ? m.t - 6 : m.t).attr('y2', H - m.b)
      .attr('stroke', mk.esC ? PAL.acc : PAL.ink3).attr('stroke-width', mk.esC ? 1.5 : 1).attr('stroke-dasharray', mk.esC ? null : '2 3');
    // zona sensible solo en la franja superior: en el área del gráfico la ruptura sale en el tooltip del mes
    g.append('rect').attr('x', mk.x - 7).attr('y', m.t - 20).attr('width', 14).attr('height', 22).attr('fill', 'transparent')
      .style('cursor', 'help')
      .on('pointermove', ev => { ev.stopPropagation(); showTip(`<b>${esc(mesLargo(mk.mes))}</b>` + mk.rs.map(r => `<div class="tnote"><b>${esc(r.ruptura_id)}, tipo ${esc(r.tipo)}</b><br>${esc(breveRuptura(r.descripcion))}</div>`).join(''), ev); })
      .on('pointerleave', hideTip);
  });
  // etiquetas de las rupturas C, agrupadas cuando caen a menos de 34 px
  const grupos = [];
  marcas.filter(mk => mk.esC).sort((a, z) => a.x - z.x).forEach(mk => {
    const ult = grupos[grupos.length - 1];
    if (ult && mk.x - ult[ult.length - 1].x < 34) ult.push(mk); else grupos.push([mk]);
  });
  grupos.forEach(gr => {
    const xm = d3.mean(gr, d => d.x);
    const txt = gr.flatMap(d => d.rs.filter(r => r.tipo === 'C').map(r => r.ruptura_id)).join(' ');
    const anchor = xm > W - m.r - 30 ? 'end' : xm < m.l + 30 ? 'start' : 'middle';
    svg.append('text').attr('x', xm).attr('y', m.t - 9).attr('text-anchor', anchor).attr('font-family', PAL.fontD).attr('font-size', 10.5)
      .attr('font-weight', 600).attr('fill', PAL.acc).text(txt);
  });

  // bandas, líneas y puntos aislados. La línea une los meses en que se hizo la pregunta (los ministros se valoran
  // cada tres meses; algunas preguntas faltan un mes) y se corta donde la respuesta no existe o no llega a 50 casos.
  const def = p => p.v != null;
  const preguntados = s => s.pts.filter(p => p.n > 0 || p.v != null);
  if (banda) {
    const area = d3.area().defined(def).x(p => x(fecha(p.mes))).y0(p => y(p.lo)).y1(p => y(p.hi));
    ser.forEach(s => svg.append('path').attr('d', area(preguntados(s))).attr('fill', col[s.id]).attr('fill-opacity', PAL.band).attr('stroke', 'none'));
  }
  const line = d3.line().defined(def).x(p => x(fecha(p.mes))).y(p => y(p.v));
  ser.forEach(s => {
    const pts = preguntados(s);
    svg.append('path').attr('d', line(pts)).attr('fill', 'none').attr('stroke', col[s.id]).attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    pts.forEach((p, i) => {
      if (p.v == null) return;
      const prev = pts[i - 1], next = pts[i + 1];
      if ((!prev || prev.v == null) && (!next || next.v == null))
        svg.append('circle').attr('cx', x(fecha(p.mes))).attr('cy', y(p.v)).attr('r', 2.5).attr('fill', col[s.id]);
    });
  });
  // etiquetas finales
  const ends = ser.map(s => { const p = [...s.pts].reverse().find(def); return p ? { s, p, y: y(p.v) } : null; }).filter(Boolean).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  ends.forEach(e => {
    const cx = x(fecha(e.p.mes)), cy = y(e.p.v);
    // si la etiqueta se ha desplazado para no pisar otra, una guía del color de la serie la une con su punto
    if (Math.abs(e.y - cy) > 1.5) svg.append('line').attr('x1', cx + 3.5).attr('y1', cy).attr('x2', cx + 6).attr('y2', e.y).attr('stroke', col[e.s.id]).attr('stroke-width', 1.2);
    svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 3.5).attr('fill', col[e.s.id]).attr('stroke', PAL.surface).attr('stroke-width', 2);
    svg.append('text').attr('x', cx + 7).attr('y', e.y + 4).attr('fill', PAL.ink).attr('font-size', 11).attr('font-weight', 600)
      .text(media ? fmt2(e.p.v) : fmt1(e.p.v));
  });
  // leyenda
  if (ser.length > 1) ser.forEach((s, i) => {
    const gx = 8 + (i % perRow) * colW, gy = 2 + Math.floor(i / perRow) * 18;
    svg.append('rect').attr('x', gx).attr('y', gy + 5).attr('width', 14).attr('height', 3).attr('fill', col[s.id]);
    svg.append('text').attr('x', gx + 20).attr('y', gy + 10).attr('fill', PAL.ink2).attr('font-size', 11.5)
      .text(s.label.length > maxL ? s.label.slice(0, maxL - 1) + '…' : s.label).append('title').text(s.label);
  });
  svg.selectAll('path, circle, text, line').attr('pointer-events', 'none');
  // cursor
  const fechas = meses.map(fecha);
  const cRupt = rup.filter(r => r.tipo === 'C').map(r => r.m);
  const cross = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', PAL.line2).attr('visibility', 'hidden');
  svg.insert('rect', 'g').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
    .on('pointermove', ev => {
      const [px] = d3.pointer(ev);
      const i = d3.minIndex(fechas, d => Math.abs(x(d) - px));
      const mes = meses[i];
      cross.attr('x1', x(fechas[i])).attr('x2', x(fechas[i])).attr('visibility', 'visible');
      const rows = ser.map(s => {
        const p = s.pts[i];
        let d = '';
        if (p.v != null) {
          let j = i - 1; while (j >= 0 && s.pts[j].v == null) j--;
          if (j >= 0) {
            const cruza = cRupt.some(c => c > meses[j] && c <= mes);
            const dv = p.v - s.pts[j].v;
            d = cruza ? `<span class="d" title="Ruptura de serie entre ambos meses">s. c.</span>` : `<span class="d">${dv >= 0 ? '+' : '−'}${media ? fmt2(Math.abs(dv)) : fmt1(Math.abs(dv))}</span>`;
          }
        }
        const v = p.v != null ? (media ? fmt2(p.v) : fmt1(p.v) + ' %') : p.omit ? 'n < 50' : 'sin dato';
        return `<div class="r"><span><i class="sw" style="background:${col[s.id]}"></i>${esc(s.label)}</span><span>${v}${d}</span></div>`;
      }).join('');
      const n = !cfg.cruce && !media ? ser[0].pts[i].n : null;
      const prov = cfg.movil && ser.some(s => s.pts[i].prov) ? '<div class="tnote">Media provisional: sin barómetro posterior (o anterior) en el tramo, resume este y los dos más próximos.</div>' : '';
      const notas = prov + rup.filter(r => r.m === mes).map(r => `<div class="tnote"><b>${esc(r.ruptura_id)}, tipo ${esc(r.tipo)}</b><br>${esc(breveRuptura(r.descripcion))}</div>`).join('') +
        notasEstudio(cfg, mes).map(t => `<div class="tnote">${esc(t)}</div>`).join('');
      showTip(`<b>${esc(mesLargo(mes))}</b>${rows}<div class="tnote">Estudio ${esc(res.filas[i].e.estudio)}${n ? `, base ${fmtInt(n)} entrevistas` : ''}. Variación en puntos respecto al barómetro anterior${cRupt.length ? '; «s. c.»: sin comparación por ruptura C' : ''}.</div>${notas}`, ev);
    })
    .on('pointerleave', () => { cross.attr('visibility', 'hidden'); hideTip(); });

  const omitidos = ser.reduce((a, s) => a + s.pts.filter(p => p.omit).length, 0);
  return { ser, col, rup, omitidos, cat1: ser.cat1 };
}


/* Barras: un barómetro, respuestas (colores) por grupo del cruce (eje horizontal) */
function datosBarras(res, cfg) {
  const f = res.filas[0];
  const cats0 = cfg.cats && cfg.cats.length ? cfg.cats.filter(id => res.ids.includes(id)) : catsDefecto(res);
  const conc = res.P.cols[0];
  const cats1 = res.P.tipo === 'cat' ? sinSolapes(cats0, cfg) : cats0;
  const cats = (res.P.tipo === 'cat' && res.ids.filter(id => !NR.has(id)).length <= 7 ? ordenMeta(conc, cats1) : cats1).slice(0, MAX_SERIES);
  const nomCat = id => nombreResp(res.P, id);
  const grupos = cfg.cruce ? ordenMeta(cfg.cruce, cfg.gcats && cfg.gcats.length ? cfg.gcats : gruposDefecto(res)).slice(0, MAX_SERIES) : ['TOTAL'];
  const nomGrupo = id => cfg.cruce ? etiqueta(cfg.cruce, id) : 'Total';
  const celdas = grupos.flatMap(gid => cats.map(cid => ({ gid, cid, ...puntoDe(res, f, res.glev.indexOf(gid), cid) })));
  return { f, cats, grupos, nomCat, nomGrupo, celdas };
}
function dibujarBarras(host, res, cfg) {
  const B = datosBarras(res, cfg);
  if (!B.celdas.some(c => c.v != null)) return { vacio: 'No hay datos suficientes para esta combinación (cada barra necesita al menos 50 entrevistas).' };
  const media = res.unidad === 'media';
  const ser = B.cats.map(id => ({ id, label: B.nomCat(id) }));
  const col = colores(ser, cfg, 'cat');
  const sinCruce = !cfg.cruce;
  const W = Math.max(300, Math.round(host.clientWidth || 600));
  const H = Math.round(Math.max(300, Math.min(460, W * 0.52)));
  const perRow = Math.max(1, Math.min(ser.length, Math.floor(W / (W < 520 ? 150 : 170))));
  const colW = (W - 16) / perRow, maxL = Math.floor((colW - 24) / 6.4);
  const legendRows = sinCruce ? 0 : Math.ceil(ser.length / perRow);
  const m = { l: 40, r: 12, t: 14 + legendRows * 18, b: sinCruce ? 46 : 30 };
  host.innerHTML = '';
  const svg = d3.select(host).append('svg').attr('xmlns', 'http://www.w3.org/2000/svg').attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', W).attr('height', H).attr('font-family', PAL.font).attr('font-size', 12).style('background', PAL.surface)
    .attr('role', 'img').attr('aria-label', tituloPanel(cfg, res));
  const banda = cfg.banda ?? false;
  const vals = B.celdas.flatMap(c => c.v == null ? [] : banda ? [c.hi, c.v] : [c.v]);
  const y = d3.scaleLinear().domain([0, Math.max(media ? 5 : 5, d3.max(vals) * 1.08)]).nice().range([H - m.b, m.t]);
  const ejeX = sinCruce ? B.cats : B.grupos;
  const x0 = d3.scaleBand().domain(ejeX).range([m.l, W - m.r]).paddingInner(sinCruce ? 0.3 : 0.18).paddingOuter(0.05);
  const x1 = d3.scaleBand().domain(sinCruce ? ['_'] : B.cats).range([0, x0.bandwidth()]).padding(0.08);
  const bw = Math.min(sinCruce ? 40 : 24, x1.bandwidth());
  const axis = g => { g.selectAll('text').attr('fill', PAL.ink3).attr('font-size', 11); g.selectAll('line').attr('stroke', PAL.line2); g.selectAll('path').attr('stroke', PAL.line2); };
  svg.append('g').attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(Math.max(3, Math.round((H - m.t - m.b) / 55))).tickSize(-(W - m.l - m.r)).tickFormat(v => media ? fmt1(v) : fmtInt(v)))
    .call(g => { axis(g); g.selectAll('.tick line').attr('stroke', PAL.line); g.select('.domain').remove(); });
  const nomEje = sinCruce ? B.nomCat : B.nomGrupo;
  const maxC = Math.max(4, Math.floor(x0.bandwidth() / 6.2));
  svg.append('g').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x0).tickSizeOuter(0).tickFormat(id => { const t = nomEje(id); return t.length > maxC ? t.slice(0, maxC - 1) + '…' : t; }))
    .call(axis).call(g => g.selectAll('.tick').append('title').text(id => nomEje(id)));
  const etiquetas = bw >= 20;
  B.celdas.forEach(c => {
    if (c.v == null) return;
    const gx = sinCruce ? x0(c.cid) : x0(c.gid);
    const xx = gx + (sinCruce ? x1('_') : x1(c.cid)) + (x1.bandwidth() - bw) / 2;
    const g = svg.append('g');
    g.append('rect').attr('x', xx).attr('y', y(c.v)).attr('width', bw).attr('height', Math.max(0, y(0) - y(c.v))).attr('fill', col[c.cid]);
    if (banda && c.lo != null) {
      g.append('line').attr('x1', xx + bw / 2).attr('x2', xx + bw / 2).attr('y1', y(c.lo)).attr('y2', y(c.hi)).attr('stroke', PAL.ink2).attr('stroke-width', 1);
      [c.lo, c.hi].forEach(v => g.append('line').attr('x1', xx + bw / 2 - 3).attr('x2', xx + bw / 2 + 3).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', PAL.ink2));
    }
    if (etiquetas) g.append('text').attr('x', xx + bw / 2).attr('y', y(banda ? c.hi : c.v) - 4).attr('text-anchor', 'middle').attr('font-size', 10)
      .attr('fill', PAL.ink2).text(media ? fmt2(c.v) : fmt1(c.v));
    g.append('rect').attr('x', gx + (sinCruce ? x1('_') : x1(c.cid))).attr('y', m.t).attr('width', Math.max(x1.bandwidth(), 8)).attr('height', H - m.b - m.t)
      .attr('fill', 'transparent').attr('class', 'hit')
      .on('pointermove', ev => showTip(`<b>${esc(sinCruce ? B.nomCat(c.cid) : B.nomGrupo(c.gid))}</b>` +
        `<div class="r"><span><i class="sw" style="background:${col[c.cid]}"></i>${esc(B.nomCat(c.cid))}</span><span>${media ? fmt2(c.v) : fmt1(c.v) + ' %'}</span></div>` +
        `<div class="tnote">Margen al 95 %: ${media ? fmt2(c.lo) : fmt1(c.lo)} a ${media ? fmt2(c.hi) : fmt1(c.hi)}. Base: ${fmtInt(c.n)} entrevistas.</div>`, ev))
      .on('pointerleave', hideTip);
  });
  if (!sinCruce) ser.forEach((s, i) => {
    const gx = 8 + (i % perRow) * colW, gy = 2 + Math.floor(i / perRow) * 18;
    svg.append('rect').attr('x', gx).attr('y', gy + 2).attr('width', 10).attr('height', 10).attr('fill', col[s.id]);
    svg.append('text').attr('x', gx + 16).attr('y', gy + 11).attr('fill', PAL.ink2).attr('font-size', 11.5)
      .text(s.label.length > maxL ? s.label.slice(0, maxL - 1) + '…' : s.label).append('title').text(s.label);
  });
  svg.selectAll('text, line, rect:not(.hit)').attr('pointer-events', 'none');
  const omitidos = B.celdas.filter(c => c.omit).length;
  return { barras: B, ser, col, rup: [], omitidos };
}


/* Barras apiladas al 100 %: una barra por grupo del cruce (y otra para el total); cada bloque es una respuesta.
   Las respuestas no elegidas se agrupan en «Resto» para que cada barra sume 100. Solo para preguntas de respuesta única. */
const lumin = hex => { const c = d3.color(hex); if (!c) return 0; const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; const r = c.rgb(); return .2126 * f(r.r) + .7152 * f(r.g) + .0722 * f(r.b); };
function dibujarApiladas(host, res, cfg, resTot) {
  const B = datosBarras(res, cfg);
  const filas = [];
  const fila = (gid, label, r, g) => {
    const f = r.filas[0];
    const segs = B.cats.map(cid => ({ cid, ...puntoDe(r, f, g, cid) }));
    const n = f.grupos[g]?.n || 0;
    const ok = n >= MIN_N;
    const suma = d3.sum(segs, d => d.v ?? (f.grupos[g]?.vals[d.cid] || 0));
    segs.forEach(d => { if (d.v == null && ok) d.v = f.grupos[g]?.vals[d.cid] || 0; });
    segs.push({ cid: '__resto', v: ok ? Math.max(0, 100 - suma) : null, n });
    filas.push({ gid, label, segs, n, ok });
  };
  if (cfg.cruce && resTot) fila('__total', 'Total', resTot, 0);
  B.grupos.forEach(gid => fila(gid, cfg.cruce ? B.nomGrupo(gid) : 'Total', res, cfg.cruce ? res.glev.indexOf(gid) : 0));
  if (!filas.some(f => f.ok)) return { vacio: 'No hay datos suficientes para esta combinación (cada barra necesita al menos 50 entrevistas).' };
  const ser = [...B.cats.map(id => ({ id, label: B.nomCat(id) }))];
  const col = colores(ser, cfg, 'cat');
  col.__resto = PAL.line;
  ser.push({ id: '__resto', label: 'Resto de respuestas' });
  const W = Math.max(300, Math.round(host.clientWidth || 600));
  const perRow = Math.max(1, Math.min(ser.length, Math.floor(W / (W < 520 ? 150 : 170))));
  const colW = (W - 16) / perRow, maxL = Math.floor((colW - 24) / 6.4);
  const legendRows = Math.ceil(ser.length / perRow);
  const labW = Math.min(170, Math.max(70, d3.max(filas, f => f.label.length) * 6.6 + 10));
  const maxEtq = Math.max(6, Math.floor((labW - 12) / 6.6));   // la etiqueta del grupo no se sale por la izquierda
  const rowH = 30, sep = cfg.cruce ? 10 : 0;
  const m = { l: labW, r: 26, t: 10 + legendRows * 18 + 6, b: 26 };
  const H = m.t + filas.length * rowH + sep + m.b;
  host.innerHTML = '';
  const svg = d3.select(host).append('svg').attr('xmlns', 'http://www.w3.org/2000/svg').attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', W).attr('height', H).attr('font-family', PAL.font).attr('font-size', 12).style('background', PAL.surface)
    .attr('role', 'img').attr('aria-label', tituloPanel(cfg, res));
  const x = d3.scaleLinear().domain([0, 100]).range([m.l, W - m.r]);
  const yRow = i => m.t + i * rowH + (cfg.cruce && i > 0 ? sep : 0);
  svg.append('g').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).tickValues([0, 25, 50, 75, 100]).tickFormat(v => v + ' %').tickSize(-(H - m.t - m.b)).tickSizeOuter(0))
    .call(g => { g.selectAll('text').attr('fill', PAL.ink3).attr('font-size', 11); g.selectAll('.tick line').attr('stroke', PAL.line); g.select('.domain').remove(); });
  const barH = 20;
  filas.forEach((f, i) => {
    const y0 = yRow(i) + (rowH - barH) / 2;
    svg.append('text').attr('x', m.l - 8).attr('y', y0 + barH / 2 + 4).attr('text-anchor', 'end').attr('font-size', 12)
      .attr('font-weight', f.gid === '__total' ? 600 : 400).attr('fill', PAL.ink2)
      .text(f.label.length > maxEtq ? f.label.slice(0, maxEtq - 1) + '…' : f.label).append('title').text(f.label);
    if (!f.ok) { svg.append('text').attr('x', m.l + 4).attr('y', y0 + barH / 2 + 4).attr('font-size', 11).attr('fill', PAL.ink3).text(`n < ${MIN_N}: sin dato`); return; }
    let acc = 0;
    f.segs.forEach(d => {
      const w = x(acc + d.v) - x(acc);
      const xx = x(acc);
      acc += d.v;
      if (w <= 0) return;
      const g = svg.append('g');
      g.append('rect').attr('x', xx).attr('y', y0).attr('width', Math.max(0, w - 2)).attr('height', barH).attr('fill', col[d.cid]);
      const txt = w >= 38 ? fmt1(d.v) : w >= 22 ? String(Math.round(d.v)) : '';
      if (txt) g.append('text').attr('x', xx + (w - 2) / 2).attr('y', y0 + barH / 2 + 4).attr('text-anchor', 'middle').attr('font-size', 10.5)
        .attr('font-weight', 600).attr('fill', lumin(col[d.cid]) > .35 ? '#1c1d1f' : '#ffffff').text(txt);
      const nom = d.cid === '__resto' ? 'Resto de respuestas' : B.nomCat(d.cid);
      g.append('rect').attr('class', 'hit').attr('x', xx).attr('y', yRow(i)).attr('width', Math.max(w, 6)).attr('height', rowH).attr('fill', 'transparent')
        .on('pointermove', ev => showTip(`<b>${esc(f.label)}</b><div class="r"><span><i class="sw" style="background:${col[d.cid]}"></i>${esc(nom)}</span><span>${fmt1(d.v)} %</span></div>` +
          (d.lo != null ? `<div class="tnote">Margen al 95 %: ${fmt1(d.lo)} a ${fmt1(d.hi)}.</div>` : '') + `<div class="tnote">Base: ${fmtInt(f.n)} entrevistas.</div>`, ev))
        .on('pointerleave', hideTip);
    });
  });
  ser.forEach((s, i) => {
    const gx = 8 + (i % perRow) * colW, gy = 2 + Math.floor(i / perRow) * 18;
    svg.append('rect').attr('x', gx).attr('y', gy + 2).attr('width', 10).attr('height', 10).attr('fill', col[s.id]);
    svg.append('text').attr('x', gx + 16).attr('y', gy + 11).attr('fill', PAL.ink2).attr('font-size', 11.5)
      .text(s.label.length > maxL ? s.label.slice(0, maxL - 1) + '…' : s.label).append('title').text(s.label);
  });
  svg.selectAll('text, line, rect:not(.hit)').attr('pointer-events', 'none');
  B.apiladas = filas;
  return { barras: B, ser, col, rup: [], omitidos: filas.filter(f => !f.ok).length };
}

/* ================= paneles ================= */
let PANELES = [];
let SEQ = 0;
const nuevoId = () => 'p' + (++SEQ);

function tituloPanel(cfg, res) {
  return tituloBase(cfg, res) + (cfg.recuerdo ? ' (con reponderación por recuerdo)' : '');
}
function tituloBase(cfg, res) {
  const P = preg(cfg.preg);
  if (cfg.tipo === 'barras') return cfg.cruce ? `${P.t}, por ${CRUCE_DE[cfg.cruce].toLowerCase()}` : P.t;
  if (!cfg.cruce) return P.t;
  const cat1 = res && res.cat1 ? res.cat1 : cfg.cat1;
  const nom = cat1 ? nombreResp(P, cat1) : '';
  const de = P.tipo === 'medias' ? `Valoración de ${nom}` : P.tipo === 'media' ? P.t : `${P.t}: ${nom}`;
  return `${de}, por ${CRUCE_DE[cfg.cruce].toLowerCase()}`;
}
/* Aviso en los paneles cuya medida es una pregunta de voto: va en la línea de metadatos, y con ella en el PNG y el CSV */
const AVISO_VOTO = 'No es la estimación de voto del CIS';
function esSerieVoto(cfg) {
  const medidas = cfg.tipo === 'dispersion' ? [cfg.x?.preg, cfg.y?.preg] : cfg.tipo === 'mapa' ? [cfg.ind?.preg] : [cfg.preg];
  return medidas.some(id => PARTIDISTAS.includes(id));
}
const avisoVoto = cfg => (esSerieVoto(cfg) ? `. ${AVISO_VOTO}` : '');
function metaPanel(cfg, res) {
  const P = preg(cfg.preg);
  const f = res.filas;
  const ud = res.unidad === 'media' ? 'Media de 1 a 10' : P.tipo === 'multi' ? '% de entrevistados (hasta tres menciones)' : '% de entrevistados';
  const per = !f.length ? '' : cfg.tipo === 'barras' ? `${mesLargo(f[0].e.mes)} (estudio ${f[0].e.estudio})` : `${mesCorto(f[0].e.mes)} a ${mesCorto(f[f.length - 1].e.mes)}`;
  const fil = cfg.filtro ? `. Solo ${etiqueta(cfg.filtro.col, cfg.filtro.val)}` : '';
  const exn = cfg.exNR && res.unidad !== 'media' ? '. Sin NS/NC en la base' : '';
  const mov = cfg.movil && cfg.tipo !== 'barras' ? '. Media móvil centrada de 3 barómetros: cada punto resume ese barómetro, el anterior y el siguiente (el último, los dos anteriores)' : '';
  const rec = cfg.recuerdo ? '. Pesos ajustados al recuerdo de voto (estimación propia)' : '';
  return `${ud}. ${per}${fil}${exn}${mov}${rec}${textoBloques(cfg)}${avisoVoto(cfg)}`;
}

function panelEl(cfg) {
  const el = document.createElement('section');
  el.className = 'panel' + (cfg.ancho ? ' wide' : '');
  el.dataset.id = cfg.id;
  el.innerHTML = `<header class="phd"><div class="ttl"><h2></h2><p class="meta"></p></div>
    <div class="acts">
      <button class="ib" type="button" data-a="edit">Configurar</button>
      ${cfg.tipo && cfg.tipo !== 'calor' ? '' : `<button class="ib" type="button" data-a="rupt" aria-pressed="${!cfg.sinRupturas}">${cfg.sinRupturas ? 'Mostrar rupturas' : 'Ocultar rupturas'}</button>`}
      <button class="ib" type="button" data-a="tabla" aria-pressed="false">Tabla</button>
      <button class="ib" type="button" data-a="csv">CSV</button>
      <button class="ib" type="button" data-a="png">PNG</button>
      ${cfg.tipo === 'puntos' ? '<button class="ib" type="button" data-a="banner" title="PNG de 1584 × 396 (a doble resolución), con título y fuente">Banner</button>' : ''}
      <button class="ib" type="button" data-a="dup">Duplicar</button>
      <button class="ib" type="button" data-a="del" aria-label="Quitar panel">Quitar</button>
    </div></header>
    <div class="chart"></div><div class="tabla" hidden></div><div class="notas"></div>
    <p class="src">Fuente: CIS, barómetros mensuales (microdatos). Elaboración: Barómetro a barómetro.</p>`;
  el.querySelector('.acts').addEventListener('click', ev => {
    const a = ev.target.closest('button')?.dataset.a; if (!a) return;
    const i = PANELES.findIndex(p => p.id === cfg.id);
    if (a === 'edit') abrirEditor(PANELES[i]);
    if (a === 'dup') { PANELES.splice(i + 1, 0, { ...structuredClone(PANELES[i]), id: nuevoId() }); guardar(); renderTodo(); }
    if (a === 'del') { const [q] = PANELES.splice(i, 1); guardar(); renderTodo(); avisoDeshacer(q, i); }
    if (a === 'tabla') { const t = el.querySelector('.tabla'); t.hidden = !t.hidden; ev.target.setAttribute('aria-pressed', String(!t.hidden)); }
    if (a === 'rupt') {
      const p = PANELES[i]; p.sinRupturas = !p.sinRupturas; guardar();
      ev.target.textContent = p.sinRupturas ? 'Mostrar rupturas' : 'Ocultar rupturas';
      ev.target.setAttribute('aria-pressed', String(!p.sinRupturas));
      renderPanel(el, p);
    }
    if (a === 'csv') exportarCSV(el);
    if (a === 'png') exportarPNG(el);
    if (a === 'banner') exportarBanner(el);
  });
  return el;
}

async function renderPanel(el, cfg) {
  const P = preg(cfg.preg);
  const h2 = el.querySelector('h2'), meta = el.querySelector('.meta'), host = el.querySelector('.chart'),
    notas = el.querySelector('.notas'), tabla = el.querySelector('.tabla');
  host.style.overflowX = '';
  if (VISTAS[cfg.tipo]) {
    el.classList.add('cargando');
    try {
      const out = await VISTAS[cfg.tipo](host, cfg);
      if (out.vacio) { host.innerHTML = `<p class="empty">${esc(out.vacio)}</p>`; notas.innerHTML = ''; tabla.innerHTML = ''; el._res = null; if (!h2.textContent) h2.textContent = TIPOS.find(t => t[0] === cfg.tipo)[1]; return; }
      const rec = cfg.recuerdo && cfg.tipo !== 'transferencias';
      h2.textContent = out.titulo + (rec ? ' (con reponderación por recuerdo)' : '');
      meta.textContent = out.meta + (rec ? '. Pesos ajustados al recuerdo de voto (estimación propia)' : '') + textoBloques(cfg) + avisoVoto(cfg);
      notas.innerHTML = [...(rec ? [NOTA_RECUERDO] : []), ...out.notas].map(t => `<p class="note">${esc(t)}</p>`).join('');
      tabla.innerHTML = `<table><thead><tr>${out.tabla.cab.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${out.tabla.filas.map(f => `<tr>${f.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      el._res = { generico: out, cfg };
    } catch (e) {
      h2.textContent = TIPOS.find(t => t[0] === cfg.tipo)[1]; meta.textContent = '';
      host.innerHTML = `<p class="empty">${esc(META.veda && /no disponible/.test(e.message) ? 'Serie retirada durante el periodo de prohibición de publicación de sondeos.' : e.message)}</p>`;
      notas.innerHTML = ''; tabla.innerHTML = ''; el._res = null;
    } finally { el.classList.remove('cargando'); }
    return;
  }
  if (!disponible(P) || (cfg.cruce && !META.columnas[cfg.cruce]) || (cfg.filtro && !META.columnas[cfg.filtro.col])) {
    h2.textContent = P ? P.t : 'Panel';
    meta.textContent = '';
    host.innerHTML = `<p class="empty">${META.veda ? 'Serie retirada durante el periodo de prohibición de publicación de sondeos (del 24 al 29 de noviembre).' : 'Serie no disponible.'}</p>`;
    notas.innerHTML = ''; tabla.innerHTML = '';
    el._res = null;
    return;
  }
  el.classList.add('cargando');
  try {
    const barras = cfg.tipo === 'barras';
    const mesB = barras ? (cfg.mes && ESTI[cfg.mes] != null ? cfg.mes : EST[EST.length - 1].mes) : null;
    const res = await calcular(barras ? { ...cfg, desde: mesB, hasta: mesB } : cfg);
    const apilar = barras && res.P.tipo === 'cat' && (cfg.apilar ? cfg.apilar === 'apiladas' : !!cfg.cruce && datosBarras(res, cfg).cats.length >= 5);
    const resTot = apilar && cfg.cruce ? await calcular({ ...cfg, cruce: null, desde: mesB, hasta: mesB }) : null;
    const out = !barras ? dibujar(host, res, cfg) : apilar ? dibujarApiladas(host, res, cfg, resTot) : dibujarBarras(host, res, cfg);
    res.cat1 = out.cat1;
    h2.textContent = tituloPanel(cfg, res);
    meta.textContent = metaPanel(cfg, res);
    if (out.vacio) { host.innerHTML = `<p class="empty">${esc(out.vacio)}</p>`; notas.innerHTML = ''; tabla.innerHTML = ''; el._res = null; return; }
    el._res = { res, out, cfg };
    // notas
    const vistas = new Set();
    const ns = cfg.sinRupturas && out.rup.length ? ['<p class="note">Líneas de ruptura ocultas en el gráfico. Las variaciones mensuales siguen sin calcularse a través de una ruptura C.</p>'] : [];
    ns.push(...out.rup.filter(r => !vistas.has(r.ruptura_id) && vistas.add(r.ruptura_id))
      .map(r => `<p class="note"><span class="rid">${esc(r.ruptura_id)}</span> (${esc(mesCorto(r.m))}, tipo ${esc(r.tipo)}): ${esc(breveRuptura(r.descripcion))}</p>`));
    if (cfg.recuerdo) ns.unshift(`<p class="note">${esc(NOTA_RECUERDO)}</p>`);
    if (out.barras) notasEstudio(cfg, res.filas[0].e.mes).forEach(t => ns.push(`<p class="note">${esc(t)}</p>`));
    if (out.omitidos) ns.push(`<p class="note">${out.omitidos} ${out.barras ? (out.omitidos === 1 ? 'barra omitida' : 'barras omitidas') : (out.omitidos === 1 ? 'punto omitido' : 'puntos omitidos')} por tener menos de ${MIN_N} entrevistas.</p>`);
    notas.innerHTML = ns.join('');
    tabla.innerHTML = tablaHTML(out, res);
  } catch (e) {
    host.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  } finally { el.classList.remove('cargando'); }
}

function tablaHTML(out, res) {
  const media = res.unidad === 'media';
  const f = media ? fmt2 : fmt1;
  if (out.barras && out.barras.apiladas) {
    const B = out.barras, F = B.apiladas;
    return `<table><thead><tr><th>${esc(res.cfg.cruce ? CRUCE_DE[res.cfg.cruce] : '')}</th>${B.cats.map(c => `<th>${esc(B.nomCat(c))}</th>`).join('')}<th>Resto</th><th>Base (n)</th></tr></thead><tbody>${F.map(r => `<tr><td>${esc(r.label)}</td>${r.segs.map(d => `<td>${r.ok ? fmt1(d.v) : 'n < 50'}</td>`).join('')}<td>${fmtInt(r.n)}</td></tr>`).join('')}</tbody></table>`;
  }
  if (out.barras) {
    const B = out.barras;
    const val = (g, c) => { const x = B.celdas.find(d => d.gid === g && d.cid === c); return x.v != null ? f(x.v) : x.omit ? 'n < 50' : '—'; };
    const nG = g => { const x = B.celdas.find(d => d.gid === g); return x ? fmtInt(x.n || 0) : ''; };
    return `<table><thead><tr><th>${esc(res.cfg.cruce ? CRUCE_DE[res.cfg.cruce] : '')}</th>${B.cats.map(c => `<th>${esc(B.nomCat(c))}</th>`).join('')}${media ? '' : '<th>Base (n)</th>'}</tr></thead><tbody>${B.grupos.map(g => `<tr><td>${esc(B.nomGrupo(g))}</td>${B.cats.map(c => `<td>${val(g, c)}</td>`).join('')}${media ? '' : `<td>${nG(g)}</td>`}</tr>`).join('')}</tbody></table>`;
  }
  const head = `<tr><th>Mes</th>${out.ser.map(s => `<th>${esc(s.label)}</th>`).join('')}${!res.cfg.cruce && !media ? '<th>Base (n)</th>' : ''}</tr>`;
  const rows = res.filas.map((fl, i) => `<tr><td>${esc(mesCorto(fl.e.mes))}</td>${out.ser.map(s => `<td>${s.pts[i].v != null ? f(s.pts[i].v) : s.pts[i].omit ? 'n < 50' : '—'}</td>`).join('')}${!res.cfg.cruce && !media ? `<td>${fmtInt(out.ser[0].pts[i].n || 0)}</td>` : ''}</tr>`).reverse();
  return `<table><thead>${head}</thead><tbody>${rows.join('')}</tbody></table>`;
}

function descargar(nombre, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
/* Rupturas que explican las marcas R del panel, para el CSV y el PNG */
function rupturasPanel(el) {
  const r = el._res; if (!r) return [];
  if (r.out && r.out.rup) return [...new Map(r.out.rup.map(x => [x.ruptura_id, x])).values()]
    .map(x => `${x.ruptura_id} (${mesCorto(x.m)}, tipo ${x.tipo}): ${breveRuptura(x.descripcion)}`);
  if (r.generico && r.cfg.tipo === 'calor') return r.generico.notas;
  return [];
}
function exportarCSV(el) {
  if (!el._res) return;
  // entre comillas; si empieza por =, +, - o @, con un apóstrofo delante para que la hoja de cálculo no lo ejecute
  const q = s => { let t = String(s); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
  const notasR = rupturasPanel(el).map(q);
  const titulo = el.querySelector('h2').textContent, metaT = el.querySelector('.meta').textContent;
  if (el._res.generico) {
    const G = el._res.generico.csv;
    const cel = v => v == null || (typeof v === 'number' && !isFinite(v)) ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : typeof v === 'boolean' ? (v ? 'sí' : 'no') : q(v);
    const lines = [G.cab.join(','), ...G.filas.map(f => f.map(cel).join(',')), '', q(`${titulo}. ${metaT}`), ...notasR, q('Fuente: CIS, barómetros mensuales (microdatos). Elaboración: Barómetro a barómetro.')];
    return descargar(slug(titulo) + '.csv', new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  }
  const { out, res, cfg } = el._res;
  const num = v => v != null ? v.toFixed(3) : '';
  let lines;
  if (out.barras && out.barras.apiladas) {
    const B = out.barras, e = res.filas[0].e;
    lines = [['mes', 'estudio', 'grupo', 'respuesta', 'valor', 'margen_inferior', 'margen_superior', 'n_base'].join(',')];
    B.apiladas.forEach(r => r.segs.forEach(d => lines.push([e.mes, e.estudio, q(r.label), q(d.cid === '__resto' ? 'Resto de respuestas' : B.nomCat(d.cid)), r.ok ? num(d.v) : '', num(d.lo), num(d.hi), r.n].join(','))));
  } else if (out.barras) {
    const B = out.barras, e = res.filas[0].e;
    lines = [['mes', 'estudio', 'grupo', 'respuesta', 'valor', 'margen_inferior', 'margen_superior', 'n_base'].join(',')];
    B.celdas.forEach(c => lines.push([e.mes, e.estudio, q(B.nomGrupo(c.gid)), q(B.nomCat(c.cid)), num(c.v), num(c.lo), num(c.hi), c.n ?? ''].join(',')));
  } else {
    lines = [['mes', 'estudio', 'serie', 'valor', 'margen_inferior', 'margen_superior', 'n_base'].join(',')];
    out.ser.forEach(s => s.pts.forEach((p, i) => lines.push([res.filas[i].e.mes, res.filas[i].e.estudio, q(s.label), num(p.v), num(p.lo), num(p.hi), p.n ?? ''].join(','))));
  }
  lines.push('', q(`${tituloPanel(cfg, res)}. ${metaPanel(cfg, res)}`), ...notasR, q('Fuente: CIS, barómetros mensuales (microdatos). Elaboración: Barómetro a barómetro.'));
  descargar(slug(tituloPanel(cfg, res)) + '.csv', new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
}
/* PNG del panel a doble resolución: el gráfico (SVG, o el lienzo de una vista en canvas, redibujado a esa escala)
   con título, metadatos y fuente */
function exportarPNG(el) {
  if (!el._res) return;
  const svg = el.querySelector('.chart svg'), lienzo = el._res.generico?.lienzo, canvas = el.querySelector('.chart canvas');
  if (!svg && !(lienzo && canvas)) return;
  const titulo = el.querySelector('h2').textContent, metaT = el.querySelector('.meta').textContent;
  const W = svg ? +svg.getAttribute('width') : parseFloat(canvas.style.width), H = svg ? +svg.getAttribute('height') : parseFloat(canvas.style.height);
  const fuente = 'Fuente: CIS, barómetros mensuales (microdatos). Elaboración: Barómetro a barómetro.';
  const fT = `600 16px ${PAL.fontD}`, fM = `12px ${PAL.font}`;
  // título, metadatos y fuente parten línea si no caben en el ancho del gráfico
  const medir = document.createElement('canvas').getContext('2d');
  const partir = (txt, font) => {
    medir.font = font;
    return txt.split(' ').reduce((ls, w) => {
      const prueba = ls.length ? ls[ls.length - 1] + ' ' + w : w;
      if (ls.length && medir.measureText(prueba).width <= W - 16) ls[ls.length - 1] = prueba; else ls.push(w);
      return ls;
    }, []);
  };
  const lT = partir(titulo, fT), lM = partir(metaT, fM);
  // al pie, qué es cada marca R del gráfico (solo las que se dibujan)
  const rupt = el._res.cfg.sinRupturas ? [] : rupturasPanel(el);
  const lF = [...rupt.flatMap(t => partir(t, fM)), ...partir(fuente, fM)];
  const s = 2, top = 14 + lT.length * 20 + lM.length * 16 + 8, bot = lF.length * 16 + 18;
  const cv = document.createElement('canvas'); cv.width = W * s; cv.height = (H + top + bot) * s;
  const ctx = cv.getContext('2d'); ctx.scale(s, s);
  ctx.fillStyle = PAL.surface; ctx.fillRect(0, 0, W, H + top + bot);
  ctx.fillStyle = PAL.ink; ctx.font = fT; lT.forEach((l, i) => ctx.fillText(l, 8, 22 + i * 20));
  ctx.fillStyle = PAL.ink3; ctx.font = fM; lM.forEach((l, i) => ctx.fillText(l, 8, 22 + lT.length * 20 + i * 16));
  lF.forEach((l, i) => ctx.fillText(l, 8, H + top + 20 + i * 16));
  const pegar = img => { ctx.drawImage(img, 0, top, W, H); cv.toBlob(b => descargar(slug(titulo) + '.png', b)); };
  if (!svg) return pegar(lienzo(s));
  const img = new Image();
  img.onload = () => pegar(img);
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}
/* Banner de una vista que lo ofrece (puntos): 1584 × 396 a doble resolución, con título y fuente dentro */
async function exportarBanner(el) {
  const g = el._res?.generico;
  if (!g || !g.banner) return;
  const titulo = el.querySelector('h2').textContent;
  try { descargar(slug(titulo) + '_banner.png', await g.banner(2)); }
  catch (e) { el.querySelector('.notas').insertAdjacentHTML('beforeend', `<p class="note">No se ha podido generar el banner: ${esc(e.message)}</p>`); }
}

const grid = $('#grid');
/* Cada panel se calcula y se dibuja cuando se acerca a la pantalla: en el móvil no se descargan las columnas de
   paneles que nadie llega a ver. Sin IntersectionObserver, se pintan todos. */
let IO_PANELES = null;
function pintarPanel(el) {
  el.classList.remove('pendiente'); el._pintado = true;
  const cfg = PANELES.find(p => p.id === el.dataset.id);
  if (cfg) renderPanel(el, cfg).then(() => {
    const t = el.querySelector('h2').textContent, q = el.querySelector('[data-a=del]');
    if (q && t) q.setAttribute('aria-label', 'Quitar el panel «' + t + '»');
  });
}
/* Quitar un panel se puede deshacer durante unos segundos */
let DESHACER = null;
function avisoDeshacer(cfg, i) {
  let bar = $('#deshacer');
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'deshacer'; bar.className = 'deshacer'; bar.setAttribute('role', 'status');
    document.body.appendChild(bar);
  }
  bar.innerHTML = 'Panel quitado. <button class="btn" type="button">Deshacer</button>';
  bar.hidden = false;
  clearTimeout(DESHACER);
  bar.querySelector('button').addEventListener('click', () => {
    PANELES.splice(Math.min(i, PANELES.length), 0, cfg); guardar(); renderTodo(); bar.hidden = true; clearTimeout(DESHACER);
  });
  DESHACER = setTimeout(() => { bar.hidden = true; }, 8000);
}
function renderTodo() {
  if (IO_PANELES) IO_PANELES.disconnect();
  grid.innerHTML = '';
  if (!PANELES.length) { grid.innerHTML = '<p class="empty">No hay paneles. Usa «Nuevo panel» para añadir uno.</p>'; return; }
  IO_PANELES = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    IO_PANELES.unobserve(e.target); pintarPanel(e.target);
  }), { rootMargin: '600px 0px' }) : null;
  PANELES.forEach(cfg => {
    const el = panelEl(cfg); el.classList.add('pendiente'); grid.appendChild(el);
    if (IO_PANELES) IO_PANELES.observe(el); else pintarPanel(el);
  });
}
function rerender() {
  leerPaleta();
  grid.querySelectorAll('.panel').forEach(el => { if (el._pintado) pintarPanel(el); });
  if (typeof repintarGuia === 'function') repintarGuia();
}

/* ================= estado ================= */
const limpio = p => { const { id, ...r } = p; return r; };
function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(PANELES.map(limpio))); } catch (e) { /* sin almacenamiento */ }
  // tras un cambio manda lo guardado: un enlace #p= en la dirección lo taparía al recargar
  if (location.hash.startsWith('#p=')) history.replaceState(null, '', location.pathname + '#series');
}
const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
const presetDeHash = () => { const h = location.hash.slice(1); return PRESETS[h] ? h : null; };
function cargarPaneles() {
  let ps = null;
  if (location.hash.startsWith('#p=')) { try { ps = JSON.parse(b64d(location.hash.slice(3))); } catch (e) { ps = null; } }
  if (presetDeHash()) ps = resolver(PRESETS[presetDeHash()]);
  if (!ps) { try { ps = JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch (e) { ps = null; } }
  if (!Array.isArray(ps) || !ps.length) ps = defecto();
  PANELES = ps.filter(p => VISTAS[p.tipo] || preg(p.preg)).map(p => ({ ...p, id: nuevoId() }));
}
// paneles de partida; las categorías indicadas por etiqueta se traducen a identificadores
function resolver(lista) {
  const porEtq = (concepto, et) => Object.entries(LAB[concepto] || {}).find(([, e]) => e === et)?.[0];
  return lista.map(p => {
    const { catsEtq, cat1Etq, yEtq, indEtq, ...r } = p;
    if (catsEtq) r.cats = catsEtq.map(e => porEtq(preg(p.preg).cols[0], e)).filter(Boolean);
    if (cat1Etq) r.cat1 = porEtq(preg(p.preg).cols[0], cat1Etq);
    if (yEtq) r.y = { preg: yEtq[0], cat: porEtq(preg(yEtq[0]).cols[0], yEtq[1]) };
    if (indEtq) r.ind = { preg: indEtq[0], cat: porEtq(preg(indEtq[0]).cols[0], indEtq[1]) };
    return r;
  });
}
function defecto() {
  return resolver(META.veda ? DEFECTO_VEDA : esMovil() ? DEFECTO_MOVIL : DEFECTO);
}

/* ================= editor ================= */
const ed = $('#ed'), edb = $('#ed-body');
let BORRADOR = null, EDITANDO = null;
// orden de las respuestas y grupos por defecto del panel en edición: «Aplicar» lo conserva
let ORDEN_DEF = { cats: [], gcats: [] };
const opcionesMes = sel => EST.map(e => `<option value="${e.mes}"${e.mes === sel ? ' selected' : ''}>${esc(mesCorto(e.mes))}</option>`).join('');

function abrirEditor(cfg) {
  EDITANDO = cfg ? cfg.id : null;
  BORRADOR = structuredClone(cfg ? limpio(cfg) : { preg: 'intencion_voto_r' });
  $('#ed-t').textContent = cfg ? 'Configurar panel' : 'Nuevo panel';
  $('#ed-err').textContent = '';
  pintarEditor();
  ed.showModal();
}
const TIPOS = [
  ['lineas', 'Evolución mensual (líneas)'], ['barras', 'Un barómetro (barras)'], ['comparar', 'Comparar dos barómetros'],
  ['calor', 'Mapa de calor: meses × respuestas'], ['transferencias', 'Transferencias de voto'],
  ['dispersion', 'Dispersión de grupos'], ['mapa', 'Mapa por comunidades'], ['puntos', 'Cada punto, una entrevista'],
];
const GRUPOS_DISP = [['voto_simpatia', 'Voto + simpatía (electorados)'], ['intencion_voto_r', 'Intención directa de voto'], ['recuerdo_voto', 'Recuerdo de voto'],
  ...CRUCES.filter(([k]) => !['voto_simpatia', 'intencion_voto_r', 'recuerdo_voto'].includes(k)), ['provincia', 'Provincia']];
const ACUM = [1, 3, 6, 12];
// valores por defecto al cambiar de tipo
function ajustarTipo(b) {
  const t = b.tipo || 'lineas';
  if (['transferencias', 'dispersion', 'mapa'].includes(t)) b.bloques = null;
  if (t === 'transferencias') { if (!PARTIDISTAS.includes(b.preg)) b.preg = 'intencion_voto_r'; b.acum = b.acum || 3; b.cruce = null; }
  if (t === 'calor') { const P = preg(b.preg); if (!P || !['cat', 'multi'].includes(P.tipo)) b.preg = 'prob_esp'; b.cruce = null; }
  if (t === 'comparar') b.cruce = null;
  if (t === 'dispersion') { b.grupo = b.grupo || 'voto_simpatia'; b.x = b.x || { preg: 'ideologia' }; b.y = b.y || { preg: 'prob_esp', cat: vivienda() }; b.acum = b.acum || 3; }
  if (t === 'mapa') { b.ind = b.ind || { preg: 'prob_esp', cat: vivienda() }; b.acum = b.acum || 6; }
  // puntos: solo bloques de problemas, sin cruce ni filtro, y a todo el ancho salvo que se diga lo contrario
  if (t === 'puntos') { if (!BLOQUES_PUNTOS.includes(b.preg)) b.preg = 'prob_per'; b.cruce = null; b.filtro = null; b.bloques = null; b.eje = b.eje === 'ideologia' ? 'ideologia' : 'edad'; if (b.ancho == null) b.ancho = true; }
}
function selectorIndicador(pref, ind, titulo) {
  const grupos = [...new Set(PREG.map(p => p.g))];
  const opts = grupos.map(g => `<optgroup label="${esc(g)}">${PREG.filter(p => p.g === g && disponible(preg(p.id))).map(p => `<option value="${p.id}"${p.id === ind.preg ? ' selected' : ''}>${esc(p.t)}</option>`).join('')}</optgroup>`).join('');
  const P = preg(ind.preg);
  let cats = '';
  if (P && P.tipo === 'medias') cats = P.cols.map(id => `<option value="${id}"${id === ind.cat ? ' selected' : ''}>${esc(etiqueta(id, id))}</option>`).join('');
  else if (P && P.tipo !== 'media') cats = (META.conceptos[P.cols[0]]?.categorias || []).filter(c => c.id !== 'NP').map(c => `<option value="${esc(c.id)}"${c.id === ind.cat ? ' selected' : ''}>${esc(c.etiqueta.replace(/^\(NO LEER\)\s*/i, ''))}</option>`).join('');
  return `<div class="fld full"><label for="f-${pref}-preg">${esc(titulo)}</label><div class="row"><select id="f-${pref}-preg">${opts}</select>${cats ? `<select id="f-${pref}-cat" aria-label="Respuesta">${cats}</select>` : ''}</div></div>`;
}
async function pintarEditor() {
  const b = BORRADOR;
  ORDEN_DEF = { cats: [], gcats: [] };
  const tipo = b.tipo || 'lineas';
  if (tipo === 'puntos') ajustarTipo(b);   // un panel de puntos puede venir sin pregunta ni eje: valores por defecto
  const ultMes = EST[EST.length - 1].mes;
  const grupos = [...new Set(PREG.map(p => p.g))];
  const filtroPreg = p => tipo === 'transferencias' ? PARTIDISTAS.includes(p.id) : tipo === 'calor' ? ['cat', 'multi'].includes(preg(p.id).tipo) : tipo === 'puntos' ? BLOQUES_PUNTOS.includes(p.id) : true;
  const optPreg = grupos.map(g => { const ps = PREG.filter(p => p.g === g && disponible(preg(p.id)) && filtroPreg(p)); return ps.length ? `<optgroup label="${esc(g)}">${ps.map(p => `<option value="${p.id}"${p.id === b.preg ? ' selected' : ''}>${esc(p.t)}</option>`).join('')}</optgroup>` : ''; }).join('');
  const optCruce = `<option value="">Sin cruce</option>` + CRUCES.filter(([k]) => META.columnas[k] && k !== b.preg).map(([k, t]) => `<option value="${k}"${k === b.cruce ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const optFiltro = `<option value="">Sin filtro</option>` + FILTROS.filter(([k]) => META.columnas[k]).map(([k, t]) => `<option value="${k}"${b.filtro && k === b.filtro.col ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const valFiltro = b.filtro ? nivelesDe(b.filtro.col).filter(id => id !== 'NP').map(id => `<option value="${esc(id)}"${id === b.filtro.val ? ' selected' : ''}>${esc(etiqueta(b.filtro.col, id))}</option>`).join('') : '';
  const fPreg = `<div class="fld full"><label for="f-preg">Pregunta</label><select id="f-preg">${optPreg}</select></div>`;
  const fCruce = `<div class="fld"><label for="f-cruce">Cruzar por</label><select id="f-cruce">${optCruce}</select><span class="hint">${tipo === 'barras' ? 'Con cruce, un grupo de barras por categoría; apiladas al 100 % si hay cinco o más respuestas (las no marcadas van a «Resto»). En problemas y medias, siempre agrupadas.' : 'Cada línea es un grupo y se elige una sola respuesta.'}</span></div>`;
  const fFiltro = `<div class="fld"><label for="f-filtro">Filtrar por</label><div class="row"><select id="f-filtro">${optFiltro}</select><select id="f-fval" ${b.filtro ? '' : 'hidden'} aria-label="Valor del filtro">${valFiltro}</select></div></div>`;
  const fPeriodo = `<div class="fld"><label for="f-desde">Desde</label><select id="f-desde">${opcionesMes(b.desde || EST[0].mes)}</select></div><div class="fld"><label for="f-hasta">Hasta</label><select id="f-hasta">${opcionesMes(b.hasta || ultMes)}</select></div>`;
  const fMes = (id, lab, val) => `<div class="fld"><label for="${id}">${lab}</label><select id="${id}">${opcionesMes(val || ultMes)}</select></div>`;
  const fAcum = `<div class="fld"><label for="f-acum">Barómetros acumulados</label><select id="f-acum">${ACUM.map(k => `<option value="${k}"${k === (b.acum || (tipo === 'mapa' ? 6 : 3)) ? ' selected' : ''}>${k === 1 ? 'Solo ese barómetro' : `Los ${k} últimos`}</option>`).join('')}</select><span class="hint">Más barómetros, más muestra; no se acumula a través de una ruptura C.</span></div>`;
  const chk = (id, lab, v) => `<label class="row"><input type="checkbox" id="${id}"${v ? ' checked' : ''}> ${lab}</label>`;
  const opExNR = chk('f-exnr', 'Excluir de la base «no sabe», «no contesta» y «no recuerda»', b.exNR);
  const opBanda = chk('f-banda', tipo === 'dispersion' ? 'Mostrar el margen de error en los dos ejes' : 'Mostrar el margen de error', b.banda ?? (tipo === 'lineas' && !b.cruce));
  const opMovil = chk('f-movil', 'Media móvil centrada de 3 barómetros: cada punto resume ese barómetro, el anterior y el siguiente (suaviza los cruces con poca muestra)', b.movil);
  const opRec = META.columnas.peso_recuerdo ? chk('f-recuerdo', 'Reponderar por recuerdo de voto (estimación propia: no coincide con el CIS)', b.recuerdo) : '';
  const opAncho = chk('f-ancho', 'Panel a todo el ancho', b.ancho);
  const fApilar = tipo === 'barras' && preg(b.preg)?.tipo === 'cat' ? `<div class="fld"><label for="f-apilar">Disposición</label><select id="f-apilar">${[['', 'Automática: apiladas con cruce y cinco o más respuestas'], ['agrupadas', 'Barras agrupadas'], ['apiladas', 'Barras apiladas al 100 %']].map(([k, t]) => `<option value="${k}"${(b.apilar || '') === k ? ' selected' : ''}>${t}</option>`).join('')}</select></div>` : '<div class="fld"></div>';
  const lista = `<div class="fld full" id="f-cats"><span class="lab">Respuestas</span><p class="hint">Calculando…</p></div>`;
  const fEje = `<div class="fld"><label for="f-eje">En vertical</label><select id="f-eje"><option value="edad"${b.eje !== 'ideologia' ? ' selected' : ''}>Edad</option><option value="ideologia"${b.eje === 'ideologia' ? ' selected' : ''}>Autoubicación ideológica (1 a 10)</option></select><span class="hint">En horizontal, el mes; cada punto cae al azar dentro del suyo.</span></div>`;
  const secciones = {
    lineas: () => fPreg + fCruce + fFiltro + fPeriodo + lista + `<div class="fld full"><span class="lab">Opciones</span>${opExNR}${opBanda}${opMovil}${opRec}${opAncho}</div>`,
    barras: () => fPreg + fCruce + fFiltro + fMes('f-mes', 'Barómetro', b.mes) + fApilar + lista + `<div class="fld full"><span class="lab">Opciones</span>${opExNR}${opBanda}${opRec}${opAncho}</div>`,
    comparar: () => fPreg + fFiltro + '<div class="fld"></div>' + fMes('f-mesA', 'Barómetro inicial', mesInicialComparar(b)) + fMes('f-mesB', 'Barómetro final', b.mesB) + lista + `<div class="fld full"><span class="lab">Opciones</span>${opExNR}${opBanda}${opRec}${opAncho}</div>`,
    calor: () => fPreg + fFiltro + '<div class="fld"></div>' + fPeriodo + lista + `<div class="fld full"><span class="lab">Opciones</span>${opExNR}${opRec}${opAncho}</div>`,
    transferencias: () => fPreg + fFiltro + '<div class="fld"></div>' + fMes('f-mes', 'Último barómetro', b.mes) + fAcum + lista + `<div class="fld full"><span class="lab">Opciones</span>${opExNR}${opAncho}</div>`,
    dispersion: () => `<div class="fld full"><label for="f-grupo">Cada punto es un grupo de</label><select id="f-grupo">${GRUPOS_DISP.filter(([k]) => META.columnas[k]).map(([k, t]) => `<option value="${k}"${k === b.grupo ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>` +
      selectorIndicador('x', b.x, 'Eje horizontal') + selectorIndicador('y', b.y, 'Eje vertical') + fFiltro + '<div class="fld"></div>' + fMes('f-mes', 'Último barómetro', b.mes) + fAcum + lista + `<div class="fld full"><span class="lab">Opciones</span>${opBanda}${opRec}${opAncho}</div>`,
    mapa: () => selectorIndicador('i', b.ind, 'Indicador') + fFiltro + '<div class="fld"></div>' + fMes('f-mes', 'Último barómetro', b.mes) + fAcum + `<div class="fld full"><span class="lab">Opciones</span>${opExNR}${opRec}${opAncho}</div>`,
    puntos: () => fPreg + fEje + '<div class="fld"></div>' + fPeriodo + lista + `<div class="fld full"><span class="lab">Opciones</span>${opAncho}</div>`,
  };
  edb.innerHTML = `<div class="fld full"><label for="f-tipo">Tipo de gráfico</label><select id="f-tipo">${TIPOS.map(([k, t]) => `<option value="${k}"${k === tipo ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>` + secciones[tipo]();
  const val = id => $('#' + id)?.value;
  const leer = () => {
    b.tipo = val('f-tipo') === 'lineas' ? undefined : val('f-tipo');
    if ($('#f-preg')) b.preg = val('f-preg');
    b.cruce = $('#f-cruce') ? (val('f-cruce') || null) : null;
    const fc = val('f-filtro');
    b.filtro = fc ? { col: fc, val: (b.filtro && b.filtro.col === fc ? val('f-fval') : null) || nivelesDe(fc).find(id => !NR.has(id)) } : null;
    if ($('#f-desde')) { b.desde = val('f-desde') === EST[0].mes ? null : val('f-desde'); b.hasta = val('f-hasta') === ultMes ? null : val('f-hasta'); }
    if ($('#f-mes')) b.mes = val('f-mes') === ultMes ? null : val('f-mes');
    if ($('#f-mesA')) { b.mesA = val('f-mesA'); b.mesB = val('f-mesB') === ultMes ? null : val('f-mesB'); }
    if ($('#f-acum')) b.acum = +val('f-acum');
    if ($('#f-apilar')) b.apilar = val('f-apilar') || null;
    if ($('#f-grupo')) b.grupo = val('f-grupo');
    if ($('#f-eje')) b.eje = val('f-eje');
    if ($('#f-catA')) b.cats = [val('f-catA'), val('f-catB')];
    [['x', 'x'], ['y', 'y'], ['i', 'ind']].forEach(([p, k]) => { if ($(`#f-${p}-preg`)) b[k] = { preg: val(`f-${p}-preg`), cat: val(`f-${p}-cat`) || null }; });
    b.exNR = !!$('#f-exnr')?.checked; b.ancho = !!$('#f-ancho')?.checked;
    if ($('#f-banda')) b.banda = $('#f-banda').checked;
    if ($('#f-movil')) b.movil = $('#f-movil').checked;
    b.recuerdo = !!$('#f-recuerdo')?.checked && b.tipo !== 'transferencias';
  };
  edb.querySelectorAll('select, #f-exnr, #f-movil, #f-recuerdo').forEach(elx => elx.addEventListener('change', ev => {
    const antes = { tipo: b.tipo, preg: b.preg, cruce: b.cruce, grupo: b.grupo, x: b.x?.preg, y: b.y?.preg, i: b.ind?.preg };
    leer();
    if (b.tipo !== antes.tipo) { b.banda = undefined; ajustarTipo(b); b.cats = null; b.gcats = null; }
    if (b.preg !== antes.preg) { b.cats = null; b.cat1 = null; b.bloques = null; if (b.cruce === b.preg) b.cruce = null; }
    if (b.cruce !== antes.cruce || b.grupo !== antes.grupo) b.gcats = null;
    if (b.x && antes.x && b.x.preg !== antes.x) b.x.cat = null;
    if (b.y && antes.y && b.y.preg !== antes.y) b.y.cat = null;
    if (b.ind && antes.i && b.ind.preg !== antes.i) b.ind.cat = null;
    if (ev.target.id === 'f-ancho' || ev.target.id === 'f-banda') return;
    pintarEditor();
  }));
  edb.querySelectorAll('#f-ancho, #f-banda').forEach(elx => elx.addEventListener('change', leer));
  if (tipo === 'mapa') return;
  // listas de respuestas y grupos con su valor de referencia
  const box = $('#f-cats');
  try {
    const listaChk = (idc, items, sel, valor) => `<div class="chks" id="${idc}">${items.map(id => `<label><input type="checkbox" value="${esc(id.id)}"${sel.has(id.id) ? ' checked' : ''}> ${esc(id.nom)}<span class="v">${valor ? valor(id.id) : ''}</span></label>`).join('')}</div>`;
    const buscador = `<input type="search" id="f-buscar" placeholder="Buscar" aria-label="Buscar respuesta">`;
    if (tipo === 'dispersion') {
      const D = await datosDispersion(b);
      if (BORRADOR !== b) return;
      ORDEN_DEF.gcats = D.defecto;
      const sel = new Set(b.gcats && b.gcats.length ? b.gcats : D.defecto);
      box.innerHTML = `<span class="lab">Grupos (hasta ${MAX_SERIES})</span>` + listaChk('chk-grupos', D.cand.map(id => ({ id, nom: etiqueta(D.grupo, id) })), sel, id => 'n = ' + fmtInt(D.nOf(id)));
      return;
    }
    const mesRef = tipo === 'barras' || tipo === 'transferencias' ? (b.mes || ultMes) : tipo === 'comparar' ? (b.mesB || ultMes) : null;
    const base = { ...b, cruce: tipo === 'lineas' || tipo === 'barras' ? b.cruce : null, cats: null, gcats: null, movil: false, ...(mesRef ? { desde: mesRef, hasta: mesRef } : {}) };
    const res = await calcular(base);
    if (BORRADOR !== b) return;
    const P = res.P, media = res.unidad === 'media';
    const conc = P.cols[0];
    const fmtv = v => v == null ? '' : media ? fmt2(v) : fmt1(v) + ' %';
    const resTot = base.cruce ? await calcular({ ...base, cruce: null }) : res;
    if (BORRADOR !== b) return;
    const ref = tipo === 'calor' ? id => d3.mean(resTot.filas, f => f.grupos[0].vals[id] ?? null) : id => ultimoCon(resTot, 0, id);
    const orden = res.ids.filter(id => ref(id) != null || media).sort((a, z) => (NR.has(a) - NR.has(z)) || ((ref(z) ?? -1) - (ref(a) ?? -1)));
    const nom = id => nombreResp(P, id);
    const maxC = tipo === 'calor' ? 20 : MAX_SERIES;
    // mismas respuestas por defecto que la vista: «Aplicar» sin tocar nada no cambia el panel
    const tt = tipo === 'transferencias' ? await calcularPeriodo({ preg: b.preg, filtro: b.filtro, exNR: b.exNR }, b.mes, b.acum || 3) : null;
    if (BORRADOR !== b) return;
    const defCats = tipo === 'calor' ? orden.filter(id => !NR.has(id)).slice(0, 15)
      : tipo === 'comparar' ? defectoComparar(resTot, resTot.filas[resTot.filas.length - 1])
      : tipo === 'transferencias' ? colsDefectoTransf(res.ids.filter(id => id !== 'NP'), id => acumular(tt.res, tt.idxs, 0, id).v ?? 0)
      : catsDefecto(resTot);
    ORDEN_DEF.cats = defCats;
    const hintRef = tipo === 'calor' ? 'la media del periodo' : mesRef ? `el valor en ${mesLargo(mesRef)}` : 'el último valor disponible';
    if (tipo === 'puntos') {
      // dos respuestas del bloque, cada una en un selector; la configuración saneada aporta las de por defecto
      const cp = cfgPuntos(b);
      const opts = sel => orden.filter(id => !NR.has(id)).map(id => `<option value="${esc(id)}"${id === sel ? ' selected' : ''}>${esc(nom(id))}${ref(id) != null ? ' (' + fmtv(ref(id)) + ')' : ''}</option>`).join('');
      box.innerHTML = `<span class="lab">Dos respuestas a resaltar</span><div class="row"><select id="f-catA" aria-label="Primera respuesta">${opts(cp.cats[0])}</select><select id="f-catB" aria-label="Segunda respuesta">${opts(cp.cats[1])}</select></div>` +
        `<span class="hint">Entre paréntesis, ${hintRef} de la serie ponderada. Quien cita las dos se dibuja en un tercer color. Los puntos no se ponderan: no es una estimación.</span>`;
      return;
    }
    if (tipo === 'lineas' && b.cruce) {
      const c1 = b.cat1 && res.ids.includes(b.cat1) ? b.cat1 : catsDefecto(res)[0];
      ORDEN_DEF.gcats = gruposDefecto(res);
      box.innerHTML = `<span class="lab">Respuesta</span><select id="f-cat1" aria-label="Respuesta">${orden.map(id => `<option value="${esc(id)}"${id === c1 ? ' selected' : ''}>${esc(nom(id))}${ref(id) != null ? ' (' + fmtv(ref(id)) + ')' : ''}</option>`).join('')}</select>` +
        `<span class="lab" style="margin-top:8px">Grupos de ${esc(CRUCE_DE[b.cruce].toLowerCase())} (hasta ${MAX_SERIES})</span>` +
        listaChk('chk-grupos', ordenMeta(b.cruce, res.glev.filter(id => id !== 'NP')).map(id => ({ id, nom: etiqueta(b.cruce, id) })), new Set(b.gcats && b.gcats.length ? b.gcats : gruposDefecto(res)));
    } else {
      const sel = new Set(b.cats && b.cats.length ? b.cats : defCats);
      let html = `<span class="lab">${tipo === 'transferencias' ? 'Columnas: respuestas' : 'Respuestas'} (hasta ${maxC})</span>${buscador}` +
        listaChk('chk-cats', orden.map(id => ({ id, nom: nom(id) })), sel, id => fmtv(ref(id))) + `<span class="hint">A la derecha, ${hintRef}.</span>`;
      if (tipo === 'barras' && b.cruce) ORDEN_DEF.gcats = gruposDefecto(res);
      if (tipo === 'barras' && b.cruce) html += `<span class="lab" style="margin-top:8px">Grupos de ${esc(CRUCE_DE[b.cruce].toLowerCase())} (hasta ${MAX_SERIES})</span>` +
        listaChk('chk-grupos', ordenMeta(b.cruce, res.glev.filter(id => id !== 'NP')).map(id => ({ id, nom: etiqueta(b.cruce, id) })), new Set(b.gcats && b.gcats.length ? b.gcats : gruposDefecto(res)));
      if (tipo === 'transferencias') {
        const rt = await calcularPeriodo({ preg: b.preg, cruce: 'recuerdo_voto', filtro: b.filtro, exNR: b.exNR }, b.mes, b.acum || 3);
        if (BORRADOR !== b) return;
        const c0 = (b.cats && b.cats.length ? b.cats : defCats)[0];
        const nR = gid => acumular(rt.res, rt.idxs, rt.res.glev.indexOf(gid), c0).n || 0;
        const cand = rt.res.glev.filter(id => id !== 'NP' && !NR.has(id)).sort((a, z) => nR(z) - nR(a));
        ORDEN_DEF.gcats = filasDefectoTransf(cand, nR);
        html += `<span class="lab" style="margin-top:8px">Filas: recuerdo de voto (hasta ${MAX_SERIES})</span>` +
          listaChk('chk-grupos', cand.map(id => ({ id, nom: etiqueta('recuerdo_voto', id) })), new Set(b.gcats && b.gcats.length ? b.gcats : filasDefectoTransf(cand, nR)), id => 'n = ' + fmtInt(nR(id)));
      }
      box.innerHTML = html;
    }
    if (['cat', 'multi'].includes(P.tipo) && ['lineas', 'barras', 'comparar', 'calor'].includes(tipo)) pintarBloques(box, b, orden, nom, id => fmtv(ref(id)), listaChk);
    const busc = $('#f-buscar');
    if (busc) busc.addEventListener('input', () => {
      const q = slug(busc.value);
      box.querySelectorAll('#chk-cats label').forEach(l => { l.hidden = q && !slug(l.textContent).includes(q); });
    });
  } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
/* Bloques en el editor: se marcan respuestas, se les pone nombre y pasan a ser una respuesta más del panel */
const MAX_BLOQUES = 6;
function pintarBloques(box, b, orden, nom, valor, listaChk) {
  const bs = bloquesDe(b);
  const sust = orden.filter(id => !NR.has(id) && !esBloque(id));   // de mayor a menor, como la lista de respuestas
  const lista = bs.map((bl, i) => `<li><b>${esc(bl.nombre)}</b> = ${esc(bl.ids.map(nom).join(' + '))} <button class="ib" type="button" data-quitar="${i}">Quitar</button></li>`).join('');
  box.insertAdjacentHTML('beforeend', `<details class="bloques"${bs.length ? ' open' : ''}><summary>Agrupar respuestas en bloques${bs.length ? ` (${bs.length})` : ''}</summary>
    <p class="hint">Un bloque suma varias respuestas (por ejemplo, partidos) y se dibuja como una respuesta más. La composición la decides tú y figura en el panel, la tabla y las descargas. Las marcas cambian con el tiempo (Unidas Podemos hasta 2023; Sumar y Podemos después): incluye todas las que quieras sumar en cada periodo.</p>
    ${lista ? `<ul class="blq-lista">${lista}</ul>` : ''}
    ${bs.length < MAX_BLOQUES ? `<div class="row"><input type="text" id="f-blq-nom" maxlength="40" placeholder="Nombre del bloque" aria-label="Nombre del bloque"><button class="btn" type="button" id="f-blq-add">Crear bloque con las marcadas</button></div>
    ${listaChk('chk-bloque', sust.map(id => ({ id, nom: nom(id) })), new Set(), valor)}` : `<p class="hint">Máximo de ${MAX_BLOQUES} bloques por panel.</p>`}
  </details>`);
  const marcadas = sel => [...box.querySelectorAll(sel + ' input:checked')].map(i => i.value);
  // conserva lo marcado en el editor antes de volver a pintarlo
  const conservar = () => {
    if ($('#chk-cats')) b.cats = marcadas('#chk-cats');
    if ($('#chk-grupos')) b.gcats = marcadas('#chk-grupos');
    if ($('#f-cat1')) b.cat1 = $('#f-cat1').value;
  };
  box.querySelectorAll('[data-quitar]').forEach(bt => bt.addEventListener('click', () => {
    conservar();
    const [q] = b.bloques.splice(+bt.dataset.quitar, 1);
    const id = idBloque(q);
    if (b.cats) b.cats = b.cats.filter(x => x !== id);
    if (b.cat1 === id) b.cat1 = null;
    pintarEditor();
  }));
  $('#f-blq-add')?.addEventListener('click', () => {
    const nombre = $('#f-blq-nom').value.trim().replace(/\s+/g, ' ');
    const ids = sust.filter(id => marcadas('#chk-bloque').includes(id));
    const err = t => { $('#ed-err').textContent = t; };
    if (!nombre) return err('Ponle nombre al bloque.');
    if (ids.length < 2) return err('Marca al menos dos respuestas para el bloque.');
    if (bs.some(x => x.nombre.toLowerCase() === nombre.toLowerCase()) || sust.some(id => nom(id).toLowerCase() === nombre.toLowerCase())) return err('Ya hay una respuesta o un bloque con ese nombre.');
    err('');
    conservar();
    b.bloques = [...bs, { nombre, ids }];
    const id = idBloque({ nombre });
    if (b.cats) b.cats = [id, ...b.cats.filter(x => !ids.includes(x))];
    else b.cats = [id];
    if ($('#f-cat1')) b.cat1 = id;
    pintarEditor();
  });
}
$('#ed-ok').addEventListener('click', () => {
  const b = BORRADOR;
  const marc = sel => [...document.querySelectorAll(sel + ' input:checked')].map(i => i.value);
  // las ya elegidas (o las de por defecto) conservan su orden; las nuevas van detrás
  const ordenar = (m, prev) => [...prev.filter(id => m.includes(id)), ...m.filter(id => !prev.includes(id))];
  const cats = ordenar(marc('#chk-cats'), b.cats && b.cats.length ? b.cats : ORDEN_DEF.cats);
  const gcats = ordenar(marc('#chk-grupos'), b.gcats && b.gcats.length ? b.gcats : ORDEN_DEF.gcats);
  const err = t => { $('#ed-err').textContent = t; };
  const maxC = b.tipo === 'calor' ? 20 : MAX_SERIES;
  if (cats.length > maxC || gcats.length > MAX_SERIES) return err(`Marca como máximo ${maxC} respuestas y ${MAX_SERIES} grupos.`);
  if ($('#chk-cats') && !cats.length) return err('Marca al menos una respuesta.');
  if ($('#chk-grupos') && !gcats.length) return err('Marca al menos un grupo.');
  if (b.desde && b.hasta && b.desde > b.hasta) return err('El mes inicial es posterior al final.');
  if (b.tipo === 'barras' && preg(b.preg)?.tipo === 'cat' && sinSolapes(cats, b).length < cats.length)
    return err('En las barras apiladas cada respuesta cuenta una vez: no marques a la vez un bloque y alguna de sus respuestas.');
  if ($('#f-catA') && $('#f-catA').value === $('#f-catB').value) return err('Elige dos respuestas distintas.');
  b.cats = $('#chk-cats') ? cats : $('#f-catA') ? [$('#f-catA').value, $('#f-catB').value] : null;
  b.gcats = $('#chk-grupos') ? gcats : null;
  b.cat1 = $('#f-cat1')?.value || null;
  if (EDITANDO) { const i = PANELES.findIndex(p => p.id === EDITANDO); PANELES[i] = { ...b, id: EDITANDO }; }
  else PANELES.unshift({ ...b, id: nuevoId() });
  guardar(); ed.close(); renderTodo();
});

/* ================= nota metodológica ================= */
function pintarMetodologia() {
  const ultimo = EST[EST.length - 1], primero = EST[0];
  const nTot = META.filas;
  $('#m-cobertura').textContent = `Cobertura: ${EST.length} barómetros mensuales, de ${mesLargo(primero.mes)} a ${mesLargo(ultimo.mes)}, con ${fmtInt(nTot)} entrevistas en total.`;
  document.querySelectorAll('.cita-ult').forEach(x => { x.textContent = `${mesLargo(ultimo.mes)} (estudio ${ultimo.estudio})`; });
  const tipos = { C: 'C', B: 'B', tecnica: 'Técnica', 'tecnica-critica': 'Técnica', hueco: 'Hueco', descartada: 'Descartada' };
  $('#m-rupt-tabla').innerHTML = `<table><thead><tr><th>Ruptura</th><th>Mes</th><th>Tipo</th><th>Afecta a</th><th>Qué cambia</th><th>Estado</th></tr></thead><tbody>${META.rupturas.map(r => `<tr id="r-${esc(r.ruptura_id)}"><td>${esc(r.ruptura_id)}</td><td>${esc(r.mes)}</td><td><span class="tipo ${esc(r.tipo)}">${esc(tipos[r.tipo] || r.tipo)}</span></td><td>${esc(r.conceptos_afectados.replace(/,\s*/g, ', '))}</td><td>${esc(r.descripcion)}</td><td>${esc(r.estado)}</td></tr>`).join('')}</tbody></table>`;
  const titulo = id => PREG.find(p => p.id === id)?.t || (META.conceptos[id]?.etiqueta) || id;
  $('#m-preg-fichas').innerHTML = Object.entries(META.enunciados || {}).sort((a, z) => titulo(a[0]).localeCompare(titulo(z[0]), 'es')).map(([id, vs]) => `<div class="ficha"><h4>${esc(titulo(id))}</h4>${vs.map(v => `<p class="per">Versión ${esc(v.version)}: ${esc(mesCorto(v.desde))} a ${esc(mesCorto(v.hasta))}</p><p>${esc(v.enunciado.replace(/\s+\.$/, ''))}</p>`).join('')}</div>`).join('');
  $('#m-est-tabla').innerHTML = `<table><thead><tr><th>Mes</th><th>Estudio</th><th>Trabajo de campo</th><th>Entrevistas</th><th>Efecto de diseño</th></tr></thead><tbody>${META.estudios.map(e => `<tr><td>${esc(mesCorto(e.mes))}</td><td>${esc(e.estudio)}</td><td>${esc(e.fecha_campo_inicio)} a ${esc(e.fecha_campo_fin)}</td><td class="n">${fmtInt(+e.n)}</td><td class="n">${fmt2(+e.deff)}</td></tr>`).join('')}</tbody></table>`;
}

/* ================= qué cambia en el último barómetro ================= */
/* Compara el último barómetro con el anterior que hizo la misma pregunta. Con tantas comparaciones a la vez, el umbral
   es más exigente que el del panel «Comparar»: significativa al 99 % y de al menos un punto (una décima en las medias).
   No compara a través de una ruptura C. */
const RESUMEN = [
  { preg: 'intencion_voto_r', t: 'Intención directa de voto' },
  { preg: 'voto_simpatia', t: 'Voto + simpatía' },
  { preg: 'pref_presidente', t: 'Preferencia como presidente' },
  { preg: 'lideres', t: 'Valoración de líderes' },
  { preg: 'prob_esp', t: 'Principales problemas de España' },
  { preg: 'prob_per', t: 'Problemas que más le afectan' },
  { preg: 'eco_esp', t: 'Situación económica general' },
  { preg: 'eco_per', t: 'Situación económica personal' },
  { preg: 'ideologia', t: 'Autoubicación ideológica' },
];
const Q_FDR = 0.05, MIN_DIF = 1, MIN_DIF_MEDIA = 0.1, MIN_PCT_RESUMEN = 2, MAX_CAMBIOS = 4;
/* Función de distribución normal estándar (Abramowitz y Stegun 7.1.26; error < 1,5e-7) */
function phi(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? 0.5 + 0.5 * y : 0.5 - 0.5 * y;
}
const pBilateral = z => 2 * (1 - phi(Math.abs(z)));
/* Benjamini–Hochberg: el mayor p que cumple p(k) ≤ k·q/m; todo p menor o igual se declara significativo */
function umbralBH(ps, q = Q_FDR) {
  const o = ps.slice().sort((a, b) => a - b), m = o.length;
  let u = -1;
  for (let k = m; k >= 1; k--) if (o[k - 1] <= k * q / m) { u = o[k - 1]; break; }
  return u;
}
async function cambiosUltimo(spec) {
  const P = preg(spec.preg);
  if (!disponible(P)) return null;
  const res = await calcular({ preg: spec.preg, desde: EST[Math.max(0, EST.length - 6)].mes });
  const media = res.unidad === 'media';
  const con = res.filas.filter(f => media ? Object.keys(f.grupos[0].vals).length : f.grupos[0].n > 0);
  const ultimo = EST[EST.length - 1].mes;
  if (!con.length || con[con.length - 1].e.mes !== ultimo) return { ...spec, ausente: true };
  if (con.length < 2) return null;
  const fA = con[con.length - 2], fB = con[con.length - 1];
  const corte = rupturas({ preg: spec.preg }).find(r => r.tipo === 'C' && r.m > fA.e.mes && r.m <= fB.e.mes);
  const base = { ...spec, fA, fB, media, conc: P.cols[0] };
  if (corte) return { ...base, corte };
  const gA = fA.grupos[0], gB = fB.grupos[0], candidatos = [];
  for (const id of res.ids) {
    if (NR.has(id) && id !== 'NS') continue;
    const vA = gA.vals[id], vB = gB.vals[id];
    if (vA == null || vB == null) continue;            // respuesta que no se ofrecía en uno de los dos meses
    let se, d = vB - vA;
    if (media) {
      const nA = gA.ns[id], nB = gB.ns[id];
      if (nA < MIN_N || nB < MIN_N || Math.abs(d) < MIN_DIF_MEDIA) continue;
      se = Math.sqrt(kish(nA, gA.sw[id], gA.sw2?.[id]) * gA.sd[id] ** 2 / nA + kish(nB, gB.sw[id], gB.sw2?.[id]) * gB.sd[id] ** 2 / nB);
    } else {
      if (Math.max(vA, vB) < MIN_PCT_RESUMEN || Math.abs(d) < MIN_DIF) continue;
      const pA = vA / 100, pB = vB / 100;
      se = 100 * Math.sqrt(kish(gA.n, gA.base, gA.base2) * pA * (1 - pA) / gA.n + kish(gB.n, gB.base, gB.base2) * pB * (1 - pB) / gB.n);
    }
    if (se > 0) candidatos.push({ id, vA, vB, d, p: pBilateral(d / se) });
  }
  return { ...base, candidatos };
}
/* Con todos los candidatos del resumen a la vista, fija el umbral BH y reparte los cambios por pregunta */
function aplicarFDR(rs) {
  const todos = rs.flatMap(r => r.candidatos || []);
  const u = umbralBH(todos.map(c => c.p));
  for (const r of rs) {
    if (!r.candidatos) continue;
    const cambios = r.candidatos.filter(c => c.p <= u).sort((a, z) => Math.abs(z.d) - Math.abs(a.d));
    r.cambios = cambios.slice(0, MAX_CAMBIOS); r.mas = Math.max(0, cambios.length - MAX_CAMBIOS);
  }
  return { rs, m: todos.length };
}
let RESUMEN_LISTO = false;
async function pintarResumen() {
  const box = $('#resumen');
  if (!box || RESUMEN_LISTO) return;
  RESUMEN_LISTO = true;
  const n = EST.length;
  if (n < 2) return;
  // abierto en pantallas anchas; en el móvil, cerrado para que los paneles no queden tres pantallas más abajo
  let abierto = !esMovil();
  try { const v = localStorage.getItem('bet-resumen'); if (v) abierto = v === 'abierto'; } catch (e) { /* */ }
  const ult = EST[n - 1], ant = EST[n - 2];
  box.hidden = false;
  box.open = abierto;
  box.innerHTML = `<summary><span class="rs-t">Qué cambia en el último barómetro</span><span class="rs-m">${esc(mesLargo(ult.mes))} frente a ${esc(mesLargo(ant.mes))}</span></summary><p class="note">Calculando…</p>`;
  // cerrado, no se calcula (ni descarga sus columnas) hasta que se abre
  await new Promise(ok => {
    if (box.open) return ok();
    box.addEventListener('toggle', function abrir() { if (box.open) { box.removeEventListener('toggle', abrir); ok(); } });
  });
  box.addEventListener('toggle', () => { try { localStorage.setItem('bet-resumen', box.open ? 'abierto' : 'cerrado'); } catch (e) { /* */ } });
  let rs, m = 0;
  try { rs = (await Promise.all(RESUMEN.map(cambiosUltimo))).filter(Boolean); ({ m } = aplicarFDR(rs)); }
  catch (e) { box.querySelector('.note').textContent = e.message; return; }
  const fmtv = (v, media) => media ? fmt2(v) : fmt1(v) + ' %';
  const fmtd = (d, media) => `${d > 0 ? '+' : '−'}${media ? fmt2(Math.abs(d)) : fmt1(Math.abs(d))}`;
  const nombre = (r, id) => nombreResp(preg(r.preg), id);
  const conCambios = rs.filter(r => r.cambios && r.cambios.length);
  const sin = rs.filter(r => r.cambios && !r.cambios.length).map(r => r.t);
  const cortes = rs.filter(r => r.corte);
  const ausentes = rs.filter(r => r.ausente).map(r => r.t);
  const bloque = r => {
    const otroMes = r.fA.e.mes !== ant.mes ? `<p class="rs-sub">Frente a ${esc(mesLargo(r.fA.e.mes))}, el último barómetro anterior con la pregunta</p>` : '';
    const items = r.cambios.map(c => `<li><span class="rs-n">${esc(nombre(r, c.id))}</span><span class="rs-v">${fmtv(c.vB, r.media)}</span><span class="rs-d ${c.d > 0 ? 'sube' : 'baja'}">${fmtd(c.d, r.media)}</span></li>`).join('');
    return `<div class="rs-it"><h3>${esc(r.t)}</h3>${otroMes}<ul>${items}</ul>${r.mas ? `<p class="rs-sub">y ${r.mas} ${r.mas === 1 ? 'cambio más' : 'cambios más'}</p>` : ''}<button class="ib abrir" type="button" data-comparar="${esc(r.preg)}" data-mesa="${esc(r.fA.e.mes)}">Ver la comparación completa</button></div>`;
  };
  box.innerHTML = `<summary><span class="rs-t">Qué cambia en el último barómetro</span><span class="rs-m">${esc(mesLargo(ult.mes))} (estudio ${esc(ult.estudio)}) frente a ${esc(mesLargo(ant.mes))}</span></summary>
    ${conCambios.length ? `<div class="rs-grid">${conCambios.map(bloque).join('')}</div>` : '<p class="note">Ningún cambio significativo entre los dos barómetros con estos criterios.</p>'}
    ${sin.length ? `<p class="note"><b>Sin cambios significativos:</b> ${esc(sin.join(', ').toLowerCase())}.</p>` : ''}
    ${cortes.map(r => `<p class="note"><b>${esc(r.t)}:</b> sin comparación por la ruptura ${esc(r.corte.ruptura_id)} (${esc(breveRuptura(r.corte.descripcion))}).</p>`).join('')}
    ${ausentes.length ? `<p class="note"><b>No se preguntan en el último barómetro:</b> ${esc(ausentes.join(', ').toLowerCase())}.</p>` : ''}
    <p class="note rs-crit">Solo cambios de al menos un punto (una décima en las valoraciones) que siguen siendo significativos tras corregir por comparaciones múltiples: ${m} comparaciones a la vez, con la tasa de falsos descubrimientos controlada al 5 % (Benjamini–Hochberg) y el efecto de diseño de cada estudio. Variación en puntos; respuestas de menos del ${MIN_PCT_RESUMEN} % fuera. Un cambio significativo no siempre es un cambio de opinión: también puede deberse al cuestionario, por ejemplo a preguntas previas sobre el mismo tema.</p>`;
  box.querySelectorAll('[data-comparar]').forEach(bt => bt.addEventListener('click', () => {
    PANELES.unshift({ tipo: 'comparar', preg: bt.dataset.comparar, mesA: bt.dataset.mesa, id: nuevoId() });
    guardar(); renderTodo();
    grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

/* ================= arranque ================= */
function tema(v) {
  try { if (v === 'system') localStorage.removeItem('bet-tema'); else localStorage.setItem('bet-tema', v); } catch (e) { /* */ }
  if (v === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
  document.querySelectorAll('#tema button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  rerender();
}
/* La web entra por «¿Qué es esto?» la primera vez; cuando ya se ha visto la pestaña de series en este navegador, entra
   directamente en ella (la guía sigue a un clic). Los paneles del explorador no se pintan (ni descargan sus columnas)
   hasta que se abre la pestaña de series. */
const VISTAS_WEB = ['que', 'series', 'meth', 'datos'];
const CLAVE_GUIA = 'bet-guia';
const guiaVista = () => { try { return localStorage.getItem(CLAVE_GUIA) === 'vista'; } catch (e) { return false; } };
let GRID_LISTO = false;
function mostrarVista(t) {
  document.querySelectorAll('.tabs button').forEach(b => { const on = b.dataset.tab === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  VISTAS_WEB.forEach(v => { const el = $('#view-' + v); if (el) el.hidden = v !== t; });
}
/* La pestaña va en la dirección (#que, #series, #meth, #datos): el botón atrás vuelve a la anterior */
const vistaDeHash = () => { const h = location.hash.slice(1); return h.startsWith('p=') || PRESETS[h] ? 'series' : VISTAS_WEB.includes(h) ? h : null; };
function pestana(t, historial = true) {
  if (historial && vistaDeHash() !== t) history.pushState(null, '', '#' + t);
  mostrarVista(t);
  if (!META) return;
  if (t === 'series') { try { localStorage.setItem(CLAVE_GUIA, 'vista'); } catch (e) { /* */ } if (GRID_LISTO) rerender(); else { GRID_LISTO = true; leerPaleta(); renderTodo(); } pintarResumen(); }
  if (t === 'que') repintarGuia();
}

async function iniciar() {
  try { await cargarMeta(); } catch (e) { $('#upd').textContent = e.message; return; }
  const ult = EST[EST.length - 1];
  $('#upd').innerHTML = `Último barómetro: <b>${esc(mesLargo(ult.mes))}</b> (estudio ${esc(ult.estudio)})`;
  if (META.veda) { $('#aviso-veda').hidden = false; $('#descargas').innerHTML = '<li>Las descargas del fichero armonizado se suspenden durante el periodo de prohibición de publicación de sondeos.</li>'; }
  const t = document.documentElement.dataset.theme || 'system';
  document.querySelectorAll('#tema button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === t)));
  leerPaleta();
  cargarPaneles();
  if (typeof iniciarGuia === 'function') iniciarGuia();
  pintarMetodologia();
  pestana(VISTAS_WEB.find(v => $('#view-' + v) && !$('#view-' + v).hidden) || ($('#view-que') ? 'que' : 'series'), false);
}

document.querySelectorAll('#tema button').forEach(b => b.addEventListener('click', () => tema(b.dataset.v)));
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => pestana(b.dataset.tab)));
// flechas, Inicio y Fin entre pestañas
$('.tabs').addEventListener('keydown', ev => {
  const bs = [...document.querySelectorAll('.tabs button')], i = bs.indexOf(document.activeElement);
  if (i < 0) return;
  const j = { ArrowRight: (i + 1) % bs.length, ArrowLeft: (i - 1 + bs.length) % bs.length, Home: 0, End: bs.length - 1 }[ev.key];
  if (j == null) return;
  ev.preventDefault(); bs[j].focus(); pestana(bs[j].dataset.tab);
});
addEventListener('popstate', () => { const t = vistaDeHash() || 'que'; if (META) pestana(t, false); else mostrarVista(t); });
document.querySelectorAll('[data-goto]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); pestana(a.dataset.goto); scrollTo(0, 0); }));
$('#b-add').addEventListener('click', () => abrirEditor(null));
$('#b-reset').addEventListener('click', () => {
  if (!confirm('¿Volver a los paneles iniciales? Se pierden los paneles actuales.')) return;
  PANELES = defecto().map(p => ({ ...p, id: nuevoId() })); try { localStorage.removeItem(CLAVE); } catch (e) { /* */ }
  history.replaceState(null, '', location.pathname + '#series'); renderTodo();
});
$('#b-link').addEventListener('click', async ev => {
  const url = location.origin + location.pathname + '#p=' + b64e(JSON.stringify(PANELES.map(limpio)));
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); ev.target.textContent = 'Enlace copiado'; } catch (e) { ev.target.textContent = 'Enlace en la barra de direcciones'; }
  setTimeout(() => { ev.target.textContent = 'Copiar enlace a estos paneles'; }, 2500);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', rerender);
let rto; addEventListener('resize', () => { clearTimeout(rto); rto = setTimeout(rerender, 200); });
// los enlaces a paneles (#p=…, #vivienda…) y a una pestaña (#series, #meth…) entran directamente en ella; sin enlace,
// quien ya ha visto las series entra en ellas
if (vistaDeHash()) mostrarVista(vistaDeHash()); else if (guiaVista() && $('#view-series')) mostrarVista('series');
iniciar();
