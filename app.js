const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const RUNNING_KEY = 'RUNNING';

const store = {
  get history() {
    return JSON.parse(localStorage.getItem('rutina_history') || '[]');
  },
  set history(v) {
    localStorage.setItem('rutina_history', JSON.stringify(v));
  },
  get rotation() {
    return JSON.parse(localStorage.getItem('rutina_rotation') || '{}');
  },
  set rotation(v) {
    localStorage.setItem('rutina_rotation', JSON.stringify(v));
  },
  get current() {
    return JSON.parse(localStorage.getItem('rutina_current') || 'null');
  },
  set current(v) {
    if (v === null) localStorage.removeItem('rutina_current');
    else localStorage.setItem('rutina_current', JSON.stringify(v));
  },
};

let selectedWeekday = WEEKDAYS[new Date().getDay()];
let currentSession = null; // built session pending save

// ---------- TABS ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'historial') renderHistory();
    if (btn.dataset.tab === 'stats') renderStats();
  });
});

// ---------- WEEKDAY PICKER ----------
function renderWeekdayPicker() {
  const el = document.getElementById('weekdayPicker');
  el.innerHTML = '';
  WEEKDAYS.forEach(day => {
    const b = document.createElement('button');
    b.className = 'day-btn' + (day === selectedWeekday ? ' selected' : '');
    b.textContent = day;
    b.addEventListener('click', () => {
      selectedWeekday = day;
      renderWeekdayPicker();
    });
    el.appendChild(b);
  });
}

// ---------- GROUP GRID ----------
// share of all-time completed exercises per group key (RUNNING included)
function muscleUsage() {
  const counts = {};
  let total = 0;
  store.history.forEach(session => {
    session.blocks.forEach(block => {
      const done = block.items.filter(i => i.done).length;
      if (!done) return;
      const k = block.isRunning ? RUNNING_KEY : block.key;
      counts[k] = (counts[k] || 0) + done;
      total += done;
    });
  });
  return { counts, total };
}

