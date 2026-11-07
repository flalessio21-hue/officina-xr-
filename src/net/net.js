/**
 * Account e stanze condivise con Firebase (Authentication + Realtime Database).
 *
 * Struttura del database:
 *   rooms/{stanza}/meta      { owner, ownerName, invite, created }   (stanza = uid del proprietario)
 *   rooms/{stanza}/members   { uid: codiceInvito }                    chi è stato invitato
 *   rooms/{stanza}/presence  { uid: { name, color, seat, h, l, r } }  chi è dentro adesso
 *   rooms/{stanza}/objects   { id: { d: json, by } }                  oggetti sulla scrivania
 *   rooms/{stanza}/state     { theme }                                ambiente condiviso
 */
const V = '10.12.2';
const CDN = `https://www.gstatic.com/firebasejs/${V}/`;

const COLORS = ['#3fa9ff', '#ff6b4a', '#45d483', '#ffc845', '#b57bff', '#ff6fb0', '#7fe3ff', '#ff8a2a'];

/** Posti attorno alla scrivania: 0 = proprietario, poi di fronte, a sinistra, a destra… */
export const SEATS = [
  { x: 0, z: 0, rot: 0 },
  { x: 0, z: -1.3, rot: Math.PI },
  { x: -1.35, z: -0.62, rot: -Math.PI / 2 },
  { x: 1.35, z: -0.62, rot: Math.PI / 2 },
  { x: -0.7, z: -1.3, rot: Math.PI },
  { x: 0.7, z: -1.3, rot: Math.PI },
];

function randomCode(n = 10) {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => a[x % a.length]).join('');
}

export class Net {
  constructor(workspace) {
    this.workspace = workspace;
    this.user = null;
    this.room = null; // id stanza corrente
    this.meta = null;
    this.seat = 0;
    this.people = {}; // uid -> presenza (altri utenti)
    this.sent = new Map(); // id oggetto -> json inviato/ricevuto per ultimo
    this.unsubs = [];
    this.listeners = {};
    this.syncTimer = 0;
    this.presenceTimer = 0;
    this.ready = false;
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }

  emit(ev, ...a) { (this.listeners[ev] || []).forEach((f) => f(...a)); }

  async init(config, { emulator = false } = {}) {
    const [appM, authM, dbM] = await Promise.all([
      import(`${CDN}firebase-app.js`),
      import(`${CDN}firebase-auth.js`),
      import(`${CDN}firebase-database.js`),
    ]);
    this.A = authM;
    this.D = dbM;
    this.app = appM.initializeApp(config);
    this.auth = authM.getAuth(this.app);
    this.db = dbM.getDatabase(this.app);
    if (emulator) {
      authM.connectAuthEmulator(this.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      dbM.connectDatabaseEmulator(this.db, '127.0.0.1', 9000);
    }
    authM.onAuthStateChanged(this.auth, (u) => {
      this.user = u;
      this.ready = true;
      this.emit('user', u);
    });
    this.ref = (path) => dbM.ref(this.db, path);
  }

  get name() {
    return this.user?.displayName || this.user?.email?.split('@')[0] || 'Ospite';
  }

  // ---------------------------------------------------------------- account

  async register(name, email, password) {
    const cred = await this.A.createUserWithEmailAndPassword(this.auth, email, password);
    if (name) await this.A.updateProfile(cred.user, { displayName: name });
    this.user = this.auth.currentUser;
    this.emit('user', this.user);
    return cred.user;
  }

  login(email, password) { return this.A.signInWithEmailAndPassword(this.auth, email, password); }

  loginGoogle() { return this.A.signInWithPopup(this.auth, new this.A.GoogleAuthProvider()); }

  resetPassword(email) { return this.A.sendPasswordResetEmail(this.auth, email); }

  async logout() {
    await this.leave();
    await this.A.signOut(this.auth);
  }

  // ---------------------------------------------------------------- stanze

  get isOwner() { return this.room && this.user && this.room === this.user.uid; }

  inviteLink() {
    if (!this.room || !this.meta?.invite) return null;
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('stanza', this.room);
    u.searchParams.set('invito', this.meta.invite);
    if (new URLSearchParams(location.search).has('emu')) u.searchParams.set('emu', '1');
    return u.toString();
  }

  /** Entra nella propria stanza (roomId omesso) o in quella di un altro con il codice d'invito. */
  async enter(roomId = null, code = null) {
    const { D } = this;
    const uid = this.user.uid;
    const room = roomId || uid;
    await this.leave();

    if (room === uid) {
      const metaSnap = await D.get(this.ref(`rooms/${room}/meta`));
      if (!metaSnap.exists()) {
        await D.set(this.ref(`rooms/${room}/meta`), {
          owner: uid, ownerName: this.name, invite: randomCode(), created: D.serverTimestamp(),
        });
      }
    } else {
      try {
        await D.set(this.ref(`rooms/${room}/members/${uid}`), code || '');
      } catch (e) {
        throw new Error('Invito non valido o scaduto.');
      }
    }
    this.room = room;
    const metaSnap = await D.get(this.ref(`rooms/${room}/meta`));
    this.meta = metaSnap.val();

    // posto libero attorno alla scrivania
    const presSnap = await D.get(this.ref(`rooms/${room}/presence`));
    const taken = new Set(Object.values(presSnap.val() || {}).map((p) => p.seat));
    let seat = room === uid ? 0 : 1;
    while (taken.has(seat) && seat < SEATS.length - 1) seat++;
    this.seat = seat;
    this.color = COLORS[(Object.keys(presSnap.val() || {}).length + (room === uid ? 0 : 1)) % COLORS.length];

    const me = this.ref(`rooms/${room}/presence/${uid}`);
    await D.onDisconnect(me).remove();
    await D.set(me, { name: this.name, color: this.color, seat, t: D.serverTimestamp() });

    // se la mia stanza è vuota, carico quello che avevo sulla scrivania; altrimenti vale la stanza
    const objSnap = await D.get(this.ref(`rooms/${room}/objects`));
    if (!(room === uid && !objSnap.exists())) {
      this.workspace.clear();
    }
    this.sent.clear();

    const objs = this.ref(`rooms/${room}/objects`);
    this.unsubs.push(
      D.onChildAdded(objs, (s) => this.receive(s.key, s.val())),
      D.onChildChanged(objs, (s) => this.receive(s.key, s.val())),
      D.onChildRemoved(objs, (s) => {
        this.sent.delete(s.key);
        this.workspace.removeRemote(s.key);
      }),
      D.onValue(this.ref(`rooms/${room}/presence`), (s) => {
        const all = s.val() || {};
        const before = this.people;
        delete all[uid];
        this.people = all;
        for (const id of Object.keys(all)) if (!before[id]) this.emit('join', all[id]);
        for (const id of Object.keys(before)) if (!all[id]) this.emit('leave', before[id]);
        this.emit('people', all);
      }),
      D.onValue(this.ref(`rooms/${room}/state/theme`), (s) => {
        if (s.exists()) this.emit('theme', s.val());
      }),
      D.onValue(this.ref(`rooms/${room}/meta`), (s) => {
        this.meta = s.val();
        this.emit('room', this.roomInfo());
      }),
    );
    this.emit('room', this.roomInfo());
    return this.roomInfo();
  }

  roomInfo() {
    if (!this.room) return null;
    return {
      id: this.room,
      owner: this.isOwner,
      ownerName: this.meta?.ownerName || '',
      seat: SEATS[this.seat] || SEATS[0],
      link: this.inviteLink(),
    };
  }

  async leave() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    if (this.room && this.user) {
      const me = this.ref(`rooms/${this.room}/presence/${this.user.uid}`);
      try {
        await this.D.remove(me);
        await this.D.onDisconnect(me).cancel();
      } catch { /* già uscito */ }
    }
    for (const p of Object.values(this.people)) this.emit('leave', p);
    this.people = {};
    this.emit('people', {});
    this.room = null;
    this.meta = null;
    this.sent.clear();
  }

