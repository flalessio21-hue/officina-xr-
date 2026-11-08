/**
 * Il "cervello" dell'AI: Claude (Anthropic) con strumenti che agiscono sul mondo.
 *
 * - La chiave API resta solo in questo browser (localStorage), mai nel codice o su GitHub.
 * - Senza chiave l'app usa l'interprete di comandi locale (actions.voice).
 * - Scansione: foto dell'oggetto dalla fotocamera del visore → Claude lo riconosce e lo
 *   ricostruisce con pezzi veri (assieme smontabile).
 */
import { LIBRARY } from './library.js';
import { ALL_ITEMS } from './catalog.js';
import { THEMES } from './themes.js';
import { FEATURES } from './features.js';

const KEY_STORE = 'officina-anthropic-key';
const MODEL = 'claude-opus-5-5';
const SDK_URL = new URL('./vendor/anthropic-sdk-1.3.0.mjs', import.meta.url).href;

const SYSTEM = `Sei l'assistente dell'Officina: un'intelligenza che vive in un mondo virtuale privato (Meta Quest), dove l'utente ha una scrivania, crea oggetti, li smonta e cambia ambiente.

Come ti comporti:
- Sei decisa e concreta. Quando l'utente chiede qualcosa, lo FAI subito con gli strumenti, senza chiedere conferma e senza proporre alternative. Se la richiesta è vaga, scegli tu l'interpretazione più sensata, eseguila e dillo in breve.
- Rispondi in italiano, con una o due frasi brevi e sicure: le tue risposte vengono lette ad alta voce, quindi niente elenchi, niente markdown, niente emoji, niente domande inutili.
- Puoi fare più azioni di fila per soddisfare una richiesta (per esempio: creare tre cubi, colorarli di rosso e ingrandirli).
- Quando l'utente chiede un oggetto: se c'è nel catalogo usa spawn_catalog; altrimenti costruiscilo con build_object in modo realistico (misure vere, forme fedeli, materiali credibili, componenti smontabili). Non dire mai che non puoi crearlo.
- Se l'utente vuole digitalizzare un oggetto vero che ha in mano, usa scan_object (in realtà mista parte anche da sola quando prende un oggetto in mano).
- La scrivania si sposta prendendo le maniglie luminose sul bordo; tu sei un ologramma sulla scrivania.
- Se ti chiedono informazioni (cosa c'è sulla scrivania, misure, come si fa qualcosa) rispondi con precisione usando describe_scene se serve.
- Gesti che puoi spiegare: pizzico per prendere, doppio pizzico per aprire o chiudere un oggetto, pizzico tenuto fermo per estrarre un componente, due mani per scalare o aprire, cestino accanto alla scrivania per buttare via.
- Non puoi aprire siti web o fare cose fuori da questo mondo: se te lo chiedono, dillo in una frase.`;

const ACTIONS = [
  'explode', 'explodeAll', 'collapse', 'collapseAll', 'extract', 'reassemble',
  'duplicate', 'delete', 'group', 'ungroup', 'rotate', 'flip', 'selectAll', 'deselect',
  'undo', 'redo', 'clear', 'save', 'load', 'new', 'resetScale',
  'gravity_on', 'gravity_off', 'lamp', 'home', 'turnL', 'turnR', 'deskUp', 'deskDown',
  'desk_show', 'desk_hide', 'mixed_reality', 'pitch+', 'pitch-', 'export',
  ...Object.keys(THEMES).map((t) => 'theme:' + t),
];
const SHAPES = ['box', 'sphere', 'cylinder', 'cone', 'pyramid', 'torus', 'tube', 'gear', 'screw'];
const KINDS = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'tube', 'gear'];

const tool = (name, description, properties) => ({
  name, description, strict: true,
  input_schema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
});

const vec3 = (what) => ({ type: 'array', items: { type: 'number' }, description: what });

