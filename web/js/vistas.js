/* Barómetro a barómetro: vistas que agregan varios barómetros o cruzan dos preguntas.
   Transferencias de voto, dispersión de electorados, mapa por comunidades, mapa de calor y comparación de dos barómetros.
   Cada vista devuelve { titulo, meta, notas, tabla, csv } y la pinta en host; usa las funciones comunes de app.js. */
'use strict';

const PARTIDISTAS = ['intencion_voto', 'voto_simpatia', 'intencion_voto_r', 'simpatia', 'cercania', 'intencion_alternativa'];
const CCAA_INE = {
  'Andalucía': '01', 'Aragón': '02', 'Asturias (Principado de)': '03', 'Balears (Illes)': '04', 'Canarias': '05', 'Cantabria': '06',
  'Castilla y León': '07', 'Castilla-La Mancha': '08', 'Cataluña': '09', 'Comunitat Valenciana': '10', 'Extremadura': '11', 'Galicia': '12',
  'Madrid (Comunidad de)': '13', 'Murcia (Región de)': '14', 'Navarra (Comunidad Foral de)': '15', 'País Vasco': '16', 'Rioja (La)': '17',
  'Ceuta (Ciudad Autónoma de)': '18', 'Melilla (Ciudad Autónoma de)': '19',
};
const rampa = () => [0, 1, 2, 3, 4, 5, 6].map(i => getComputedStyle(document.documentElement).getPropertyValue('--s' + i).trim());

/* ---------- utilidades ---------- */
const idxMes = mes => (mes && ESTI[mes] != null ? ESTI[mes] : EST.length - 1);
function periodoTxt(res, idxs) {
  if (!idxs.length) return '';
  const a = res.filas[idxs[idxs.length - 1]].e.mes, b = res.filas[idxs[0]].e.mes;
  return idxs.length === 1 ? mesLargo(b) : `${mesCorto(a)} a ${mesCorto(b)} (${idxs.length} barómetros)`;
}
// cálculo de un periodo que acaba en mes y acumula hasta k barómetros sin cruzar rupturas C
async function calcularPeriodo(spec, mes, k) {
  const iF = idxMes(mes);
  const desde = EST[Math.max(0, iF - Math.max(12, 4 * k))].mes, hasta = EST[iF].mes;
  const res = await calcular({ ...spec, desde, hasta });
  const idxs = ventana(res, spec, res.filas.length - 1, k);
  return { res, idxs };
}
// indicador = { preg, cat }: % de una respuesta o media de una escala
function indicadorInfo(ind) {
  const P = preg(ind.preg);
  if (!P) return null;
  if (P.tipo === 'media') return { P, id: P.cols[0], media: true, label: P.t, corto: P.t.replace(/ \(media\)$/, '') };
  if (P.tipo === 'medias') {
    const id = ind.cat && P.cols.includes(ind.cat) ? ind.cat : P.cols[0];
    const nom = etiqueta(id, id);
    return { P, id, media: true, label: `Valoración de ${nom} (1 a 10)`, corto: `Valoración de ${nom}` };
  }
  const conc = P.cols[0];
  const id = ind.cat || (META.conceptos[conc]?.categorias || [])[0]?.id;
  const nom = etiqueta(conc, id);
  return { P, id, media: false, label: `${P.t}: ${nom} (%)`, corto: `${nom} (%)` };
}
const fmtV = (v, media) => v == null ? '—' : media ? fmt2(v) : fmt1(v) + ' %';
async function porGrupos(ind, grupo, cfg, mes, k) {
  const I = indicadorInfo(ind);
  const spec = { preg: ind.preg, cruce: grupo, filtro: cfg.filtro || null, exNR: cfg.exNR, recuerdo: cfg.recuerdo };
  const [{ res, idxs }, tot] = await Promise.all([calcularPeriodo(spec, mes, k), calcularPeriodo({ ...spec, cruce: null }, mes, k)]);
  return conVentana({ I, spec, res, tot: tot.res }, idxs);
}
// valores por grupo y total acumulando los barómetros idxs (los dos cálculos cubren los mismos meses)
function conVentana(D, idxs) {
  const valores = {};
  D.res.glev.forEach((gid, g) => { valores[gid] = acumular(D.res, idxs, g, D.I.id); });
  return { ...D, idxs, valores, total: acumular(D.tot, idxs, 0, D.I.id) };
}
// ventana común a varios indicadores: los últimos k barómetros en que se hacen todas las preguntas, sin cruzar una
// ruptura C de ninguna de ellas
const conPregunta = f => f.grupos.some(gr => (gr.n || 0) > 0 || Object.keys(gr.ns || {}).length);
function ventanaComun(Ds, k) {
  const cortes = Ds.flatMap(D => rupturas(D.spec).filter(r => r.tipo === 'C').map(r => r.m));
  const tramo = mes => cortes.filter(c => c <= mes).length;
  const filas = Ds[0].res.filas, i = filas.length - 1, t = tramo(filas[i].e.mes), out = [];
  for (let j = i; j >= 0 && j > i - k; j--) {
    if (tramo(filas[j].e.mes) !== t) break;
    if (Ds.every(D => conPregunta(D.res.filas[j]))) out.push(j);
  }
  return out;
}
const etiquetaGrupo = (grupo, gid) => etiqueta(grupo, gid);
function svgBase(host, W, H, titulo) {
  host.innerHTML = '';
  return d3.select(host).append('svg').attr('xmlns', 'http://www.w3.org/2000/svg').attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', W).attr('height', H).attr('font-family', PAL.font).attr('font-size', 12).style('background', PAL.surface)
    .attr('role', 'img').attr('aria-label', titulo);
}
const textoSobre = col => lumin(col) > .35 ? '#1c1d1f' : '#ffffff';
const recortar = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
function vivienda() {
  const c = META.conceptos.prob_esp_1?.categorias || [];
  return (c.find(x => x.etiqueta === 'La vivienda') || c[0] || {}).id;
}

