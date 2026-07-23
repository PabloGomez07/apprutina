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
  // último bloque completado (1..5) y cuántas sesiones van, para rotar los pools
  get plan() {
    return JSON.parse(localStorage.getItem('rutina_plan') || '{"ultimoBloque":0,"sesiones":0}');
  },
  set plan(v) {
    localStorage.setItem('rutina_plan', JSON.stringify(v));
  },
  // días de carrera: { 0..6: 'suave' | 'duro' }
  get runDays() {
    return JSON.parse(localStorage.getItem('rutina_rundays') || '{}');
  },
  set runDays(v) {
    localStorage.setItem('rutina_rundays', JSON.stringify(v));
  },
  get runs() {
    return JSON.parse(localStorage.getItem('rutina_runs') || '[]');
  },
  set runs(v) {
    localStorage.setItem('rutina_runs', JSON.stringify(v));
  },
};

// --- fecha: del dispositivo. El reloj del celular ya se sincroniza por NTP,
// y leerla local es lo único que funciona sin señal en el gimnasio.
function hoy() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function diasEntre(a, b) {
  return Math.round((b - a) / 86400000);
}

function soloFecha(iso) {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d;
}

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
    if (btn.dataset.tab === 'ajustes') { renderRunDays(); renderRuns(); }
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
// Cuántos ejercicios por músculo según cuántos grupos entren en el bloque.
// Con 2-3 grupos por sesión hay que recortar o la sesión se va a 2 horas:
// el volumen accesorio es lo primero que se corta cuando no cierra el tiempo.
function cupoPorGrupo(cantGrupos) {
  if (cantGrupos >= 3) return 2;
  if (cantGrupos === 2) return 3;
  return 5;
}

function buildGymBlock(groupKey, slot, cupo) {
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
  // el Excel lista de compuesto a aislado: los primeros son los que importan
  if (cupo) picks = picks.slice(0, cupo);
  return {
    key: groupKey,
    label: g.label,
    emoji: g.emoji,
    isRunning: false,
    items: picks.map(p => ({
      name: p.ex.name,
      detail: `${p.variant.series} series x ${p.variant.reps}`,
      series: parseInt(p.variant.series, 10) || 0,
      setsDone: 0,
      done: false,
    })),
  };
}

// running items describe volume in prose: "3 x 10 (por pierna)." → 3 sets
function parseSeries(detail) {
  const m = String(detail || '').match(/^\s*(\d+)\s*(?:series?\s*)?x/i);
  const n = m ? parseInt(m[1], 10) : 0;
  return n > 0 && n <= 10 ? n : 0;
}

// how many sets this exercise has; falls back to parsing older saved items
function seriesTotal(item) {
  if (typeof item.series === 'number' && item.series > 0) return Math.min(item.series, 10);
  return parseSeries(item.detail);
}

function setsDoneOf(item) {
  const total = seriesTotal(item);
  if (typeof item.setsDone === 'number') return Math.min(item.setsDone, total);
  return item.done ? total : 0; // sessions saved before this feature existed
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
      series: parseSeries(it.detail),
      setsDone: 0,
      done: false,
    })),
  };
}

// Bloque que va en TODA sesión: pie/tobillo + core + abdomen de examen.
// Es lo último que se recorta: sostiene el volumen de carrera y ataca
// el punto débil del examen con frecuencia en vez de una sesión heroica.
function buildFixedBlock(gruposDelDia, yaEnLaSesion) {
  const contador = store.plan.sesiones || 0;
  const elegidos = armarBloqueFijo(gruposDelDia, contador, yaEnLaSesion);
  return {
    key: 'FIJO',
    label: 'Base articular + abdomen (siempre)',
    emoji: '🔩',
    isRunning: true, // cuenta como trabajo articular en las estadísticas
    isFixed: true,
    items: elegidos.map(x => ({
      name: x.nombre,
      detail: x.detalle + (x.area ? ` · ${x.area}` : ''),
      area: x.area,
      nota: x.nota,
      series: parseSeries(x.detalle),
      setsDone: 0,
      done: false,
    })),
  };
}

