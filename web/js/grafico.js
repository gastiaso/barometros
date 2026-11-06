/* Barómetro a barómetro: gráficos de series, barras y comparación (SVG con d3). Las demás vistas están en vistas.js. */
'use strict';

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
  const colW = (W - 16) / perRow;
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
      .on('pointermove', ev => { ev.stopPropagation(); showTip(`<b>${esc(mesLargo(mk.mes))}</b>` + mk.rs.map(r => `<div class="tnote"><b>${esc(tituloRuptura(r))}, tipo ${esc(r.tipo)}</b><br>${esc(breveRuptura(r.descripcion))}</div>`).join(''), ev); })
      .on('pointerleave', hideTip);
  });
  // convocatorias electorales (capa opcional): generales y europeas con línea punteada y rótulo en la base;
  // autonómicas y municipales, marca corta en el eje. Solo convocatorias: ningún otro acontecimiento.
  const finMes = meses[meses.length - 1];
  const evs = cfg.elecciones && META.eventos ? META.eventos.filter(e => e.fecha.slice(0, 7) >= meses[0] && e.fecha.slice(0, 7) <= finMes) : [];
  [...d3.group(evs, e => e.fecha)].forEach(([f, es]) => {
    const xe = Math.min(x.range()[1], x(new Date(f + 'T00:00:00Z'))), mayor = es.some(e => e.ambito === 'generales' || e.ambito === 'europeas');
    const g = svg.append('g');
    g.append('line').attr('x1', xe).attr('x2', xe).attr('y1', mayor ? m.t : H - m.b - 10).attr('y2', H - m.b)
      .attr('stroke', PAL.ink3).attr('stroke-width', 1).attr('stroke-dasharray', mayor ? '1 3' : null);
    if (mayor) g.append('text').attr('x', xe + 3).attr('y', H - m.b - 4).attr('font-family', PAL.fontD).attr('font-size', 10).attr('fill', PAL.ink3)
      .text(es.find(e => e.ambito === 'generales' || e.ambito === 'europeas').etiqueta.replace(/^(Generales|Europeas) del? /, ''));
    g.append('rect').attr('x', xe - 5).attr('y', H - m.b - 12).attr('width', 10).attr('height', 14).attr('fill', 'transparent').style('cursor', 'help')
      .on('pointermove', ev => { ev.stopPropagation(); showTip(`<b>${esc(f.slice(8, 10))}-${esc(f.slice(5, 7))}-${esc(f.slice(0, 4))}</b>` + es.map(e => `<div class="tnote">${esc(e.etiqueta)}</div>`).join(''), ev); })
      .on('pointerleave', hideTip);
  });
  // etiquetas de las rupturas C, agrupadas cuando caen a menos de 34 px (en la guía, con etiqueta corta, a 140 px)
  const grupos = [], dist = cfg.guia ? 140 : 34;
  marcas.filter(mk => mk.esC).sort((a, z) => a.x - z.x).forEach(mk => {
    const ult = grupos[grupos.length - 1];
    if (ult && mk.x - ult[ult.length - 1].x < dist) ult.push(mk); else grupos.push([mk]);
  });
  grupos.forEach(gr => {
    const xm = d3.mean(gr, d => d.x);
    const txt = gr.flatMap(d => d.rs.filter(r => r.tipo === 'C').map(r => nombreRuptura(r, cfg))).join(cfg.guia ? ' · ' : ' ');
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
  // en modo daltónico cada serie lleva además un trazo distinto, para no depender solo del color (PSOE y VOX, por ejemplo,
  // se confunden con deuteranopia); el mismo trazo va en la leyenda
  const trazo = i => (modoCVD() ? TRAZOS_CVD[i % TRAZOS_CVD.length] : null);
  ser.forEach((s, i) => {
    const pts = preguntados(s);
    svg.append('path').attr('d', line(pts)).attr('fill', 'none').attr('stroke', col[s.id]).attr('stroke-width', 2)
      .attr('stroke-dasharray', trazo(i)).attr('stroke-linejoin', 'round').attr('stroke-linecap', trazo(i) ? 'butt' : 'round');
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
    if (trazo(i)) svg.append('line').attr('x1', gx).attr('x2', gx + 22).attr('y1', gy + 6.5).attr('y2', gy + 6.5).attr('stroke', col[s.id]).attr('stroke-width', 2.5).attr('stroke-dasharray', trazo(i));
    else svg.append('rect').attr('x', gx).attr('y', gy + 5).attr('width', 14).attr('height', 3).attr('fill', col[s.id]);
    svg.append('text').attr('x', gx + (trazo(i) ? 28 : 20)).attr('y', gy + 10).attr('fill', PAL.ink2).attr('font-size', 11.5)
      .text(recortarAncho(s.label, colW - (trazo(i) ? 34 : 26), 11.5)).append('title').text(s.label);
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
      const notas = prov + rup.filter(r => r.m === mes).map(r => `<div class="tnote"><b>${esc(tituloRuptura(r))}, tipo ${esc(r.tipo)}</b><br>${esc(breveRuptura(r.descripcion))}</div>`).join('') +
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
  const colW = (W - 16) / perRow;
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
  svg.append('g').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x0).tickSizeOuter(0).tickFormat(id => recortarAncho(nomEje(id), Math.max(24, x0.bandwidth() - 4), 11)))
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
      .text(recortarAncho(s.label, colW - 22, 11.5)).append('title').text(s.label);
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
  const colW = (W - 16) / perRow;
  const legendRows = Math.ceil(ser.length / perRow);
  const labW = Math.min(170, Math.max(70, d3.max(filas, f => anchoTexto(f.label, 12)) + 14));   // etiquetas de grupo, medidas
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
      .text(recortarAncho(f.label, labW - 12, 12)).append('title').text(f.label);
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
      .text(recortarAncho(s.label, colW - 22, 11.5)).append('title').text(s.label);
  });
  svg.selectAll('text, line, rect:not(.hit)').attr('pointer-events', 'none');
  B.apiladas = filas;
  return { barras: B, ser, col, rup: [], omitidos: filas.filter(f => !f.ok).length };
}