/* ---------- transferencias de voto ---------- */
// por defecto (vista y editor): las 9 respuestas con más peso en el total y las 8 filas de recuerdo con más entrevistas
const colsDefectoTransf = (ids, share) => ids.slice().sort((a, z) => share(z) - share(a)).slice(0, 9);
const filasDefectoTransf = (filas, nFila) => filas.slice().sort((a, z) => nFila(z) - nFila(a)).slice(0, 8);
async function vistaTransferencias(host, cfg) {
  const pregId = PARTIDISTAS.includes(cfg.preg) ? cfg.preg : 'intencion_voto_r';
  const P = preg(pregId);
  if (!disponible(P) || !META.columnas.recuerdo_voto) throw new Error('Serie no disponible.');
  const k = cfg.acum || 3;
  const spec = { preg: pregId, cruce: 'recuerdo_voto', filtro: cfg.filtro || null, exNR: cfg.exNR };
  const { res, idxs } = await calcularPeriodo(spec, cfg.mes, k);
  if (!idxs.length) return { vacio: 'No hay barómetros con estas preguntas en el periodo elegido.' };
  const tot = await calcularPeriodo({ ...spec, cruce: null }, cfg.mes, k);
  const conc = P.cols[0];
  // columnas: respuestas de la intención; filas: recuerdo de voto
  const ids = res.ids.filter(id => id !== 'NP');
  const shareTot = id => acumular(tot.res, tot.idxs, 0, id).v ?? 0;
  const cols = (cfg.cats && cfg.cats.length ? cfg.cats.filter(id => ids.includes(id)) : colsDefectoTransf(ids, shareTot)).slice(0, MAX_SERIES);
  const nRow = gid => acumular(res, idxs, res.glev.indexOf(gid), cols[0]).n || 0;
  const rowsAll = res.glev.filter(id => id !== 'NP' && !NR.has(id));
  const rows = (cfg.gcats && cfg.gcats.length ? cfg.gcats.filter(id => res.glev.includes(id)) : filasDefectoTransf(rowsAll, nRow)).slice(0, MAX_SERIES);
  const ref = res.filas[idxs[0]].e.mes >= '2023-10' ? 'generales de 2023' : 'generales de 2019';
  const celdas = rows.map(gid => {
    const g = res.glev.indexOf(gid);
    const vals = cols.map(cid => acumular(res, idxs, g, cid));
    const n = vals[0]?.n || 0;
    const ok = n >= MIN_N;
    const resto = ok ? Math.max(0, 100 - d3.sum(vals, d => d.v ?? 0)) : null;
    return { gid, n, ok, vals, resto };
  });
  // dibujo: matriz con escala secuencial (raíz cuadrada para distinguir valores pequeños)
  const R = rampa();
  const color = d3.scaleSequentialSqrt(d3.interpolateRgbBasis(R)).domain([0, 100]);
  const W = Math.max(320, Math.round(host.clientWidth || 600));
  const labW = Math.min(150, Math.max(80, d3.max(rows, r => etiquetaGrupo('recuerdo_voto', r).length) * 6.6 + 12));
  const nW = 58, headH = 44;
  const ncol = cols.length + 1;
  const cellW = Math.max(26, (W - labW - nW - 8) / ncol), cellH = 28;
  const Wt = labW + cellW * ncol + nW + 8;
  const H = headH + rows.length * cellH + 6;
  const svg = svgBase(host, Wt, H, 'Transferencias de voto');
  host.style.overflowX = Wt > W ? 'auto' : '';
  if (Wt > W) svg.style('width', `${Wt}px`).style('max-width', 'none');
  const colLab = cid => cid === '__resto' ? 'Resto' : etiqueta(conc, cid);
  [...cols, '__resto'].forEach((cid, j) => {
    const xx = labW + j * cellW + cellW / 2;
    const words = colLab(cid).split(/\s+/);
    const l1 = [], l2 = [];
    for (const w of words) { if (!l2.length && (!l1.length || [...l1, w].join(' ').length * 6 <= cellW - 2)) l1.push(w); else l2.push(w); }
    const t = svg.append('text').attr('x', xx).attr('y', headH - 22).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', PAL.ink2);
    t.append('tspan').attr('x', xx).text(recortar(l1.join(' '), Math.max(3, Math.floor(cellW / 6))));
    if (l2.length) t.append('tspan').attr('x', xx).attr('dy', 13).text(recortar(l2.join(' '), Math.max(3, Math.floor(cellW / 6))));
    t.append('title').text(colLab(cid));
  });
  svg.append('text').attr('x', labW + ncol * cellW + 6).attr('y', headH - 9).attr('font-size', 11).attr('fill', PAL.ink3).text('Base (n)');
  svg.append('text').attr('x', 4).attr('y', headH - 9).attr('font-size', 11).attr('fill', PAL.ink3).text('Votó en 2023 a…'.replace('2023', ref.slice(-4)));
  celdas.forEach((r, i) => {
    const y = headH + i * cellH;
    const nomR = etiquetaGrupo('recuerdo_voto', r.gid);
    svg.append('text').attr('x', labW - 8).attr('y', y + cellH / 2 + 4).attr('text-anchor', 'end').attr('font-size', 12).attr('fill', PAL.ink2)
      .text(recortar(nomR, 22)).append('title').text(nomR);
    svg.append('text').attr('x', labW + ncol * cellW + 6).attr('y', y + cellH / 2 + 4).attr('font-size', 11).attr('fill', PAL.ink3).text(fmtInt(r.n));
    if (!r.ok) { svg.append('text').attr('x', labW + 6).attr('y', y + cellH / 2 + 4).attr('font-size', 11).attr('fill', PAL.ink3).text(`Menos de ${MIN_N} entrevistas`); return; }
    [...r.vals.map((d, j) => ({ ...d, cid: cols[j] })), { v: r.resto, cid: '__resto' }].forEach((d, j) => {
      const x = labW + j * cellW, v = d.v ?? 0;
      const fill = d.cid === '__resto' ? PAL.line : color(v);
      const g = svg.append('g');
      g.append('rect').attr('x', x + 1).attr('y', y + 1).attr('width', cellW - 2).attr('height', cellH - 2).attr('fill', fill);
      if (d.cid === r.gid) g.append('rect').attr('x', x + 2).attr('y', y + 2).attr('width', cellW - 4).attr('height', cellH - 4).attr('fill', 'none').attr('stroke', PAL.ink).attr('stroke-width', 1.5);
      if (cellW >= 30 || v >= 10) g.append('text').attr('x', x + cellW / 2).attr('y', y + cellH / 2 + 4).attr('text-anchor', 'middle').attr('font-size', 10.5)
        .attr('font-weight', v >= 20 ? 600 : 400).attr('fill', textoSobre(fill)).text(cellW >= 36 ? fmt1(v) : String(Math.round(v)));
      g.append('rect').attr('class', 'hit').attr('x', x).attr('y', y).attr('width', cellW).attr('height', cellH).attr('fill', 'transparent')
        .on('pointermove', ev => showTip(`<b>Votó a ${esc(nomR)} (${esc(ref)})</b><div class="r"><span>${esc(colLab(d.cid))}</span><span>${fmt1(v)} %</span></div>` +
          (d.lo != null ? `<div class="tnote">Margen al 95 %: ${fmt1(d.lo)} a ${fmt1(d.hi)}. Base: ${fmtInt(r.n)} entrevistas.</div>` : ''), ev))
        .on('pointerleave', hideTip);
    });
  });
  svg.selectAll('text, rect:not(.hit)').attr('pointer-events', 'none');
  const per = periodoTxt(res, idxs);
  const filasT = celdas.map(r => [etiquetaGrupo('recuerdo_voto', r.gid), ...r.vals.map(d => r.ok ? fmt1(d.v ?? 0) : 'n < 50'), r.ok ? fmt1(r.resto) : '', fmtInt(r.n)]);
  return {
    titulo: `Transferencias de voto: recuerdo (${ref}) y ${P.t.toLowerCase()}`,
    meta: `% de cada fila. ${per}${cfg.filtro ? '. Solo ' + etiqueta(cfg.filtro.col, cfg.filtro.val) : ''}`,
    notas: ['Cada fila suma 100 %. Recuadro: mismo partido en el recuerdo y en la respuesta actual.',
      ref === 'generales de 2023' && idxs.length ? '' : 'Antes de octubre de 2023 el recuerdo se refiere a las generales de noviembre de 2019 (R09).',
      'Se acumulan barómetros consecutivos para ganar muestra; la acumulación no cruza rupturas de tipo C.'].filter(Boolean),
    tabla: { cab: ['Recuerdo de voto', ...cols.map(colLab), 'Resto', 'Base (n)'], filas: filasT },
    csv: { cab: ['recuerdo', 'respuesta', 'valor', 'margen_inferior', 'margen_superior', 'n_base'],
      filas: celdas.flatMap(r => r.vals.map((d, j) => [etiquetaGrupo('recuerdo_voto', r.gid), colLab(cols[j]), d.v, d.lo, d.hi, r.n])) },
  };
}

