import { part, at, C, createAssembly as asm, buildScrew, buildScrewAndNut, buildDrone } from './parts.js';

/**
 * Libreria di oggetti già montati. Ogni oggetto è un assieme con sotto-assiemi annidati,
 * così si può smontare livello per livello fino all'ultimo pezzo.
 * Misure in metri; l'origine di ogni pezzo è al suo centro.
 */
const K = {
  alu: 0xc9ced6, steel: 0x9aa0a8, dark: 0x2b2f36, black: 0x15171b, red: 0xe5483a, blue: 0x3f7fe8,
  yellow: 0xffc845, green: 0x45d483, white: 0xeef1f5, copper: 0xb87333, brass: 0xd4af37, orange: 0xff8a2a,
  rubber: 0x1d1f24, glass: 0x9fd4ff, wood: 0x8a5a36, purple: 0xb57bff,
};
const PI = Math.PI;

function screwsOnCircle(n, r, y, len, rad, name, rotX = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * PI * 2 + PI / n;
    return at(buildScrew(len, rad, `${name} #${i + 1}`, 3), [Math.cos(a) * r, y, Math.sin(a) * r], [rotX, 0, 0]);
  });
}

// ------------------------------------------------------------- motore a pistone
function engine() {
  const fins = Array.from({ length: 5 }, (_, i) =>
    part('box', { w: 0.075, h: 0.004, d: 0.075 }, K.alu, `Aletta di raffreddamento ${i + 1}`, [0, 0.07 + i * 0.01, 0]));
  const cylinderGroup = asm('Gruppo termico', [
    part('tube', { R: 0.03, r: 0.022, h: 0.06 }, K.alu, 'Cilindro', [0, 0.075, 0]),
    asm('Testata', [
      part('box', { w: 0.07, h: 0.018, d: 0.07 }, K.alu, 'Testata', [0, 0.115, 0]),
      ...fins.map((f) => { f.position.y += 0.06; return f; }),
      asm('Candela', [
        part('cylinder', { r: 0.006, h: 0.012, seg: 6 }, K.white, 'Isolante', [0, 0.19, 0]),
        part('cylinder', { r: 0.007, h: 0.006, seg: 6 }, K.steel, 'Esagono', [0, 0.18, 0]),
        part('cylinder', { r: 0.0025, h: 0.01 }, K.steel, 'Elettrodo', [0, 0.172, 0]),
      ]),
      ...screwsOnCircle(4, 0.042, 0.11, 0.02, 0.0025, 'Vite testata'),
    ]),
  ]);
  const piston = asm('Pistone', [
    part('cylinder', { r: 0.021, h: 0.024 }, K.alu, 'Pistone', [0, 0.085, 0]),
    ...[0, 1, 2].map((i) => part('torus', { R: 0.021, r: 0.0012 }, K.dark, `Fascia elastica ${i + 1}`, [0, 0.092 - i * 0.004, 0])),
    part('cylinder', { r: 0.004, h: 0.04 }, K.steel, 'Spinotto', [0, 0.08, 0], [0, 0, PI / 2]),
  ]);
  const crank = asm('Albero motore', [
    part('cylinder', { r: 0.006, h: 0.12 }, K.steel, 'Albero', [0, 0.025, 0], [0, 0, PI / 2]),
    part('box', { w: 0.006, h: 0.04, d: 0.03 }, K.dark, 'Contrappeso sinistro', [-0.012, 0.025, 0]),
    part('box', { w: 0.006, h: 0.04, d: 0.03 }, K.dark, 'Contrappeso destro', [0.012, 0.025, 0]),
    part('cylinder', { r: 0.045, h: 0.01 }, K.dark, 'Volano', [0.065, 0.025, 0], [0, 0, PI / 2]),
  ]);
  return asm('Motore a pistone', [
    part('box', { w: 0.1, h: 0.05, d: 0.08 }, K.dark, 'Basamento', [0, 0.025, 0]),
    cylinderGroup,
    asm('Manovellismo', [piston, part('box', { w: 0.008, h: 0.05, d: 0.006 }, K.steel, 'Biella', [0, 0.055, 0]), crank]),
  ]);
}

