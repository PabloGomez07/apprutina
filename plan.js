// Plan de entrenamiento: rotación de bloques y trabajo fijo articular.

// Los 5 bloques que rotan en loop. Cada grupo del Excel entra en exactamente uno.
const BLOQUES = [
  { id: 1, nombre: 'Pecho + Tríceps',                    grupos: ['PECTORALES', 'TRICEPS'],               emoji: '💪' },
  { id: 2, nombre: 'Espalda + Bíceps',                   grupos: ['ESPALDA', 'BICEPS'],                   emoji: '🔙' },
  { id: 3, nombre: 'Cuádriceps + Femorales + Glúteos',   grupos: ['CUADRICEPS', 'FEMORALES', 'GLUTEOS'],  emoji: '🦵' },
  { id: 4, nombre: 'Hombros + Abdomen',                  grupos: ['HOMBROS', 'ABDOMEN'],                  emoji: '🏋️' },
  { id: 5, nombre: 'Gemelos + Abductores',               grupos: ['GEMELOS', 'ABDUCTOR'],                 emoji: '🦶' },
];

function bloquePorId(id) {
  return BLOQUES.find(b => b.id === id) || BLOQUES[0];
}

function bloqueDeGrupo(groupKey) {
  return BLOQUES.find(b => b.grupos.includes(groupKey)) || null;
}

// Los compuestos del Excel de running que ya existen en el gimnasio.
// Se omiten cuando el bloque del día ya trabaja ese músculo: sumarlos sería
// duplicar volumen, justo lo contrario de construir base para correr.
const RUNNING_COMPUESTOS = [
  { re: /b[uú]lgara/i,                    grupos: ['CUADRICEPS', 'GLUTEOS'] },
  { re: /peso muerto rumano/i,            grupos: ['FEMORALES'] },
  { re: /peso muerto/i,                   grupos: ['GLUTEOS', 'FEMORALES'] },
  { re: /remo a una mano/i,               grupos: ['ESPALDA'] },
  { re: /dominadas|jal[oó]n/i,            grupos: ['ESPALDA'] },
  { re: /estocadas/i,                     grupos: ['CUADRICEPS', 'GLUTEOS'] },
  { re: /press de banca/i,                grupos: ['PECTORALES'] },
  { re: /flexiones de brazos/i,           grupos: ['PECTORALES', 'TRICEPS'] },
  { re: /subidas al caj[oó]n|step-?up/i,  grupos: ['CUADRICEPS', 'GLUTEOS'] },
];

// Qué grupos musculares pisa un ejercicio del Excel de running (vacío = no duplica nada).
function gruposDeRunning(nombre) {
  const hit = RUNNING_COMPUESTOS.find(c => c.re.test(nombre));
  return hit ? hit.grupos : [];
}

// --- Bloque fijo: va en TODA sesión y no se recorta nunca ---
// Es lo que sostiene el aumento de volumen de carrera.

const POOL_PIE_TOBILLO = [
  { nombre: 'Tibial Raises (Elevación de puntas)', detalle: '3 x 20', area: 'Tobillo',
    nota: 'Apoyado en pared, levantá las puntas de los pies. Previene periostitis.' },
  { nombre: 'Sóleo en escalón (Rodilla flexionada)', detalle: '3 x 20', area: 'Tobillo/Gemelo',
    nota: 'Rodilla flexionada para aislar el sóleo.' },
  { nombre: 'Foot Core (Toalla con los dedos)', detalle: '3 x 30 segundos', area: 'Pie',
    nota: 'Sentado, arrugá una toalla con los dedos del pie.' },
  { nombre: 'Movilidad de Tobillo', detalle: '3 x 12', area: 'Tobillo',
    nota: 'Llevá la rodilla hacia la pared sin despegar el talón.' },
  { nombre: 'Gemelos de pie (Rodilla estirada)', detalle: '4 x 15', area: 'Tobillo/Gemelo',
    nota: 'Rodilla estirada para el gemelo. Rango completo.' },
  { nombre: 'Pogo Jumps (Saltos de tobillo)', detalle: '3 x 20 segundos', area: 'Tobillo/Reactivo',
    nota: 'Saltos cortos y rápidos desde la punta del pie.', impacto: true },
];

const POOL_CORE = [
  { nombre: 'Plancha Lateral', detalle: '3 x 45 seg (por lado)', area: 'Core' },
  { nombre: 'Dead Bug', detalle: '3 x 15 (lentas)', area: 'Core' },
  { nombre: 'Bird-Dog', detalle: '3 x 12 (alternando)', area: 'Core' },
  { nombre: 'Puente de Glúteo (1 pierna)', detalle: '3 x 15 (por lado)', area: 'Cadera/Glúteo' },
  { nombre: 'Press Pallof', detalle: '3 x 12 (por lado)', area: 'Core' },
  { nombre: 'Caminata del Granjero', detalle: '3 x 40 metros', area: 'Core' },
];