/* ---------- dispersión de electorados ---------- */
// Los dos ejes se calculan sobre los mismos barómetros. Lo usan la vista y el editor (grupos por defecto).
const NO_ELECTORADO = new Set(['BLANCO', 'NULO', 'OTRO', 'NINGUNO']);
async function datosDispersion(cfg) {
  const grupo = cfg.grupo || 'voto_simpatia';
  const ix = cfg.x || { preg: 'ideologia' }, iy = cfg.y || { preg: 'prob_esp', cat: vivienda() };
  const k = cfg.acum || 3;
  if (!META.columnas[grupo] || !indicadorInfo(ix) || !indicadorInfo(iy) || !disponible(indicadorInfo(ix).P) || !disponible(indicadorInfo(iy).P)) throw new Error('Serie no disponible.');
  let [X, Y] = await Promise.all([porGrupos(ix, grupo, cfg, cfg.mes, k), porGrupos(iy, grupo, cfg, cfg.mes, k)]);
  const idxs = ventanaComun([X, Y], k);
  X = conVentana(X, idxs); Y = conVentana(Y, idxs);
  const nOf = gid => Math.min(X.valores[gid]?.n || 0, Y.valores[gid]?.n || 0);
  const cand = X.res.glev.filter(id => id !== 'NP' && !NR.has(id)).sort((a, z) => nOf(z) - nOf(a));
  return { grupo, k, X, Y, nOf, cand, defecto: cand.filter(id => !NO_ELECTORADO.has(id)).slice(0, 10) };
}
async function vistaDispersion(host, cfg) {
  const { grupo, X, Y, nOf, cand, defecto } = await datosDispersion(cfg);
  const puntos0 = cfg.gcats && cfg.gcats.length ? cfg.gcats.filter(id => cand.includes(id)) : defecto;
  const pts = puntos0.slice(0, MAX_SERIES).map(gid => ({ gid, label: etiquetaGrupo(grupo, gid), x: X.valores[gid], y: Y.valores[gid] }))
    .filter(p => p.x && p.y && p.x.v != null && p.y.v != null);
  const omit = puntos0.length - pts.length;
  if (!pts.length) return { vacio: 'Ningún grupo llega a 50 entrevistas en las dos preguntas. Acumula más barómetros.' };
  const total = { gid: '__total', label: 'Total', x: X.total, y: Y.total };
  const col = colores(pts.map(p => ({ id: p.gid })), { preg: 'intencion_voto', cruce: PARTIDISTAS.includes(grupo) || grupo === 'recuerdo_voto' ? 'intencion_voto' : grupo }, 'grupo');
  const W = Math.max(300, Math.round(host.clientWidth || 600));
  const H = Math.round(Math.max(300, Math.min(480, W * 0.68)));
  const m = { l: 52, r: 18, t: 14, b: 44 };
  const svg = svgBase(host, W, H, 'Dispersión de electorados');
  const banda = cfg.banda ?? false;
  const ext = (k2) => { const vs = [...pts, total].flatMap(p => p[k2].v == null ? [] : banda ? [p[k2].lo, p[k2].hi] : [p[k2].v]); const a = d3.min(vs), b = d3.max(vs), pad = (b - a) * .1 || 1; return [a - pad, b + pad]; };
  const x = d3.scaleLinear().domain(ext('x')).nice().range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain(ext('y')).nice().range([H - m.b, m.t]);
  const r = d3.scaleSqrt().domain([0, d3.max(pts, p => nOf(p.gid))]).range([3, 16]);
  const axis = g => { g.selectAll('text').attr('fill', PAL.ink3).attr('font-size', 11); g.selectAll('.tick line').attr('stroke', PAL.line); g.select('.domain').remove(); };
  svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.round(W / 90))).tickSize(-(H - m.t - m.b)).tickFormat(v => X.I.media ? fmt1(v) : fmtInt(v))).call(axis);
  svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(W - m.l - m.r)).tickFormat(v => Y.I.media ? fmt1(v) : fmtInt(v))).call(axis);
  svg.append('text').attr('x', W - m.r).attr('y', H - 8).attr('text-anchor', 'end').attr('font-size', 11.5).attr('fill', PAL.ink2).text(X.I.label);
  svg.append('text').attr('transform', `translate(13,${m.t}) rotate(-90)`).attr('text-anchor', 'end').attr('font-size', 11.5).attr('fill', PAL.ink2).text(Y.I.label);
  if (banda) pts.forEach(p => {
    svg.append('line').attr('x1', x(p.x.lo)).attr('x2', x(p.x.hi)).attr('y1', y(p.y.v)).attr('y2', y(p.y.v)).attr('stroke', col[p.gid]).attr('stroke-opacity', .6);
    svg.append('line').attr('x1', x(p.x.v)).attr('x2', x(p.x.v)).attr('y1', y(p.y.lo)).attr('y2', y(p.y.hi)).attr('stroke', col[p.gid]).attr('stroke-opacity', .6);
  });
  // puntos primero; luego etiquetas que no pisen puntos ni otras etiquetas; las que no caben van a una leyenda inferior
  const cajas = [];
  const orden = pts.slice().sort((a, z) => nOf(z.gid) - nOf(a.gid));
  if (total.x.v != null && total.y.v != null) {
    const tx = x(total.x.v), ty = y(total.y.v);
    svg.append('circle').attr('cx', tx).attr('cy', ty).attr('r', 6).attr('fill', 'none').attr('stroke', PAL.ink2).attr('stroke-width', 1.5);
    cajas.push([tx - 7, ty - 7, tx + 7, ty + 7]);
  }
  orden.forEach(p => {
    const cx = x(p.x.v), cy = y(p.y.v), rr = r(nOf(p.gid));
    p._c = [cx, cy, rr];
    svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', rr).attr('fill', col[p.gid]).attr('fill-opacity', .85).attr('stroke', PAL.surface).attr('stroke-width', 2);
    cajas.push([cx - rr, cy - rr, cx + rr, cy + rr]);
  });
  const choca = b => cajas.some(c => !(b[2] < c[0] || b[0] > c[2] || b[3] < c[1] || b[1] > c[3])) || b[0] < m.l || b[2] > W - m.r || b[1] < m.t - 4 || b[3] > H - m.b;
  const colocar = (label, cx, cy, rr, peso) => {
    const w = label.length * (peso ? 6.6 : 6) + 2;
    const ops = [[cx + rr + 4, cy + 4, 'start'], [cx - rr - 4, cy + 4, 'end'], [cx, cy - rr - 5, 'middle'], [cx, cy + rr + 13, 'middle'],
      [cx + rr + 2, cy - rr - 2, 'start'], [cx - rr - 2, cy - rr - 2, 'end'], [cx + rr + 2, cy + rr + 11, 'start'], [cx - rr - 2, cy + rr + 11, 'end']];
    const caja = ([tx, ty, a]) => { const x0 = a === 'start' ? tx : a === 'end' ? tx - w : tx - w / 2; return [x0, ty - 10, x0 + w, ty + 2]; };
    const sel = ops.find(o => !choca(caja(o)));
    if (!sel) return false;
    cajas.push(caja(sel));
    svg.append('text').attr('x', sel[0]).attr('y', sel[1]).attr('text-anchor', sel[2]).attr('font-size', 11.5).attr('font-weight', peso ? 600 : 400)
      .attr('fill', peso ? PAL.ink : PAL.ink2).text(label);
    return true;
  };
  if (total.x.v != null && total.y.v != null) colocar('Total', x(total.x.v), y(total.y.v), 6, false);
  const sinEtiqueta = orden.filter(p => !colocar(p.label, ...p._c, true));
  orden.forEach(p => {
    const [cx, cy, rr] = p._c;
    svg.append('circle').attr('class', 'hit').attr('cx', cx).attr('cy', cy).attr('r', Math.max(12, rr + 4)).attr('fill', 'transparent')
      .on('pointermove', ev => showTip(`<b>${esc(p.label)}</b><div class="r"><span>${esc(X.I.corto)}</span><span>${fmtV(p.x.v, X.I.media)}</span></div><div class="r"><span>${esc(Y.I.corto)}</span><span>${fmtV(p.y.v, Y.I.media)}</span></div>` +
        `<div class="tnote">Márgenes al 95 %: ${fmtV(p.x.lo, X.I.media)} a ${fmtV(p.x.hi, X.I.media)}; ${fmtV(p.y.lo, Y.I.media)} a ${fmtV(p.y.hi, Y.I.media)}. Base: ${fmtInt(nOf(p.gid))} entrevistas.</div>`, ev))
      .on('pointerleave', hideTip);
  });
  if (sinEtiqueta.length) {
    // leyenda para los puntos sin etiqueta: se amplía el lienzo por abajo
    const perRow = Math.max(1, Math.floor((W - 16) / 150)), extra = Math.ceil(sinEtiqueta.length / perRow) * 18 + 6;
    svg.attr('viewBox', `0 0 ${W} ${H + extra}`).attr('height', H + extra);
    sinEtiqueta.forEach((p, i) => {
      const gx = 8 + (i % perRow) * ((W - 16) / perRow), gy = H + 4 + Math.floor(i / perRow) * 18;
      svg.append('circle').attr('cx', gx + 5).attr('cy', gy + 6).attr('r', 5).attr('fill', col[p.gid]);
      svg.append('text').attr('x', gx + 15).attr('y', gy + 10).attr('font-size', 11.5).attr('fill', PAL.ink2).text(p.label);
    });
  }
  svg.selectAll('text, line, circle:not(.hit)').attr('pointer-events', 'none');
  const per = periodoTxt(X.res, X.idxs);
  return {
    titulo: `${CRUCE_DE[grupo] || 'Grupos'}: ${X.I.corto.toLowerCase()} y ${Y.I.corto.toLowerCase()}`,
    meta: `Cada punto es un grupo; tamaño según entrevistas. ${per}${cfg.filtro ? '. Solo ' + etiqueta(cfg.filtro.col, cfg.filtro.val) : ''}`,
    notas: ['La relación entre los dos ejes es descriptiva: compara grupos, no personas, y no implica causalidad.',
      ...(omit > 0 ? [`${omit} ${omit === 1 ? 'grupo no llega' : 'grupos no llegan'} a ${MIN_N} entrevistas y no se muestra${omit === 1 ? '' : 'n'}.`] : [])],
    tabla: { cab: [CRUCE_DE[grupo] || 'Grupo', X.I.corto, Y.I.corto, 'Base (n)'], filas: [...pts, total].map(p => [p.label, fmtV(p.x.v, X.I.media), fmtV(p.y.v, Y.I.media), fmtInt(p.gid === '__total' ? Math.min(p.x.n, p.y.n) : nOf(p.gid))]) },
    csv: { cab: ['grupo', 'x', 'x_inf', 'x_sup', 'y', 'y_inf', 'y_sup', 'n_base'], filas: [...pts, total].map(p => [p.label, p.x.v, p.x.lo, p.x.hi, p.y.v, p.y.lo, p.y.hi, p.gid === '__total' ? Math.min(p.x.n, p.y.n) : nOf(p.gid)]) },
  };
}