// Ricostruzione da scansione: forme realistiche + quale foto mostra quale lato
const num = { type: 'number' };
const SCAN_PART = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Nome del pezzo in italiano' },
    group: { type: 'string', description: 'Componente a cui appartiene (es. "Corpo", "Manico", "Tappo"): pezzi dello stesso componente si smontano insieme' },
    kind: { type: 'string', enum: ['rbox', 'box', 'cylinder', 'sphere', 'cone', 'torus', 'tube', 'lathe', 'extrude'] },
    size_mm: { type: 'array', items: num, description: 'Ingombro [X larghezza, Y altezza, Z profondità] in mm. cylinder/cone/tube: X = diametro, Y = altezza. torus: X = diametro esterno, Y = spessore. lathe: ignorato (usa profile_mm). extrude: Z = spessore.' },
    position_mm: { type: 'array', items: num, description: 'Centro del pezzo [x, y, z] in mm; origine = centro della base dell\'oggetto, y verso l\'alto, z verso chi guarda il davanti.' },
    rotation_deg: { type: 'array', items: num, description: 'Rotazione [x, y, z] in gradi' },
    color: { type: 'string', description: 'Colore medio reale #rrggbb' },
    roughness: { type: 'number', description: '0 lucido (vetro, ceramica smaltata, cromo) … 1 opaco (gomma, tessuto, legno grezzo)' },
    metalness: { type: 'number', description: '1 per metallo nudo, 0 per tutto il resto' },
    opacity: { type: 'number', description: '1 opaco; 0.2-0.5 per vetro o plastica trasparente' },
    radius_mm: { type: 'number', description: 'rbox: raggio degli spigoli; extrude: smusso dei bordi; tube: spessore della parete. 0 se non serve.' },
    profile_mm: { type: 'array', items: { type: 'array', items: num }, description: 'Solo lathe: profilo [raggio, altezza] dal basso verso l\'alto (8-30 punti), per tazze, bottiglie, bicchieri, vasi, lampadine, manopole. Per un oggetto cavo (tazza) torna indietro lungo l\'interno. [] per gli altri.' },
    outline_mm: { type: 'array', items: { type: 'array', items: num }, description: 'Solo extrude: contorno visto di fronte [x, y] in mm (8-40 punti, senso antiorario), per oggetti piatti dalla sagoma particolare (chiavi, telefoni, telecomandi, forbici). [] per gli altri.' },
    photo: { type: 'boolean', description: 'true se sulla superficie esterna di questo pezzo vanno proiettate le foto vere (corpo, etichette, schermi); false per pezzi interni o piccoli dettagli' },
  },
  required: ['name', 'group', 'kind', 'size_mm', 'position_mm', 'rotation_deg', 'color', 'roughness', 'metalness', 'opacity', 'radius_mm', 'profile_mm', 'outline_mm', 'photo'],
  additionalProperties: false,
};
const SCAN_TOOL = tool('ricostruisci_oggetto', 'Ricostruisce in 3D l\'oggetto che l\'utente tiene in mano nelle foto.', {
  found: { type: 'boolean', description: 'false se nelle foto non si vede chiaramente nessun oggetto tenuto in mano' },
  name: { type: 'string', description: 'Nome preciso dell\'oggetto (es. "Tazza bianca da caffè", "Telecomando Samsung")' },
  description: { type: 'string', description: 'Una frase breve e naturale da dire a voce all\'utente su cosa hai ricostruito' },
  parts: { type: 'array', items: SCAN_PART, description: 'Da 3 a 40 pezzi, con misure reali. Forme fedeli: lathe per oggetti rotondi, rbox per scatole e dispositivi, extrude per sagome piatte.' },
  photos: {
    type: 'array',
    description: 'Per ogni foto utile: quale lato dell\'oggetto mostra e dove si trova l\'oggetto nella foto. Al massimo una foto per lato, la più nitida e frontale.',
    items: {
      type: 'object',
      properties: {
        index: { type: 'integer', description: 'Numero della foto (da 0)' },
        side: { type: 'string', enum: ['front', 'back', 'left', 'right', 'top', 'bottom'], description: 'Lato visto (front = il davanti, che nel modello guarda verso +z)' },
        box: { type: 'array', items: num, description: 'Riquadro dell\'oggetto nella foto [x0, y0, x1, y1] in frazioni 0..1 (origine in alto a sinistra), stretto sull\'oggetto, senza la mano se possibile' },
        rotate: { type: 'integer', enum: [0, 90, 180, 270], description: 'Rotazione in senso orario per mettere l\'oggetto in piedi com\'è nel modello' },
      },
      required: ['index', 'side', 'box', 'rotate'],
      additionalProperties: false,
    },
  },
});