// ------------------------------------------------------------- riduttore
function gearbox() {
  const bearing = (name, pos) => asm(name, [
    part('torus', { R: 0.009, r: 0.003 }, K.steel, 'Anello esterno', pos, [PI / 2, 0, 0]),
    part('torus', { R: 0.006, r: 0.002 }, K.alu, 'Anello interno', pos, [PI / 2, 0, 0]),
  ]);
  return asm('Riduttore a ingranaggi', [
    asm('Scatola', [
      part('box', { w: 0.16, h: 0.01, d: 0.08 }, K.blue, 'Fondo', [0, 0.005, 0]),
      part('box', { w: 0.16, h: 0.07, d: 0.006 }, K.blue, 'Parete posteriore', [0, 0.045, -0.037]),
      part('box', { w: 0.006, h: 0.07, d: 0.08 }, K.blue, 'Fianco sinistro', [-0.077, 0.045, 0]),
      part('box', { w: 0.006, h: 0.07, d: 0.08 }, K.blue, 'Fianco destro', [0.077, 0.045, 0]),
    ]),
    asm('Albero veloce', [
      part('cylinder', { r: 0.005, h: 0.11 }, K.steel, 'Albero', [-0.04, 0.045, 0.01], [PI / 2, 0, 0]),
      part('gear', { R: 0.018, teeth: 12, h: 0.012, hole: 0.005 }, K.brass, 'Pignone', [-0.04, 0.045, 0.01], [PI / 2, 0, 0]),
      bearing('Cuscinetto anteriore', [-0.04, 0.045, 0.045]),
    ]),
    asm('Albero lento', [
      part('cylinder', { r: 0.006, h: 0.11 }, K.steel, 'Albero', [0.022, 0.045, 0.01], [PI / 2, 0, 0]),
      part('gear', { R: 0.042, teeth: 28, h: 0.012, hole: 0.006 }, K.copper, 'Corona', [0.022, 0.045, 0.01], [PI / 2, 0, 0]),
      bearing('Cuscinetto anteriore', [0.022, 0.045, 0.045]),
    ]),
    asm('Coperchio', [
      part('box', { w: 0.16, h: 0.006, d: 0.08 }, K.alu, 'Coperchio', [0, 0.083, 0]),
      ...[[-0.07, -0.03], [0.07, -0.03], [-0.07, 0.03], [0.07, 0.03]].map(([x, z], i) =>
        at(buildScrew(0.014, 0.0025, `Vite coperchio #${i + 1}`, 3), [x, 0.076, z])),
    ]),
  ]);
}

// ------------------------------------------------------------- braccio robotico
function robotArm() {
  const motor = (name, pos, rot) => asm(name, [
    part('cylinder', { r: 0.018, h: 0.03 }, K.dark, 'Corpo motore', pos, rot),
    part('cylinder', { r: 0.008, h: 0.034 }, K.steel, 'Albero', pos, rot),
  ]);
  return asm('Braccio robotico', [
    asm('Base', [
      part('cylinder', { r: 0.05, h: 0.015 }, K.dark, 'Piastra base', [0, 0.0075, 0]),
      part('cylinder', { r: 0.035, h: 0.025 }, K.orange, 'Torretta', [0, 0.028, 0]),
      ...screwsOnCircle(4, 0.042, 0.012, 0.012, 0.002, 'Vite base'),
    ]),
    asm('Spalla', [
      part('box', { w: 0.03, h: 0.05, d: 0.04 }, K.orange, 'Supporto spalla', [0, 0.065, 0]),
      motor('Motore spalla', [0, 0.08, 0], [PI / 2, 0, 0]),
    ]),
    asm('Braccio', [
      part('box', { w: 0.022, h: 0.11, d: 0.022 }, K.white, 'Segmento 1', [0, 0.135, 0]),
      motor('Motore gomito', [0, 0.19, 0], [PI / 2, 0, 0]),
      part('box', { w: 0.09, h: 0.018, d: 0.018 }, K.white, 'Segmento 2', [0.045, 0.19, 0]),
    ]),
    asm('Polso e pinza', [
      part('sphere', { r: 0.013 }, K.dark, 'Polso', [0.095, 0.19, 0]),
      part('box', { w: 0.02, h: 0.012, d: 0.03 }, K.orange, 'Supporto pinza', [0.112, 0.19, 0]),
      part('box', { w: 0.03, h: 0.006, d: 0.005 }, K.steel, 'Dito sinistro', [0.13, 0.19, -0.01]),
      part('box', { w: 0.03, h: 0.006, d: 0.005 }, K.steel, 'Dito destro', [0.13, 0.19, 0.01]),
    ]),
  ]);
}