function renderGroupGrid() {
  const el = document.getElementById('groupGrid');
  el.innerHTML = '';
  const { counts, total } = muscleUsage();
  const groupKeys = Object.keys(EXERCISE_DB.groups);
  // below an equal share across all options → falta dedicarle
  const fairShare = 100 / (groupKeys.length + 1); // +1 for RUNNING

  const byCategory = {};
  Object.entries(EXERCISE_DB.groups).forEach(([key, g]) => {
    byCategory[g.category] = byCategory[g.category] || [];
    byCategory[g.category].push([key, g]);
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
        <span class="chip-pct${low ? ' low' : ''}" title="% de tu volumen histórico">${total ? pct + '%' : '—'}</span>
        <div class="chip-bar"><div style="width:${pct}%${low ? ';background:var(--priority)' : ''}"></div></div>`;
      const input = chip.querySelector('input');
      input.addEventListener('change', () => chip.classList.toggle('checked', input.checked));
      el.appendChild(chip);
    });
  });

  // running chip
  const rPct = total ? Math.round(((counts[RUNNING_KEY] || 0) / total) * 100) : 0;
  document.getElementById('chipRunningPct').textContent = total ? rPct + '%' : '—';
  document.getElementById('chipRunningBar').style.width = rPct + '%';
}

document.getElementById('chipRunning').querySelector('input').addEventListener('change', function () {
  document.getElementById('chipRunning').classList.toggle('checked', this.checked);
});

// ---------- ROTATION HELPERS ----------
function nextGymSlot(rotation, groupKey) {
  return rotation[groupKey] || 0; // 0..3
}
function advanceGymSlot(rotation, groupKey) {
  const cur = rotation[groupKey] || 0;
  rotation[groupKey] = (cur + 1) % 4;
}
function nextRunningDay(rotation) {
  return rotation[RUNNING_KEY] || 0; // 0..2
}
function advanceRunningDay(rotation) {
  const cur = rotation[RUNNING_KEY] || 0;
  rotation[RUNNING_KEY] = (cur + 1) % EXERCISE_DB.running.dias.length;
}

function buildGymBlock(groupKey, slot) {
  const g = EXERCISE_DB.groups[groupKey];
  let picks = g.exercises
    .map(ex => ({ ex, variant: ex.variants[slot] }))
    .filter(p => p.variant);
  // fallback: if this slot happens to have nothing for this group, search other slots
  if (picks.length === 0) {
    for (let s = 0; s < 4; s++) {
      picks = g.exercises.map(ex => ({ ex, variant: ex.variants[s] })).filter(p => p.variant);
      if (picks.length) break;
    }
  }
  return {
    key: groupKey,
    label: g.label,
    emoji: g.emoji,
    isRunning: false,
    items: picks.map(p => ({
      name: p.ex.name,
      detail: `${p.variant.series} series x ${p.variant.reps}`,
      done: false,
    })),
  };
}

function buildWarmupBlock() {
  const b0 = EXERCISE_DB.running.bloque0;
  return {
    key: 'WARMUP',
    label: 'Calentamiento: Elástico y Reactivo (5 min)',
    emoji: '🔥',
    isRunning: true, // counts as articular work in stats
    isWarmup: true,
    items: b0.items.map(it => ({
      name: it.name,
      detail: it.detail + (it.area ? ` · ${it.area}` : ''),
      area: it.area,
      done: false,
    })),
  };
}

function buildRunningBlock(dayIdx) {
  const day = EXERCISE_DB.running.dias[dayIdx];
  const items = day.items.map(it => ({
    name: it.name,
    detail: it.detail + (it.area ? ` · ${it.area}` : ''),
    area: it.area,
    nuevo: it.nuevo,
    done: false,
  }));
  return {
    key: RUNNING_KEY,
    label: day.title,
    emoji: '🦵',
    isRunning: true,
    items,
  };
}

// ---------- GENERATE WORKOUT ----------
document.getElementById('btnGenerar').addEventListener('click', () => {
  const checked = Array.from(document.querySelectorAll('#groupGrid input:checked')).map(i => i.value);
  const runningChecked = document.getElementById('chipRunning').querySelector('input').checked;

  if (checked.length === 0 && !runningChecked) {
    alert('Elegí al menos un grupo muscular o dejá tildado "Articulaciones / Running".');
    return;
  }

  const rotation = store.rotation;
  const blocks = [];

  // BLOQUE 0 first: the Excel says to do it before weights to prep tendons
  if (runningChecked) blocks.push(buildWarmupBlock());

  checked.forEach(groupKey => {
    const slot = nextGymSlot(rotation, groupKey);
    blocks.push(buildGymBlock(groupKey, slot));
  });

  if (runningChecked) {
    const dayIdx = nextRunningDay(rotation);
    blocks.push(buildRunningBlock(dayIdx));
  }

  currentSession = {
    date: new Date().toISOString(),
    weekday: selectedWeekday,
    blocks,
    _pendingRotation: { checkedGroups: checked, runningUsed: runningChecked },
  };
  store.current = currentSession;

  renderWorkout();
});

function renderWorkout() {
  const container = document.getElementById('workoutContainer');
  container.innerHTML = '';
  currentSession.blocks.forEach(block => {
    const div = document.createElement('div');
    div.className = 'exercise-group' + (block.isRunning ? ' is-running' : '');
    const h3 = document.createElement('h3');
    h3.textContent = `${block.emoji} ${block.label}`;
    div.appendChild(h3);
    block.items.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'exercise-row';
      const canSwap = !block.isRunning;
      row.innerHTML = `
        <input type="checkbox" data-block="${block.key}" data-idx="${idx}" id="cb-${block.key}-${idx}">
        <label for="cb-${block.key}-${idx}">
          <div class="ex-name">${item.name}${item.nuevo ? '<span class="ex-badge">NUEVO</span>' : ''}</div>
          <div class="ex-detail">${item.detail}</div>
        </label>
        <div class="ex-actions">
          <button class="icon-btn info-btn" title="Ver guía del ejercicio">👁</button>
          ${canSwap ? '<button class="icon-btn swap-btn" title="Cambiar por otro ejercicio">⇄</button>' : ''}
        </div>`;
      const cb = row.querySelector('input');
      cb.checked = !!item.done;
      row.classList.toggle('done', !!item.done);
      cb.addEventListener('change', () => {
        item.done = cb.checked;
        row.classList.toggle('done', cb.checked);
        store.current = currentSession;
        updateProgress();
      });
      row.querySelector('.info-btn').addEventListener('click', () => showExerciseInfo(item, block));
      if (canSwap) {
        row.querySelector('.swap-btn').addEventListener('click', () => swapExercise(block, idx));
      }
      div.appendChild(row);
    });
    container.appendChild(div);
  });
  document.getElementById('workoutCard').hidden = false;
  updateProgress();
  document.getElementById('workoutCard').scrollIntoView({ behavior: 'smooth' });
}

function updateProgress() {
  let total = 0, done = 0;
  currentSession.blocks.forEach(b => b.items.forEach(i => { total++; if (i.done) done++; }));
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressLabel').textContent = `${done} / ${total} completados`;
}

document.getElementById('btnCancelar').addEventListener('click', () => {
  if (!confirm('¿Descartar la rutina en curso? Se pierden los tildados.')) return;
  currentSession = null;
  store.current = null;
  document.getElementById('workoutCard').hidden = true;
});

document.getElementById('btnGuardar').addEventListener('click', () => {
  if (!currentSession) return;
  const rotation = store.rotation;
  const { checkedGroups, runningUsed } = currentSession._pendingRotation;
  checkedGroups.forEach(g => advanceGymSlot(rotation, g));
  if (runningUsed) advanceRunningDay(rotation);
  store.rotation = rotation;

  const history = store.history;
  history.unshift({
    date: currentSession.date,
    weekday: currentSession.weekday,
    blocks: currentSession.blocks,
  });
  store.history = history;

  currentSession = null;
  store.current = null;
  document.getElementById('workoutCard').hidden = true;
  renderGroupGrid(); // rebuilds unchecked and refreshes the % per muscle
  alert('¡Entrenamiento guardado! 💪');
});

// ---------- HISTORY ----------
function renderHistory() {
  const el = document.getElementById('historyList');
  const history = store.history;
  if (history.length === 0) {
    el.innerHTML = '<p class="empty-msg">Todavía no registraste entrenamientos.</p>';
    return;
  }
  el.innerHTML = '';
  history.forEach((session, idx) => {
    const totalEx = session.blocks.reduce((a, b) => a + b.items.length, 0);
    const doneEx = session.blocks.reduce((a, b) => a + b.items.filter(i => i.done).length, 0);
    const groupLabels = session.blocks.map(b => `${b.emoji} ${b.label}`).join(', ');
    const dateStr = new Date(session.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="h-top">
        <div>
          <div class="h-date">${session.weekday} ${dateStr}</div>
          <div class="h-meta">${groupLabels} · ${doneEx}/${totalEx} ejercicios</div>
        </div>
        <button class="del-btn" data-idx="${idx}">Eliminar</button>
      </div>
      <div class="h-detail">
        ${session.blocks.map(b => `
          <strong>${b.emoji} ${b.label}</strong>
          <ul>${b.items.map(i => `<li>${i.done ? '✅' : '⬜'} ${i.name} — ${i.detail}</li>`).join('')}</ul>
        `).join('')}
      </div>
    `;
    item.querySelector('.h-top').addEventListener('click', (e) => {
      if (e.target.closest('.del-btn')) return;
      item.classList.toggle('open');
    });
    item.querySelector('.del-btn').addEventListener('click', () => {
      if (!confirm('¿Eliminar este entrenamiento del historial?')) return;
      const h = store.history;
      h.splice(idx, 1);
      store.history = h;
      renderHistory();
    });
    el.appendChild(item);
  });
}

