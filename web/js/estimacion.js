/* «Construye tu propia estimación». Cuatro supuestos (base, quién vota, indecisos, corrección por recuerdo) y todas
   sus combinaciones, ya calculadas con los microdatos (estimacion/rejilla.R). La vista arranca sin cifra propia:
   el rango de todas las combinaciones y la estimación publicada por el CIS. Usa las utilidades de app.js. */

let ESTIM = null, ESTIM_CARGA = null;
const EST_DIMS = ['base', 'votante', 'reparto', 'alfa'];
const EST_TIT = {
  base: 'Base de partida', votante: 'Quién cuenta como votante', reparto: 'Qué se hace con quien no sabe o no contesta',
  alfa: 'Corrección por recuerdo de voto',
};
const EST_AYUDA = {
  base: 'La intención directa es la respuesta a «¿a qué partido votaría?». Voto + simpatía añade, a quien no la da, el partido por el que siente simpatía (recodificación del CIS).',
  votante: 'Desde septiembre de 2022 el CIS pregunta la probabilidad de ir a votar (0 a 10). Antes no hay pregunta: las cuatro últimas opciones cuentan a todos menos a quien dice que no votaría.',
  reparto: 'Quien no sabe o no contesta puede quedar fuera o recibir un partido: con preguntas en cascada (la primera que responda) o con una regresión que lo estima por su ideología, su recuerdo, su valoración de los líderes, su sexo y su edad.',
  alfa: 'Los pesos del CIS no corrigen el recuerdo de voto. La corrección completa es la reponderación de la web; las intermedias acercan a 1 cada factor de ajuste.',
};
const EST_ATAJOS = {
  M1: 'Voto + simpatía, sin más ajustes',
  M2: 'M1 corregido por recuerdo de voto',
  M3: 'Votantes probables y cascada de preguntas',
  M4: 'Votantes probables y regresión',
};
const EST_CLAVE = 'bet-estimacion-v1';
const EE = { cfg: {}, partidos: null, mes: null };   // estado de la vista

const estIds = d => ESTIM.dims[d].map(x => x.id);
const estTexto = (d, id) => (ESTIM.dims[d].find(x => x.id === id) || {}).t || id;
const estCompleta = cfg => EST_DIMS.every(d => cfg[d] != null);
function estK(cfg) {
  const i = d => estIds(d).indexOf(cfg[d]);
  const n = d => ESTIM.dims[d].length;
  return ((i('base') * n('votante') + i('votante')) * n('reparto') + i('reparto')) * n('alfa') + i('alfa');
}
const estVal = (arr, mi, k) => { const v = arr[mi * ESTIM.n_comb + k]; return v == null ? null : v / 10; };
const estEtiqueta = id => ESTIM.etiquetas[id] || id;
const estColor = id => COLOR_PARTIDO[id] || PAL.ink3;
const estFmt = v => v == null ? '—' : fmt1(v);

async function cargarEstimacion() {
  if (ESTIM) return ESTIM;
  if (!ESTIM_CARGA) ESTIM_CARGA = traer(BASE + 'estimacion.json', { cache: 'no-cache' }, 'las estimaciones').then(r => r.json()).then(d => {
    ESTIM = d;
    // rango de todas las combinaciones, por partido y mes
    const nm = d.meses.length, nc = d.n_comb;
    d.rango = {};
    for (const p of d.partidos) {
      const lo = new Array(nm).fill(null), hi = new Array(nm).fill(null), a = d.est[p];
      for (let mi = 0; mi < nm; mi++) for (let k = 0; k < nc; k++) {
        const v = a[mi * nc + k]; if (v == null) continue;
        if (lo[mi] == null || v < lo[mi]) lo[mi] = v;
        if (hi[mi] == null || v > hi[mi]) hi[mi] = v;
      }
      d.rango[p] = { lo: lo.map(v => v == null ? null : v / 10), hi: hi.map(v => v == null ? null : v / 10) };
    }
    return d;
  });
  return ESTIM_CARGA;
}