// ------------------------------------------------------------- ventilatore
function fan() {
  const blades = Array.from({ length: 3 }, (_, i) => {
    const a = (i / 3) * PI * 2;
    return part('box', { w: 0.004, h: 0.065, d: 0.03 }, K.blue, `Pala ${i + 1}`,
      [0.012, 0.17 + Math.sin(a) * 0.04, Math.cos(a) * 0.04], [a, 0, 0.25]);
  });
  const cage = asm('Griglia', [
    ...[0.03, 0.055, 0.08].map((R, i) => part('torus', { R, r: 0.0015 }, K.alu, `Anello ${i + 1}`, [0.03, 0.17, 0], [0, 0, PI / 2])),
    ...[0.03, 0.055, 0.08].map((R, i) => part('torus', { R, r: 0.0015 }, K.alu, `Anello posteriore ${i + 1}`, [-0.01, 0.17, 0], [0, 0, PI / 2])),
  ]);
  return asm('Ventilatore', [
    asm('Piede', [
      part('cylinder', { r: 0.06, h: 0.012 }, K.white, 'Base', [0, 0.006, 0]),
      part('cylinder', { r: 0.008, h: 0.13 }, K.alu, 'Asta', [0, 0.075, 0]),
      part('box', { w: 0.02, h: 0.006, d: 0.03 }, K.dark, 'Pulsante velocità', [0, 0.014, 0.03]),
    ]),
    asm('Motore', [
      part('sphere', { r: 0.03 }, K.white, 'Carter motore', [-0.03, 0.17, 0]),
      part('cylinder', { r: 0.004, h: 0.05 }, K.steel, 'Albero', [0.0, 0.17, 0], [0, 0, PI / 2]),
    ]),
    asm('Elica', [
      part('cylinder', { r: 0.012, h: 0.014 }, K.blue, 'Mozzo', [0.012, 0.17, 0], [0, 0, PI / 2]),
      ...blades,
      part('cone', { r: 0.012, h: 0.012 }, K.blue, 'Ogiva', [0.025, 0.17, 0], [0, 0, -PI / 2]),
    ]),
    cage,
  ]);
}

// ------------------------------------------------------------- razzo
function rocket() {
  const fins = Array.from({ length: 4 }, (_, i) => {
    const a = (i / 4) * PI * 2;
    return part('box', { w: 0.004, h: 0.05, d: 0.035 }, K.red, `Aletta ${i + 1}`, [Math.cos(a) * 0.035, 0.035, Math.sin(a) * 0.035], [0, -a, 0]);
  });
  const nozzles = Array.from({ length: 4 }, (_, i) => {
    const a = (i / 4) * PI * 2 + PI / 4;
    return part('cone', { r: 0.008, h: 0.014 }, K.dark, `Ugello ${i + 1}`, [Math.cos(a) * 0.012, 0.007, Math.sin(a) * 0.012]);
  });
  return asm('Razzo', [
    asm('Primo stadio', [
      part('cylinder', { r: 0.024, h: 0.12 }, K.white, 'Serbatoio', [0, 0.075, 0]),
      part('torus', { R: 0.024, r: 0.0025 }, K.dark, 'Anello di giunzione', [0, 0.135, 0]),
      ...fins,
      asm('Motori', nozzles),
    ]),
    asm('Secondo stadio', [
      part('cylinder', { r: 0.02, h: 0.08 }, K.white, 'Serbatoio', [0, 0.18, 0]),
      part('cone', { r: 0.012, h: 0.012 }, K.dark, 'Ugello', [0, 0.136, 0]),
      part('box', { w: 0.002, h: 0.04, d: 0.014 }, K.blue, 'Bandiera', [0.02, 0.18, 0]),
    ]),
    asm('Capsula', [
      part('cone', { r: 0.02, h: 0.05 }, K.alu, 'Ogiva', [0, 0.245, 0]),
      part('sphere', { r: 0.005 }, K.glass, 'Oblò', [0.0, 0.237, 0.014]),
      part('cylinder', { r: 0.0015, h: 0.03 }, K.dark, 'Torre di salvataggio', [0, 0.285, 0]),
    ]),
  ]);
}

