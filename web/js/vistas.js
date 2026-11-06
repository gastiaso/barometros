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
      : ['«s. c.»: sin comparación, porque entre los dos meses hay una ruptura de tipo C.', ...cortes.map(r => `No comparable: ${r.ruptura_id} (${mesCorto(r.m)}, tipo C) entre ambos meses. ${breveRuptura(r.descripcion)}.`)],
    tabla: { cab: ['Respuesta', mesCorto(fA.e.mes), mesCorto(fB.e.mes), 'Diferencia'], filas: filas.map(f => [nom(f.id), fmtV(f.pa.v, media), fmtV(f.pb.v, media), f.dif == null ? '—' : (media ? fmt2(f.dif) : fmt1(f.dif)) + (f.sig ? '' : ' (n. s.)')]) },
    csv: { cab: ['respuesta', 'mes_a', 'valor_a', 'mes_b', 'valor_b', 'diferencia', 'significativa'], filas: filas.map(f => [nom(f.id), fA.e.mes, f.pa.v, fB.e.mes, f.pb.v, f.dif, f.sig]) },
  };
}

/* ---------- cada punto, una entrevista ---------- */
/* Nube en la que cada punto es una entrevista: el mes en horizontal (cada punto cae al azar dentro de su mes), la edad
   o la autoubicación ideológica en vertical, y el color según la persona cite una, otra, las dos o ninguna de dos
   respuestas de un bloque de problemas (hasta tres menciones). Sin ponderar y con la muestra igualada por mes, así que
   no es una estimación; la nota del panel mide en vivo cuánto se separa de la serie ponderada. Se dibuja en canvas:
   con más de 200.000 puntos, el SVG no es viable. Semilla fija: la misma configuración da siempre la misma imagen. */
