import { THEMES, ThemeManager } from './themes.js';

export const PANEL_LAYOUT = [
  { id: 'box', label: 'Cubo', group: 'crea' },
  { id: 'cylinder', label: 'Cilindro', group: 'crea' },
  { id: 'sphere', label: 'Sfera', group: 'crea' },
  { id: 'cone', label: 'Cono', group: 'crea' },
  { id: 'torus', label: 'Toro', group: 'crea' },
  { id: 'tube', label: 'Tubo', group: 'crea' },
  { id: 'gear', label: 'Ingranaggio', group: 'crea' },
  { id: 'screw', label: 'Vite + dado', group: 'crea' },

  { id: 'duplicate', label: 'Duplica', group: 'modifica' },
  { id: 'delete', label: 'Elimina', group: 'modifica' },
  { id: 'group', label: 'Raggruppa', group: 'modifica' },
  { id: 'ungroup', label: 'Separa', group: 'modifica' },

  { id: 'explode', label: 'Esplodi', group: 'esplodi' },
  { id: 'explodeAll', label: 'Esplodi tutto', group: 'esplodi' },
  { id: 'collapse', label: 'Ricomponi', group: 'esplodi' },
  { id: 'sample', label: 'Drone demo', group: 'esplodi' },

  { id: 'sx+', label: 'Largh +', group: 'misura' },
  { id: 'sx-', label: 'Largh −', group: 'misura' },
  { id: 'sy+', label: 'Alt +', group: 'misura' },
  { id: 'sy-', label: 'Alt −', group: 'misura' },
  { id: 'sz+', label: 'Prof +', group: 'misura' },
  { id: 'sz-', label: 'Prof −', group: 'misura' },
  { id: 's+', label: 'Scala +', group: 'misura' },
  { id: 's-', label: 'Scala −', group: 'misura' },

  { id: 'rotate', label: 'Ruota 45°', group: 'modifica' },
  { id: 'color', label: 'Colore', group: 'modifica' },
  { id: 'multi', label: 'Multi: NO', group: 'modifica' },
  { id: 'deselect', label: 'Deseleziona', group: 'modifica' },

  { id: 'talk', label: 'Parla con AI', group: 'sistema' },
  { id: 'save', label: 'Salva', group: 'sistema' },
  { id: 'load', label: 'Carica', group: 'sistema' },
  { id: 'export', label: 'Esporta GLB', group: 'sistema' },

  { id: 'deskUp', label: 'Scrivania ▲', group: 'sistema' },
  { id: 'deskDown', label: 'Scrivania ▼', group: 'sistema' },
  { id: 'clear', label: 'Pulisci', group: 'sistema' },
  { id: 'help', label: 'Aiuto', group: 'sistema' },

  { id: 'home', label: 'Torna qui', group: 'muovi' },
  { id: 'turnL', label: 'Gira ◀', group: 'muovi' },
  { id: 'turnR', label: 'Gira ▶', group: 'muovi' },
  { id: 'lamp', label: 'Lampada', group: 'muovi' },

  { id: 'theme:buio', label: 'Buio', group: 'ambiente' },
  { id: 'theme:spazio', label: 'Spazio', group: 'ambiente' },
  { id: 'theme:acqua', label: "Sott'acqua", group: 'ambiente' },
  { id: 'theme:tramonto', label: 'Tramonto', group: 'ambiente' },
  { id: 'theme:aurora', label: 'Aurora', group: 'ambiente' },
  { id: 'invite', label: 'Invita', group: 'ambiente' },
  { id: 'pitch+', label: 'Voce acuta', group: 'ambiente' },
  { id: 'pitch-', label: 'Voce grave', group: 'ambiente' },
];

const SAVE_KEY = 'officina-xr-save';
const DESK_KEY = 'officina-xr-desk';

