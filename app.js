const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const RUNNING_KEY = 'RUNNING';

const store = {
  get history() { return JSON.parse(localStorage.getItem('rutina_history') || '[]'); },
  set history(v) { localStorage.setItem('rutina_history', JSON.stringify(v)); },
  get rotation() { return JSON.parse(localStorage.getItem('rutina_rotation') || '{}'); },
  set rotation(v) { localStorage.setItem('rutina_rotation', JSON.stringify(v)); },
  get current() { return JSON.parse(localStorage.getItem('rutina_current') || 'null'); },
  set current(v) {
    if (v === null) localStorage.removeItem('rutina_current');
    else localStorage.setItem('rutina_current', JSON.stringify(v));
  },
  get plan() { return JSON.parse(localStorage.getItem('rutina_plan') || '{"ultimoBloque":0,"sesiones":0}'); },
  set plan(v) { localStorage.setItem('rutina_plan', JSON.stringify(v)); },
  get runDays() { return JSON.parse(localStorage.getItem('rutina_rundays') || '{}'); },
  set runDays(v) { localStorage.setItem('rutina_rundays', JSON.stringify(v)); },
  get runs() { return JSON.parse(localStorage.getItem('rutina_runs') || '[]'); },
  set runs(v) { localStorage.setItem('rutina_runs', JSON.stringify(v)); },
  get lastBackup() { return localStorage.getItem('rutina_last_backup') || null; },
  set lastBackup(v) { localStorage.setItem('rutina_last_backup', v); },
};

// --- fecha: del dispositivo (funciona sin señal en el gimnasio) ---
function hoy() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function diasEntre(a, b) { return Math.round((b - a) / 86400000); }
function soloFecha(iso) { const d = new Date(iso); d.setHours(0, 0, 0, 0); return d; }

const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// ---------- ESTADO ----------
const state = {
  activeTab: 'hoy',
  sessionStartedAt: null,
  restTimer: null,          // { name, secondsLeft, id }
  restInterval: null,
  sheet: null,              // { type:'ficha'|'swap', blockIdx, itemIdx }
  swapIntent: 'ocupada',    // 'ocupada' | 'molestia'
  expandedSessionId: null,
  historyFilter: 'todo',    // 'todo' | 'gimnasio' | 'carrera'
  animPlayback: { paused: false, rate: 1 },
  anatomyView: 'frente',
  fichaTab: 'tecnica',      // 'tecnica' | 'anatomia' | 'historial'
  bloqueOverride: null,     // id de bloque adelantado desde el aviso
  dismissWarn: false,
  showAllMuscles: false,
  histLimit: 1,             // cuántos meses de historial mostrar (paginado)
};

let selectedWeekday = WEEKDAYS[new Date().getDay()];
let currentSession = null;

// ================= SERIES / MODELO =================
function parseSeries(detail) {
  const m = String(detail || '').match(/^\s*(\d+)\s*(?:series?\s*)?x/i);
  const n = m ? parseInt(m[1], 10) : 0;
  return n > 0 && n <= 10 ? n : 0;
}
function seriesTotal(item) {
  if (typeof item.series === 'number' && item.series > 0) return Math.min(item.series, 10);
  return parseSeries(item.detail);
}
// cada entrada aporta al menos 1 "serie" al total (ítems cronometrados incluidos)
function seriesTarget(item) { return seriesTotal(item) || 1; }
function seriesMarked(item) {
  const t = seriesTarget(item);
  if (typeof item.setsDone === 'number') return Math.min(item.setsDone, t);
  return item.done ? t : 0;
}
function itemComplete(item) { return seriesMarked(item) >= seriesTarget(item); }

