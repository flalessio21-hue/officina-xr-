import { THEMES, ThemeManager } from './themes.js';

import { LIBRARY } from './library.js';
import { FEATURES } from './features.js';
import { CATALOG, ALL_ITEMS } from './catalog.js';
import { norm, hasKeyword, findItem, countIn, colorIn, sizeIn, whereIn, REMOVE, fixTranscript, matchCommand, setCommandPhrases } from './intent.js';

const b = (id, label) => ({ id, label });

// stato del menu Oggetti: categoria scelta e misura con cui creare
export const objectMenu = { cat: 'tech', size: 'auto' };
const SIZE_LABEL = { auto: 'Misura: AUTO', mini: 'Misura: MINI', real: 'Misura: REALE', giant: 'Misura: GIGANTE' };

// Frasi di comando "canoniche": servono al correttore che ripara le parole storpiate dalla voce.
const FIXED_COMMANDS = [
  'attiva la gravità', 'disattiva la gravità', 'accendi la gravità', 'spegni la gravità', 'togli la gravità', 'metti la gravità',
  'cancella tutto', 'elimina tutto', 'svuota la scrivania', 'annulla', 'ripeti', 'rifai', 'duplica', 'duplicalo', 'copia',
  'ingrandisci', 'rimpicciolisci', 'più grande', 'più piccolo', 'fallo grande il doppio', 'fallo piccolo la metà', 'misura originale',
  'ruota', 'ruotalo di novanta gradi', 'giralo a destra', 'giralo a sinistra', 'capovolgi', 'capovolgilo',
  'spostalo a destra', 'spostalo a sinistra', 'spostalo avanti', 'spostalo indietro', 'alzalo', 'abbassalo',
  'portamelo', 'dammelo', 'rimettilo sulla scrivania', 'seleziona tutto', 'deseleziona', 'raggruppa', 'separa',
  'smonta', 'smonta tutto', 'esplodi', 'esplodi tutto', 'ricomponi', 'ricomponi tutto', 'rimonta tutto', 'estrai il pezzo',
  'scomponi quello che ho in mano', 'smontalo',
  'portami nello spazio', 'andiamo sott\'acqua', 'portami al tramonto', 'aurora boreale', 'torna al buio',
  'fai piovere', 'fai piovere sopra di me', 'fai nevicare', 'temporale', 'nebbia', 'arcobaleno', 'sereno', 'smetti di piovere',
  'accendi la luce', 'spegni la luce', 'accendi la lampada', 'spegni la lampada',
  'attiva la realtà mista', 'realtà mista', 'torna in realtà virtuale', 'realtà virtuale',
  'modalità scrivania reale', 'usa il mio tavolo', 'torna alla scrivania virtuale',
  'alza la scrivania', 'abbassa la scrivania', 'rimetti a posto la scrivania', 'nascondi la scrivania', 'mostra la scrivania', 'torna alla scrivania',
  'parla più piano', 'parla più veloce', 'stai zitta', 'silenzio', 'cambia voce', 'ripeti quello che hai detto', 'cosa hai detto',
  'ascoltami sempre', 'smetti di ascoltare',
  'salva', 'salva il progetto', 'carica il progetto', 'apri il progetto', 'nuovo progetto',
  'aiuto', 'cosa posso dire', 'diagnostica', 'che ore sono', 'che giorno è',
  'nascondi il menu', 'mostra il menu', 'porta qui il menu', 'apri la scheda crea', 'apri la scheda mondo', 'apri la scheda sistema', 'apri la scheda smonta', 'apri la scheda modifica',
  'scansiona', 'scansiona questo oggetto', 'fatto', 'annulla la scansione',
  'quanto è grande', 'quanto misura', 'cosa c\'è sulla scrivania', 'quanti pezzi ha',
  'colora di rosso', 'colora di blu', 'colora di verde', 'colora di giallo', 'colora di bianco', 'colora di nero',
];
let PHRASES_READY = false;
export function commandPhrases() {
  const out = [...FIXED_COMMANDS];
  const words = new Set();
  for (const it of [...ALL_ITEMS, ...LIBRARY.map((l) => ({ label: l.label, words: [l.label] }))]) {
    for (const w of [it.label, ...(it.words || []).slice(0, 2)]) words.add(w.toLowerCase());
  }
  for (const w of ['cubo', 'sfera', 'cilindro', 'cono', 'piramide', 'toro', 'tubo', 'ingranaggio', 'vite']) words.add(w);
  for (const w of words) {
    out.push(`crea un ${w}`, `crea una ${w}`, `fammi un ${w}`, `fammi una ${w}`, `elimina il ${w}`, `elimina la ${w}`,
      `smonta il ${w}`, `esplodi il ${w}`, `dammi il ${w}`, `dammi la ${w}`, `carica il ${w}`);
  }
  return out;
}

/** Il pannello a sinistra della scrivania, diviso in schede. */
export const PANEL_TABS = [
  {
    id: 'oggetti', label: 'Crea', color: '#3fa9ff', hint: 'Scegli una categoria e tocca un oggetto, oppure chiedilo a voce. In realtà mista prendi un oggetto vero in mano per scansionarlo.',
    get buttons() {
      const cat = CATALOG.find((c) => c.id === objectMenu.cat) || CATALOG[0];
      const items = cat.items.map((it) => b('obj:' + it.id, it.label));
      while (items.length < 8) items.push(null);
      return [
        ...CATALOG.map((c) => b('cat:' + c.id, (c.id === objectMenu.cat ? '● ' : '') + c.label)),
        ...items.slice(0, 8),
        b('scan', 'Scansiona oggetto'), b('size', SIZE_LABEL[objectMenu.size]), b('undo', 'Annulla'), b('delete', 'Elimina'),
      ];
    },
  },
  {
    id: 'libreria', label: 'Da smontare', color: '#ffc845', hint: 'Oggetti meccanici completi, con tutti i pezzi interni: aprili nella scheda Smonta.',
    buttons: LIBRARY.map((it) => b('lib:' + it.id, it.label)),
  },
  {
    id: 'smonta', label: 'Smonta', color: '#ff6b4a', hint: 'Doppio pizzico apre/chiude · pizzico lungo estrae un pezzo · due mani allargano.',
    buttons: [
      b('explode', 'Esplodi'), b('explodeAll', 'Esplodi tutto'), b('collapse', 'Ricomponi'), b('extract', 'Estrai pezzo'),
      b('twohand', 'Due mani: SCALA'), b('gestures', 'Come si fa?'), b('collapseAll', 'Ricomponi tutto'), b('reassemble', 'Rimonta estratti'),
    ],
  },
  {
    id: 'modifica', label: 'Modifica', color: '#45d483', hint: 'Agisce sugli oggetti selezionati (evidenziati in blu). Per ingrandire puoi anche allargare due mani.',
    buttons: [
      b('duplicate', 'Duplica'), b('delete', 'Elimina'), b('rotate', 'Ruota 45°'), b('color', 'Colore'),
      b('s+', 'Più grande'), b('s-', 'Più piccolo'), b('resetScale', 'Misura originale'), b('measure', 'Quanto misura?'),
      b('selectAll', 'Seleziona tutto'), b('deselect', 'Deseleziona'), b('undo', 'Annulla'), b('redo', 'Ripeti'),
    ],
  },
  {
    id: 'mondo', label: 'Mondo', color: '#b57bff', hint: 'Ambiente e tempo. La scrivania la sposti prendendo le maniglie luminose sul bordo.',
    buttons: [
      b('theme:buio', 'Studio'), b('theme:spazio', 'Spazio'), b('theme:acqua', "Sott'acqua"), b('theme:tramonto', 'Tramonto'),
      b('theme:aurora', 'Aurora'), b('mr', 'Realtà mista'), b('gravity', 'Gravità: NO'), b('lamp', 'Lampada'),
      b('w:rain', 'Pioggia'), b('w:snow', 'Neve'), b('w:storm', 'Temporale'), b('w:clear', 'Sereno'),
      b('deskReset', 'Scrivania a posto'), b('home', 'Torna qui'), b('deskToggle', 'Scrivania: SÌ'), b('realDesk', 'Scrivania reale'),
    ],
  },
  {
    id: 'sistema', label: 'Sistema', color: '#7fe3ff', hint: 'Tutto resta salvato su questo visore. In VR tieni premuto A (o X) e parla.',
    buttons: [
      b('slot', 'Progetto 1'), b('save', 'Salva'), b('load', 'Apri'), b('new', 'Nuovo'),
      b('talk', 'Parla (A)'), b('listenAlways', 'Ascolto: NO'), b('voiceSwap', 'Cambia voce'), b('voiceSlow', 'Parla più piano'),
      b('help', 'Aiuto'), b('diag', 'Diagnostica'), b('clear', 'Svuota tutto'),
    ],
  },
];