const HELP = 'Crea un pezzo dal pannello. Con le mani pizzicalo per prenderlo, tocca i pulsanti col dito, e usa due mani per ingrandirlo. '
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
    save: () => (store.set(SAVE_KEY, JSON.stringify(workspace.serialize())) ? 'Progetto salvato.' : 'Non riesco a salvare in questo browser.'),
    load: () => {
      const raw = store.get(SAVE_KEY);
      if (!raw) return 'Nessun salvataggio trovato.';
      try { workspace.load(JSON.parse(raw)); return 'Progetto caricato.'; } catch { return 'Il salvataggio è danneggiato.'; }
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

  const SPOKEN = new Set(['sample', 'help', 'explodeAll', 'group']);

  function run(id, { speak } = {}) {
    panel.press(id);
    let msg;
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
    if (['box', 'cylinder', 'sphere', 'cone', 'torus', 'tube', 'gear', 'screw'].includes(id)) {
      const n = workspace.createPrimitive(id);
      msg = `${n.name} creat${n.name.endsWith('a') ? 'a' : 'o'}. Afferralo per spostarlo.`;
    } else {
      msg = handlers[id]?.();
    }
    if (msg) notify(msg, speak ?? SPOKEN.has(id));
    return msg;
  }

  /** Interpreta un comando in linguaggio naturale (italiano). */
  function voice(raw) {
    const t = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const has = (re) => re.test(t);
    const say = (m) => { notify(m, true); return m; };

    if (has(/\b(ciao|salve|buongiorno|buonasera|hey)\b/) && t.split(' ').length <= 3) return say('Ciao! Cosa costruiamo oggi?');
    if (has(/chi sei|come ti chiami/)) return say('Sono la tua assistente di officina. Ti aiuto a creare, assemblare e smontare oggetti.');
    if (has(/aiuto|cosa (sai|puoi) fare|come funziona/)) return say(HELP);
    if (has(/voce|parla/) && has(/acut|sottil|stridul/)) return run('pitch+', { speak: true });
    if (has(/voce|parla/) && has(/grav|bass|profond/)) return run('pitch-', { speak: true });
    if (has(/invit|chi c'?e|chi e qui/)) return run('invite', { speak: true });
    {
      // ambienti: "portami nello spazio", "andiamo sott'acqua"… (ma "crea un cubo nero" crea un cubo)
      const isShape = SHAPES.some(([, re]) => re.test(t)) || has(/\b(crea|aggiungi|colora|cerca)\b/);
      const context = has(/ambient|stanza|scenari|sfondo|mondo|portami|mettimi|andiamo|voglio|vai|torna|cambia|tema|sono|siamo|immergi|fammi vedere|nello|nel |sott/);
      const th = !isShape && (context || t.split(/\s+/).length <= 3) ? ThemeManager.fromText(t) : null;
      if (th) return run('theme:' + th, { speak: true });
    }
    if (has(/drone|esempio|demo/)) return run('sample', { speak: true });
    if (has(/(esplodi|smonta|disassembla).*(tutto|completamente|dettaglio)|massimo dettaglio|ogni (singol|pezz)/)) return run('explodeAll', { speak: true });
    if (has(/esplodi|smonta|disassembla|apri/)) return run('explode', { speak: true });
    if (has(/ricomponi|rimonta|riassembla|assembla|richiudi|chiudi/)) return run('collapse', { speak: true });
    if (has(/pulisci|svuota|cancella tutto|elimina tutto/)) return run('clear', { speak: true });
    if (has(/elimina|cancella|togli|butta/)) return run('delete', { speak: true });
    if (has(/raggruppa|unisci/)) return run('group', { speak: true });
    if (has(/separa|dividi|sciogli/)) return run('ungroup', { speak: true });
    if (has(/duplica|copia|clona/)) return run('duplicate', { speak: true });
    if (has(/salva/)) return run('save', { speak: true });
    if (has(/carica|riapri/)) return run('load', { speak: true });
    if (has(/esporta/)) return run('export', { speak: true });
    if (has(/ingrandisci|piu grande|allarga tutto/)) return run('s+', { speak: true });
    if (has(/rimpicciolisci|piu piccol|riduci/)) return run('s-', { speak: true });
    if (has(/ruota|gira/)) return run('rotate', { speak: true });
    if (has(/deseleziona/)) return run('deselect', { speak: true });
    if (has(/torna|scrivania|vieni qui/)) return run('home', { speak: true });
    if (has(/lampada|luce/)) return run('lamp', { speak: true });
    if (has(/quanto (e|misura)|dimensioni|misure/)) return say(workspace.info().replace(/×/g, 'per').replace(/mm/, 'millimetri'));
    if (has(/colore|colora|dipingi|vernicia/)) {
      const key = Object.keys(COLORS).find((k) => t.includes(k));
      if (!workspace.selected.size) return say('Seleziona prima cosa vuoi colorare.');
      workspace.colorSelected(key ? COLORS[key] : null);
      return say(key ? 'Fatto, nuovo colore.' : 'Ho cambiato colore.');
    }
    const shape = SHAPES.find(([, re]) => re.test(t));
    if (shape) return run(shape[0], { speak: true });
    return say('Non ho capito. Prova con: crea un ingranaggio, raggruppa, esplodi tutto, ricomponi.');
  }

  return {
    run,
    voice,
    get multi() { return multi; },
    status() { return [workspace.info(), lastMsg]; },
  };
}
