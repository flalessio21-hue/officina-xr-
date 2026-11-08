import { createPart, createAssembly } from './parts.js';

/**
 * Catalogo di oggetti "di tutto": tecnologia, animali, persone, veicoli, casa, cibo,
 * oggetti/armi e natura. Ogni oggetto è un assieme di pezzi (smontabile) in MISURE REALI
 * (metri), con l'origine al centro della base. Le parole chiave servono ai comandi vocali.
 */
const D = Math.PI / 180;
const part = (kind, params, color, name, pos = [0, 0, 0], rot = [0, 0, 0], scale) => {
  const m = createPart(kind, params, color, name);
  m.position.fromArray(pos);
  m.rotation.set(rot[0] * D, rot[1] * D, rot[2] * D);
  if (scale) m.scale.fromArray(scale);
  return m;
};
const B = (name, [w, h, d], pos, color, rot) => part('box', { w, h, d }, color, name, pos, rot);
const Cy = (name, r, h, pos, color, rot, seg = 32) => part('cylinder', { r, h, seg }, color, name, pos, rot);
const Sp = (name, r, pos, color, scale) => part('sphere', { r }, color, name, pos, [0, 0, 0], scale);
const Co = (name, r, h, pos, color, rot, seg = 32) => part('cone', { r, h, seg }, color, name, pos, rot);
const To = (name, R, r, pos, color, rot) => part('torus', { R, r }, color, name, pos, rot);
const Tu = (name, R, r, h, pos, color, rot, seg) => part('tube', { R, r, h, seg }, color, name, pos, rot);
const G = (name, children) => createAssembly(name, children.flat());

const C = {
  black: 0x15171b, dark: 0x2b2f36, gray: 0x8a9099, light: 0xd0d4da, white: 0xf2f2f2, red: 0xe5483a, blue: 0x3f7fe8,
  green: 0x45a04f, yellow: 0xffc845, orange: 0xff8a2a, brown: 0x7a4a2a, wood: 0xa0703c, pink: 0xf2a0a8, skin: 0xe8b896,
  glass: 0x9fd4ff, gold: 0xd4af37, steel: 0xb8bec6, cream: 0xf3e3c3, purple: 0x8a5cd6, leaf: 0x3e8f3a,
};

// ---------------------------------------------------------------- tecnologia
const pc = () => G('PC fisso', [
  G('Case', [B('Case', [0.2, 0.45, 0.45], [0.42, 0.225, 0], C.dark), B('Pannello frontale', [0.005, 0.4, 0.4], [0.42, 0.225, 0.226], C.black, [0, 90, 0]),
    Cy('Pulsante accensione', 0.012, 0.01, [0.42, 0.4, 0.228], C.blue, [90, 0, 0]),
    ...[0, 1, 2].map((i) => Cy(`Ventola ${i + 1}`, 0.05, 0.01, [0.42, 0.1 + i * 0.12, 0.23], C.light, [90, 0, 0]))]),
  G('Monitor', [B('Schermo', [0.62, 0.36, 0.03], [0, 0.42, -0.05], C.black), B('Pannello', [0.6, 0.34, 0.005], [0, 0.42, -0.033], C.blue),
    B('Braccio', [0.04, 0.2, 0.03], [0, 0.17, -0.08], C.dark), B('Piede', [0.22, 0.015, 0.16], [0, 0.0075, -0.06], C.dark)]),
  G('Tastiera', [B('Tastiera', [0.44, 0.025, 0.14], [0, 0.0125, 0.18], C.dark),
    ...Array.from({ length: 4 }, (_, r) => B(`Fila tasti ${r + 1}`, [0.4, 0.008, 0.024], [0, 0.03, 0.13 + r * 0.03], C.gray))]),
  G('Mouse', [Sp('Mouse', 0.035, [0.3, 0.015, 0.2], C.dark, [0.9, 0.45, 1.5]), B('Tappetino', [0.24, 0.003, 0.2], [0.3, 0.0015, 0.2], C.black)]),
]);
const laptop = () => G('Portatile', [
  G('Base', [B('Scocca', [0.34, 0.018, 0.24], [0, 0.009, 0], C.light), B('Tastiera', [0.29, 0.002, 0.11], [0, 0.019, -0.03], C.dark),
    B('Touchpad', [0.1, 0.002, 0.065], [0, 0.019, 0.07], C.gray)]),
  G('Schermo', [B('Coperchio', [0.34, 0.23, 0.008], [0, 0.13, -0.155], C.light, [-12, 0, 0]),
    B('Display', [0.31, 0.19, 0.002], [0, 0.13, -0.15], C.blue, [-12, 0, 0]), Cy('Webcam', 0.003, 0.003, [0, 0.235, -0.13], C.black, [78, 0, 0])]),
]);
const projector = () => G('Proiettore', [
  B('Corpo', [0.3, 0.1, 0.22], [0, 0.06, 0], C.white), Cy('Obiettivo', 0.04, 0.03, [-0.08, 0.06, 0.12], C.black, [90, 0, 0]),
  Cy('Lente', 0.032, 0.005, [-0.08, 0.06, 0.137], C.glass, [90, 0, 0]),
  ...[0, 1, 2, 3].map((i) => Cy(`Piedino ${i + 1}`, 0.012, 0.012, [(i % 2 ? 0.12 : -0.12), 0.006, (i < 2 ? 0.08 : -0.08)], C.black)),
  ...Array.from({ length: 6 }, (_, i) => B(`Griglia ${i + 1}`, [0.004, 0.06, 0.08], [0.05 + i * 0.015, 0.06, 0.112], C.gray)),
  B('Pulsanti', [0.06, 0.006, 0.03], [0.08, 0.113, 0.04], C.gray),
]);
const phone = () => G('Smartphone', [B('Scocca', [0.072, 0.008, 0.15], [0, 0.004, 0], C.black), B('Schermo', [0.068, 0.001, 0.145], [0, 0.0085, 0], C.blue),
  Cy('Fotocamera', 0.007, 0.003, [-0.02, -0.0005, -0.055], C.dark)]);
const tv = () => G('Televisore', [B('Schermo', [1.2, 0.7, 0.04], [0, 0.52, 0], C.black), B('Pannello', [1.17, 0.67, 0.004], [0, 0.52, 0.021], C.blue),
  B('Piede sinistro', [0.06, 0.16, 0.25], [-0.5, 0.08, 0], C.dark), B('Piede destro', [0.06, 0.16, 0.25], [0.5, 0.08, 0], C.dark)]);
