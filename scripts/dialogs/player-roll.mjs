/**
 * Player roll dialog for initiative rolloffs (pair and solo modes)
 * @module dialogs/player-roll
 */

import { MODULE } from '../config.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog context data for rendering
 * @typedef {object} PlayerRollContext
 * @property {object} combatant - Combatant display data
 * @property {string} combatant.name - Combatant name
 * @property {string} combatant.img - Combatant image URL
 * @property {string} dieType - Die type to roll
 * @property {boolean} hasRolled - Whether the player has rolled
 * @property {number} timeout - Timeout duration in seconds
 * @property {number} timeRemaining - Seconds remaining in countdown
 * @property {string} rolloffId - Unique rolloff identifier
 * @property {string} mode - Rolloff mode: 'solo' or 'pair'
 * @property {Array<object>} opponents - Opponent data for pair mode
 */

/**
 * Simple dialog for a player to make their rolloff roll (pair/solo modes only)
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export class PlayerRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'rollies-player-roll-dialog',
    classes: ['rollies-dialog', 'rollies-player-roll'],
    tag: 'form',
    position: { width: 600, height: 'auto' },
    window: { frame: false, positioned: false, resizable: false, minimizable: false, title: 'Rollies.PlayerDialog.Title', contentClasses: ['rollies-frameless-content'] },
    actions: { roll: PlayerRollDialog._onRoll }
  };

  /**
   * Template parts configuration
   * @type {object}
   */
  static PARTS = { form: { template: 'modules/rollies/templates/player-roll.hbs' } };

  /**
   * Create a new PlayerRollDialog (for pair/solo modes)
   * @param {Combatant} combatant - The combatant performing the roll
   * @param {string} dieType - Type of die to roll (e.g., 'd20')
   * @param {string} rolloffId - Unique identifier for this rolloff
   * @param {Function} resolveCallback - Callback to resolve with roll result
   * @param {Function} rejectCallback - Callback to reject on error
   * @param {string} mode - Rolloff mode: 'solo' or 'pair'
   * @param {Array<object>} opponents - Opponent data for pair mode
   */
  constructor(combatant, dieType, rolloffId, resolveCallback, rejectCallback, mode = 'solo', opponents = null) {
    super();
    this.combatant = combatant;
    this.dieType = dieType;
    this.rolloffId = rolloffId;
    this.resolveCallback = resolveCallback;
    this.rejectCallback = rejectCallback;
    this.mode = mode;
    this.opponents = opponents || [];
    this.hasRolled = false;
    this.isClosed = false;
    this.opponentRolls = new Map();
    const timeoutSeconds = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT);
    this.timeRemaining = timeoutSeconds;
    this.startTime = Date.now();
    this.countdownInterval = setInterval(() => {
      this._updateCountdown();
    }, 1000);
    this.timeoutId = setTimeout(() => {
      this._handleTimeout();
    }, timeoutSeconds * 1000);
    this.hookId = Hooks.on(`${MODULE.ID}.rollUpdate`, this._onRollUpdate.bind(this));
    console.log(`${MODULE.ID} | PlayerRollDialog created in ${mode} mode`);
  }

  /**
   * Handle roll update from other players
   * @param {object} data - Roll update data
   * @private
   */
  _onRollUpdate(data) {
    if (data.rolloffId !== this.rolloffId) return;
    console.log(`${MODULE.ID} | Received roll update:`, data);
    const rollKey = `${data.rolloffId}-${data.combatantId}`;
    this.opponentRolls.set(rollKey, { total: data.total, name: data.name, img: data.img });
    if (this.rendered) this.render();
  }

  /**
   * Update the countdown timer
   * Re-renders the dialog to show updated time
   * @private
   */
  _updateCountdown() {
    if (this.hasRolled || this.isClosed) {
      this._clearCountdown();
      return;
    }
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const timeoutSeconds = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT);
    this.timeRemaining = Math.max(0, timeoutSeconds - elapsed);
    const countdownElement = this.element?.querySelector('.countdown-timer');
    const warningElement = this.element?.querySelector('.timeout-warning');
    if (countdownElement) countdownElement.textContent = this.timeRemaining;
    if (warningElement && this.timeRemaining <= 5) warningElement.classList.add('urgent');
    if (this.timeRemaining === 0) this._clearCountdown();
  }

  /**
   * Clear the countdown interval
   * @private
   */
  _clearCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.combatant = {
      id: this.combatant.id,
      name: this.combatant.name,
      img: this.combatant.img || this.combatant.actor?.img
    };
    context.dieType = this.dieType;
    context.hasRolled = this.hasRolled;
    context.timeout = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT);
    context.timeRemaining = this.timeRemaining;
    context.rolloffId = this.rolloffId;
    context.mode = this.mode;
    if (this.mode === 'pair' && this.opponents.length > 0) context.opponent = { ...this.opponents[0], roll: this.opponentRolls.get(`${this.rolloffId}-${this.opponents[0].id}`) };
    return context;
  }

  /**
   * Handle roll button click action
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The clicked element
   * @returns {Promise<void>}
   */
  static async _onRoll(_event, _target) {
    if (this.hasRolled || this.isClosed) return;
    console.log(`${MODULE.ID} | Performing roll for`, this.combatant.name);
    this.hasRolled = true;
    this._clearCountdown();
    const roll = await new Roll(`1${this.dieType}`).evaluate();
    this.myRoll = roll.total;
    await this._createRollChatMessage(roll);
    await this.render();
    setTimeout(() => {
      if (!this.isClosed) {
        this._cleanup();
        this.resolveCallback({ roll: roll, total: roll.total });
        this.close();
      }
    }, 1500);
  }

  /** @inheritdoc */
  static _onClose(_event, _target) {
    this._cleanup(new Error('Dialog closed by user'));
    super.close();
  }

  /**
   * Handle timeout when player doesn't roll in time
   * Automatically rolls for the player
   * @returns {Promise<void>}
   */
  async _handleTimeout() {
    if (this.hasRolled || this.isClosed) return;
    console.log(`${MODULE.ID} | Timeout - auto-rolling for`, this.combatant.name);
    this._clearCountdown();
    const roll = await new Roll(`1${this.dieType}`).evaluate({ allowInteractive: false });
    this.myRoll = roll.total;
    await this._createRollChatMessage(roll, true);
    this._cleanup();
    this.resolveCallback({ roll: roll, total: roll.total });
    this.close();
  }

  /**
   * Create a chat message for the roll result
   * @param {Roll} roll - The Roll object
   * @param {boolean} [isAuto=false] - Whether this was an automatic roll
   * @returns {Promise<ChatMessage>} The created chat message
   */
  async _createRollChatMessage(roll, isAuto = false) {
    const autoText = isAuto ? ` (${game.i18n.localize('Rollies.Chat.AutoRoll')})` : '';
    const content = `<div class="rollies-roll-message">
      <strong>${this.combatant.name}</strong> ${game.i18n.localize('Rollies.Chat.RolledFor')} ${game.i18n.localize('Rollies.Chat.Rolloff')}:
      ${roll.total}${autoText}
    </div>`;
    return await ChatMessage.create({ content: content, speaker: ChatMessage.getSpeaker({ actor: this.combatant.actor }), style: CONST.CHAT_MESSAGE_STYLES.OTHER, rolls: [roll] });
  }

  /**
   * Clean up dialog resources
   * Clears timeout, countdown, and marks as closed
   * @param {Error} [error=null] - Optional error to reject with
   */
  _cleanup(error = null) {
    this.isClosed = true;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this._clearCountdown();
    if (this.hookId) {
      Hooks.off(`${MODULE.ID}.rollUpdate`, this.hookId);
      this.hookId = null;
    }
    if (error && this.rejectCallback) this.rejectCallback(error);
  }
}
