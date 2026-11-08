import { THEMES, ThemeManager } from './themes.js';

import { LIBRARY } from './library.js';
import { FEATURES } from './features.js';
import { CATALOG } from './catalog.js';
import { norm, findItem, countIn, colorIn, sizeIn, whereIn, REMOVE } from './intent.js';

const b = (id, label) => ({ id, label });

// stato del menu Oggetti: categoria scelta e misura con cui creare
export const objectMenu = { cat: 'tech', size: 'auto' };
const SIZE_LABEL = { auto: 'Misura: AUTO', mini: 'Misura: MINI', real: 'Misura: REALE', giant: 'Misura: GIGANTE' };

/** Il pannello a sinistra della scrivania, diviso in schede. */
export const PANEL_TABS = [
  {
    id: 'crea', label: 'Crea', color: '#3fa9ff', hint: 'Tocca una forma: compare sulla scrivania, poi prendila con la mano.',
    buttons: [
      b('box', 'Cubo'), b('sphere', 'Sfera'), b('cylinder', 'Cilindro'), b('cone', 'Cono'),
      b('pyramid', 'Piramide'), b('torus', 'Toro'), b('tube', 'Tubo'), b('gear', 'Ingranaggio'),
      b('screw', 'Vite + dado'), b('duplicate', 'Duplica'), b('color', 'Colore'), b('undo', 'Annulla'),
      ...(FEATURES.claudeAI ? [b('scan', 'Scansiona oggetto')] : []),
    ],
  },
  {
    id: 'libreria', label: 'Libreria', color: '#ffc845', hint: 'Oggetti già montati: smontali pezzo per pezzo (scheda Smonta).',
    buttons: LIBRARY.map((it) => b('lib:' + it.id, it.label)),
  },
  {
    id: 'oggetti', label: 'Oggetti', color: '#ff7fd0', hint: 'Scegli una categoria, poi tocca un oggetto. AUTO: piccolo sulla scrivania, REALE: vero, davanti a te.',
    get buttons() {
      const cat = CATALOG.find((c) => c.id === objectMenu.cat) || CATALOG[0];
      const items = cat.items.map((it) => b('obj:' + it.id, it.label));
      while (items.length < 8) items.push(null);
      return [
        ...CATALOG.map((c) => b('cat:' + c.id, (c.id === objectMenu.cat ? '● ' : '') + c.label)),
        ...items.slice(0, 8),
        b('size', SIZE_LABEL[objectMenu.size]), b('undo', 'Annulla'), b('delete', 'Elimina'), b('clear', 'Svuota'),
      ];
    },
  },
  {
    id: 'poteri', label: 'Poteri', color: '#ffd84a', hint: 'Sei il dio di questo mondo. Puoi anche dirlo a voce: «fai piovere sopra di me».',
    buttons: [
      b('w:rain', 'Pioggia'), b('w:rain-local', 'Pioggia su di me'), b('w:storm', 'Temporale'), b('w:bolt', 'Fulmine'),
      b('w:snow', 'Neve'), b('w:fog', 'Nebbia'), b('w:rainbow', 'Arcobaleno'), b('w:clear', 'Sereno'),
      b('p:giant', 'Diventa gigante'), b('p:tiny', 'Diventa minuscolo'), b('p:normal', 'Misura normale'), b('p:fly', 'Volo: NO'),
      b('rainPizza', 'Pioggia di pizze'), b('gravity', 'Gravità: NO'), b('talk', 'Parla (A)'), b('listenAlways', 'Ascolto: NO'),
    ],
  },
  {
    id: 'modifica', label: 'Modifica', color: '#45d483', hint: 'Agisce sugli oggetti selezionati (evidenziati in blu).',
    buttons: [
      b('duplicate', 'Duplica'), b('delete', 'Elimina'), b('group', 'Raggruppa'), b('ungroup', 'Separa'),
      b('rotate', 'Ruota 45°'), b('flip', 'Capovolgi'), b('color', 'Colore'), b('multi', 'Multi: NO'),
      b('selectAll', 'Seleziona tutto'), b('deselect', 'Deseleziona'), b('undo', 'Annulla'), b('redo', 'Ripeti'),
    ],
  },
  {
    id: 'misure', label: 'Misure', color: '#ff9f43', hint: 'Oppure prendi l’oggetto con due mani e allargale.',
    buttons: [
      b('s+', 'Scala +'), b('s-', 'Scala −'), b('resetScale', 'Misura originale'), b('measure', 'Quanto misura?'),
      b('sx+', 'Largh +'), b('sx-', 'Largh −'), b('sy+', 'Alt +'), b('sy-', 'Alt −'),
      b('sz+', 'Prof +'), b('sz-', 'Prof −'), b('s*2', 'Doppio'), b('s/2', 'Metà'),
    ],
  },
  {
    id: 'smonta', label: 'Smonta', color: '#ff6b4a', hint: 'Doppio pizzico apre/chiude · pizzico lungo estrae un pezzo · due mani allargano.',
    buttons: [
      b('explode', 'Esplodi'), b('explodeAll', 'Esplodi tutto'), b('collapse', 'Ricomponi'), b('extract', 'Estrai pezzo'),
      b('twohand', 'Due mani: SCALA'), b('gestures', 'Come si fa?'), b('collapseAll', 'Ricomponi tutto'), b('reassemble', 'Rimonta estratti'),
    ],
  },
  {
    id: 'mondo', label: 'Mondo', color: '#b57bff', hint: 'Il tuo mondo privato: ambiente, gravità, luce e posizione.',
    buttons: [
      b('theme:buio', 'Buio'), b('theme:spazio', 'Spazio'), b('theme:acqua', "Sott'acqua"), b('theme:tramonto', 'Tramonto'),
      b('theme:aurora', 'Aurora'), b('gravity', 'Gravità: NO'), b('lamp', 'Lampada'), b('home', 'Torna qui'),
      b('turnL', 'Gira ◀'), b('turnR', 'Gira ▶'), b('deskUp', 'Scrivania ▲'), b('deskDown', 'Scrivania ▼'),
      b('mr', 'Realtà mista'), b('deskToggle', 'Scrivania: SÌ'),
    ],
  },
  {
    id: 'sistema', label: 'Sistema', color: '#7fe3ff', hint: 'Tutto resta salvato su questo visore: è il tuo mondo personale.',
    buttons: [
      b('slot', 'Progetto 1'), b('save', 'Salva'), b('load', 'Apri'), b('new', 'Nuovo'),
      b('talk', 'Parla con AI'), b('pitch+', 'Voce acuta'), b('pitch-', 'Voce grave'), b('help', 'Aiuto'),
      b('export', 'Esporta GLB'), b('invite', 'Invita'), b('clear', 'Svuota'),
    ],
  },
];

