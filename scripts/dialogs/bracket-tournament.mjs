/**
 * Bracket tournament dialog - persists for entire tournament
 * @module dialogs/bracket-tournament
 */

import { MODULE, hasInteractiveDice } from '../config.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Persistent dialog for bracket-style tournaments
 * Shows all rounds, updates in real-time, handles player's rolls
 * @extends HandlebarsApplicationMixin(ApplicationV2)
 */
export class BracketTournamentDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'rollies-bracket-tournament',
    classes: ['rollies-dialog', 'rollies-bracket-tournament'],
    tag: 'form',
    position: { width: 700, height: 'auto' },
    window: { resizable: false, minimizable: false, title: 'ROLLIES.PlayerDialog.BracketHeader' },
    actions: { roll: BracketTournamentDialog._onRoll }
  };

  /** @inheritdoc */
  static PARTS = { form: { template: 'modules/rollies/templates/bracket-tournament.hbs' } };

  /**
   * Create a new BracketTournamentDialog
   * @param {Combatant} combatant - The combatant this dialog represents
   * @param {string} dieType - Type of die to roll (e.g., 'd20')
   * @param {string} tournamentId - Unique identifier for this tournament
   * @param {object} bracket - The bracket structure
   */
  constructor(combatant, dieType, tournamentId, bracket) {
    super();
    this.combatant = combatant;
    this.dieType = dieType;
    this.tournamentId = tournamentId;
    this.bracket = bracket;
    this.myRolls = new Map();
    this.opponentRolls = new Map();
    this.currentMatchId = null;
    this.isEliminated = false;
    this.isClosed = false;
    this.timeRemaining = 0;
    this.startTime = null;
    this.totalTimeout = 0;
    this.countdownInterval = null;
    this.timeoutId = null;
    this.currentResolve = null;
    this.currentReject = null;
    this.hasManualDice = hasInteractiveDice();
    this.warningShown = false;
    this.rollUpdateHookId = Hooks.on(`${MODULE.ID}.rollUpdate`, this._onRollUpdate.bind(this));
    this.matchCompleteHookId = Hooks.on(`${MODULE.ID}.matchComplete`, this._onMatchComplete.bind(this));
    this.winnerHookId = Hooks.on(`${MODULE.ID}.winnerAnnounced`, this._onWinnerAnnounced.bind(this));
  }

  /**
   * Activate a specific match for rolling
   * @param {string} matchId - The match ID to activate
   * @param {Function} resolve - Callback to resolve with roll result
   * @param {Function} reject - Callback to reject on error
   */
  activateMatch(matchId, resolve, reject) {
    this.currentMatchId = matchId;
    this.currentResolve = resolve;
    this.currentReject = reject;
    this.warningShown = false;

    const baseTimeout = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT);
    const multiplier = this.hasManualDice ? game.settings.get(MODULE.ID, MODULE.SETTINGS.MANUAL_DICE_TIMEOUT_MULTIPLIER) : 1;
    const timeoutSeconds = Math.floor(baseTimeout * multiplier);

    this.timeRemaining = timeoutSeconds;
    this.totalTimeout = timeoutSeconds;
    this.startTime = Date.now();
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.countdownInterval = setInterval(() => {
      this._updateCountdown();
    }, 1000);
    this.timeoutId = setTimeout(() => {
      this._handleTimeout();
    }, timeoutSeconds * 1000);
    if (this.rendered) this.render({ force: true });
  }

  /**
   * Lifecycle hook called after rendering
   * @param {HTMLElement} context - The rendered HTML context
   * @param {object} options - Render options
   * @protected
   */
  _onRender(context, options) {
    super._onRender(context, options);
    this._syncUIState();
  }

  /**
   * Synchronize UI state with current data
   * Updates buttons, countdown, and visual feedback
   * @private
   */
  _syncUIState() {
    if (!this.element) return;
    const matches = this.element.querySelectorAll('.bracket-match');
    matches.forEach((matchEl) => {
      const matchId = matchEl.dataset.matchId;
      if (!matchId) return;
      const isActiveMatch = matchId === this.currentMatchId;
      const hasRolled = this.myRolls.has(matchId);
      if (isActiveMatch) matchEl.classList.add('active-match');
      else matchEl.classList.remove('active-match');
      let bracketMatch = null;
      for (const round of this.bracket.rounds) {
        for (const match of round.matches) {
          if (match.matchId === matchId) {
            bracketMatch = match;
            break;
          }
        }
        if (bracketMatch) break;
      }
      if (bracketMatch && bracketMatch.combatant2) {
        const pendingDiv = matchEl.querySelector('.match-pending');
        if (pendingDiv) {
          const escapedName = foundry.utils.escapeHTML(bracketMatch.combatant2.name);
          const combatant2Html = `
          <div class="match-combatant${bracketMatch.combatant2.id === this.combatant.id ? ' is-me' : ''}" data-combatant-id="${bracketMatch.combatant2.id}">
            <img src="${bracketMatch.combatant2.img}" alt="${escapedName}" class="match-portrait">
            <div class="match-info">
              <span class="match-name">${escapedName}</span>
              <span class="match-roll" style="display: none;"></span>
              <button type="button" data-action="roll" class="roll-button-small" style="display: none;">Roll</button>
              <span class="waiting-text" style="display: none;">...</span>
            </div>
          </div>
        `;
          pendingDiv.outerHTML = combatant2Html;
        }
      }
      const combatants = matchEl.querySelectorAll('.match-combatant');
      combatants.forEach((combatantEl) => {
        const combatantId = combatantEl.dataset.combatantId;
        const isMe = combatantId === this.combatant.id;
        if (!isMe) return;
        const rollButton = combatantEl.querySelector('.roll-button-small');
        const waitingText = combatantEl.querySelector('.waiting-text');
        const rollDisplay = combatantEl.querySelector('.match-roll');
        const myRoll = this.myRolls.get(matchId);
        if (myRoll !== undefined) {
          if (rollButton) rollButton.style.display = 'none';
          if (waitingText) waitingText.style.display = 'none';
          if (rollDisplay) {
            rollDisplay.style.display = 'inline';
            rollDisplay.textContent = myRoll;
          }
        } else if (isActiveMatch && !hasRolled) {
          if (rollButton) rollButton.style.display = 'inline-block';
          if (waitingText) waitingText.style.display = 'none';
          if (rollDisplay) rollDisplay.style.display = 'none';
        } else {
          if (rollButton) rollButton.style.display = 'none';
          if (waitingText) waitingText.style.display = 'inline';
          if (rollDisplay) rollDisplay.style.display = 'none';
        }
      });
    });
    this.opponentRolls.forEach((rollData, key) => {
      const parts = key.split('-');
      const combatantId = parts[parts.length - 1];
      const combatantEl = this.element.querySelector(`.match-combatant[data-combatant-id="${combatantId}"]`);
      if (combatantEl) {
        const rollDisplay = combatantEl.querySelector('.match-roll');
        const waitingText = combatantEl.querySelector('.waiting-text');
        if (rollDisplay) {
          rollDisplay.textContent = rollData.total;
          rollDisplay.style.display = 'inline';
        }
        if (waitingText) waitingText.style.display = 'none';
      }
    });
    this._updateCountdownDisplay();
    if (this.isEliminated) {
      const footer = this.element.querySelector('.tournament-footer');
      if (footer && !footer.classList.contains('spectator-footer')) {
        footer.classList.add('spectator-footer');
        const countdownDisplay = footer.querySelector('.countdown-display');
        if (countdownDisplay) countdownDisplay.style.display = 'none';
      }
    }
  }

  /**
   * Update countdown display in the DOM
   * @private
   */
  _updateCountdownDisplay() {
    const countdownElement = this.element?.querySelector('.countdown-timer');
    if (countdownElement) {
      countdownElement.textContent = `${this.timeRemaining}s`;
      if (this.timeRemaining <= 5) countdownElement.classList.add('urgent');
      else countdownElement.classList.remove('urgent');
    }
  }

  /**
   * Handle roll update from other players
   * @param {object} data - Roll update data
   * @private
   */
  _onRollUpdate(data) {
    if (!data.rolloffId || !data.rolloffId.startsWith(this.tournamentId)) return;
    const rollKey = `${data.rolloffId}-${data.combatantId}`;
    this.opponentRolls.set(rollKey, { total: data.total, name: data.name, img: data.img });
    if (this.rendered) this.render({ force: true });
  }

  /**
   * Handle match completion
   * @param {object} data - Match completion data
   * @private
   */
  _onMatchComplete(data) {
    if (data.tournamentId !== this.tournamentId) return;
    let matchUpdated = false;
    for (const round of this.bracket.rounds) {
      for (const match of round.matches) {
        if (match.matchId === data.matchId) {
          match.winner = data.winner;
          match.loser = data.loser;
          matchUpdated = true;
          if (round.roundNumber === 0) {
            const nextRound = this.bracket.rounds.find((r) => r.roundNumber === 1);
            if (nextRound && nextRound.matches.length > 0) nextRound.matches[0].combatant2 = data.winner;
          }
          break;
        }
      }
      if (matchUpdated) break;
    }
    if (data.loser && data.loser.id === this.combatant.id) {
      this.isEliminated = true;
      this._clearCountdown();
    }
    if (this.rendered) this.render({ force: true });
  }

  /**
   * Handle winner announcement - close dialog
   * @param {object} data - Winner data
   * @private
   */
  _onWinnerAnnounced(data) {
    if (data.tournamentId !== this.tournamentId) return;
    setTimeout(() => {
      if (!this.isClosed) {
        this._cleanup();
        this.close();
      }
    }, 500);
  }

  /**
   * Update countdown timer
   * @private
   */
  _updateCountdown() {
    if (this.isEliminated || !this.currentMatchId) {
      this._clearCountdown();
      return;
    }
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    this.timeRemaining = Math.max(0, this.totalTimeout - elapsed);
    this._updateCountdownDisplay();
    if (this.timeRemaining === 0) this._clearCountdown();
  }

  /**
   * Clear countdown interval
   * @private
   */
  _clearCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  /**
   * Handle timeout when player doesn't roll
   * For manual dice users: shows warning first, then auto-rolls on second timeout
   * @private
   * @returns {Promise<void>}
   */
  async _handleTimeout() {
    if (!this.currentMatchId || this.myRolls.has(this.currentMatchId)) return;

    if (this.hasManualDice && !this.warningShown) {
      this.warningShown = true;
      ui.notifications.warn('ROLLIES.Warnings.ManualDiceTimeout');
      const baseTimeout = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT);
      this.startTime = Date.now();
      this.totalTimeout = baseTimeout;
      this.timeRemaining = baseTimeout;
      this.timeoutId = setTimeout(() => {
        this._handleTimeout();
      }, baseTimeout * 1000);
      return;
    }

    this._clearCountdown();
    const roll = await new Roll(`1${this.dieType}`).evaluate({ allowInteractive: false });
    this.myRolls.set(this.currentMatchId, roll.total);
    await this._createRollChatMessage(roll, true);
    if (this.currentResolve) {
      this.currentResolve({ roll: roll, total: roll.total });
      this.currentResolve = null;
      this.currentReject = null;
    }
    this.currentMatchId = null;
    if (this.rendered) this.render({ force: true });
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.combatant = { id: this.combatant.id, name: this.combatant.name, img: this.combatant.img || this.combatant.actor?.img };
    context.dieType = this.dieType;
    context.isEliminated = this.isEliminated;
    context.timeRemaining = this.timeRemaining;
    context.bracket = this._prepareBracketContext();
    return context;
  }

  /**
   * Prepare bracket context for template
   * @returns {object} Formatted bracket data
   * @private
   */
  _prepareBracketContext() {
    return {
      rounds: this.bracket.rounds.map((round) => ({
        roundNumber: round.roundNumber,
        roundLabel: round.roundNumber + 1,
        matches: round.matches.map((match) => {
          const isMyMatch = match.combatant1.id === this.combatant.id || (match.combatant2 && match.combatant2.id === this.combatant.id);
          const matchComplete = !!match.winner;
          return {
            matchId: match.matchId,
            matchComplete: matchComplete,
            isMyMatch: isMyMatch,
            hasOpponent: !!match.combatant2,
            combatant1: { ...match.combatant1, isMe: match.combatant1.id === this.combatant.id, isLoser: match.loser && match.loser.id === match.combatant1.id },
            combatant2: match.combatant2 ? { ...match.combatant2, isMe: match.combatant2.id === this.combatant.id, isLoser: match.loser && match.loser.id === match.combatant2.id } : null,
            winner: match.winner
          };
        })
      }))
    };
  }

  /**
   * Handle roll button click
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The clicked element
   * @returns {Promise<void>}
   */
  static async _onRoll(_event, _target) {
    if (!this.currentMatchId || this.myRolls.has(this.currentMatchId)) return;
    this._clearCountdown();
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    const roll = await new Roll(`1${this.dieType}`).evaluate();
    this.myRolls.set(this.currentMatchId, roll.total);
    await this._createRollChatMessage(roll);
    if (this.currentResolve) {
      this.currentResolve({ roll: roll, total: roll.total });
      this.currentResolve = null;
      this.currentReject = null;
    }
    this.currentMatchId = null;
    if (this.rendered) this.render({ force: true });
  }

  /**
   * Create chat message for roll
   * @param {Roll} roll - The Roll object
   * @param {boolean} [isAuto] - Whether this was automatic
   * @returns {Promise<ChatMessage>} - Chat messages
   * @private
   */
  async _createRollChatMessage(roll, isAuto = false) {
    const autoText = isAuto ? ` (${_loc('ROLLIES.Chat.AutoRoll')})` : '';
    const content = `<div class="rollies-roll-message">
      <strong>${this.combatant.name}</strong> ${_loc('ROLLIES.Chat.RolledFor')} ${_loc('ROLLIES.Chat.Rolloff')}:
      ${roll.total}${autoText}
    </div>`;
    return await ChatMessage.create({ content: content, speaker: ChatMessage.getSpeaker({ actor: this.combatant.actor }), style: CONST.CHAT_MESSAGE_STYLES.OTHER, rolls: [roll] });
  }

  /** @inheritdoc */
  static _onClose(_event, _target) {
    this._cleanup(new Error('Dialog closed by user'));
    super.close();
  }

  /**
   * Clean up hooks and timers
   * @param {Error} [error] - Optional error to reject with
   * @private
   */
  _cleanup(error = null) {
    this.isClosed = true;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this._clearCountdown();
    if (this.rollUpdateHookId) {
      Hooks.off(`${MODULE.ID}.rollUpdate`, this.rollUpdateHookId);
      this.rollUpdateHookId = null;
    }
    if (this.matchCompleteHookId) {
      Hooks.off(`${MODULE.ID}.matchComplete`, this.matchCompleteHookId);
      this.matchCompleteHookId = null;
    }
    if (this.winnerHookId) {
      Hooks.off(`${MODULE.ID}.winnerAnnounced`, this.winnerHookId);
      this.winnerHookId = null;
    }
    if (error && this.currentReject) this.currentReject(error);
  }
}