/* Configuración: en la dirección (#est=base.votante.reparto.alfa) y en el navegador de quien la elige */
function estLeer() {
  const h = location.hash.match(/^#est=([^&]+)/);
  let cfg = null;
  if (h) { const v = decodeURIComponent(h[1]).split('.'); if (v.length === 4) cfg = Object.fromEntries(EST_DIMS.map((d, i) => [d, v[i]])); }
  if (!cfg) try { cfg = JSON.parse(localStorage.getItem(EST_CLAVE) || 'null'); } catch (e) { cfg = null; }
  if (!cfg || typeof cfg !== 'object') return {};
  return Object.fromEntries(EST_DIMS.filter(d => estIds(d).includes(cfg[d])).map(d => [d, cfg[d]]));
}
function estGuardar() {
  const c = EE.cfg;
  try { if (Object.keys(c).length) localStorage.setItem(EST_CLAVE, JSON.stringify(c)); else localStorage.removeItem(EST_CLAVE); } catch (e) { /* */ }
  const h = estCompleta(c) ? '#est=' + EST_DIMS.map(d => c[d]).join('.') : '#est';
  if (location.hash !== h) history.replaceState(null, '', h);
}
const estDescribe = cfg => EST_DIMS.map(d => `${EST_TIT[d]}: ${estTexto(d, cfg[d]).toLowerCase()}`).join('; ');
function estAtajo(cfg) {
  if (!estCompleta(cfg)) return null;
  return Object.keys(ESTIM.presets).find(m => EST_DIMS.every(d => ESTIM.presets[m][d] === cfg[d])) || null;
}

/* ---------------- interfaz ---------------- */
async function pintarEstimacion() {
  const host = $('#est-app');
  if (!host) return;
  if (META && META.veda) {
    host.innerHTML = '<p class="empty">Sección retirada durante el periodo de prohibición de publicación de sondeos (del 24 al 29 de noviembre).</p>';
    return;
  }
  if (!ESTIM) {
    host.innerHTML = '<p class="note">Cargando…</p>';
    try { await cargarEstimacion(); } catch (e) { host.innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
    EE.cfg = estLeer();
    EE.mes = ESTIM.meses.length - 1;
    EE.partidos = estPartidosDefecto();
  }
  else if (/^#est=/.test(location.hash)) EE.cfg = estLeer();   // un enlace con supuestos manda sobre lo elegido antes
  if (!host.dataset.listo) { estEsqueleto(host); host.dataset.listo = '1'; $('#est-sel-mes').value = String(EE.mes); }
  estRepintar();
}
function estPartidosDefecto() {
  // las candidaturas de ámbito estatal con grupo propio en algún momento del periodo; el resto, con los botones
  const DEFECTO_EST = ['PSOE', 'PP', 'VOX', 'SUMAR', 'UNIDAS_PODEMOS', 'PODEMOS', 'CS'];
  return ESTIM.partidos.filter(p => DEFECTO_EST.includes(p));
}
function estEsqueleto(host) {
  const grupo = d => `<fieldset class="est-dim" data-dim="${d}"><legend>${esc(EST_TIT[d])}</legend>
      <div class="seg" role="group" aria-label="${esc(EST_TIT[d])}">${ESTIM.dims[d].map(x => `<button type="button" data-v="${esc(x.id)}" aria-pressed="false">${esc(x.t)}</button>`).join('')}</div>
      <p class="note">${esc(EST_AYUDA[d])}</p><p class="note est-aviso" hidden></p></fieldset>`;
  host.innerHTML = `
    <div class="est-atajos"><span class="note">Atajos:</span>${Object.keys(EST_ATAJOS).map(m => `<button class="btn" type="button" data-atajo="${m}" aria-label="${m}: ${esc(EST_ATAJOS[m])}"><b>${m}</b><small>${esc(EST_ATAJOS[m])}</small></button>`).join('')}
      <button class="btn" type="button" id="est-quitar">Quitar mi estimación</button></div>
    <div class="est-mandos">${EST_DIMS.map(grupo).join('')}</div>
    <article class="est-panel" id="est-panel">
      <h2 id="est-titulo"></h2>
      <p class="meta" id="est-meta"></p>
      <div class="est-partidos" id="est-partidos" role="group" aria-label="Partidos en el gráfico"></div>
      <div class="chart" id="est-graf"></div>
      <p class="note est-clave" id="est-clave"></p>
      <div class="est-acciones">
        <button class="ib" type="button" id="est-csv">CSV</button><button class="ib" type="button" id="est-png">PNG</button>
        <button class="ib" type="button" id="est-enlace">Copiar enlace</button>
      </div>
    </article>
    <section class="est-mes">
      <h3>Por partido en <select id="est-sel-mes" aria-label="Barómetro">${ESTIM.meses.map((m, i) => `<option value="${i}">${esc(mesLargo(m))}</option>`).join('')}</select></h3>
      <div class="tablaw" id="est-tabla"></div>
      <p class="note" id="est-mes-nota"></p>
    </section>
    <section class="est-contraste" id="est-contraste"></section>
    <details class="est-ficha" id="est-ficha"><summary>Ficha técnica</summary><div id="est-ficha-c"></div></details>`;
  host.querySelectorAll('.est-dim').forEach(fs => fs.addEventListener('click', ev => {
    const b = ev.target.closest('button[data-v]'); if (!b) return;
    EE.cfg = { ...EE.cfg, [fs.dataset.dim]: b.dataset.v };
    estGuardar(); estRepintar();
  }));
  host.querySelectorAll('[data-atajo]').forEach(b => b.addEventListener('click', () => {
    EE.cfg = { ...ESTIM.presets[b.dataset.atajo] }; estGuardar(); estRepintar();
  }));
  $('#est-quitar').addEventListener('click', () => { EE.cfg = {}; estGuardar(); estRepintar(); });
  $('#est-sel-mes').addEventListener('change', ev => { EE.mes = +ev.target.value; estTabla(); estFicha(); });
  $('#est-csv').addEventListener('click', estCSV);
  // el PNG se dibuja con la leyenda dentro y la pantalla vuelve a quedar sin ella
  $('#est-png').addEventListener('click', () => { const el = $('#est-panel'); el._res = { cfg: { sinRupturas: false }, generico: {} }; estDibujar(true); exportarPNG(el); estDibujar(); });
  $('#est-enlace').addEventListener('click', async ev => {
    estGuardar();
    const url = location.origin + location.pathname + location.hash;
    try { await navigator.clipboard.writeText(url); ev.target.textContent = 'Enlace copiado'; } catch (e) { ev.target.textContent = 'Enlace en la barra de direcciones'; }
    setTimeout(() => { ev.target.textContent = 'Copiar enlace'; }, 2500);
  });
}
function estRepintar() {
  if (!ESTIM || !$('#est-panel')) return;
  const cfg = EE.cfg, completa = estCompleta(cfg);
  document.querySelectorAll('.est-dim').forEach(fs => {
    const d = fs.dataset.dim;
    fs.querySelectorAll('button[data-v]').forEach(b => b.setAttribute('aria-pressed', String(cfg[d] === b.dataset.v)));
    fs.classList.toggle('pendiente', cfg[d] == null && Object.keys(cfg).length > 0);
    const av = fs.querySelector('.est-aviso');
    let t = '';
    if (d === 'reparto' && cfg.base === 'simpatia' && ['scr', 's'].includes(cfg.reparto))
      t = cfg.reparto === 's' ? 'Con voto + simpatía de base, «Solo simpatía» equivale a no repartir.' : 'Con voto + simpatía de base, la simpatía ya está incluida: la cascada empieza por la cercanía.';
    av.hidden = !t; av.textContent = t;
  });
  document.querySelectorAll('[data-atajo]').forEach(b => b.setAttribute('aria-pressed', String(estAtajo(cfg) === b.dataset.atajo)));
  $('#est-quitar').hidden = !Object.keys(cfg).length;
  const at = estAtajo(cfg);
  $('#est-titulo').textContent = completa ? `Tu estimación${at ? ` (${at})` : ''} frente al rango de todas las combinaciones` : 'Estimación de voto: rango de todas las combinaciones de supuestos';
  const falta = EST_DIMS.filter(d => cfg[d] == null).length;
  const ultEst = ESTIM.meses[ESTIM.meses.length - 1], ultWeb = EST.length ? EST[EST.length - 1].mes : ultEst;
  $('#est-meta').textContent = (completa ? estDescribe(cfg) + '. ' : falta < 4 ? `Falta elegir ${falta === 1 ? 'un supuesto' : falta + ' supuestos'}. ` : '') +
    `% sobre voto válido (partidos y en blanco). Rango: ${ESTIM.n_comb} combinaciones. No es la estimación del CIS; la del CIS va en línea discontinua.` +
    (ultEst < ultWeb ? ` Las estimaciones llegan hasta ${mesLargo(ultEst)}; el barómetro de ${mesLargo(ultWeb)} todavía no está incluido.` : '');
  estChips();
  estDibujar();
  estTabla();
  estContraste();
  estFicha();
}
function estChips() {
  const box = $('#est-partidos');
  box.innerHTML = ESTIM.partidos.filter(p => ESTIM.rango[p].hi.some(v => v != null && v >= 1.5)).map(p => {
    const on = EE.partidos.includes(p);
    return `<button type="button" class="est-chip" data-p="${esc(p)}" aria-pressed="${on}"><i class="sw" style="background:${estColor(p)}"></i>${esc(estEtiqueta(p))}</button>`;
  }).join('');
  box.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
    const p = b.dataset.p;
    EE.partidos = EE.partidos.includes(p) ? EE.partidos.filter(x => x !== p) : [...EE.partidos, p];
    estChips(); estDibujar();
  }));
}
function estRupturas() {
  if (!META || !META.rupturas) return [];
  const ids = new Set(['intencion_voto', 'intencion_voto_r', 'voto_simpatia', 'recuerdo_voto'].flatMap(c => META.conceptos[c]?.rupturas || []));
  return META.rupturas.filter(r => ids.has(r.ruptura_id) && r.tipo === 'C' && !/descartada/.test(r.estado))
    .flatMap(r => mesesRuptura(r).map(m => ({ ...r, m }))).filter(r => ESTIM.meses.includes(r.m));
}