// ---------- ENTRENADOR ----------
const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// A qué bloque corresponde una sesión ya guardada (mira los grupos de gimnasio que tuvo)
function bloqueDeSesion(session) {
  const keys = session.blocks.filter(b => !b.isRunning).map(b => b.key);
  for (const b of BLOQUES) {
    if (keys.some(k => b.grupos.includes(k))) return b.id;
  }
  return null;
}

function proximoBloqueId() {
  const p = store.plan;
  return (p.ultimoBloque % BLOQUES.length) + 1;
}

// Días desde la última vez que se entrenó cada bloque (null = nunca)
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

// ¿mañana es día duro de carrera? piernas pesadas + intervalos son el mismo sistema
function esDiaDuro(fecha) {
  return store.runDays[fecha.getDay()] === 'duro';
}

function renderCoach() {
  const h = hoy();
  const manana = new Date(h.getTime() + 86400000);
  const idHoy = proximoBloqueId();
  const bloqueHoy = bloquePorId(idHoy);
  const bloqueManana = bloquePorId((idHoy % BLOQUES.length) + 1);

  document.getElementById('coachDate').textContent =
    `${NOMBRE_DIA[h.getDay()]} ${h.getDate()} de ${NOMBRE_MES[h.getMonth()]}`;
  document.getElementById('coachToday').innerHTML =
    `Hoy te toca <strong>Bloque ${bloqueHoy.id}: ${bloqueHoy.emoji} ${bloqueHoy.nombre}</strong>`;

  const lineas = [];
  const hist = store.history;
  if (hist.length) {
    const ult = hist[0];
    const dias = diasEntre(soloFecha(ult.date), h);
    const idUlt = bloqueDeSesion(ult);
    const nomUlt = idUlt ? bloquePorId(idUlt).nombre : 'trabajo articular';
    const cuando = dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;
    lineas.push(`La última vez entrenaste <strong>${nomUlt}</strong>, ${cuando}.`);
    if (dias >= 4) lineas.push(`Van ${dias} días sin entrenar — retomá suave.`);
  } else {
    lineas.push('Es tu primer entrenamiento: arrancamos por el bloque 1.');
  }
  lineas.push(`Mañana te tocaría <strong>Bloque ${bloqueManana.id}: ${bloqueManana.nombre}</strong>.`);
  document.getElementById('coachLines').innerHTML = lineas.map(l => `<p>${l}</p>`).join('');

  // aviso: no cargar piernas el día antes de intervalos
  const warn = document.getElementById('coachWarn');
  const esPiernas = bloqueHoy.grupos.some(g => ['CUADRICEPS', 'FEMORALES', 'GLUTEOS'].includes(g));
  if (esPiernas && esDiaDuro(manana)) {
    warn.innerHTML = `⚠️ Mañana (${NOMBRE_DIA[manana.getDay()]}) tenés carrera dura. ` +
      `Piernas pesadas hoy te la arruina — son el mismo sistema y necesitan 48 h. ` +
      `Mejor adelantá el <strong>Bloque ${bloqueManana.id}: ${bloqueManana.nombre}</strong> y dejá piernas para después.`;
    warn.hidden = false;
  } else if (esDiaDuro(h) && esPiernas) {
    warn.innerHTML = `⚠️ Hoy tenés carrera dura. Si ya corriste, dejá las piernas livianas; ` +
      `si vas a correr después, hacé la carrera primero.`;
    warn.hidden = false;
  } else {
    warn.hidden = true;
  }

  document.getElementById('btnAplicarBloque').textContent =
    `Cargar Bloque ${bloqueHoy.id}: ${bloqueHoy.nombre}`;
}

