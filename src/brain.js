/**
 * Il "cervello" dell'AI: Claude (Anthropic) con strumenti che agiscono sul mondo.
 *
 * - La chiave API resta solo in questo browser (localStorage), mai nel codice o su GitHub.
 * - Senza chiave l'app usa l'interprete di comandi locale (actions.voice).
 * - Scansione: foto dell'oggetto dalla fotocamera del visore → Claude lo riconosce e lo
 *   ricostruisce con pezzi veri (assieme smontabile).
 */
import { LIBRARY } from './library.js';
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
- Per oggetti complessi che non sono nella libreria (una sedia diversa, una bicicletta, un tavolo, un robot…) costruiscili tu con build_object, combinando pezzi semplici con misure realistiche in millimetri, in scala da scrivania (in genere tra 50 e 300 mm).
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

const PART_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Nome del pezzo in italiano (es. "Gamba anteriore sinistra")' },
    kind: { type: 'string', enum: KINDS },
    size_mm: vec3('Ingombro [larghezza X, altezza Y, profondità Z] in mm. Cilindri/coni/tubi/ingranaggi: X = diametro, Y = altezza (asse verticale). Toro: X = diametro esterno, Y = spessore.'),
    position_mm: vec3('Centro del pezzo [x, y, z] in mm rispetto al centro della base dell\'oggetto (y verso l\'alto, z verso l\'utente).'),
    rotation_deg: vec3('Rotazione [x, y, z] in gradi (es. [90,0,0] per sdraiare un cilindro lungo Z, [0,0,90] lungo X).'),
    color: { type: 'string', description: 'Colore esadecimale #rrggbb' },
  },
  required: ['name', 'kind', 'size_mm', 'position_mm', 'rotation_deg', 'color'],
  additionalProperties: false,
};

const BUILD_TOOL = tool('build_object', 'Costruisce sulla scrivania un nuovo oggetto (assieme smontabile) fatto di pezzi semplici. Usa da 3 a 60 pezzi; raggruppa i pezzi in componenti con il campo "group" del nome se utile.', {
  name: { type: 'string', description: 'Nome dell\'oggetto' },
  groups: {
    type: 'array',
    description: 'Componenti dell\'oggetto (sotto-assiemi), ognuno con i suoi pezzi. Usa almeno 2 componenti per oggetti con parti distinte.',
    items: {
      type: 'object',
      properties: { name: { type: 'string' }, parts: { type: 'array', items: PART_SCHEMA } },
      required: ['name', 'parts'],
      additionalProperties: false,
    },
  },
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
  BUILD_TOOL,
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
        const node = this.extra.buildFromSpec(input);
        return node ? `Costruito ${node.name} con ${ws.countParts(node)} pezzi.` : 'Specifica non valida.';
      }
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
      const reply = await this.loop(this.history);
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

  /** Scansione: alcune foto dell'oggetto → oggetto virtuale ricostruito. */
  async scan(images) {
    if (this.busy) return;
    this.busy = true;
    this.ai.listening = true;
    try {
      const content = images.map((data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }));
      content.push({
        type: 'text',
        text: 'Queste sono foto scattate dalla fotocamera del visore mentre tengo in mano un oggetto e lo giro. '
          + 'Riconosci l\'oggetto che tengo in mano (ignora mani, sfondo e stanza), stima misure reali e colori, '
          + 'e ricostruiscilo con build_object in modo fedele: componenti separati, misure in millimetri, colori veri. '
          + 'Poi dimmi in una frase cosa hai ricostruito. Se nelle foto non si vede nessun oggetto in mano, dillo senza costruire niente.',
      });
      const reply = await this.loop([{ role: 'user', content }], { tools: [BUILD_TOOL], effort: 'medium', maxTurns: 3 });
      this.ai.listening = false;
      this.ai.say(reply || 'Fatto.');
    } catch (e) {
      console.error(e);
      this.ai.listening = false;
      this.ai.say(this.explainError(e));
    } finally {
      this.busy = false;
      this.ai.listening = false;
    }
  }
}