const controller = () => G('Controller', [Sp('Corpo', 0.06, [0, 0.03, 0], C.dark, [1.6, 0.5, 0.9]),
  Sp('Impugnatura sinistra', 0.035, [-0.07, 0.025, 0.03], C.dark, [1, 0.8, 1.4]), Sp('Impugnatura destra', 0.035, [0.07, 0.025, 0.03], C.dark, [1, 0.8, 1.4]),
  Cy('Levetta sinistra', 0.012, 0.015, [-0.035, 0.06, -0.01], C.gray), Cy('Levetta destra', 0.012, 0.015, [0.02, 0.06, 0.015], C.gray),
  ...[['A', C.green, 0.07, 0.0], ['B', C.red, 0.085, -0.015], ['X', C.blue, 0.055, -0.015], ['Y', C.yellow, 0.07, -0.03]].map(([n, c, x, z]) => Cy(`Tasto ${n}`, 0.007, 0.01, [x, 0.058, z], c))]);

// ---------------------------------------------------------------- animali
const legs4 = (r, h, dx, dz, y0, color, foot) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => G(`Zampa ${i + 1}`, [
  Cy('Zampa', r, h, [sx * dx, y0 + h / 2, sz * dz], color), ...(foot ? [Cy('Zoccolo', r * 1.05, h * 0.12, [sx * dx, y0 + h * 0.06, sz * dz], foot)] : [])]));
const pig = () => G('Maiale', [
  G('Corpo', [Sp('Corpo', 0.3, [0, 0.48, 0], C.pink, [1, 0.85, 1.6]), Sp('Coda', 0.03, [0, 0.55, -0.48], C.pink)]),
  G('Testa', [Sp('Testa', 0.17, [0, 0.58, 0.48], C.pink), Cy('Grugno', 0.075, 0.07, [0, 0.54, 0.65], 0xe88a94, [90, 0, 0]),
    Sp('Narice sinistra', 0.012, [-0.025, 0.545, 0.687], C.brown), Sp('Narice destra', 0.012, [0.025, 0.545, 0.687], C.brown),
    Sp('Occhio sinistro', 0.018, [-0.07, 0.64, 0.61], C.black), Sp('Occhio destro', 0.018, [0.07, 0.64, 0.61], C.black),
    Co('Orecchio sinistro', 0.06, 0.1, [-0.11, 0.73, 0.45], C.pink, [-20, 0, 25]), Co('Orecchio destro', 0.06, 0.1, [0.11, 0.73, 0.45], C.pink, [-20, 0, -25])]),
  ...legs4(0.055, 0.3, 0.17, 0.3, 0, C.pink, C.brown),
]);
const dog = () => G('Cane', [
  G('Corpo', [Sp('Corpo', 0.2, [0, 0.45, 0], C.wood, [1, 0.9, 1.7]), Cy('Coda', 0.02, 0.25, [0, 0.58, -0.4], C.wood, [-50, 0, 0])]),
  G('Testa', [Sp('Testa', 0.13, [0, 0.66, 0.36], C.wood), Sp('Muso', 0.07, [0, 0.63, 0.48], C.cream, [1, 0.8, 1.3]), Sp('Naso', 0.025, [0, 0.66, 0.56], C.black),
    Sp('Occhio sinistro', 0.016, [-0.05, 0.71, 0.46], C.black), Sp('Occhio destro', 0.016, [0.05, 0.71, 0.46], C.black),
    Sp('Orecchio sinistro', 0.05, [-0.11, 0.65, 0.33], C.brown, [0.5, 1.5, 0.9]), Sp('Orecchio destro', 0.05, [0.11, 0.65, 0.33], C.brown, [0.5, 1.5, 0.9])]),
  ...legs4(0.04, 0.32, 0.11, 0.22, 0, C.wood, C.cream),
]);
const cat = () => G('Gatto', [
  G('Corpo', [Sp('Corpo', 0.12, [0, 0.24, 0], C.gray, [1, 0.9, 1.7]), Cy('Coda', 0.015, 0.3, [0, 0.38, -0.27], C.gray, [-40, 0, 0])]),
  G('Testa', [Sp('Testa', 0.085, [0, 0.36, 0.2], C.gray), Co('Orecchio sinistro', 0.03, 0.06, [-0.045, 0.44, 0.19], C.gray), Co('Orecchio destro', 0.03, 0.06, [0.045, 0.44, 0.19], C.gray),
    Sp('Occhio sinistro', 0.014, [-0.032, 0.375, 0.27], 0x9fd84a), Sp('Occhio destro', 0.014, [0.032, 0.375, 0.27], 0x9fd84a), Sp('Naso', 0.008, [0, 0.35, 0.285], C.pink)]),
  ...legs4(0.022, 0.17, 0.06, 0.12, 0, C.gray, C.white),
]);
const cow = () => G('Mucca', [
  G('Corpo', [B('Corpo', [0.6, 0.6, 1.4], [0, 1.0, 0], C.white), Sp('Macchia 1', 0.2, [0.25, 1.1, 0.2], C.black, [0.4, 1, 1]), Sp('Macchia 2', 0.25, [-0.25, 1.0, -0.3], C.black, [0.4, 1, 1]),
    Sp('Mammella', 0.12, [0, 0.66, -0.35], C.pink), Cy('Coda', 0.02, 0.6, [0, 0.95, -0.72], C.white, [-15, 0, 0])]),
  G('Testa', [B('Testa', [0.3, 0.35, 0.4], [0, 1.25, 0.85], C.white), B('Muso', [0.28, 0.18, 0.12], [0, 1.15, 1.08], C.pink),
    Co('Corno sinistro', 0.03, 0.15, [-0.14, 1.48, 0.8], C.cream, [0, 0, 30]), Co('Corno destro', 0.03, 0.15, [0.14, 1.48, 0.8], C.cream, [0, 0, -30]),
    Sp('Occhio sinistro', 0.025, [-0.1, 1.33, 1.05], C.black), Sp('Occhio destro', 0.025, [0.1, 1.33, 1.05], C.black)]),
  ...legs4(0.07, 0.7, 0.2, 0.5, 0, C.white, C.black),
]);
const penguin = () => G('Pinguino', [
  Sp('Corpo', 0.18, [0, 0.3, 0], C.black, [1, 1.6, 0.9]), Sp('Pancia', 0.15, [0, 0.27, 0.06], C.white, [1, 1.5, 0.8]),
  Sp('Testa', 0.12, [0, 0.62, 0], C.black), Co('Becco', 0.03, 0.08, [0, 0.6, 0.14], C.orange, [90, 0, 0]),
  Sp('Occhio sinistro', 0.015, [-0.05, 0.65, 0.1], C.white), Sp('Occhio destro', 0.015, [0.05, 0.65, 0.1], C.white),
  Sp('Ala sinistra', 0.06, [-0.19, 0.32, 0], C.black, [0.4, 2, 1]), Sp('Ala destra', 0.06, [0.19, 0.32, 0], C.black, [0.4, 2, 1]),
  Sp('Piede sinistro', 0.05, [-0.07, 0.02, 0.06], C.orange, [1, 0.3, 1.5]), Sp('Piede destro', 0.05, [0.07, 0.02, 0.06], C.orange, [1, 0.3, 1.5]),
]);
const duck = () => G('Papera', [Sp('Corpo', 0.09, [0, 0.08, 0], C.yellow, [1, 0.8, 1.3]), Sp('Testa', 0.055, [0, 0.17, 0.07], C.yellow),
  Sp('Becco', 0.03, [0, 0.16, 0.13], C.orange, [1, 0.4, 1.3]), Sp('Occhio sinistro', 0.008, [-0.025, 0.185, 0.115], C.black), Sp('Occhio destro', 0.008, [0.025, 0.185, 0.115], C.black),
  Co('Coda', 0.03, 0.06, [0, 0.11, -0.11], C.yellow, [-60, 0, 0])]);