// totales de la sesión, medidos en SERIES
function sessionTotals(session) {
  let done = 0, total = 0;
  session.blocks.forEach(b => b.items.forEach(i => {
    total += seriesTarget(i);
    done += seriesMarked(i);
  }));
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

// lista plana ordenada de entradas de la sesión
function flatEntries(session) {
  const out = [];
  session.blocks.forEach((block, bi) => block.items.forEach((item, ii) => {
    out.push({ block, item, blockIdx: bi, itemIdx: ii });
  }));
  return out;
}
function currentEntry(session) {
  return flatEntries(session).find(e => !itemComplete(e.item)) || null;
}

// etiqueta corta del "grupo" para la tarjeta en curso
function entryZoneLabel(block, item) {
  if (block.isWarmup) return 'Calentamiento';
  if (block.isFixed) return item.area || 'Base articular';
  if (block.isRunning) return item.area || 'Articular';
  const g = EXERCISE_DB.groups[block.key];
  return g ? g.label : block.label;
}

// ---------- ROTACIÓN / GENERACIÓN ----------
function nextGymSlot(rotation, groupKey) { return rotation[groupKey] || 0; }
function advanceGymSlot(rotation, groupKey) { rotation[groupKey] = ((rotation[groupKey] || 0) + 1) % 4; }
function cupoPorGrupo(cantGrupos) {
  if (cantGrupos >= 3) return 2;
  if (cantGrupos === 2) return 3;
  return 5;
}

function buildGymBlock(groupKey, slot, cupo) {
  const g = EXERCISE_DB.groups[groupKey];
  let picks = g.exercises.map(ex => ({ ex, variant: ex.variants[slot] })).filter(p => p.variant);
  if (picks.length === 0) {
    for (let s = 0; s < 4; s++) {
      picks = g.exercises.map(ex => ({ ex, variant: ex.variants[s] })).filter(p => p.variant);
      if (picks.length) break;
    }
  }
  if (cupo) picks = picks.slice(0, cupo);
  return {
    key: groupKey, label: g.label, emoji: g.emoji, isRunning: false,
    items: picks.map(p => ({
      name: p.ex.name,
      detail: `${p.variant.series} series x ${p.variant.reps}`,
      equipment: p.ex.equipment || '',
      series: parseInt(p.variant.series, 10) || 0,
      setsDone: 0, done: false,
    })),
  };
}

function buildWarmupBlock() {
  const b0 = EXERCISE_DB.running.bloque0;
  return {
    key: 'WARMUP', label: 'Calentamiento: Elástico y Reactivo (5 min)', emoji: '🔥',
    isRunning: true, isWarmup: true,
    items: b0.items.map(it => ({
      name: it.name, detail: it.detail + (it.area ? ` · ${it.area}` : ''),
      area: it.area, series: parseSeries(it.detail), setsDone: 0, done: false,
    })),
  };
}

function buildFixedBlock(gruposDelDia, yaEnLaSesion) {
  const contador = store.plan.sesiones || 0;
  const elegidos = armarBloqueFijo(gruposDelDia, contador, yaEnLaSesion);
  return {
    key: 'FIJO', label: 'Base articular + abdomen (siempre)', emoji: '🔩',
    isRunning: true, isFixed: true,
    items: elegidos.map(x => ({
      name: x.nombre, detail: x.detalle + (x.area ? ` · ${x.area}` : ''),
      area: x.area, nota: x.nota, series: parseSeries(x.detalle), setsDone: 0, done: false,
    })),
  };
}

// arma la sesión (sin persistir rotación). runningChecked por defecto true.
function generarSesion(groupKeys, runningChecked, meta) {
  const rotation = store.rotation;
  const blocks = [];
  if (runningChecked) blocks.push(buildWarmupBlock());
  const cupo = cupoPorGrupo(groupKeys.length);
  groupKeys.forEach(k => blocks.push(buildGymBlock(k, nextGymSlot(rotation, k), cupo)));
  if (runningChecked) {
    const ya = blocks.flatMap(b => b.items.map(i => i.name));
    blocks.push(buildFixedBlock(groupKeys, ya));
  }
  return {
    date: new Date().toISOString(),
    weekday: selectedWeekday,
    bloqueId: meta && meta.bloqueId || null,
    bloqueNombre: meta && meta.bloqueNombre || null,
    startedAt: Date.now(),
    blocks,
    _pendingRotation: { checkedGroups: groupKeys, runningUsed: runningChecked },
  };
}

// preview solo para contar ejercicios y estimar minutos en la pantalla Hoy
function previewSesion(bloque) {
  const blocks = [buildWarmupBlock()];
  const cupo = cupoPorGrupo(bloque.grupos.length);
  const rotation = store.rotation;
  bloque.grupos.forEach(k => blocks.push(buildGymBlock(k, nextGymSlot(rotation, k), cupo)));
  const ya = blocks.flatMap(b => b.items.map(i => i.name));
  blocks.push(buildFixedBlock(bloque.grupos, ya));
  const nEx = blocks.reduce((a, b) => a + b.items.length, 0);
  return { nEx, min: Math.round(nEx * 6 / 5) * 5 };
}

// ---------- BLOQUES / URGENCIA ----------
function bloqueDeSesion(session) {
  const keys = session.blocks.filter(b => !b.isRunning).map(b => b.key);
  for (const b of BLOQUES) if (keys.some(k => b.grupos.includes(k))) return b.id;
  return null;
}
function proximoBloqueId() {
  if (state.bloqueOverride) return state.bloqueOverride;
  const p = store.plan;
  return (p.ultimoBloque % BLOQUES.length) + 1;
}
function diasSinEntrenarPorBloque() {
  const out = {};
  BLOQUES.forEach(b => { out[b.id] = null; });
  const h = hoy();
  store.history.forEach(session => {
    const id = bloqueDeSesion(session);
    if (!id) return;
    const d = diasEntre(soloFecha(session.date), h);
    if (out[id] === null || d < out[id]) out[id] = d;
  });
  return out;
}
function diasSinEntrenarPorGrupo() {
  const out = {};
  Object.keys(EXERCISE_DB.groups).forEach(k => { out[k] = null; });
  const h = hoy();
  store.history.forEach(session => {
    const d = diasEntre(soloFecha(session.date), h);
    session.blocks.forEach(b => {
      if (b.isRunning) return;
      if (!b.items.some(i => seriesMarked(i) > 0)) return;
      if (out[b.key] === null || d < out[b.key]) out[b.key] = d;
    });
  });
  return out;
}
function esDiaDuro(fecha) { return store.runDays[fecha.getDay()] === 'duro'; }

function urgClass(dias) {
  if (dias === null || dias >= 21) return 'u-alta';
  if (dias >= 8) return 'u-media';
  return 'u-baja';
}
function txtDias(dias) {
  if (dias === null) return 'nunca';
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} d`;
}

// sesiones + carreras de esta semana (lun-dom)
function sesionesEstaSemana() {
  const h = hoy();
  const dow = (h.getDay() + 6) % 7; // 0 = lunes
  const lunes = new Date(h.getTime() - dow * 86400000);
  let n = 0;
  store.history.forEach(s => { if (soloFecha(s.date) >= lunes) n++; });
  store.runs.forEach(r => { if (soloFecha(r.start_date) >= lunes) n++; });
  return n;
}

// ================= NAVEGACIÓN =================
function go(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-item').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  if (tab === 'hoy') { document.getElementById('screen-hoy').classList.add('active'); renderHoy(); }
  else if (tab === 'historial') { document.getElementById('screen-historial').classList.add('active'); renderHistory(); }
  else if (tab === 'progreso') { document.getElementById('screen-progreso').classList.add('active'); renderProgreso(); }
  else if (tab === 'ajustes') { document.getElementById('screen-ajustes').classList.add('active'); renderAjustes(); }
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tab-item').forEach(t => t.addEventListener('click', () => go(t.dataset.tab)));

// ================= PANTALLA HOY =================
function renderHoy() {
  const screen = document.getElementById('screen-hoy');
  if (currentSession) { renderSession(); return; }

  const h = hoy();
  const manana = new Date(h.getTime() + 86400000);
  const idHoy = proximoBloqueId();
  const bloqueHoy = bloquePorId(idHoy);
  const bloqueManana = bloquePorId((idHoy % BLOQUES.length) + 1);
  const prev = previewSesion(bloqueHoy);
  const sinBloque = diasSinEntrenarPorBloque();
  const ultB = sinBloque[idHoy];
  const streak = sesionesEstaSemana();

  // aviso: piernas el día antes de carrera dura
  const esPiernas = bloqueHoy.grupos.some(g => ['CUADRICEPS', 'FEMORALES', 'GLUTEOS'].includes(g));
  const mostrarAviso = !state.dismissWarn && !state.bloqueOverride && esPiernas && esDiaDuro(manana);

  // "lo que más te falta": 3 grupos más atrasados
  const sinGrupo = diasSinEntrenarPorGrupo();
  const faltantes = Object.entries(sinGrupo)
    .map(([k, d]) => ({ k, d, g: EXERCISE_DB.groups[k] }))
    .sort((a, b) => {
      if (a.d === null && b.d === null) return 0;
      if (a.d === null) return -1;
      if (b.d === null) return 1;
      return b.d - a.d;
    })
    .slice(0, 3);

  let html = '<div class="screen-pad">';

  // fecha + racha
  html += `<div class="hoy-datline">
    <div class="eyebrow">${NOMBRE_DIA[h.getDay()]} ${h.getDate()} de ${NOMBRE_MES[h.getMonth()]}</div>
    <div class="streak-pill">${streak} ${streak === 1 ? 'sesión' : 'sesiones'} esta semana</div>
  </div>`;

  // encabezado del bloque
  const ultTxt = ultB === null ? 'nunca lo hiciste' : ultB === 0 ? 'hoy' : ultB === 1 ? 'ayer' : `hace ${ultB} días`;
  html += `<div class="block-head">
    <div class="eyebrow accent">Bloque ${bloqueHoy.id} de ${BLOQUES.length}</div>
    <h1>${bloqueHoy.emoji} ${bloqueHoy.nombre}</h1>
    <p class="block-meta">${prev.nEx} ejercicios · ~${prev.min} min · última vez ${ultTxt}</p>
  </div>`;

  // aviso accionable
  if (mostrarAviso) {
    html += `<div class="alert">
      <div class="alert-emoji">⚠️</div>
      <div style="flex:1">
        <div class="alert-txt">Mañana (${NOMBRE_DIA[manana.getDay()]}) tenés carrera dura. Piernas pesadas hoy te la arruinan —
          son el mismo sistema y necesitan 48 h. Mejor adelantá <strong>Bloque ${bloqueManana.id}: ${bloqueManana.nombre}</strong>.</div>
        <div class="alert-actions">
          <button class="a-primary" id="btnAdelantar">Adelantar Bloque ${bloqueManana.id}</button>
          <button class="a-secondary" id="btnIgualVoy">Igual voy</button>
        </div>
      </div>
    </div>`;
  }

  // lo que más te falta
  if (faltantes.length && store.history.length) {
    html += `<div class="section"><div class="eyebrow">Lo que más te falta</div>
      <div class="urg-list" style="margin-top:10px">`;
    faltantes.forEach(f => {
      html += `<div class="urg-row ${urgClass(f.d)}">
        <div class="urg-main">
          <div class="urg-name">${f.g.emoji} ${f.g.label}</div>
          <div class="urg-meta">${f.g.category}</div>
        </div>
        <div class="urg-days">${txtDias(f.d)}</div>
      </div>`;
    });
    html += `</div></div>`;
  }

  // CTA
  html += `<div class="cta-block">
    <button class="btn btn-primary" id="btnEmpezar">Empezar Bloque ${bloqueHoy.id}</button>
    <button class="btn btn-secondary" id="btnArmarOtra">Armar otra rutina</button>
  </div>`;

  html += '</div>';
  screen.innerHTML = html;

  const bA = document.getElementById('btnAdelantar');
  if (bA) bA.addEventListener('click', () => { state.bloqueOverride = bloqueManana.id; state.dismissWarn = true; renderHoy(); });
  const bI = document.getElementById('btnIgualVoy');
  if (bI) bI.addEventListener('click', () => { state.dismissWarn = true; renderHoy(); });

  document.getElementById('btnEmpezar').addEventListener('click', () => {
    const bloque = bloquePorId(proximoBloqueId());
    selectedWeekday = WEEKDAYS[new Date().getDay()];
    currentSession = generarSesion(bloque.grupos, true, { bloqueId: bloque.id, bloqueNombre: bloque.nombre });
    state.sessionStartedAt = currentSession.startedAt;
    store.current = currentSession;
    renderSession();
  });
  document.getElementById('btnArmarOtra').addEventListener('click', abrirArmarManual);
}

// ---------- ARMADO MANUAL ----------
function abrirArmarManual() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-armar').classList.add('active');
  renderWeekdayPicker();
  renderGroupGrid();
  window.scrollTo(0, 0);
}
document.getElementById('btnVolverHoy').addEventListener('click', () => go('hoy'));

function renderWeekdayPicker() {
  const el = document.getElementById('weekdayPicker');
  el.innerHTML = '';
  WEEKDAYS.forEach(day => {
    const b = document.createElement('button');
    b.className = 'day-btn' + (day === selectedWeekday ? ' selected' : '');
    b.textContent = day;
    b.addEventListener('click', () => { selectedWeekday = day; renderWeekdayPicker(); });
    el.appendChild(b);
  });
}

function muscleUsage() {
  const counts = {};
  let total = 0;
  store.history.forEach(session => session.blocks.forEach(block => {
    const done = block.items.filter(i => seriesMarked(i) > 0).length;
    if (!done) return;
    const k = block.isRunning ? RUNNING_KEY : block.key;
    counts[k] = (counts[k] || 0) + done; total += done;
  }));
  return { counts, total };
}

function renderGroupGrid() {
  const el = document.getElementById('groupGrid');
  el.innerHTML = '';
  const { counts, total } = muscleUsage();
  const groupKeys = Object.keys(EXERCISE_DB.groups);
  const fairShare = 100 / (groupKeys.length + 1);
  const byCategory = {};
  Object.entries(EXERCISE_DB.groups).forEach(([key, g]) => {
    (byCategory[g.category] = byCategory[g.category] || []).push([key, g]);
  });
  Object.entries(byCategory).forEach(([cat, groups]) => {
    const label = document.createElement('div');
    label.className = 'group-cat-label';
    label.textContent = cat;
    el.appendChild(label);
    groups.forEach(([key, g]) => {
      const pct = total ? Math.round(((counts[key] || 0) / total) * 100) : 0;
      const low = total > 0 && pct < fairShare;
      const chip = document.createElement('label');
      chip.className = 'chip';
      chip.innerHTML = `
        <input type="checkbox" value="${key}">
        <span>${g.emoji} ${g.label}</span>
        <span class="chip-pct${low ? ' low' : ''}">${total ? pct + '%' : '—'}</span>
        <div class="chip-bar"><div style="width:${pct}%${low ? ';background:var(--warn)' : ''}"></div></div>`;
      const input = chip.querySelector('input');
      input.addEventListener('change', () => chip.classList.toggle('checked', input.checked));
      el.appendChild(chip);
    });
  });
  const rPct = total ? Math.round(((counts[RUNNING_KEY] || 0) / total) * 100) : 0;
  document.getElementById('chipRunningPct').textContent = total ? rPct + '%' : '—';
  document.getElementById('chipRunningBar').style.width = rPct + '%';
}

document.getElementById('chipRunning').querySelector('input').addEventListener('change', function () {
  document.getElementById('chipRunning').classList.toggle('checked', this.checked);
});
document.getElementById('chipRunning').classList.add('checked');

document.getElementById('btnGenerar').addEventListener('click', () => {
  const checked = Array.from(document.querySelectorAll('#groupGrid input:checked')).map(i => i.value);
  const runningChecked = document.getElementById('chipRunning').querySelector('input').checked;
  if (checked.length === 0 && !runningChecked) {
    alert('Elegí al menos un grupo muscular o dejá tildado "Articulaciones / Running".');
    return;
  }
  currentSession = generarSesion(checked, runningChecked, null);
  state.sessionStartedAt = currentSession.startedAt;
  store.current = currentSession;
  go('hoy');
});

// ================= EN SESIÓN =================
function renderSession() {
  const screen = document.getElementById('screen-hoy');
  const tot = sessionTotals(currentSession);
  const cur = currentEntry(currentSession);
  const entries = flatEntries(currentSession);

  // título del bloque en curso
  let bloqueTitulo, bloqueEyebrow;
  if (currentSession.bloqueId) {
    bloqueTitulo = `${bloquePorId(currentSession.bloqueId).emoji} ${currentSession.bloqueNombre}`;
    bloqueEyebrow = `Bloque ${currentSession.bloqueId} · en curso`;
  } else {
    const gymLabels = currentSession.blocks.filter(b => !b.isRunning).map(b => b.label);
    bloqueTitulo = gymLabels.join(' + ') || 'Sesión articular';
    bloqueEyebrow = 'Rutina manual · en curso';
  }

  let html = '';

  // header con progreso
  html += `<div class="sess-header">
    <div class="sess-toprow">
      <div>
        <div class="eyebrow accent">${bloqueEyebrow}</div>
        <div class="sess-block-name">${bloqueTitulo}</div>
      </div>
      <div class="sess-timer" id="sessTimer">0:00</div>
    </div>
    <div class="sess-progrow">
      <div class="sess-bar"><div style="width:${tot.pct}%"></div></div>
      <div class="sess-count">${tot.done} / ${tot.total} series</div>
    </div>
    ${currentSession._recalcNote ? `<div class="sess-recalc">${currentSession._recalcNote}</div>` : ''}
  </div>`;

  html += '<div class="sess-body">';

  // ejercicios guardados por reemplazo (arriba del en curso)
  entries.forEach(e => {
    if (e.item.replacedBy && seriesMarked(e.item) > 0) {
      html += `<div class="done-swap">
        <div style="flex-shrink:0">✅</div>
        <div style="flex:1;min-width:0">
          <div class="ds-name">${e.item.name}</div>
          <div class="ds-meta">${seriesMarked(e.item)} series guardadas · cambiado a mitad</div>
        </div>
        <div class="ds-count">${seriesMarked(e.item)}/${seriesTarget(e.item)}</div>
      </div>`;
    }
  });

  // Carrusel: SOLO los ejercicios ya hechos + el que está en curso.
  // Los que faltan van abajo, en la lista "Sigue". Deslizás el carrusel para
  // revisar "los hechos"; el en curso queda a la vista al renderizar.
  const isCur = e => cur && e.blockIdx === cur.blockIdx && e.itemIdx === cur.itemIdx;
  const cards = entries.filter(e => !e.item.replacedBy && (itemComplete(e.item) || isCur(e)));
  currentSession._curRef = cur ? { blockIdx: cur.blockIdx, itemIdx: cur.itemIdx } : null;

  if (!cur) {
    html += `<div class="sess-done-banner">✅ ¡Completaste todas las series! Guardá la sesión abajo.</div>`;
  }

  if (cards.length) {
    const hechos = cards.filter(e => !isCur(e)).length;
    if (hechos > 0) {
      html += `<div class="carousel-hint">Deslizá para ver los hechos</div>`;
    }
    html += `<div class="ex-carousel" id="exCarousel">`;
    cards.forEach((e) => {
      const { block, item, blockIdx, itemIdx } = e;
      const total = seriesTarget(item);
      const marked = seriesMarked(item);
      const complete = itemComplete(item);
      const isCurrent = isCur(e);
      const canSwap = !block.isRunning;
      const rest = block.isRunning ? '1:30' : '2:00';
      let btns = '';
      for (let s = 0; s < total; s++) {
        const cls = s < marked ? 'done' : (s === marked && isCurrent ? 'current' : '');
        btns += `<button class="series-btn ${cls}" data-set="${s}">${s + 1}</button>`;
      }
      const eyebrow = complete ? `✓ Hecho · ${entryZoneLabel(block, item)}`
        : (isCurrent ? `Ahora · ${entryZoneLabel(block, item)}` : entryZoneLabel(block, item));
      const equip = item.equipment ? `${item.equipment} · ` : '';
      const contador = marked === 0 ? `Arranca en 0 de ${total}` : `${marked} de ${total} series`;
      html += `<div class="ex-card ${isCurrent ? 'current' : ''} ${complete ? 'complete' : ''}" data-b="${blockIdx}" data-i="${itemIdx}">
        <div class="now-top">
          <div class="eyebrow accent">${eyebrow}</div>
          <div class="now-actions">
            <button class="icon-btn card-ficha" title="Ver ficha">👁</button>
            ${canSwap ? '<button class="icon-btn card-swap" title="Cambiar ejercicio">⇄</button>' : ''}
          </div>
        </div>
        <div class="now-name">${item.name}</div>
        <div class="now-presc">${equip}${item.detail}</div>
        <div class="series-row">${btns}</div>
        <div class="rest-row">
          <div class="rest-txt">${contador}</div>
          <button class="rest-btn" data-rest="${block.isRunning ? 90 : 120}">▶ Iniciar descanso ${rest}</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // "Sigue": los ejercicios que faltan (ni el en curso ni los ya hechos).
  // Gimnasio individual; los bloques articulares se agrupan en una fila.
  const upcoming = entries.filter(e => !isCur(e) && !itemComplete(e.item) && !e.item.replacedBy);
  if (upcoming.length) {
    html += `<div class="section"><div class="eyebrow">Sigue</div><div class="up-list" style="margin-top:10px">`;
    currentSession.blocks.forEach((block, bi) => {
      const pend = upcoming.filter(e => e.blockIdx === bi);
      if (!pend.length) return;
      if (block.isRunning) {
        const fd = pend.reduce((a, e) => a + seriesMarked(e.item), 0);
        const ft = pend.reduce((a, e) => a + seriesTarget(e.item), 0);
        const fixed = block.isFixed;
        html += `<div class="up-row ${fixed ? 'fixed' : ''}">
          <div class="up-main">
            <div class="up-name">${block.emoji} ${fixed ? 'Base articular + abdomen' : 'Calentamiento reactivo'}</div>
            <div class="up-meta">${pend.length} ejercicios · ${fixed ? 'no se recorta' : 'antes de las pesas'}</div>
          </div>
          <div class="up-count">${fd}/${ft}</div>
        </div>`;
      } else {
        const g = EXERCISE_DB.groups[block.key];
        pend.forEach(e => {
          const musc = g ? g.label : block.label;
          const equip = e.item.equipment ? e.item.equipment + ' · ' : '';
          html += `<div class="up-row">
            <div class="up-main">
              <div class="up-name">${e.item.name}</div>
              <div class="up-meta">${equip}${musc} · ${e.item.detail}</div>
            </div>
            <div class="up-count">${seriesMarked(e.item)}/${seriesTarget(e.item)}</div>
          </div>`;
        });
      }
    });
    html += `</div></div>`;
  }

  // cierre
  html += `<div class="sess-close">
    <button class="btn btn-success" id="btnTerminar">Terminar y guardar</button>
    <button class="btn-cancel" id="btnCancelarSesion">✕</button>
  </div>`;

  html += '</div>';
  screen.innerHTML = html;
  bindSession();
  startSessionTimer();
}