// ---------- STATS ----------
function renderStats() {
  const history = store.history;
  const barsEl = document.getElementById('statsBars');
  const runningAreaEl = document.getElementById('runningAreaBars');
  const runningFill = document.getElementById('runningFill');
  const runningLabel = document.getElementById('runningLabel');
  const runningMsg = document.getElementById('runningMsg');

  if (history.length === 0) {
    barsEl.innerHTML = '<p class="empty-msg">Sin datos aún. Registrá entrenamientos para ver tus estadísticas.</p>';
    runningAreaEl.innerHTML = '';
    runningFill.style.width = '0%';
    runningLabel.textContent = '0%';
    runningMsg.textContent = '';
    return;
  }

  const muscleCount = {};
  const runningAreaCount = {};
  let totalDoneExercises = 0;
  let runningDoneExercises = 0;

  history.forEach(session => {
    session.blocks.forEach(block => {
      const doneItems = block.items.filter(i => i.done);
      totalDoneExercises += doneItems.length;
      if (block.isRunning) {
        runningDoneExercises += doneItems.length;
        doneItems.forEach(i => {
          const area = i.area || 'Otro';
          runningAreaCount[area] = (runningAreaCount[area] || 0) + 1;
        });
      } else {
        muscleCount[block.label] = (muscleCount[block.label] || 0) + doneItems.length;
      }
    });
  });

  if (runningDoneExercises > 0) {
    muscleCount['🦵 Running/Articulaciones'] = runningDoneExercises;
  }

  barsEl.innerHTML = '';
  const maxCount = Math.max(1, ...Object.values(muscleCount));
  const totalForPct = Object.values(muscleCount).reduce((a, b) => a + b, 0) || 1;
  Object.entries(muscleCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([label, count]) => {
      const pct = Math.round((count / totalForPct) * 100);
      const row = document.createElement('div');
      row.className = 'stat-row';
      row.innerHTML = `
        <span class="stat-label">${label}</span>
        <div class="stat-track"><div class="stat-fill" style="width:${(count / maxCount) * 100}%"></div></div>
        <span class="stat-pct">${pct}%</span>`;
      barsEl.appendChild(row);
    });

  renderMonthlyStats(history);

  const runningPct = totalDoneExercises ? Math.round((runningDoneExercises / totalDoneExercises) * 100) : 0;
  runningFill.style.width = runningPct + '%';
  runningLabel.textContent = runningPct + '%';
  runningMsg.textContent = runningPct >= 30
    ? '¡Buen equilibrio! Le estás dando prioridad a la prevención de lesiones para correr.'
    : 'Todavía es bajo. Para construir una buena base de running, intentá que al menos ~30% de tu volumen sea trabajo articular/estabilidad.';

  runningAreaEl.innerHTML = '';
  const maxArea = Math.max(1, ...Object.values(runningAreaCount));
  const totalArea = Object.values(runningAreaCount).reduce((a, b) => a + b, 0) || 1;
  Object.entries(runningAreaCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([area, count]) => {
      const pct = Math.round((count / totalArea) * 100);
      const row = document.createElement('div');
      row.className = 'stat-row';
      row.innerHTML = `
        <span class="stat-label">${area}</span>
        <div class="stat-track"><div class="stat-fill" style="width:${(count / maxArea) * 100}%; background:var(--priority)"></div></div>
        <span class="stat-pct">${pct}%</span>`;
      runningAreaEl.appendChild(row);
    });
}