function estDibujar(conLeyenda = false) {
  const host = $('#est-graf');
  const cfg = EE.cfg, completa = estCompleta(cfg), k = completa ? estK(cfg) : null;
  const meses = ESTIM.meses, ps = ESTIM.partidos.filter(p => EE.partidos.includes(p));
  if (!ps.length) { host.innerHTML = '<p class="empty">Elige algún partido.</p>'; return; }
  const W = Math.max(300, Math.round(host.clientWidth || 640));
  const H = Math.round(Math.max(300, Math.min(480, W * 0.62)));
  // en pantalla, la leyenda son los botones de partido; el PNG la lleva dentro del gráfico
  const perRow = Math.max(1, Math.min(ps.length, Math.floor(W / (W < 520 ? 120 : 150))));
  const filasLey = conLeyenda ? Math.ceil(ps.length / perRow) : 0;
  const m = { l: 36, r: 44, t: conLeyenda ? 26 + filasLey * 18 + 20 : 24, b: 28 };
  host.innerHTML = '';
  const svg = d3.select(host).append('svg').attr('xmlns', 'http://www.w3.org/2000/svg').attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', W).attr('height', H).attr('font-family', PAL.font).attr('font-size', 12).style('background', PAL.surface)
    .attr('role', 'img').attr('aria-label', $('#est-titulo').textContent);
  const x = d3.scaleUtc().domain([fecha(meses[0]), fecha(meses[meses.length - 1])]).range([m.l, W - m.r]);
  const serie = p => meses.map((mes, i) => ({
    mes, lo: ESTIM.rango[p].lo[i], hi: ESTIM.rango[p].hi[i],
    v: completa ? estVal(ESTIM.est[p], i, k) : null, me: completa ? estVal(ESTIM.me[p], i, k) : null,
    cis: ESTIM.cis[p] ? (ESTIM.cis[p][i] == null ? null : ESTIM.cis[p][i] / 10) : null,
  }));
  const ser = ps.map(p => ({ p, pts: serie(p) }));
  const top = d3.max(ser.flatMap(s => s.pts.flatMap(q => [q.hi, q.cis, q.v == null ? null : q.v + q.me]))) || 10;
  const y = d3.scaleLinear().domain([0, Math.max(10, top)]).nice().range([H - m.b, m.t]);
  const axis = g => { g.selectAll('text').attr('fill', PAL.ink3).attr('font-size', 11); g.selectAll('line').attr('stroke', PAL.line2); g.selectAll('path').attr('stroke', PAL.line2); };
  svg.append('g').attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(Math.max(3, Math.round((H - m.t - m.b) / 55))).tickSize(-(W - m.l - m.r)).tickFormat(v => fmtInt(v)))
    .call(g => { axis(g); g.selectAll('.tick line').attr('stroke', PAL.line); g.select('.domain').remove(); });
  const anos = d3.utcYear.range(d3.utcYear.ceil(x.domain()[0]), d3.utcMonth.offset(x.domain()[1], 1));
  const paso = Math.ceil(anos.length / Math.max(1, Math.floor((W - m.l - m.r) / 55)));
  svg.append('g').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).tickValues(anos.filter((_, i) => i % paso === 0)).tickFormat(d3.utcFormat('%Y')).tickSizeOuter(0)).call(axis);
  // rupturas C de las preguntas de voto
  const rup = estRupturas();
  const marcas = [...d3.group(rup, r => r.m)].map(([mes, rs]) => ({ x: x(fecha(mes)), rs })).sort((a, z) => a.x - z.x);
  marcas.forEach(mk => svg.append('line').attr('x1', mk.x).attr('x2', mk.x).attr('y1', m.t - 6).attr('y2', H - m.b).attr('stroke', PAL.acc).attr('stroke-width', 1.5));
  // etiquetas juntas cuando las marcas caen a menos de 34 px
  const grupos = [];
  marcas.forEach(mk => { const g = grupos[grupos.length - 1]; if (g && mk.x - g[g.length - 1].x < 34) g.push(mk); else grupos.push([mk]); });
  grupos.forEach(g => {
    const xm = d3.mean(g, d => d.x);
    svg.append('text').attr('x', xm).attr('y', m.t - 9).attr('text-anchor', xm > W - m.r - 30 ? 'end' : 'middle').attr('font-family', PAL.fontD)
      .attr('font-size', 10.5).attr('font-weight', 600).attr('fill', PAL.acc).text(g.flatMap(d => d.rs.map(r => r.ruptura_id)).join(' '));
  });
  const X = q => x(fecha(q.mes));
  // rango de todas las combinaciones: más marcado si no hay estimación propia
  const area = d3.area().defined(q => q.lo != null).x(X).y0(q => y(q.lo)).y1(q => y(q.hi));
  ser.forEach(s => svg.append('path').attr('d', area(s.pts)).attr('fill', estColor(s.p)).attr('fill-opacity', completa ? PAL.band * 0.9 : PAL.band * 1.8).attr('stroke', 'none'));
  if (!completa) {
    const borde = c => d3.line().defined(q => q[c] != null).x(X).y(q => y(q[c]));
    ser.forEach(s => ['lo', 'hi'].forEach(c => svg.append('path').attr('d', borde(c)(s.pts)).attr('fill', 'none').attr('stroke', estColor(s.p)).attr('stroke-width', 0.8).attr('stroke-opacity', 0.7)));
  }
  // CIS, discontinua
  const lCis = d3.line().defined(q => q.cis != null).x(X).y(q => y(q.cis));
  ser.forEach(s => svg.append('path').attr('d', lCis(s.pts)).attr('fill', 'none').attr('stroke', estColor(s.p)).attr('stroke-width', 1.4).attr('stroke-dasharray', '4 3'));
  // estimación propia con su margen
  if (completa) {
    const banda = d3.area().defined(q => q.v != null).x(X).y0(q => y(Math.max(0, q.v - q.me))).y1(q => y(q.v + q.me));
    ser.forEach(s => svg.append('path').attr('d', banda(s.pts)).attr('fill', estColor(s.p)).attr('fill-opacity', PAL.band * 1.6).attr('stroke', 'none'));
    const linea = d3.line().defined(q => q.v != null).x(X).y(q => y(q.v));
    ser.forEach(s => svg.append('path').attr('d', linea(s.pts)).attr('fill', 'none').attr('stroke', estColor(s.p)).attr('stroke-width', 2.2).attr('stroke-linejoin', 'round'));
  }
  // etiquetas finales: la estimación propia o, sin ella, el CIS
  const fin = ser.map(s => { const q = s.pts[s.pts.length - 1], val = completa ? q.v : q.cis; return val != null ? { s, q, val, y: y(val) } : null; })
    .filter(Boolean).sort((a, b) => a.y - b.y);
  for (let i = 1; i < fin.length; i++) if (fin[i].y - fin[i - 1].y < 13) fin[i].y = fin[i - 1].y + 13;
  fin.forEach(e => {
    const cx = X(e.q), cy = y(e.val);
    svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 3.2).attr('fill', estColor(e.s.p)).attr('stroke', PAL.surface).attr('stroke-width', 1.5);
    svg.append('text').attr('x', cx + 6).attr('y', e.y + 4).attr('fill', PAL.ink).attr('font-size', 11).attr('font-weight', 600).text(fmt1(e.val));
  });
  const colW = (W - 16) / perRow;
  if (conLeyenda) ps.forEach((p, i) => {
    const gx = 8 + (i % perRow) * colW, gy = 2 + Math.floor(i / perRow) * 18;
    svg.append('rect').attr('x', gx).attr('y', gy + 5).attr('width', 14).attr('height', 3).attr('fill', estColor(p));
    svg.append('text').attr('x', gx + 20).attr('y', gy + 10).attr('fill', PAL.ink2).attr('font-size', 11.5).text(estEtiqueta(p));
  });
  const ky = 2 + filasLey * 18 + 10;
  let kx = 8;
  if (conLeyenda) {
  const clave = (dibuja, txt) => {
    dibuja(kx);
    const t = svg.append('text').attr('x', kx + 22).attr('y', ky + 4).attr('fill', PAL.ink3).attr('font-size', 11).text(txt);
    kx += 22 + t.node().getComputedTextLength() + 16;
  };
  if (completa) clave(x0 => svg.append('line').attr('x1', x0).attr('x2', x0 + 16).attr('y1', ky).attr('y2', ky).attr('stroke', PAL.ink2).attr('stroke-width', 2.2), 'tu estimación');
  clave(x0 => svg.append('rect').attr('x', x0).attr('y', ky - 5).attr('width', 16).attr('height', 10).attr('fill', PAL.ink2).attr('fill-opacity', PAL.band * 1.8), `rango de las ${ESTIM.n_comb} combinaciones`);
  clave(x0 => svg.append('line').attr('x1', x0).attr('x2', x0 + 16).attr('y1', ky).attr('y2', ky).attr('stroke', PAL.ink2).attr('stroke-width', 1.4).attr('stroke-dasharray', '4 3'), 'CIS');
  }
  svg.selectAll('path, circle, text, line').attr('pointer-events', 'none');
  // cursor y detalle del mes
  const fechas = meses.map(fecha);
  const cross = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', PAL.line2).attr('visibility', 'hidden');
  svg.insert('rect', 'g').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
    .on('pointermove', ev => {
      const [px] = d3.pointer(ev);
      const i = d3.minIndex(fechas, d => Math.abs(x(d) - px));
      cross.attr('x1', x(fechas[i])).attr('x2', x(fechas[i])).attr('visibility', 'visible');
      const filas = ser.map(s => {
        const q = s.pts[i];
        const tuya = completa ? (q.v != null ? `<b>${fmt1(q.v)}</b> ± ${fmt1(q.me)}` : 's. d.') : '';
        return `<div class="r"><span><i class="sw" style="background:${estColor(s.p)}"></i>${esc(estEtiqueta(s.p))}</span><span>${tuya}${completa ? ' · ' : ''}${q.lo != null ? `${fmt1(q.lo)}–${fmt1(q.hi)}` : '—'} · CIS ${estFmt(q.cis)}</span></div>`;
      }).join('');
      const notas = rup.filter(r => r.m === meses[i]).map(r => `<div class="tnote"><b>${esc(r.ruptura_id)}, tipo C</b><br>${esc(breveRuptura(r.descripcion))}</div>`).join('');
      showTip(`<b>${esc(mesLargo(meses[i]))}</b>${filas}<div class="tnote">${completa ? 'Tu estimación ± margen · ' : ''}rango de las ${ESTIM.n_comb} combinaciones · CIS. Estudio ${esc(ESTIM.estudios[i])}.</div>${notas}`, ev);
    })
    .on('pointerleave', () => { cross.attr('visibility', 'hidden'); hideTip(); })
    .on('click', ev => {
      const [px] = d3.pointer(ev);
      EE.mes = d3.minIndex(fechas, d => Math.abs(x(d) - px));
      $('#est-sel-mes').value = String(EE.mes); estTabla(); estFicha();
    });
  $('#est-clave').innerHTML = `${completa ? '<b>Línea continua:</b> tu estimación, con su margen de error. ' : ''}<b>Banda:</b> rango de las ${ESTIM.n_comb} combinaciones de supuestos. <b>Discontinua:</b> estimación publicada por el CIS (modelo propio del CIS, que cambia en mayo de 2022). ${rup.length ? `<b>${esc(rup.map(r => r.ruptura_id).join(', '))}:</b> ruptura de las preguntas de voto.` : ''}`;
}