const SAVE_KEY = 'officina-xr-save'; // + numero del progetto
const DESK_KEY = 'officina-xr-desk';

const GESTURES = 'Per smontare: fai un doppio pizzico su un oggetto per aprirlo, un altro doppio pizzico per richiuderlo. '
  + 'Tieni il pizzico fermo per mezzo secondo su un componente: si stacca e te lo ritrovi in mano. '
  + 'Con Due mani su Esplodi, prendi un oggetto con due mani e allargale: si apre quanto vuoi. '
  + 'Per buttare qualcosa, lascialo cadere nel cestino accanto alla scrivania.';

const HELP = 'Tieni premuto A e parla. Puoi chiedermi un oggetto, per esempio una sedia o una pizza. '
  + 'Puoi dire: dammi la pizza, ruotala di 90 gradi, spostala a destra di 20 centimetri, falla alta 30 centimetri, duplica 3 volte, rimettila sulla scrivania. '
  + 'Se tieni un oggetto in mano, di\' scomponi quello che ho in mano e potrai prendere i pezzi uno alla volta. '
  + 'Puoi comandare tutto il menu: attiva o disattiva la gravità, apri la scheda mondo, nascondi il menu, porta qui il menu, esplodi tutto, salva, nuovo progetto, parla più veloce. '
  + 'Di\' modalità scrivania reale e appoggia le mani aperte sul tuo tavolo: diventa il piano di lavoro. Prendi un oggetto vero e di\' scansiona. Per spostare la scrivania prendi le maniglie luminose sul bordo.';

const COLORS = {
  ross: 0xff4a3d, blu: 0x4f8cff, azzurr: 0x7fc8ff, verd: 0x45d483, giall: 0xffc845, viola: 0xb57bff,
  bianc: 0xf2f2f2, ner: 0x1d1f24, grigi: 0x9aa0a8, arancion: 0xff8a2a, rosa: 0xff6fb0, oro: 0xd4af37, rame: 0xb87333,
};

const SHAPES = [
  ['gear', /ingranagg|ruota dentata/], ['screw', /\bvit[ei]\b|bullon|dado/], ['tube', /\btub[oi]\b/],
  ['box', /\bcub[oi]\b|scatol|parallelepiped|blocc/], ['cylinder', /cilindr/], ['sphere', /sfer|palla/],
  ['cone', /\bcon[oi]\b/], ['torus', /\btor[oi]\b|ciambell|anell/],
];