// ------------------------------------------------------------- automobilina
function car() {
  const wheel = (name, x, z) => asm(name, [
    part('torus', { R: 0.016, r: 0.007 }, K.rubber, 'Pneumatico', [x, 0.023, z], [PI / 2, 0, 0]),
    part('cylinder', { r: 0.012, h: 0.012 }, K.alu, 'Cerchione', [x, 0.023, z], [PI / 2, 0, 0]),
    ...[0, 1, 2, 3].map((i) => {
      const a = (i / 4) * PI * 2;
      return part('cylinder', { r: 0.0015, h: 0.004, seg: 6 }, K.steel, `Bullone ${i + 1}`,
        [x + Math.cos(a) * 0.006, 0.023 + Math.sin(a) * 0.006, z + Math.sign(z) * 0.007], [PI / 2, 0, 0]);
    }),
  ]);
  return asm('Automobilina', [
    asm('Telaio', [
      part('box', { w: 0.15, h: 0.008, d: 0.06 }, K.dark, 'Pianale', [0, 0.025, 0]),
      part('cylinder', { r: 0.003, h: 0.075 }, K.steel, 'Assale anteriore', [0.05, 0.023, 0], [PI / 2, 0, 0]),
      part('cylinder', { r: 0.003, h: 0.075 }, K.steel, 'Assale posteriore', [-0.05, 0.023, 0], [PI / 2, 0, 0]),
    ]),
    asm('Ruote', [wheel('Ruota ant. sx', 0.05, -0.037), wheel('Ruota ant. dx', 0.05, 0.037), wheel('Ruota post. sx', -0.05, -0.037), wheel('Ruota post. dx', -0.05, 0.037)]),
    asm('Carrozzeria', [
      part('box', { w: 0.16, h: 0.025, d: 0.064 }, K.red, 'Scocca', [0, 0.042, 0]),
      part('box', { w: 0.075, h: 0.025, d: 0.058 }, K.red, 'Abitacolo', [-0.012, 0.067, 0]),
      part('box', { w: 0.002, h: 0.02, d: 0.05 }, K.glass, 'Parabrezza', [0.027, 0.067, 0]),
      part('sphere', { r: 0.006 }, K.yellow, 'Faro sinistro', [0.08, 0.045, -0.02]),
      part('sphere', { r: 0.006 }, K.yellow, 'Faro destro', [0.08, 0.045, 0.02]),
    ]),
  ]);
}

