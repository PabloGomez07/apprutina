// Animaciones de ejecución: personaje con volumen en 2 poses (inicio ⇄ fin)
// Cada patrón cubre una familia de ejercicios del Excel.

// paleta del personaje (contraste probado sobre panel #1e2536)
const SKIN = '#e8b48b', SKIN_FAR = '#c2926c';
const HAIR = '#3a2c22';
const SHIRT = '#4f8cff', SHIRT_FAR = '#3568bd';
const PANTS = '#5d6c96', PANTS_FAR = '#454f70';
const SHOE = '#9aa3ba', SHOE_FAR = '#6e768c';
const GEAR_FILL = '#ff8a3d', GEAR_RIM = '#c2661f';

const GEAR = (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="${GEAR_FILL}" stroke="${GEAR_RIM}" stroke-width="1.5"/>`;

function _limb(a, b) {
  return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
}

// segmento con volumen: trazo grueso con puntas redondeadas = "cápsula"
function _cap(a, b, w, color) {
  return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
}

function _shoe(foot, color) {
  return _cap(foot, [foot[0] + 7, foot[1] + 1], 5.5, color);
}

function _hand(h, color) {
  return `<circle cx="${h[0]}" cy="${h[1]}" r="3.4" fill="${color}" stroke="none"/>`;
}

function _fig(p) {
  let s = '<g fill="none">';
  // extremidades lejanas primero (tonos más oscuros = profundidad)
  if (p.knee2) {
    s += _cap(p.hip2 || p.hip, p.knee2, 8, PANTS_FAR) + _cap(p.knee2, p.foot2, 7, PANTS_FAR) + _shoe(p.foot2, SHOE_FAR);
  }
  if (p.elbow2) {
    s += _cap(p.neck2 || p.neck, p.elbow2, 6.5, SHIRT_FAR) + _cap(p.elbow2, p.hand2, 5.5, SKIN_FAR) + _hand(p.hand2, SKIN_FAR);
  }
  // pierna cercana
  if (p.knee) {
    s += _cap(p.hip, p.knee, 9, PANTS) + _cap(p.knee, p.foot, 8, PANTS) + _shoe(p.foot, SHOE);
  }
  // torso (remera): cápsula ancha del cuello a la cadera
  s += _cap(p.neck, p.hip, 13, SHIRT);
  // brazo cercano: brazo con remera, antebrazo y mano de piel
  if (p.elbow) {
    s += _cap(p.neck, p.elbow, 7, SHIRT) + _cap(p.elbow, p.hand, 6, SKIN) + _hand(p.hand, SKIN);
  }
  // cabeza con pelo
  const hx = p.head[0], hy = p.head[1];
  s += `<circle cx="${hx}" cy="${hy}" r="7.5" fill="${SKIN}" stroke="none"/>`;
  s += `<path d="M ${hx - 7.4} ${hy - 1.2} A 7.4 7.4 0 0 1 ${hx + 7.4} ${hy - 1.2} Z" fill="${HAIR}" stroke="none"/>`;
  if (p.gear) s += p.gear.map(g => GEAR(g[0], g[1])).join('');
  if (p.extra) s += `<g stroke="#aab3c7" stroke-width="4" stroke-linecap="round" fill="none">${p.extra}</g>`;
  s += '</g>';
  return s;
}

function animSVG(def) {
  return `<svg viewBox="0 0 200 140" class="exec-anim" xmlns="http://www.w3.org/2000/svg">
    <line x1="8" y1="127" x2="192" y2="127" stroke="#2a3245" stroke-width="2"/>
    <g stroke="#3d4763" stroke-width="3" stroke-linecap="round" fill="none">${def.props || ''}</g>
    <g>
      <g>${_fig(def.A)}
        <animate attributeName="opacity" values="1;1;0;0;1" keyTimes="0;0.42;0.5;0.92;1" dur="2.6s" repeatCount="indefinite"/></g>
      <g opacity="0">${_fig(def.B)}
        <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.42;0.5;0.92;1" dur="2.6s" repeatCount="indefinite"/></g>
    </g>
    <text x="12" y="18" fill="#8b93a7" font-size="10">inicio ⇄ fin</text>
  </svg>`;
}

// helper: bench press family (flat / incline / decline)
function _press(kind) {
  let neck, hip, head, knee, foot, bench;
  if (kind === 'incl') {
    neck = [70, 74]; hip = [108, 92]; head = [61, 68]; knee = [122, 104]; foot = [124, 122];
    bench = _limb([54, 82], [116, 100]) + _limb([70, 92], [70, 124]) + _limb([106, 100], [106, 124]);
  } else if (kind === 'decl') {
    neck = [78, 102]; hip = [112, 84]; head = [69, 108]; knee = [124, 72]; foot = [136, 80];
    bench = _limb([60, 112], [122, 78]) + _limb([76, 108], [76, 124]) + _limb([112, 86], [112, 124]);
  } else {
    neck = [76, 90]; hip = [112, 92]; head = [65, 87]; knee = [126, 104]; foot = [128, 122];
    bench = _limb([56, 98], [120, 98]) + _limb([66, 98], [66, 124]) + _limb([112, 98], [112, 124]);
  }
  const A = { head, neck, hip, knee, foot, elbow: [neck[0] + 10, neck[1] + 10], hand: [neck[0] + 14, neck[1] - 8], gear: [[neck[0] + 14, neck[1] - 8]] };
  const B = { head, neck, hip, knee, foot, elbow: [neck[0] + 7, neck[1] - 20], hand: [neck[0] + 9, neck[1] - 36], gear: [[neck[0] + 9, neck[1] - 36]] };
  return { props: bench, A, B };
}

const ANIMS = {
  press_plano: { ..._press('flat'), cues: ['Acostado, pies firmes y escápulas juntas.', 'Bajá la barra al pecho de forma controlada.', 'Empujá hacia arriba sin rebotar en el pecho.'] },
  press_incl: { ..._press('incl'), cues: ['Banco a 30-45°: trabaja el pecho superior.', 'Bajá al pecho alto, cerca de las clavículas.', 'Codos a unos 45° del torso, no abiertos del todo.'] },
  press_decl: { ..._press('decl'), cues: ['Banco declinado: trabaja el pecho inferior.', 'Enganchá los pies para no deslizarte.', 'Bajá al pecho bajo y empujá vertical.'] },
  cruce: {
    props: _limb([20, 30], [20, 90]) + _limb([180, 30], [180, 90]) + _limb([20, 34], [72, 44]) + _limb([180, 34], [128, 44]),
    A: { head: [100, 28], neck: [100, 40], hip: [100, 80], knee: [95, 102], foot: [93, 124], knee2: [105, 102], foot2: [107, 124], elbow: [82, 46], hand: [70, 42], elbow2: [118, 46], hand2: [130, 42], gear: [[70, 42], [130, 42]] },
    B: { head: [100, 28], neck: [100, 40], hip: [100, 80], knee: [95, 102], foot: [93, 124], knee2: [105, 102], foot2: [107, 124], elbow: [90, 58], hand: [98, 66], elbow2: [110, 58], hand2: [102, 66], gear: [[98, 66], [102, 66]] },
    cues: ['Brazos semiflexionados, arco amplio.', 'Juntá las manos al frente apretando el pecho.', 'Volvé lento, sintiendo el estiramiento. En banco: mismo arco acostado.'],
  },
  frances: {
    props: _limb([56, 98], [120, 98]) + _limb([66, 98], [66, 124]) + _limb([112, 98], [112, 124]),
    A: { head: [65, 87], neck: [76, 90], hip: [112, 92], knee: [126, 104], foot: [128, 122], elbow: [80, 66], hand: [64, 58], gear: [[64, 58]] },
    B: { head: [65, 87], neck: [76, 90], hip: [112, 92], knee: [126, 104], foot: [128, 122], elbow: [80, 66], hand: [84, 46], gear: [[84, 46]] },
    cues: ['El codo queda fijo apuntando arriba.', 'Bajá el peso por detrás de la cabeza.', 'Extendé solo el antebrazo, sin mover el hombro.'],
  },
  ext_polea: {
    props: _limb([146, 26], [146, 90]) + _limb([146, 30], [116, 54]),
    A: { head: [96, 28], neck: [96, 40], hip: [96, 78], knee: [96, 101], foot: [96, 124], elbow: [108, 62], hand: [116, 52], gear: [[116, 52]] },
    B: { head: [96, 28], neck: [96, 40], hip: [96, 78], knee: [96, 101], foot: [96, 124], elbow: [108, 62], hand: [118, 80], gear: [[118, 80]] },
    cues: ['Codos pegados al torso, fijos.', 'Extendé hasta bloquear abajo.', 'Subí controlado sin que el codo se despegue.'],
  },
  fondos: {
    props: _limb([78, 68], [92, 68]) + _limb([108, 68], [122, 68]) + _limb([85, 68], [85, 124]) + _limb([115, 68], [115, 124]),
    A: { head: [100, 40], neck: [100, 52], hip: [100, 88], knee: [92, 104], foot: [86, 116], elbow: [108, 60], hand: [112, 68], gear: [] },
    B: { head: [100, 52], neck: [100, 64], hip: [100, 98], knee: [92, 112], foot: [86, 122], elbow: [114, 58], hand: [112, 68], gear: [] },
    cues: ['Cuerpo vertical entre las barras.', 'Bajá hasta que el codo quede a 90°.', 'Empujá hasta estirar los brazos, sin balancearte.'],
  },
  dominada: {
    props: _limb([60, 28], [140, 28]),
    A: { head: [100, 47], neck: [100, 58], hip: [100, 92], knee: [96, 108], foot: [92, 120], elbow: [100, 42], hand: [100, 28], gear: [] },
    B: { head: [100, 29], neck: [100, 40], hip: [100, 74], knee: [96, 92], foot: [92, 106], elbow: [106, 36], hand: [100, 28], gear: [] },
    cues: ['Colgado con agarre firme, core activo.', 'Subí hasta pasar el mentón de la barra.', 'Bajá lento, sin soltarte de golpe.'],
  },
  jalon: {
    props: _limb([98, 22], [102, 22]) + _limb([100, 22], [100, 34]) + _limb([84, 96], [116, 96]) + _limb([90, 96], [90, 124]) + _limb([110, 96], [110, 124]),
    A: { head: [96, 50], neck: [96, 62], hip: [96, 94], knee: [114, 96], foot: [114, 122], elbow: [98, 48], hand: [100, 36], gear: [[100, 36]] },
    B: { head: [92, 46], neck: [92, 58], hip: [96, 94], knee: [114, 96], foot: [114, 122], elbow: [104, 72], hand: [98, 62], gear: [[98, 62]] },
    cues: ['Sentado, pecho afuera, leve inclinación atrás.', 'Tirá la barra hacia la parte alta del pecho.', 'Sentí que los codos bajan hacia los bolsillos.'],
  },
  remo_sentado: {
    props: _limb([148, 40], [148, 96]) + _limb([148, 60], [126, 70]),
    A: { head: [88, 48], neck: [92, 60], hip: [92, 94], knee: [114, 90], foot: [130, 100], elbow: [108, 68], hand: [124, 70], gear: [[124, 70]] },
    B: { head: [82, 44], neck: [86, 56], hip: [92, 94], knee: [114, 90], foot: [130, 100], elbow: [96, 74], hand: [92, 74], gear: [[92, 74]] },
    cues: ['Espalda recta, rodillas semiflexionadas.', 'Llevá el agarre al abdomen juntando escápulas.', 'No te hamaques: el torso casi no se mueve.'],
  },
  remo_incl: {
    props: '',
    A: { head: [70, 52], neck: [78, 58], hip: [100, 80], knee: [100, 102], foot: [98, 124], elbow: [86, 76], hand: [88, 94], gear: [[88, 96]] },
    B: { head: [70, 52], neck: [78, 58], hip: [100, 80], knee: [100, 102], foot: [98, 124], elbow: [94, 68], hand: [90, 80], gear: [[90, 82]] },
    cues: ['Torso inclinado ~45°, espalda neutra.', 'Tirá el peso hacia la cadera, no al pecho.', 'Apretá la escápula arriba y bajá controlado.'],
  },
  remo_vert: {
    props: '',
    A: { head: [96, 28], neck: [96, 40], hip: [96, 78], knee: [96, 101], foot: [96, 124], elbow: [100, 62], hand: [98, 80], gear: [[98, 82]] },
    B: { head: [96, 28], neck: [96, 40], hip: [96, 78], knee: [96, 101], foot: [96, 124], elbow: [112, 48], hand: [98, 46], gear: [[98, 48]] },
    cues: ['Barra pegada al cuerpo.', 'Subí llevando los codos altos, hasta el mentón.', 'Bajá lento por el mismo camino.'],
  },
  pullover: {
    props: _limb([150, 24], [150, 60]) + _limb([150, 28], [132, 40]),
    A: { head: [92, 30], neck: [94, 42], hip: [98, 80], knee: [98, 102], foot: [98, 124], elbow: [112, 48], hand: [128, 40], gear: [[128, 40]] },
    B: { head: [92, 30], neck: [94, 42], hip: [98, 80], knee: [98, 102], foot: [98, 124], elbow: [104, 66], hand: [108, 80], gear: [[108, 80]] },
    cues: ['Brazos casi estirados todo el recorrido.', 'Bajá el agarre en arco hasta los muslos.', 'Sentí el trabajo en dorsales, no en tríceps.'],
  },
  pajaros: {
    props: '',
    A: { head: [70, 52], neck: [78, 58], hip: [100, 80], knee: [100, 102], foot: [98, 124], elbow: [84, 76], hand: [86, 92], gear: [[86, 94]] },
    B: { head: [70, 52], neck: [78, 58], hip: [100, 80], knee: [100, 102], foot: [98, 124], elbow: [72, 62], hand: [62, 54], gear: [[62, 54]] },
    cues: ['Torso inclinado, brazos semiflexionados.', 'Abrí en arco hacia los costados/atrás.', 'Trabaja el hombro posterior: movimiento corto y limpio.'],
  },
  curl: {
    props: '',
    A: { head: [96, 28], neck: [96, 40], hip: [96, 78], knee: [96, 101], foot: [96, 124], elbow: [102, 60], hand: [104, 80], gear: [[104, 82]] },
    B: { head: [96, 28], neck: [96, 40], hip: [96, 78], knee: [96, 101], foot: [96, 124], elbow: [102, 60], hand: [92, 48], gear: [[92, 48]] },
    cues: ['Codos pegados al torso, fijos.', 'Subí el peso girando solo el antebrazo.', 'Bajá lento: la fase negativa también cuenta.'],
  },
  press_mil: {
    props: '',
    A: { head: [96, 28], neck: [96, 40], hip: [96, 78], knee: [96, 101], foot: [96, 124], elbow: [108, 50], hand: [102, 40], gear: [[102, 40]] },
    B: { head: [96, 30], neck: [96, 42], hip: [96, 78], knee: [96, 101], foot: [96, 124], elbow: [102, 28], hand: [100, 14], gear: [[100, 14]] },
    cues: ['Core firme, glúteos apretados: no arquees la espalda.', 'Empujá la barra vertical por delante de la cara.', 'Bloqueá arriba con la cabeza "pasando" entre los brazos.'],
  },
  elev_lat: {
    props: '',
    A: { head: [100, 28], neck: [100, 40], hip: [100, 78], knee: [95, 101], foot: [93, 124], knee2: [105, 101], foot2: [107, 124], elbow: [89, 56], hand: [85, 72], elbow2: [111, 56], hand2: [115, 72], gear: [[85, 74], [115, 74]] },
    B: { head: [100, 28], neck: [100, 40], hip: [100, 78], knee: [95, 101], foot: [93, 124], knee2: [105, 101], foot2: [107, 124], elbow: [79, 44], hand: [62, 42], elbow2: [121, 44], hand2: [138, 42], gear: [[62, 42], [138, 42]] },
    cues: ['Subí hasta la altura de los hombros, no más.', 'Codos apenas flexionados, como sirviendo agua.', 'Bajá más lento de lo que subís.'],
  },
  sentadilla: {
    props: '',
    A: { head: [98, 27], neck: [98, 39], hip: [98, 76], knee: [98, 100], foot: [98, 124], elbow: [88, 48], hand: [86, 38], gear: [[86, 39]] },
    B: { head: [90, 50], neck: [92, 62], hip: [104, 93], knee: [90, 104], foot: [96, 124], elbow: [82, 70], hand: [80, 61], gear: [[80, 62]] },
    cues: ['Pies al ancho de hombros, punta apenas afuera.', 'Bajá como sentándote atrás, pecho arriba.', 'Rodillas siguen la dirección de la punta del pie.'],
  },
  prensa: {
    props: _limb([96, 60], [136, 96]) + _limb([44, 108], [84, 76]),
    A: { head: [50, 76], neck: [58, 84], hip: [82, 100], knee: [96, 84], foot: [108, 74], elbow: [66, 96], hand: [72, 104], gear: [[112, 72]] },
    B: { head: [50, 76], neck: [58, 84], hip: [82, 100], knee: [104, 80], foot: [122, 62], elbow: [66, 96], hand: [72, 104], gear: [[126, 60]] },
    cues: ['Espalda y cadera siempre apoyadas en el respaldo.', 'Bajá hasta ~90° sin que la cadera se despegue.', 'Empujá con toda la planta, sin bloquear de golpe.'],
  },
  cuadricera: {
    props: _limb([80, 96], [116, 96]) + _limb([86, 96], [86, 124]) + _limb([110, 96], [110, 124]),
    A: { head: [90, 48], neck: [90, 60], hip: [92, 94], knee: [106, 98], foot: [104, 118], gear: [[104, 120]] },
    B: { head: [90, 48], neck: [90, 60], hip: [92, 94], knee: [106, 98], foot: [126, 90], gear: [[128, 90]] },
    cues: ['Espalda apoyada, rodilla alineada con el eje de la máquina.', 'Extendé hasta casi bloquear.', 'Bajá frenando el peso, no lo dejes caer.'],
  },
  estocada: {
    props: '',
    A: { head: [100, 30], neck: [100, 42], hip: [100, 78], knee: [92, 100], foot: [88, 124], knee2: [108, 100], foot2: [114, 124], elbow: [94, 62], hand: [93, 76], gear: [[93, 78]] },
    B: { head: [100, 44], neck: [100, 56], hip: [100, 90], knee: [116, 102], foot: [116, 124], knee2: [86, 112], foot2: [74, 122], elbow: [94, 74], hand: [93, 88], gear: [[93, 90]] },
    cues: ['Paso amplio, torso vertical.', 'Bajá hasta que ambas rodillas queden a 90°.', 'La rodilla de adelante no pasa la punta del pie.'],
  },
  step_up: {
    props: `<rect x="112" y="98" width="34" height="28" rx="2"/>`,
    A: { head: [92, 40], neck: [92, 52], hip: [94, 84], knee: [110, 90], foot: [122, 98], knee2: [94, 106], foot2: [92, 124], elbow: [86, 66], hand: [85, 80], gear: [] },
    B: { head: [122, 16], neck: [122, 28], hip: [122, 60], knee: [124, 80], foot: [126, 98], knee2: [112, 84], foot2: [106, 100], elbow: [116, 42], hand: [115, 56], gear: [] },
    cues: ['Todo el pie apoyado en el cajón.', 'Subí empujando con la pierna de arriba, no con impulso.', 'Bajá controlado con la misma pierna.'],
  },
  peso_muerto: {
    props: '',
    A: { head: [72, 56], neck: [80, 62], hip: [104, 82], knee: [100, 103], foot: [98, 124], elbow: [86, 78], hand: [88, 98], gear: [[88, 100]] },
    B: { head: [96, 28], neck: [96, 40], hip: [96, 78], knee: [96, 101], foot: [98, 124], elbow: [98, 62], hand: [98, 82], gear: [[98, 84]] },
    cues: ['Espalda neutra siempre: pecho afuera.', 'La cadera empuja hacia atrás, la barra pegada a las piernas.', 'Subí extendiendo cadera y rodilla a la vez.'],
  },
  hip_thrust: {
    props: _limb([52, 88], [76, 88]) + _limb([56, 88], [56, 124]) + _limb([72, 88], [72, 124]),
    A: { head: [62, 78], neck: [70, 86], hip: [96, 106], knee: [112, 90], foot: [114, 124], gear: [[96, 100]] },
    B: { head: [62, 78], neck: [70, 86], hip: [96, 84], knee: [112, 86], foot: [114, 124], gear: [[96, 78]] },
    cues: ['Apoyo de omóplatos en el banco, pies firmes.', 'Subí la cadera apretando glúteos hasta alinear el torso.', 'Mentón al pecho, sin arquear la zona lumbar.'],
  },
  curl_fem: {
    props: _limb([54, 96], [136, 96]) + _limb([64, 96], [64, 124]) + _limb([126, 96], [126, 124]),
    A: { head: [58, 88], neck: [68, 92], hip: [104, 92], knee: [122, 94], foot: [140, 96], gear: [[140, 92]] },
    B: { head: [58, 88], neck: [68, 92], hip: [104, 92], knee: [122, 94], foot: [126, 68], gear: [[128, 66]] },
    cues: ['Cadera pegada a la camilla todo el tiempo.', 'Llevá los talones hacia los glúteos.', 'Bajá lento resistiendo el peso.'],
  },
  gemelos: {
    props: `<rect x="86" y="118" width="26" height="8" rx="1"/>`,
    A: { head: [96, 32], neck: [96, 44], hip: [96, 80], knee: [96, 100], foot: [96, 118], gear: [[84, 50], [108, 50]] },
    B: { head: [96, 24], neck: [96, 36], hip: [96, 72], knee: [96, 94], foot: [96, 112], gear: [[84, 42], [108, 42]] },
    cues: ['Punta del pie en el borde del escalón.', 'Subí lo más alto posible y aguantá 1 segundo.', 'Bajá el talón por debajo del escalón: estiramiento completo.'],
  },
  tibial: {
    props: _limb([120, 30], [120, 124]),
    A: { head: [104, 32], neck: [105, 44], hip: [110, 80], knee: [108, 102], foot: [104, 124], extra: _limb([104, 124], [92, 124]) },
    B: { head: [104, 32], neck: [105, 44], hip: [110, 80], knee: [108, 102], foot: [104, 124], extra: _limb([104, 124], [93, 116]) },
    cues: ['Apoyá la espalda en la pared, talones adelantados.', 'Levantá las puntas de los pies lo máximo posible.', 'Clave para prevenir periostitis al correr.'],
  },
  abductor: {
    props: _limb([84, 96], [116, 96]) + _limb([90, 96], [90, 124]) + _limb([110, 96], [110, 124]),
    A: { head: [100, 48], neck: [100, 60], hip: [100, 92], knee: [95, 106], foot: [93, 124], knee2: [105, 106], foot2: [107, 124] },
    B: { head: [100, 48], neck: [100, 60], hip: [100, 92], knee: [82, 102], foot: [76, 124], knee2: [118, 102], foot2: [124, 124] },
    cues: ['Espalda apoyada en el respaldo.', 'Abrí contra la resistencia hasta donde llegues.', 'Cerrá frenando: no dejes que la máquina te gane.'],
  },
  crunch: {
    props: '',
    A: { head: [60, 110], neck: [70, 114], hip: [104, 118], knee: [118, 100], foot: [124, 122], elbow: [78, 108], hand: [66, 104] },
    B: { head: [70, 96], neck: [78, 102], hip: [104, 118], knee: [118, 100], foot: [124, 122], elbow: [84, 98], hand: [74, 92] },
    cues: ['Despegá solo los omóplatos del piso.', 'Exhalá al subir, como enrollándote.', 'No tires del cuello con las manos.'],
  },
  plancha: {
    props: '',
    A: { head: [60, 90], neck: [72, 96], hip: [104, 100], knee: [120, 106], foot: [138, 118], elbow: [70, 118], hand: [56, 120] },
    B: { head: [60, 90], neck: [72, 96], hip: [104, 101], knee: [120, 107], foot: [138, 118], elbow: [70, 118], hand: [56, 120] },
    cues: ['Línea recta de cabeza a talones.', 'Apretá abdomen y glúteos: que la cadera no caiga.', 'Respirá normal, aguantá el tiempo indicado.'],
  },
  pallof: {
    props: _limb([154, 30], [154, 96]) + _limb([154, 56], [126, 62]),
    A: { head: [96, 30], neck: [96, 42], hip: [96, 80], knee: [93, 102], foot: [91, 124], knee2: [99, 102], foot2: [101, 124], elbow: [104, 58], hand: [110, 62], gear: [[112, 62]] },
    B: { head: [96, 30], neck: [96, 42], hip: [96, 80], knee: [93, 102], foot: [91, 124], knee2: [99, 102], foot2: [101, 124], elbow: [112, 60], hand: [126, 62], gear: [[128, 62]] },
    cues: ['De costado a la polea, pies firmes.', 'Extendé los brazos al frente sin girar el torso.', 'El core resiste la rotación: eso es el ejercicio.'],
  },
  dead_bug: {
    props: '',
    A: { head: [66, 108], neck: [76, 112], hip: [104, 116], knee: [112, 96], foot: [124, 100], elbow: [76, 98], hand: [74, 86] },
    B: { head: [66, 108], neck: [76, 112], hip: [104, 116], knee: [124, 104], foot: [142, 112], elbow: [64, 100], hand: [52, 96] },
    cues: ['Zona lumbar pegada al piso siempre.', 'Extendé brazo y pierna contrarios, lento.', 'Si la espalda se arquea, acortá el movimiento.'],
  },
  bird_dog: {
    props: '',
    A: { head: [64, 78], neck: [74, 84], hip: [106, 86], knee: [108, 108], foot: [120, 120], elbow: [76, 102], hand: [74, 120] },
    B: { head: [64, 78], neck: [74, 84], hip: [106, 86], knee: [108, 108], foot: [120, 120], elbow: [62, 90], hand: [46, 84], knee2: [128, 88], foot2: [148, 88] },
    cues: ['En 4 apoyos, espalda neutra.', 'Estirá brazo y pierna contrarios hasta la horizontal.', 'La cadera no rota: movete lento y estable.'],
  },
  rueda: {
    props: '',
    A: { head: [82, 62], neck: [88, 72], hip: [96, 98], knee: [96, 120], foot: [82, 122], elbow: [100, 90], hand: [108, 108], extra: `<circle cx="112" cy="112" r="9" fill="none"/>` },
    B: { head: [102, 74], neck: [110, 82], hip: [104, 102], knee: [98, 120], foot: [84, 122], elbow: [126, 96], hand: [142, 108], extra: `<circle cx="146" cy="112" r="9" fill="none"/>` },
    cues: ['De rodillas, rodá hacia adelante lento.', 'El abdomen frena la caída: no arquees la lumbar.', 'Andá hasta donde controles y volvé.'],
  },
  ext_tronco: {
    props: _limb([96, 88], [124, 100]) + _limb([104, 92], [104, 124]),
    A: { head: [76, 114], neck: [82, 106], hip: [102, 90], knee: [114, 97], foot: [126, 104] },
    B: { head: [68, 74], neck: [76, 82], hip: [102, 90], knee: [114, 97], foot: [126, 104] },
    cues: ['Cadera apoyada en el borde del banco.', 'Subí hasta alinear el torso con las piernas, no más.', 'Bajá controlado, espalda siempre recta.'],
  },
  caminata: {
    props: '',
    A: { head: [96, 28], neck: [96, 40], hip: [96, 78], knee: [86, 99], foot: [80, 124], knee2: [106, 99], foot2: [114, 124], elbow: [92, 60], hand: [90, 80], elbow2: [102, 60], hand2: [104, 80], gear: [[90, 84], [104, 84]] },
    B: { head: [96, 28], neck: [96, 40], hip: [96, 78], knee: [106, 99], foot: [112, 124], knee2: [86, 99], foot2: [78, 124], elbow: [92, 60], hand: [90, 80], elbow2: [102, 60], hand2: [104, 80], gear: [[90, 84], [104, 84]] },
    cues: ['Peso pesado en cada mano, hombros atrás.', 'Caminá erguido con pasos cortos y firmes.', 'El core trabaja manteniéndote derecho.'],
  },
  pogo: {
    props: '',
    A: { head: [96, 34], neck: [96, 46], hip: [96, 82], knee: [96, 103], foot: [96, 124], elbow: [102, 64], hand: [104, 76] },
    B: { head: [96, 20], neck: [96, 32], hip: [96, 68], knee: [96, 90], foot: [98, 112], elbow: [102, 50], hand: [104, 62] },
    cues: ['Saltos cortos y rápidos, rodillas casi rectas.', 'Rebotá desde la punta del pie, talones sin apoyar.', 'Prepara los tendones para el impacto de correr.'],
  },
  mov_tobillo: {
    props: _limb([140, 40], [140, 124]),
    A: { head: [86, 56], neck: [88, 68], hip: [92, 96], knee: [112, 100], foot: [114, 124], knee2: [88, 118], foot2: [72, 122] },
    B: { head: [94, 54], neck: [96, 66], hip: [98, 96], knee: [124, 96], foot: [114, 124], knee2: [88, 118], foot2: [72, 122] },
    cues: ['Pie adelantado cerca de la pared.', 'Llevá la rodilla hacia la pared sin levantar el talón.', 'Gana movilidad de tobillo: clave para la zancada.'],
  },
  mov_9090: {
    props: '',
    A: { head: [96, 60], neck: [96, 72], hip: [96, 106], knee: [116, 108], foot: [126, 120], knee2: [112, 116], foot2: [100, 122] },
    B: { head: [96, 60], neck: [96, 72], hip: [96, 106], knee: [76, 108], foot: [66, 120], knee2: [80, 116], foot2: [92, 122] },
    cues: ['Sentado, ambas rodillas a 90°.', 'Girá las piernas de un lado al otro sin mover el torso.', 'Movilidad de cadera en rotación: hacelo suave.'],
  },
  foot_core: {
    props: _limb([60, 124], [150, 124]),
    A: { head: [80, 60], neck: [82, 72], hip: [86, 100], knee: [104, 104], foot: [108, 124], extra: `<path d="M108 124 q10 -6 20 0" fill="none"/>` },
    B: { head: [80, 60], neck: [82, 72], hip: [86, 100], knee: [104, 104], foot: [108, 124], extra: `<path d="M108 124 q6 -9 12 -2 q4 4 8 2" fill="none"/>` },
    cues: ['Sentado, pie sobre una toalla extendida.', 'Arrugá la toalla trayéndola con los dedos.', 'Fortalece el arco del pie: base de la pisada.'],
  },
  flexiones: {
    props: '',
    A: { head: [62, 78], neck: [74, 84], hip: [106, 94], knee: [122, 102], foot: [140, 114], elbow: [74, 102], hand: [72, 122] },
    B: { head: [62, 96], neck: [74, 102], hip: [106, 108], knee: [122, 112], foot: [140, 118], elbow: [62, 112], hand: [72, 122] },
    cues: ['Cuerpo en línea recta, manos bajo los hombros.', 'Bajá el pecho cerca del piso, codos a 45°.', 'Empujá sin que la cadera se hunda ni se levante.'],
  },
};

// exercise name (+ group) → movement pattern; first match wins
const PATTERN_RULES = [
  [/apertura|cruce de poleas|cruce de polea/, 'cruce'],
  [/press de banco inclinado|press.*inclinado/, 'press_incl'],
  [/press de banco declinado/, 'press_decl'],
  [/press de banco plano|press con mancuernas|empuje en banco|press de banca/, 'press_plano'],
  [/frances/, 'frances'],
  [/katana|extensiones en polea|patada de burro/, 'ext_polea'],
  [/fondo/, 'fondos'],
  [/dominadas/, 'dominada'],
  [/tiron|jal[oó]n/, 'jalon'],
  [/remo en polea baja/, 'remo_sentado'],
  [/remo al menton/, 'remo_vert'],
  [/remo|barra t/, 'remo_incl'],
  [/pull-?over/, 'pullover'],
  [/pajaros|posteriores en polea/, 'pajaros'],
  [/curl|scott|concentrado/, 'curl'],
  [/press militar|pres frontal|arnold|arnlod/, 'press_mil'],
  [/vuelo|elevacion lateral/, 'elev_lat'],
  [/bulgara|b[uú]lgara|estocada/, 'estocada'],
  [/subidas al caj[oó]n|step-?up/, 'step_up'],
  [/sentadilla/, 'sentadilla'],
  [/cuadricera/, 'cuadricera'],
  [/isquios/, 'curl_fem'],
  [/buenos dias|peso muerto/, 'peso_muerto'],
  [/hip thrust|puente/, 'hip_thrust'],
  [/gemelos|s[oó]leo|pie en maquina|extension de pie|extension en prensa/, 'gemelos'],
  [/tibial/, 'tibial'],
  [/prensa/, 'prensa'],
  [/crunch/, 'crunch'],
  [/plancha/, 'plancha'],
  [/pallof/, 'pallof'],
  [/dead bug/, 'dead_bug'],
  [/bird/, 'bird_dog'],
  [/rueda/, 'rueda'],
  [/extension de tronco/, 'ext_tronco'],
  [/caminata/, 'caminata'],
  [/pogo/, 'pogo'],
  [/movilidad de tobillo/, 'mov_tobillo'],
  [/90\/90/, 'mov_9090'],
  [/foot core|toalla/, 'foot_core'],
  [/flexiones/, 'flexiones'],
];

function patternFor(name, groupKey) {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [re, pat] of PATTERN_RULES) {
    if (re.test(n)) {
      // group-specific overrides for ambiguous names
      if (groupKey === 'ABDUCTOR' && (pat === 'remo_incl' || n.includes('maquina') || n.includes('polea'))) return 'abductor';
      return pat;
    }
  }
  if (groupKey === 'ABDUCTOR') return 'abductor';
  return null;
}