// tildar los grupos del bloque sugerido (el usuario decide apretando el botón)
document.getElementById('btnAplicarBloque').addEventListener('click', () => {
  const bloque = bloquePorId(proximoBloqueId());
  document.querySelectorAll('#groupGrid input').forEach(i => {
    i.checked = bloque.grupos.includes(i.value);
    i.closest('.chip').classList.toggle('checked', i.checked);
  });
  document.getElementById('btnGenerar').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

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

  const cupo = cupoPorGrupo(checked.length);
  checked.forEach(groupKey => {
    const slot = nextGymSlot(rotation, groupKey);
    blocks.push(buildGymBlock(groupKey, slot, cupo));
  });

  // Un solo bloque articular por sesión. Los compuestos del Excel de running
  // (peso muerto, dominadas, press banca, búlgara) ya los cubre la rotación
  // de los 5 bloques, así que acá va solo lo que no está en ningún otro lado:
  // pie, tobillo, core y abdomen de examen.
  if (runningChecked) {
    const yaEnLaSesion = blocks.flatMap(b => b.items.map(i => i.name));
    blocks.push(buildFixedBlock(checked, yaEnLaSesion));
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
    if (block.isFixed) {
      const nota = document.createElement('p');
      nota.className = 'omit-note';
      nota.textContent = 'Pie, tobillo, core y abdomen de examen. Es lo que sostiene el volumen de carrera: no se recorta.';
      div.appendChild(nota);
    }
    block.items.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'exercise-row';
      const canSwap = !block.isRunning;
      const total = seriesTotal(item);
      const dots = total
        ? `<div class="sets-row">
             <span class="sets-label">Series</span>
             ${Array.from({ length: total }, (_, s) =>
               `<button class="set-dot" data-set="${s}" aria-label="Serie ${s + 1}">${s + 1}</button>`).join('')}
             <span class="sets-count"></span>
           </div>`
        : '';
      row.innerHTML = `
        <input type="checkbox" data-block="${block.key}" data-idx="${idx}" id="cb-${block.key}-${idx}">
        <label for="cb-${block.key}-${idx}">
          <div class="ex-name">${item.name}${item.nuevo ? '<span class="ex-badge">NUEVO</span>' : ''}</div>
          <div class="ex-detail">${item.detail}</div>
        </label>
        <div class="ex-actions">
          <button class="icon-btn info-btn" title="Ver guía del ejercicio">👁</button>
          ${canSwap ? '<button class="icon-btn swap-btn" title="Cambiar por otro ejercicio">⇄</button>' : ''}
        </div>
        ${dots}`;
      const cb = row.querySelector('input');

      // paints dots + checkbox from item state
      const paint = () => {
        const doneSets = setsDoneOf(item);
        row.querySelectorAll('.set-dot').forEach((d, s) => d.classList.toggle('on', s < doneSets));
        const counter = row.querySelector('.sets-count');
        if (counter) counter.textContent = `${doneSets}/${total}`;
        cb.checked = !!item.done;
        row.classList.toggle('done', !!item.done);
      };

      const commit = () => {
        store.current = currentSession;
        paint();
        updateProgress();
      };

      item.setsDone = setsDoneOf(item); // normalize sessions saved before this feature
      paint();

      cb.addEventListener('change', () => {
        item.done = cb.checked;
        item.setsDone = cb.checked ? total : 0;
        commit();
      });

      row.querySelectorAll('.set-dot').forEach(dot => {
        dot.addEventListener('click', () => {
          const s = parseInt(dot.dataset.set, 10);
          // tap fills up to that set; tapping the last filled one undoes it
          item.setsDone = (item.setsDone === s + 1) ? s : s + 1;
          item.done = total > 0 && item.setsDone >= total;
          commit();
        });
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
  let exTotal = 0, exDone = 0, setTotal = 0, setDone = 0;
  currentSession.blocks.forEach(b => b.items.forEach(i => {
    exTotal++;
    if (i.done) exDone++;
    setTotal += seriesTotal(i);
    setDone += setsDoneOf(i);
  }));
  // series give a finer progress bar than whole exercises
  const pct = setTotal ? Math.round((setDone / setTotal) * 100)
                       : (exTotal ? Math.round((exDone / exTotal) * 100) : 0);
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressLabel').textContent =
    setTotal ? `${setDone}/${setTotal} series · ${exDone}/${exTotal} ej.`
             : `${exDone} / ${exTotal} completados`;
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
  const { checkedGroups } = currentSession._pendingRotation;
  checkedGroups.forEach(g => advanceGymSlot(rotation, g));
  store.rotation = rotation;

  const history = store.history;
  const sesion = {
    date: currentSession.date,
    weekday: currentSession.weekday,
    blocks: currentSession.blocks,
  };
  history.unshift(sesion);
  store.history = history;

  // la rotación avanza al completar, no por calendario: si faltás, el bloque espera
  const plan = store.plan;
  const idEntrenado = bloqueDeSesion(sesion);
  if (idEntrenado) plan.ultimoBloque = idEntrenado;
  plan.sesiones = (plan.sesiones || 0) + 1;
  store.plan = plan;

  currentSession = null;
  store.current = null;
  document.getElementById('workoutCard').hidden = true;
  renderGroupGrid(); // rebuilds unchecked and refreshes the % per muscle
  renderCoach();
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
          <ul>${b.items.map(i => {
            const t = seriesTotal(i), d = setsDoneOf(i);
            const sets = t ? ` <span class="h-sets">(${d}/${t} series)</span>` : '';
            return `<li>${i.done ? '✅' : (d ? '🔸' : '⬜')} ${i.name} — ${i.detail}${sets}</li>`;
          }).join('')}</ul>
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

  renderKpiBlocks(history);
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

// ---------- KPIs POR BLOQUE ----------
// El KPI que realmente responde "qué me toca" es días sin entrenar.
function renderKpiBlocks(history) {
  const el = document.getElementById('kpiBlocks');
  el.innerHTML = '';
  const h = hoy();
  const hace30 = new Date(h.getTime() - 30 * 86400000);
  const sinEntrenar = diasSinEntrenarPorBloque();
  const idSugerido = proximoBloqueId();

  // series de los últimos 30 días por bloque, y del trabajo articular
  const series = {};
  let seriesArticular = 0, seriesTotal = 0;
  BLOQUES.forEach(b => { series[b.id] = 0; });
  history.forEach(session => {
    if (soloFecha(session.date) < hace30) return;
    session.blocks.forEach(block => {
      const hechas = block.items.reduce((a, i) => a + setsDoneOf(i), 0);
      if (!hechas) return;
      seriesTotal += hechas;
      if (block.isRunning) { seriesArticular += hechas; return; }
      const b = bloqueDeGrupo(block.key);
      if (b) series[b.id] += hechas;
    });
  });

  const filas = BLOQUES.map(b => ({
    b,
    dias: sinEntrenar[b.id],
    series: series[b.id],
    pct: seriesTotal ? Math.round((series[b.id] / seriesTotal) * 100) : 0,
  }));

  // más atrasado arriba; los nunca entrenados primero de todo
  filas.sort((x, y) => {
    if (x.dias === null && y.dias === null) return x.b.id - y.b.id;
    if (x.dias === null) return -1;
    if (y.dias === null) return 1;
    return y.dias - x.dias;
  });

  filas.forEach(f => {
    const estado = f.dias === null ? 'rojo' : f.dias <= 4 ? 'verde' : f.dias <= 8 ? 'amarillo' : 'rojo';
    const txtDias = f.dias === null ? 'nunca' : f.dias === 0 ? 'hoy' : f.dias === 1 ? 'ayer' : `hace ${f.dias} d`;
    const card = document.createElement('div');
    card.className = 'kpi-row ' + estado + (f.b.id === idSugerido ? ' sugerido' : '');
    card.innerHTML = `
      <span class="kpi-dot"></span>
      <div class="kpi-main">
        <div class="kpi-name">${f.b.emoji} Bloque ${f.b.id} · ${f.b.nombre}</div>
        <div class="kpi-meta">${f.series} series (30 d) · ${f.pct}% del volumen</div>
      </div>
      <div class="kpi-dias">${txtDias}</div>`;
    el.appendChild(card);
  });

  const pctArt = seriesTotal ? Math.round((seriesArticular / seriesTotal) * 100) : 0;
  const extra = document.createElement('div');
  extra.className = 'kpi-row articular';
  extra.innerHTML = `
    <span class="kpi-dot"></span>
    <div class="kpi-main">
      <div class="kpi-name">🔩 Base articular + abdomen</div>
      <div class="kpi-meta">${seriesArticular} series (30 d) · ${pctArt}% del volumen · va en toda sesión</div>
    </div>
    <div class="kpi-dias">fijo</div>`;
  el.appendChild(extra);
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
    series: parseInt(pick.v.series, 10) || 0,
    setsDone: 0,
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
  document.getElementById('modalDetail').innerHTML =
    item.detail + (item.nota ? `<br><em>${item.nota}</em>` : '');

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

// ---------- AJUSTES: DÍAS DE CARRERA ----------
function renderRunDays() {
  const el = document.getElementById('runDaysConfig');
  const cfg = store.runDays;
  el.innerHTML = '';
  WEEKDAYS.forEach((dia, idx) => {
    const estado = cfg[idx] || '';
    const fila = document.createElement('div');
    fila.className = 'runday-row';
    fila.innerHTML = `
      <span class="runday-name">${dia}</span>
      <div class="runday-opts">
        <button class="runday-btn ${estado === '' ? 'sel' : ''}" data-d="${idx}" data-v="">No corro</button>
        <button class="runday-btn ${estado === 'suave' ? 'sel suave' : ''}" data-d="${idx}" data-v="suave">Suave</button>
        <button class="runday-btn ${estado === 'duro' ? 'sel duro' : ''}" data-d="${idx}" data-v="duro">Duro</button>
      </div>`;
    fila.querySelectorAll('.runday-btn').forEach(b => {
      b.addEventListener('click', () => {
        const c = store.runDays;
        if (b.dataset.v === '') delete c[b.dataset.d];
        else c[b.dataset.d] = b.dataset.v;
        store.runDays = c;
        renderRunDays();
        renderCoach();
      });
    });
    el.appendChild(fila);
  });
}

// ---------- AJUSTES: REGISTRO DE CARRERAS ----------
// Estructura alineada con lo que devuelve la API de Strava, para que
// conectarla más adelante sea mapear campos y no rehacer el modelo.
function parseTiempoASegundos(txt) {
  const m = String(txt || '').trim().match(/^(\d+):([0-5]?\d)$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function fmtSegundos(s) {
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

function paceDe(km, seg) {
  if (!km || !seg) return null;
  return seg / km; // segundos por km
}

document.getElementById('btnGuardarCarrera').addEventListener('click', () => {
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
    workout: document.getElementById('runType').value,
    distance: Math.round(km * 1000),        // metros, como Strava
    moving_time: seg,                        // segundos, como Strava
    average_heartrate: isNaN(hr) ? null : hr,
    source: 'manual',
  });
  store.runs = runs;

  document.getElementById('runKm').value = '';
  document.getElementById('runTime').value = '';
  document.getElementById('runHr').value = '';
  renderRuns();
  alert('¡Carrera guardada! 🏃');
});

const NOMBRE_TIPO = { suave: 'Rodaje suave', tempo: 'Tempo', intervalos: 'Intervalos', test: 'Test' };

function renderRuns() {
  const el = document.getElementById('runList');
  const runs = store.runs;
  if (!runs.length) {
    el.innerHTML = '<p class="empty-msg">Todavía no registraste carreras.</p>';
    return;
  }
  el.innerHTML = '<h3 class="sub-h">Últimas carreras</h3>';
  runs.slice(0, 10).forEach((r, idx) => {
    const km = r.distance / 1000;
    const pace = paceDe(km, r.moving_time);
    const fecha = new Date(r.start_date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    const item = document.createElement('div');
    item.className = 'run-item';
    item.innerHTML = `
      <div>
        <div class="run-top">${fecha} · ${km.toFixed(1)} km · ${fmtSegundos(r.moving_time)}</div>
        <div class="run-meta">${NOMBRE_TIPO[r.workout] || r.workout} · ${r.trainer ? 'cinta' : 'calle'}${
          pace ? ` · ${fmtSegundos(pace)}/km` : ''}${r.average_heartrate ? ` · ${r.average_heartrate} lpm` : ''}</div>
      </div>
      <button class="del-btn" data-i="${idx}">Eliminar</button>`;
    item.querySelector('.del-btn').addEventListener('click', () => {
      const list = store.runs;
      list.splice(idx, 1);
      store.runs = list;
      renderRuns();
    });
    el.appendChild(item);
  });
}

// ---------- BACKUP ----------
document.getElementById('btnExport').addEventListener('click', () => {
  const payload = {
    app: 'AppRutina',
    exported: new Date().toISOString(),
    history: store.history,
    rotation: store.rotation,
    plan: store.plan,
    runDays: store.runDays,
    runs: store.runs,
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
      if (data.plan) store.plan = data.plan;
      if (data.runDays) store.runDays = data.runDays;
      if (data.runs) store.runs = data.runs;
      renderHistory();
      renderGroupGrid();
      renderCoach();
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
renderCoach();
document.getElementById('chipRunning').classList.add('checked');
document.getElementById('runDate').valueAsDate = new Date();

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