// ---------- MONTHLY STATS ----------
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function renderMonthlyStats(history) {
  const el = document.getElementById('monthlyStats');
  el.innerHTML = '';

  // months[ym] = { sessions: n, muscles: { label: doneCount }, total: doneCount }
  const months = {};
  history.forEach(session => {
    const d = new Date(session.date);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months[ym] = months[ym] || { sessions: 0, muscles: {}, total: 0 };
    const m = months[ym];
    m.sessions++;
    session.blocks.forEach(block => {
      const done = block.items.filter(i => i.done).length;
      if (!done) return;
      const label = block.isRunning ? '🦵 Running/Articulaciones' : block.label;
      m.muscles[label] = (m.muscles[label] || 0) + done;
      m.total += done;
    });
  });

  const yms = Object.keys(months).sort().reverse();
  if (yms.length === 0) {
    el.innerHTML = '<p class="empty-msg">Sin datos aún.</p>';
    return;
  }

  yms.forEach(ym => {
    const m = months[ym];
    const [y, mo] = ym.split('-');
    const box = document.createElement('div');
    box.className = 'month-box';
    box.innerHTML = `<h3>${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y} <small>${m.sessions} entrenamiento${m.sessions !== 1 ? 's' : ''}</small></h3>`;
    const bars = document.createElement('div');
    bars.className = 'stats-bars';
    const maxCount = Math.max(1, ...Object.values(m.muscles));
    Object.entries(m.muscles)
      .sort((a, b) => b[1] - a[1])
      .forEach(([label, count]) => {
        const pct = m.total ? Math.round((count / m.total) * 100) : 0;
        const row = document.createElement('div');
        row.className = 'stat-row';
        row.innerHTML = `
          <span class="stat-label">${label}</span>
          <div class="stat-track"><div class="stat-fill" style="width:${(count / maxCount) * 100}%"></div></div>
          <span class="stat-pct">${pct}%</span>`;
        bars.appendChild(row);
      });
    box.appendChild(bars);
    el.appendChild(box);
  });
}