/* ---------- mapa por comunidades ---------- */
let GEO = null;
async function geometria() {
  if (GEO) return GEO;
  const r = await fetch('datos_fijos/ccaa.json');
  if (!r.ok) throw new Error('No se ha podido cargar el mapa.');
  const topo = await r.json();
  GEO = topojson.feature(topo, topo.objects.autonomous_regions).features.filter(f => f.id !== '20');
  return GEO;
}
async function vistaMapa(host, cfg) {
  const ind = cfg.ind || { preg: 'prob_esp', cat: vivienda() };
  const I0 = indicadorInfo(ind);
  if (!I0 || !disponible(I0.P)) throw new Error('Serie no disponible.');
  const k = cfg.acum || 6;
  const [D, feats] = await Promise.all([porGrupos(ind, 'ccaa', cfg, cfg.mes, k), geometria()]);
  const val = {};
  Object.entries(D.valores).forEach(([nom, p]) => { if (CCAA_INE[nom]) val[CCAA_INE[nom]] = { ...p, nom }; });
  const vs = Object.values(val).filter(p => p.v != null).map(p => p.v);
  if (!vs.length) return { vacio: 'Ninguna comunidad llega a 50 entrevistas. Acumula más barómetros.' };
  const R = rampa().slice(1, 6);
  const dom = d3.extent(vs);
  const q = d3.scaleQuantize().domain(dom).range(R).nice();
  const cortes = q.thresholds();
  const W = Math.max(300, Math.round(host.clientWidth || 600));
  const H = Math.round(W * 0.66) + 40;
  const svg = svgBase(host, W, H, 'Mapa por comunidades');
  const proj = d3.geoConicConformalSpain().fitExtent([[6, 6], [W - 6, H - 46]], { type: 'FeatureCollection', features: feats });
  const path = d3.geoPath(proj);
  feats.forEach(f => {
    const p = val[f.id];
    const fill = p && p.v != null ? q(p.v) : PAL.line;
    svg.append('path').attr('d', path(f)).attr('fill', fill).attr('stroke', PAL.surface).attr('stroke-width', 1)
      .attr('class', 'hit').style('cursor', 'default')
      .on('pointermove', ev => showTip(`<b>${esc(p ? p.nom : f.properties.name)}</b>` + (p && p.v != null
        ? `<div class="r"><span>${esc(D.I.corto)}</span><span>${fmtV(p.v, D.I.media)}</span></div><div class="tnote">Margen al 95 %: ${fmtV(p.lo, D.I.media)} a ${fmtV(p.hi, D.I.media)}. Base: ${fmtInt(p.n)} entrevistas.</div>`
        : `<div class="tnote">Menos de ${MIN_N} entrevistas en el periodo.</div>`), ev))
      .on('pointerleave', hideTip);
  });
  try { svg.append('path').attr('d', proj.getCompositionBorders()).attr('fill', 'none').attr('stroke', PAL.line2); } catch (e) { /* sin recuadro */ }
  // leyenda
  const lw = Math.min(64, (W - 140) / R.length), ly = H - 30;
  R.forEach((c, i) => svg.append('rect').attr('x', 8 + i * lw).attr('y', ly).attr('width', lw - 2).attr('height', 10).attr('fill', c));
  [dom[0], ...cortes, dom[1]].forEach((t, i) => { if (i === 0 || i === R.length) return; svg.append('text').attr('x', 8 + i * lw - 1).attr('y', ly + 23).attr('text-anchor', 'middle').attr('font-size', 10.5).attr('fill', PAL.ink2).text(D.I.media ? fmt1(t) : fmt1(t)); });
  svg.append('rect').attr('x', 8 + R.length * lw + 14).attr('y', ly).attr('width', 18).attr('height', 10).attr('fill', PAL.line);
  svg.append('text').attr('x', 8 + R.length * lw + 36).attr('y', ly + 9).attr('font-size', 10.5).attr('fill', PAL.ink2).text(`n < ${MIN_N}`);
  svg.selectAll('text, rect').attr('pointer-events', 'none');
  const filas = Object.values(val).sort((a, z) => (z.v ?? -1) - (a.v ?? -1));
  return {
    titulo: `${D.I.label.replace(/ \(%\)$/, '')}, por comunidad autónoma`,
    meta: `${D.I.media ? 'Media de 1 a 10' : '% de entrevistados'}. ${periodoTxt(D.res, D.idxs)}${cfg.filtro ? '. Solo ' + etiqueta(cfg.filtro.col, cfg.filtro.val) : ''}`,
    notas: [`Total de España: ${fmtV(D.total.v, D.I.media)}. Los barómetros no están diseñados para dar resultados por comunidad${k > 1 ? `: se acumulan hasta ${k} barómetros para ganar muestra, y` : ':'} las comunidades pequeñas tienen márgenes amplios (ver tabla).`,
      'Geometrías: es-atlas, a partir del Instituto Geográfico Nacional.'],
    tabla: { cab: ['Comunidad', D.I.corto, 'Margen inferior', 'Margen superior', 'Base (n)'], filas: filas.map(p => [p.nom, fmtV(p.v, D.I.media), fmtV(p.lo, D.I.media), fmtV(p.hi, D.I.media), fmtInt(p.n || 0)]) },
    csv: { cab: ['comunidad', 'valor', 'margen_inferior', 'margen_superior', 'n_base'], filas: filas.map(p => [p.nom, p.v, p.lo, p.hi, p.n]) },
  };
}