function estTabla() {
  const mi = EE.mes, cfg = EE.cfg, completa = estCompleta(cfg), k = completa ? estK(cfg) : null;
  const filas = ESTIM.partidos.map(p => ({
    p, v: completa ? estVal(ESTIM.est[p], mi, k) : null, me: completa ? estVal(ESTIM.me[p], mi, k) : null,
    lo: ESTIM.rango[p].lo[mi], hi: ESTIM.rango[p].hi[mi], cis: ESTIM.cis[p] && ESTIM.cis[p][mi] != null ? ESTIM.cis[p][mi] / 10 : null,
  })).filter(f => f.lo != null || f.cis != null)
    .sort((a, b) => (completa ? (b.v ?? -1) - (a.v ?? -1) : ((b.lo + b.hi) || 0) - ((a.lo + a.hi) || 0)));
  $('#est-tabla').innerHTML = `<table class="est-t"><thead><tr><th>Partido</th>${completa ? '<th>Tu estimación</th><th>Margen</th>' : ''}<th>Rango de las combinaciones</th><th>CIS</th></tr></thead><tbody>${
    filas.map(f => `<tr><td><i class="sw" style="background:${estColor(f.p)}"></i>${esc(estEtiqueta(f.p))}</td>${completa ? `<td class="n"><b>${estFmt(f.v)}</b></td><td class="n">${f.me == null ? '—' : '± ' + fmt1(f.me)}</td>` : ''}<td class="n">${f.lo == null ? '—' : `${fmt1(f.lo)} – ${fmt1(f.hi)}`}</td><td class="n">${estFmt(f.cis)}</td></tr>`).join('')
  }</tbody></table>`;
  const nota = [];
  if (completa) {
    const fuera = estVal(ESTIM.fuera, mi, k), ne = ESTIM.n_efectivo[mi * ESTIM.n_comb + k];
    nota.push(`Con estos supuestos, ${fmt1(fuera)} % de los votantes queda sin partido asignado y fuera del cálculo. Muestra efectiva: ${fmtInt(ne)} entrevistas de ${fmtInt(ESTIM.n[mi])}.`);
    if (!ESTIM.hay_prob[mi] && cfg.votante !== 'todos') nota.push('Este barómetro no pregunta la probabilidad de ir a votar: cuentan todos los que declaran voto.');
  }
  nota.push('Margen de error al 95 %, aproximado con el tamaño efectivo de la muestra; no recoge la incertidumbre de los supuestos. No figuran las candidaturas que no llegan al 1 % en ninguna combinación.');
  $('#est-mes-nota').textContent = nota.join(' ');
}

