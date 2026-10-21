/* Barómetros en el tiempo: explorador de series de los barómetros del CIS.
   Los datos se sirven por columnas (web/datos/col/*.bin, comprimidas con deflate) y se agregan en el navegador. */
'use strict';

const BASE = 'datos/';
const NR = new Set(['NS', 'NC', 'NR', 'NP']);
const MIN_N = 50;
const MAX_SERIES = 8;
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
  { g: 'Voto', id: 'intencion_voto', t: 'Intención directa de voto' },
  { g: 'Voto', id: 'voto_simpatia', t: 'Voto + simpatía' },
  { g: 'Voto', id: 'simpatia', t: 'Partido por el que siente más simpatía' },
  { g: 'Voto', id: 'cercania', t: 'Partido más cercano a sus ideas' },
  { g: 'Voto', id: 'intencion_alternativa', t: 'Intención de voto alternativa' },
  { g: 'Voto', id: 'intencion_voto_r', t: 'Intención directa (recodificación del CIS)' },
  { g: 'Voto', id: 'recuerdo_voto', t: 'Recuerdo de voto en las últimas generales' },
  { g: 'Voto', id: 'pref_presidente', t: 'Preferencia como presidente del Gobierno' },
  { g: 'Líderes', id: 'lideres', t: 'Valoración de líderes', tipo: 'medias' },
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
];
const CRUCES = [
  ['sexo', 'Sexo'], ['edad_g', 'Edad'], ['ccaa', 'Comunidad autónoma'], ['tamuni', 'Tamaño de municipio'],
  ['estudios', 'Nivel de estudios'], ['sitlab', 'Situación laboral'], ['clase_subjetiva', 'Clase social subjetiva'],
  ['religiosidad', 'Religiosidad'], ['ideologia_g', 'Ideología'], ['recuerdo_voto', 'Recuerdo de voto'],
  ['intencion_voto', 'Intención directa de voto'], ['voto_simpatia', 'Voto + simpatía'], ['estado_civil', 'Estado civil'],
  ['practica_religiosa', 'Asistencia a oficios religiosos'],
];
const FILTROS = [...CRUCES, ['provincia', 'Provincia']];
const CRUCE_DE = Object.fromEntries(FILTROS);

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
  { preg: 'intencion_voto' },
  { preg: 'voto_simpatia' },
  { preg: 'lideres' },
  { preg: 'prob_esp' },
  { preg: 'intencion_voto', cruce: 'edad_g', cat1: 'VOX' },
  { preg: 'eco_esp' },
];
const DEFECTO_VEDA = [{ preg: 'prob_esp' }, { preg: 'eco_esp' }, { preg: 'ideologia' }, { preg: 'prob_per' }];

/* ================= datos ================= */
let META, EST = [], ESTI = {}, LAB = {}, LIDERES = [];
const COLS = {}, PEND = {};

