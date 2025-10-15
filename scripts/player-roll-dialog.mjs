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
  /**
   * Default application options
   * @type {object}
   */
  static DEFAULT_OPTIONS = {
    id: 'rollies-player-roll-dialog',
    classes: ['rollies-dialog', 'rollies-player-roll'],
    tag: 'form',
    position: { width: 400, height: 'auto' },
    window: { resizable: false, minimizable: false },
    actions: {
      roll: PlayerRollDialog._onRoll,
      close: PlayerRollDialog._onClose
    }
  };

  /**
   * Template parts configuration
   * @type {object}
   */
  static PARTS = {
    form: {
      template: 'modules/rollies/templates/player-roll-dialog.hbs'
    }
  };

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
    console.log(`${MODULE.ID} | PlayerRollDialog constructor called`, { combatant: combatant.name, dieType, rolloffId });

    this.combatant = combatant;
    this.dieType = dieType;
    this.rolloffId = rolloffId;
    this.resolveCallback = resolveCallback;
    this.rejectCallback = rejectCallback;
    this.hasRolled = false;
    this.isClosed = false;

    const timeoutSeconds = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT);
    this.timeoutId = setTimeout(() => {
      console.log(`${MODULE.ID} | PlayerRollDialog timeout triggered`);
      this._handleTimeout();
    }, timeoutSeconds * 1000);

    console.log(`${MODULE.ID} | PlayerRollDialog will timeout in ${timeoutSeconds} seconds`);
  }

  /**
   * Get the localized title for this dialog
   * @returns {string} The dialog title
   */
  get title() {
    return game.i18n.localize('Rollies.PlayerDialog.Title');
  }

  /**
   * Prepare context data for template rendering
   * @returns {Promise<PlayerRollContext>} Context data for the template
   */
  async _prepareContext() {
    console.log(`${MODULE.ID} | PlayerRollDialog _prepareContext`);
    return {
      combatant: {
        name: this.combatant.name,
        img: this.combatant.img || this.combatant.actor?.img || 'icons/svg/mystery-man.svg'
      },
      dieType: this.dieType,
      hasRolled: this.hasRolled,
      timeout: game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT),
      rolloffId: this.rolloffId
    };
  }

  /**
   * Handle roll button click action
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The clicked element
   * @returns {Promise<void>}
   */
  static async _onRoll(_event, _target) {
    console.log(`${MODULE.ID} | PlayerRollDialog roll button clicked`);
    const app = foundry.applications.instances.get('rollies-player-roll-dialog');

    if (app instanceof PlayerRollDialog) {
      await app._performRoll();
    } else {
      console.error(`${MODULE.ID} | Application instance not found or wrong type`);
    }
  }

  /**
   * Handle close button click action
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The clicked element
   */
  static _onClose(_event, _target) {
    console.log(`${MODULE.ID} | PlayerRollDialog close button clicked`);
    const app = foundry.applications.instances.get('rollies-player-roll-dialog');

    if (app instanceof PlayerRollDialog) {
      app._cleanup(new Error('Dialog closed by user'));
      app.close();
    }
  }

  /**
   * Perform the actual roll for the combatant
   * @returns {Promise<void>}
   */
  async _performRoll() {
    console.log(`${MODULE.ID} | _performRoll called`, {
      hasRolled: this.hasRolled,
      combatant: this.combatant.name,
      rolloffId: this.rolloffId
    });

    if (this.hasRolled || this.isClosed) {
      console.log(`${MODULE.ID} | Already rolled or closed, ignoring`);
      return;
    }

    console.log(`${MODULE.ID} | Performing roll for`, this.combatant.name);
    this.hasRolled = true;

    const roll = await new Roll(`1${this.dieType}`).evaluate();
    console.log(`${MODULE.ID} | Roll result:`, roll.total);

    await this._createRollChatMessage(roll);
    await this.render();

    setTimeout(() => {
      if (!this.isClosed) {
        this._cleanup();
        this.resolveCallback({
          roll: roll,
          total: roll.total
        });
        this.close();
      }
    }, 1500);
  }

  /**
   * Handle timeout when player doesn't roll in time
   * Automatically rolls for the player
   * @returns {Promise<void>}
   */
  async _handleTimeout() {
    console.log(`${MODULE.ID} | _handleTimeout called`, {
      hasRolled: this.hasRolled,
      combatant: this.combatant.name,
      rolloffId: this.rolloffId
    });

    if (this.hasRolled || this.isClosed) {
      console.log(`${MODULE.ID} | Timeout triggered but already rolled or closed`);
      return;
    }

    console.log(`${MODULE.ID} | Timeout - auto-rolling for`, this.combatant.name);
    const roll = await new Roll(`1${this.dieType}`).evaluate();
    console.log(`${MODULE.ID} | Auto-roll result:`, roll.total);

    await this._createRollChatMessage(roll, true);
    this._cleanup();
    this.resolveCallback({
      roll: roll,
      total: roll.total
    });
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

    return await ChatMessage.create({
      content: content,
      speaker: ChatMessage.getSpeaker({ actor: this.combatant.actor }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      rolls: [roll]
    });
  }

  /**
   * Clean up dialog resources
   * Clears timeout and marks as closed
   * @param {Error} [error=null] - Optional error to reject with
   */
  _cleanup(error = null) {
    console.log(`${MODULE.ID} | Cleaning up PlayerRollDialog`);
    this.isClosed = true;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (error && this.rejectCallback) {
      this.rejectCallback(error);
    }
  }

  /**
   * Override close to ensure cleanup happens
   * @param {object} [options={}] - Close options
   * @returns {Promise<void>}
   */
  async close(options = {}) {
    this._cleanup();
    return super.close(options);
  }
}