/* ---------- mapa de calor: meses × respuestas ---------- */
async function vistaCalor(host, cfg) {
  const P = preg(cfg.preg);
  if (!disponible(P) || !['cat', 'multi'].includes(P.tipo)) throw new Error('El mapa de calor necesita una pregunta de respuestas (no una media).');
  const res = await calcular({ ...cfg, cruce: null });
  const conc = P.cols[0];
  const media = id => d3.mean(res.filas, f => f.grupos[0].vals[id] ?? null);
  const cands = res.ids.filter(id => !NR.has(id));
  const filasIds = (cfg.cats && cfg.cats.length ? cfg.cats.filter(id => res.ids.includes(id)) : cands.slice().sort((a, z) => (media(z) ?? 0) - (media(a) ?? 0)).slice(0, 15)).slice(0, 20);
  const meses = res.filas.map(f => f.e.mes);
  const W = Math.max(300, Math.round(host.clientWidth || 600));
  const labW = Math.min(W < 520 ? 150 : 250, Math.max(90, d3.max(filasIds, id => etiqueta(conc, id).length) * 6.2 + 10));
  const cellW = Math.max(7, (W - labW - 12) / meses.length), cellH = 20;
  const Wt = Math.round(labW + cellW * meses.length + 12);
  const H = 22 + filasIds.length * cellH + 40;
  host.style.overflowX = Wt > W ? 'auto' : '';
  const svg = svgBase(host, Wt, H, 'Mapa de calor');
  if (Wt > W) svg.style('width', `${Wt}px`).style('max-width', 'none');
  const vals = filasIds.flatMap(id => res.filas.map(f => puntoDe(res, f, 0, id).v)).filter(v => v != null);
  const color = d3.scaleSequentialSqrt(d3.interpolateRgbBasis(rampa())).domain([0, d3.max(vals) || 1]);
  // años
  meses.forEach((mes, j) => { if (mes.endsWith('-01') || j === 0) svg.append('text').attr('x', labW + j * cellW).attr('y', 14).attr('font-size', 11).attr('fill', PAL.ink3).text(mes.slice(0, 4)); });
  filasIds.forEach((id, i) => {
    const y = 22 + i * cellH, nom = etiqueta(conc, id);
    svg.append('text').attr('x', labW - 8).attr('y', y + cellH / 2 + 4).attr('text-anchor', 'end').attr('font-size', 11.5).attr('fill', PAL.ink2).text(recortar(nom, Math.floor((labW - 10) / 6.8))).append('title').text(nom);
    res.filas.forEach((f, j) => {
      const p = puntoDe(res, f, 0, id);
      const fill = p.v == null ? PAL.chip || PAL.line : color(p.v);
      svg.append('rect').attr('x', labW + j * cellW).attr('y', y).attr('width', Math.max(1, cellW - 1)).attr('height', cellH - 1).attr('fill', p.v == null ? PAL.line : fill)
        .attr('class', 'hit')
        .on('pointermove', ev => showTip(`<b>${esc(mesLargo(f.e.mes))}</b><div class="r"><span>${esc(nom)}</span><span>${p.v == null ? (p.omit ? 'n < 50' : 'sin dato') : fmt1(p.v) + ' %'}</span></div>`, ev))
        .on('pointerleave', hideTip);
    });
  });
  if (!cfg.sinRupturas) rupturas(cfg).filter(r => r.tipo === 'C' && r.m > meses[0] && r.m <= meses[meses.length - 1]).forEach(r => {
    const j = meses.findIndex(m2 => m2 >= r.m);
    const xx = labW + j * cellW - 0.5;
    svg.append('line').attr('x1', xx).attr('x2', xx).attr('y1', 18).attr('y2', 22 + filasIds.length * cellH).attr('stroke', PAL.acc).attr('stroke-width', 1.5);
  });
  // leyenda continua
  const ly = H - 22, lw = Math.min(220, Wt - labW - 20);
  const gid = 'grad' + Math.random().toString(36).slice(2, 8);
  const grad = svg.append('defs').append('linearGradient').attr('id', gid);
  d3.range(0, 1.01, .1).forEach(t => grad.append('stop').attr('offset', `${t * 100}%`).attr('stop-color', color(t * color.domain()[1])));
  svg.append('rect').attr('x', labW).attr('y', ly).attr('width', lw).attr('height', 9).attr('fill', `url(#${gid})`);
  svg.append('text').attr('x', labW).attr('y', ly + 21).attr('font-size', 10.5).attr('fill', PAL.ink2).text('0 %');
  svg.append('text').attr('x', labW + lw).attr('y', ly + 21).attr('text-anchor', 'end').attr('font-size', 10.5).attr('fill', PAL.ink2).text(fmt1(color.domain()[1]) + ' %');
  svg.selectAll('text, line, rect:not(.hit)').attr('pointer-events', 'none');
  const rups = rupturas(cfg).filter(r => r.tipo === 'C');
  return {
    titulo: `${P.t}: evolución de las respuestas`,
    meta: `${P.tipo === 'multi' ? '% de entrevistados (hasta tres menciones)' : '% de entrevistados'}. ${mesCorto(meses[0])} a ${mesCorto(meses[meses.length - 1])}`,
    notas: [...new Map(rups.map(r => [r.ruptura_id, r])).values()].map(r => `${r.ruptura_id} (${mesCorto(r.m)}, tipo C): ${breveRuptura(r.descripcion)}`),
    tabla: { cab: ['Mes', ...filasIds.map(id => etiqueta(conc, id))], filas: res.filas.map(f => [mesCorto(f.e.mes), ...filasIds.map(id => fmtV(puntoDe(res, f, 0, id).v, false))]).reverse() },
    csv: { cab: ['mes', 'estudio', 'respuesta', 'valor', 'n_base'], filas: res.filas.flatMap(f => filasIds.map(id => { const p = puntoDe(res, f, 0, id); return [f.e.mes, f.e.estudio, etiqueta(conc, id), p.v, p.n]; })) },
  };
}

