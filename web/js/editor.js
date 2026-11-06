/* Barómetro a barómetro: editor de paneles (diálogo «Configurar» / «Nuevo panel»). */
'use strict';

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
  const opEst = META.columnas.peso_estudios ? chk('f-estudios', 'Peso homogéneo con nivel de estudios desde 2021: R10 deja de cortar la serie (estimación propia: no coincide con el CIS antes de nov-2023)', b.pesoEstudios) : '';
  const opAncho = chk('f-ancho', 'Panel a todo el ancho', b.ancho);
  const fApilar = tipo === 'barras' && preg(b.preg)?.tipo === 'cat' ? `<div class="fld"><label for="f-apilar">Disposición</label><select id="f-apilar">${[['', 'Automática: apiladas con cruce y cinco o más respuestas'], ['agrupadas', 'Barras agrupadas'], ['apiladas', 'Barras apiladas al 100 %']].map(([k, t]) => `<option value="${k}"${(b.apilar || '') === k ? ' selected' : ''}>${t}</option>`).join('')}</select></div>` : '<div class="fld"></div>';
  const lista = `<div class="fld full" id="f-cats"><span class="lab">Respuestas</span><p class="hint">Calculando…</p></div>`;
  const fTam = `<div class="fld"><label for="f-tam">Tamaño de los puntos</label><select id="f-tam"><option value=""${b.tam !== 'n' ? ' selected' : ''}>Peso del grupo en la muestra ponderada</option><option value="n"${b.tam === 'n' ? ' selected' : ''}>Número de entrevistas</option></select></div>`;
  const fEje = `<div class="fld"><label for="f-eje">En vertical</label><select id="f-eje"><option value="edad"${b.eje !== 'ideologia' ? ' selected' : ''}>Edad</option><option value="ideologia"${b.eje === 'ideologia' ? ' selected' : ''}>Autoubicación ideológica (1 a 10)</option></select><span class="hint">En horizontal, el mes; cada punto cae al azar dentro del suyo.</span></div>`;
  const secciones = {
    lineas: () => fPreg + fCruce + fFiltro + fPeriodo + lista + `<div class="fld full"><span class="lab">Opciones</span>${opExNR}${opBanda}${opMovil}${opRec}${opEst}${opAncho}</div>`,
    barras: () => fPreg + fCruce + fFiltro + fMes('f-mes', 'Barómetro', b.mes) + fApilar + lista + `<div class="fld full"><span class="lab">Opciones</span>${opExNR}${opBanda}${opRec}${opEst}${opAncho}</div>`,
    comparar: () => fPreg + fFiltro + '<div class="fld"></div>' + fMes('f-mesA', 'Barómetro inicial', mesInicialComparar(b)) + fMes('f-mesB', 'Barómetro final', b.mesB) + lista + `<div class="fld full"><span class="lab">Opciones</span>${opExNR}${opBanda}${opRec}${opEst}${opAncho}</div>`,
    calor: () => fPreg + fFiltro + '<div class="fld"></div>' + fPeriodo + lista + `<div class="fld full"><span class="lab">Opciones</span>${opExNR}${opRec}${opEst}${opAncho}</div>`,
    transferencias: () => fPreg + fFiltro + '<div class="fld"></div>' + fMes('f-mes', 'Último barómetro', b.mes) + fAcum + lista + `<div class="fld full"><span class="lab">Opciones</span>${opExNR}${opEst}${opAncho}</div>`,
    dispersion: () => `<div class="fld full"><label for="f-grupo">Cada punto es un grupo de</label><select id="f-grupo">${GRUPOS_DISP.filter(([k]) => META.columnas[k]).map(([k, t]) => `<option value="${k}"${k === b.grupo ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>` +
      selectorIndicador('x', b.x, 'Eje horizontal') + selectorIndicador('y', b.y, 'Eje vertical') + fFiltro + fTam + fMes('f-mes', 'Último barómetro', b.mes) + fAcum + lista + `<div class="fld full"><span class="lab">Opciones</span>${opBanda}${opRec}${opEst}${opAncho}</div>`,
    mapa: () => selectorIndicador('i', b.ind, 'Indicador') + fFiltro + '<div class="fld"></div>' + fMes('f-mes', 'Último barómetro', b.mes) + fAcum + `<div class="fld full"><span class="lab">Opciones</span>${opExNR}${opRec}${opEst}${opAncho}</div>`,
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
    if ($('#f-tam')) b.tam = val('f-tam') || null;
    if ($('#f-grupo')) b.grupo = val('f-grupo');
    if ($('#f-eje')) b.eje = val('f-eje');
    if ($('#f-catA')) b.cats = [val('f-catA'), val('f-catB')];
    [['x', 'x'], ['y', 'y'], ['i', 'ind']].forEach(([p, k]) => { if ($(`#f-${p}-preg`)) b[k] = { preg: val(`f-${p}-preg`), cat: val(`f-${p}-cat`) || null }; });
    b.exNR = !!$('#f-exnr')?.checked; b.ancho = !!$('#f-ancho')?.checked;
    if ($('#f-banda')) b.banda = $('#f-banda').checked;
    if ($('#f-movil')) b.movil = $('#f-movil').checked;
    b.recuerdo = !!$('#f-recuerdo')?.checked && b.tipo !== 'transferencias';
    b.pesoEstudios = !!$('#f-estudios')?.checked && b.tipo !== 'puntos';
  };
  edb.querySelectorAll('select, #f-exnr, #f-movil, #f-recuerdo, #f-estudios').forEach(elx => elx.addEventListener('change', ev => {
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