function estContraste() {
  const box = $('#est-contraste');
  const C = ESTIM.contraste_23j;
  if (!C || !C.estudios.length) { box.innerHTML = ''; return; }
  const cfg = EE.cfg, completa = estCompleta(cfg), k = completa ? estK(cfg) : null;
  const filas = C.estudios.map(e => {
    const medios = e.medio.filter(v => v != null), orden = [...medios].sort((a, b) => a - b);
    const puesto = completa && e.medio[k] != null ? orden.indexOf(e.medio[k]) + 1 : null;
    return `<tr><td>${esc(mesLargo(e.mes))} (estudio ${esc(e.estudio)})</td>${completa ? `<td class="n"><b>${fmt1(e.medio[k])}</b></td><td class="n">${e.ventaja[k] > 0 ? '+' : ''}${fmt1(e.ventaja[k])}</td><td class="n">${puesto} de ${medios.length}</td>` : ''}<td class="n">${fmt1(orden[0])} – ${fmt1(orden[orden.length - 1])}</td><td class="n">${e.cis.medio == null ? '—' : fmt1(e.cis.medio)}</td><td class="n">${e.cis.ventaja == null ? '—' : (e.cis.ventaja > 0 ? '+' : '') + fmt1(e.cis.ventaja)}</td></tr>`;
  }).join('');
  box.innerHTML = `<h3>¿Cuánto se habría equivocado en el 23J?</h3>
    <p class="note">Error frente al resultado de las generales del 23 de julio de 2023 en los dos barómetros anteriores: media del error absoluto en PP, PSOE, VOX y Sumar (con los partidos que concurrieron en su coalición), y desviación de la ventaja del PP sobre el PSOE (positiva: la estimación daba más ventaja al PP que las urnas).</p>
    <div class="tablaw"><table class="est-t"><thead><tr><th>Barómetro</th>${completa ? '<th>Error medio</th><th>Ventaja PP−PSOE</th><th>Puesto (menor error)</th>' : ''}<th>Error medio, todas</th><th>CIS, error medio</th><th>CIS, ventaja</th></tr></thead><tbody>${filas}</tbody></table></div>
    <p class="note">Una sola elección no permite elegir supuestos: el orden de las combinaciones cambia entre junio y julio, y cualquier combinación puede acertar por azar.</p>${estHistorico(completa, k)}`;
}

