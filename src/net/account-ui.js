/**
 * Schermata 2D (prima di entrare in VR): accesso, registrazione, stanza e inviti.
 * Si usa con la tastiera del Quest o del computer.
 */
const ERRORS = {
  'auth/invalid-email': 'Email non valida.',
  'auth/missing-password': 'Scrivi la password.',
  'auth/weak-password': 'La password deve avere almeno 6 caratteri.',
  'auth/email-already-in-use': 'Esiste già un account con questa email: accedi.',
  'auth/invalid-credential': 'Email o password sbagliate.',
  'auth/wrong-password': 'Email o password sbagliate.',
  'auth/user-not-found': 'Nessun account con questa email: registrati.',
  'auth/too-many-requests': 'Troppi tentativi, riprova tra qualche minuto.',
  'auth/popup-closed-by-user': 'Accesso con Google annullato.',
  'auth/operation-not-allowed': 'Questo tipo di accesso non è attivo nel progetto Firebase.',
  'auth/network-request-failed': 'Connessione assente.',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class AccountUI {
  constructor(el, net, { onOffline } = {}) {
    this.el = el;
    this.net = net;
    this.onOffline = onOffline;
    this.mode = 'login';
    this.msg = '';
    this.people = {};
    this.room = null;
    this.showLink = false;
    const q = new URLSearchParams(location.search);
    this.invite = q.get('stanza') ? { room: q.get('stanza'), code: q.get('invito') || '' } : null;
    net.on('user', () => this.render());
    net.on('people', (p) => { this.people = p; this.render(); });
    net.on('room', (r) => { this.room = r; this.render(); });
    el.addEventListener('submit', (e) => { e.preventDefault(); this.submit(); });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.act(b.dataset.act);
    });
    this.render();
  }

  set(msg) { this.msg = msg; this.render(); }

  error(e) { this.set(ERRORS[e?.code] || e?.message || 'Qualcosa è andato storto.'); }

  async submit() {
    const f = this.el.querySelector('form');
    if (!f) return;
    const v = (n) => f.elements[n]?.value.trim() || '';
    this.set('Un momento…');
    try {
      if (this.mode === 'register') {
        if (!v('name')) return this.set('Scrivi il tuo nome: lo vedranno gli altri nella stanza.');
        await this.net.register(v('name'), v('email'), f.elements.password.value);
      } else {
        await this.net.login(v('email'), f.elements.password.value);
      }
      this.msg = '';
      await this.enterRoom();
    } catch (e) {
      this.error(e);
    }
  }

  async enterRoom() {
    try {
      if (this.invite && this.invite.room !== this.net.user.uid) {
        await this.net.enter(this.invite.room, this.invite.code);
      } else {
        await this.net.enter();
      }
      this.set('');
    } catch (e) {
      this.invite = null;
      this.set(e.message + ' Ti porto nella tua stanza.');
      await this.net.enter();
    }
  }

  async act(a) {
    try {
      switch (a) {
        case 'tab-login': this.mode = 'login'; this.msg = ''; break;
        case 'tab-register': this.mode = 'register'; this.msg = ''; break;
        case 'google':
          this.set('Apro Google…');
          await this.net.loginGoogle();
          this.msg = '';
          await this.enterRoom();
          break;
        case 'reset': {
          const email = this.el.querySelector('[name=email]')?.value.trim();
          if (!email) return this.set('Scrivi la tua email, poi tocca di nuovo «Password dimenticata?».');
          await this.net.resetPassword(email);
          this.msg = 'Ti ho mandato un\'email per scegliere una nuova password.';
          break;
        }
        case 'offline':
          this.el.hidden = true;
          this.onOffline?.();
          return;
        case 'invite':
          this.showLink = !this.showLink;
          break;
        case 'copy': {
          const link = this.net.inviteLink();
          if (navigator.share) {
            await navigator.share({ title: 'Officina XR', text: `${this.net.name} ti invita nella sua stanza`, url: link }).catch(() => {});
          } else {
            await navigator.clipboard.writeText(link);
            this.msg = 'Link copiato: mandalo a chi vuoi invitare.';
          }
          break;
        }
        case 'new-invite':
          await this.net.newInvite();
          this.msg = 'Nuovo link creato: quelli vecchi non funzionano più.';
          break;
        case 'home':
          this.invite = null;
          history.replaceState(null, '', location.pathname + (location.search.includes('emu') ? '?emu=1' : ''));
          await this.net.enter();
          break;
        case 'logout':
          await this.net.logout();
          break;
        case 'min':
          this.el.classList.toggle('min');
          break;
        default:
      }
      this.render();
    } catch (e) {
      this.error(e);
    }
  }

  render() {
    const n = this.net;
    let html = '<button class="x" data-act="min" title="Riduci">—</button>';
    if (!n.ready) {
      html += '<p>Collegamento…</p>';
    } else if (!n.user) {
      const reg = this.mode === 'register';
      html += `<h2>${this.invite ? 'Sei stato invitato!' : 'Il tuo account'}</h2>
        <p class="sub">${this.invite ? 'Accedi o registrati per entrare nella stanza.' : 'Accedi per avere la tua stanza e invitare altre persone.'}</p>
        <div class="tabs"><button data-act="tab-login" class="${reg ? '' : 'on'}">Accedi</button><button data-act="tab-register" class="${reg ? 'on' : ''}">Registrati</button></div>
        <form autocomplete="on">
          ${reg ? '<input name="name" placeholder="Il tuo nome" autocomplete="nickname" maxlength="24">' : ''}
          <input name="email" type="email" placeholder="Email" autocomplete="email">
          <input name="password" type="password" placeholder="Password${reg ? ' (almeno 6 caratteri)' : ''}" autocomplete="${reg ? 'new-password' : 'current-password'}">
          <button type="submit" class="primary">${reg ? 'Crea account' : 'Accedi'}</button>
        </form>
        <button data-act="google" class="google">Continua con Google</button>
        <div class="links">${reg ? '' : '<a href="#" data-act="reset">Password dimenticata?</a>'}<a href="#" data-act="offline">Usa senza account</a></div>`;
    } else {
      const others = Object.values(this.people);
      const room = this.room;
      const where = !room ? 'Entro nella stanza…' : room.owner ? 'Sei nella <b>tua stanza</b>' : `Sei nella stanza di <b>${esc(room.ownerName)}</b>`;
      html += `<h2>Ciao, ${esc(n.name)}</h2>
        <p class="sub">${where}</p>
        <div class="people"><span class="dot me"></span>Tu${others.map((p) => `<span class="dot" style="background:${esc(p.color || '#3fa9ff')}"></span>${esc(p.name)}`).join('')}</div>
        ${room ? `<button data-act="invite" class="primary">Invita qualcuno</button>` : ''}
        ${this.showLink && room?.link ? `<div class="link"><input readonly value="${esc(room.link)}" onclick="this.select()"><button data-act="copy">${navigator.share ? 'Condividi' : 'Copia'}</button></div>
          <p class="hint">Chi apre questo link, dopo aver fatto l'accesso, entra nella stanza con te.</p>
          ${room.owner ? '<a href="#" data-act="new-invite">Crea un nuovo link (blocca quelli vecchi)</a>' : ''}` : ''}
        <div class="links">${room && !room.owner ? '<a href="#" data-act="home">Torna alla mia stanza</a>' : ''}<a href="#" data-act="logout">Esci</a></div>`;
    }
    if (this.msg) html += `<p class="msg">${esc(this.msg)}</p>`;
    this.el.innerHTML = html;
    this.el.hidden = false;
  }
}