// ---------------------------------------------------------------- persone
const person = (name = 'Persona', shirt = C.blue, pants = C.dark) => G(name, [
  G('Testa', [Sp('Testa', 0.11, [0, 1.62, 0], C.skin, [1, 1.15, 1]), Sp('Capelli', 0.115, [0, 1.67, -0.01], C.brown, [1, 0.9, 1.05]),
    Sp('Occhio sinistro', 0.012, [-0.04, 1.64, 0.1], C.black), Sp('Occhio destro', 0.012, [0.04, 1.64, 0.1], C.black), Sp('Naso', 0.015, [0, 1.6, 0.11], C.skin),
    Cy('Collo', 0.045, 0.1, [0, 1.48, 0], C.skin)]),
  G('Busto', [B('Torace', [0.38, 0.55, 0.2], [0, 1.18, 0], shirt), B('Bacino', [0.34, 0.15, 0.2], [0, 0.88, 0], pants)]),
  G('Braccio sinistro', [Cy('Braccio', 0.045, 0.32, [-0.24, 1.26, 0], shirt), Cy('Avambraccio', 0.04, 0.28, [-0.24, 0.96, 0], C.skin), Sp('Mano', 0.045, [-0.24, 0.78, 0], C.skin)]),
  G('Braccio destro', [Cy('Braccio', 0.045, 0.32, [0.24, 1.26, 0], shirt), Cy('Avambraccio', 0.04, 0.28, [0.24, 0.96, 0], C.skin), Sp('Mano', 0.045, [0.24, 0.78, 0], C.skin)]),
  G('Gamba sinistra', [Cy('Coscia', 0.065, 0.42, [-0.09, 0.6, 0], pants), Cy('Polpaccio', 0.055, 0.4, [-0.09, 0.22, 0], pants), B('Scarpa', [0.1, 0.06, 0.24], [-0.09, 0.03, 0.04], C.black)]),
  G('Gamba destra', [Cy('Coscia', 0.065, 0.42, [0.09, 0.6, 0], pants), Cy('Polpaccio', 0.055, 0.4, [0.09, 0.22, 0], pants), B('Scarpa', [0.1, 0.06, 0.24], [0.09, 0.03, 0.04], C.black)]),
]);
const bone = C.cream;
const skeleton = () => G('Scheletro', [
  G('Cranio', [Sp('Cranio', 0.1, [0, 1.64, 0], bone, [1, 1.15, 1.1]), B('Mandibola', [0.12, 0.05, 0.1], [0, 1.52, 0.03], bone),
    Sp('Orbita sinistra', 0.025, [-0.04, 1.65, 0.09], C.black), Sp('Orbita destra', 0.025, [0.04, 1.65, 0.09], C.black), Cy('Naso', 0.012, 0.02, [0, 1.6, 0.1], C.black, [90, 0, 0])]),
  G('Colonna vertebrale', Array.from({ length: 12 }, (_, i) => Cy(`Vertebra ${i + 1}`, 0.022, 0.03, [0, 0.95 + i * 0.045, -0.04], bone))),
  G('Gabbia toracica', Array.from({ length: 6 }, (_, i) => To(`Costola ${i + 1}`, 0.13 - Math.abs(i - 2) * 0.01, 0.008, [0, 1.12 + i * 0.05, 0.02], bone, [0, 0, 0]))
    .concat([B('Sterno', [0.03, 0.22, 0.015], [0, 1.25, 0.14], bone), Cy('Clavicola', 0.01, 0.34, [0, 1.42, 0.02], bone, [0, 0, 90])])),
  G('Bacino', [To('Bacino', 0.11, 0.025, [0, 0.9, 0], bone, [70, 0, 0])]),
  ...[-1, 1].map((s) => G(s < 0 ? 'Braccio sinistro' : 'Braccio destro', [Cy('Omero', 0.014, 0.3, [s * 0.2, 1.25, 0], bone), Cy('Radio', 0.011, 0.26, [s * 0.2, 0.96, 0], bone),
    Sp('Mano', 0.035, [s * 0.2, 0.8, 0], bone, [0.6, 1.2, 0.4])])),
  ...[-1, 1].map((s) => G(s < 0 ? 'Gamba sinistra' : 'Gamba destra', [Cy('Femore', 0.018, 0.42, [s * 0.09, 0.62, 0], bone), Sp('Rotula', 0.022, [s * 0.09, 0.41, 0.02], bone),
    Cy('Tibia', 0.015, 0.38, [s * 0.09, 0.21, 0], bone), B('Piede', [0.07, 0.03, 0.18], [s * 0.09, 0.015, 0.04], bone)])),
]);
const robot = () => G('Robot', [
  G('Testa', [B('Testa', [0.25, 0.22, 0.22], [0, 1.6, 0], C.light), B('Visore', [0.2, 0.06, 0.01], [0, 1.62, 0.111], C.blue), Cy('Antenna', 0.008, 0.12, [0, 1.77, 0], C.gray), Sp('Luce', 0.02, [0, 1.84, 0], C.red)]),
  G('Corpo', [B('Torace', [0.45, 0.5, 0.25], [0, 1.18, 0], C.steel), Cy('Nucleo', 0.06, 0.02, [0, 1.25, 0.13], C.glass, [90, 0, 0]), B('Bacino', [0.35, 0.15, 0.22], [0, 0.85, 0], C.dark)]),
  ...[-1, 1].map((s) => G(s < 0 ? 'Braccio sinistro' : 'Braccio destro', [Sp('Spalla', 0.07, [s * 0.3, 1.38, 0], C.dark), Cy('Braccio', 0.05, 0.5, [s * 0.3, 1.1, 0], C.steel), B('Pinza', [0.08, 0.1, 0.06], [s * 0.3, 0.8, 0], C.dark)])),
  ...[-1, 1].map((s) => G(s < 0 ? 'Gamba sinistra' : 'Gamba destra', [Cy('Gamba', 0.07, 0.7, [s * 0.11, 0.42, 0], C.steel), B('Piede', [0.14, 0.07, 0.25], [s * 0.11, 0.035, 0.04], C.dark)])),
]);
const astronaut = () => {
  const a = person('Astronauta', C.white, C.white);
  const helmet = createPart('sphere', { r: 0.17 }, 0xe8eef5, 'Casco');
  helmet.position.set(0, 1.62, 0);
  const visor = createPart('sphere', { r: 0.13 }, 0xd4af37, 'Visiera');
  visor.position.set(0, 1.62, 0.07); visor.scale.set(1, 0.8, 0.6);
  const pack = createPart('box', { w: 0.35, h: 0.5, d: 0.18 }, C.light, 'Zaino');
  pack.position.set(0, 1.2, -0.2);
  a.add(createAssembly('Equipaggiamento', [helmet, visor, pack]));
  return a;
};