export function createActions(ctx) {
  const { workspace, ai, panel, env, themes } = ctx; // ctx.net arriva dopo, quando Firebase è pronto
  let multi = false;
  let lastMsg = 'Ciao! Sono qui sulla scrivania. Chiedimi un oggetto, o prendine uno vero in mano per scansionarlo.';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  };

  const deskY = parseFloat(store.get(DESK_KEY));
  if (!Number.isNaN(deskY)) env.setDeskHeight(deskY);

  function notify(msg, speak = false) {
    lastMsg = msg;
    // l'aiuto e la spiegazione dei gesti si leggono per intero; il resto è una frase breve
    if (speak) ai.say(msg, { full: msg === HELP || msg === GESTURES });
  }
  ai.onText = (t) => { lastMsg = t; };

  // se non hai selezionato niente, si agisce sull'ultimo oggetto creato (è quasi sempre quello che intendi)
  const need = (fn, msg = 'Prima crea qualcosa.') => {
    if (!workspace.selected.size) {
      const last = workspace.topLevel().at(-1);
      if (!last) return msg;
      workspace.selected = new Set([last]);
      workspace.highlightDirty = true;
    }
    return fn();
  };

  // ---------- annulla / ripeti: istantanee del mondo dopo ogni modifica ----------
  const history = { past: [], future: [], seen: workspace.version || 0, quiet: 0, restoring: false };
  function snapshot() { return JSON.stringify(workspace.serialize()); }
  history.past.push(snapshot());
  function tickHistory(dt) {
    const v = workspace.version || 0;
    if (v !== history.seen) { history.seen = v; history.quiet = 0.5; return; }
    if (history.quiet > 0 && workspace.grabbing.size === 0) {
      history.quiet -= dt;
      if (history.quiet <= 0) {
        const snap = snapshot();
        if (snap !== history.past[history.past.length - 1]) {
          history.past.push(snap);
          if (history.past.length > 40) history.past.shift();
          history.future = [];
        }
      }
    }
  }
  function restore(json) {
    workspace.load(JSON.parse(json));
    history.seen = workspace.version || 0;
    history.quiet = 0;
  }
  function undo() {
    if (history.quiet > 0) { // c'è una modifica non ancora fotografata
      history.quiet = 0;
      const snap = snapshot();
      if (snap !== history.past[history.past.length - 1]) history.past.push(snap);
    }
    if (history.past.length < 2) return 'Non c’è niente da annullare.';
    history.future.push(history.past.pop());
    restore(history.past[history.past.length - 1]);
    return 'Annullato.';
  }
  function redo() {
    const next = history.future.pop();
    if (!next) return 'Non c’è niente da ripetere.';
    history.past.push(next);
    restore(next);
    return 'Ripetuto.';
  }

  // ---------- progetti (slot) ----------
  let slot = parseInt(store.get('officina-xr-slot') || '1', 10) || 1;
  const slotLabel = () => {
    const has = !!store.get(SAVE_KEY + '-' + slot) || (slot === 1 && !!store.get(SAVE_KEY));
    return `Progetto ${slot}${has ? ' ●' : ''}`;
  };
  panel.setLabel('slot', slotLabel());

  // ---------- impostazioni dei gesti ----------
  const settings = { twoHand: 'scale' };

  function exportGLB() {
    import('three/addons/exporters/GLTFExporter.js').then(({ GLTFExporter }) => {
      const sel = [...workspace.selected];
      workspace.clearSelection();
      workspace.refreshHighlight();
      new GLTFExporter().parse(workspace.root, (glb) => {
        const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
        const a = document.createElement('a');
        a.href = url; a.download = 'officina.glb'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        sel.forEach((s) => workspace.selected.add(s));
        workspace.highlightDirty = true;
      }, (err) => notify('Esportazione fallita: ' + err.message), { binary: true });
    });
    return 'Esporto il modello in formato GLB…';
  }

  const handlers = {
    duplicate: () => need(() => `Duplicat${workspace.duplicate() > 1 ? 'i' : 'o'}.`),
    delete: () => need(() => `Eliminat${workspace.remove() > 1 ? 'i' : 'o'}.`),
    group: () => need(() => {
      const g = workspace.group();
      return g ? `Ho creato “${g.name}”. Ora puoi esploderlo e ricomporlo.` : 'Niente da raggruppare.';
    }, 'Seleziona i pezzi da raggruppare (grip o Multi).'),
    ungroup: () => need(() => (workspace.ungroup() ? 'Assieme separato nelle sue parti.' : 'La selezione non è un assieme.')),
    explode: () => {
      const ts = workspace.targets().filter((n) => n.userData.isAssembly);
      if (!ts.length) return 'Non c’è nessun assieme da esplodere. Raggruppa qualche pezzo o carica il drone demo.';
      let any = false;
      for (const t of ts) any = workspace.explodeStep(t) || any;
      return any ? 'Esploso di un livello. Ora puoi afferrare i singoli componenti.' : 'Sei già al massimo dettaglio.';
    },
    explodeAll: () => {
      const ts = workspace.targets().filter((n) => n.userData.isAssembly);
      if (!ts.length) return 'Non c’è nessun assieme da esplodere.';
      ts.forEach((t) => workspace.explodeAll(t));
      return 'Vista esplosa completa: ogni singola parte è separata.';
    },
    collapse: () => {
      const ts = workspace.targets();
      let any = false;
      for (const t of ts) {
        // se è selezionata una parte dentro un assieme esploso, ricompone l'assieme che la contiene
        const top = t.parent && t.parent !== workspace.root && t.parent.userData.exploded ? t.parent : t;
        any = workspace.collapse(top) || any;
      }
      return any ? 'Ricomposto.' : 'È già tutto assemblato.';
    },
    sample: () => {
      workspace.loadDemo();
      return `Ecco un drone di ${workspace.countParts([...workspace.selected][0])} parti. Premi Esplodi per smontarlo un livello alla volta.`;
    },
    'sx+': () => need(() => (workspace.scaleSelected('x', 1.1), 'Più largo.')),
    'sx-': () => need(() => (workspace.scaleSelected('x', 1 / 1.1), 'Più stretto.')),
    'sy+': () => need(() => (workspace.scaleSelected('y', 1.1), 'Più alto.')),
    'sy-': () => need(() => (workspace.scaleSelected('y', 1 / 1.1), 'Più basso.')),
    'sz+': () => need(() => (workspace.scaleSelected('z', 1.1), 'Più profondo.')),
    'sz-': () => need(() => (workspace.scaleSelected('z', 1 / 1.1), 'Meno profondo.')),
    's+': () => need(() => (workspace.scaleSelected('all', 1.15), 'Ingrandito.')),
    's-': () => need(() => (workspace.scaleSelected('all', 1 / 1.15), 'Rimpicciolito.')),
    rotate: () => need(() => (workspace.rotateSelected(Math.PI / 4), 'Ruotato di 45 gradi.')),
    color: () => need(() => (workspace.colorSelected(null), 'Colore cambiato.')),
    multi: () => {
      multi = !multi;
      panel.setLabel('multi', multi ? 'Multi: SÌ' : 'Multi: NO');
      panel.setActive('multi', multi);
      return multi ? 'Selezione multipla attiva: ogni pezzo che tocchi si aggiunge.' : 'Selezione singola.';
    },
    deselect: () => (workspace.clearSelection(), 'Selezione annullata.'),
    talk: () => (ai.listen(), null),
    save: () => {
      const ok = store.set(SAVE_KEY + '-' + slot, JSON.stringify(workspace.serialize()));
      panel.setLabel('slot', slotLabel());
      return ok ? `Salvato nel progetto ${slot}.` : 'Non riesco a salvare in questo browser.';
    },
    load: () => {
      const raw = store.get(SAVE_KEY + '-' + slot) || (slot === 1 ? store.get(SAVE_KEY) : null);
      if (!raw) return `Il progetto ${slot} è vuoto.`;
      try { workspace.load(JSON.parse(raw)); return `Progetto ${slot} aperto.`; } catch { return 'Il salvataggio è danneggiato.'; }
    },
    slot: () => {
      slot = (slot % 6) + 1;
      store.set('officina-xr-slot', String(slot));
      panel.setLabel('slot', slotLabel());
      return `Progetto ${slot} selezionato: tocca Apri per caricarlo o Salva per salvarci il mondo attuale.`;
    },
    new: () => (workspace.clear(), `Scrivania pulita. Quando vuoi, salva nel progetto ${slot}.`),
    undo,
    redo,
    flip: () => need(() => { for (const n of workspace.selected) n.rotateX(Math.PI); workspace.markDirty(); return 'Capovolto.'; }),
    selectAll: () => `Selezionat${workspace.selectAll() === 1 ? 'o 1 oggetto' : 'i ' + workspace.selected.size + ' oggetti'}.`,
    resetScale: () => need(() => { for (const n of workspace.selected) n.scale.set(1, 1, 1); workspace.markDirty(); return 'Misura originale.'; }),
    measure: () => workspace.info(),
    's*2': () => need(() => (workspace.scaleSelected('all', 2), 'Doppio.')),
    's/2': () => need(() => (workspace.scaleSelected('all', 0.5), 'Metà.')),
    extract: () => {
      const sel = [...workspace.selected].filter((n) => n.parent !== workspace.root);
      if (!sel.length) return 'Apri un oggetto (Esplodi), seleziona un suo pezzo e poi tocca Estrai. Oppure tieni il pizzico fermo su un componente.';
      sel.forEach((n) => workspace.extract(n));
      return sel.length === 1 ? `${sel[0].name} estratto: ora è un pezzo libero.` : `${sel.length} pezzi estratti.`;
    },
    reassemble: () => {
      const n = workspace.reassemble();
      return n ? `Rimessi al loro posto ${n} pezzi.` : 'Non ci sono pezzi estratti da rimontare.';
    },
    collapseAll: () => {
      let any = false;
      for (const t of workspace.topLevel()) any = workspace.collapse(t) || any;
      return any ? 'Tutto ricomposto.' : 'È già tutto assemblato.';
    },
    twohand: () => {
      settings.twoHand = settings.twoHand === 'scale' ? 'explode' : 'scale';
      panel.setLabel('twohand', settings.twoHand === 'scale' ? 'Due mani: SCALA' : 'Due mani: ESPLODI');
      panel.setActive('twohand', settings.twoHand === 'explode');
      return settings.twoHand === 'scale'
        ? 'Con due mani ora ingrandisci e rimpicciolisci.'
        : 'Con due mani ora apri gli oggetti: prendili con entrambe le mani e allargale.';
    },
    gestures: () => GESTURES,
    size: () => {
      const order = ['auto', 'mini', 'real', 'giant'];
      objectMenu.size = order[(order.indexOf(objectMenu.size) + 1) % order.length];
      panel.dirty = true;
      return { auto: 'Misura automatica: le cose piccole vere, le grandi in miniatura.', mini: 'Tutto in miniatura sulla scrivania.', real: 'Tutto a grandezza reale, davanti a te.', giant: 'Tutto gigante!' }[objectMenu.size];
    },
    rainPizza: () => ctx.rainObjects?.(CATALOG.find((c) => c.id === 'food').items[0], 10),
    talk: () => (ctx.voiceTalk ? ctx.voiceTalk() : (ai.listen(), null)),
    listenAlways: () => ctx.voiceContinuous?.(true) || null,
    listenStop: () => ctx.voiceContinuous?.(false) || null,
    scan: () => (ctx.scan ? (ctx.scan(), null) : 'La scansione non è disponibile.'),
    mr: () => ctx.mixedReality?.() || null,
    deskToggle: () => ctx.toggleDesk?.() || null,
    gravity: () => {
      const on = ctx.physics?.toggle();
      panel.setLabel('gravity', on ? 'Gravità: SÌ' : 'Gravità: NO');
      panel.setActive('gravity', !!on);
      return on ? 'Gravità attiva: gli oggetti cadono, si appoggiano e puoi lanciarli.' : 'Gravità spenta: gli oggetti restano sospesi dove li lasci.';
    },
    export: exportGLB,
    deskReset: () => (ctx.setRealTable?.(false), ctx.deskGrab?.reset(), 'Scrivania rimessa al suo posto.'),
    realDesk: () => voice('modalita scrivania reale'),
    deskUp: () => moveDesk(0.03),
    deskDown: () => moveDesk(-0.03),
    clear: () => (workspace.clear(), 'Scrivania ripulita.'),
    help: () => HELP,
    diag: () => { Promise.resolve(ctx.diag?.()).then((m) => m && ai.say(m, { full: true })); return null; },
    home: () => (env.home?.(), 'Sei tornato alla scrivania.'),
    turnL: () => (env.turn?.(Math.PI / 6), null),
    turnR: () => (env.turn?.(-Math.PI / 6), null),
    lamp: () => (env.toggleLamp() ? 'Lampada accesa.' : 'Lampada spenta.'),
    invite: () => {
      if (!ctx.net?.room) return 'Per invitare qualcuno devi accedere: togli il visore e usa il riquadro «Il tuo account» nella pagina.';
      const others = Object.values(ctx.net.people).map((p) => p.name);
      return `Per invitare qualcuno, nella pagina del browser tocca «Invita qualcuno» e manda il link. ${others.length ? 'Ora qui ci sono: ' + others.join(', ') + '.' : 'Per ora sei da solo.'}`;
    },
    voiceSwap: () => {
      const v = ai.neural?.voice === 'miro' ? 'paola' : 'miro';
      if (!ai.neural) return 'Prima attiva la voce nella pagina iniziale.';
      ai.neural.unlock();
      ai.neural.setVoice(v)?.then(() => ai.say(v === 'miro' ? 'Ora sono Miro.' : 'Ora sono Paola.'));
      return null;
    },
    voiceSlow: () => {
      ai.neuralSpeed = (ai.neuralSpeed || 1) >= 1 ? 0.88 : 1;
      return ai.neuralSpeed < 1 ? 'Parlo più piano.' : 'Torno alla velocità normale.';
    },
    'pitch+': () => (ai.changePitch(0.15), 'Ora parlo più acuto.'),
    'pitch-': () => (ai.changePitch(-0.15), 'Ora ho una voce più grave.'),
  };

  function moveDesk(dy) {
    const y = Math.max(-0.25, Math.min(0.4, env.deskRig.position.y + dy));
    env.setDeskHeight(y);
    store.set(DESK_KEY, String(y));
    ctx.deskGrab?.save();
    return `Altezza scrivania: ${Math.round((0.75 + y) * 100)} cm.`;
  }

  const SPOKEN = new Set(['voiceSlow', 'sample', 'help', 'explodeAll', 'group', 'gestures', 'gravity', 'twohand']);

  function run(id, { speak } = {}) {
    if (id.startsWith('tab:')) {
      panel.setTab(id.slice(4));
      return null;
    }
    if (id.startsWith('cat:')) {
      objectMenu.cat = id.slice(4);
      panel.dirty = true;
      return null;
    }
    panel.press(id);
    let msg;
    if (id.startsWith('obj:')) {
      const item = CATALOG.flatMap((c) => c.items).find((it) => 'obj:' + it.id === id);
      msg = item ? ctx.spawn?.(item, { size: objectMenu.size }) : null;
      if (msg) notify(msg, speak ?? false);
      return msg;
    }
    if (id.startsWith('w:') || id.startsWith('p:')) {
      msg = ctx.power?.(id);
      if (msg) notify(msg, speak ?? true);
      return msg;
    }
    if (id.startsWith('lib:')) {
      const item = LIBRARY.find((it) => 'lib:' + it.id === id);
      if (!item) return null;
      const node = workspace.loadLibrary(item.build);
      msg = `${node.name}: ${workspace.countParts(node)} pezzi. Doppio pizzico per aprirlo, pizzico lungo su un componente per estrarlo.`;
      notify(msg, speak ?? true);
      return msg;
    }
    if (id.startsWith('theme:')) {
      const th = id.slice(6);
      if (themes?.current === th) msg = 'Siamo già qui.';
      else {
        themes?.apply(th);
        ctx.net?.setTheme(th);
        msg = THEMES[th].say;
      }
      notify(msg, speak ?? true);
      return msg;
    }
    if (['box', 'cylinder', 'sphere', 'cone', 'pyramid', 'torus', 'tube', 'gear', 'screw'].includes(id)) {
      const n = workspace.createPrimitive(id);
      msg = `${n.name} creat${n.name.endsWith('a') ? 'a' : 'o'}. Afferralo per spostarlo.`;
    } else {
      msg = handlers[id]?.();
    }
    if (msg) notify(msg, speak ?? SPOKEN.has(id));
    return msg;
  }

  /** Seleziona gli oggetti sulla scena il cui nome contiene quello dell'oggetto nominato. */
  function selectByName(label) {
    const key = label.toLowerCase().split(' ')[0];
    const hits = workspace.topLevel().filter((n) => n.name.toLowerCase().includes(key));
    workspace.selected = new Set(hits);
    workspace.highlightDirty = true;
    return hits.length;
  }

  /** Interpreta un comando in linguaggio naturale (italiano), tollerante agli errori della voce. */
  // ---- tutto il menu a voce ----
  const say = (m) => { if (m) notify(m, true); return m; };
  const ON = /\b(attiva|accendi|abilita|avvia|metti|inserisci|si)\b/;
  const OFF = /\b(disattiva|spegni|disabilita|togli|leva|ferma|blocca|no|niente|senza|smetti|basta|stop|chiudi)\b/;
  // pulsanti con uno stato acceso/spento: come leggere lo stato e come cambiarlo
  const TOGGLES = {
    gravity: { name: ['La gravità', 'attiva', 'spenta'], words: ['gravita'], get: () => !!ctx.physics?.enabled, set: () => run('gravity', { speak: true }) },
    listenAlways: { name: ['L\'ascolto continuo', 'attivo', 'spento'], words: ['ascolto', 'ascoltami sempre', 'ascolto continuo'], get: () => !!ctx.voiceIn?.continuous, set: (on) => say(ctx.voiceContinuous?.(on) || '') },
    deskToggle: { name: ['La scrivania', 'visibile', 'nascosta'], words: ['scrivania'], get: () => ctx.deskVisible?.() ?? env.deskTop.visible, set: () => say(ctx.toggleDesk?.() || '') },
    multi: { name: ['La selezione multipla', 'attiva', 'spenta'], words: ['selezione multipla', 'multi'], get: () => multi, set: () => run('multi', { speak: true }) },
    mr: { name: ['La realtà mista', 'attiva', 'spenta'], words: ['realta mista', 'passthrough', 'passtrough', 'vedere la stanza', 'la mia stanza'], get: () => !!ctx.isMixedReality?.(), set: () => run('mr', { speak: true }) },
    lamp: { name: ['La lampada', 'accesa', 'spenta'], words: ['lampada', 'luce'], get: () => env.lampOn?.() ?? null, set: () => run('lamp', { speak: true }) },
  };
  const cleanLabel = (l) => norm(String(l).split(':')[0].replace(/[●▲▼◀▶+−\-×()]/g, ' '));
  function allButtons() {
    const out = [];
    for (const tab of PANEL_TABS) {
      out.push({ id: 'tab:' + tab.id, label: 'scheda ' + tab.label, tab: true });
      for (const btn of tab.buttons) if (btn) out.push({ id: btn.id, label: btn.label });
    }
    for (const c of CATALOG) out.push({ id: 'cat:' + c.id, label: 'categoria ' + c.label });
    return out;
  }

  /** Riconosce un comando del menu (pulsanti, schede, interruttori). Ritorna il messaggio o undefined. */
  function menuVoice(t, { early = false } = {}) {
    // interruttori: «attiva la gravità», «spegni l'ascolto», «togli la scrivania»
    const wantOn = ON.test(t), wantOff = OFF.test(t);
    for (const [id, tg] of Object.entries(TOGGLES)) {
      if (early && !wantOn && !wantOff && !/(mostra|nascondi)/.test(t)) break;
      if (!tg.words.some((w) => hasKeyword(t, w))) continue;
      if (id === 'deskToggle' && !/(mostra|nascondi|togli|leva|rimetti|fai (sparire|vedere))/.test(t)) continue; // «alza la scrivania» è un'altra cosa
      if (id === 'lamp' && !/(accendi|spegni|lampada)/.test(t)) continue;
      const on = wantOff ? false : wantOn ? true : null;
      const cur = tg.get();
      if (on == null || cur == null) return tg.set(on ?? !cur);
      if (cur === on) return say(`${tg.name[0]} è già ${on ? tg.name[1] : tg.name[2]}.`);
      return tg.set(on);
    }
    // schede: «apri la scheda mondo», «vai su sistema»
    const tabM = t.match(/\b(apri|vai|mostra|passa|scheda|menu)\b.*\b(crea|da smontare|smonta|modifica|mondo|sistema)\b/);
    if (tabM && /\b(scheda|menu|vai|apri|passa)\b/.test(t)) {
      const tab = PANEL_TABS.find((x) => norm(x.label) === tabM[2]);
      if (tab) { run('tab:' + tab.id); return say(`Scheda ${tab.label}.`); }
    }
    // qualsiasi pulsante per nome («rimonta estratti», «misura originale», «cambia voce»)
    let best = null, bestLen = 0;
    for (const b of allButtons()) {
      if (b.tab) continue;
      // in anticipo (prima di creare oggetti) solo nomi di pulsanti di almeno due parole, scritti uguali
      if (early && /^(lib|obj|cat):/.test(b.id)) continue;
      const words = cleanLabel(b.label).split(' ').filter((w) => w.length > 2 || /^(su|giu|piu)$/.test(w));
      if (!words.length || (early && words.length < 2)) continue;
      // il nome del pulsante deve essere quasi tutta la frase (non una parola presa a caso)
      if (t.split(' ').filter((w) => w.length > 2).length > words.length + 1) continue;
      if (words.every((w) => hasKeyword(t, w, early)) && words.join(' ').length > bestLen) { best = b; bestLen = words.join(' ').length; }
    }
    if (best) {
      if (best.id.startsWith('cat:')) { run('tab:oggetti'); run(best.id); return say(`Categoria ${cleanLabel(best.label).replace('categoria ', '')}.`); }
      return run(best.id, { speak: true }) ?? null;
    }
    return undefined;
  }

  // ---- comandi in più: oggetto in mano, spostamenti precisi, misure, elenco, ora… ----
  const NUMW = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, venti: 20, trenta: 30, quaranta: 40, quarantacinque: 45, cinquanta: 50, sessanta: 60, settanta: 70, ottanta: 80, novanta: 90, cento: 100, centoventi: 120, centottanta: 180, duecentosettanta: 270, trecentosessanta: 360, mezzo: 0.5 };
  const numberIn = (t, re) => {
    const m = t.match(re);
    if (!m) return null;
    const v = m[1].replace(',', '.');
    return Number.isFinite(+v) ? +v : NUMW[v] ?? null;
  };
  function targetNodes(item) {
    if (item && selectByName(item.label)) return [...workspace.selected];
    if (workspace.selected.size) return [...workspace.selected];
    const held = ctx.heldNode?.();
    if (held) return [held];
    const all = workspace.topLevel();
    return all.length ? [all[all.length - 1]] : []; // l'ultimo creato
  }

  function moreCommands(t, has, say, item) {
    // modalità scrivania reale: il tavolo vero diventa il piano di lavoro
    if (has(/modalita (scrivania|tavolo) (reale|vera)|scrivania reale|tavolo reale/)) {
      if (!ctx.isMixedReality?.()) { ctx.pendingRealDesk = true; ctx.mixedReality?.(); return say('Passo alla realtà mista: poi appoggia le mani aperte sul tuo tavolo.'); }
      ctx.tableSnap?.startPlacing();
      return say('Guarda il tuo tavolo: quando vedi il cerchio verde fai un pizzico, premi il grilletto o di\' «qui». Oppure appoggia le mani aperte sul tavolo.');
    }
    // conferma del mirino del tavolo
    if (ctx.tableSnap?.placing && has(/^(qui|metti qui|mettila qui|questo|questo tavolo|ok|fatto|conferma|va bene)$/)) { ctx.tableSnap.confirm(); return null; }
    // realtà virtuale (uscire dalla realtà mista)
    if (has(/(torna|passa|vai|ritorna)\w* (in|alla|nella) realta virtuale|^realta virtuale$|esci dalla realta mista|niente realta mista/)) { ctx.virtualReality?.(); return say('Torno alla realtà virtuale.'); }
    // il menu
    if (has(/\b(menu|pannello)\b/)) {
      if (has(/nascondi|togli|chiudi|leva/)) { ctx.panelVisible?.(false); return say('Menu nascosto. Di\' «mostra il menu» per riaverlo.'); }
      if (has(/porta|avvicina|qui|vicino/)) { ctx.panelHere?.(); return say('Ecco il menu.'); }
      if (has(/mostra|apri|fai vedere|rimetti/) && !has(/scheda/)) { ctx.panelVisible?.(true); return say('Ecco il menu.'); }
    }
    // voce
    if (has(/parla (piu )?(veloce|svelt|rapid)|piu veloce a parlare/)) { ai.neuralSpeed = 1.15; return say('Parlo più veloce.'); }
    if (has(/(smetti|basta|stop|non) (di )?ascoltar|spegni (il )?microfono|ascolto (spento|no)/)) return say(ctx.voiceContinuous?.(false) || 'Non ti ascolto più di continuo: tieni premuto A per parlarmi.');
    // progetti
    if (has(/\b(apri|carica|riapri)\b.*\bprogett/)) return run('load', { speak: true });
    // misure relative
    if (has(/\b(doppio|due volte piu grande|raddoppia)\b/)) return need(() => { run('s*2', { speak: false }); return say('Grande il doppio.'); });
    if (has(/\b(meta|dimezza)\b/) && has(/fall|rend|piccol|dimezza/)) return need(() => { run('s/2', { speak: false }); return say('Ora è grande la metà.'); });
    if (has(/\b(alzalo|alzala|sollevalo|sollevala)\b/)) { const n = targetNodes(item); if (!n.length) return say('Non c\'è niente da alzare.'); ctx.moveNodes?.(n, 'up', 0.15); return say('Alzato.'); }
    if (has(/\b(abbassalo|abbassala)\b/)) { const n = targetNodes(item); if (!n.length) return say('Non c\'è niente da abbassare.'); ctx.moveNodes?.(n, 'down', 0.1); return say('Abbassato.'); }
    if (has(/\b(portamelo|portamela|dammelo|dammela|passamelo|passamela|avvicinalo|avvicinala)\b/)) { const n = targetNodes(item); if (!n.length) return say('Non c\'è niente da portarti.'); ctx.bringToMe?.(n[0]); return say('Eccolo.'); }
    if (has(/(rimettil[oa]|riportal[oa]|appoggial[oa]|posal[oa])\b/)) { const n = targetNodes(item); if (!n.length) return say('Non c\'è niente da rimettere.'); for (const x of n) workspace.placeOnDesk(x); workspace.markDirty(); return say('Rimesso sulla scrivania.'); }
    // quanti pezzi
    if (has(/quanti (pezzi|componenti|parti)/)) { const n = targetNodes(item)[0]; return say(n ? `${n.name} ha ${workspace.countParts?.(n) ?? 1} pezzi.` : 'Non c\'è niente sulla scrivania.'); }
    if (has(/^(fatto|ok|okay|va bene|perfetto|grazie)$/)) return say('Ok.');
    // il tavolo vero diventa la scrivania (realtà mista)
    if (has(/\b(usa|adatta|aggancia|allinea)\b.*\b(tavolo|piano|scrivania)\b|\b(mio|questo|vero) (tavolo|piano)\b|tavolo vero/) && !has(/\b(crea|creami|fammi|costruisci|genera)\b/)) {
      if (!ctx.isMixedReality?.()) return say('Funziona in realtà mista: entra e appoggia le mani aperte sul tuo tavolo.');
      ctx.tableSnap?.startPlacing();
      return say('Guarda il tuo tavolo e conferma con un pizzico o «qui», oppure appoggia le mani aperte sul tavolo.');
    }
    if (has(/scrivania (virtuale|finta|di prima)|togli il tavolo|non (usare|adattare)( il)? tavolo/)) {
      ctx.setRealTable?.(false);
      if (ctx.tableSnap) ctx.tableSnap.auto = !has(/non (usare|adattare)/);
      return say('Ecco di nuovo la scrivania virtuale.');
    }
    // smetti di parlare / ripeti / ora
    if (has(/\b(zitta|zitto|silenzio|basta parlare|smetti di parlare|stai zitt)/)) { ai.stopSpeaking?.(); return null; }
    if (has(/cosa hai detto|ripeti (quello|cosa|l'ultima)|non ho sentito/)) return say(lastMsg);
    if (has(/che or[ae] (sono|e)|che ora/)) { const d = new Date(); return say(`Sono le ${d.getHours()} e ${String(d.getMinutes()).padStart(2, '0')}.`); }
    if (has(/che giorno (e|e oggi)|che data/)) return say(`Oggi è ${new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}.`);

    // scomponi l'oggetto che ho in mano: si apre davanti a te e prendi i pezzi uno alla volta
    const inHand = has(/(in mano|che tengo|tengo in|ho in mano|che ho preso|questo oggetto)/) || has(/\b(smontalo|smontala|scomponilo|scomponila|aprilo|aprila|esplodilo|esplodila|dividilo|dividila)\b/);
    if (inHand && has(/smont|scompon|apri|espl|divid|separ|disassembl|pezz/)) {
      const held = ctx.heldNode?.();
      if (held) {
        ctx.releaseHeld?.(held);
        workspace.select(held);
        run('explodeAll', { speak: false });
        return say('Ecco tutti i pezzi: prendili uno alla volta.');
      }
      if (ctx.isMixedReality?.()) { ctx.scanThenExplode?.(); return null; }
      if (workspace.selected.size) { run('explodeAll', { speak: false }); return say('Ecco tutti i pezzi.'); }
      return say('Non hai niente in mano: prendi un oggetto e ripeti.');
    }

    // portami / dammi l'oggetto
    if (has(/\b(dammi|portami|passami|avvicinami|porta qui|vieni qui con)\b/) && !has(/portami (nello|nel|sott|al |in |sulla luna)/)) {
      const nodes = targetNodes(item);
      if (!nodes.length) return say('Non c\'è niente da portarti: dimmi prima di crearlo.');
      ctx.bringToMe?.(nodes[0]);
      return say(`Ecco ${nodes[0].name.toLowerCase()}.`);
    }

    // rimetti sulla scrivania
    if (has(/\b(rimetti|riporta|appoggia|posa)\b/) && has(/scrivania|tavolo|giu/)) {
      const nodes = targetNodes(item);
      if (!nodes.length) return say('Non c\'è niente da rimettere.');
      for (const n of nodes) workspace.placeOnDesk(n);
      workspace.markDirty();
      return say('Rimesso sulla scrivania.');
    }

    // ruota di N gradi / a destra / a sinistra / sottosopra
    if (has(/\b(ruota|gira|giralo|girala|ruotalo|ruotala)\b/) && !has(/scrivania/)) {
      const deg = numberIn(t, /(\d+|\w+)\s*grad/) ?? (has(/destra/) ? -90 : has(/sinistra/) ? 90 : has(/indietro|dall'altra parte|al contrario/) ? 180 : null);
      if (deg != null) {
        const nodes = targetNodes(item);
        if (!nodes.length) return say('Non c\'è niente da ruotare.');
        const sign = has(/sinistra|antiorari/) ? 1 : has(/destra|orari/) ? -1 : 1;
        for (const n of nodes) n.rotateY((Math.abs(deg) * sign * Math.PI) / 180);
        workspace.markDirty();
        return say(`Ruotato di ${Math.abs(deg)} gradi.`);
      }
      if (has(/\b(ruotalo|ruotala|giralo|girala)\b/)) return need(() => run('rotate', { speak: true }));
    }

    // sposta a destra/sinistra/avanti/indietro/su/giù (di N centimetri)
    const dirM = t.match(/\b(destra|sinistra|avanti|indietro|lontano|vicino|piu vicino|piu lontano|su|giu|in alto|in basso)\b/);
    if (dirM && has(/\b(sposta|muovi|spingi|tira|spostalo|spostala|muovilo|muovila|portalo|portala|alza|abbassa|alzalo|abbassalo)\b/) && !has(/scrivania/)) {
      const nodes = targetNodes(item);
      if (!nodes.length) return say('Non c\'è niente da spostare.');
      let cm = numberIn(t, /(\d+(?:[.,]\d+)?|\w+)\s*(cm|centimetr)/) ?? null;
      const m = numberIn(t, /(\d+(?:[.,]\d+)?|\w+)\s*metr/);
      const meters = cm != null ? cm / 100 : m != null ? m : 0.15;
      const d = dirM[1];
      const dir = /destra/.test(d) ? 'right' : /sinistra/.test(d) ? 'left' : /avanti|lontano/.test(d) ? 'forward' : /indietro|vicino/.test(d) ? 'back' : /su|alto/.test(d) ? 'up' : 'down';
      ctx.moveNodes?.(nodes, dir, meters);
      return say('Spostato.');
    }
    if (has(/\b(alzalo|alzala|solleva)\b/)) { const nodes = targetNodes(item); if (nodes.length) { ctx.moveNodes?.(nodes, 'up', 0.15); return say('Alzato.'); } }

    // duplica N volte
    const dupN = numberIn(t, /(\d+|\w+)\s*volte/);
    if (has(/duplic|copi|clon/) && dupN > 1) {
      if (!targetNodes(item).length) return say('Non c\'è niente da duplicare.');
      for (let i = 0; i < Math.min(10, dupN); i++) run('duplicate', { speak: false });
      return say(`Fatte ${Math.min(10, dupN)} copie.`);
    }

    // misure precise: «fallo alto 30 centimetri», «largo mezzo metro», «grande 2 metri»
    const size = t.match(/\b(alt|larg|lung|profond|grand|spess)\w*\b.*?(\d+(?:[.,]\d+)?|\w+)\s*(mm|millimetr\w*|cm|centimetr\w*|metr\w*|m)\b/);
    if (size && (NUMW[size[2]] != null || Number.isFinite(+size[2].replace(',', '.')))) {
      const v = NUMW[size[2]] ?? +size[2].replace(',', '.');
      const unit = size[3];
      const mm = /^m(m|illi)/.test(unit) ? v : /^c/.test(unit) ? v * 10 : v * 1000;
      const nodes = targetNodes(item);
      if (!nodes.length) return say('Dimmi prima quale oggetto.');
      workspace.selected = new Set(nodes);
      const axis = /^alt/.test(size[1]) ? 'y' : /^larg/.test(size[1]) ? 'x' : /^(lung|profond|spess)/.test(size[1]) ? 'z' : 'all';
      ctx.setSizeMm?.(axis, mm);
      return say(`Fatto: ${mm >= 1000 ? (mm / 1000).toString().replace('.', ',') + ' metri' : mm >= 10 ? Math.round(mm / 10) + ' centimetri' : mm + ' millimetri'}.`);
    }

    // cosa c'è sulla scrivania
    if (has(/cosa c'? ?e (sulla scrivania|qui|intorno)|cosa ho creato|elenca|quali oggetti|quanti oggetti/)) {
      const names = workspace.topLevel().map((n) => n.name.toLowerCase());
      if (!names.length) return say('Non c\'è ancora niente.');
      const counts = {};
      for (const n of names) counts[n] = (counts[n] || 0) + 1;
      const list = Object.entries(counts).slice(0, 8).map(([n, c]) => (c > 1 ? `${c} ${n}` : n));
      return say(`Ci sono: ${list.join(', ')}.`);
    }
    return undefined;
  }

  function voice(raw, opts = {}) {
    const t = norm(fixTranscript(raw));
    const has = (re) => re.test(t);
    // durante la scansione, «fatto» la chiude e crea l'oggetto
    if (ctx.scanActive?.() && has(/\b(fatto|finito|ho finito|basta|stop|pronto|ecco|ok|vai|crealo|termina)\b/)) { ctx.scanFinish(); return null; }
    const say = (m) => { if (m) notify(m, true); return m; };
    // «sul tavolo», «sulla scrivania» dicono dove, non cosa
    const item = findItem(t.replace(/\b(sul|sulla|al|alla|nel|nella|dal|dalla|sopra il|sopra la)\s+(tavolo|scrivania|piano)\b/g, ' '));
    const local = has(/(sopra di me|su di me|addosso|sulla (mia )?testa|qui sopra|solo su di me)/);

    if (has(/\b(ciao|salve|buongiorno|buonasera|hey|ehi)\b/) && t.split(' ').length <= 3) return say('Ciao! Cosa creiamo oggi?');
    const more = moreCommands(t, has, say, item);
    if (more !== undefined) return more;
    const early = t.split(' ').length <= 7 ? menuVoice(t, { early: true }) : undefined;
    if (early !== undefined) return early;
    if (has(/chi sei|come ti chiami/)) return say('Sono la tua assistente. In questo mondo posso creare qualsiasi cosa del catalogo, cambiare il tempo e l’ambiente, e smontare tutto.');
    if (has(/aiuto|cosa (sai|puoi) fare|come funziona|cosa posso (fare|dire)/)) return say(HELP);
    if (has(/voce|parla/) && has(/acut|sottil|stridul/)) return run('pitch+', { speak: true });
    if (has(/voce|parla/) && has(/grav|bass|profond/)) return run('pitch-', { speak: true });
    if (has(/ascolt\w* (sempre|di continuo|continu)|ascolto continuo|resta in ascolto/)) return run('listenAlways', { speak: true });
    if (has(/smetti di ascoltare|non ascoltare|basta ascoltare|stop ascolto/)) return run('listenStop', { speak: true });
    if (has(/invit|chi c'?e|chi e qui/)) return run('invite', { speak: true });

    // ---------- poteri: meteo
    if (item && has(/\b(piov|pioggia|acquazzon|diluvi|grandin|cad\w+ dal cielo)/) && !has(/smetti|basta|ferma/)) {
      return say(ctx.rainObjects?.(item, Math.max(countIn(t), 8)));
    }
    if (has(/smetti di (piovere|nevicare)|basta (pioggia|neve|nebbia|temporale)|ferma (la )?(pioggia|neve)|\bsereno\b|cielo (sereno|limpido)|(esce|torna) il sole|niente (pioggia|neve)|togli (la )?(pioggia|neve|nebbia|nuvola)|bel tempo/)) return run('w:clear', { speak: true });
    if (has(/temporal|tempesta|uragan|tuon|bufera/) && !has(/neve/)) return run(local ? 'w:storm-local' : 'w:storm', { speak: true });
    if (has(/\b(fulmin|saett|lampo)/)) return run('w:bolt', { speak: true });
    if (has(/\b(piov|pioggia|acquazzon|diluvi|grandin|scrosci)/)) return run(local ? 'w:rain-local' : 'w:rain', { speak: true });
    if (has(/nevic|fiocchi|tempesta di neve|bufera di neve/) || (has(/\bneve\b/) && !has(/portami|andiamo|polo|aurora|ambiente/))) return run(local ? 'w:snow-local' : 'w:snow', { speak: true });
    if (has(/nebbia|foschia/)) return run('w:fog', { speak: true });
    if (has(/arcobalen/)) return run('w:rainbow', { speak: true });

    // ---------- poteri: il tuo corpo
    if (has(/(diventa|diventare|fammi|rendimi|trasformami|voglio essere|fai di me|sono) (un |una |piu )?(gigante|enorme|altissim|grandissim)/)) return run('p:giant', { speak: true });
    if (has(/(diventa|diventare|fammi|rendimi|trasformami|voglio essere|fai di me) (un |una |piu )?(piccol|minuscol|formica|nano|mini)/)) return run('p:tiny', { speak: true });
    if (has(/(dimensioni?|grandezza|altezza|misura) normal|torna(re)? normale|di nuovo normale/)) return run('p:normal', { speak: true });
    if (has(/atterr|smetti di volare|scendi a terra|torna a terra|basta volare/)) return run('p:fly-off', { speak: true });
    if (has(/\b(vola|volare|volo|levit|fammi volare)/)) return run('p:fly-on', { speak: true });

    // ---------- ambienti: "portami nello spazio", "andiamo sott'acqua"…
    {
      const isMake = SHAPES.some(([, re]) => re.test(t)) || item || has(/\b(crea|aggiungi|colora|cerca)\b/);
      const context = has(/ambient|stanza|scenari|sfondo|mondo|portami|mettimi|andiamo|voglio|vai|torna|cambia|tema|sono|siamo|immergi|fammi vedere|nello|nel |sott/);
      const th = !isMake && (context || t.split(/\s+/).length <= 3) ? ThemeManager.fromText(t) : null;
      if (th) return run('theme:' + th, { speak: true });
    }
    if (has(/diagnostic|cosa non (va|funziona)|perche non (scansion|funzion)/)) {
      Promise.resolve(ctx.diag?.()).then((m) => m && ai.say(m, { full: true }));
      return null;
    }
    if (has(/\b(annulla|cancella|lascia perdere) (la )?scansion/) && ctx.scanCancel) { ctx.scanCancel(); return say('Scansione annullata.'); }
    if (has(/scansion|scanneriz|scanner|digitalizz|rendil[oa] virtual/)) {
      return FEATURES.claudeAI ? run('scan', { speak: true }) : say('La scansione degli oggetti arriverà più avanti.');
    }
    if (has(/passthrough|pass through|realta mista|realta aumentata|stanza reale|mia stanza|vedere (la )?(mia )?(stanza|casa)/)) return run('mr', { speak: true });
    if (has(/gravit/)) {
      const on = !has(/spegn|togli|disattiv|senza|via la|niente/);
      if (!!ctx.physics?.enabled !== on) return run('gravity', { speak: true });
      return say(on ? 'La gravità è già attiva.' : 'La gravità è già spenta.');
    }
    if (has(/annulla|torna indietro/)) return run('undo', { speak: true });
    if (has(/\b(ripeti|rifai)\b/)) return run('redo', { speak: true });

    // ---------- oggetti: crea, oppure agisci su quelli che ci sono
    const verb = /\b(esplodi|smonta|disassembla|apri|ricomponi|rimonta|chiudi|ruota|gira|colora|dipingi|vernicia|ingrandisci|rimpicciolisci|duplica|copia|clona|seleziona|capovolgi|estrai|sposta)\b/.test(t);
    if (item && REMOVE.test(t)) {
      if (!selectByName(item.label)) return say(`Sulla scrivania non vedo: ${item.label.toLowerCase()}.`);
      return run('delete', { speak: true });
    }
    if (item && verb) {
      if (!selectByName(item.label)) return say(`Sulla scrivania non vedo: ${item.label.toLowerCase()}. Dimmi di crearlo.`);
    } else if (item) {
      return say(ctx.spawn?.(item, { count: countIn(t), size: sizeIn(t), where: whereIn(t), color: colorIn(t) }));
    }

    if (has(/(esplodi|smonta|disassembla).*(tutto|completamente|dettaglio)|massimo dettaglio|ogni (singol|pezz)/)) return run('explodeAll', { speak: true });
    if (has(/esplodi|smonta|disassembla|apri/)) return run('explode', { speak: true });
    if (has(/ricomponi|rimonta|riassembla|assembla|richiudi|chiudi/)) return run('collapse', { speak: true });
    if (has(/pulisci|svuota|cancella tutto|elimina tutto|togli tutto|via tutto/)) return run('clear', { speak: true });
    if (REMOVE.test(t)) return run('delete', { speak: true });
    if (has(/raggruppa|unisci/)) return run('group', { speak: true });
    if (has(/separa|dividi|sciogli/)) return run('ungroup', { speak: true });
    if (has(/duplica|copia|clona/)) return run('duplicate', { speak: true });
    if (has(/\bsalva/)) return run('save', { speak: true });
    if (has(/\b(carica|riapri)\b/)) return run('load', { speak: true });
    if (has(/esporta/)) return run('export', { speak: true });
    if (has(/ingrandisci|piu grande|allarga tutto/)) return run('s+', { speak: true });
    if (!item && has(/\bscrivania\b/)) {
      if (has(/rimetti|riporta|a posto|come prima|iniziale|reset/)) { ctx.setRealTable?.(false); ctx.deskGrab?.reset(); return say('Scrivania rimessa al suo posto.'); }
      if (has(/\balza|\bsu\b|piu alt/)) return say(moveDesk(0.05));
      if (has(/abbassa|\bgiu\b|piu bass/)) return say(moveDesk(-0.05));
      if (has(/sposta|muovi|gira|ruota|prendi|avvicina/)) return say('Prendi una delle due maniglie luminose sul bordo davanti e trascinala: con due mani la puoi anche girare.');
    }
    if (has(/rimpicciolisci|piu piccol|riduci/)) return run('s-', { speak: true });
    if (has(/\b(ruota|gira)\b/)) return run('rotate', { speak: true });
    if (has(/capovolgi/)) return run('flip', { speak: true });
    if (has(/deseleziona/)) return run('deselect', { speak: true });
    if (has(/seleziona tutto/)) return run('selectAll', { speak: true });
    if (has(/torna (alla scrivania|qui)|vieni qui|riportami/)) return run('home', { speak: true });
    if (has(/lampada|accendi la luce|spegni la luce/)) return run('lamp', { speak: true });
    if (has(/quanto (e|misura)|dimensioni|misure/)) return say(workspace.info().replace(/×/g, 'per').replace(/mm/, 'millimetri'));
    if (has(/colore|colora|dipingi|vernicia/)) {
      if (!workspace.selected.size) { const last = workspace.topLevel().at(-1); if (!last) return say('Prima crea qualcosa da colorare.'); workspace.selected = new Set([last]); }
      const c = colorIn(t);
      workspace.colorSelected(c);
      return say(c != null ? 'Fatto, nuovo colore.' : 'Ho cambiato colore.');
    }
    const viaMenu = menuVoice(t);
    if (viaMenu !== undefined) return viaMenu;
    const shape = SHAPES.find(([, re]) => re.test(t));
    if (shape) return run(shape[0], { speak: true });
    const m = t.match(/\b(crea|creami|fammi|fai|metti|mettimi|aggiungi|genera|costruisci|evoca|voglio|dammi|disegna|materializza|appari)\b\s+(?:un |uno |una |un'|il |lo |la |dei |delle |degli |i |gli |le )?(\w+)/);
    // non capito: con Claude collegato ci pensa lui (vedi command() in main.js)
    if (opts.unhandled) return opts.unhandled;
    if (m) return say(`«${m[2]}» non è tra i miei oggetti pronti. Inserisci la chiave di Claude nella pagina iniziale e potrò costruire qualsiasi cosa; intanto guarda la scheda Crea.`);
    return say('Non ho capito bene: ripetilo in un altro modo.');
  }

  return {
    run,
    voice,
    /**
     * Comando detto a voce: ripara le parole storpiate dal riconoscimento.
     * 1) quasi identico a un comando noto → quel comando; 2) altrimenti la frase così com'è;
     * 3) se non la capisco, il comando che le somiglia di più; 4) altrimenti non capito (o Claude).
     */
    hear(raw, opts = {}) {
      PHRASES_READY ||= (setCommandPhrases(commandPhrases()), true);
      const t = fixTranscript(raw);
      const m = matchCommand(t);
      if (m && m.score >= 0.86 && norm(m.text) !== norm(t)) return voice(m.text, opts);
      const NO = Symbol('no');
      const r = voice(t, { unhandled: NO });
      if (r !== NO) return r;
      if (m && m.score >= 0.6) { ai.setSubtitle(`Ho capito: «${m.text}»`); return voice(m.text, opts); }
      return opts.unhandled || voice(t);
    },
    /** Comando del menu riconosciuto con sicurezza (usato prima di chiedere a Claude). */
    menu: (raw) => {
      const t = norm(fixTranscript(raw));
      if (t.split(' ').length > 9) return undefined;
      const r = menuVoice(t, { early: true });
      if (r !== undefined) return r;
      const say = (m) => { if (m) notify(m, true); return m; };
      return moreCommands(t, (re) => re.test(t), say, findItem(t));
    },
    get multi() { return multi; },
    get twoHand() { return settings.twoHand; },
    tickHistory,
    announce: (msg) => notify(msg, false),
    undo,
    status() { return [workspace.info(), lastMsg]; },
  };
}