async function cargarMeta() {
  const r = await fetch(BASE + 'metadatos.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('No se han podido cargar los metadatos (' + r.status + ').');
  META = await r.json();
  const deff = Object.fromEntries(META.estudios.map(e => [String(e.estudio), e]));
  EST = META.tramos_estudio.map(t => ({ ...t, estudio: String(t.estudio), deff: +deff[String(t.estudio)]?.deff || 1, info: deff[String(t.estudio)] }));
  EST.forEach((e, i) => { ESTI[e.mes] = i; });
  for (const [k, c] of Object.entries(META.conceptos)) {
    LAB[k] = Object.fromEntries((c.categorias || []).map(x => [x.id, x.etiqueta]));
  }
  LIDERES = Object.keys(META.columnas).filter(k => k.startsWith('lider_'));
}
async function col(name) {
  if (COLS[name]) return COLS[name];
  if (!PEND[name]) PEND[name] = (async () => {
    const info = META.columnas[name];
    if (!info) throw new Error('Columna no disponible: ' + name);
    const r = await fetch(BASE + info.archivo);
    if (!r.ok) throw new Error('No se ha podido descargar ' + name + ' (' + r.status + ').');
    const buf = await new Response(r.body.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
    COLS[name] = info.bytes === 1 ? new Uint8Array(buf) : info.bytes === 2 ? new Uint16Array(buf) : new Float32Array(buf);
    return COLS[name];
  })();
  return PEND[name];
}
const preg = id => {
  const p = PREG.find(x => x.id === id);
  if (!p) return null;
  const tipo = p.tipo || 'cat';
  const cols = p.cols || (tipo === 'medias' ? LIDERES : [p.id]);
  return { ...p, tipo, cols };
};
const disponible = p => p && p.cols.length && p.cols.every(c => META.columnas[c]);
const etiqueta = (concepto, id) => {
  if (NR.has(id)) return META.no_respuesta[id] || id;
  if (concepto.startsWith('lider_') || id.startsWith('lider_')) {
    const k = id.startsWith('lider_') ? id : concepto;
    return (META.conceptos[k]?.etiqueta || k).replace(/^Valoración de /, '').replace(/ \(1-10\)$/, '');
  }
  return String(LAB[concepto]?.[id] ?? id).replace(/^\(NO LEER\)\s*/i, '');
};
const nivelesDe = c => META.columnas[c].niveles;
const ordenMeta = (concepto, ids) => {
  const pos = Object.fromEntries((META.conceptos[concepto]?.categorias || []).map((c, i) => [c.id, i]));
  return ids.slice().sort((a, z) => (pos[a] ?? 1e6) - (pos[z] ?? 1e6));
};

/* Agregación: por estudio y grupo (categoría del cruce o total), suma ponderada y n sin ponderar */
async function calcular(cfg) {
  const P = preg(cfg.preg);
  const need = [...P.cols, 'peso'];
  if (cfg.cruce) need.push(cfg.cruce);
  if (cfg.filtro) need.push(cfg.filtro.col);
  await Promise.all(need.map(col));
  const peso = COLS.peso;
  const gcol = cfg.cruce ? COLS[cfg.cruce] : null;
  const glev = cfg.cruce ? nivelesDe(cfg.cruce) : ['TOTAL'];
  const G = glev.length;
  const gNP = cfg.cruce ? glev.indexOf('NP') : -1;
  let fcol = null, fcod = -1;
  if (cfg.filtro) { fcol = COLS[cfg.filtro.col]; fcod = nivelesDe(cfg.filtro.col).indexOf(cfg.filtro.val) + 1; }
  const meses = EST.filter(e => (!cfg.desde || e.mes >= cfg.desde) && (!cfg.hasta || e.mes <= cfg.hasta));
  const filas = [];

  if (P.tipo === 'cat' || P.tipo === 'multi') {
    // identificadores comunes a las columnas (las de problemas tienen niveles propios)
    const ids = [], idx = {};
    const mapas = P.cols.map(c => nivelesDe(c).map(id => { if (!(id in idx)) { idx[id] = ids.length; ids.push(id); } return idx[id]; }));
    const isNR = ids.map(id => NR.has(id)), isNP = ids.map(id => id === 'NP');
    const cs = P.cols.map(c => COLS[c]);
    const K = ids.length;
    for (const e of meses) {
      const base = new Float64Array(G), n = new Uint32Array(G), num = new Float64Array(G * K);
      const marca = new Int32Array(K).fill(-1);
      for (let r = e.desde; r < e.hasta; r++) {
        if (fcol && fcol[r] !== fcod) continue;
        let g = 0;
        if (gcol) { g = gcol[r] - 1; if (g < 0 || g === gNP) continue; }
        const c0 = cs[0][r];
        if (c0 === 0) continue;
        const k0 = mapas[0][c0 - 1];
        if (isNP[k0] || (cfg.exNR && isNR[k0])) continue;
        const w = peso[r];
        base[g] += w; n[g]++;
        if (P.tipo === 'cat') { num[g * K + k0] += w; continue; }
        for (let j = 0; j < cs.length; j++) {           // hasta tres menciones, sin contar dos veces la misma
          const c = cs[j][r]; if (c === 0) continue;
          const k = mapas[j][c - 1];
          if (isNP[k] || (j > 0 && isNR[k]) || marca[k] === r) continue;
          marca[k] = r; num[g * K + k] += w;
        }
      }
      const grupos = [];
      for (let g = 0; g < G; g++) {
        const vals = {};
        if (n[g] > 0) for (let k = 0; k < K; k++) if (num[g * K + k] > 0) vals[ids[k]] = 100 * num[g * K + k] / base[g];
        grupos.push({ n: n[g], vals });
      }
      filas.push({ e, grupos });
    }
    return { P, cfg, filas, ids: ids.filter(id => id !== 'NP'), glev, unidad: '%' };
  }
  // medias (líderes, ideología)
  const cs = P.cols.map(c => COLS[c]);
  for (const e of meses) {
    const K = cs.length;
    const sw = new Float64Array(G * K), swx = new Float64Array(G * K), swx2 = new Float64Array(G * K), n = new Uint32Array(G * K);
    for (let r = e.desde; r < e.hasta; r++) {
      if (fcol && fcol[r] !== fcod) continue;
      let g = 0;
      if (gcol) { g = gcol[r] - 1; if (g < 0 || g === gNP) continue; }
      const w = peso[r];
      for (let k = 0; k < K; k++) {
        const v = cs[k][r]; if (v === 0) continue;
        const i = g * K + k; sw[i] += w; swx[i] += w * v; swx2[i] += w * v * v; n[i]++;
      }
    }
    const grupos = [];
    for (let g = 0; g < G; g++) {
      const vals = {}, ns = {}, sd = {};
      for (let k = 0; k < K; k++) {
        const i = g * K + k;
        if (n[i] > 0) { const m = swx[i] / sw[i]; vals[P.cols[k]] = m; ns[P.cols[k]] = n[i]; sd[P.cols[k]] = Math.sqrt(Math.max(0, swx2[i] / sw[i] - m * m)); }
      }
      grupos.push({ vals, ns, sd });
    }
    filas.push({ e, grupos });
  }
  return { P, cfg, filas, ids: P.cols.slice(), glev, unidad: 'media' };
}

/* Series a dibujar a partir de la agregación */
function series(res, cfg) {
  const { P, filas, glev } = res;
  const media = res.unidad === 'media';
  const punto = (f, g, id) => {
    const gr = f.grupos[g]; if (!gr) return null;
    const v = gr.vals[id];
    const n = media ? (gr.ns[id] || 0) : gr.n;
    if (v == null || n < MIN_N) return { v: null, n, omit: v != null && n > 0 };
    let se;
    if (media) se = Math.sqrt(f.e.deff * gr.sd[id] ** 2 / n);
    else { const p = v / 100; se = 100 * Math.sqrt(f.e.deff * p * (1 - p) / n); }
    return { v, n, lo: v - 1.96 * se, hi: v + 1.96 * se };
  };
  const conc = P.tipo === 'multi' ? P.cols[0] : P.cols[0];
  let out;
  if (!cfg.cruce) {
    let cats = cfg.cats && cfg.cats.length ? cfg.cats : catsDefecto(res);
    if (P.tipo === 'cat' && res.ids.filter(id => !NR.has(id)).length <= 7) cats = ordenMeta(conc, cats);
    out = cats.slice(0, MAX_SERIES).map(id => ({
      id, label: P.tipo === 'medias' ? etiqueta(id, id) : etiqueta(conc, id),
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
  if (res.unidad === 'media') return ids.filter(id => ultimoCon(res, 0, id) != null && res.filas.slice(-6).some(f => f.grupos[0].vals[id] != null));
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
  const cs = P.tipo === 'medias' ? P.cols : [P.cols[0]];
  if (cfg.cruce) cs.push(cfg.cruce);
  if (cfg.filtro) cs.push(cfg.filtro.col);
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
const breveRuptura = d => { const s = d.split(/(?<=\.)\s|:\s/)[0]; return s.length > 170 ? s.slice(0, 168) + '…' : s; };

/* ================= paleta ================= */
let PAL = {};
function leerPaleta() {
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  PAL = { surface: v('--surface'), ink: v('--ink'), ink2: v('--ink2'), ink3: v('--ink3'), line: v('--line'), line2: v('--line2'),
    acc: v('--acc'), band: +v('--band') || .12, cat: [1, 2, 3, 4, 5, 6, 7, 8].map(i => v('--c' + i)), font: getComputedStyle(document.body).fontFamily,
    fontD: v('--font-d') };
}
function colores(lista, cfg) {
  const P = preg(cfg.preg);
  const partidoDe = id => {
    if (cfg.cruce) return ['recuerdo_voto', 'intencion_voto', 'voto_simpatia'].includes(cfg.cruce) ? id : null;
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
  let slot = 0;
  lista.forEach(s => {
    if (out[s.id]) return;
    while (slot < 8 && usados.has(PAL.cat[slot])) slot++;
    out[s.id] = PAL.cat[slot % 8]; usados.add(out[s.id]); slot++;
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
  const col = colores(ser, cfg);
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
  const marcas = [...d3.group(rup, r => r.m)].map(([mes, rs]) => ({ mes, rs, x: x(fecha(mes)), esC: rs.some(r => r.tipo === 'C') }));
  marcas.forEach(mk => {
    const g = svg.append('g');
    g.append('line').attr('x1', mk.x).attr('x2', mk.x).attr('y1', mk.esC ? m.t - 6 : m.t).attr('y2', H - m.b)
      .attr('stroke', mk.esC ? PAL.acc : PAL.ink3).attr('stroke-width', mk.esC ? 1.5 : 1).attr('stroke-dasharray', mk.esC ? null : '2 3');
    g.append('rect').attr('x', mk.x - 7).attr('y', m.t - 20).attr('width', 14).attr('height', H - m.b - m.t + 20).attr('fill', 'transparent')
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

  // bandas, líneas y puntos aislados
  const def = p => p.v != null;
  if (banda) {
    const area = d3.area().defined(def).x(p => x(fecha(p.mes))).y0(p => y(p.lo)).y1(p => y(p.hi));
    ser.forEach(s => svg.append('path').attr('d', area(s.pts)).attr('fill', col[s.id]).attr('fill-opacity', PAL.band).attr('stroke', 'none'));
  }
  const line = d3.line().defined(def).x(p => x(fecha(p.mes))).y(p => y(p.v));
  ser.forEach(s => {
    svg.append('path').attr('d', line(s.pts)).attr('fill', 'none').attr('stroke', col[s.id]).attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    s.pts.forEach((p, i) => {
      if (p.v == null) return;
      const prev = s.pts[i - 1], next = s.pts[i + 1];
      if ((!prev || prev.v == null) && (!next || next.v == null))
        svg.append('circle').attr('cx', x(fecha(p.mes))).attr('cy', y(p.v)).attr('r', 2.5).attr('fill', col[s.id]);
    });
  });
  // etiquetas finales
  const ends = ser.map(s => { const p = [...s.pts].reverse().find(def); return p ? { s, p, y: y(p.v) } : null; }).filter(Boolean).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  ends.forEach(e => {
    svg.append('circle').attr('cx', x(fecha(e.p.mes))).attr('cy', y(e.p.v)).attr('r', 3.5).attr('fill', col[e.s.id]).attr('stroke', PAL.surface).attr('stroke-width', 2);
    svg.append('text').attr('x', x(fecha(e.p.mes)) + 7).attr('y', e.y + 4).attr('fill', PAL.ink).attr('font-size', 11).attr('font-weight', 600)
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
        const v = p.v != null ? (media ? fmt2(p.v) : fmt1(p.v) + ' %') : p.omit ? 'n < 50' : 's. d.';
        return `<div class="r"><span><i class="sw" style="background:${col[s.id]}"></i>${esc(s.label)}</span><span>${v}${d}</span></div>`;
      }).join('');
      const n = !cfg.cruce && !media ? ser[0].pts[i].n : null;
      const notas = notasEstudio(cfg, mes).map(t => `<div class="tnote">${esc(t)}</div>`).join('');
      showTip(`<b>${esc(mesLargo(mes))}</b>${rows}<div class="tnote">Estudio ${esc(res.filas[i].e.estudio)}${n ? `, base ${fmtInt(n)} entrevistas` : ''}. Variación en puntos respecto al barómetro anterior${cRupt.length ? '; «s. c.»: sin comparación por ruptura C' : ''}.</div>${notas}`, ev);
    })
    .on('pointerleave', () => { cross.attr('visibility', 'hidden'); hideTip(); });

  const omitidos = ser.reduce((a, s) => a + s.pts.filter(p => p.omit).length, 0);
  return { ser, col, rup, omitidos, cat1: ser.cat1 };
}

/* ================= paneles ================= */
let PANELES = [];
let SEQ = 0;
const nuevoId = () => 'p' + (++SEQ);

function tituloPanel(cfg, res) {
  const P = preg(cfg.preg);
  if (!cfg.cruce) return P.t;
  const cat1 = res && res.cat1 ? res.cat1 : cfg.cat1;
  const nom = cat1 ? (P.tipo === 'medias' ? etiqueta(cat1, cat1) : etiqueta(P.cols[0], cat1)) : '';
  const de = P.tipo === 'medias' ? `Valoración de ${nom}` : `${P.t}: ${nom}`;
  return `${de}, por ${CRUCE_DE[cfg.cruce].toLowerCase()}`;
}
function metaPanel(cfg, res) {
  const P = preg(cfg.preg);
  const f = res.filas;
  const ud = res.unidad === 'media' ? 'Media de 1 a 10' : P.tipo === 'multi' ? '% de entrevistados (hasta tres menciones)' : '% de entrevistados';
  const per = f.length ? `${mesCorto(f[0].e.mes)} a ${mesCorto(f[f.length - 1].e.mes)}` : '';
  const fil = cfg.filtro ? `. Solo ${etiqueta(cfg.filtro.col, cfg.filtro.val)}` : '';
  const exn = cfg.exNR && res.unidad !== 'media' ? '. Sin NS/NC en la base' : '';
  return `${ud}. ${per}${fil}${exn}`;
}

function panelEl(cfg) {
  const el = document.createElement('section');
  el.className = 'panel' + (cfg.ancho ? ' wide' : '');
  el.dataset.id = cfg.id;
  el.innerHTML = `<header class="phd"><div class="ttl"><h2></h2><p class="meta"></p></div>
    <div class="acts">
      <button class="ib" type="button" data-a="edit">Configurar</button>
      <button class="ib" type="button" data-a="tabla" aria-pressed="false">Tabla</button>
      <button class="ib" type="button" data-a="csv">CSV</button>
      <button class="ib" type="button" data-a="png">PNG</button>
      <button class="ib" type="button" data-a="dup">Duplicar</button>
      <button class="ib" type="button" data-a="del" aria-label="Quitar panel">Quitar</button>
    </div></header>
    <div class="chart"></div><div class="tabla" hidden></div><div class="notas"></div>
    <p class="src">Fuente: CIS, barómetros mensuales (microdatos). Elaboración: Barómetros en el tiempo.</p>`;
  el.querySelector('.acts').addEventListener('click', ev => {
    const a = ev.target.closest('button')?.dataset.a; if (!a) return;
    const i = PANELES.findIndex(p => p.id === cfg.id);
    if (a === 'edit') abrirEditor(PANELES[i]);
    if (a === 'dup') { PANELES.splice(i + 1, 0, { ...structuredClone(PANELES[i]), id: nuevoId() }); guardar(); renderTodo(); }
    if (a === 'del') { PANELES.splice(i, 1); guardar(); renderTodo(); }
    if (a === 'tabla') { const t = el.querySelector('.tabla'); t.hidden = !t.hidden; ev.target.setAttribute('aria-pressed', String(!t.hidden)); }
    if (a === 'csv') exportarCSV(el);
    if (a === 'png') exportarPNG(el);
  });
  return el;
}

async function renderPanel(el, cfg) {
  const P = preg(cfg.preg);
  const h2 = el.querySelector('h2'), meta = el.querySelector('.meta'), host = el.querySelector('.chart'),
    notas = el.querySelector('.notas'), tabla = el.querySelector('.tabla');
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
    const res = await calcular(cfg);
    const out = dibujar(host, res, cfg);
    res.cat1 = out.cat1;
    h2.textContent = tituloPanel(cfg, res);
    meta.textContent = metaPanel(cfg, res);
    if (out.vacio) { host.innerHTML = `<p class="empty">${esc(out.vacio)}</p>`; notas.innerHTML = ''; tabla.innerHTML = ''; el._res = null; return; }
    el._res = { res, out, cfg };
    // notas
    const vistas = new Set();
    const ns = out.rup.filter(r => !vistas.has(r.ruptura_id) && vistas.add(r.ruptura_id))
      .map(r => `<p class="note"><span class="rid">${esc(r.ruptura_id)}</span> (${esc(mesCorto(r.m))}, tipo ${esc(r.tipo)}): ${esc(breveRuptura(r.descripcion))}</p>`);
    if (out.omitidos) ns.push(`<p class="note">${out.omitidos} ${out.omitidos === 1 ? 'punto omitido' : 'puntos omitidos'} por tener menos de ${MIN_N} entrevistas.</p>`);
    notas.innerHTML = ns.join('');
    tabla.innerHTML = tablaHTML(out, res);
  } catch (e) {
    host.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  } finally { el.classList.remove('cargando'); }
}

function tablaHTML(out, res) {
  const media = res.unidad === 'media';
  const f = media ? fmt2 : fmt1;
  const head = `<tr><th>Mes</th>${out.ser.map(s => `<th>${esc(s.label)}</th>`).join('')}${!res.cfg.cruce && !media ? '<th>Base (n)</th>' : ''}</tr>`;
  const rows = res.filas.map((fl, i) => `<tr><td>${esc(mesCorto(fl.e.mes))}</td>${out.ser.map(s => `<td>${s.pts[i].v != null ? f(s.pts[i].v) : s.pts[i].omit ? 'n < 50' : '—'}</td>`).join('')}${!res.cfg.cruce && !media ? `<td>${fmtInt(out.ser[0].pts[i].n || 0)}</td>` : ''}</tr>`).reverse();
  return `<table><thead>${head}</thead><tbody>${rows.join('')}</tbody></table>`;
}

function descargar(nombre, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
function exportarCSV(el) {
  if (!el._res) return;
  const { out, res, cfg } = el._res;
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [['mes', 'estudio', 'serie', 'valor', 'margen_inferior', 'margen_superior', 'n_base'].join(',')];
  out.ser.forEach(s => s.pts.forEach((p, i) => lines.push([res.filas[i].e.mes, res.filas[i].e.estudio, q(s.label),
    p.v != null ? p.v.toFixed(3) : '', p.lo != null ? p.lo.toFixed(3) : '', p.hi != null ? p.hi.toFixed(3) : '', p.n ?? ''].join(','))));
  lines.push('', q(`${tituloPanel(cfg, res)}. ${metaPanel(cfg, res)}`), q('Fuente: CIS, barómetros mensuales (microdatos). Elaboración: Barómetros en el tiempo.'));
  descargar(slug(tituloPanel(cfg, res)) + '.csv', new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
}
function exportarPNG(el) {
  const svg = el.querySelector('.chart svg'); if (!svg || !el._res) return;
  const { res, cfg } = el._res;
  const W = +svg.getAttribute('width'), H = +svg.getAttribute('height');
  const s = 2, top = 52, bot = 34;
  const cv = document.createElement('canvas'); cv.width = W * s; cv.height = (H + top + bot) * s;
  const ctx = cv.getContext('2d'); ctx.scale(s, s);
  ctx.fillStyle = PAL.surface; ctx.fillRect(0, 0, W, H + top + bot);
  ctx.fillStyle = PAL.ink; ctx.font = `600 16px ${PAL.fontD}`; ctx.fillText(tituloPanel(cfg, res), 8, 22);
  ctx.fillStyle = PAL.ink3; ctx.font = `12px ${PAL.font}`; ctx.fillText(metaPanel(cfg, res), 8, 42);
  ctx.fillText('Fuente: CIS, barómetros mensuales (microdatos). Elaboración: Barómetros en el tiempo.', 8, H + top + 22);
  const img = new Image();
  img.onload = () => { ctx.drawImage(img, 0, top, W, H); cv.toBlob(b => descargar(slug(tituloPanel(cfg, res)) + '.png', b)); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}

const grid = $('#grid');
function renderTodo() {
  grid.innerHTML = '';
  if (!PANELES.length) { grid.innerHTML = '<p class="empty">No hay paneles. Usa «Nuevo panel» para añadir uno.</p>'; return; }
  PANELES.forEach(cfg => { const el = panelEl(cfg); grid.appendChild(el); renderPanel(el, cfg); });
}
function rerender() { leerPaleta(); grid.querySelectorAll('.panel').forEach(el => { const cfg = PANELES.find(p => p.id === el.dataset.id); if (cfg) renderPanel(el, cfg); }); }

/* ================= estado ================= */
const limpio = p => { const { id, ...r } = p; return r; };
function guardar() { try { localStorage.setItem('bet-paneles', JSON.stringify(PANELES.map(limpio))); } catch (e) { /* sin almacenamiento */ } }
const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
function cargarPaneles() {
  let ps = null;
  if (location.hash.startsWith('#p=')) { try { ps = JSON.parse(b64d(location.hash.slice(3))); } catch (e) { ps = null; } }
  if (!ps) { try { ps = JSON.parse(localStorage.getItem('bet-paneles') || 'null'); } catch (e) { ps = null; } }
  if (!Array.isArray(ps) || !ps.length) ps = META.veda ? DEFECTO_VEDA : DEFECTO;
  PANELES = ps.filter(p => preg(p.preg)).map(p => ({ ...p, id: nuevoId() }));
}

/* ================= editor ================= */
const ed = $('#ed'), edb = $('#ed-body');
let BORRADOR = null, EDITANDO = null;
const opcionesMes = sel => EST.map(e => `<option value="${e.mes}"${e.mes === sel ? ' selected' : ''}>${esc(mesCorto(e.mes))}</option>`).join('');

function abrirEditor(cfg) {
  EDITANDO = cfg ? cfg.id : null;
  BORRADOR = structuredClone(cfg ? limpio(cfg) : { preg: 'intencion_voto' });
  $('#ed-t').textContent = cfg ? 'Configurar panel' : 'Nuevo panel';
  $('#ed-err').textContent = '';
  pintarEditor();
  ed.showModal();
}
async function pintarEditor() {
  const b = BORRADOR;
  const grupos = [...new Set(PREG.map(p => p.g))];
  const optPreg = grupos.map(g => `<optgroup label="${esc(g)}">${PREG.filter(p => p.g === g && disponible(preg(p.id))).map(p => `<option value="${p.id}"${p.id === b.preg ? ' selected' : ''}>${esc(p.t)}</option>`).join('')}</optgroup>`).join('');
  const optCruce = `<option value="">Sin cruce</option>` + CRUCES.filter(([k]) => META.columnas[k] && k !== b.preg).map(([k, t]) => `<option value="${k}"${k === b.cruce ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const optFiltro = `<option value="">Sin filtro</option>` + FILTROS.filter(([k]) => META.columnas[k]).map(([k, t]) => `<option value="${k}"${b.filtro && k === b.filtro.col ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const valFiltro = b.filtro ? nivelesDe(b.filtro.col).filter(id => id !== 'NP').map(id => `<option value="${esc(id)}"${id === b.filtro.val ? ' selected' : ''}>${esc(etiqueta(b.filtro.col, id))}</option>`).join('') : '';
  edb.innerHTML = `
    <div class="fld full"><label for="f-preg">Pregunta</label><select id="f-preg">${optPreg}</select></div>
    <div class="fld"><label for="f-cruce">Cruzar por</label><select id="f-cruce">${optCruce}</select><span class="hint">Con cruce, cada línea es un grupo y se elige una sola respuesta.</span></div>
    <div class="fld"><label for="f-filtro">Filtrar por</label><div class="row"><select id="f-filtro">${optFiltro}</select><select id="f-fval" ${b.filtro ? '' : 'hidden'} aria-label="Valor del filtro">${valFiltro}</select></div></div>
    <div class="fld"><label for="f-desde">Desde</label><select id="f-desde">${opcionesMes(b.desde || EST[0].mes)}</select></div>
    <div class="fld"><label for="f-hasta">Hasta</label><select id="f-hasta">${opcionesMes(b.hasta || EST[EST.length - 1].mes)}</select></div>
    <div class="fld full" id="f-cats"><span class="lab">Respuestas</span><p class="hint">Calculando…</p></div>
    <div class="fld full"><span class="lab">Opciones</span>
      <label class="row"><input type="checkbox" id="f-exnr"${b.exNR ? ' checked' : ''}> Excluir de la base «no sabe», «no contesta» y «no recuerda»</label>
      <label class="row"><input type="checkbox" id="f-banda"${(b.banda ?? !b.cruce) ? ' checked' : ''}> Mostrar el margen de error</label>
      <label class="row"><input type="checkbox" id="f-ancho"${b.ancho ? ' checked' : ''}> Panel a todo el ancho</label></div>`;
  const leer = () => {
    b.preg = $('#f-preg').value;
    b.cruce = $('#f-cruce').value || null;
    const fc = $('#f-filtro').value;
    b.filtro = fc ? { col: fc, val: (b.filtro && b.filtro.col === fc ? $('#f-fval').value : null) || nivelesDe(fc).find(id => !NR.has(id)) } : null;
    b.desde = $('#f-desde').value === EST[0].mes ? null : $('#f-desde').value;
    b.hasta = $('#f-hasta').value === EST[EST.length - 1].mes ? null : $('#f-hasta').value;
    b.exNR = $('#f-exnr').checked; b.banda = $('#f-banda').checked; b.ancho = $('#f-ancho').checked;
  };
  ['#f-preg', '#f-cruce', '#f-filtro', '#f-fval', '#f-desde', '#f-hasta', '#f-exnr'].forEach(s => $(s).addEventListener('change', ev => {
    const antes = b.preg, cruceAntes = b.cruce;
    leer();
    if (b.preg !== antes) { b.cats = null; b.cat1 = null; if (b.cruce === b.preg) b.cruce = null; }
    if (b.cruce !== cruceAntes) b.gcats = null;
    pintarEditor();
  }));
  ['#f-banda', '#f-ancho'].forEach(s => $(s).addEventListener('change', leer));
  // listas de respuestas y grupos con su último valor
  try {
    const res = await calcular({ ...b, cats: null, gcats: null });
    if (BORRADOR !== b) return;
    const P = res.P, media = res.unidad === 'media';
    const conc = P.cols[0];
    const ult = id => ultimoCon(res, 0, id);
    const fmtv = v => v == null ? '' : media ? fmt2(v) : fmt1(v) + ' %';
    // para el cálculo del último valor sin cruce
    const resTot = b.cruce ? await calcular({ ...b, cruce: null, cats: null, gcats: null }) : res;
    const ultT = id => ultimoCon(resTot, 0, id);
    const orden = res.ids.filter(id => ultT(id) != null || media).sort((a, z) => (NR.has(a) - NR.has(z)) || ((ultT(z) ?? -1) - (ultT(a) ?? -1)));
    const nom = id => media ? etiqueta(id, id) : etiqueta(conc, id);
    const box = $('#f-cats');
    if (!b.cruce) {
      const sel = new Set(b.cats && b.cats.length ? b.cats : catsDefecto(resTot));
      box.innerHTML = `<span class="lab">Respuestas (hasta ${MAX_SERIES})</span><input type="search" id="f-buscar" placeholder="Buscar" aria-label="Buscar respuesta">
        <div class="chks">${orden.map(id => `<label><input type="checkbox" value="${esc(id)}"${sel.has(id) ? ' checked' : ''}> ${esc(nom(id))}<span class="v">${fmtv(ultT(id))}</span></label>`).join('')}</div>
        <span class="hint">A la derecha, el último valor disponible de cada respuesta.</span>`;
    } else {
      const c1 = b.cat1 && res.ids.includes(b.cat1) ? b.cat1 : catsDefecto(resTot)[0];
      const gsel = new Set(b.gcats && b.gcats.length ? b.gcats : gruposDefecto(res, c1));
      box.innerHTML = `<span class="lab">Respuesta</span><select id="f-cat1">${orden.map(id => `<option value="${esc(id)}"${id === c1 ? ' selected' : ''}>${esc(nom(id))}${ultT(id) != null ? ' (' + fmtv(ultT(id)) + ')' : ''}</option>`).join('')}</select>
        <span class="lab" style="margin-top:8px">Grupos de ${esc(CRUCE_DE[b.cruce].toLowerCase())} (hasta ${MAX_SERIES})</span>
        <div class="chks">${ordenMeta(b.cruce, res.glev.filter(id => id !== 'NP')).map(id => `<label><input type="checkbox" value="${esc(id)}"${gsel.has(id) ? ' checked' : ''}> ${esc(etiqueta(b.cruce, id))}</label>`).join('')}</div>`;
    }
    const busc = $('#f-buscar');
    if (busc) busc.addEventListener('input', () => {
      const q = slug(busc.value);
      box.querySelectorAll('.chks label').forEach(l => { l.hidden = q && !slug(l.textContent).includes(q); });
    });
  } catch (e) { $('#f-cats').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
$('#ed-ok').addEventListener('click', () => {
  const b = BORRADOR;
  const box = $('#f-cats');
  const marcadas = [...box.querySelectorAll('.chks input:checked')].map(i => i.value);
  if (marcadas.length > MAX_SERIES) { $('#ed-err').textContent = `Marca como máximo ${MAX_SERIES}.`; return; }
  if (!marcadas.length) { $('#ed-err').textContent = 'Marca al menos una opción.'; return; }
  if (b.cruce) { b.gcats = marcadas; b.cat1 = $('#f-cat1')?.value || null; b.cats = null; }
  else { b.cats = marcadas; b.gcats = null; b.cat1 = null; }
  if (b.desde && b.hasta && b.desde > b.hasta) { $('#ed-err').textContent = 'El mes inicial es posterior al final.'; return; }
  if (EDITANDO) { const i = PANELES.findIndex(p => p.id === EDITANDO); PANELES[i] = { ...b, id: EDITANDO }; }
  else PANELES.unshift({ ...b, id: nuevoId() });
  guardar(); ed.close(); renderTodo();
});

/* ================= nota metodológica ================= */
function pintarMetodologia() {
  const ultimo = EST[EST.length - 1], primero = EST[0];
  const nTot = META.filas;
  $('#m-cobertura').textContent = `Cobertura: ${EST.length} barómetros mensuales, de ${mesLargo(primero.mes)} a ${mesLargo(ultimo.mes)}, con ${fmtInt(nTot)} entrevistas en total.`;
  const tipos = { C: 'C', B: 'B', tecnica: 'Técnica', 'tecnica-critica': 'Técnica', hueco: 'Hueco', descartada: 'Descartada' };
  $('#m-rupt-tabla').innerHTML = `<table><thead><tr><th>Ruptura</th><th>Mes</th><th>Tipo</th><th>Afecta a</th><th>Qué cambia</th><th>Estado</th></tr></thead><tbody>${META.rupturas.map(r => `<tr id="r-${esc(r.ruptura_id)}"><td>${esc(r.ruptura_id)}</td><td>${esc(r.mes)}</td><td><span class="tipo ${esc(r.tipo)}">${esc(tipos[r.tipo] || r.tipo)}</span></td><td>${esc(r.conceptos_afectados)}</td><td>${esc(r.descripcion)}</td><td>${esc(r.estado)}</td></tr>`).join('')}</tbody></table>`;
  const titulo = id => PREG.find(p => p.id === id)?.t || (META.conceptos[id]?.etiqueta) || id;
  $('#m-preg-fichas').innerHTML = Object.entries(META.enunciados || {}).sort((a, z) => titulo(a[0]).localeCompare(titulo(z[0]), 'es')).map(([id, vs]) => `<div class="ficha"><h4>${esc(titulo(id))}</h4>${vs.map(v => `<p class="per">Versión ${esc(v.version)}: ${esc(mesCorto(v.desde))} a ${esc(mesCorto(v.hasta))}</p><p>${esc(v.enunciado.replace(/\s+\.$/, ''))}</p>`).join('')}</div>`).join('');
  $('#m-est-tabla').innerHTML = `<table><thead><tr><th>Mes</th><th>Estudio</th><th>Trabajo de campo</th><th>Entrevistas</th><th>Efecto de diseño</th></tr></thead><tbody>${META.estudios.map(e => `<tr><td>${esc(mesCorto(e.mes))}</td><td>${esc(e.estudio)}</td><td>${esc(e.fecha_campo_inicio)} a ${esc(e.fecha_campo_fin)}</td><td class="n">${fmtInt(+e.n)}</td><td class="n">${fmt2(+e.deff)}</td></tr>`).join('')}</tbody></table>`;
}

/* ================= arranque ================= */
function tema(v) {
  try { if (v === 'system') localStorage.removeItem('bet-tema'); else localStorage.setItem('bet-tema', v); } catch (e) { /* */ }
  if (v === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
  document.querySelectorAll('#tema button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  rerender();
}
function pestana(t) {
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  ['series', 'meth', 'datos'].forEach(v => { $('#view-' + v).hidden = v !== t; });
  if (t === 'series') rerender();
}

async function iniciar() {
  if (typeof DecompressionStream === 'undefined') { $('#grid').innerHTML = '<p class="empty">Este navegador no puede descomprimir los datos. Usa una versión reciente de Chrome, Firefox, Safari o Edge.</p>'; return; }
  try { await cargarMeta(); } catch (e) { $('#upd').textContent = e.message; return; }
  const ult = EST[EST.length - 1];
  $('#upd').innerHTML = `Último barómetro: <b>${esc(mesLargo(ult.mes))}</b> (estudio ${esc(ult.estudio)})`;
  if (META.veda) { $('#aviso-veda').hidden = false; $('#descargas').innerHTML = '<li>Las descargas del fichero armonizado se suspenden durante el periodo de prohibición de publicación de sondeos.</li>'; }
  const t = document.documentElement.dataset.theme || 'system';
  document.querySelectorAll('#tema button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === t)));
  leerPaleta();
  cargarPaneles();
  renderTodo();
  pintarMetodologia();
}

document.querySelectorAll('#tema button').forEach(b => b.addEventListener('click', () => tema(b.dataset.v)));
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => pestana(b.dataset.tab)));
document.querySelectorAll('[data-goto]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); pestana(a.dataset.goto); scrollTo(0, 0); }));
$('#b-add').addEventListener('click', () => abrirEditor(null));
$('#b-reset').addEventListener('click', () => { PANELES = (META.veda ? DEFECTO_VEDA : DEFECTO).map(p => ({ ...p, id: nuevoId() })); try { localStorage.removeItem('bet-paneles'); } catch (e) { /* */ } history.replaceState(null, '', location.pathname); renderTodo(); });
$('#b-link').addEventListener('click', async ev => {
  const url = location.origin + location.pathname + '#p=' + b64e(JSON.stringify(PANELES.map(limpio)));
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); ev.target.textContent = 'Enlace copiado'; } catch (e) { ev.target.textContent = 'Enlace en la barra de direcciones'; }
  setTimeout(() => { ev.target.textContent = 'Copiar enlace a estos paneles'; }, 2500);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', rerender);
let rto; addEventListener('resize', () => { clearTimeout(rto); rto = setTimeout(rerender, 200); });
iniciar();