// ---------------------------------------------------------------- veicoli
const wheel = (name, x, y, z, r, w, tire = C.black, rim = C.steel) => G(name, [Cy('Pneumatico', r, w, [x, y, z], tire, [0, 0, 90]), Cy('Cerchione', r * 0.6, w * 1.05, [x, y, z], rim, [0, 0, 90])]);
const car = () => G('Automobile', [
  G('Carrozzeria', [B('Scocca', [1.8, 0.55, 4.2], [0, 0.6, 0], C.red), B('Abitacolo', [1.6, 0.5, 2.1], [0, 1.12, -0.2], C.red),
    B('Parabrezza', [1.5, 0.45, 0.04], [0, 1.1, 0.88], C.glass, [-30, 0, 0]), B('Lunotto', [1.5, 0.4, 0.04], [0, 1.1, -1.28], C.glass, [30, 0, 0]),
    B('Finestrino sinistro', [0.02, 0.35, 1.8], [-0.81, 1.15, -0.2], C.glass), B('Finestrino destro', [0.02, 0.35, 1.8], [0.81, 1.15, -0.2], C.glass)]),
  G('Luci', [Sp('Faro sinistro', 0.1, [-0.6, 0.7, 2.08], C.white, [1.3, 0.8, 0.4]), Sp('Faro destro', 0.1, [0.6, 0.7, 2.08], C.white, [1.3, 0.8, 0.4]),
    B('Fanale sinistro', [0.3, 0.1, 0.03], [-0.6, 0.75, -2.1], C.red), B('Fanale destro', [0.3, 0.1, 0.03], [0.6, 0.75, -2.1], C.red)]),
  G('Ruote', [wheel('Ruota ant. sx', -0.85, 0.33, 1.35, 0.33, 0.24), wheel('Ruota ant. dx', 0.85, 0.33, 1.35, 0.33, 0.24),
    wheel('Ruota post. sx', -0.85, 0.33, -1.35, 0.33, 0.24), wheel('Ruota post. dx', 0.85, 0.33, -1.35, 0.33, 0.24)]),
]);
const scooter = () => G('Scooter', [
  G('Telaio', [B('Pedana', [0.32, 0.08, 0.8], [0, 0.32, 0], C.light), B('Scudo', [0.4, 0.6, 0.1], [0, 0.65, 0.42], C.blue, [-15, 0, 0]),
    B('Sella', [0.3, 0.12, 0.55], [0, 0.82, -0.35], C.black), B('Carrozzeria posteriore', [0.36, 0.42, 0.6], [0, 0.55, -0.35], C.blue)]),
  G('Sterzo', [Cy('Piantone', 0.025, 0.55, [0, 0.95, 0.45], C.steel, [-15, 0, 0]), Cy('Manubrio', 0.02, 0.6, [0, 1.2, 0.5], C.dark, [0, 0, 90]), Sp('Faro', 0.06, [0, 1.12, 0.56], C.white)]),
  G('Ruote', [wheel('Ruota anteriore', 0, 0.2, 0.62, 0.2, 0.1), wheel('Ruota posteriore', 0, 0.2, -0.55, 0.2, 0.12)]),
]);
const bike = () => G('Bicicletta', [
  G('Ruote', [To('Ruota anteriore', 0.33, 0.02, [0, 0.35, 0.55], C.black, [0, 90, 0]), To('Ruota posteriore', 0.33, 0.02, [0, 0.35, -0.5], C.black, [0, 90, 0])]),
  G('Telaio', [Cy('Tubo orizzontale', 0.018, 0.65, [0, 0.75, 0.05], C.red, [80, 0, 0]), Cy('Tubo obliquo', 0.02, 0.7, [0, 0.55, 0.25], C.red, [-55, 0, 0]),
    Cy('Tubo sella', 0.018, 0.5, [0, 0.6, -0.18], C.red, [-15, 0, 0]), Cy('Forcella', 0.015, 0.45, [0, 0.55, 0.5], C.steel, [-15, 0, 0])]),
  G('Comandi', [B('Sella', [0.12, 0.05, 0.25], [0, 0.9, -0.23], C.black), Cy('Manubrio', 0.015, 0.55, [0, 0.95, 0.44], C.dark, [0, 0, 90]), Cy('Pedali', 0.08, 0.02, [0, 0.33, 0], C.dark, [0, 0, 90])]),
]);
const plane = () => G('Aereo', [
  G('Fusoliera', [Cy('Fusoliera', 0.6, 8, [0, 1.6, 0], C.white, [90, 0, 0]), Co('Muso', 0.6, 1.2, [0, 1.6, 4.6], C.white, [90, 0, 0]), Co('Coda', 0.6, 1.5, [0, 1.75, -4.75], C.white, [-90, 0, 0]),
    B('Cabina', [0.9, 0.3, 0.6], [0, 1.95, 3.9], C.glass)]),
  G('Ali', [B('Ala sinistra', [5, 0.15, 1.6], [-2.8, 1.4, 0.4], C.light, [0, 15, 0]), B('Ala destra', [5, 0.15, 1.6], [2.8, 1.4, 0.4], C.light, [0, -15, 0]),
    Cy('Motore sinistro', 0.35, 1.4, [-2.2, 1.0, 0.8], C.gray, [90, 0, 0]), Cy('Motore destro', 0.35, 1.4, [2.2, 1.0, 0.8], C.gray, [90, 0, 0])]),
  G('Impennaggi', [B('Deriva', [0.12, 1.6, 1.2], [0, 2.6, -4.3], C.blue), B('Stabilizzatore', [3, 0.1, 0.8], [0, 1.85, -4.4], C.light)]),
  G('Carrello', [Cy('Ruota anteriore', 0.2, 0.15, [0, 0.2, 3.5], C.black, [0, 0, 90]), Cy('Ruota sinistra', 0.25, 0.2, [-1, 0.25, 0], C.black, [0, 0, 90]), Cy('Ruota destra', 0.25, 0.2, [1, 0.25, 0], C.black, [0, 0, 90])]),
]);
const heli = () => G('Elicottero', [
  G('Cabina', [Sp('Cabina', 1, [0, 1.3, 0.5], C.yellow, [1, 0.9, 1.5]), Sp('Vetro', 0.7, [0, 1.45, 1.4], C.glass, [1, 0.8, 0.7]), Cy('Trave di coda', 0.15, 4, [0, 1.5, -2.5], C.yellow, [90, 0, 0])]),
  G('Rotore', [Cy('Albero', 0.08, 0.5, [0, 2.4, 0.4], C.gray), B('Pala 1', [7, 0.04, 0.3], [0, 2.65, 0.4], C.dark), B('Pala 2', [0.3, 0.04, 7], [0, 2.65, 0.4], C.dark),
    B('Rotore di coda', [0.05, 1.2, 0.15], [0.2, 1.8, -4.4], C.dark)]),
  G('Pattini', [Cy('Pattino sinistro', 0.05, 3, [-0.7, 0.05, 0.4], C.gray, [90, 0, 0]), Cy('Pattino destro', 0.05, 3, [0.7, 0.05, 0.4], C.gray, [90, 0, 0])]),
]);
const boat = () => G('Barca', [B('Scafo', [1.8, 0.7, 5], [0, 0.35, 0], C.white), Co('Prua', 0.9, 1.2, [0, 0.35, 3.1], C.white, [90, 0, 45], 4),
  B('Ponte', [1.6, 0.05, 4.6], [0, 0.72, 0], C.wood), B('Cabina', [1.2, 0.8, 1.6], [0, 1.15, -0.8], C.light),
  Cy('Albero', 0.06, 5, [0, 3.2, 0.6], C.wood), Co('Vela', 1.6, 4, [0, 3.0, 0.5], C.white, [0, 90, 0], 3)]);