function bindSession() {
  // cada tarjeta del carrusel maneja sus propios controles
  document.querySelectorAll('.ex-card').forEach(card => {
    const bi = parseInt(card.dataset.b, 10);
    const ii = parseInt(card.dataset.i, 10);
    const item = currentSession.blocks[bi].items[ii];
    const total = seriesTarget(item);

    card.querySelectorAll('.series-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = parseInt(btn.dataset.set, 10);
        item.setsDone = (seriesMarked(item) === s + 1) ? s : s + 1;
        item.done = item.setsDone >= total;
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 90);
        store.current = currentSession;
        renderSession();
      });
    });
    const fichaBtn = card.querySelector('.card-ficha');
    if (fichaBtn) fichaBtn.addEventListener('click', () => openFicha(bi, ii));
    const swapBtn = card.querySelector('.card-swap');
    if (swapBtn) swapBtn.addEventListener('click', () => openSwap(bi, ii));
    const restBtn = card.querySelector('.rest-btn');
    if (restBtn) restBtn.addEventListener('click', () => startRest(parseInt(restBtn.dataset.rest, 10), item.name, restBtn));
  });

  // trampa del scrollLeft inicial: hay que fijarlo DESPUÉS de tener layout,
  // no en el HTML. Centra la tarjeta en curso sin animación.
  const carousel = document.getElementById('exCarousel');
  const curCard = carousel && carousel.querySelector('.ex-card.current');
  if (carousel && curCard) {
    carousel.scrollLeft = curCard.offsetLeft - carousel.offsetLeft;
  }

  document.getElementById('btnTerminar').addEventListener('click', guardarSesion);
  document.getElementById('btnCancelarSesion').addEventListener('click', () => {
    if (!confirm('¿Cancelar la sesión? Se pierden las series marcadas.')) return;
    stopRest();
    currentSession = null;
    store.current = null;
    state.bloqueOverride = null;
    renderHoy();
  });
}

// Cronómetro de la sesión: M:SS hasta la hora, luego H:MM h.
// Evita el bug de mostrar "70:12" a los 70 minutos.
function fmtSessTime(s) {
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')} h`;
}

function startSessionTimer() {
  const el = document.getElementById('sessTimer');
  if (!el || !currentSession) return;
  const started = currentSession.startedAt || Date.now();
  const tick = () => {
    const now = document.getElementById('sessTimer');
    if (!now || !currentSession) return;
    now.textContent = fmtSessTime(Math.floor((Date.now() - started) / 1000));
  };
  tick();
  if (state._sessTick) clearInterval(state._sessTick);
  state._sessTick = setInterval(tick, 1000);
}

// --- Audio de la chicharra ---
// El AudioContext debe crearse/reanudarse dentro de un gesto del usuario
// (política de autoplay). startRest sale de un click, así que lo preparamos ahí.
let _audioCtx = null;
function ensureAudio() {
  try {
    if (!_audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) _audioCtx = new AC();
    }
    if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});
  } catch (e) { _audioCtx = null; }
  return _audioCtx;
}

// Beep de dos tonos con envolvente suave, a través de un compresor para que
// no sature ni haga "click". Más vibración del teléfono.
function playBuzzer() {
  const ctx = ensureAudio();
  if (ctx) {
    try {
      const comp = ctx.createDynamicsCompressor();
      comp.connect(ctx.destination);
      const t0 = ctx.currentTime;
      [[880, 0], [1320, 0.19]].forEach(([freq, offset]) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t = t0 + offset;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.45, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
        osc.connect(g); g.connect(comp);
        osc.start(t); osc.stop(t + 0.19);
      });
    } catch (e) {}
  }
  try { if (navigator.vibrate) navigator.vibrate([200, 90, 200]); } catch (e) {}
}

