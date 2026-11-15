/**
 * Luoghi completi pronti da una frase: «voglio essere in una casa abbandonata», «fai una camera da letto»…
 * Ogni luogo è una ricetta: com'è la stanza (materiali, luci, atmosfera, dettagli) e cosa c'è dentro
 * (oggetti veri del catalogo a grandezza reale, con posizione e rotazione nella stanza).
 *
 * Coordinate degli arredi: metri, nel sistema della stanza (x destra, z verso di te; la parete di fondo è a -D/2).
 * Tu e la scrivania state verso il lato vicino (z ≈ +1.5…+2.2): gli arredi stanno più in là.
 */
const R = Math.PI;
export const PRESETS = {
  camera: {
    label: 'camera da letto',
    words: /camera( da letto)?|stanza da letto|cameretta|la mia camera/,
    room: { size: [7, 7], height: 2.8, floor: 'parquet', walls: 'carta da parati', ceiling: true, lights: 'pannelli', light: 0.8, warm: 0.9,
      decor: { windows: 'giorno', door: true, paintings: 2, rug: '#7a3b4a' } },
    items: [['bed', -1.6, -2.3, 0], ['wardrobe', 2.9, -2.5, -R / 2], ['floorlamp', -3.0, -1.0, 0], ['bookshelf', 3.0, 0.2, -R / 2], ['guitar', -3.1, 0.3, R / 2]],
  },
  abbandonata: {
    label: 'casa abbandonata',
    words: /casa (abbandonata|infestata|stregata|diroccata|in rovina|degli orrori|horror)|casa dei fantasmi|villa abbandonata|posto abbandonato|edificio abbandonato|horror/,
    room: { size: [8, 9], height: 3, floor: 'legno vecchio', walls: 'carta rovinata', ceiling: true, lights: 'spente', light: 0.35, warm: 0.8,
      fog: ['#2a2622', 0.18], flicker: 0.8, decor: { windows: 'sbarrate', door: true, paintings: 1, cobwebs: true, debris: true, dust: true } },
    items: [['sofa', -2.2, -2.6, 0.3], ['table', 1.6, -1.8, 0.7], ['bookshelf', 3.4, -3.2, -R / 2 + 0.25], ['floorlamp', -3.4, -0.4, 0.2], ['skeleton', 2.6, -3.6, -0.6]],
  },
  salotto: {
    label: 'salotto',
    words: /salotto|soggiorno|salone|sala( da pranzo)?|living/,
    room: { size: [8, 8], height: 2.9, floor: 'parquet', walls: 'intonaco', ceiling: true, lights: 'pannelli', light: 1, warm: 0.7,
      decor: { windows: 'giorno', door: true, paintings: 3, rug: '#3e5a7a' } },
    items: [['sofa', 0, -2.6, 0], ['tv', 0, -0.9, R], ['table', 0, -1.7, 0], ['bookshelf', -3.5, -2, R / 2], ['floorlamp', 2.6, -3.2, 0], ['cat', 1.2, -2.2, 0.8]],
  },
  cucina: {
    label: 'cucina',
    words: /cucina|cucinino|angolo cottura/,
    room: { size: [6, 6], height: 2.8, floor: 'piastrelle', walls: 'piastrelle bianche', ceiling: true, lights: 'pannelli', light: 1.2, warm: 0.4,
      decor: { windows: 'giorno', door: true, counter: true } },
    items: [['fridge', 2.4, -2.5, 0], ['table', -0.8, -1.2, 0], ['pizza', -0.8, -1.2, 0, 0.78], ['coffee', -0.5, -1.0, 0, 0.78], ['cake', -1.1, -1.4, 0, 0.78]],
  },
  ufficio: {
    label: 'ufficio',
    words: /ufficio|studio( professionale)?|open space|coworking/,
    room: { size: [8, 7], height: 2.9, floor: 'moquette', walls: 'intonaco', ceiling: true, lights: 'pannelli', light: 1.2, warm: 0.2,
      decor: { windows: 'giorno', door: true, paintings: 1 } },
    items: [['table', -2, -2.2, 0], ['pc', -2, -2.4, 0, 0.75], ['table', 2, -2.2, 0], ['laptop', 2, -2.2, 0, 0.75], ['bookshelf', 3.4, -0.5, -R / 2], ['person', -2, -1.4, R]],
  },
  bagno: {
    label: 'bagno',
    words: /bagno|bagnetto|toilette|doccia/,
    room: { size: [5, 5], height: 2.7, floor: 'piastrelle azzurre', walls: 'piastrelle bianche', ceiling: true, lights: 'pannelli', light: 1.2, warm: 0.3,
      decor: { door: true, tub: true } },
    items: [],
  },
  castello: {
    label: 'castello',
    words: /castello|fortezza|maniero|sala del trono|medievale|cavalier/,
    room: { size: [12, 12], height: 7, floor: 'pietra', walls: 'pietra', ceiling: true, lights: 'spente', light: 0.7, warm: 1, columns: 8, colMat: 'pietra',
      flicker: 0.3, decor: { torches: 6, door: true, rug: '#7a1d24' } },
    items: [['shield', -4.5, -5.6, 0, 1.6], ['shield', 4.5, -5.6, 0, 1.6], ['sword', 0, -4.8, 0], ['trophy', 0, -5.2, 0]],
  },
  grotta: {
    label: 'grotta',
    words: /grotta|caverna|spelonca|miniera|sotterrane/,
    room: { size: [10, 10], height: 4, floor: 'roccia', walls: 'roccia', ceiling: true, lights: 'spente', light: 0.5, warm: 1, fog: ['#141210', 0.15], flicker: 0.4,
      decor: { torches: 4, debris: true, dust: true } },
    items: [['rock', -3, -3, 0.4], ['rock', 2.5, -3.5, 1.2], ['mushroom', -1.5, -2.5, 0], ['mushroom', 3, -1, 0], ['skeleton', 3.5, -4, -0.5]],
  },
  foresta: {
    label: 'foresta',
    words: /foresta|bosco|giungla|natura|parco|campagna|prato/,
    room: { size: [30, 30], height: 3, floor: 'erba', walls: null, ceiling: false, lights: 'pannelli', light: 1.3, warm: 0.6, fog: ['#b7d3e6', 0.025], sky: '#9cc8ee' },
    items: [['tree', -4, -5, 0], ['tree', 3.5, -6, 1], ['tree', -7, -2, 2], ['tree', 6, -3, 3], ['tree', -2, -9, 4], ['tree', 5, -10, 5], ['tree', 9, -7, 6], ['tree', -9, -8, 7],
      ['flower', -1, -2.5, 0], ['flower', 1.5, -3, 0], ['mushroom', -2.5, -3.5, 0], ['rock', 2.5, -4.5, 0], ['dog', 1, -2, 0.5]],
  },
  spiaggia: {
    label: 'spiaggia',
    words: /spiaggia|mare|lido|isola|tropical|caraib/,
    room: { size: [30, 30], height: 3, floor: 'sabbia', walls: null, ceiling: false, lights: 'pannelli', light: 1.5, warm: 0.8, sky: '#8ec5ff', decor: { sea: true } },
    items: [['palm', -4, -5, 0], ['palm', 5, -4, 1], ['palm', -7, -1, 2], ['ball', 1.5, -2.5, 0], ['boat', 2, -11, 0.4]],
  },
  discoteca: {
    label: 'discoteca',
    words: /discoteca|disco|festa|club|locale notturno|rave/,
    room: { size: [10, 10], height: 3.5, floor: 'nero', walls: 'nero', ceiling: true, lights: 'spente', light: 0.6, warm: 0.2, fog: ['#1a1030', 0.08],
      decor: { disco: true } },
    items: [['person', -1.5, -3, 0.4, 0, 'walk'], ['woman', 1.2, -2.6, -0.5, 0, 'walk'], ['person', 2.5, -4, 0.2, 0, 'walk'], ['woman', -2.8, -4.2, 0.8, 0, 'walk']],
  },
  ospedale: {
    label: 'ospedale',
    words: /ospedale|clinica|infermeria|pronto soccorso|corsia/,
    room: { size: [9, 8], height: 3, floor: 'piastrelle bianche', walls: 'intonaco', ceiling: true, lights: 'pannelli', light: 1.4, warm: 0, flicker: 0.1,
      decor: { windows: 'giorno', door: true } },
    items: [['bed', -2.5, -2.6, 0], ['bed', 0.5, -2.6, 0], ['bed', 3.2, -2.6, 0], ['person', 1.8, -1.2, R]],
  },
  aula: {
    label: 'aula',
    words: /aula|scuola|classe|universita|lezione/,
    room: { size: [9, 9], height: 3, floor: 'parquet', walls: 'intonaco', ceiling: true, lights: 'pannelli', light: 1.2, warm: 0.4,
      decor: { windows: 'giorno', door: true, board: true } },
    items: [['table', -2, -1.5, 0], ['table', 0, -1.5, 0], ['table', 2, -1.5, 0], ['table', -2, -0.2, 0], ['table', 2, -0.2, 0], ['bookshelf', 4, -3, -R / 2], ['person', 0, -3.6, 0]],
  },
  biblioteca: {
    label: 'biblioteca',
    words: /biblioteca|libreria antica|archivio/,
    room: { size: [10, 10], height: 4, floor: 'parquet', walls: 'legno', ceiling: true, lights: 'pannelli', light: 0.8, warm: 1,
      decor: { rug: '#4a2a1a', door: true } },
    items: [['bookshelf', -4.5, -4, R / 2], ['bookshelf', -4.5, -2, R / 2], ['bookshelf', -4.5, 0, R / 2], ['bookshelf', 4.5, -4, -R / 2], ['bookshelf', 4.5, -2, -R / 2], ['bookshelf', 4.5, 0, -R / 2],
      ['table', 0, -2.5, 0], ['floorlamp', 1.2, -3, 0]],
  },
  garage: {
    label: 'garage',
    words: /garage|officina meccanica|autofficina|box auto|capannone/,
    room: { size: [10, 10], height: 3.5, floor: 'cemento', walls: 'mattoni', ceiling: true, lights: 'pannelli', light: 1, warm: 0.3,
      decor: { door: true, debris: true } },
    items: [['car', -1.5, -2.8, 0.2], ['scooter', 2.5, -3.5, -0.4], ['bike', 3.8, -1.2, -R / 2], ['hammer', 3.2, -0.4, 0]],
  },
  prigione: {
    label: 'prigione',
    words: /prigione|cella|carcere|galera|segrete/,
    room: { size: [5, 5], height: 3, floor: 'cemento', walls: 'cemento', ceiling: true, lights: 'spente', light: 0.45, warm: 0.6, flicker: 0.5, fog: ['#1a1a18', 0.12],
      decor: { bars: true, debris: true } },
    items: [['bed', -1.6, -1.6, 0], ['skeleton', 1.4, -1.8, -0.6]],
  },
  chiesa: {
    label: 'chiesa',
    words: /chiesa|cattedrale|basilica|cappella|tempio/,
    room: { size: [12, 16], height: 9, floor: 'marmo', walls: 'pietra', ceiling: true, lights: 'pannelli', light: 0.7, warm: 1, columns: 10, colMat: 'marmo',
      decor: { windows: 'vetrate', rug: '#7a1d24', door: true } },
    items: [],
  },
  museo: {
    label: 'museo',
    words: /museo|galleria( d.?arte)?|mostra d.?arte|esposizione/,
    room: { size: [12, 12], height: 4.5, floor: 'marmo', walls: 'intonaco', ceiling: true, lights: 'pannelli', light: 1.3, warm: 0.5,
      decor: { paintings: 8, door: true } },
    items: [['skeleton', -2.5, -3.5, 0.4, 1.6], ['robot', 2.5, -3.5, -0.4], ['astronaut', 0, -5, 0], ['car', 3.5, -0.8, -R / 2]],
  },
  ristorante: {
    label: 'ristorante',
    words: /ristorante|pizzeria|trattoria|\bbar\b|caffetteria|pub|osteria/,
    room: { size: [10, 9], height: 3, floor: 'parquet', walls: 'mattoni', ceiling: true, lights: 'pannelli', light: 0.9, warm: 1,
      decor: { windows: 'notte', door: true, paintings: 2 } },
    items: [['table', -2.5, -2.5, 0], ['pizza', -2.5, -2.5, 0, 0.78], ['table', 0.5, -2.5, 0], ['burger', 0.5, -2.5, 0, 0.78], ['table', 3, -1, 0], ['coffee', 3, -1, 0, 0.78],
      ['person', 0.5, -3.3, 0], ['woman', -2.5, -3.3, 0]],
  },
  laboratorio: {
    label: 'laboratorio',
    words: /laboratorio|lab\b|centro di ricerca|base segreta|astronave|navicella/,
    room: { size: [9, 9], height: 3.2, floor: 'metallo', walls: 'metallo', ceiling: true, lights: 'pannelli', light: 1.2, warm: 0,
      decor: { door: true } },
    items: [['robot', -2.5, -3, 0.4], ['pc', 2.5, -3.4, 0], ['table', 2.5, -3.2, 0], ['astronaut', 0, -3.8, 0]],
  },
  fattoria: {
    label: 'fattoria',
    words: /fattoria|stalla|campagna con animali|aia|ranch/,
    room: { size: [30, 30], height: 3, floor: 'erba', walls: null, ceiling: false, lights: 'pannelli', light: 1.3, warm: 0.7, sky: '#a8d0f0' },
    items: [['house', -6, -9, 0.3], ['cow', -2, -4, 0.6, 0, 'walk'], ['pig', 2, -3.5, -0.4, 0, 'walk'], ['duck', 0.5, -2.5, 0, 0, 'walk'], ['dog', 3, -2, 0.8, 0, 'walk'], ['tree', 6, -7, 0], ['tree', -9, -4, 1]],
  },
  palestra: {
    label: 'palestra',
    words: /palestra|campo da (calcio|basket)|stadio|gym/,
    room: { size: [16, 14], height: 7, floor: 'parquet', walls: 'mattoni', ceiling: true, lights: 'pannelli', light: 1.4, warm: 0.3, decor: { door: true } },
    items: [['ball', -2, -3, 0], ['ball', 1.5, -4.5, 0], ['ball', 3, -2.5, 0], ['person', 0, -5, 0, 0, 'walk']],
  },
};

/** Il luogo nominato nella frase (o null). */
export function findPreset(t) {
  for (const [id, p] of Object.entries(PRESETS)) if (new RegExp(`\\b(?:${p.words.source})`).test(t)) return id;
  return null;
}