const truck = () => G('Camion', [
  G('Motrice', [B('Cabina', [2.4, 2.4, 2.2], [0, 1.9, 3.2], C.blue), B('Parabrezza', [2.2, 0.9, 0.04], [0, 2.5, 4.31], C.glass), B('Griglia', [2, 0.6, 0.05], [0, 1.2, 4.32], C.steel)]),
  G('Rimorchio', [B('Cassone', [2.5, 2.8, 7], [0, 2.1, -1.6], C.white)]),
  G('Ruote', [[-1.1, 3.2], [1.1, 3.2], [-1.1, -0.5], [1.1, -0.5], [-1.1, -3.5], [1.1, -3.5]].map(([x, z], i) => wheel(`Ruota ${i + 1}`, x, 0.5, z, 0.5, 0.4))),
]);

// ---------------------------------------------------------------- casa e mobili
const bed = () => G('Letto', [
  G('Struttura', [B('Telaio', [1.6, 0.25, 2.05], [0, 0.25, 0], C.wood), B('Testiera', [1.6, 0.8, 0.08], [0, 0.65, -1.03], C.wood),
    ...[[-0.75, -0.95], [0.75, -0.95], [-0.75, 0.95], [0.75, 0.95]].map(([x, z], i) => B(`Piede ${i + 1}`, [0.08, 0.15, 0.08], [x, 0.075, z], C.brown))]),
  G('Materasso e cuscini', [B('Materasso', [1.5, 0.22, 1.95], [0, 0.48, 0.02], C.white), Sp('Cuscino sinistro', 0.18, [-0.4, 0.63, -0.75], C.white, [1.6, 0.4, 0.8]),
    Sp('Cuscino destro', 0.18, [0.4, 0.63, -0.75], C.white, [1.6, 0.4, 0.8]), B('Coperta', [1.55, 0.04, 1.3], [0, 0.61, 0.35], C.blue)]),
]);
const sofa = () => G('Divano', [B('Base', [2, 0.4, 0.9], [0, 0.25, 0], C.gray), B('Schienale', [2, 0.5, 0.2], [0, 0.65, -0.35], C.gray),
  B('Bracciolo sinistro', [0.2, 0.3, 0.9], [-0.9, 0.55, 0], C.gray), B('Bracciolo destro', [0.2, 0.3, 0.9], [0.9, 0.55, 0], C.gray),
  ...[-0.4, 0.4].map((x, i) => B(`Cuscino ${i + 1}`, [0.75, 0.12, 0.65], [x, 0.51, 0.05], C.light)),
  ...[[-0.9, -0.35], [0.9, -0.35], [-0.9, 0.35], [0.9, 0.35]].map(([x, z], i) => Cy(`Piede ${i + 1}`, 0.03, 0.05, [x, 0.025, z], C.black))]);
const table = () => G('Tavolo', [B('Piano', [1.6, 0.05, 0.9], [0, 0.75, 0], C.wood),
  ...[[-0.72, -0.37], [0.72, -0.37], [-0.72, 0.37], [0.72, 0.37]].map(([x, z], i) => B(`Gamba ${i + 1}`, [0.06, 0.73, 0.06], [x, 0.365, z], C.brown))]);
const wardrobe = () => G('Armadio', [B('Corpo', [1.2, 2, 0.6], [0, 1, 0], C.wood), B('Anta sinistra', [0.58, 1.9, 0.02], [-0.3, 1, 0.31], C.brown), B('Anta destra', [0.58, 1.9, 0.02], [0.3, 1, 0.31], C.brown),
  Cy('Maniglia sinistra', 0.01, 0.2, [-0.05, 1.05, 0.33], C.gold), Cy('Maniglia destra', 0.01, 0.2, [0.05, 1.05, 0.33], C.gold)]);
const bookshelf = () => {
  const books = [];
  for (let s = 0; s < 4; s++) for (let i = 0; i < 9; i++) books.push(B(`Libro ${s * 9 + i + 1}`, [0.06, 0.24 + ((i * 7) % 5) * 0.015, 0.2], [-0.42 + i * 0.1, 0.22 + s * 0.45, 0], [C.red, C.blue, C.green, C.yellow, C.purple, C.orange][(i + s) % 6]));
  return G('Libreria', [G('Mobile', [B('Fianco sinistro', [0.03, 1.8, 0.3], [-0.5, 0.9, 0], C.wood), B('Fianco destro', [0.03, 1.8, 0.3], [0.5, 0.9, 0], C.wood),
    ...[0, 1, 2, 3, 4].map((i) => B(`Ripiano ${i + 1}`, [1, 0.03, 0.3], [0, 0.08 + i * 0.45, 0], C.wood))]), G('Libri', books)]);
};
const fridge = () => G('Frigorifero', [B('Corpo', [0.7, 1.8, 0.7], [0, 0.9, 0], C.white), B('Porta freezer', [0.68, 0.55, 0.03], [0, 1.5, 0.36], C.light), B('Porta frigo', [0.68, 1.15, 0.03], [0, 0.62, 0.36], C.light),
  Cy('Maniglia alta', 0.012, 0.3, [0.28, 1.5, 0.39], C.steel), Cy('Maniglia bassa', 0.012, 0.4, [0.28, 0.9, 0.39], C.steel)]);