// Descanso basado en timestamp: sigue siendo exacto aunque el navegador
// ralentice el setInterval con la pantalla apagada o la app en segundo plano.
function startRest(secs, name, btn) {
  stopRest();
  ensureAudio(); // preparar el audio dentro del gesto del click
  state.restTimer = { name, endAt: Date.now() + secs * 1000, buzzed: false };
  const update = () => {
    if (!state.restTimer) return;
    const s = Math.max(0, Math.round((state.restTimer.endAt - Date.now()) / 1000));
    if (s <= 0) {
      if (!state.restTimer.buzzed) { state.restTimer.buzzed = true; playBuzzer(); }
      btn.textContent = '✓ Descanso listo';
      btn.classList.remove('running');
      stopRest();
      return;
    }
    btn.textContent = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    btn.classList.add('running');
  };
  update();
  state.restInterval = setInterval(update, 250);
}
function stopRest() {
  if (state.restInterval) clearInterval(state.restInterval);
  state.restInterval = null;
  state.restTimer = null;
}

function guardarSesion() {
  if (!currentSession) return;
  stopRest();
  if (state._sessTick) clearInterval(state._sessTick);

  const rotation = store.rotation;
  (currentSession._pendingRotation.checkedGroups || []).forEach(g => advanceGymSlot(rotation, g));
  store.rotation = rotation;

  const history = store.history;
  history.unshift({
    date: currentSession.date,
    weekday: currentSession.weekday,
    bloqueId: currentSession.bloqueId,
    bloqueNombre: currentSession.bloqueNombre,
    blocks: currentSession.blocks,
  });
  store.history = history;

  const plan = store.plan;
  const idEntrenado = bloqueDeSesion(currentSession);
  if (idEntrenado) plan.ultimoBloque = idEntrenado;
  plan.sesiones = (plan.sesiones || 0) + 1;
  store.plan = plan;

  currentSession = null;
  store.current = null;
  state.bloqueOverride = null;
  state.dismissWarn = false;
  alert('¡Entrenamiento guardado! 💪');
  renderHoy();
}

// ================= CAMBIAR EJERCICIO (SWAP) =================
// carga articular por equipo (menor = más suave)
const JOINT_LOAD = {
  'maquina': 0, 'barra guiada': 1, 'polea': 1, 'peso corporal': 2,
  'mancuernas': 2, 'disco': 2, 'kettlebell': 2, 'banco': 2, 'barra': 3,
};
const LEG_GROUPS = ['CUADRICEPS', 'FEMORALES', 'GLUTEOS', 'GEMELOS', 'ABDUCTOR'];

function displayVariant(ex) { return ex.variants.find(Boolean) || { series: '3', reps: '10-12' }; }

function candidatosSwap(block, item) {
  const inUse = new Set(block.items.map(i => i.name));
  const originalPattern = patternFor(item.name, block.key);
  const pool = [];
  // mismo grupo
  const gExs = (EXERCISE_DB.groups[block.key] || { exercises: [] }).exercises;
  gExs.forEach(ex => { if (!inUse.has(ex.name)) pool.push({ ex, group: block.key }); });
  // molestia en pierna: sumar los otros grupos de pierna (puede cambiar el músculo)
  if (state.swapIntent === 'molestia' && LEG_GROUPS.includes(block.key)) {
    LEG_GROUPS.filter(k => k !== block.key).forEach(k => {
      (EXERCISE_DB.groups[k] ? EXERCISE_DB.groups[k].exercises : []).forEach(ex => {
        if (!inUse.has(ex.name)) pool.push({ ex, group: k });
      });
    });
  }
  const rows = pool.map(p => {
    const v = displayVariant(p.ex);
    const load = JOINT_LOAD[p.ex.equipment] != null ? JOINT_LOAD[p.ex.equipment] : 2;
    const samePattern = patternFor(p.ex.name, p.group) === originalPattern;
    const crossMuscle = p.group !== block.key;
    return { ex: p.ex, group: p.group, v, load, samePattern, crossMuscle, equipment: p.ex.equipment };
  });

  if (state.swapIntent === 'ocupada') {
    // mismo estímulo, otro equipo: patrón parecido primero, luego variedad de equipo
    rows.sort((a, b) => {
      if (a.samePattern !== b.samePattern) return a.samePattern ? -1 : 1;
      const da = a.equipment === item.equipment ? 1 : 0;
      const db = b.equipment === item.equipment ? 1 : 0;
      return da - db;
    });
  } else {
    // menor carga articular primero
    rows.sort((a, b) => a.load - b.load);
  }
  return rows;
}

function qualifierFor(row) {
  if (state.swapIntent === 'molestia') {
    if (row.load <= 1) return 'sin carga axial';
    if (row.equipment === 'peso corporal') return 'sin peso extra';
    if (row.load >= 3) return 'exige más rodilla';
  } else {
    if (row.equipment === 'barra guiada' || row.equipment === 'maquina') return 'recorrido fijo';
  }
  return '';
}

function openSwap(blockIdx, itemIdx) {
  state.sheet = { type: 'swap', blockIdx, itemIdx };
  state.swapIntent = 'ocupada';
  renderSwap();
  showSheet('sheetSwap');
}

function renderSwap() {
  if (!state.sheet || state.sheet.type !== 'swap') return;
  const { blockIdx, itemIdx } = state.sheet;
  const block = currentSession.blocks[blockIdx];
  const item = block.items[itemIdx];
  const rows = candidatosSwap(block, item);
  const molestia = state.swapIntent === 'molestia';

  let html = `<div class="grabber"></div>
    <div class="swap-head">
      <div class="eyebrow">Cambiar · solo por hoy</div>
      <div class="swap-title-row">
        <div class="swap-name">${item.name}</div>
        <button class="swap-close" id="swapClose">✕</button>
      </div>
      <div class="intent-btns">
        <button class="intent-btn ocupada ${!molestia ? 'active' : ''}" data-intent="ocupada">Está ocupada</button>
        <button class="intent-btn molestia ${molestia ? 'active' : ''}" data-intent="molestia">Me molesta algo</button>
      </div>
      <div class="intent-context ${molestia ? 'molestia' : ''}">${molestia
        ? 'Menos carga de rodilla, la articulación de este ejercicio.'
        : 'Mismo estímulo, otro equipo.'}</div>
    </div>
    <div class="swap-list">`;

  if (!rows.length) {
    html += '<p class="empty-msg">No quedan alternativas para este ejercicio.</p>';
  }
  rows.forEach((r, i) => {
    const best = i === 0;
    const qual = qualifierFor(r);
    const disc = molestia && r.load >= 3;
    let badge = '';
    if (best) badge = molestia
      ? '<span class="swap-badge rodilla">menos rodilla</span>'
      : '<span class="swap-badge cerca">más cercano</span>';
    const cross = r.crossMuscle ? `<div class="swap-item-target">→ ${EXERCISE_DB.groups[r.group].label}</div>` : '';
    html += `<div class="swap-item ${best ? 'best' : ''} ${best && molestia ? 'molestia' : ''} ${disc ? 'discouraged' : ''}" data-i="${i}">
      <div class="swap-item-main">
        <div class="swap-item-name">${r.ex.name} ${badge}</div>
        <div class="swap-item-meta">${r.equipment || 'equipo'} · ${r.v.series} series × ${r.v.reps}${qual ? ' · ' + qual : ''}</div>
      </div>
      ${cross}
    </div>`;
  });
  html += '</div>';

  const sheet = document.getElementById('sheetSwap');
  sheet.innerHTML = html;
  document.getElementById('swapClose').addEventListener('click', closeSheets);
  sheet.querySelectorAll('.intent-btn').forEach(b => b.addEventListener('click', () => {
    state.swapIntent = b.dataset.intent;
    renderSwap();
  }));
  sheet.querySelectorAll('.swap-item').forEach(el => el.addEventListener('click', () => {
    aplicarSwap(blockIdx, itemIdx, rows[parseInt(el.dataset.i, 10)]);
  }));
}

function aplicarSwap(blockIdx, itemIdx, row) {
  const block = currentSession.blocks[blockIdx];
  const original = block.items[itemIdx];
  const targetGroup = EXERCISE_DB.groups[row.group];
  const nuevo = {
    name: row.ex.name,
    detail: `${row.v.series} series x ${row.v.reps}`,
    equipment: row.ex.equipment || '',
    group: row.group,
    series: parseInt(row.v.series, 10) || 0,
    setsDone: 0, done: false,
    fromSwap: original.name,
  };
  const hechas = seriesMarked(original);
  let note = '';
  if (hechas > 0) {
    const nuevasT = seriesTarget(nuevo);
    // el original queda completo con lo que se hizo
    original.series = hechas;
    original.setsDone = hechas;
    original.done = true;
    original.replacedBy = nuevo.name;
    block.items.splice(itemIdx + 1, 0, nuevo);
    note = `El total se recalculó: ${original.name} quedó en ${hechas} y entraron ${nuevasT} nuevas.`;
  } else {
    // nada hecho: reemplazo en el lugar
    block.items[itemIdx] = nuevo;
    note = `Cambiaste ${original.name} por ${nuevo.name}.`;
  }
  currentSession._recalcNote = note;
  store.current = currentSession;
  closeSheets();
  renderSession();
}

// ================= FICHA DE EJERCICIO =================
const MUSCLE_TRANSFER = {
  Pecho: 'Estabiliza el tronco en el braceo; poca transferencia directa a la zancada.',
  Espalda: 'Postura erguida y braceo eficiente en carreras largas.',
  Hombros: 'Sostiene el braceo sin fatigarse en el tramo final.',
  Bíceps: 'Braceo controlado; aporte indirecto a la carrera.',
  Tríceps: 'Empuje del braceo en sprints y subidas.',
  Cuádriceps: 'Frena la rodilla en cada aterrizaje: clave contra el impacto.',
  Femorales: 'Impulsan la fase de propulsión y protegen la rodilla.',
  Glúteos: 'Motor de la zancada y estabilizador de cadera al correr.',
  Gemelos: 'Rebote del tobillo en cada paso: economía de carrera.',
  Abductores: 'Estabilizan la cadera y evitan que la rodilla colapse hacia adentro.',
  Abdomen: 'Transfiere fuerza entre tren superior e inferior; postura al correr.',
};
const AREA_TRANSFER = {
  Tobillo: 'Rigidez elástica del tobillo: menos periostitis, más rebote.',
  'Tobillo/Gemelo': 'Absorbe y devuelve energía en cada apoyo.',
  'Tobillo/Reactivo': 'Prepara los tendones para el impacto repetido de correr.',
  Pie: 'Un arco fuerte es la base de una pisada estable.',
  Core: 'El core evita que la energía se pierda en cada zancada.',
  'Cadera/Glúteo': 'Cadera estable = rodilla protegida y zancada potente.',
  Abdomen: 'Meta de examen: reps a ritmo, sostenido en toda sesión.',
};

