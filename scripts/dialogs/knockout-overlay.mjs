/**
 * Full-screen knockout overlay shown to every client while a tie is rolled off
 * @module dialogs/knockout-overlay
 */

import { initiativeFor } from '../bracket.mjs';
import { createRollMessage } from '../chat.mjs';
import { MODULE, hasInteractiveDice } from '../config.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Board metrics in CSS pixels before fit-to-screen scaling
 * @type {Object<string, number>}
 */
const M = { SW: 264, SH: 58, GAP: 56, PAIR: 10, BLOCK: 30, CW: 292, CH: 92, DROP: 44, LABEL_H: 18, LABEL_GAP: 12, PAD: 16 };

/** Largest scale the board may grow to on big screens */
const MAX_SCALE = 1.6;

/** Scale below which the board switches to its larger-text small-screen styling */
const SMALL_SCALE = 0.8;

/** Milliseconds a roll ticks through random faces before it lands */
const TICK_MS = 520;

/** Milliseconds the decided bracket stays up, with and without the winner announcement */
const LINGER = { announce: 5000, quiet: 1500 };

/**
 * A pending roll this client owes the GM
 * @typedef {object} PendingRoll
 * @property {Function} resolve - Resolves the GM's query
 * @property {Function} reject - Rejects the GM's query when the roll is abandoned
 * @property {number} deadline - Epoch milliseconds when the roll is made automatically
 * @property {boolean} manual - Whether manual or interactive dice are configured
 * @property {boolean} warned - Whether the manual dice warning was shown
 * @property {boolean} busy - Whether the roll is being evaluated
 * @property {number|null} timer - Timeout ID of the automatic roll
 */

/**
 * Pinwheel bracket overlay: the upper half flows in from the left and drops into the champion,
 * the lower half flows in from the right and rises into it.
 * @extends HandlebarsApplicationMixin(ApplicationV2)
 */