// error en las encuestas del CIS anteriores a cinco generales (2015-2023)
function estHistorico(completa, k) {
  const H = ESTIM.historico;
  if (!H) return '';
  const orden = H.medio.filter(v => v != null).sort((a, b) => a - b);
  const puesto = v => orden.indexOf(v) + 1;
  const filasEl = H.elecciones.map(e => {
    const vs = e.medio.filter(v => v != null);
    return `<tr><td>${esc(e.eleccion)} (${e.encuestas} ${e.encuestas === 1 ? 'encuesta' : 'encuestas'})</td>${completa ? `<td class="n"><b>${e.medio[k] == null ? '—' : fmt1(e.medio[k])}</b></td>` : ''}<td class="n">${fmt1(Math.min(...vs))} – ${fmt1(Math.max(...vs))}</td></tr>`;
  }).join('');
  const cab = completa
    ? `<p>Con esta combinación, el error medio en las ${H.encuestas} encuestas es de <b>${fmt1(H.medio[k])} puntos</b>, y la ventaja del ganador sobre el segundo se desvía de media ${fmt1(H.ventaja[k])}. Puesto ${puesto(H.medio[k])} de ${orden.length}, de menor a mayor error.</p>`
    : `<p>El error medio de las ${orden.length} combinaciones en las ${H.encuestas} encuestas va de ${fmt1(orden[0])} a ${fmt1(orden[orden.length - 1])} puntos.</p>`;
  return `<h3>¿Y en cinco generales?</h3>
    <p class="note">Las mismas combinaciones, calculadas con los microdatos de ${H.encuestas} encuestas del CIS de los meses anteriores a las generales de 2015, 2016, abril y noviembre de 2019 y 2023, y comparadas con el resultado: media del error absoluto en los partidos principales de cada elección.</p>
    ${cab}
    <div class="tablaw"><table class="est-t"><thead><tr><th>Elección</th>${completa ? '<th>Esta combinación</th>' : ''}<th>Todas</th></tr></thead><tbody>${filasEl}</tbody></table></div>
    <p class="note">Cinco elecciones y ${H.encuestas} encuestas siguen siendo pocas, y las condiciones cambian de una a otra: el recuerdo de voto se corrige con la elección anterior, y en abril de 2019 la anterior era de 2016.</p>`;
}