const BUILD_TOOL = tool('build_object', 'Costruisce un oggetto nuovo e realistico (assieme smontabile), quando non c\'è già nel catalogo.', {
  name: { type: 'string', description: 'Nome dell\'oggetto in italiano' },
  scale: { type: 'string', enum: ['real', 'desk'], description: 'real = grandezza vera (se è più grande della scrivania compare davanti all\'utente); desk = modellino in scala sulla scrivania' },
  parts: { type: 'array', items: SCAN_PART, description: 'Da 4 a 60 pezzi con misure vere in mm. Forme fedeli: lathe per le cose rotonde, rbox per dispositivi e mobili, extrude per sagome piatte; materiali credibili. Usa "group" per i componenti che si smontano insieme.' },
});
const CATALOG_TOOL = tool('spawn_catalog', 'Mette un oggetto del catalogo già pronto. Preferiscilo a build_object quando l\'oggetto c\'è.', {
  item: { type: 'string', enum: ALL_ITEMS.map((it) => it.id), description: ALL_ITEMS.map((it) => `${it.id} = ${it.label}`).join(', ') },
  count: { type: 'integer', description: 'Quanti (1-10)' },
  size: { type: 'string', enum: ['auto', 'mini', 'real', 'giant'], description: 'auto = vero se sta sulla scrivania, altrimenti davanti all\'utente in miniatura; real = grandezza vera davanti all\'utente' },
});

const TOOLS = [
  tool('create_shapes', 'Crea forme semplici sulla scrivania (e le seleziona).', {
    shape: { type: 'string', enum: SHAPES },
    count: { type: 'integer', description: 'Quante (1-12)' },
    color: { type: 'string', description: 'Colore #rrggbb, oppure stringa vuota per un colore automatico' },
  }),
  tool('load_object', 'Mette sulla scrivania un oggetto già montato della libreria (e lo seleziona).', {
    object: { type: 'string', enum: LIBRARY.map((it) => it.id), description: LIBRARY.map((it) => `${it.id} = ${it.label}`).join(', ') },
  }),
  CATALOG_TOOL,
  BUILD_TOOL,
  tool('scan_object', 'Avvia la scansione dell\'oggetto vero che l\'utente tiene in mano (serve la realtà mista).', {}),
  tool('select', 'Seleziona gli oggetti sulla scrivania il cui nome contiene il testo dato ("*" = tutti, "" = nessuno). Le altre azioni agiscono sulla selezione.', {
    name: { type: 'string' },
  }),
  tool('resize', 'Cambia le misure degli oggetti selezionati.', {
    axis: { type: 'string', enum: ['all', 'x', 'y', 'z'], description: 'all = in proporzione; x larghezza, y altezza, z profondità' },
    mode: { type: 'string', enum: ['factor', 'millimeters'], description: 'factor = moltiplica; millimeters = porta la misura a questo valore (con all: la dimensione maggiore)' },
    value: { type: 'number' },
  }),
  tool('set_color', 'Colora gli oggetti selezionati.', { color: { type: 'string', description: '#rrggbb' } }),
  tool('run_commands', 'Esegue comandi in ordine. explode apre di un livello, explodeAll smonta tutto, collapse ricompone, extract stacca i pezzi selezionati, reassemble li rimette a posto; theme:* cambia ambiente; mixed_reality passa al passthrough; desk_show/desk_hide mostra o nasconde la scrivania.', {
    commands: { type: 'array', items: { type: 'string', enum: ACTIONS } },
  }),
  tool('describe_scene', 'Restituisce cosa c\'è sulla scrivania, la selezione, le misure, ambiente e gravità.', {}),
];