const floorLamp = () => G('Lampada da terra', [Cy('Base', 0.15, 0.03, [0, 0.015, 0], C.black), Cy('Asta', 0.012, 1.55, [0, 0.8, 0], C.steel),
  Co('Paralume', 0.22, 0.3, [0, 1.65, 0], C.cream, [180, 0, 0]), Sp('Lampadina', 0.04, [0, 1.6, 0], 0xfff3c0)]);
const house = () => G('Casa', [
  G('Muri', [B('Muro frontale', [8, 3, 0.2], [0, 1.5, 3], C.cream), B('Muro posteriore', [8, 3, 0.2], [0, 1.5, -3], C.cream),
    B('Muro sinistro', [0.2, 3, 6], [-4, 1.5, 0], C.cream), B('Muro destro', [0.2, 3, 6], [4, 1.5, 0], C.cream), B('Pavimento', [8, 0.1, 6], [0, 0.05, 0], C.wood)]),
  G('Tetto', [Co('Tetto', 6, 2.5, [0, 4.25, 0], C.red, [0, 45, 0], 4), B('Comignolo', [0.5, 1.2, 0.5], [2, 4.4, -1], C.dark)]),
  G('Infissi', [B('Porta', [1, 2.1, 0.08], [0, 1.05, 3.1], C.brown), Sp('Maniglia', 0.04, [0.35, 1.05, 3.16], C.gold),
    B('Finestra sinistra', [1.2, 1, 0.06], [-2.5, 1.7, 3.1], C.glass), B('Finestra destra', [1.2, 1, 0.06], [2.5, 1.7, 3.1], C.glass),
    B('Finestra laterale', [0.06, 1, 1.4], [4.1, 1.7, 0], C.glass)]),
]);

// ---------------------------------------------------------------- cibo
const pizza = () => {
  const toppings = [];
  for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.04 + (i % 3) * 0.035; toppings.push(Cy(`Salame ${i + 1}`, 0.022, 0.004, [Math.cos(a) * r, 0.018, Math.sin(a) * r], 0xb83a2a)); }
  for (let i = 0; i < 6; i++) { const a = i * 1.1 + 0.5, r = 0.09; toppings.push(Sp(`Basilico ${i + 1}`, 0.012, [Math.cos(a) * r, 0.018, Math.sin(a) * r], C.leaf, [1, 0.2, 0.6])); }
  return G('Pizza', [G('Base', [Cy('Impasto', 0.16, 0.012, [0, 0.006, 0], 0xe8c27a), To('Cornicione', 0.155, 0.012, [0, 0.012, 0], 0xd9a650)]),
    G('Condimento', [Cy('Pomodoro', 0.145, 0.003, [0, 0.0135, 0], 0xc8331f), Cy('Mozzarella', 0.13, 0.003, [0, 0.0155, 0], 0xfff4dc), ...toppings])]);
};
const burger = () => G('Hamburger', [Sp('Pane sotto', 0.06, [0, 0.015, 0], 0xd9a650, [1, 0.35, 1]), Cy('Carne', 0.058, 0.02, [0, 0.04, 0], C.brown),
  Cy('Formaggio', 0.06, 0.004, [0, 0.052, 0], C.yellow, [0, 0, 0], 4), Cy('Insalata', 0.064, 0.006, [0, 0.058, 0], C.leaf), Cy('Pomodoro', 0.055, 0.008, [0, 0.066, 0], C.red),
  Sp('Pane sopra', 0.062, [0, 0.075, 0], 0xd9a650, [1, 0.6, 1])]);
const cake = () => G('Torta', [Cy('Piano 1', 0.15, 0.08, [0, 0.04, 0], C.cream), Cy('Glassa 1', 0.152, 0.01, [0, 0.085, 0], C.pink), Cy('Piano 2', 0.1, 0.07, [0, 0.125, 0], C.cream),
  Cy('Glassa 2', 0.102, 0.01, [0, 0.165, 0], C.pink), ...[0, 1, 2, 3, 4].map((i) => Cy(`Candelina ${i + 1}`, 0.005, 0.05, [Math.cos(i * 1.26) * 0.06, 0.195, Math.sin(i * 1.26) * 0.06], [C.blue, C.yellow, C.green, C.red, C.purple][i])),
  Sp('Fragola', 0.018, [0, 0.18, 0], C.red)]);
const apple = () => G('Mela', [Sp('Mela', 0.04, [0, 0.04, 0], C.red, [1, 0.92, 1]), Cy('Picciolo', 0.003, 0.02, [0, 0.085, 0], C.brown), Sp('Foglia', 0.012, [0.012, 0.088, 0], C.leaf, [1.3, 0.2, 0.6])]);
const banana = () => G('Banana', Array.from({ length: 6 }, (_, i) => Sp(`Segmento ${i + 1}`, 0.018, [-0.075 + i * 0.03, 0.02 + Math.sin(i / 5 * Math.PI) * 0.03, 0], C.yellow, [1.4, 1, 1]))
  .concat([Cy('Picciolo', 0.006, 0.02, [-0.095, 0.03, 0], C.brown, [0, 0, 60])]));
const donut = () => G('Ciambella', [To('Impasto', 0.045, 0.022, [0, 0.022, 0], 0xd9a650), To('Glassa', 0.045, 0.019, [0, 0.03, 0], C.pink, [0, 0, 0])]);
const icecream = () => G('Gelato', [Co('Cono', 0.035, 0.12, [0, 0.06, 0], 0xd9a650, [180, 0, 0]), Sp('Pallina fragola', 0.035, [0, 0.13, 0], C.pink), Sp('Pallina cioccolato', 0.032, [0, 0.18, 0], C.brown)]);
const coffee = () => G('Tazza di caffè', [Tu('Tazza', 0.04, 0.035, 0.08, [0, 0.04, 0], C.white), Cy('Fondo', 0.04, 0.005, [0, 0.0025, 0], C.white),
  To('Manico', 0.022, 0.006, [0.048, 0.045, 0], C.white, [90, 0, 0]), Cy('Caffè', 0.035, 0.003, [0, 0.065, 0], C.brown), Cy('Piattino', 0.07, 0.006, [0, 0.003, 0], C.white)]);

// ---------------------------------------------------------------- oggetti e armi
const pistol = () => G('Pistola', [G('Carrello', [B('Carrello', [0.03, 0.035, 0.19], [0, 0.11, 0.02], C.dark), Cy('Canna', 0.008, 0.02, [0, 0.11, 0.12], C.black, [90, 0, 0])]),
  G('Impugnatura', [B('Impugnatura', [0.028, 0.11, 0.045], [0, 0.05, -0.05], C.black, [-15, 0, 0]), To('Ponticello', 0.018, 0.003, [0, 0.08, 0.0], C.dark, [0, 90, 0]),
    B('Grilletto', [0.005, 0.02, 0.006], [0, 0.08, 0.0], C.gray)])]);