/* ---------- comparar dos barómetros ---------- */
// por defecto (vista y editor): las 8 respuestas con más peso en el barómetro final
const defectoComparar = (res, fB) => res.ids.filter(id => !NR.has(id)).map(id => [id, puntoDe(res, fB, 0, id).v ?? -1]).sort((x, z) => z[1] - x[1]).slice(0, 8).map(x => x[0]);
// barómetro inicial por defecto: el anterior al final
const mesInicialComparar = cfg => { const iB = idxMes(cfg.mesB); return cfg.mesA && ESTI[cfg.mesA] != null ? cfg.mesA : EST[Math.max(0, iB - 1)].mes; };
async function vistaComparar(host, cfg) {
  const P = preg(cfg.preg);
  if (!disponible(P)) throw new Error('Serie no disponible.');
  const iB = idxMes(cfg.mesB), iA = ESTI[mesInicialComparar(cfg)];
  const [a, b] = [Math.min(iA, iB), Math.max(iA, iB)];
  const res = await calcular({ ...cfg, cruce: null, desde: EST[a].mes, hasta: EST[b].mes });
  const fA = res.filas[0], fB = res.filas[res.filas.length - 1];
  const media = res.unidad === 'media';
  const nom = id => nombreResp(P, id);
  const ids = (cfg.cats && cfg.cats.length ? cfg.cats.filter(id => res.ids.includes(id)) : defectoComparar(res, fB)).slice(0, MAX_SERIES);
  const cortes = rupturas(cfg).filter(r => r.tipo === 'C' && r.m > fA.e.mes && r.m <= fB.e.mes);
  const comparable = !cortes.length;
  const filas = ids.map(id => {
    const pa = puntoDe(res, fA, 0, id), pb = puntoDe(res, fB, 0, id);
    let dif = null, sig = false;
    if (comparable && pa.v != null && pb.v != null) {
      dif = pb.v - pa.v;
      const se = Math.hypot(pa.se, pb.se);
      sig = se > 0 && Math.abs(dif) / se > 1.96;
    }
    return { id, pa, pb, dif, sig };
  });
  if (!filas.some(f => f.pa.v != null || f.pb.v != null)) return { vacio: 'No hay datos suficientes para esta combinación.' };
  const col = colores(ids.map(id => ({ id })), cfg, 'cat');
  const W = Math.max(300, Math.round(host.clientWidth || 600));
  const angosto = W < 520;   // móvil: etiquetas más cortas, leyenda desde el borde y menos marcas en el eje
  const labW = Math.min(angosto ? Math.round(W * .42) : Math.round(Math.min(300, W * .36)), Math.max(80, d3.max(ids, id => nom(id).length) * 6.4 + 14));
  const maxCh = Math.max(8, Math.floor((labW - 14) / 6.3));
  const rowH = 30, difW = angosto ? 70 : 78;
  const H = 34 + filas.length * rowH + 28;
  const svg = svgBase(host, W, H, 'Comparación de dos barómetros');
  const vals = filas.flatMap(f => [f.pa, f.pb]).flatMap(p => p.v == null ? [] : [p.lo, p.hi]);
  const x = d3.scaleLinear().domain(media ? [Math.max(0, d3.min(vals) - .3), Math.min(10, d3.max(vals) + .3)] : [0, d3.max(vals) * 1.05]).nice().range([labW, W - difW]);
  svg.append('g').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).ticks(Math.max(2, Math.min(5, Math.floor((W - difW - labW) / 55)))).tickSize(-(H - 26 - 30)).tickFormat(v => media ? fmt1(v) : v + ' %'))
    .call(g => { g.selectAll('text').attr('fill', PAL.ink3).attr('font-size', 11); g.selectAll('.tick line').attr('stroke', PAL.line); g.select('.domain').remove(); });
  // leyenda: si no cabe con los meses en largo, en corto
  const leyX = angosto ? 8 : labW;
  const cabe = (a, b) => 16 + a.length * 6.5 + 26 + b.length * 6.5 <= W - difW - leyX;
  const [mA, mB] = cabe(mesLargo(fA.e.mes), mesLargo(fB.e.mes)) ? [mesLargo(fA.e.mes), mesLargo(fB.e.mes)] : [mesCorto(fA.e.mes), mesCorto(fB.e.mes)];
  svg.append('circle').attr('cx', leyX + 6).attr('cy', 12).attr('r', 5).attr('fill', PAL.surface).attr('stroke', PAL.ink2).attr('stroke-width', 1.5);
  svg.append('text').attr('x', leyX + 16).attr('y', 16).attr('font-size', 11.5).attr('fill', PAL.ink2).text(mA);
  const lx = leyX + 32 + mA.length * 6.5;
  svg.append('circle').attr('cx', lx).attr('cy', 12).attr('r', 5).attr('fill', PAL.ink2);
  svg.append('text').attr('x', lx + 10).attr('y', 16).attr('font-size', 11.5).attr('fill', PAL.ink2).text(mB);
  svg.append('text').attr('x', W - 6).attr('y', 16).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', PAL.ink3).text(media ? 'Diferencia' : 'Puntos');
  filas.forEach((f, i) => {
    const y = 34 + i * rowH + rowH / 2;
    svg.append('text').attr('x', labW - 10).attr('y', y + 4).attr('text-anchor', 'end').attr('font-size', 12).attr('fill', PAL.ink2).text(recortar(nom(f.id), maxCh)).append('title').text(nom(f.id));
    if (f.pa.v != null && f.pb.v != null) svg.append('line').attr('x1', x(f.pa.v)).attr('x2', x(f.pb.v)).attr('y1', y).attr('y2', y).attr('stroke', PAL.line2).attr('stroke-width', 3);
    if (cfg.banda) [f.pa, f.pb].forEach((p, j) => { if (p.v != null) svg.append('line').attr('x1', x(p.lo)).attr('x2', x(p.hi)).attr('y1', y + (j ? 6 : -6)).attr('y2', y + (j ? 6 : -6)).attr('stroke', j ? col[f.id] : PAL.ink3); });
    if (f.pa.v != null) svg.append('circle').attr('cx', x(f.pa.v)).attr('cy', y).attr('r', 5).attr('fill', PAL.surface).attr('stroke', PAL.ink2).attr('stroke-width', 1.5);
    if (f.pb.v != null) svg.append('circle').attr('cx', x(f.pb.v)).attr('cy', y).attr('r', 5.5).attr('fill', col[f.id]).attr('stroke', PAL.surface).attr('stroke-width', 1.5);
    const casiCero = f.dif != null && Math.abs(f.dif) < (media ? .005 : .05);
    const dt = f.dif == null ? (comparable ? '—' : 's. c.') : casiCero ? (media ? '0,00' : '0,0') : `${f.dif > 0 ? '+' : '−'}${media ? fmt2(Math.abs(f.dif)) : fmt1(Math.abs(f.dif))}`;
    svg.append('text').attr('x', W - 6).attr('y', y + 4).attr('text-anchor', 'end').attr('font-size', 12).attr('font-weight', f.sig ? 700 : 400)
      .attr('fill', f.sig ? PAL.ink : PAL.ink3).text(dt + (f.dif != null && !f.sig ? ' n. s.' : ''));
    svg.append('rect').attr('class', 'hit').attr('x', 0).attr('y', y - rowH / 2).attr('width', W).attr('height', rowH).attr('fill', 'transparent')
      .on('pointermove', ev => showTip(`<b>${esc(nom(f.id))}</b><div class="r"><span>${esc(mesLargo(fA.e.mes))}</span><span>${fmtV(f.pa.v, media)}</span></div><div class="r"><span>${esc(mesLargo(fB.e.mes))}</span><span>${fmtV(f.pb.v, media)}</span></div>` +
        `<div class="tnote">${f.dif == null ? (comparable ? 'Sin dato en alguno de los dos meses.' : 'No comparable: hay una ruptura de tipo C entre ambos meses.') : f.sig ? 'Diferencia significativa al 95 %.' : 'Diferencia no significativa al 95 % (n. s.).'}</div>`, ev))
      .on('pointerleave', hideTip);
  });
  svg.selectAll('text, line, circle').attr('pointer-events', 'none');
  return {
    titulo: `${P.t}: ${mesCorto(fA.e.mes)} frente a ${mesCorto(fB.e.mes)}`,
    meta: `${media ? 'Media de 1 a 10' : P.tipo === 'multi' ? '% de entrevistados (hasta tres menciones)' : '% de entrevistados'}. Estudios ${fA.e.estudio} y ${fB.e.estudio}${cfg.filtro ? '. Solo ' + etiqueta(cfg.filtro.col, cfg.filtro.val) : ''}`,
    notas: comparable ? ['En negrita, las diferencias significativas al 95 % (con el efecto de diseño de cada estudio); «n. s.», no significativa.']
      : cortes.map(r => `No comparable: ${r.ruptura_id} (${mesCorto(r.m)}, tipo C) entre ambos meses. ${breveRuptura(r.descripcion)}.`),
    tabla: { cab: ['Respuesta', mesCorto(fA.e.mes), mesCorto(fB.e.mes), 'Diferencia'], filas: filas.map(f => [nom(f.id), fmtV(f.pa.v, media), fmtV(f.pb.v, media), f.dif == null ? '—' : (media ? fmt2(f.dif) : fmt1(f.dif)) + (f.sig ? '' : ' (n. s.)')]) },
    csv: { cab: ['respuesta', 'mes_a', 'valor_a', 'mes_b', 'valor_b', 'diferencia', 'significativa'], filas: filas.map(f => [nom(f.id), fA.e.mes, f.pa.v, fB.e.mes, f.pb.v, f.dif, f.sig]) },
  };
}

const VISTAS = { transferencias: vistaTransferencias, dispersion: vistaDispersion, mapa: vistaMapa, calor: vistaCalor, comparar: vistaComparar };