const hexColor = (s) => (/^#?[0-9a-f]{6}$/i.test(s || '') ? parseInt(s.replace('#', ''), 16) : null);

export class Brain {
  constructor({ workspace, actions, ai, themes, physics, env, panel, extra }) {
    Object.assign(this, { workspace, actions, ai, themes, physics, env, panel, extra });
    this.history = [];
    this.busy = false;
  }

  get key() {
    try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; }
  }

  setKey(k) {
    try {
      if (k) localStorage.setItem(KEY_STORE, k.trim()); else localStorage.removeItem(KEY_STORE);
    } catch { /* niente */ }
    this.client = null;
    this.history = [];
  }

  get enabled() { return FEATURES.claudeAI && !!this.key; }

  async getClient() {
    if (!this.client) {
      const { default: Anthropic } = await import(SDK_URL);
      this.Anthropic = Anthropic;
      // chiave personale salvata solo su questo visore: l'app è privata e gira solo per te
      this.client = new Anthropic({ apiKey: this.key, dangerouslyAllowBrowser: true, maxRetries: 1 });
    }
    return this.client;
  }

  sceneState() {
    const ws = this.workspace;
    const objs = ws.topLevel().map((n) => {
      return `${n.name}${ws.selected.has(n) ? ' (selezionato)' : ''}${n.userData.isAssembly ? `, ${ws.countParts(n)} pezzi${n.userData.exploded ? ', aperto' : ''}` : ''}`;
    });
    return {
      oggetti: objs,
      selezione: ws.info(),
      ambiente: this.themes.current,
      gravita: this.physics.enabled ? 'attiva' : 'spenta',
      realta_mista: !!this.extra?.isMixedReality?.(),
    };
  }

  /** Esegue uno strumento chiesto da Claude e restituisce un risultato breve. */
  runTool(name, input) {
    const { workspace: ws, actions } = this;
    switch (name) {
      case 'create_shapes': {
        const n = Math.max(1, Math.min(12, input.count | 0));
        const created = [];
        for (let i = 0; i < n; i++) created.push(ws.createPrimitive(input.shape));
        const col = hexColor(input.color);
        ws.selected = new Set(created);
        if (col != null) ws.colorSelected(col);
        ws.highlightDirty = true;
        return `Creati ${n} ${input.shape}.`;
      }
      case 'load_object': {
        const item = LIBRARY.find((it) => it.id === input.object);
        if (!item) return 'Oggetto non trovato.';
        const node = ws.loadLibrary(item.build);
        return `${node.name} caricato (${ws.countParts(node)} pezzi).`;
      }
      case 'build_object': {
        const node = this.extra.buildRealistic(input);
        return node ? `Costruito ${node.name} con ${ws.countParts(node)} pezzi.` : 'Specifica non valida.';
      }
      case 'spawn_catalog': {
        const item = ALL_ITEMS.find((it) => it.id === input.item);
        if (!item) return 'Non è nel catalogo.';
        this.extra.spawnItem(item, { count: Math.max(1, Math.min(10, input.count | 0 || 1)), size: input.size || 'auto' });
        return `Messo: ${item.label}.`;
      }
      case 'scan_object':
        this.extra.scan();
        return 'Scansione avviata: l\'utente deve girare l\'oggetto davanti agli occhi.';
      case 'select': {
        const q = (input.name || '').toLowerCase();
        if (q === '*') ws.selectAll();
        else if (!q) ws.clearSelection();
        else {
          const hits = ws.topLevel().filter((n) => n.name.toLowerCase().includes(q));
          ws.selected = new Set(hits);
          ws.highlightDirty = true;
          if (!hits.length) return `Nessun oggetto con "${input.name}".`;
        }
        return ws.info();
      }
      case 'resize': {
        if (!ws.selected.size) return 'Nessun oggetto selezionato.';
        const axis = input.axis === 'all' ? 'all' : input.axis;
        if (input.mode === 'factor') ws.scaleSelected(axis, Math.max(0.05, Math.min(20, input.value)));
        else this.extra.setSizeMm(axis, input.value);
        return ws.info();
      }
      case 'set_color': {
        const col = hexColor(input.color);
        if (col == null || !ws.selected.size) return 'Niente da colorare.';
        ws.colorSelected(col);
        return 'Colorato.';
      }
      case 'run_commands': {
        const out = [];
        for (const c of input.commands || []) {
          if (c === 'gravity_on' || c === 'gravity_off') {
            if (this.physics.enabled !== (c === 'gravity_on')) out.push(actions.run('gravity', { speak: false }));
          } else if (c === 'desk_show' || c === 'desk_hide') {
            out.push(this.extra.setDeskVisible(c === 'desk_show'));
          } else if (c === 'mixed_reality') {
            out.push(this.extra.enterMixedReality());
          } else {
            out.push(actions.run(c, { speak: false }));
          }
        }
        return out.filter(Boolean).join(' ') || 'Fatto.';
      }
      case 'describe_scene':
        return JSON.stringify(this.sceneState());
      default:
        return `Strumento sconosciuto: ${name}`;
    }
  }

  /** Un giro di conversazione: Claude può usare gli strumenti più volte, poi risponde. */
  async loop(messages, { tools = TOOLS, effort = 'low', maxTurns = 6 } = {}) {
    const client = await this.getClient();
    let text = '';
    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        tools,
        messages,
        output_config: { effort },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      messages.push({ role: 'assistant', content: response.content });
      if (response.stop_reason === 'refusal') return 'Questo non posso farlo.';
      text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim() || text;
      if (response.stop_reason === 'pause_turn') continue;
      if (response.stop_reason !== 'tool_use') break;
      if (response.stop_reason === 'max_tokens') break;
      const results = [];
      for (const b of response.content) {
        if (b.type !== 'tool_use') continue;
        let out;
        try {
          out = this.runTool(b.name, b.input || {});
          results.push({ type: 'tool_result', tool_use_id: b.id, content: String(out) });
        } catch (e) {
          results.push({ type: 'tool_result', tool_use_id: b.id, content: `Errore: ${e.message}`, is_error: true });
        }
      }
      messages.push({ role: 'user', content: results });
    }
    return text;
  }

  explainError(e) {
    const A = this.Anthropic;
    if (A && e instanceof A.AuthenticationError) return 'La chiave dell\'AI non è valida. Controllala nella pagina iniziale.';
    if (A && e instanceof A.PermissionDeniedError) return 'La chiave dell\'AI non ha i permessi necessari.';
    if (A && e instanceof A.RateLimitError) return 'Troppe richieste in poco tempo, riprova tra un momento.';
    if (A && e instanceof A.BadRequestError) return 'Non sono riuscita a capire la richiesta, ripetila in un altro modo.';
    if (A && e instanceof A.APIConnectionError) return 'Non riesco a collegarmi: controlla internet.';
    if (A && e instanceof A.APIError) return `Il servizio AI ha risposto con un errore (${e.status}).`;
    return 'Qualcosa è andato storto con l\'AI.';
  }

  /** Comando a voce o scritto. */
  async handle(text) {
    if (this.busy) return;
    this.busy = true;
    this.ai.listening = true; // la luce diventa ambra mentre pensa
    try {
      // la conversazione è solo in aggiunta (mai modificata); se diventa lunga si riparte da capo
      if (this.history.length > 40) this.history = [];
      this.history.push({ role: 'user', content: `${text}\n\n[stato del mondo: ${JSON.stringify(this.sceneState())}]` });
      const reply = await this.loop(this.history, { effort: 'medium' });
      this.ai.listening = false;
      this.ai.say(reply || 'Fatto.');
    } catch (e) {
      console.error(e);
      this.ai.listening = false;
      this.history = [];
      this.ai.say(this.explainError(e));
    } finally {
      this.busy = false;
      this.ai.listening = false;
    }
  }

  /** Scansione realistica: foto (base64) → specifica dell'oggetto (o null se non si vede niente). */
  async reconstruct(images) {
    const client = await this.getClient();
    const content = [];
    images.forEach((data, i) => {
      content.push({ type: 'text', text: `Foto ${i}:` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
    });
    content.push({
      type: 'text',
      text: 'Sono foto scattate dalle telecamere del mio visore mentre giro tra le mani un oggetto vero. '
        + 'Usa lo strumento ricostruisci_oggetto per ricostruirlo nel modo più realistico possibile: '
        + 'riconosci esattamente cos\'è (ignora mani, sfondo e stanza), stima le misure reali in millimetri, '
        + 'scegli forme fedeli (profili lathe per le cose rotonde, rbox con spigoli arrotondati per dispositivi e scatole, '
        + 'extrude per sagome piatte), materiali credibili (lucido/opaco, metallo, vetro) e colori veri, '
        + 'dividendolo nei componenti in cui si smonterebbe davvero. Il davanti dell\'oggetto guarda verso +z. '
        + 'Per ogni lato visto indica la foto migliore e il riquadro stretto sull\'oggetto: '
        + 'le foto verranno proiettate sulla forma, quindi le proporzioni del modello devono corrispondere a quelle delle foto. '
        + 'Se non si vede nessun oggetto in mano, chiama lo strumento con found = false.',
    });
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      tools: [SCAN_TOOL],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content }],
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (response.stop_reason === 'refusal') return null;
    const use = response.content.find((b) => b.type === 'tool_use' && b.name === 'ricostruisci_oggetto');
    const spec = use?.input;
    if (!spec?.found || !spec.parts?.length) return null;
    return spec;
  }

}