const sword = () => G('Spada', [B('Lama', [0.05, 0.8, 0.008], [0, 0.55, 0], C.steel), Co('Punta', 0.025, 0.08, [0, 0.99, 0], C.steel, [0, 0, 0], 4),
  B('Elsa', [0.22, 0.03, 0.03], [0, 0.14, 0], C.gold), Cy('Impugnatura', 0.016, 0.12, [0, 0.07, 0], C.brown), Sp('Pomolo', 0.022, [0, 0.0, 0], C.gold)]);
const shield = () => G('Scudo', [Cy('Scudo', 0.3, 0.03, [0, 0.31, 0], C.blue, [90, 0, 0]), To('Bordo', 0.3, 0.015, [0, 0.31, 0], C.gold, [0, 0, 0]), Cy('Umbone', 0.08, 0.04, [0, 0.31, 0.03], C.gold, [90, 0, 0])]);
const hammer = () => G('Martello', [Cy('Manico', 0.015, 0.3, [0, 0.15, 0], C.wood), B('Testa', [0.12, 0.04, 0.04], [0, 0.31, 0], C.dark)]);
const guitar = () => G('Chitarra', [G('Cassa', [Sp('Cassa inferiore', 0.2, [0, 0.25, 0], C.wood, [1, 1, 0.25]), Sp('Cassa superiore', 0.15, [0, 0.52, 0], C.wood, [1, 1, 0.25]),
  Cy('Buca', 0.05, 0.01, [0, 0.42, 0.05], C.black, [90, 0, 0]), B('Ponte', [0.1, 0.015, 0.01], [0, 0.2, 0.05], C.brown)]),
  G('Manico', [B('Manico', [0.05, 0.55, 0.02], [0, 0.9, 0.02], C.brown), B('Paletta', [0.08, 0.15, 0.02], [0, 1.24, 0.02], C.brown),
    ...Array.from({ length: 6 }, (_, i) => B(`Corda ${i + 1}`, [0.0015, 0.95, 0.002], [-0.02 + i * 0.008, 0.68, 0.055], C.steel))])]);
const ball = () => G('Pallone', [Sp('Pallone', 0.11, [0, 0.11, 0], C.white), ...Array.from({ length: 8 }, (_, i) => Sp(`Pentagono ${i + 1}`, 0.03,
  [Math.cos(i * 0.8) * 0.1 * Math.cos(i * 1.7), 0.11 + Math.sin(i * 1.7) * 0.1, Math.sin(i * 0.8) * 0.1 * Math.cos(i * 1.7)], C.black, [1, 1, 0.3]))]);
const trophy = () => G('Trofeo', [B('Base', [0.12, 0.05, 0.12], [0, 0.025, 0], C.black), Cy('Stelo', 0.012, 0.08, [0, 0.09, 0], C.gold), Co('Coppa', 0.07, 0.12, [0, 0.19, 0], C.gold, [180, 0, 0]),
  To('Manico sinistro', 0.03, 0.006, [-0.07, 0.2, 0], C.gold, [90, 0, 0]), To('Manico destro', 0.03, 0.006, [0.07, 0.2, 0], C.gold, [90, 0, 0])]);

// ---------------------------------------------------------------- natura
const tree = () => G('Albero', [Cy('Tronco', 0.18, 2.4, [0, 1.2, 0], C.brown), Sp('Chioma 1', 1.1, [0, 3, 0], C.leaf), Sp('Chioma 2', 0.8, [0.7, 2.6, 0.3], C.leaf), Sp('Chioma 3', 0.8, [-0.6, 2.7, -0.3], 0x4a9a42)]);
const palm = () => G('Palma', [...Array.from({ length: 8 }, (_, i) => Cy(`Tronco ${i + 1}`, 0.14 - i * 0.008, 0.45, [Math.sin(i * 0.3) * 0.15, 0.22 + i * 0.44, 0], 0x9a7a4a)),
  ...Array.from({ length: 7 }, (_, i) => Sp(`Foglia ${i + 1}`, 0.8, [Math.cos(i * 0.9) * 0.7, 3.5, Math.sin(i * 0.9) * 0.7], C.leaf, [1, 0.08, 0.3])),
  ...[0, 1, 2].map((i) => Sp(`Cocco ${i + 1}`, 0.09, [Math.cos(i * 2) * 0.15, 3.4, Math.sin(i * 2) * 0.15], C.brown))]);
const flower = () => G('Fiore', [Cy('Stelo', 0.006, 0.4, [0, 0.2, 0], C.leaf), Sp('Foglia', 0.04, [0.03, 0.15, 0], C.leaf, [1, 0.2, 0.5]),
  Sp('Centro', 0.03, [0, 0.42, 0], C.yellow), ...Array.from({ length: 8 }, (_, i) => Sp(`Petalo ${i + 1}`, 0.03, [Math.cos(i * 0.785) * 0.05, 0.42, Math.sin(i * 0.785) * 0.05], C.red, [1.4, 0.3, 0.8]))]);
const cactus = () => G('Cactus', [Tu('Vaso', 0.1, 0.085, 0.15, [0, 0.075, 0], 0xb5562c), Cy('Terra', 0.088, 0.01, [0, 0.14, 0], C.brown), Cy('Fusto', 0.05, 0.35, [0, 0.32, 0], C.leaf),
  Cy('Braccio sinistro', 0.03, 0.15, [-0.08, 0.38, 0], C.leaf), Cy('Braccio destro', 0.03, 0.12, [0.08, 0.42, 0], C.leaf), Sp('Fiore', 0.025, [0, 0.5, 0], C.pink)]);
const mushroom = () => G('Fungo', [Cy('Gambo', 0.05, 0.2, [0, 0.1, 0], C.cream), Sp('Cappello', 0.15, [0, 0.21, 0], C.red, [1, 0.55, 1]),
  ...Array.from({ length: 6 }, (_, i) => Sp(`Puntino ${i + 1}`, 0.02, [Math.cos(i) * 0.08, 0.27, Math.sin(i) * 0.08], C.white, [1, 0.4, 1]))]);
const rock = () => G('Roccia', [Sp('Masso', 0.4, [0, 0.3, 0], C.gray, [1.3, 0.8, 1]), Sp('Sasso', 0.2, [0.45, 0.15, 0.2], 0x7a7f86, [1, 0.7, 1.2])]);

