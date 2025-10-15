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
 * @property {number} timeRemaining - Seconds remaining in countdown
 * @property {string} rolloffId - Unique rolloff identifier
 * @property {string} mode - Rolloff mode: 'solo', 'pair', or 'bracket'
 * @property {Array<object>} opponents - Opponent data
 * @property {object} bracket - Bracket structure
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
    position: { width: 600, height: 'auto' },
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
   * @param {string} mode - Rolloff mode: 'solo', 'pair', or 'bracket'
   * @param {Array<object>} opponents - Opponent data
   * @param {object} bracket - Bracket structure
   */
  constructor(combatant, dieType, rolloffId, resolveCallback, rejectCallback, mode = 'solo', opponents = null, bracket = null) {
    super();
    this.combatant = combatant;
    this.dieType = dieType;
    this.rolloffId = rolloffId;
    this.resolveCallback = resolveCallback;
    this.rejectCallback = rejectCallback;
    this.mode = mode;
    this.opponents = opponents || [];
    this.bracket = bracket;
    this.hasRolled = false;
    this.isClosed = false;
    this.opponentRolls = new Map(); // Track opponent rolls

    const timeoutSeconds = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT);
    this.timeRemaining = timeoutSeconds;
    this.startTime = Date.now();
    this.countdownInterval = setInterval(() => {
      this._updateCountdown();
    }, 1000);
    this.timeoutId = setTimeout(() => {
      this._handleTimeout();
    }, timeoutSeconds * 1000);

    // Register hook to listen for roll updates
    this.hookId = Hooks.on(`${MODULE.ID}.rollUpdate`, this._onRollUpdate.bind(this));

    console.log(`${MODULE.ID} | PlayerRollDialog created in ${mode} mode`);
  }

  /**
   * Handle roll update from other players
   * @param {object} data - Roll update data
   * @private
   */
  _onRollUpdate(data) {
    // Check if this update is for our rolloff
    if (data.rolloffId !== this.rolloffId && !data.rolloffId.startsWith(this.rolloffId)) return;

    console.log(`${MODULE.ID} | Received roll update:`, data);

    // Store with matchId-combatantId key to track rolls per match
    const rollKey = `${data.rolloffId}-${data.combatantId}`;
    this.opponentRolls.set(rollKey, {
      total: data.total,
      name: data.name,
      img: data.img
    });

    // Re-render to show opponent's roll
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

    // Add opponent data with roll results
    if (this.mode === 'pair' && this.opponents.length > 0) {
      context.opponent = {
        ...this.opponents[0],
        roll: this.opponentRolls.get(this.opponents[0].id)
      };
    }

    // Add bracket data
    if (this.mode === 'bracket' && this.bracket) {
      context.bracket = this._prepareBracketContext(this.bracket);
    }

    return context;
  }

  /**
   * Prepare bracket context for template
   * @param {object} bracket - Raw bracket data
   * @returns {object} Formatted bracket context
   * @private
   */
  _prepareBracketContext(bracket) {
    const context = {
      rounds: bracket.rounds.map((round) => ({
        roundNumber: round.roundNumber,
        roundLabel: round.roundNumber + 1, // Add 1 for display
        matches: round.matches.map((match) => {
          // Build roll lookup keys
          const c1RollKey = `${match.matchId}-${match.combatant1.id}`;
          const c2RollKey = match.combatant2 ? `${match.matchId}-${match.combatant2.id}` : null;

          // Check if this match is complete
          const matchComplete = !!match.winner;

          return {
            matchId: match.matchId,
            matchComplete: matchComplete, // Add this flag
            combatant1: {
              ...match.combatant1,
              roll: this.opponentRolls.get(c1RollKey) || (match.combatant1.id === this.combatant.id && this.hasRolled && match.matchId === this.rolloffId ? { total: this.myRoll } : null),
              isMe: match.combatant1.id === this.combatant.id,
              isLoser: match.loser && match.loser.id === match.combatant1.id
            },
            combatant2: match.combatant2
              ? {
                  ...match.combatant2,
                  roll: this.opponentRolls.get(c2RollKey) || (match.combatant2.id === this.combatant.id && this.hasRolled && match.matchId === this.rolloffId ? { total: this.myRoll } : null),
                  isMe: match.combatant2.id === this.combatant.id,
                  isLoser: match.loser && match.loser.id === match.combatant2.id
                }
              : null,
            winner: match.winner,
            isActive: !match.winner, // Match is active if no winner yet
            hasOpponent: !!match.combatant2 // Whether opponent exists (not waiting)
          };
        })
      }))
    };
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
    if (this.mode !== 'bracket') {
      setTimeout(() => {
        if (!this.isClosed) {
          this._cleanup();
          this.resolveCallback({ roll: roll, total: roll.total });
          this.close();
        }
      }, 1500);
    } else {
      this._cleanup();
      this.resolveCallback({ roll: roll, total: roll.total });
    }
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
    if (this.mode !== 'bracket') this.close();
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