const GROUP_REGIONS = {
  PECTORALES: ['f-chest'], HOMBROS: ['f-sh-l', 'f-sh-r'], BICEPS: ['f-bi-l', 'f-bi-r'],
  ABDOMEN: ['f-abs'], CUADRICEPS: ['f-quad-l', 'f-quad-r'],
  ABDUCTOR: ['f-add-l', 'f-add-r', 'f-hip-l', 'f-hip-r'],
  ESPALDA: ['b-upper', 'b-lats', 'b-low'], TRICEPS: ['b-tri-l', 'b-tri-r'],
  GLUTEOS: ['b-glu-l', 'b-glu-r'], FEMORALES: ['b-ham-l', 'b-ham-r'], GEMELOS: ['b-calf-l', 'b-calf-r'],
};
const AREA_REGIONS = {
  'Tobillo': ['f-tib-l', 'f-tib-r', 'b-calf-l', 'b-calf-r'],
  'Tobillo/Gemelo': ['b-calf-l', 'b-calf-r', 'f-tib-l', 'f-tib-r'],
  'Tobillo/Reactivo': ['b-calf-l', 'b-calf-r', 'f-tib-l', 'f-tib-r', 'f-foot-l', 'f-foot-r'],
  'Pie': ['f-foot-l', 'f-foot-r'],
  'Rodilla/Cadera': ['f-quad-l', 'f-quad-r', 'f-hip-l', 'f-hip-r', 'b-glu-l', 'b-glu-r'],
  'Cadera/Glúteo': ['b-glu-l', 'b-glu-r', 'f-hip-l', 'f-hip-r'],
  'Cadena Posterior': ['b-ham-l', 'b-ham-r', 'b-glu-l', 'b-glu-r', 'b-low'],
  'Core': ['f-abs', 'b-low'],
  'Cadera/Movilidad': ['f-hip-l', 'f-hip-r', 'b-glu-l', 'b-glu-r'],
  'Accesorio': [],
};

// un solo cuerpo (frente o espalda), viewBox 0 0 110 210
function bodySVGSingle(view, highlights) {
  const hl = new Set(highlights);
  const ON = 'var(--warn)', OFF = '#242c40';
  const f = id => hl.has(id) ? ON : OFF;
  const glow = id => hl.has(id) ? ' filter="url(#glow1)"' : '';
  const r = (id, x, y, w, h, rx) => `<rect id="${id}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${f(id)}"${glow(id)}/>`;
  const e = (id, cx, cy, rx, ry) => `<ellipse id="${id}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f(id)}"${glow(id)}/>`;
  const base = `<g fill="#1a2133" stroke="#333d57" stroke-width="1">
    <circle cx="55" cy="20" r="12"/>
    <rect x="38" y="34" width="34" height="62" rx="10"/>
    <rect x="24" y="38" width="11" height="50" rx="5"/>
    <rect x="75" y="38" width="11" height="50" rx="5"/>
    <rect x="40" y="94" width="30" height="16" rx="6"/>
    <rect x="41" y="108" width="13" height="74" rx="6"/>
    <rect x="56" y="108" width="13" height="74" rx="6"/>
    <rect x="39" y="182" width="17" height="7" rx="3"/>
    <rect x="54" y="182" width="17" height="7" rx="3"/>
  </g>`;
  let parts;
  if (view === 'frente') {
    parts = `${e('f-sh-l', 30, 42, 7, 6)}${e('f-sh-r', 80, 42, 7, 6)}
      ${e('f-chest', 55, 50, 15, 8)}
      ${e('f-bi-l', 29.5, 58, 5, 9)}${e('f-bi-r', 80.5, 58, 5, 9)}
      ${r('f-abs', 46, 61, 18, 30, 5)}
      ${e('f-hip-l', 45, 101, 6, 6)}${e('f-hip-r', 65, 101, 6, 6)}
      ${e('f-add-l', 51, 122, 4, 12)}${e('f-add-r', 59, 122, 4, 12)}
      ${e('f-quad-l', 47.5, 136, 6, 22)}${e('f-quad-r', 62.5, 136, 6, 22)}
      ${e('f-tib-l', 47.5, 170, 4, 11)}${e('f-tib-r', 62.5, 170, 4, 11)}
      ${r('f-foot-l', 39, 182, 17, 7, 3)}${r('f-foot-r', 54, 182, 17, 7, 3)}`;
  } else {
    parts = `${e('b-upper', 55, 46, 14, 9)}
      ${r('b-lats', 42, 55, 26, 24, 7)}
      ${r('b-low', 47, 80, 16, 13, 4)}
      ${e('b-tri-l', 29.5, 58, 5, 9)}${e('b-tri-r', 80.5, 58, 5, 9)}
      ${e('b-glu-l', 48, 102, 7, 8)}${e('b-glu-r', 62, 102, 7, 8)}
      ${e('b-ham-l', 47.5, 136, 6, 20)}${e('b-ham-r', 62.5, 136, 6, 20)}
      ${e('b-calf-l', 47.5, 167, 5, 13)}${e('b-calf-r', 62.5, 167, 5, 13)}`;
  }
  return `<svg viewBox="0 0 110 210" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="glow1"><feDropShadow dx="0" dy="0" stdDeviation="2.5" flood-color="#ff8a3d" flood-opacity="0.8"/></filter></defs>
    ${base}${parts}
    <text x="55" y="205" text-anchor="middle" fill="#8b93a7" font-size="9">${view === 'frente' ? 'Frente' : 'Espalda'}</text>
  </svg>`;
}

// ¿el músculo objetivo está en la frente o la espalda?
function defaultView(block) {
  if (block.isRunning) return 'frente';
  const backGroups = ['ESPALDA', 'TRICEPS', 'GLUTEOS', 'FEMORALES', 'GEMELOS'];
  return backGroups.includes(block.key) ? 'espalda' : 'frente';
}

function openFicha(blockIdx, itemIdx) {
  state.sheet = { type: 'ficha', blockIdx, itemIdx };
  state.fichaTab = 'tecnica';
  state.animPlayback = { paused: false, rate: 1 };
  const block = currentSession.blocks[blockIdx];
  state.anatomyView = defaultView(block);
  renderFicha();
  showSheet('sheetFicha');
}

function renderFicha() {
  if (!state.sheet || state.sheet.type !== 'ficha') return;
  const { blockIdx, itemIdx } = state.sheet;
  const block = currentSession.blocks[blockIdx];
  const item = block.items[itemIdx];
  const total = seriesTarget(item);
  const marked = seriesMarked(item);
  const zone = entryZoneLabel(block, item);
  const bloqueTxt = currentSession.bloqueId ? `Bloque ${currentSession.bloqueId}` : 'Rutina';
  const rest = block.isRunning ? '1:30' : '2:00';

  let html = `<div class="grabber"></div><div class="ficha-pad">
    <div class="ficha-head">
      <div style="flex:1;min-width:0">
        <div class="eyebrow accent">${zone} · ${bloqueTxt}</div>
        <h1>${item.name}</h1>
        <div class="ficha-meta">${item.detail} · ${rest} de descanso</div>
      </div>
      <button class="sheet-close" id="fichaClose">✕</button>
    </div>
    <div class="ficha-tabs">
      <button class="ficha-tab ${state.fichaTab === 'tecnica' ? 'active' : ''}" data-t="tecnica">Técnica</button>
      <button class="ficha-tab ${state.fichaTab === 'anatomia' ? 'active' : ''}" data-t="anatomia">Anatomía</button>
      <button class="ficha-tab ${state.fichaTab === 'historial' ? 'active' : ''}" data-t="historial">Historial</button>
    </div>
    <div id="fichaContent"></div>
    <div class="ficha-close-block">
      <button class="btn btn-success" id="fichaMarcar">${marked < total ? `Marcar serie ${marked + 1} de ${total}` : 'Ejercicio completo'}</button>
      <div class="sec-row">
        <button class="btn btn-secondary" id="fichaVideo">▶ Video</button>
        ${!block.isRunning ? '<button class="btn btn-secondary" id="fichaSwap">⇄ Cambiar ejercicio</button>' : ''}
      </div>
    </div>
  </div>`;

  const sheet = document.getElementById('sheetFicha');
  sheet.innerHTML = html;
  renderFichaContent(block, item);

  document.getElementById('fichaClose').addEventListener('click', closeSheets);
  sheet.querySelectorAll('.ficha-tab').forEach(t => t.addEventListener('click', () => {
    state.fichaTab = t.dataset.t;
    renderFicha();
  }));
  const marcar = document.getElementById('fichaMarcar');
  marcar.addEventListener('click', () => {
    if (marked < total) { item.setsDone = marked + 1; item.done = item.setsDone >= total; store.current = currentSession; }
    closeSheets();
    renderSession();
  });
  document.getElementById('fichaVideo').addEventListener('click', () => {
    window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(item.name + ' ejercicio técnica'), '_blank', 'noopener');
  });
  const fs = document.getElementById('fichaSwap');
  if (fs) fs.addEventListener('click', () => { closeSheets(); openSwap(blockIdx, itemIdx); });
}