// ---------- SWAP EXERCISE ----------
function swapExercise(block, idx) {
  const g = EXERCISE_DB.groups[block.key];
  if (!g) return;
  const inUse = new Set(block.items.map(i => i.name));
  const candidates = [];
  g.exercises.forEach(ex => {
    if (inUse.has(ex.name)) return;
    const v = ex.variants.find(Boolean);
    if (v) candidates.push({ ex, v });
  });
  if (!candidates.length) {
    alert('No quedan ejercicios alternativos de este grupo en tu Excel.');
    return;
  }
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  block.items[idx] = {
    name: pick.ex.name,
    detail: `${pick.v.series} series x ${pick.v.reps}`,
    done: false,
  };
  store.current = currentSession;
  renderWorkout();
}

// ---------- EXERCISE INFO (body diagram modal) ----------
// region ids drawn in bodySVG; highlight sets per muscle group / running area
const GROUP_REGIONS = {
  PECTORALES: ['f-chest'],
  HOMBROS: ['f-sh-l', 'f-sh-r'],
  BICEPS: ['f-bi-l', 'f-bi-r'],
  ABDOMEN: ['f-abs'],
  CUADRICEPS: ['f-quad-l', 'f-quad-r'],
  ABDUCTOR: ['f-add-l', 'f-add-r', 'f-hip-l', 'f-hip-r'],
  ESPALDA: ['b-upper', 'b-lats', 'b-low'],
  TRICEPS: ['b-tri-l', 'b-tri-r'],
  GLUTEOS: ['b-glu-l', 'b-glu-r'],
  FEMORALES: ['b-ham-l', 'b-ham-r'],
  GEMELOS: ['b-calf-l', 'b-calf-r'],
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

function bodySVG(highlights) {
  const hl = new Set(highlights);
  const ON = 'var(--priority)';
  const OFF = '#242c40';
  const f = id => hl.has(id) ? ON : OFF;
  const glow = id => hl.has(id) ? ' filter="url(#glow)"' : '';
  const r = (id, x, y, w, h, rx) =>
    `<rect id="${id}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${f(id)}"${glow(id)}/>`;
  const e = (id, cx, cy, rx, ry) =>
    `<ellipse id="${id}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f(id)}"${glow(id)}/>`;
  // silhouette base (drawn per figure at x offset)
  const base = ox => `
    <g fill="#1a2133" stroke="#333d57" stroke-width="1">
      <circle cx="${ox + 55}" cy="20" r="12"/>
      <rect x="${ox + 38}" y="34" width="34" height="62" rx="10"/>
      <rect x="${ox + 24}" y="38" width="11" height="50" rx="5"/>
      <rect x="${ox + 75}" y="38" width="11" height="50" rx="5"/>
      <rect x="${ox + 40}" y="94" width="30" height="16" rx="6"/>
      <rect x="${ox + 41}" y="108" width="13" height="74" rx="6"/>
      <rect x="${ox + 56}" y="108" width="13" height="74" rx="6"/>
      <rect x="${ox + 39}" y="182" width="17" height="7" rx="3"/>
      <rect x="${ox + 54}" y="182" width="17" height="7" rx="3"/>
    </g>`;
  return `<svg viewBox="0 0 220 210" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="glow"><feDropShadow dx="0" dy="0" stdDeviation="2.5" flood-color="#ff8a3d" flood-opacity="0.8"/></filter></defs>
    ${base(0)}${base(110)}
    <!-- FRENTE -->
    ${e('f-sh-l', 30, 42, 7, 6)}${e('f-sh-r', 80, 42, 7, 6)}
    ${e('f-chest', 55, 50, 15, 8)}
    ${e('f-bi-l', 29.5, 58, 5, 9)}${e('f-bi-r', 80.5, 58, 5, 9)}
    ${r('f-abs', 46, 61, 18, 30, 5)}
    ${e('f-hip-l', 45, 101, 6, 6)}${e('f-hip-r', 65, 101, 6, 6)}
    ${e('f-add-l', 51, 122, 4, 12)}${e('f-add-r', 59, 122, 4, 12)}
    ${e('f-quad-l', 47.5, 136, 6, 22)}${e('f-quad-r', 62.5, 136, 6, 22)}
    ${e('f-tib-l', 47.5, 170, 4, 11)}${e('f-tib-r', 62.5, 170, 4, 11)}
    ${r('f-foot-l', 39, 182, 17, 7, 3)}${r('f-foot-r', 54, 182, 17, 7, 3)}
    <!-- ESPALDA -->
    ${e('b-upper', 165, 46, 14, 9)}
    ${r('b-lats', 152, 55, 26, 24, 7)}
    ${r('b-low', 157, 80, 16, 13, 4)}
    ${e('b-tri-l', 139.5, 58, 5, 9)}${e('b-tri-r', 190.5, 58, 5, 9)}
    ${e('b-glu-l', 158, 102, 7, 8)}${e('b-glu-r', 172, 102, 7, 8)}
    ${e('b-ham-l', 157.5, 136, 6, 20)}${e('b-ham-r', 172.5, 136, 6, 20)}
    ${e('b-calf-l', 157.5, 167, 5, 13)}${e('b-calf-r', 172.5, 167, 5, 13)}
    <text x="55" y="205" text-anchor="middle" fill="#8b93a7" font-size="10">Frente</text>
    <text x="165" y="205" text-anchor="middle" fill="#8b93a7" font-size="10">Espalda</text>
  </svg>`;
}

function showExerciseInfo(item, block) {
  let regions, muscleLabel;
  if (block.isRunning) {
    const area = item.area || 'Accesorio';
    regions = AREA_REGIONS[area] || [];
    muscleLabel = 'Zona trabajada: ' + area;
  } else {
    regions = GROUP_REGIONS[block.key] || [];
    muscleLabel = 'Músculo trabajado: ' + (EXERCISE_DB.groups[block.key] ? EXERCISE_DB.groups[block.key].label : block.label);
  }
  document.getElementById('modalTitle').textContent = item.name;
  document.getElementById('modalDetail').textContent = item.detail;

  // execution preview: animated stick figure + technique cues
  const pattern = patternFor(item.name, block.key);
  const execEl = document.getElementById('modalExec');
  if (pattern && ANIMS[pattern]) {
    const def = ANIMS[pattern];
    execEl.innerHTML =
      '<div class="exec-title">Cómo se ejecuta</div>' +
      animSVG(def) +
      '<ul class="cues">' + def.cues.map(c => `<li>${c}</li>`).join('') + '</ul>';
  } else {
    execEl.innerHTML = '';
  }

  document.getElementById('modalMuscleLabel').textContent = muscleLabel;
  document.getElementById('modalBody').innerHTML = regions.length
    ? bodySVG(regions)
    : '<p class="hint">Ejercicio general / de transferencia — trabaja varias zonas a la vez.</p>';
  document.getElementById('modalVideo').href =
    'https://www.youtube.com/results?search_query=' + encodeURIComponent(item.name + ' ejercicio técnica');
  document.getElementById('exModal').hidden = false;
}

document.getElementById('modalClose').addEventListener('click', () => {
  document.getElementById('exModal').hidden = true;
});
document.getElementById('exModal').addEventListener('click', (ev) => {
  if (ev.target.id === 'exModal') document.getElementById('exModal').hidden = true;
});

// ---------- BACKUP ----------
document.getElementById('btnExport').addEventListener('click', () => {
  const payload = {
    app: 'AppRutina',
    exported: new Date().toISOString(),
    history: store.history,
    rotation: store.rotation,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'apprutina-respaldo-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById('btnImport').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.app !== 'AppRutina' || !Array.isArray(data.history)) {
        alert('El archivo no parece un respaldo válido de AppRutina.');
        return;
      }
      if (!confirm(`Importar ${data.history.length} entrenamientos. Esto reemplaza el historial actual. ¿Continuar?`)) return;
      store.history = data.history;
      if (data.rotation) store.rotation = data.rotation;
      renderHistory();
      renderGroupGrid();
      alert('¡Respaldo importado!');
    } catch {
      alert('No se pudo leer el archivo.');
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
});

// ---------- INIT ----------
renderWeekdayPicker();
renderGroupGrid();
document.getElementById('chipRunning').classList.add('checked');

// restore in-progress session (e.g. closed the app mid-workout at the gym)
const savedSession = store.current;
if (savedSession) {
  currentSession = savedSession;
  selectedWeekday = savedSession.weekday;
  renderWeekdayPicker();
  renderWorkout();
}

// offline support when served over https/localhost (no-op on file://)
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