const SAVE_KEY = 'officina-xr-save'; // + numero del progetto
const DESK_KEY = 'officina-xr-desk';

const GESTURES = 'Per smontare: fai un doppio pizzico su un oggetto per aprirlo, un altro doppio pizzico per richiuderlo. '
  + 'Tieni il pizzico fermo per mezzo secondo su un componente: si stacca e te lo ritrovi in mano. '
  + 'Con Due mani su Esplodi, prendi un oggetto con due mani e allargale: si apre quanto vuoi. '
  + 'Per buttare qualcosa, lascialo cadere nel cestino accanto alla scrivania.';

const HELP = 'Puoi dirmi di creare quasi qualsiasi cosa: un maiale, una macchina vera, tre pizze, uno scheletro gigante, una casa. '
  + 'Puoi cambiare il tempo: fai piovere sopra di me, temporale, neve, arcobaleno. Puoi diventare gigante o minuscolo, e volare. '
  + 'Crea un pezzo dal pannello. Con le mani pizzicalo per prenderlo, tocca i pulsanti col dito, e usa due mani per ingrandirlo. '
  + 'Coi controller usa grilletto e grip; lo stick sinistro ti fa camminare, il destro ti gira. Punta il pavimento e premi per teletrasportarti. '
  + 'Raggruppa unisce più pezzi in un assieme. Puoi cambiare ambiente: spazio, sott\'acqua, tramonto, aurora. '
  + 'Esplodi apre un livello alla volta, Esplodi tutto smonta fino all’ultima vite, Ricomponi rimonta.';

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
  let lastMsg = 'Ciao! Sono qui in fondo, nel buio. Crea qualcosa sulla scrivania.';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  };

  const deskY = parseFloat(store.get(DESK_KEY));
  if (!Number.isNaN(deskY)) env.setDeskHeight(deskY);

  function notify(msg, speak = false) {
    lastMsg = msg;
    if (speak) ai.say(msg);
  }
  ai.onText = (t) => { lastMsg = t; };

  const need = (fn, msg = 'Prima seleziona qualcosa.') => (workspace.selected.size ? fn() : msg);

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
    deskUp: () => moveDesk(0.03),
    deskDown: () => moveDesk(-0.03),
    clear: () => (workspace.clear(), 'Scrivania ripulita.'),
    help: () => HELP,
    home: () => (env.home?.(), 'Sei tornato alla scrivania.'),
    turnL: () => (env.turn?.(Math.PI / 6), null),
    turnR: () => (env.turn?.(-Math.PI / 6), null),
    lamp: () => (env.toggleLamp() ? 'Lampada accesa.' : 'Lampada spenta.'),
    invite: () => {
      if (!ctx.net?.room) return 'Per invitare qualcuno devi accedere: togli il visore e usa il riquadro «Il tuo account» nella pagina.';
      const others = Object.values(ctx.net.people).map((p) => p.name);
      return `Per invitare qualcuno, nella pagina del browser tocca «Invita qualcuno» e manda il link. ${others.length ? 'Ora qui ci sono: ' + others.join(', ') + '.' : 'Per ora sei da solo.'}`;
    },
    'pitch+': () => (ai.changePitch(0.15), 'Ora parlo più acuto.'),
    'pitch-': () => (ai.changePitch(-0.15), 'Ora ho una voce più grave.'),
  };

  function moveDesk(dy) {
    const y = Math.max(-0.25, Math.min(0.4, env.deskRig.position.y + dy));
    env.setDeskHeight(y);
    store.set(DESK_KEY, String(y));
    return `Altezza scrivania: ${Math.round((0.75 + y) * 100)} cm.`;
  }

  const SPOKEN = new Set(['sample', 'help', 'explodeAll', 'group', 'gestures', 'gravity', 'twohand']);

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
  function voice(raw) {
    const t = norm(raw);
    const has = (re) => re.test(t);
    const say = (m) => { if (m) notify(m, true); return m; };
    const item = findItem(t);
    const local = has(/(sopra di me|su di me|addosso|sulla (mia )?testa|qui sopra|solo su di me)/);

    if (has(/\b(ciao|salve|buongiorno|buonasera|hey|ehi)\b/) && t.split(' ').length <= 3) return say('Ciao! Cosa creiamo oggi?');
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
      if (!selectByName(item.label)) return say(`Qui non c'è nessun ${item.label.toLowerCase()}.`);
      return run('delete', { speak: true });
    }
    if (item && verb) {
      if (!selectByName(item.label)) return say(`Qui non c'è nessun ${item.label.toLowerCase()}: dimmi di crearlo.`);
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
    if (has(/rimpicciolisci|piu piccol|riduci/)) return run('s-', { speak: true });
    if (has(/\b(ruota|gira)\b/)) return run('rotate', { speak: true });
    if (has(/capovolgi/)) return run('flip', { speak: true });
    if (has(/deseleziona/)) return run('deselect', { speak: true });
    if (has(/seleziona tutto/)) return run('selectAll', { speak: true });
    if (has(/torna (alla scrivania|qui)|vieni qui|riportami/)) return run('home', { speak: true });
    if (has(/lampada|accendi la luce|spegni la luce/)) return run('lamp', { speak: true });
    if (has(/quanto (e|misura)|dimensioni|misure/)) return say(workspace.info().replace(/×/g, 'per').replace(/mm/, 'millimetri'));
    if (has(/colore|colora|dipingi|vernicia/)) {
      if (!workspace.selected.size) return say('Dimmi cosa colorare, per esempio: colora il maiale di blu.');
      const c = colorIn(t);
      workspace.colorSelected(c);
      return say(c != null ? 'Fatto, nuovo colore.' : 'Ho cambiato colore.');
    }
    const shape = SHAPES.find(([, re]) => re.test(t));
    if (shape) return run(shape[0], { speak: true });
    const m = t.match(/\b(crea|creami|fammi|fai|metti|mettimi|aggiungi|genera|costruisci|evoca|voglio|dammi|disegna|materializza|appari)\b\s+(?:un |uno |una |un'|il |lo |la |dei |delle |degli |i |gli |le )?(\w+)/);
    if (m) return say(`Non ho ancora ${m[2]} nel mio catalogo. Apri la scheda Oggetti: ci sono più di cinquanta cose, da animali e veicoli a cibo, mobili e persone.`);
    return say('Non ho capito bene: ripetilo in un altro modo.');
  }

  return {
    run,
    voice,
    get multi() { return multi; },
    get twoHand() { return settings.twoHand; },
    tickHistory,
    announce: (msg) => notify(msg, false),
    undo,
    status() { return [workspace.info(), lastMsg]; },
  };
}