// ------------------------------------------------------------- orologio meccanico
function clock() {
  const gears = [[0, 0, 0.022, 20], [0.028, 0.014, 0.012, 12], [-0.026, 0.018, 0.014, 14], [0.01, -0.03, 0.01, 10], [-0.02, -0.024, 0.009, 9]];
  return asm('Orologio meccanico', [
    asm('Cassa', [
      part('tube', { R: 0.06, r: 0.054, h: 0.02 }, K.brass, 'Cassa', [0, 0.06, 0], [PI / 2, 0, 0]),
      part('cylinder', { r: 0.055, h: 0.003 }, K.brass, 'Fondello', [0, 0.06, -0.009], [PI / 2, 0, 0]),
      part('cylinder', { r: 0.005, h: 0.01 }, K.brass, 'Corona', [0, 0.124, 0]),
      part('box', { w: 0.05, h: 0.004, d: 0.02 }, K.brass, 'Piedistallo', [0, 0.002, 0]),
    ]),
    asm('Movimento', gears.map(([x, y, R, t], i) =>
      part('gear', { R, teeth: t, h: 0.003, hole: 0.002 }, i % 2 ? K.brass : K.copper, `Ruota ${i + 1}`, [x, 0.06 + y, -0.004], [PI / 2, 0, 0]))),
    asm('Quadrante', [
      part('cylinder', { r: 0.053, h: 0.002 }, K.white, 'Quadrante', [0, 0.06, 0.003], [PI / 2, 0, 0]),
      ...Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * PI * 2;
        return part('box', { w: 0.002, h: i % 3 ? 0.005 : 0.009, d: 0.001 }, K.black, `Indice ${i + 1}`,
          [Math.sin(a) * 0.045, 0.06 + Math.cos(a) * 0.045, 0.005], [0, 0, -a]);
      }),
      part('box', { w: 0.003, h: 0.03, d: 0.001 }, K.black, 'Lancetta ore', [0.008, 0.07, 0.006], [0, 0, -0.9]),
      part('box', { w: 0.002, h: 0.042, d: 0.001 }, K.black, 'Lancetta minuti', [-0.01, 0.077, 0.007], [0, 0, 0.5]),
      part('cylinder', { r: 0.003, h: 0.004 }, K.black, 'Perno', [0, 0.06, 0.007], [PI / 2, 0, 0]),
    ]),
  ]);
}

// ------------------------------------------------------------- tastiera meccanica
function keyboard() {
  const rows = [];
  const letters = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  letters.forEach((row, r) => {
    const keys = [...row].map((ch, i) => {
      const x = -0.088 + i * 0.019 + r * 0.006;
      const z = -0.02 + r * 0.019;
      return asm(`Tasto ${ch}`, [
        part('box', { w: 0.016, h: 0.008, d: 0.016 }, r === 1 && i === 0 ? K.orange : K.white, 'Copritasto', [x, 0.03, z]),
        part('box', { w: 0.012, h: 0.006, d: 0.012 }, K.red, 'Interruttore', [x, 0.021, z]),
        part('cylinder', { r: 0.0015, h: 0.004 }, K.dark, 'Molla', [x, 0.016, z]),
      ]);
    });
    rows.push(asm(`Fila ${r + 1}`, keys));
  });
  rows.push(asm('Barra spaziatrice', [
    part('box', { w: 0.09, h: 0.008, d: 0.016 }, K.white, 'Copritasto', [0, 0.03, 0.037]),
    part('box', { w: 0.012, h: 0.006, d: 0.012 }, K.red, 'Interruttore', [0, 0.021, 0.037]),
  ]));
  return asm('Tastiera meccanica', [
    asm('Scocca', [
      part('box', { w: 0.215, h: 0.012, d: 0.09 }, K.dark, 'Fondo', [0, 0.006, 0]),
      part('box', { w: 0.205, h: 0.002, d: 0.08 }, K.alu, 'Piastra', [0, 0.017, 0]),
      part('box', { w: 0.012, h: 0.005, d: 0.006 }, K.dark, 'Porta USB', [-0.09, 0.009, -0.045]),
    ]),
    asm('Tasti', rows),
  ]);
}

// ------------------------------------------------------------- satellite
function satellite() {
  const panel = (name, x) => asm(name, [
    part('box', { w: 0.09, h: 0.002, d: 0.045 }, K.blue, 'Celle solari', [x, 0.06, 0]),
    part('box', { w: 0.092, h: 0.003, d: 0.003 }, K.alu, 'Telaio', [x, 0.06, 0.023]),
    part('box', { w: 0.092, h: 0.003, d: 0.003 }, K.alu, 'Telaio', [x, 0.06, -0.023]),
    part('cylinder', { r: 0.002, h: 0.03 }, K.alu, 'Braccio', [Math.sign(x) * 0.035, 0.06, 0], [0, 0, PI / 2]),
  ]);
  return asm('Satellite', [
    asm('Corpo', [
      part('box', { w: 0.045, h: 0.06, d: 0.045 }, K.brass, 'Struttura', [0, 0.06, 0]),
      part('cylinder', { r: 0.01, h: 0.012 }, K.dark, 'Motore', [0, 0.024, 0]),
      part('box', { w: 0.02, h: 0.012, d: 0.002 }, K.dark, 'Sensore', [0, 0.07, 0.023]),
    ]),
    panel('Pannello sinistro', -0.08), panel('Pannello destro', 0.08),
    asm('Antenna', [
      part('cylinder', { r: 0.002, h: 0.02 }, K.alu, 'Supporto', [0, 0.1, 0]),
      part('cone', { r: 0.024, h: 0.012 }, K.white, 'Parabola', [0, 0.115, 0], [PI, 0, 0]),
      part('sphere', { r: 0.003 }, K.dark, 'Illuminatore', [0, 0.118, 0]),
    ]),
  ]);
}

