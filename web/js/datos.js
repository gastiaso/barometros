/* Barómetro a barómetro: descarga de columnas, agregación (porcentajes, medias, intervalos, media móvil), rupturas y paleta.
   Los datos se sirven por columnas (web/datos/col/*.bin, comprimidas con deflate) y se agregan en el navegador. */
'use strict';

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
    deffRec: +deff[String(t.estudio)]?.deff_recuerdo || +deff[String(t.estudio)]?.deff || 1,
    deffEst: +deff[String(t.estudio)]?.deff_estudios || +deff[String(t.estudio)]?.deff || 1, info: deff[String(t.estudio)] }));
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
  const estudios = !recuerdo && pesoEstudios(cfg);
  const colPeso = recuerdo ? 'peso_recuerdo' : estudios ? 'peso_estudios' : 'peso';
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
    .map(e => (recuerdo ? { ...e, deff: e.deffRec } : estudios ? { ...e, deff: e.deffEst } : e));
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
    ? (f, g, id) => {
      // sin la respuesta en el propio mes no hay punto (una respuesta nueva, como Sumar en abr-2023, no se anticipa
      // con la ventana centrada); la ventana solo suaviza meses que la tienen
      const propio = puntoDe(res, f, g, id);
      if (propio.v == null && !propio.omit) return { v: null, n: 0 };
      const i = filas.indexOf(f); const w = ventanaMovil(res, cfg, i); const pt = acumular(res, w.idxs, g, id); if (pt.v != null && !w.centrada) pt.prov = true; return pt;
    }
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
/* Peso homogéneo con nivel de estudios (columna peso_estudios): el peso del CIS anterior a nov-2023 ajustado al nivel
   de estudios, el mismo desde entonces. Con él, R10 deja de ser un corte: queda como ruptura B con su nota. */
const pesoEstudios = cfg => !!cfg.pesoEstudios && !!META.columnas.peso_estudios;
const RUPTURA_ESTUDIOS = 'R10';
const NOTA_ESTUDIOS = 'Peso homogéneo con nivel de estudios: hasta octubre de 2023 el peso del CIS no ajustaba por nivel de estudios (R10); aquí se ajusta por raking al nivel de estudios dentro de cada grupo de sexo y edad, con la estructura educativa de noviembre y diciembre de 2023, y desde noviembre de 2023 es el peso del CIS. Es una estimación propia: no coincide con las tablas del CIS anteriores a noviembre de 2023. El margen de error usa el efecto de diseño de los nuevos pesos.';
function rupturas(cfg) {
  const ids = new Set(conceptosDe(cfg).flatMap(c => META.conceptos[c]?.rupturas || []));
  const homogeneo = pesoEstudios(cfg);
  return META.rupturas
    .filter(r => ids.has(r.ruptura_id) && (r.tipo === 'C' || r.tipo === 'B') && !/descartada/.test(r.estado))
    .map(r => (homogeneo && r.ruptura_id === RUPTURA_ESTUDIOS && r.tipo === 'C'
      ? { ...r, tipo: 'B', descripcion: 'Resuelta con el peso homogéneo: la ponderación por nivel de estudios se aplica también antes de noviembre de 2023 (estimación propia). ' + r.descripcion }
      : r))
    .flatMap(r => mesesRuptura(r).map(m => ({ ...r, m })));
}
/* Cómo se nombra una ruptura: en la guía, la etiqueta corta («ponderación por estudios»); en el explorador, el código
   (R10), que es el que figura en la nota metodológica y en los CSV. En tooltips y notas, ambos. */
const nombreRuptura = (r, cfg) => (cfg && cfg.guia && r.etiqueta_corta ? r.etiqueta_corta : r.ruptura_id);
const tituloRuptura = r => `${r.ruptura_id}${r.etiqueta_corta ? ' · ' + r.etiqueta_corta : ''}`;
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
