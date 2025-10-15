/**
 * Player roll dialog for initiative rolloffs
 * @module player-roll-dialog
 */

import { MODULE } from './config.mjs';

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
 * @property {string} rolloffId - Unique rolloff identifier
 */

/**
 * Simple dialog for a player to make their rolloff roll
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export class PlayerRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'rollies-player-roll-dialog',
    classes: ['rollies-dialog', 'rollies-player-roll'],
    tag: 'form',
    position: { width: 400, height: 'auto' },
    window: { resizable: false, minimizable: false, title: 'Rollies.PlayerDialog.Title' },
    actions: { roll: PlayerRollDialog._onRoll }
  };

  /**
   * Template parts configuration
   * @type {object}
   */
  static PARTS = { form: { template: 'modules/rollies/templates/player-roll-dialog.hbs' } };

  /**
   * Create a new PlayerRollDialog
   * @param {Combatant} combatant - The combatant performing the roll
   * @param {string} dieType - Type of die to roll (e.g., 'd20')
   * @param {string} rolloffId - Unique identifier for this rolloff
   * @param {Function} resolveCallback - Callback to resolve with roll result
   * @param {Function} rejectCallback - Callback to reject on error
   */
  constructor(combatant, dieType, rolloffId, resolveCallback, rejectCallback) {
    super();
    this.combatant = combatant;
    this.dieType = dieType;
    this.rolloffId = rolloffId;
    this.resolveCallback = resolveCallback;
    this.rejectCallback = rejectCallback;
    this.hasRolled = false;
    this.isClosed = false;
    const timeoutSeconds = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT);
    this.timeoutId = setTimeout(() => {
      this._handleTimeout();
    }, timeoutSeconds * 1000);
    console.log(`${MODULE.ID} | PlayerRollDialog will timeout in ${timeoutSeconds} seconds`);
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.combatant = { name: this.combatant.name, img: this.combatant.img || this.combatant.actor?.img };
    context.dieType = this.dieType;
    context.hasRolled = this.hasRolled;
    context.timeout = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT);
    context.rolloffId = this.rolloffId;
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
    const roll = await new Roll(`1${this.dieType}`).evaluate();
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
    const roll = await new Roll(`1${this.dieType}`).evaluate();
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
   * Clears timeout and marks as closed
   * @param {Error} [error=null] - Optional error to reject with
   */
  _cleanup(error = null) {
    this.isClosed = true;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (error && this.rejectCallback) this.rejectCallback(error);
  }
}