export class KnockoutOverlay extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'rollies-knockout',
    classes: ['rollies-dialog', 'rollies-knockout'],
    tag: 'section',
    window: { frame: false, positioned: false },
    actions: { roll: KnockoutOverlay.#onRoll, minimize: KnockoutOverlay.#onMinimize, restore: KnockoutOverlay.#onRestore, dismiss: KnockoutOverlay.#onDismiss }
  };

  /** @inheritdoc */
  static PARTS = { board: { template: 'modules/rollies/templates/knockout-overlay.hbs' } };

  /** @type {KnockoutOverlay|null} The overlay currently on screen */
  static #instance = null;

  /** @type {object|null} Latest bracket state from the GM */
  bracket = null;

  /** @type {Map<number, PendingRoll>} Rolls this client owes, by entrant index */
  #pending = new Map();

  /** @type {Set<string>} Wins and rolls already shown, so only new ones animate */
  #seen = new Set();

  /** @type {boolean} Whether the next render plays the entrance */
  #intro = true;

  /** @type {boolean} Whether the overlay is folded into the corner pill */
  #minimized = false;

  /** @type {number|null} Interval ID of the countdown ticker */
  #ticker = null;

  /** @type {number|null} Timeout ID of the close after the bracket is decided */
  #closeTimer = null;

  /** @type {Function|null} Bound window resize handler */
  #onResize = null;

  /**
   * Show a bracket state, opening a new overlay for a new tournament
   * @param {object} bracket - Bracket state from the GM
   * @returns {KnockoutOverlay} The overlay showing it
   */
  static show(bracket) {
    let overlay = KnockoutOverlay.#instance;
    if (overlay && overlay.bracket?.id !== bracket.id) {
      overlay.close({ force: true });
      overlay = null;
    }
    overlay ??= KnockoutOverlay.#instance = new KnockoutOverlay();
    overlay.update(bracket);
    return overlay;
  }

  /**
   * Close the overlay of a combat that no longer exists
   * @param {string} combatId - The deleted combat's ID
   */
  static dismiss(combatId) {
    if (KnockoutOverlay.#instance?.bracket?.combatId === combatId) KnockoutOverlay.#instance.close({ force: true });
  }

  /**
   * Apply a new bracket state and re-render
   * @param {object} bracket - Bracket state from the GM
   */
  update(bracket) {
    this.bracket = bracket;
    for (const [c, pending] of this.#pending) {
      if (bracket.rolling.includes(c) || pending.busy) continue;
      clearTimeout(pending.timer);
      this.#pending.delete(c);
      pending.reject(new Error('Roll already settled'));
    }
    this.render({ force: true });
    if (bracket.done && !this.#closeTimer) this.#closeTimer = setTimeout(() => this.#leave(), KnockoutOverlay.linger);
  }

  /**
   * Milliseconds a decided bracket stays on screen
   * @type {number}
   */
  static get linger() {
    return game.settings.get(MODULE.ID, MODULE.SETTINGS.SHOW_WINNER_ANNOUNCEMENT) ? LINGER.announce : LINGER.quiet;
  }

  /**
   * Ask this client to roll for an entrant it owns; resolves when the roll is made
   * @param {number} c - Entrant index
   * @returns {Promise<{roll: object, total: number}>} The serialized roll and its total
   */
  requestRoll(c) {
    if (!this.#combatant(c)?.isOwner) throw new Error(`${game.user.name} cannot roll for ${this.bracket.entrants[c]?.name}`);
    return new Promise((resolve, reject) => {
      const manual = hasInteractiveDice();
      const base = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT);
      const seconds = Math.floor(base * (manual ? game.settings.get(MODULE.ID, MODULE.SETTINGS.MANUAL_DICE_TIMEOUT_MULTIPLIER) : 1));
      const pending = { resolve, reject, deadline: Date.now() + seconds * 1000, manual, warned: false, busy: false, timer: null };
      pending.timer = setTimeout(() => this.#onTimeout(c), seconds * 1000);
      this.#pending.set(c, pending);
      this.#startTicker();
      this.render();
    });
  }

  /**
   * Forced closes are immediate; a decided bracket fades out; anything else folds the overlay away
   * @param {object} [options] - Close options
   * @param {boolean} [options.force] - Close even while rolls are outstanding
   * @returns {Promise<KnockoutOverlay>} This overlay
   */
  async close(options = {}) {
    if (options.force) return super.close({ animate: false, ...options });
    if (this.bracket?.done) this.#leave();
    else this.#setMinimized(true);
    return this;
  }

  /** @inheritdoc */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.#onResize = () => this.#fit();
    window.addEventListener('resize', this.#onResize);
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.classList.toggle('is-minimized', this.#minimized);
    this.element.setAttribute('aria-label', context.title);
    this.#fit();
    this.#tickRolls();
    this.#updateCountdown();
    const rollButton = this.element.querySelector('[data-action="roll"]');
    if (rollButton && !this.#minimized && !this.#seen.has(`focus-${rollButton.dataset.entrant}`)) {
      this.#seen.add(`focus-${rollButton.dataset.entrant}`);
      rollButton.focus({ preventScroll: true });
    }
  }

  /** @inheritdoc */
  _onClose(options) {
    super._onClose(options);
    window.removeEventListener('resize', this.#onResize);
    clearTimeout(this.#closeTimer);
    clearInterval(this.#ticker);
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Overlay closed'));
    }
    this.#pending.clear();
    if (KnockoutOverlay.#instance === this) KnockoutOverlay.#instance = null;
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const bracket = this.bracket;
    const showdown = bracket.R === 1;
    const layout = this.#layout();
    const champion = bracket.rounds[bracket.R][0].c;
    const intro = this.#intro;
    Object.assign(context, {
      minimized: this.#minimized,
      intro,
      done: bracket.done,
      title: _loc(showdown ? 'ROLLIES.Knockout.ShowdownTitle' : 'ROLLIES.Knockout.Title'),
      subtitle: _loc(showdown ? 'ROLLIES.Knockout.ShowdownSubtitle' : 'ROLLIES.Knockout.Subtitle', { count: bracket.count, initiative: bracket.base, die: bracket.die }),
      status: this.#status(),
      board: layout.board,
      wires: layout.wires,
      labels: layout.labels,
      slots: layout.slots,
      champion: {
        ...layout.champion,
        decided: champion !== null,
        crowned: champion !== null && this.#firstSight(`champ-${champion}`),
        name: champion !== null ? this.#display(champion).name : _loc('ROLLIES.Knockout.ToBeDecided')
      },
      standings: bracket.places.map((place, i) => this.#standing(place, i))
    });
    this.#intro = false;
    return context;
  }

  /**
   * Whether a key is being shown for the first time; records it as seen
   * @param {string} key - Event key
   * @returns {boolean} True on first sight, never during the entrance
   */
  #firstSight(key) {
    if (this.#seen.has(key)) return false;
    this.#seen.add(key);
    return !this.#intro;
  }

  /**
   * The combatant behind an entrant, if it still exists
   * @param {number} c - Entrant index
   * @returns {Combatant|undefined} The combatant
   */
  #combatant(c) {
    return game.combats.get(this.bracket.combatId)?.combatants.get(this.bracket.entrants[c]?.id);
  }

  /**
   * Name and portrait as this user may see them
   * @param {number} c - Entrant index
   * @returns {{name: string, img: string|null, initial: string, meta: string}} Display data
   */
  #display(c) {
    const entrant = this.bracket.entrants[c];
    if (entrant.hidden && !game.user.isGM) return { name: _loc('ROLLIES.Knockout.Unknown'), img: null, initial: '?', meta: '' };
    return { name: entrant.name, img: entrant.img, initial: entrant.name.charAt(0), meta: entrant.dex === null ? '' : _loc('ROLLIES.Knockout.Dex', { value: entrant.dex }) };
  }

  /**
   * Whether this user is a player who owns the entrant
   * @param {number} c - Entrant index
   * @returns {boolean} True for the player's own combatants
   */
  #isMine(c) {
    return !game.user.isGM && !!this.#combatant(c)?.isOwner;
  }

  /**
   * The active player who rolls for an entrant, if any
   * @param {number} c - Entrant index
   * @returns {User|undefined} The owning player
   */
  #roller(c) {
    const actor = this.#combatant(c)?.actor;
    return actor ? game.users.find((user) => user.active && !user.isGM && actor.testUserPermission(user, 'OWNER')) : undefined;
  }

  /**
   * Localized name of a round
   * @param {number} r - Round index
   * @returns {string} Round name
   */
  #roundName(r) {
    const fromEnd = this.bracket.R - r;
    if (this.bracket.R === 1) return _loc('ROLLIES.Knockout.Round.Showdown');
    if (fromEnd === 1) return _loc('ROLLIES.Knockout.Round.Final');
    if (fromEnd === 2) return _loc('ROLLIES.Knockout.Round.Semifinals');
    if (fromEnd === 3) return _loc('ROLLIES.Knockout.Round.Quarterfinals');
    return _loc('ROLLIES.Knockout.Round.Numbered', { number: r + 1 });
  }

  /**
   * Top-left status: the player's countdown, spectating, the round in play, or the winner
   * @returns {{label: string, value: string, countdown: boolean}} Status display
   */
  #status() {
    const bracket = this.bracket;
    if (bracket.done || bracket.current >= bracket.R) {
      return { label: _loc('ROLLIES.Knockout.GoesFirst'), value: this.#display(bracket.rounds[bracket.R][0].c).name, countdown: false };
    }
    if (this.#pending.size) return { label: _loc('ROLLIES.Knockout.Status.YourRoll'), value: this.#countdownText(), countdown: true };
    const mine = bracket.entrants.map((_, c) => c).filter((c) => this.#isMine(c));
    const out = mine.length && mine.every((c) => bracket.eliminated.some((loser) => loser.c === c));
    const waiting = [...new Set(bracket.rolling.map((c) => this.#roller(c)).filter((user) => user && !user.isSelf))];
    if (!out && waiting.length) return { label: _loc('ROLLIES.Knockout.Status.WaitingOn'), value: waiting.map((user) => user.name).join(', '), countdown: false };
    return { label: _loc(out ? 'ROLLIES.Knockout.Status.Spectating' : 'ROLLIES.Knockout.Status.NowPlaying'), value: this.#roundName(bracket.current), countdown: false };
  }

  /**
   * Time left on the most urgent pending roll, as m:ss
   * @returns {string} Countdown text
   */
  #countdownText() {
    const deadline = Math.min(...[...this.#pending.values()].map((pending) => pending.deadline));
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  /**
   * One chip of the initiative order strip
   * @param {object|null} place - The place, or null while undecided
   * @param {number} i - Zero-based place
   * @returns {object} Standing display data
   */
  #standing(place, i) {
    const initiative = initiativeFor(this.bracket, i);
    if (!place) return { place: i + 1, pending: true, initiative };
    const why = { champion: 'ROLLIES.Knockout.Why.Champion', lost: 'ROLLIES.Knockout.Why.LostOn', rolloff: 'ROLLIES.Knockout.Why.RollOff' }[place.why];
    return { place: i + 1, first: i === 0, name: this.#display(place.c).name, initiative, why: _loc(why, { roll: place.roll, off: place.off }) };
  }

  /**
   * Lay out the pinwheel around the champion and centre it on a symmetric board
   * @returns {{board: object, wires: Array<object>, labels: Array<object>, slots: Array<object>, champion: object}} Layout
   */
  #layout() {
    const bracket = this.bracket;
    const { SW, SH, GAP, PAIR, BLOCK, CW, CH, DROP, LABEL_H, LABEL_GAP, PAD } = M;
    const leaves = bracket.size / 2;
    const leafY = (i) => i * (SH + PAIR) + Math.floor(i / 2) * BLOCK;
    const span = leafY(leaves - 1) + SH;
    const offset = span / 2 + CH / 2 + DROP;
    const columnX = (r, half) => {
      const left = -CW / 4 - SW / 2 - (bracket.R - 1 - r) * (SW + GAP);
      return half === 0 ? left : -left - SW;
    };

    // Seat positions with the champion's centre at the origin
    const seats = [];
    const spread = {};
    for (let r = 0; r < bracket.R; r++) {
      const count = bracket.size >> r;
      bracket.rounds[r].forEach((slot, k) => {
        const half = k < count / 2 ? 0 : 1;
        const local = half ? k - count / 2 : k;
        const s = r === 0 ? leafY(local) : (spread[`${r - 1}-${2 * k}`] + spread[`${r - 1}-${2 * k + 1}`]) / 2;
        spread[`${r}-${k}`] = s;
        const top = (half === 0 ? -offset : offset) - span / 2;
        seats.push({ r, k, half, slot, x: columnX(r, half), y: top + s });
      });
    }
    const labels = [];
    if (bracket.R > 1) {
      for (let r = 0; r < bracket.R; r++) {
        labels.push({ x: columnX(r, 0), y: -offset - span / 2 - LABEL_GAP - LABEL_H, text: this.#roundName(r), current: !bracket.done && r === bracket.current });
        labels.push({ x: columnX(r, 1), y: offset + span / 2 + LABEL_GAP, text: this.#roundName(r), current: !bracket.done && r === bracket.current });
      }
    }

    // Symmetric bounds so the champion lands dead centre
    const extentX = Math.max(CW / 2, ...seats.map((seat) => Math.max(-seat.x, seat.x + SW))) + PAD;
    const extentY = Math.max(CH / 2, ...seats.map((seat) => Math.max(-seat.y, seat.y + SH)), ...labels.map((label) => Math.max(-label.y, label.y + LABEL_H))) + PAD;
    const tx = extentX;
    const ty = extentY;
    const byKey = Object.fromEntries(seats.map((seat) => [`${seat.r}-${seat.k}`, seat]));

    const wires = seats.map((seat) => {
      const { r, k, half, slot } = seat;
      const x = seat.x + tx;
      const y = seat.y + ty;
      let d;
      if (r === bracket.R - 1) {
        d = half === 0 ? `M${x + SW / 2} ${y + SH} V${ty - CH / 2}` : `M${x + SW / 2} ${y} V${ty + CH / 2}`;
      } else {
        const parent = byKey[`${r + 1}-${k >> 1}`];
        const py = parent.y + ty + SH / 2;
        d = half === 0 ? `M${x + SW} ${y + SH / 2} H${x + SW + GAP / 2} V${py} H${parent.x + tx}` : `M${x} ${y + SH / 2} H${x - GAP / 2} V${py} H${parent.x + tx + SW}`;
      }
      const won = slot.result === 'won';
      const fresh = won && this.#firstSight(`won-${r}-${k}`);
      const state = won ? 'is-won' : slot.result === 'bye' || (r === 0 && slot.c === null) ? 'is-bye' : '';
      return { d, state, fresh };
    });

    const slots = seats.map(({ r, k, half, slot, x, y }, order) => this.#slot(r, k, half, slot, { x: x + tx, y: y + ty, order }));
    return {
      board: { width: tx * 2, height: ty * 2 },
      wires,
      labels: labels.map((label) => ({ ...label, x: label.x + tx, y: label.y + ty, width: SW })),
      slots,
      champion: { x: tx - CW / 2, y: ty - CH / 2, width: CW, height: CH }
    };
  }

  /**
   * Display data for one seat
   * @param {number} r - Round index
   * @param {number} k - Seat index
   * @param {number} half - 0 for the upper half, 1 for the lower
   * @param {object} slot - The seat
   * @param {{x: number, y: number, order: number}} at - Board position and entrance order
   * @returns {object} Slot display data
   */
  #slot(r, k, half, slot, at) {
    const base = { ...at, width: M.SW, height: M.SH, from: half === 0 ? -1 : 1 };
    if (slot.c === null) return { ...base, classes: 'is-placeholder', placeholder: _loc(r === 0 ? 'ROLLIES.Knockout.Bye' : 'ROLLIES.Knockout.Awaiting') };
    const bracket = this.bracket;
    const opponent = bracket.rounds[r][k ^ 1];
    const live = !bracket.done && r === bracket.current && opponent.c !== null && !slot.result;
    const rolling = live && bracket.rolling.includes(slot.c);
    const pending = live && this.#pending.has(slot.c);
    const hasRoll = slot.roll !== undefined;
    const classes = [slot.result === 'won' && 'is-winner', slot.result === 'lost' && 'is-loser', live && 'is-live', this.#isMine(slot.c) && 'is-mine'].filter(Boolean).join(' ');
    const roller = rolling && !pending ? this.#roller(slot.c) : null;
    let note = '';
    if (slot.tie !== undefined) note = _loc('ROLLIES.Knockout.Tie', { roll: slot.tie });
    else if (rolling && !roller) note = _loc('ROLLIES.Knockout.Rolling');
    return {
      ...base,
      ...this.#display(slot.c),
      classes,
      c: slot.c,
      seed: bracket.entrants[slot.c].seed,
      canRoll: pending && !this.#pending.get(slot.c).busy,
      rollLabel: _loc('ROLLIES.Knockout.Roll'),
      hasRoll,
      roll: slot.roll,
      tick: hasRoll && this.#firstSight(`roll-${r}-${k}-${slot.roll}`),
      note,
      waiting: slot.tie === undefined && roller ? { name: roller.name, tooltip: _loc('ROLLIES.Knockout.WaitingOn', { name: roller.name }) } : null
    };
  }

  /**
   * Scale the board to the space between the header and the standings
   */
  #fit() {
    const arena = this.element?.querySelector('.rk-arena');
    const board = arena?.querySelector('.rk-board');
    if (!board) return;
    const scale = Math.min(MAX_SCALE, arena.clientWidth / board.offsetWidth, arena.clientHeight / board.offsetHeight);
    board.style.scale = String(Math.max(scale, 0.1));
    // Shrunk boards drop the DEX line and enlarge names and rolls to stay readable
    board.classList.toggle('is-small', scale < SMALL_SCALE);
  }

  /**
   * Run newly landed rolls through a few random faces before showing the real one
   */
  #tickRolls() {
    const ticking = this.element.querySelectorAll('[data-tick]');
    if (!ticking.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const faces = Number(this.bracket.die.slice(1)) || 20;
    const started = performance.now();
    const step = () => {
      const done = performance.now() - started >= TICK_MS;
      for (const el of ticking) el.textContent = done ? el.dataset.tick : String(1 + Math.floor(Math.random() * faces));
      if (!done) setTimeout(step, 55);
    };
    step();
  }

  /**
   * Keep the countdown text current while a roll is owed
   */
  #startTicker() {
    if (this.#ticker) return;
    this.#ticker = setInterval(() => {
      if (!this.#pending.size) {
        clearInterval(this.#ticker);
        this.#ticker = null;
        return;
      }
      this.#updateCountdown();
    }, 250);
  }

  /**
   * Write the countdown into the status and pill, flagging the last five seconds
   */
  #updateCountdown() {
    if (!this.#pending.size || !this.element) return;
    const text = this.#countdownText();
    const deadline = Math.min(...[...this.#pending.values()].map((pending) => pending.deadline));
    const urgent = deadline - Date.now() <= 5000;
    for (const el of this.element.querySelectorAll('[data-countdown]')) {
      el.textContent = text;
      el.classList.toggle('is-urgent', urgent);
    }
  }

  /**
   * Roll for an owned entrant, by click or on timeout
   * @param {number} c - Entrant index
   * @param {boolean} auto - Whether the roll is automatic
   * @returns {Promise<void>}
   */
  async #roll(c, auto) {
    const pending = this.#pending.get(c);
    if (!pending || pending.busy) return;
    pending.busy = true;
    clearTimeout(pending.timer);
    this.render();
    const roll = await new Roll(`1${this.bracket.die}`).evaluate(auto ? { allowInteractive: false } : {});
    await createRollMessage(this.bracket.entrants[c], this.#combatant(c), roll, auto);
    this.#pending.delete(c);
    pending.resolve({ roll: roll.toJSON(), total: roll.total });
    this.render();
  }

  /**
   * Out of time: manual dice users get one warning and a fresh window, then the roll is made for them
   * @param {number} c - Entrant index
   */
  #onTimeout(c) {
    const pending = this.#pending.get(c);
    if (!pending || pending.busy) return;
    if (pending.manual && !pending.warned) {
      const base = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT);
      pending.warned = true;
      pending.deadline = Date.now() + base * 1000;
      pending.timer = setTimeout(() => this.#onTimeout(c), base * 1000);
      ui.notifications.warn('ROLLIES.Warnings.ManualDiceTimeout', { localize: true });
      return;
    }
    this.#roll(c, true);
  }

  /**
   * Fold into the pill or open back up
   * @param {boolean} minimized - Whether to fold
   */
  #setMinimized(minimized) {
    this.#minimized = minimized;
    this.render();
  }

  /**
   * Fade out, then close
   */
  #leave() {
    if (!this.rendered || this.element.classList.contains('is-leaving')) return;
    this.element.classList.add('is-leaving');
    setTimeout(() => this.close({ force: true }), 300);
  }

  /**
   * Roll button
   * @this {KnockoutOverlay}
   * @param {PointerEvent} _event - The click
   * @param {HTMLElement} target - The button
   */
  static #onRoll(_event, target) {
    this.#roll(Number(target.dataset.entrant), false);
  }

  /**
   * Minimize button
   * @this {KnockoutOverlay}
   */
  static #onMinimize() {
    this.#setMinimized(true);
  }

  /**
   * Pill click
   * @this {KnockoutOverlay}
   */
  static #onRestore() {
    this.#setMinimized(false);
  }

  /**
   * Close button once decided
   * @this {KnockoutOverlay}
   */
  static #onDismiss() {
    this.#leave();
  }
}