function renderFichaContent(block, item) {
  const el = document.getElementById('fichaContent');
  if (state.fichaTab === 'tecnica') {
    const pattern = patternFor(item.name, block.key);
    const def = pattern && ANIMS[pattern];
    const gif = gifFor(item.name, block.key);
    const dur = state.animPlayback.rate === 0.5 ? 5.2 : 2.6;
    let html = '';
    if (gif) {
      // GIF real del ejercicio, presentado como "plate" editorial (loop, sin controles)
      const chips = [
        `<span class="mchip mchip-main">${gif.principal}</span>`,
        ...(gif.sinergistas || []).map(m => `<span class="mchip">${m}</span>`),
      ].join('');
      html += `<div class="gif-plate">
        <div class="gif-window">
          <img class="gif-anim" src="${gif.gif}" alt="${item.name}" width="240" height="240"
               onerror="this.closest('.gif-plate').classList.add('gif-failed')">
          <div class="gif-fallback">${item.name}</div>
        </div>
      </div>
      <div class="mchips">${chips}</div>
      <div class="gif-hairline"></div>
      <div class="gif-foot">
        <span class="gif-attr">© Gym visual — gymvisual.com</span>
        <span class="gif-ficha">Ficha ${gif.ficha}</span>
      </div>`;
    } else if (def) {
      html += `<div class="anim-wrap">
        <div id="fichaAnim">${animSVG(def, dur)}</div>
        <div class="anim-ctrl">
          <div class="ac-label">inicio ⇄ fin · ${dur.toString().replace('.', ',')} s</div>
          <div class="ac-btns">
            <button id="acPause" class="${state.animPlayback.paused ? 'on' : ''}">${state.animPlayback.paused ? '▶ Seguir' : '⏸ Pausar'}</button>
            <button id="acSlow" class="${state.animPlayback.rate === 0.5 ? 'on' : ''}">½ Lento</button>
          </div>
        </div>
      </div>`;
    } else {
      html += '<p class="empty-msg">Sin animación para este ejercicio. Mirá el video para la técnica.</p>';
    }
    if (def) {
      html += '<div class="cues-num">' + def.cues.map((c, i) =>
        `<div class="cue-item"><div class="cue-num">${i + 1}</div><div class="cue-txt">${c}</div></div>`).join('') + '</div>';
    }
    el.innerHTML = html;
    const svg = el.querySelector('#fichaAnim svg');
    if (svg && state.animPlayback.paused) { try { svg.pauseAnimations(); } catch (e) {} }
    const pb = document.getElementById('acPause');
    if (pb) pb.addEventListener('click', () => {
      state.animPlayback.paused = !state.animPlayback.paused;
      const s = el.querySelector('#fichaAnim svg');
      try { state.animPlayback.paused ? s.pauseAnimations() : s.unpauseAnimations(); } catch (e) {}
      pb.classList.toggle('on', state.animPlayback.paused);
      pb.textContent = state.animPlayback.paused ? '▶ Seguir' : '⏸ Pausar';
    });
    const sb = document.getElementById('acSlow');
    if (sb) sb.addEventListener('click', () => {
      state.animPlayback.rate = state.animPlayback.rate === 0.5 ? 1 : 0.5;
      renderFichaContent(block, item);
    });
  } else if (state.fichaTab === 'anatomia') {
    let regions, muscleName, transfer;
    if (block.isRunning) {
      const area = item.area || 'Accesorio';
      regions = AREA_REGIONS[area] || [];
      muscleName = area;
      transfer = AREA_TRANSFER[area] || 'Trabajo de base para sostener el volumen de carrera.';
    } else {
      regions = GROUP_REGIONS[block.key] || [];
      const g = EXERCISE_DB.groups[block.key];
      muscleName = g ? g.label : block.label;
      transfer = MUSCLE_TRANSFER[muscleName] || 'Aporta al gesto de carrera de forma indirecta.';
    }
    el.innerHTML = `<div class="anatomy">
      <div class="body-svg">${bodySVGSingle(state.anatomyView, regions)}</div>
      <div class="an-info">
        <div class="eyebrow warn">Zona trabajada</div>
        <div class="an-muscle">${muscleName}</div>
        <div class="an-transfer">${transfer}</div>
        <button class="an-toggle" id="anToggle">${state.anatomyView === 'frente' ? 'Ver espalda ›' : 'Ver frente ›'}</button>
      </div>
    </div>`;
    document.getElementById('anToggle').addEventListener('click', () => {
      state.anatomyView = state.anatomyView === 'frente' ? 'espalda' : 'frente';
      renderFichaContent(block, item);
    });
  } else {
    // historial del ejercicio
    const rows = [];
    store.history.forEach(s => s.blocks.forEach(b => b.items.forEach(i => {
      if (i.name === item.name) {
        const t = seriesTarget(i), d = seriesMarked(i);
        rows.push({ date: s.date, t, d });
      }
    })));
    if (!rows.length) {
      el.innerHTML = '<p class="empty-msg">Todavía no registraste este ejercicio.</p>';
    } else {
      el.innerHTML = '<div class="ficha-hist-list">' + rows.slice(0, 12).map(r => {
        const f = new Date(r.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return `<div class="ficha-hist-row"><span>${f}</span><span class="fh-c">${r.d}/${r.t} series</span></div>`;
      }).join('') + '</div>';
    }
  }
}

// ================= HOJAS: MOSTRAR/OCULTAR =================
function showSheet(id) {
  const scrim = document.getElementById('scrim');
  scrim.hidden = false;
  requestAnimationFrame(() => scrim.classList.add('show'));
  const sheet = document.getElementById(id);
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add('show'));
}
function closeSheets() {
  ['sheetFicha', 'sheetSwap'].forEach(id => {
    const s = document.getElementById(id);
    s.classList.remove('show');
    setTimeout(() => { s.hidden = true; }, 220);
  });
  const scrim = document.getElementById('scrim');
  scrim.classList.remove('show');
  setTimeout(() => { scrim.hidden = true; }, 220);
  state.sheet = null;
}
document.getElementById('scrim').addEventListener('click', closeSheets);

// ================= HISTORIAL =================
function raceLabel(r) {
  const NOMBRE_TIPO = { suave: 'Rodaje suave', tempo: 'Tempo', intervalos: 'Intervalos', test: 'Test' };
  return NOMBRE_TIPO[r.workout] || r.workout;
}
function fmtSegundos(s) { const m = Math.floor(s / 60), r = Math.round(s % 60); return `${m}:${String(r).padStart(2, '0')}`; }
function paceDe(km, seg) { if (!km || !seg) return null; return seg / km; }