  /** Nuovo codice d'invito: i vecchi link smettono di funzionare e gli invitati vengono tolti. */
  async newInvite() {
    if (!this.isOwner) return null;
    await this.D.set(this.ref(`rooms/${this.room}/meta/invite`), randomCode());
    await this.D.remove(this.ref(`rooms/${this.room}/members`));
    return this.inviteLink();
  }

  setTheme(id) {
    if (this.room) this.D.set(this.ref(`rooms/${this.room}/state/theme`), id);
  }

  // ---------------------------------------------------------------- sincronizzazione

  receive(id, val) {
    if (!val || typeof val.d !== 'string') return;
    if (this.sent.get(id) === val.d) return; // è quello che ho mandato io
    this.sent.set(id, val.d);
    try {
      this.workspace.applyRemote(id, JSON.parse(val.d));
    } catch (e) {
      console.warn('oggetto non valido', id, e);
    }
  }

  /** Manda le modifiche locali: chiamata spesso, invia solo ciò che è cambiato. */
  pushChanges() {
    if (!this.room) return;
    const { D } = this;
    const ws = this.workspace;
    const { nodes, frozen } = ws.syncNodes();
    const present = new Set();
    for (const node of nodes) {
      if (!node.userData.netId) node.userData.netId = D.push(this.ref(`rooms/${this.room}/objects`)).key;
      const id = node.userData.netId;
      present.add(id);
      const data = ws.serializeTop(node);
      const json = JSON.stringify(data);
      node.userData.netStruct = ws.constructor.structureOf(data);
      if (this.sent.get(id) !== json) {
        this.sent.set(id, json);
        D.set(this.ref(`rooms/${this.room}/objects/${id}`), { d: json, by: this.user.uid });
      }
    }
    for (const id of [...this.sent.keys()]) {
      if (!present.has(id) && !frozen.has(id)) {
        this.sent.delete(id);
        D.remove(this.ref(`rooms/${this.room}/objects/${id}`));
      }
    }
  }

  /** Posizione della mia testa e delle mie mani (coordinate del mondo). */
  pushPresence(pose) {
    if (!this.room) return;
    const r = (a) => a.map((v) => Math.round(v * 1000) / 1000);
    this.D.update(this.ref(`rooms/${this.room}/presence/${this.user.uid}`), {
      h: r(pose.head), l: pose.left ? r(pose.left) : null, r: pose.right ? r(pose.right) : null,
    });
  }

  tick(dt, pose, busy) {
    if (!this.room) return;
    this.syncTimer -= dt;
    if (this.syncTimer <= 0) {
      this.syncTimer = busy ? 0.1 : 0.3;
      this.pushChanges();
    }
    this.presenceTimer -= dt;
    if (this.presenceTimer <= 0 && pose) {
      this.presenceTimer = 0.1;
      this.pushPresence(pose);
    }
  }
}