const PUNTOS_SEMILLA = 7;
const PUNTOS_AREA_REF = 1e6;          // píxeles de dispositivo a partir de los cuales se dibuja la muestra igualada completa
const BLOQUES_PUNTOS = ['prob_per', 'prob_esp'];
const EJES_PUNTOS = { edad: 'edad', ideologia: 'autoubicación ideológica (1 a 10)' };
// generador con semilla (mulberry32): reproducible y suficiente para muestrear y desplazar puntos
const azar = s => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// etiqueta breve para la leyenda («La crisis económica, los problemas de índole económica» → «La crisis económica»)
const breve = s => String(s).replace(/,.*$/, '').replace(/\s*\(.*$/, '');
const minuscula = s => s.replace(/^(La|El|Los|Las)\b/, m => m.toLowerCase());
// respuesta de un bloque de problemas por su etiqueta
const idProblema = (pregId, inicio) => (META.conceptos[`${pregId}_1`]?.categorias || []).find(c => !c.no_respuesta && c.etiqueta.startsWith(inicio))?.id;
function defectoPuntos() {
  return { tipo: 'puntos', preg: 'prob_per', cats: [idProblema('prob_per', 'La vivienda'), idProblema('prob_per', 'La crisis económica')].filter(Boolean), eje: 'edad', ancho: true };
}
// configuración saneada: bloque, dos respuestas distintas que existan y eje
function cfgPuntos(cfg) {
  const pregId = BLOQUES_PUNTOS.includes(cfg.preg) ? cfg.preg : 'prob_per';
  const P = preg(pregId);
  if (!disponible(P)) throw new Error('Serie no disponible.');
  const validas = new Set((META.conceptos[P.cols[0]]?.categorias || []).filter(c => !c.no_respuesta).map(c => c.id));
  const d = defectoPuntos();
  const cats = [...new Set((cfg.cats || []).filter(id => validas.has(id)))];
  for (const id of (pregId === 'prob_per' ? d.cats : [idProblema(pregId, 'La vivienda'), idProblema(pregId, 'La crisis económica')]))
    if (cats.length < 2 && id && !cats.includes(id)) cats.push(id);
  for (const id of validas) if (cats.length < 2 && !cats.includes(id)) cats.push(id);
  if (cats.length < 2) throw new Error('Hacen falta dos respuestas.');
  const eje = cfg.eje === 'ideologia' ? 'ideologia' : 'edad';
  if (!META.columnas[eje]) throw new Error('Serie no disponible.');
  return { P, pregId, cats: cats.slice(0, 2), eje, desde: cfg.desde, hasta: cfg.hasta };
}
const capPuntos = (meses, area) => {
  const ns = meses.map(e => e.hasta - e.desde).sort((a, b) => a - b);
  const ref = ns[Math.floor(0.1 * (ns.length - 1))];          // percentil 10 de las entrevistas por barómetro
  return Math.max(Math.round(ref * 0.2), Math.round(ref * Math.min(1, area / PUNTOS_AREA_REF)));
};
/* Puntos de un periodo: posición, color y recuento por barómetro. cap: entrevistas por barómetro (muestra igualada). */
async function datosPuntos(c, cap) {
  const { P, eje } = c;
  await Promise.all([...P.cols, eje].map(col));
  const cs = P.cols.map(k => COLS[k]), Y = COLS[eje];
  const [A, B] = c.cats;
  const cA = P.cols.map(k => nivelesDe(k).indexOf(A) + 1), cB = P.cols.map(k => nivelesDe(k).indexOf(B) + 1);
  const meses = EST.filter(e => (!c.desde || e.mes >= c.desde) && (!c.hasta || e.mes <= c.hasta));
  if (!meses.length) throw new Error('No hay barómetros en el periodo elegido.');
  const rng = azar(PUNTOS_SEMILLA);
  const X = [], YV = [], CAT = [], porMes = [];
  let total = 0, sinEje = 0;
  for (const e of meses) {
    const cand = [];
    for (let r = e.desde; r < e.hasta; r++) { if (Y[r] !== 0) cand.push(r); else sinEje++; }
    total += e.hasta - e.desde;
    const k = Math.min(cap, cand.length);
    for (let i = 0; i < k; i++) { const j = i + Math.floor(rng() * (cand.length - i)); const t = cand[i]; cand[i] = cand[j]; cand[j] = t; }
    const dias = new Date(Date.UTC(+e.mes.slice(0, 4), +e.mes.slice(5, 7), 0)).getUTCDate();
    const t0 = fecha(e.mes).getTime();
    const cont = [0, 0, 0, 0];
    for (let i = 0; i < k; i++) {
      const r = cand[i];
      let a = false, b = false;
      for (let j = 0; j < cs.length; j++) { const v = cs[j][r]; if (!v) continue; if (v === cA[j]) a = true; else if (v === cB[j]) b = true; }
      const cat = a && b ? 3 : a ? 1 : b ? 2 : 0;
      X.push(t0 + rng() * dias * 864e5);
      YV.push((eje === 'edad' ? Math.min(Y[r], 92) : Y[r]) + rng() - 0.5);
      CAT.push(cat); cont[cat]++;
    }
    porMes.push({ e, n: k, cand: cand.length, cont });
  }
  // orden de dibujo al azar: ninguna categoría tapa a las demás y la proporción de color es la real
  const orden = new Uint32Array(X.length);
  for (let i = 0; i < orden.length; i++) orden[i] = i;
  for (let i = orden.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = orden[i]; orden[i] = orden[j]; orden[j] = t; }
  return { x: Float64Array.from(X), y: Float32Array.from(YV), cat: Uint8Array.from(CAT), orden, porMes, meses, cap, total, sinEje };
}
/* ¿Ha quedado el lienzo en negro? Lee un píxel de la esquina del fondo. Si el navegador no deja leerlo, se da por bueno. */
function lienzoNegro(cv) {
  try {
    const d = cv.getContext('2d').getImageData(2, 2, 1, 1).data;
    return d[3] === 255 && d[0] === 0 && d[1] === 0 && d[2] === 0;
  } catch (e) { return false; }
}
/* Dibujo en un canvas: W × H en píxeles CSS, a la escala indicada. En modo banner lleva título y fuente dentro. */
function pintarPuntos(cv, D, c, W, H, escala, opc = {}) {
  if (!PAL || !PAL.completa) leerPaleta();   // la paleta se lee al arrancar; si no estaba completa, se vuelve a intentar al pintar
  cv.width = Math.round(W * escala); cv.height = Math.round(H * escala);
  // soft: canvas por software (willReadFrequently), para los navegadores cuyo canvas acelerado devuelve negro
  const ctx = cv.getContext('2d', opc.soft ? { willReadFrequently: true } : undefined);
  if (!ctx) throw new Error('El navegador no ha podido crear el lienzo (sin memoria para el canvas).');
  ctx.scale(escala, escala);
  ctx.fillStyle = PAL.surface; ctx.fillRect(0, 0, W, H);
  const fs = opc.banner ? Math.max(12, W * 0.0105) : 12;
  const fuente = (peso, tam) => `${peso} ${tam}px ${PAL.fontD}`;
  const [A, B] = c.cats, conc = c.P.cols[0];
  const nombres = ['ninguna de las dos', minuscula(breve(etiqueta(conc, A))), minuscula(breve(etiqueta(conc, B))), 'ambas'];
  const colores = [PAL.ink3, PAL.cat[0], PAL.cat[1], PAL.cat[6]], alfa = [0.45, 0.85, 0.85, 0.85];
  // cabecera: en el banner, título y fuente; en el panel, solo la leyenda
  let top = 6;
  if (opc.banner) {
    ctx.textBaseline = 'alphabetic'; ctx.fillStyle = PAL.ink; ctx.font = fuente(600, fs * 1.3);
    const t1 = 'Cada punto, una entrevista del CIS';
    ctx.fillText(t1, W * 0.025, fs * 1.75);
    const w1 = ctx.measureText(t1).width;
    ctx.fillStyle = PAL.ink2; ctx.font = fuente(400, fs * 1.05);
    const m0 = D.meses[0].mes.slice(0, 4), m1 = D.meses[D.meses.length - 1].mes.slice(0, 4);
    ctx.fillText(`barómetros mensuales, ${m0 === m1 ? m0 : `${m0}–${m1}`}`, W * 0.025 + w1 + fs, fs * 1.75);
    ctx.fillStyle = PAL.ink3; ctx.font = fuente(400, fs * 0.75); ctx.textAlign = 'right';
    ctx.fillText('Fuente: CIS, microdatos  ·  gastiaso.github.io/barometros', W * 0.975, fs * 1.75); ctx.textAlign = 'left';
    top = fs * 2.3;
  }
  // leyenda, con salto de línea si no cabe
  ctx.font = fuente(400, fs); ctx.textBaseline = 'middle';
  const cab = opc.banner ? (c.pregId === 'prob_per' ? 'Entre los problemas que más le afectan, menciona:' : 'Entre los principales problemas de España, menciona:') : 'Menciona:';
  const items = [[cab, null], [nombres[1], 1], [nombres[2], 2], [nombres[3], 3], [nombres[0], 0], ['Sin ponderar · muestra igualada por mes · no es una estimación', 'nota']];
  const x0 = opc.banner ? W * 0.025 : 6, sep = fs * 1.4, lh = fs * 1.5;
  let lx = x0, ly = top + lh / 2;
  items.forEach(([txt, k]) => {
    const nota = k === 'nota', punto = k != null && !nota;
    ctx.font = fuente(k === 1 || k === 2 ? 500 : 400, nota ? fs * 0.9 : fs);
    const w = ctx.measureText(txt).width + (punto ? fs * 0.9 : 0);
    if (lx + w > W - 6 && lx > x0) { lx = x0; ly += lh; }
    if (punto) { ctx.fillStyle = colores[k]; ctx.beginPath(); ctx.arc(lx + fs * 0.32, ly, fs * 0.32, 0, 2 * Math.PI); ctx.fill(); lx += fs * 0.9; }
    ctx.fillStyle = nota ? PAL.ink3 : k == null || k === 0 ? PAL.ink2 : PAL.ink; ctx.fillText(txt, lx, ly);
    lx += w - (punto ? fs * 0.9 : 0) + sep;
  });
  top = ly + lh / 2 + fs * 0.5;
  // área de datos
  const ideo = c.eje === 'ideologia';
  const m = { l: opc.banner ? W * 0.025 : 4, r: (ideo ? 7.2 : 3.2) * fs, t: top, b: fs * 1.9 };
  const t0 = fecha(D.meses[0].mes).getTime(), ult = D.meses[D.meses.length - 1].mes;
  const t1 = Date.UTC(+ult.slice(0, 4), +ult.slice(5, 7), 1);
  const xs = t => m.l + (W - m.l - m.r) * (t - t0) / (t1 - t0);
  const yd = ideo ? [0.4, 10.6] : [17, 93];
  const ys = v => H - m.b - (H - m.t - m.b) * (v - yd[0]) / (yd[1] - yd[0]);
  // guías y eje vertical, a la derecha
  ctx.font = fuente(400, fs * 0.95); ctx.fillStyle = PAL.ink3; ctx.textBaseline = 'middle'; ctx.strokeStyle = PAL.line; ctx.lineWidth = 1;
  const marcas = ideo ? [[1, '1 · izquierda'], [5, '5'], [10, '10 · derecha']] : [[20, '20'], [40, '40'], [60, '60'], [80, '80']];
  marcas.forEach(([v, t]) => {
    ctx.beginPath(); ctx.moveTo(m.l, ys(v)); ctx.lineTo(W - m.r + fs * 0.3, ys(v)); ctx.stroke();
    ctx.fillText(t, W - m.r + fs * 0.6, ys(v));
  });
  if (!ideo) ctx.fillText('edad', W - m.r + fs * 0.6, m.t + fs * 0.6);   // en ideología, «1 · izquierda» y «10 · derecha» ya lo dicen
  // puntos: tamaño según la resolución del lienzo; en cada bloque del orden aleatorio, un cambio de color por categoría
  const ps = Math.max(escala >= 2 ? 2 : 1, Math.min(3, Math.round(W * escala * 0.00075))) / escala;
  const { x, y, cat, orden } = D;
  const L = 16, paso = Math.ceil(orden.length / L);
  for (let b = 0; b < L; b++) {
    const ini = b * paso, fin = Math.min(orden.length, ini + paso);
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = colores[k]; ctx.globalAlpha = alfa[k];
      for (let i = ini; i < fin; i++) { const p = orden[i]; if (cat[p] !== k) continue; ctx.fillRect(xs(x[p]) - ps / 2, ys(y[p]) - ps / 2, ps, ps); }
    }
  }
  ctx.globalAlpha = 1;
  // años: marca en el 1 de enero (los bloques van de septiembre a julio, y agosto deja el hueco); si hay menos de
  // dos años, los meses
  ctx.font = fuente(400, fs); ctx.fillStyle = PAL.ink3; ctx.strokeStyle = PAL.ink3; ctx.lineWidth = 1.2; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const anos = d3.utcYear.range(d3.utcYear.ceil(new Date(t0)), new Date(t1 + 1)).map(d => d.getTime()).filter(t => t >= t0 && t <= t1);
  const marcasX = anos.length >= 2 ? anos.map(t => [t, String(new Date(t).getUTCFullYear())])
    : D.meses.map(e => [fecha(e.mes).getTime(), mesCorto(e.mes)]).filter((_, i, a) => a.length <= 8 || i % Math.ceil(a.length / 8) === 0);
  marcasX.forEach(([t, txt]) => {
    const xx = xs(t), w = ctx.measureText(txt).width;
    ctx.beginPath(); ctx.moveTo(xx, H - m.b + 2); ctx.lineTo(xx, H - m.b + fs * 0.5); ctx.stroke();
    // la etiqueta no se sale del lienzo por los bordes
    ctx.textAlign = xx - w / 2 < 2 ? 'left' : xx + w / 2 > W - 2 ? 'right' : 'center';
    ctx.fillText(txt, ctx.textAlign === 'left' ? Math.max(2, xx - fs * 0.15) : ctx.textAlign === 'right' ? Math.min(W - 2, xx + fs * 0.15) : xx, H - fs * 0.3);
  });
  ctx.textAlign = 'left';
  return ctx;
}
async function vistaPuntos(host, cfg) {
  const c = cfgPuntos(cfg);
  const W = Math.max(300, Math.round(host.clientWidth || 600));
  const H = Math.round(Math.max(240, Math.min(400, W * 0.28)));
  const escala = Math.max(1, Math.min(3, devicePixelRatio || 1));
  const meses = EST.filter(e => (!c.desde || e.mes >= c.desde) && (!c.hasta || e.mes <= c.hasta));
  if (!meses.length) return { vacio: 'No hay barómetros en el periodo elegido.' };
  const cap = capPuntos(meses, W * H * escala * escala);
  // la serie ponderada de la vista de líneas, para medir en la nota cuánto se separa la nube
  const [D, res] = await Promise.all([datosPuntos(c, cap), calcular({ preg: c.pregId, desde: meses[0].mes, hasta: meses[meses.length - 1].mes })]);
  host.innerHTML = '';
  const nuevoLienzo = () => { const k = document.createElement('canvas'); k.style.width = W + 'px'; k.style.height = H + 'px'; k.style.display = 'block'; k.setAttribute('role', 'img'); return k; };
  let cv = nuevoLienzo(), soft = false;
  host.appendChild(cv);
  pintarPuntos(cv, D, c, W, H, escala);
  // El fondo nunca es negro puro (#f7f6f3 o #1c1e20): si un píxel del fondo sale negro, el canvas acelerado del navegador ha
  // fallado (ocurre en Firefox con algunos drivers) y se repite en un canvas por software, que no pasa por la GPU
  if (lienzoNegro(cv)) { soft = true; const k = nuevoLienzo(); cv.replaceWith(k); cv = k; pintarPuntos(cv, D, c, W, H, escala, { soft }); }
  // si el navegador descarta el lienzo (pestaña en segundo plano con poca memoria, pérdida del contexto gráfico),
  // vuelve en negro o vacío: se repinta al recuperarlo y al volver a la pestaña
  const repintar = () => { if (cv.isConnected) try { pintarPuntos(cv, D, c, W, H, escala, { soft }); } catch (e) { /* */ } };
  cv.addEventListener('contextrestored', repintar);
  const alVolver = () => { if (!cv.isConnected) return document.removeEventListener('visibilitychange', alVolver); if (document.visibilityState === 'visible') repintar(); };
  document.addEventListener('visibilitychange', alVolver);
  const [A, B] = c.cats, conc = c.P.cols[0];
  const nomA = etiqueta(conc, A), nomB = etiqueta(conc, B);
  const vA = minuscula(breve(nomA)), vB = minuscula(breve(nomB));
  cv.setAttribute('aria-label', `Cada punto, una entrevista: ${vA} y ${vB}`);
  const pond = (f, id) => f.grupos[0].vals[id];
  const filas = D.porMes.map((p, i) => {
    const f = res.filas[i];
    const pa = p.n ? 100 * (p.cont[1] + p.cont[3]) / p.n : null, pb = p.n ? 100 * (p.cont[2] + p.cont[3]) / p.n : null;
    return { ...p, pa, pb, wa: f ? pond(f, A) ?? null : null, wb: f ? pond(f, B) ?? null : null };
  });
  const mostrados = d3.sum(filas, f => f.n);
  const ultimo = filas[filas.length - 1];
  const dif = filas.flatMap(f => [[f.pa, f.wa, vA, f.e.mes], [f.pb, f.wb, vB, f.e.mes]]).filter(d => d[0] != null && d[1] != null)
    .map(([p, w, nom, mes]) => ({ d: p - w, nom, mes })).sort((a, z) => Math.abs(z.d) - Math.abs(a.d))[0];
  const ambas = ultimo.n ? 100 * ultimo.cont[3] / ultimo.n : 0;
  const signo = d => `${d >= 0 ? '+' : '−'}${fmt1(Math.abs(d))}`;
  const notas = [
    `Cada punto es una entrevista, sin ponderar. Para que ningún mes pese más que otro, se dibujan hasta ${fmtInt(cap)} entrevistas por barómetro, elegidas al azar con semilla fija (${fmtInt(mostrados)} de ${fmtInt(D.total)}). El color sigue las menciones de cada persona (hasta tres). No es una estimación: para porcentajes, la evolución mensual.`,
    ultimo.pa != null && ultimo.wa != null
      ? `Sin ponderar, en ${mesLargo(ultimo.e.mes)} ${vA} es el ${fmt1(ultimo.pa)} % de los puntos frente al ${fmt1(ultimo.wa)} % de la serie ponderada, y ${vB}, el ${fmt1(ultimo.pb)} % frente al ${fmt1(ultimo.wb)} %${dif ? `; la mayor diferencia del periodo es de ${signo(dif.d)} puntos (${dif.nom}, ${mesCorto(dif.mes)})` : ''}. Citan ambas el ${fmt1(ambas)} %.`
      : '',
    c.eje === 'edad' ? 'Las edades de 93 años o más se dibujan a la altura de 92.' : `Quien no se sitúa en la escala ideológica (${fmtInt(D.sinEje)} entrevistas del periodo) queda fuera del dibujo.`,
  ].filter(Boolean);
  const per = meses.length === 1 ? mesLargo(meses[0].mes) : `${mesCorto(meses[0].mes)} a ${mesCorto(meses[meses.length - 1].mes)}`;
  const nA = `${breve(nomA)} (n)`, nB = `${breve(nomB)} (n)`;
  return {
    titulo: `Cada punto, una entrevista: ${vA} y ${vB}`,
    meta: `${c.P.t}; en vertical, ${EJES_PUNTOS[c.eje]}. ${per}, ${fmtInt(mostrados)} entrevistas sin ponderar`,
    notas,
    tabla: { cab: ['Mes', 'Estudio', 'Puntos', nA, nB, 'Ambas (n)', 'Ninguna (n)', `${breve(nomA)}, serie ponderada`, `${breve(nomB)}, serie ponderada`],
      filas: filas.map(f => [mesCorto(f.e.mes), f.e.estudio, fmtInt(f.n), fmtInt(f.cont[1]), fmtInt(f.cont[2]), fmtInt(f.cont[3]), fmtInt(f.cont[0]), fmtV(f.wa, false), fmtV(f.wb, false)]).reverse() },
    csv: { cab: ['mes', 'estudio', 'puntos', 'n_a', 'n_b', 'n_ambas', 'n_ninguna', 'pct_a_puntos', 'pct_b_puntos', 'pct_a_ponderado', 'pct_b_ponderado'],
      filas: filas.map(f => [f.e.mes, f.e.estudio, f.n, f.cont[1], f.cont[2], f.cont[3], f.cont[0], f.pa, f.pb, f.wa, f.wb]) },
    // imagen a la escala pedida (PNG del panel) y banner de 1584 × 396 (2×) con la muestra completa
    lienzo: esc => { const k = document.createElement('canvas'); pintarPuntos(k, D, c, W, H, esc, { soft }); return k; },
    banner: async (esc = 2) => {
      const Wb = 1584, Hb = 396;
      const Db = await datosPuntos(c, capPuntos(meses, Wb * Hb * esc * esc));
      const k = document.createElement('canvas');
      pintarPuntos(k, Db, c, Wb, Hb, esc, { banner: true, soft });
      return new Promise(ok => k.toBlob(ok));
    },
  };
}

const VISTAS = { transferencias: vistaTransferencias, dispersion: vistaDispersion, mapa: vistaMapa, calor: vistaCalor, comparar: vistaComparar, puntos: vistaPuntos };