function renderHistory() {
  const screen = document.getElementById('screen-historial');
  const history = store.history;
  const runs = store.runs;

  // unificar en una línea de tiempo
  let items = [];
  if (state.historyFilter !== 'carrera') history.forEach((s, idx) => items.push({ kind: 'gym', date: s.date, s, idx }));
  if (state.historyFilter !== 'gimnasio') runs.forEach((r, idx) => items.push({ kind: 'race', date: r.start_date, r, idx }));
  items.sort((a, b) => new Date(b.date) - new Date(a.date));

  const total = history.length;
  const esteMes = (() => {
    const now = new Date();
    return history.filter(s => { const d = new Date(s.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  })();
  const desde = total ? new Date(history[history.length - 1].date) : null;
  const desdeTxt = desde ? `desde el ${desde.getDate()} de ${NOMBRE_MES[desde.getMonth()]}` : '';

  let html = `<div class="screen-pad">
    <div class="eyebrow">Historial</div>
    <h1 class="screen-title">${total} ${total === 1 ? 'sesión' : 'sesiones'}</h1>
    ${total ? `<p class="block-meta">${desdeTxt} · ${esteMes} este mes</p>` : ''}
    <div class="filter-row">
      ${['todo', 'gimnasio', 'carrera'].map(f =>
        `<button class="filter-pill ${state.historyFilter === f ? 'active' : ''}" data-f="${f}">${f === 'todo' ? 'Todo' : f === 'gimnasio' ? 'Gimnasio' : 'Carrera'}</button>`).join('')}
    </div>`;

  if (!items.length) {
    html += '<p class="empty-msg">Todavía no registraste entrenamientos ni carreras.</p></div>';
    screen.innerHTML = html;
    bindHistoryFilters();
    return;
  }

  // agrupar por mes
  const byMonth = {};
  items.forEach(it => {
    const d = new Date(it.date);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    (byMonth[ym] = byMonth[ym] || []).push(it);
  });
  const yms = Object.keys(byMonth).sort().reverse();
  const shown = yms.slice(0, state.histLimit);

  shown.forEach(ym => {
    const list = byMonth[ym];
    const [y, mo] = ym.split('-');
    const gymCount = list.filter(x => x.kind === 'gym').length;
    const seriesCount = list.filter(x => x.kind === 'gym')
      .reduce((a, x) => a + x.s.blocks.reduce((aa, b) => aa + b.items.reduce((s, i) => s + seriesMarked(i), 0), 0), 0);
    html += `<div class="month-head">
      <div class="eyebrow">${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y}</div>
      <div class="m-meta">${gymCount} entrenamiento${gymCount !== 1 ? 's' : ''} · ${seriesCount} series</div>
    </div><div class="hist-list">`;
    list.forEach(it => {
      html += it.kind === 'gym' ? gymCard(it) : raceCard(it);
    });
    html += '</div>';
  });

  if (yms.length > shown.length) {
    const next = yms[shown.length].split('-');
    html += `<button class="more-btn" id="moreBtn">Ver ${MONTH_NAMES[parseInt(next[1], 10) - 1]} y anteriores</button>`;
  }

  html += '</div>';
  screen.innerHTML = html;
  bindHistoryFilters();
  bindHistoryCards();
}

function gymCard(it) {
  const s = it.s;
  const d = new Date(s.date);
  const fecha = `${WEEKDAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  let done = 0, tot = 0;
  s.blocks.forEach(b => b.items.forEach(i => { done += seriesMarked(i); tot += seriesTarget(i); }));
  const groups = s.blocks.map(b => `${b.emoji} ${EXERCISE_DB.groups[b.key] ? EXERCISE_DB.groups[b.key].label : b.label}`).join(' · ');
  const stateCls = done >= tot ? 'full' : (done > 0 ? 'partial' : 'warnc');
  const id = 'gym-' + it.idx + '-' + s.date;
  const open = state.expandedSessionId === id;

  let detail = '';
  s.blocks.forEach(b => {
    const artCls = b.isRunning ? ' art' : '';
    const gLabel = EXERCISE_DB.groups[b.key] ? EXERCISE_DB.groups[b.key].label : b.label;
    detail += `<div class="grp-sub${artCls}">${b.emoji} ${gLabel}</div>`;
    b.items.forEach(i => {
      if (i.replacedBy) return; // se muestra junto al reemplazo
      const t = seriesTarget(i), dd = seriesMarked(i);
      const ico = dd >= t ? '✅' : (dd > 0 ? '🔸' : '⬜');
      let name = i.name;
      if (i.fromSwap) name = `<span class="old-name">${i.fromSwap}</span> <span class="swap-arrow">→</span> ${i.name}`;
      // buscar el original reemplazado para el contador combinado
      const orig = b.items.find(x => x.replacedBy === i.name);
      const cnt = orig ? `${seriesMarked(orig)} + ${dd}` : `${dd}/${t}`;
      detail += `<div class="ex-line">${ico} <span>${name}</span><span class="ex-c">${cnt}</span></div>`;
    });
  });

  return `<div class="hist-card ${open ? 'open' : ''}" data-id="${id}">
    <div class="hc-top">
      <div class="hc-main">
        <div class="hc-date">${fecha}</div>
        <div class="hc-groups">${groups}</div>
      </div>
      <div class="hc-right">
        <div class="hc-series ${stateCls}">${done} / ${tot}</div>
        <div class="hc-serieslbl">series</div>
      </div>
      <div class="hc-chev">${open ? '⌄' : '›'}</div>
    </div>
    <div class="hc-detail">${detail}
      <button class="del-inline" data-del="gym" data-idx="${it.idx}">Eliminar sesión</button>
    </div>
  </div>`;
}

function raceCard(it) {
  const r = it.r;
  const d = new Date(r.start_date);
  const fecha = `${WEEKDAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const km = r.distance / 1000;
  const pace = paceDe(km, r.moving_time);
  const dur = r.workout === 'intervalos' || r.workout === 'tempo' || r.workout === 'test' ? 'duro' : 'suave';
  return `<div class="hist-card race">
    <div class="hc-top">
      <div class="hc-main">
        <div class="hc-date">${fecha} · 🏃 ${raceLabel(r)}</div>
        <div class="hc-groups">${km.toFixed(1).replace('.', ',')} km · ${fmtSegundos(r.moving_time)}${pace ? ` · ${fmtSegundos(pace)}/km` : ''}${r.average_heartrate ? ` · ${r.average_heartrate} lpm` : ''}</div>
      </div>
      <div class="hc-right">
        <div class="hc-series warnc">${r.trainer ? 'cinta' : 'calle'}</div>
        <div class="hc-serieslbl" style="color:var(--warn)">${dur}</div>
      </div>
    </div>
  </div>`;
}

function bindHistoryFilters() {
  document.querySelectorAll('#screen-historial .filter-pill').forEach(p => p.addEventListener('click', () => {
    state.historyFilter = p.dataset.f;
    state.histLimit = 1;
    renderHistory();
  }));
  const more = document.getElementById('moreBtn');
  if (more) more.addEventListener('click', () => { state.histLimit++; renderHistory(); });
}
function bindHistoryCards() {
  document.querySelectorAll('#screen-historial .hist-card[data-id]').forEach(card => {
    card.querySelector('.hc-top').addEventListener('click', () => {
      const id = card.dataset.id;
      state.expandedSessionId = state.expandedSessionId === id ? null : id;
      renderHistory();
    });
    const del = card.querySelector('[data-del]');
    if (del) del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('¿Eliminar esta sesión del historial?')) return;
      const h = store.history; h.splice(parseInt(del.dataset.idx, 10), 1); store.history = h;
      state.expandedSessionId = null;
      renderHistory();
    });
  });
}

// ================= PROGRESO =================
const UPPER = ['PECTORALES', 'ESPALDA', 'HOMBROS', 'BICEPS', 'TRICEPS'];
const LOWER = ['CUADRICEPS', 'FEMORALES', 'GLUTEOS', 'GEMELOS', 'ABDUCTOR'];

function renderProgreso() {
  const screen = document.getElementById('screen-progreso');
  const history = store.history;
  const h = hoy();
  const hace30 = new Date(h.getTime() - 30 * 86400000);

  if (!history.length) {
    screen.innerHTML = `<div class="screen-pad"><div class="eyebrow">Progreso</div>
      <h1 class="screen-title">Últimos 30 días</h1>
      <p class="empty-msg" style="margin-top:16px">Sin datos aún. Registrá entrenamientos para ver tu progreso.</p></div>`;
    return;
  }

  // acumular series de los últimos 30 días
  let seriesArt = 0, seriesTotalAll = 0;
  const seriesBloque = {}; BLOQUES.forEach(b => seriesBloque[b.id] = 0);
  const seriesGrupo = {}; Object.keys(EXERCISE_DB.groups).forEach(k => seriesGrupo[k] = 0);
  const areaSeries = {};
  history.forEach(session => {
    if (soloFecha(session.date) < hace30) return;
    session.blocks.forEach(block => {
      const hechas = block.items.reduce((a, i) => a + seriesMarked(i), 0);
      if (!hechas) return;
      seriesTotalAll += hechas;
      if (block.isRunning) {
        seriesArt += hechas;
        block.items.forEach(i => {
          const m = seriesMarked(i); if (!m) return;
          const area = i.area || 'Otro';
          areaSeries[area] = (areaSeries[area] || 0) + m;
        });
        return;
      }
      seriesGrupo[block.key] = (seriesGrupo[block.key] || 0) + hechas;
      const b = bloqueDeGrupo(block.key);
      if (b) seriesBloque[b.id] += hechas;
    });
  });

  const pctArt = seriesTotalAll ? Math.round((seriesArt / seriesTotalAll) * 100) : 0;
  const cumple = pctArt >= 30;

  let html = `<div class="screen-pad">
    <div class="eyebrow">Progreso</div>
    <h1 class="screen-title">Últimos 30 días</h1>`;

  // hero base articular
  const chips = Object.entries(areaSeries).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const areaTotal = Object.values(areaSeries).reduce((a, b) => a + b, 0) || 1;
  html += `<div class="hero-art">
    <div class="eyebrow">🦵 Base articular para correr</div>
    <div class="hero-num"><span class="big">${pctArt}%</span><span class="side">de tu volumen · objetivo 30%</span></div>
    <div class="hero-bar"><div style="width:${Math.min(pctArt, 100)}%"></div></div>
    <p class="hero-verdict ${cumple ? 'ok' : 'no'}">${cumple
      ? '¡Buen equilibrio! Le estás dando prioridad a la base articular para correr.'
      : 'Todavía es bajo. Apuntá a que al menos ~30% de tu volumen sea trabajo articular y de estabilidad.'}</p>
    ${chips.length ? `<div class="zone-chips">${chips.map(([a, n]) =>
      `<span class="zone-chip">${a} ${Math.round((n / areaTotal) * 100)}%</span>`).join('')}</div>` : ''}
  </div>`;

  // ranking de bloques por urgencia
  const sinBloque = diasSinEntrenarPorBloque();
  const idHoy = proximoBloqueId();
  const filas = BLOQUES.map(b => ({
    b, dias: sinBloque[b.id], series: seriesBloque[b.id],
    pct: seriesTotalAll ? Math.round((seriesBloque[b.id] / seriesTotalAll) * 100) : 0,
  }));
  filas.sort((x, y) => {
    if (x.dias === null && y.dias === null) return x.b.id - y.b.id;
    if (x.dias === null) return -1;
    if (y.dias === null) return 1;
    return y.dias - x.dias;
  });
  html += `<div class="section"><div class="eyebrow">Bloques por urgencia</div><div class="urg-list" style="margin-top:10px">`;
  filas.forEach(f => {
    const esHoy = f.b.id === idHoy;
    html += `<div class="urg-row ${esHoy ? 'u-hoy' : urgClass(f.dias)}">
      <div class="urg-main">
        <div class="urg-name">${f.b.emoji} Bloque ${f.b.id} · ${f.b.nombre} ${esHoy ? '<span class="badge-hoy">HOY</span>' : ''}</div>
        <div class="urg-meta">${f.series} series (30 d) · ${f.pct}% del volumen</div>
      </div>
      <div class="urg-days">${txtDias(f.dias)}</div>
    </div>`;
  });
  html += `<div class="urg-row u-fijo">
    <div class="urg-main">
      <div class="urg-name">🔩 Base articular + abdomen</div>
      <div class="urg-meta">${seriesArt} series (30 d) · ${pctArt}% del volumen</div>
    </div>
    <div class="urg-days" style="color:var(--warn)">fijo</div>
  </div></div></div>`;

  // volumen por músculo (top 5 / ver los 11)
  const grupos = Object.entries(seriesGrupo).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const maxG = Math.max(1, ...grupos.map(g => g[1]));
  const totG = grupos.reduce((a, g) => a + g[1], 0) || 1;
  const shownG = state.showAllMuscles ? grupos : grupos.slice(0, 5);
  html += `<div class="section"><div class="section-head">
      <div class="eyebrow">Volumen por músculo</div>
      ${grupos.length > 5 ? `<span class="link" id="verMusc">${state.showAllMuscles ? 'Ver top 5' : `Ver los ${grupos.length}`}</span>` : ''}
    </div><div class="vol-bars">`;
  shownG.forEach(([k, n]) => {
    const g = EXERCISE_DB.groups[k];
    const color = LOWER.includes(k) ? 'var(--accent)' : (UPPER.includes(k) ? 'var(--accent-2)' : 'var(--warn)');
    html += `<div class="vol-row">
      <div class="vol-label">${g.label}</div>
      <div class="vol-track"><div class="vol-fill" style="width:${(n / maxG) * 100}%;background:${color}"></div></div>
      <div class="vol-pct">${Math.round((n / totG) * 100)}%</div>
    </div>`;
  });
  html += '</div></div>';

  // mes a mes (barra apilada 4 familias)
  html += renderMesAMes(history);

  html += '</div>';
  screen.innerHTML = html;

  const vm = document.getElementById('verMusc');
  if (vm) vm.addEventListener('click', () => { state.showAllMuscles = !state.showAllMuscles; renderProgreso(); });
}

function familiaDeSerie(block, item) {
  if (block.isRunning) {
    const area = item.area || '';
    if (/abdomen/i.test(area)) return 'core';
    if (/core|cadera|gl[uú]teo/i.test(area)) return 'core';
    return 'articular';
  }
  if (LOWER.includes(block.key)) return 'inferior';
  if (UPPER.includes(block.key)) return 'superior';
  if (block.key === 'ABDOMEN') return 'core';
  return 'superior';
}

function renderMesAMes(history) {
  const months = {};
  history.forEach(session => {
    const d = new Date(session.date);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const m = months[ym] = months[ym] || { sessions: 0, fam: { articular: 0, inferior: 0, superior: 0, core: 0 }, total: 0 };
    m.sessions++;
    session.blocks.forEach(block => block.items.forEach(i => {
      const s = seriesMarked(i); if (!s) return;
      m.fam[familiaDeSerie(block, i)] += s; m.total += s;
    }));
  });
  const yms = Object.keys(months).sort().reverse();
  if (!yms.length) return '';
  const COLORS = { articular: 'var(--warn)', inferior: 'var(--accent)', superior: 'var(--accent-2)', core: 'var(--ok)' };
  const LABELS = { articular: 'Articular', inferior: 'Tren inferior', superior: 'Tren superior', core: 'Core / abdomen' };

  let html = `<div class="section"><div class="eyebrow">Mes a mes</div><div class="month-card" style="margin-top:10px">`;
  yms.slice(0, 6).forEach(ym => {
    const m = months[ym];
    const [y, mo] = ym.split('-');
    const tot = m.total || 1;
    let segs = '';
    ['articular', 'inferior', 'superior', 'core'].forEach(f => {
      const w = (m.fam[f] / tot) * 100;
      if (w > 0) segs += `<div style="width:${w}%;background:${COLORS[f]}"></div>`;
    });
    html += `<div class="mc-row">
      <div class="mc-top">
        <div class="mc-name">${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y}</div>
        <div class="mc-sessions">${m.sessions} entrenamiento${m.sessions !== 1 ? 's' : ''}</div>
      </div>
      <div class="mc-stack">${segs}</div>
    </div>`;
  });
  html += `<div class="mc-legend">${['articular', 'inferior', 'superior', 'core'].map(f =>
    `<span><i style="background:${COLORS[f]}"></i>${LABELS[f]}</span>`).join('')}</div>`;
  html += '</div></div>';
  return html;
}

// ================= AJUSTES =================
const NOMBRE_TIPO = { suave: 'Rodaje suave', tempo: 'Tempo', intervalos: 'Intervalos', test: 'Test' };
let ajusteRunType = 'suave';

function renderAjustes() {
  const screen = document.getElementById('screen-ajustes');
  const h = hoy();
  let html = `<div class="screen-pad">
    <div class="eyebrow">Ajustes</div>
    <h1 class="screen-title">Tu semana</h1>
    <p class="settings-lead">Marcá qué días corrés. Los días <strong>duros</strong> (intervalos o tempo) hacen que la app evite ponerte piernas el día anterior: son el mismo sistema y no se recuperan en 24 h.</p>

    <div class="section"><div class="eyebrow">Semana de carrera</div>
      <div class="rundays" id="runDaysConfig" style="margin-top:10px"></div>
    </div>

    <div class="section"><div class="eyebrow">Registrar carrera</div>
      <div class="card" style="margin-top:10px">
        <div class="form-grid">
          <label>Fecha<input type="date" id="runDate"></label>
          <label>Dónde<select id="runPlace"><option value="calle">Calle</option><option value="cinta">Cinta</option></select></label>
          <label class="full">Tipo
            <div class="type-pills" id="typePills">
              ${['suave', 'tempo', 'intervalos', 'test'].map(t =>
                `<button type="button" class="type-pill ${t === ajusteRunType ? 'active' : ''}" data-t="${t}">${t === 'suave' ? 'Suave' : t === 'tempo' ? 'Tempo' : t === 'intervalos' ? 'Interv.' : 'Test'}</button>`).join('')}
            </div>
          </label>
          <label>Distancia (km)<input type="number" id="runKm" step="0.1" min="0" placeholder="3.2"></label>
          <label>Tiempo (mm:ss)<input type="text" id="runTime" placeholder="14:40" inputmode="numeric"></label>
          <label class="full">FC media (opcional)<input type="number" id="runHr" min="0" placeholder="155"></label>
        </div>
        <div class="pace-row"><span class="pl">Ritmo</span><span class="pv" id="paceVal">—</span></div>
        <button class="btn btn-primary" id="btnGuardarCarrera" style="margin-top:12px">Guardar carrera</button>
      </div>
      <div class="run-list" id="runList"></div>
    </div>

    <div class="section"><div class="eyebrow">Respaldo</div>
      <div class="backup-card" style="margin-top:10px">
        <p class="backup-txt" id="backupTxt"></p>
        <div class="backup-btns">
          <button class="exp" id="btnExport">⬇ Exportar</button>
          <button class="imp" id="btnImport">⬆ Importar</button>
        </div>
        <input type="file" id="importFile" accept=".json" hidden>
      </div>
    </div>
  </div>`;
  screen.innerHTML = html;

  renderRunDays();
  renderRuns();
  document.getElementById('runDate').valueAsDate = new Date();
  updatePace();

  document.getElementById('typePills').querySelectorAll('.type-pill').forEach(p => p.addEventListener('click', () => {
    ajusteRunType = p.dataset.t;
    document.getElementById('typePills').querySelectorAll('.type-pill').forEach(x => x.classList.toggle('active', x === p));
  }));
  document.getElementById('runKm').addEventListener('input', updatePace);
  document.getElementById('runTime').addEventListener('input', updatePace);
  document.getElementById('btnGuardarCarrera').addEventListener('click', guardarCarrera);
  document.getElementById('btnExport').addEventListener('click', exportBackup);
  document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', importBackup);

  // texto de último respaldo
  const lb = store.lastBackup;
  const txt = document.getElementById('backupTxt');
  if (lb) {
    const dias = diasEntre(soloFecha(lb), h);
    const cuando = dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;
    txt.innerHTML = `Tus datos viven en este dispositivo. Último respaldo <strong>${cuando}</strong>. Exportá cada tanto para no perder el historial.`;
  } else {
    txt.innerHTML = `Tus datos viven en este dispositivo. <strong>Todavía no exportaste ningún respaldo.</strong> Hacelo para no perder el historial si cambiás de teléfono.`;
  }
}

function renderRunDays() {
  const el = document.getElementById('runDaysConfig');
  const cfg = store.runDays;
  const todayIdx = new Date().getDay();
  el.innerHTML = '';
  WEEKDAYS.forEach((dia, idx) => {
    const estado = cfg[idx] || '';
    const fila = document.createElement('div');
    fila.className = 'runday-row';
    fila.innerHTML = `
      <span class="runday-name${idx === todayIdx ? ' today' : ''}">${dia}</span>
      <div class="runday-opts">
        <button class="runday-btn ${estado === '' ? 'sel' : ''}" data-d="${idx}" data-v="">No corro</button>
        <button class="runday-btn ${estado === 'suave' ? 'sel suave' : ''}" data-d="${idx}" data-v="suave">Suave</button>
        <button class="runday-btn ${estado === 'duro' ? 'sel duro' : ''}" data-d="${idx}" data-v="duro">Duro</button>
      </div>`;
    fila.querySelectorAll('.runday-btn').forEach(b => b.addEventListener('click', () => {
      const c = store.runDays;
      if (b.dataset.v === '') delete c[b.dataset.d];
      else c[b.dataset.d] = b.dataset.v;
      store.runDays = c;
      renderRunDays();
    }));
    el.appendChild(fila);
  });
}

function parseTiempoASegundos(txt) {
  const m = String(txt || '').trim().match(/^(\d+):([0-5]?\d)$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}
function updatePace() {
  const km = parseFloat(document.getElementById('runKm').value);
  const seg = parseTiempoASegundos(document.getElementById('runTime').value);
  const p = paceDe(km, seg);
  document.getElementById('paceVal').textContent = p ? `${fmtSegundos(p)} /km` : '—';
}

function guardarCarrera() {
  const fecha = document.getElementById('runDate').value;
  const km = parseFloat(document.getElementById('runKm').value);
  const seg = parseTiempoASegundos(document.getElementById('runTime').value);
  const hr = parseInt(document.getElementById('runHr').value, 10);
  if (!fecha) { alert('Poné la fecha de la carrera.'); return; }
  if (!km || km <= 0) { alert('Poné la distancia en km.'); return; }
  if (seg === null) { alert('El tiempo va en formato mm:ss — por ejemplo 14:40.'); return; }
  const runs = store.runs;
  runs.unshift({
    start_date: new Date(fecha + 'T12:00:00').toISOString(),
    type: 'Run',
    trainer: document.getElementById('runPlace').value === 'cinta',
    workout: ajusteRunType,
    distance: Math.round(km * 1000),
    moving_time: seg,
    average_heartrate: isNaN(hr) ? null : hr,
    source: 'manual',
  });
  store.runs = runs;
  document.getElementById('runKm').value = '';
  document.getElementById('runTime').value = '';
  document.getElementById('runHr').value = '';
  updatePace();
  renderRuns();
  alert('¡Carrera guardada! 🏃');
}

function renderRuns() {
  const el = document.getElementById('runList');
  const runs = store.runs;
  if (!runs.length) { el.innerHTML = '<p class="empty-msg" style="margin-top:12px">Todavía no registraste carreras.</p>'; return; }
  el.innerHTML = '';
  runs.slice(0, 10).forEach((r, idx) => {
    const km = r.distance / 1000;
    const pace = paceDe(km, r.moving_time);
    const fecha = new Date(r.start_date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    const item = document.createElement('div');
    item.className = 'run-item';
    item.innerHTML = `
      <div>
        <div class="run-top">${fecha} · ${km.toFixed(1).replace('.', ',')} km · ${fmtSegundos(r.moving_time)}</div>
        <div class="run-meta">${raceLabel(r)} · ${r.trainer ? 'cinta' : 'calle'}${pace ? ` · ${fmtSegundos(pace)}/km` : ''}${r.average_heartrate ? ` · ${r.average_heartrate} lpm` : ''}</div>
      </div>
      <button class="del-inline" data-i="${idx}">Eliminar</button>`;
    item.querySelector('.del-inline').addEventListener('click', () => {
      const list = store.runs; list.splice(idx, 1); store.runs = list; renderRuns();
    });
    el.appendChild(item);
  });
}

// ---------- BACKUP ----------
function exportBackup() {
  const payload = {
    app: 'AppRutina', exported: new Date().toISOString(),
    history: store.history, rotation: store.rotation, plan: store.plan,
    runDays: store.runDays, runs: store.runs,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'apprutina-respaldo-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  store.lastBackup = new Date().toISOString();
  renderAjustes();
}
function importBackup(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.app !== 'AppRutina' || !Array.isArray(data.history)) { alert('El archivo no parece un respaldo válido de AppRutina.'); return; }
      if (!confirm(`Importar ${data.history.length} entrenamientos. Esto reemplaza el historial actual. ¿Continuar?`)) return;
      store.history = data.history;
      if (data.rotation) store.rotation = data.rotation;
      if (data.plan) store.plan = data.plan;
      if (data.runDays) store.runDays = data.runDays;
      if (data.runs) store.runs = data.runs;
      renderAjustes();
      alert('¡Respaldo importado!');
    } catch { alert('No se pudo leer el archivo.'); }
  };
  reader.readAsText(file);
  ev.target.value = '';
}

// ================= INIT =================
const savedSession = store.current;
if (savedSession) {
  currentSession = savedSession;
  if (!currentSession.startedAt) currentSession.startedAt = Date.now();
  selectedWeekday = savedSession.weekday || selectedWeekday;
}
renderHoy();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