function estFicha() {
  const box = $('#est-ficha-c');
  const mi = EE.mes, cfg = EE.cfg, completa = estCompleta(cfg);
  const [ini, fin] = (ESTIM.campo[mi] || '/').split('/');
  const dia = s => { if (!s) return '—'; const [a, b, c] = s.split('-'); return `${+c} de ${MESES[+b - 1]} de ${a}`; };
  const enun = c => {
    const vs = META?.enunciados?.[c]; if (!vs) return null;
    const mes = ESTIM.meses[mi];
    const v = vs.find(x => x.desde <= mes && (!x.hasta || x.hasta >= mes)) || vs[vs.length - 1];
    return v ? v.enunciado : null;
  };
  const preguntas = [['intencion_voto', 'Intención directa'], ['simpatia', 'Simpatía'], ['cercania', 'Partido más cercano'], ['recuerdo_voto', 'Recuerdo de voto'], ['prob_votar', 'Probabilidad de ir a votar']]
    .map(([c, t]) => { const e = enun(c); return e ? `<li><b>${esc(t)}:</b> «${esc(e)}»</li>` : ''; }).join('');
  const F = (ESTIM.ficha && ESTIM.ficha[mi]) || {};
  const campo = F.fecha || `Del ${dia(ini)} al ${dia(fin)}.`;
  box.innerHTML = `<p class="note">Del barómetro elegido en la tabla (${esc(mesLargo(ESTIM.meses[mi]))}). Los apartados del trabajo de campo son los de la ficha técnica del CIS.</p><dl class="est-dl">
    <dt>Trabajo de campo</dt><dd>Centro de Investigaciones Sociológicas (CIS), barómetro de ${esc(mesLargo(ESTIM.meses[mi]))}, estudio ${esc(ESTIM.estudios[mi])}. ${esc(campo)}</dd>
    ${F.ambito ? `<dt>Ámbito y universo</dt><dd>${esc(F.ambito)} ${esc(F.universo || '')}</dd>` : ''}
    <dt>Muestra</dt><dd>${esc(F.muestra || fmtInt(ESTIM.n[mi]) + ' entrevistas.')}${F.afijacion ? ' Afijación: ' + esc(F.afijacion) : ''}${F.puntos ? ' Puntos de muestreo: ' + esc(F.puntos) : ''}</dd>
    ${F.procedimiento ? `<dt>Muestreo y selección</dt><dd>${esc(F.procedimiento)}</dd>` : ''}
    ${F.error ? `<dt>Error muestral del CIS</dt><dd>${esc(F.error)}</dd>` : ''}
    <dt>Estimación</dt><dd>Elaboración propia de Barómetro a barómetro con los microdatos del CIS. No es la estimación del CIS ni cuenta con su aval.${completa ? ` Supuestos: ${esc(estDescribe(cfg).toLowerCase())}.` : ' Sin supuestos elegidos: se muestra el rango de todas las combinaciones.'}</dd>
    <dt>Margen de error de la estimación</dt><dd>Al 95 % de confianza, con el tamaño efectivo de la muestra que dejan los pesos (efecto de diseño)${completa ? `: ${fmtInt(ESTIM.n_efectivo[mi * ESTIM.n_comb + estK(cfg)])} entrevistas efectivas; ± ${fmt1(196 * Math.sqrt(.25 / ESTIM.n_efectivo[mi * ESTIM.n_comb + estK(cfg)]))} puntos para un 50 %` : ''}. Cada partido lleva el suyo en la tabla. No incluye la incertidumbre de los supuestos, que es la que muestra el rango.</dd>
    <dt>No respuesta</dt><dd>${completa ? `${fmt1(estVal(ESTIM.fuera, mi, estK(cfg)))} % de los votantes queda sin partido asignado con estos supuestos.` : 'Depende de los supuestos: se indica al elegirlos.'}</dd>
    <dt>Preguntas</dt><dd><ul>${preguntas}</ul></dd>
  </dl>`;
}