// Abdomen específico del examen: repeticiones cronometradas, no "core" genérico.
// Objetivo vigente: 56 reps en 1'30". Se entrena a ritmo de examen, todos los días.
const POOL_ABDOMEN_EXAMEN = [
  { nombre: 'Abdominales a ritmo de examen', detalle: '3 x 45 seg (contando reps)', area: 'Abdomen',
    nota: 'Cronometrá y anotá las reps. Meta intermedia actual: 46-48 por serie.' },
  { nombre: 'Crunch con Disco', detalle: '3 x 20', area: 'Abdomen',
    nota: 'Carga controlada, sin tirar del cuello.' },
  { nombre: 'Crunch en Maquina', detalle: '3 x 20', area: 'Abdomen' },
  { nombre: 'Rueda abdominal', detalle: '3 x 12', area: 'Abdomen',
    nota: 'El abdomen frena la caída: no arquees la lumbar.' },
];

// "Foot Core (Toalla con los dedos)" y "foot core" son el mismo ejercicio
function normNombre(n) {
  return String(n || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split('(')[0]
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

// Capacidades del examen que hay que sostener y no están en el Excel de gimnasio.
// Se saltean el día que el bloque ya trabaja ese músculo.
const POOL_MANTENIMIENTO = [
  { nombre: 'Flexiones de brazos', detalle: '3 x 20', area: 'Pecho/Tríceps',
    nota: 'Mantenimiento de examen (meta: 46 en 1 min). Sin llegar al fallo.',
    grupos: ['PECTORALES', 'TRICEPS'] },
  { nombre: 'Dominadas en barra', detalle: '3 x 6', area: 'Espalda',
    nota: 'Mantenimiento de examen (meta: 10 reps). Calidad, sin fallo.',
    grupos: ['ESPALDA', 'BICEPS'] },
];

// Rota el pool con el contador de sesiones para no repetir lo mismo cada día.
function tomarDePool(pool, cantidad, contador, excluir) {
  const libres = pool.filter(x => !(excluir || []).some(e => e(x)));
  const fuente = libres.length ? libres : pool;
  const out = [];
  for (let i = 0; i < fuente.length && out.length < cantidad; i++) {
    out.push(fuente[(contador + i) % fuente.length]);
  }
  return out;
}

// Arma el bloque fijo del día segun qué músculos entrena hoy.
// - día de piernas: nada de impacto ni carga extra de pierna, solo core + pie
// - día de gemelos: el pool de tobillo ya está cubierto por el bloque principal
function armarBloqueFijo(gruposDelDia, contador, yaEnLaSesion) {
  const esDiaPierna = ['CUADRICEPS', 'FEMORALES', 'GLUTEOS'].some(g => gruposDelDia.includes(g));
  const esDiaGemelos = gruposDelDia.includes('GEMELOS');

  // nada que ya esté en el calentamiento o en el día de running
  const usados = new Set((yaEnLaSesion || []).map(normNombre));
  const excluir = [x => usados.has(normNombre(x.nombre))];

  // pogo jumps son impacto: no van después de piernas pesadas
  if (esDiaPierna) excluir.push(x => x.impacto);
  // si hoy ya hay gemelos, el trabajo de pantorrilla del pool sobra
  if (esDiaGemelos) excluir.push(x => /gemelos|s[oó]leo/i.test(x.nombre));

  const excluirCore = [...excluir];
  if (esDiaPierna) excluirCore.push(x => /granjero|gl[uú]teo/i.test(x.nombre));

  const pie = tomarDePool(POOL_PIE_TOBILLO, esDiaGemelos ? 1 : 2, contador, excluir);
  const core = tomarDePool(POOL_CORE, 2, contador, excluirCore);
  const abs = tomarDePool(POOL_ABDOMEN_EXAMEN, 1, contador, excluir);

  // mantenimiento: solo si hoy no se trabaja ese músculo en el gimnasio
  const mant = POOL_MANTENIMIENTO
    .filter(x => !x.grupos.some(g => gruposDelDia.includes(g)))
    .filter(x => !usados.has(normNombre(x.nombre)));
  const mantenimiento = mant.length ? [mant[contador % mant.length]] : [];

  return [...pie, ...core, ...abs, ...mantenimiento];
}