// ------------------------------------------------------------- casetta
function house() {
  return asm('Casetta', [
    part('box', { w: 0.16, h: 0.006, d: 0.12 }, K.green, 'Prato', [0, 0.003, 0]),
    asm('Muri', [
      part('box', { w: 0.1, h: 0.06, d: 0.004 }, K.white, 'Muro frontale', [0, 0.036, 0.04]),
      part('box', { w: 0.1, h: 0.06, d: 0.004 }, K.white, 'Muro posteriore', [0, 0.036, -0.04]),
      part('box', { w: 0.004, h: 0.06, d: 0.08 }, K.white, 'Muro sinistro', [-0.05, 0.036, 0]),
      part('box', { w: 0.004, h: 0.06, d: 0.08 }, K.white, 'Muro destro', [0.05, 0.036, 0]),
    ]),
    asm('Infissi', [
      part('box', { w: 0.02, h: 0.035, d: 0.003 }, K.wood, 'Porta', [0, 0.0235, 0.043]),
      part('sphere', { r: 0.0015 }, K.brass, 'Maniglia', [0.006, 0.024, 0.045]),
      part('box', { w: 0.018, h: 0.016, d: 0.003 }, K.glass, 'Finestra sinistra', [-0.03, 0.045, 0.043]),
      part('box', { w: 0.018, h: 0.016, d: 0.003 }, K.glass, 'Finestra destra', [0.03, 0.045, 0.043]),
    ]),
    asm('Tetto', [
      part('cone', { r: 0.085, h: 0.045, seg: 4 }, K.red, 'Tetto', [0, 0.0885, 0], [0, PI / 4, 0]),
      part('box', { w: 0.012, h: 0.025, d: 0.012 }, K.dark, 'Comignolo', [0.025, 0.1, -0.015]),
    ]),
  ]);
}

// ------------------------------------------------------------- macchina fotografica
function camera() {
  return asm('Macchina fotografica', [
    asm('Corpo', [
      part('box', { w: 0.12, h: 0.07, d: 0.04 }, K.black, 'Corpo', [0, 0.035, 0]),
      part('box', { w: 0.03, h: 0.07, d: 0.045 }, K.dark, 'Impugnatura', [0.048, 0.035, 0.003]),
      part('box', { w: 0.04, h: 0.02, d: 0.03 }, K.black, 'Mirino', [0, 0.08, 0]),
      part('cylinder', { r: 0.007, h: 0.005 }, K.red, 'Pulsante di scatto', [0.045, 0.073, 0]),
      part('cylinder', { r: 0.009, h: 0.006 }, K.alu, 'Ghiera modi', [-0.04, 0.073, 0]),
      part('box', { w: 0.06, h: 0.045, d: 0.002 }, K.glass, 'Schermo', [-0.01, 0.035, -0.021]),
    ]),
    asm('Obiettivo', [
      part('tube', { R: 0.026, r: 0.02, h: 0.03 }, K.black, 'Barilotto', [0, 0.035, 0.035], [PI / 2, 0, 0]),
      part('tube', { R: 0.028, r: 0.022, h: 0.012 }, K.dark, 'Ghiera zoom', [0, 0.035, 0.035], [PI / 2, 0, 0]),
      part('tube', { R: 0.024, r: 0.02, h: 0.02 }, K.black, 'Paraluce', [0, 0.035, 0.06], [PI / 2, 0, 0]),
      part('sphere', { r: 0.02 }, K.glass, 'Lente frontale', [0, 0.035, 0.048]),
    ]),
  ]);
}