function estCSV() {
  const cfg = EE.cfg, completa = estCompleta(cfg), k = completa ? estK(cfg) : null;
  const q = s => { let t = String(s); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
  const num = v => v == null ? '' : v.toFixed(1);
  const lines = [['mes', 'estudio', 'partido', ...(completa ? ['tu_estimacion', 'margen'] : []), 'rango_min', 'rango_max', 'cis'].join(',')];
  ESTIM.meses.forEach((mes, i) => ESTIM.partidos.forEach(p => {
    const lo = ESTIM.rango[p].lo[i]; const cis = ESTIM.cis[p] && ESTIM.cis[p][i] != null ? ESTIM.cis[p][i] / 10 : null;
    if (lo == null && cis == null) return;
    lines.push([mes, ESTIM.estudios[i], q(estEtiqueta(p)), ...(completa ? [num(estVal(ESTIM.est[p], i, k)), num(estVal(ESTIM.me[p], i, k))] : []), num(lo), num(ESTIM.rango[p].hi[i]), num(cis)].join(','));
  }));
  lines.push('', q(`${$('#est-titulo').textContent}. ${$('#est-meta').textContent}`),
    q('Fuente: CIS, barómetros mensuales (microdatos); estimación publicada por el CIS en cada barómetro. Elaboración: Barómetro a barómetro.'));
  descargar('estimacion' + (completa ? '_' + EST_DIMS.map(d => cfg[d]).join('_') : '_rango') + '.csv', new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
}

// un enlace #est=… pegado en una pestaña ya abierta
window.addEventListener('hashchange', () => {
  if (/^#est=/.test(location.hash) && ESTIM && $('#view-est') && !$('#view-est').hidden) pintarEstimacion();
});