/** Categorie per il menu e per i comandi. size = ingombro massimo reale (m), calcolato al bisogno. */
export const CATALOG = [
  { id: 'tech', label: 'Tecnologia', items: [
    { id: 'pc', label: 'PC fisso', build: pc, words: ['pc', 'computer', 'fisso', 'desktop', 'postazione'] },
    { id: 'laptop', label: 'Portatile', build: laptop, words: ['portatile', 'laptop', 'notebook', 'macbook'] },
    { id: 'projector', label: 'Proiettore', build: projector, words: ['proiettore', 'videoproiettore'] },
    { id: 'phone', label: 'Smartphone', build: phone, words: ['telefono', 'smartphone', 'cellulare', 'iphone'] },
    { id: 'tv', label: 'Televisore', build: tv, words: ['televisore', 'tv', 'televisione', 'tivu', 'schermo'] },
    { id: 'gamepad', label: 'Controller', build: controller, words: ['controller', 'joystick', 'joypad', 'gamepad', 'playstation', 'xbox'] },
  ] },
  { id: 'animals', label: 'Animali', items: [
    { id: 'pig', label: 'Maiale', build: pig, words: ['maiale', 'maialino', 'porco', 'suino', 'porcellino'] },
    { id: 'dog', label: 'Cane', build: dog, words: ['cane', 'cagnolino', 'cucciolo'] },
    { id: 'cat', label: 'Gatto', build: cat, words: ['gatto', 'gattino', 'micio'] },
    { id: 'cow', label: 'Mucca', build: cow, words: ['mucca', 'vacca', 'bovino'] },
    { id: 'penguin', label: 'Pinguino', build: penguin, words: ['pinguino'] },
    { id: 'duck', label: 'Papera', build: duck, words: ['papera', 'paperella', 'anatra', 'papero'] },
  ] },
  { id: 'people', label: 'Persone', items: [
    { id: 'person', label: 'Persona', build: () => person(), words: ['persona', 'uomo', 'umano', 'ragazzo', 'signore', 'manichino', 'omino', 'tizio'] },
    { id: 'woman', label: 'Donna', build: () => person('Donna', C.red, C.blue), words: ['donna', 'ragazza', 'signora'] },
    { id: 'skeleton', label: 'Scheletro', build: skeleton, words: ['scheletro', 'ossa', 'scheletrico'] },
    { id: 'robot', label: 'Robot', build: robot, words: ['robot', 'androide', 'automa', 'cyborg'] },
    { id: 'astronaut', label: 'Astronauta', build: astronaut, words: ['astronauta', 'cosmonauta'] },
  ] },
  { id: 'vehicles', label: 'Veicoli', items: [
    { id: 'car', label: 'Automobile', build: car, words: ['macchina', 'auto', 'automobile', 'vettura', 'ferrari', 'berlina'] },
    { id: 'scooter', label: 'Scooter', build: scooter, words: ['scooter', 'motorino', 'vespa', 'moto', 'motocicletta'] },
    { id: 'bike', label: 'Bicicletta', build: bike, words: ['bicicletta', 'bici', 'bike'] },
    { id: 'plane', label: 'Aereo', build: plane, words: ['aereo', 'aeroplano', 'jet', 'aviogetto'] },
    { id: 'heli', label: 'Elicottero', build: heli, words: ['elicottero'] },
    { id: 'boat', label: 'Barca', build: boat, words: ['barca', 'nave', 'veliero', 'barchetta'] },
    { id: 'truck', label: 'Camion', build: truck, words: ['camion', 'tir', 'furgone', 'autocarro'] },
  ] },
  { id: 'home', label: 'Casa', items: [
    { id: 'bed', label: 'Letto', build: bed, words: ['letto', 'lettino', 'materasso'] },
    { id: 'sofa', label: 'Divano', build: sofa, words: ['divano', 'sofa', 'poltrona'] },
    { id: 'table', label: 'Tavolo', build: table, words: ['tavolo', 'tavola', 'tavolino'] },
    { id: 'wardrobe', label: 'Armadio', build: wardrobe, words: ['armadio', 'guardaroba'] },
    { id: 'bookshelf', label: 'Libreria', build: bookshelf, words: ['libreria', 'scaffale', 'libri'] },
    { id: 'fridge', label: 'Frigorifero', build: fridge, words: ['frigorifero', 'frigo'] },
    { id: 'floorlamp', label: 'Lampada', build: floorLamp, words: ['lampada', 'lampadario', 'abatjour', 'piantana'] },
    { id: 'house', label: 'Casa', build: house, words: ['casa', 'villetta', 'abitazione', 'edificio', 'villa'] },
  ] },
  { id: 'food', label: 'Cibo', items: [
    { id: 'pizza', label: 'Pizza', build: pizza, words: ['pizza', 'pizzetta'] },
    { id: 'burger', label: 'Hamburger', build: burger, words: ['hamburger', 'panino', 'burger'] },
    { id: 'cake', label: 'Torta', build: cake, words: ['torta', 'dolce', 'compleanno'] },
    { id: 'apple', label: 'Mela', build: apple, words: ['mela', 'frutta'] },
    { id: 'banana', label: 'Banana', build: banana, words: ['banana'] },
    { id: 'donut', label: 'Ciambella', build: donut, words: ['ciambella', 'donut', 'bombolone'] },
    { id: 'icecream', label: 'Gelato', build: icecream, words: ['gelato', 'cono gelato'] },
    { id: 'coffee', label: 'Caffè', build: coffee, words: ['caffe', 'tazza', 'tazzina', 'cappuccino'] },
  ] },
  { id: 'items', label: 'Oggetti', items: [
    { id: 'pistol', label: 'Pistola', build: pistol, words: ['pistola', 'arma', 'rivoltella', 'revolver', 'fucile', 'blaster'] },
    { id: 'sword', label: 'Spada', build: sword, words: ['spada', 'katana', 'sciabola', 'lama'] },
    { id: 'shield', label: 'Scudo', build: shield, words: ['scudo'] },
    { id: 'hammer', label: 'Martello', build: hammer, words: ['martello', 'mazza'] },
    { id: 'guitar', label: 'Chitarra', build: guitar, words: ['chitarra'] },
    { id: 'ball', label: 'Pallone', build: ball, words: ['pallone', 'palla da calcio', 'calcio'] },
    { id: 'trophy', label: 'Trofeo', build: trophy, words: ['trofeo', 'coppa'] },
  ] },
  { id: 'nature', label: 'Natura', items: [
    { id: 'tree', label: 'Albero', build: tree, words: ['albero', 'quercia', 'pianta'] },
    { id: 'palm', label: 'Palma', build: palm, words: ['palma'] },
    { id: 'flower', label: 'Fiore', build: flower, words: ['fiore', 'fiori', 'tulipano', 'margherita di campo'] },
    { id: 'cactus', label: 'Cactus', build: cactus, words: ['cactus', 'cacto'] },
    { id: 'mushroom', label: 'Fungo', build: mushroom, words: ['fungo', 'funghetto'] },
    { id: 'rock', label: 'Roccia', build: rock, words: ['roccia', 'masso', 'sasso', 'pietra'] },
  ] },
];

export const ALL_ITEMS = CATALOG.flatMap((c) => c.items);