// ------------------------------------------------------------- sedia da ufficio (in miniatura)
function chair() {
  const legs = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * PI * 2;
    return asm(`Razza ${i + 1}`, [
      part('box', { w: 0.045, h: 0.006, d: 0.008 }, K.dark, 'Razza', [Math.cos(a) * 0.025, 0.012, Math.sin(a) * 0.025], [0, -a, 0]),
      part('sphere', { r: 0.006 }, K.black, 'Rotella', [Math.cos(a) * 0.048, 0.006, Math.sin(a) * 0.048]),
    ]);
  });
  return asm('Sedia da ufficio', [
    asm('Base a stella', legs),
    part('cylinder', { r: 0.005, h: 0.04 }, K.alu, 'Pistone a gas', [0, 0.035, 0]),
    asm('Seduta', [
      part('box', { w: 0.06, h: 0.01, d: 0.06 }, K.blue, 'Cuscino', [0, 0.06, 0]),
      part('box', { w: 0.004, h: 0.025, d: 0.04 }, K.dark, 'Bracciolo sinistro', [-0.032, 0.075, 0]),
      part('box', { w: 0.004, h: 0.025, d: 0.04 }, K.dark, 'Bracciolo destro', [0.032, 0.075, 0]),
    ]),
    asm('Schienale', [
      part('box', { w: 0.004, h: 0.03, d: 0.01 }, K.alu, 'Supporto', [0, 0.075, -0.03]),
      part('box', { w: 0.058, h: 0.06, d: 0.008 }, K.blue, 'Schienale', [0, 0.115, -0.033]),
    ]),
  ]);
}

// ------------------------------------------------------------- lampadina
function bulb() {
  return asm('Lampadina', [
    part('sphere', { r: 0.03 }, K.glass, 'Bulbo', [0, 0.065, 0]),
    asm('Filamento', [
      part('cylinder', { r: 0.0008, h: 0.025 }, K.steel, 'Supporto sinistro', [-0.006, 0.05, 0]),
      part('cylinder', { r: 0.0008, h: 0.025 }, K.steel, 'Supporto destro', [0.006, 0.05, 0]),
      part('torus', { R: 0.006, r: 0.0008 }, K.orange, 'Filamento', [0, 0.064, 0], [PI / 2, 0, 0]),
    ]),
    asm('Attacco', [
      part('cylinder', { r: 0.014, h: 0.02 }, K.alu, 'Attacco a vite', [0, 0.024, 0]),
      ...[0, 1, 2].map((i) => part('torus', { R: 0.014, r: 0.0012 }, K.alu, `Filetto ${i + 1}`, [0, 0.017 + i * 0.006, 0])),
      part('cylinder', { r: 0.005, h: 0.006 }, K.brass, 'Contatto', [0, 0.011, 0]),
      part('cylinder', { r: 0.011, h: 0.006 }, K.black, 'Isolante', [0, 0.005, 0]),
    ]),
  ]);
}

export const LIBRARY = [
  { id: 'drone', label: 'Drone', build: buildDrone },
  { id: 'engine', label: 'Motore', build: engine },
  { id: 'gearbox', label: 'Riduttore', build: gearbox },
  { id: 'robot', label: 'Braccio robot', build: robotArm },
  { id: 'fan', label: 'Ventilatore', build: fan },
  { id: 'rocket', label: 'Razzo', build: rocket },
  { id: 'car', label: 'Automobilina', build: car },
  { id: 'clock', label: 'Orologio', build: clock },
  { id: 'keyboard', label: 'Tastiera', build: keyboard },
  { id: 'satellite', label: 'Satellite', build: satellite },
  { id: 'house', label: 'Casetta', build: house },
  { id: 'camera', label: 'Fotocamera', build: camera },
  { id: 'chair', label: 'Sedia', build: chair },
  { id: 'bulb', label: 'Lampadina', build: bulb },
  { id: 'screwnut', label: 'Vite e dado', build: buildScrewAndNut },
  { id: 'screw', label: 'Vite', build: () => buildScrew(0.05, 0.006, 'Vite M12', 5) },
];
