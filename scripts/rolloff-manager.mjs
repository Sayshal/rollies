/**
 * Main manager for handling initiative rolloffs
 * @module rolloff-manager
 */

import { GMNotificationDialog } from './gm-notification-dialog.mjs';
import { MODULE } from './config.mjs';

/**
 * Rolloff tracking data
 * @typedef {object} RolloffData
 * @property {Combat} combat - The combat encounter
 * @property {Array<Combatant>} combatants - Array of tied combatants
 */

/**
 * Roll result from a combatant
 * @typedef {object} CombatantRollResult
 * @property {Combatant} combatant - The combatant who rolled
 * @property {Roll} roll - The Roll object
 * @property {number} total - Total value of the roll
 */

/**
 * Main manager class for handling initiative rolloffs
 * Tracks active rolloffs and processes initiative ties
 */
export class RolloffManager {
  /**
   * Map of active rolloffs by ID
   * @type {Map<string, RolloffData>}
   */
  static activeRolloffs = new Map();

  /**
   * Set of combat IDs that have been processed
   * @type {Set<string>}
   */
  static processedCombats = new Set();

  /**
   * Initialize the rolloff manager
   * Registers hooks for combat events
   */
  static initialize() {
    console.log(`${MODULE.ID} | Initializing RolloffManager`);
    Hooks.on('updateCombatant', this._onCombatantUpdate.bind(this));
    Hooks.on('createCombatant', this._onCombatantCreate.bind(this));
    Hooks.on('deleteCombat', this._onCombatDelete.bind(this));
  }

  /**
   * Handle combat deletion
   * Cleans up tracked data for the deleted combat
   * @param {Combat} combat - The deleted combat encounter
   * @param {object} _options - Deletion options
   */
  static _onCombatDelete(combat, _options) {
    this.processedCombats.delete(combat.id);
    this.activeRolloffs.delete(combat.id);
  }

  /**
   * Handle combatant update
   * Checks for initiative ties when initiative is updated
   * @param {Combatant} combatant - The updated combatant
   * @param {object} update - Update data
   * @param {object} _options - Update options
   */
  static _onCombatantUpdate(combatant, update, _options) {
    if (!update.initiative) return;
    if (combatant.combat?.started) return;

    setTimeout(() => {
      this._checkForInitiativeTies(combatant.combat);
    }, 200);
  }

  /**
   * Handle combatant creation
   * Checks for initiative ties when new combatant is added
   * @param {Combatant} combatant - The created combatant
   * @param {object} _options - Creation options
   */
  static _onCombatantCreate(combatant, _options) {
    if (combatant.combat?.started) return;

    setTimeout(() => {
      this._checkForInitiativeTies(combatant.combat);
    }, 300);
  }

  /**
   * Check for initiative ties in a combat encounter
   * @param {Combat} combat - The combat encounter to check
   */
  static _checkForInitiativeTies(combat) {
    if (!combat || combat.started) return;
    if (this.processedCombats.has(combat.id)) return;

    const relevantCombatants = this._getRelevantCombatants(combat);
    const rolledCombatants = relevantCombatants.filter((c) => c.initiative !== null && c.initiative !== undefined);

    if (rolledCombatants.length !== relevantCombatants.length) return;
    if (rolledCombatants.length === 0) return;

    const tieGroups = this._findTieGroups(rolledCombatants);
    if (tieGroups.length > 0) {
      console.log(
        `${MODULE.ID} | Found tie groups:`,
        tieGroups.map((g) => g.map((c) => c.name))
      );
      this.processedCombats.add(combat.id);
      this._handleInitiativeTies(combat, tieGroups);
    }
  }

  /**
   * Get relevant combatants based on settings
   * @param {Combat} combat - The combat encounter
   * @returns {Array<Combatant>} Filtered array of combatants
   */
  static _getRelevantCombatants(combat) {
    const includeNPCs = game.settings.get(MODULE.ID, MODULE.SETTINGS.INCLUDE_NPCS);
    return combat.combatants.filter((combatant) => {
      if (includeNPCs) return true;
      return combatant.actor?.type === 'character';
    });
  }

  /**
   * Find groups of combatants with tied initiative
   * @param {Array<Combatant>} combatants - Array of combatants to check
   * @returns {Array<Array<Combatant>>} Array of tie groups (each group has 2+ combatants)
   */
  static _findTieGroups(combatants) {
    const initiativeGroups = {};

    combatants.forEach((combatant) => {
      const initiative = combatant.initiative;
      if (!initiativeGroups[initiative]) {
        initiativeGroups[initiative] = [];
      }
      initiativeGroups[initiative].push(combatant);
    });

    return Object.values(initiativeGroups).filter((group) => group.length >= 2);
  }

  /**
   * Handle detected initiative ties
   * Either auto-starts rolloffs or notifies GM based on settings
   * @param {Combat} combat - The combat encounter
   * @param {Array<Array<Combatant>>} tieGroups - Array of tie groups
   */
  static _handleInitiativeTies(combat, tieGroups) {
    if (!game.user.isGM) return;

    const autoRolloff = game.settings.get(MODULE.ID, MODULE.SETTINGS.AUTO_ROLLOFF);
    if (autoRolloff) {
      console.log(`${MODULE.ID} | Auto-starting rolloffs`);
      tieGroups.forEach((group) => this._startRolloffForGroup(combat, group));
    } else {
      console.log(`${MODULE.ID} | Notifying GM of ties`);
      this._notifyGMOfTies(combat, tieGroups);
    }
  }

  /**
   * Start a rolloff for a group of tied combatants
   * @param {Combat} combat - The combat encounter
   * @param {Array<Combatant>} tiedCombatants - Array of tied combatants
   * @returns {Promise<void>}
   */
  static async _startRolloffForGroup(combat, tiedCombatants) {
    const rolloffId = `${combat.id}-${tiedCombatants[0].initiative}-${Date.now()}`;
    if (this.activeRolloffs.has(rolloffId)) return;

    this.activeRolloffs.set(rolloffId, { combat, combatants: tiedCombatants });
    console.log(
      `${MODULE.ID} | Starting rolloff ${rolloffId} for:`,
      tiedCombatants.map((c) => c.name)
    );

    try {
      if (tiedCombatants.length === 2) {
        await this._conductPairRolloff(combat, tiedCombatants, rolloffId);
      } else {
        await this._conductBracketRolloff(combat, tiedCombatants, rolloffId);
      }
    } catch (error) {
      console.error(`${MODULE.ID} | Error in rolloff:`, error);
      ui.notifications.error(`Rolloff failed: ${error.message}`);
    } finally {
      this.activeRolloffs.delete(rolloffId);
    }
  }

  /**
   * Conduct a rolloff between two combatants
   * @param {Combat} combat - The combat encounter
   * @param {Array<Combatant>} tiedCombatants - Array of 2 tied combatants
   * @param {string} rolloffId - Unique rolloff identifier
   * @returns {Promise<void>}
   */
  static async _conductPairRolloff(combat, tiedCombatants, rolloffId) {
    const dieType = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_DIE);
    console.log(
      `${MODULE.ID} | Conducting pair rolloff:`,
      tiedCombatants.map((c) => c.name)
    );

    const rollPromises = tiedCombatants.map(async (combatant) => {
      const owner = this._getOwnerUser(combatant);
      console.log(`${MODULE.ID} | Getting roll for ${combatant.name}, owner:`, owner?.name || 'none');

      if (!owner) {
        console.log(`${MODULE.ID} | Auto-rolling for unowned combatant`);
        const roll = await new Roll(`1${dieType}`).evaluate();
        await this._createAutoRollChatMessage(combatant, roll);
        return { combatant, roll: roll, total: roll.total };
      }

      try {
        console.log(`${MODULE.ID} | Sending query to ${owner.name} for ${combatant.name}`);
        const queryData = { combatantId: combatant.id, dieType: dieType, rolloffId: rolloffId };
        const result = await owner.query(`${MODULE.ID}.requestRoll`, queryData, {
          timeout: game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT) * 1000
        });
        console.log(`${MODULE.ID} | Got query result from ${owner.name}:`, result);
        return { combatant, roll: Roll.fromData(result.roll), total: result.total };
      } catch (error) {
        console.warn(`${MODULE.ID} | Player ${owner.name} failed to respond (${error.message}), auto-rolling`);
        const roll = await new Roll(`1${dieType}`).evaluate();
        await this._createAutoRollChatMessage(combatant, roll);
        return { combatant, roll: roll, total: roll.total };
      }
    });

    console.log(`${MODULE.ID} | Waiting for all rolls to complete...`);
    const results = await Promise.all(rollPromises);
    console.log(
      `${MODULE.ID} | All rolls complete:`,
      results.map((r) => ({ name: r.combatant.name, total: r.total }))
    );

    await this._resolveRolloff(combat, results, rolloffId);
  }

  /**
   * Conduct a bracket-style rolloff for 3+ combatants
   * @param {Combat} combat - The combat encounter
   * @param {Array<Combatant>} tiedCombatants - Array of tied combatants
   * @param {string} rolloffId - Unique rolloff identifier
   * @returns {Promise<void>}
   */
  static async _conductBracketRolloff(combat, tiedCombatants, rolloffId) {
    const shuffled = [...tiedCombatants].sort(() => Math.random() - 0.5);
    console.log(
      `${MODULE.ID} | Starting bracket rolloff with order:`,
      shuffled.map((c) => c.name)
    );

    let currentRound = shuffled;
    let roundNumber = 1;

    while (currentRound.length > 1) {
      console.log(
        `${MODULE.ID} | Bracket round ${roundNumber}:`,
        currentRound.map((c) => c.name)
      );

      const nextRound = [];

      for (let i = 0; i < currentRound.length; i += 2) {
        if (i + 1 < currentRound.length) {
          const pair = [currentRound[i], currentRound[i + 1]];
          const pairRolloffId = `${rolloffId}-r${roundNumber}-p${Math.floor(i / 2)}`;

          const dieType = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_DIE);
          const rollPromises = pair.map(async (combatant) => {
            const owner = this._getOwnerUser(combatant);

            if (!owner) {
              const roll = await new Roll(`1${dieType}`).evaluate();
              await this._createAutoRollChatMessage(combatant, roll);
              return { combatant, roll, total: roll.total };
            }

            try {
              const queryData = { combatantId: combatant.id, dieType, rolloffId: pairRolloffId };
              const result = await owner.query(`${MODULE.ID}.requestRoll`, queryData, {
                timeout: game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT) * 1000
              });
              return { combatant, roll: Roll.fromData(result.roll), total: result.total };
            } catch (error) {
              console.error(error);
              const roll = await new Roll(`1${dieType}`).evaluate();
              await this._createAutoRollChatMessage(combatant, roll);
              return { combatant, roll, total: roll.total };
            }
          });

          const pairResults = await Promise.all(rollPromises);
          const maxTotal = Math.max(...pairResults.map((r) => r.total));
          const winners = pairResults.filter((r) => r.total === maxTotal);

          if (winners.length === 1) {
            nextRound.push(winners[0].combatant);
          } else {
            ui.notifications.info(game.i18n.localize('Rollies.Messages.AnotherTie'));
            const subPairId = `${pairRolloffId}-reroll`;
            await this._conductPairRolloff(
              combat,
              winners.map((w) => w.combatant),
              subPairId
            );
            nextRound.push(winners[0].combatant);
          }
        } else {
          nextRound.push(currentRound[i]);
        }
      }

      currentRound = nextRound;
      roundNumber++;
    }

    if (currentRound.length === 1) {
      await this._applyRolloffWinner(combat, currentRound[0]);
    }
  }

  /**
   * Resolve a rolloff by determining the winner
   * @param {Combat} combat - The combat encounter
   * @param {Array<CombatantRollResult>} results - Array of roll results
   * @param {string} rolloffId - Unique rolloff identifier
   * @returns {Promise<void>}
   */
  static async _resolveRolloff(combat, results, rolloffId) {
    const maxTotal = Math.max(...results.map((r) => r.total));
    const winners = results.filter((r) => r.total === maxTotal);

    console.log(
      `${MODULE.ID} | Resolving rolloff. Max total:`,
      maxTotal,
      'Winners:',
      winners.map((w) => w.combatant.name)
    );

    if (winners.length > 1) {
      ui.notifications.info(game.i18n.localize('Rollies.Messages.AnotherTie'));
      const tiedCombatants = winners.map((w) => w.combatant);
      console.log(`${MODULE.ID} | Another tie detected, starting exploding rolloff`);
      await this._conductPairRolloff(combat, tiedCombatants, `${rolloffId}-explode`);
      return;
    }

    await this._applyRolloffWinner(combat, winners[0].combatant);
  }

  /**
   * Apply the rolloff winner by updating their initiative
   * @param {Combat} _combat - The combat encounter
   * @param {Combatant} winner - The winning combatant
   * @returns {Promise<void>}
   */
  static async _applyRolloffWinner(_combat, winner) {
    const newInitiative = winner.initiative + 0.01;
    console.log(`${MODULE.ID} | Applying winner: ${winner.name}, new initiative: ${newInitiative}`);

    await winner.update({ initiative: newInitiative });
    await this._createWinnerChatMessage(winner, newInitiative);

    const winnerData = {
      name: winner.name,
      img: winner.img || winner.actor?.img || 'icons/svg/mystery-man.svg',
      initiative: newInitiative
    };

    for (const user of game.users) {
      if (user.active) {
        try {
          await user.query(`${MODULE.ID}.showWinner`, { winner: winnerData }, { timeout: 5000 });
        } catch (error) {
          console.warn(`${MODULE.ID} | Could not show winner to ${user.name}:`, error.message);
        }
      }
    }
  }

  /**
   * Get the owner user for a combatant
   * @param {Combatant} combatant - The combatant
   * @returns {User|null} The owner user or null if none found
   */
  static _getOwnerUser(combatant) {
    if (!combatant.actor) return null;
    return game.users.find((user) => user.active && !user.isGM && combatant.actor.testUserPermission(user, 'OWNER'));
  }

  /**
   * Create a chat message for an automatic roll
   * @param {Combatant} combatant - The combatant who was auto-rolled for
   * @param {Roll} roll - The Roll object
   * @returns {Promise<ChatMessage>} The created chat message
   */
  static async _createAutoRollChatMessage(combatant, roll) {
    const content = `<div class="rollies-roll-message">
      <strong>${combatant.name}</strong> ${game.i18n.localize('Rollies.Chat.RolledFor')} ${game.i18n.localize('Rollies.Chat.Rolloff')}:
      ${roll.total} (${game.i18n.localize('Rollies.Chat.AutoRoll')})
    </div>`;

    return await ChatMessage.create({
      content: content,
      speaker: ChatMessage.getSpeaker({ actor: combatant.actor }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      rolls: [roll]
    });
  }

  /**
   * Create a chat message announcing the rolloff winner
   * @param {Combatant} winner - The winning combatant
   * @param {number} newInitiative - The winner's new initiative value
   * @returns {Promise<ChatMessage>} The created chat message
   */
  static async _createWinnerChatMessage(winner, newInitiative) {
    const content = `<div class="rollies-winner-message">
      <h3>${game.i18n.localize('Rollies.Chat.WinnerAnnouncement')}</h3>
      <p><strong>${winner.name}</strong> ${game.i18n.localize('Rollies.Chat.WinsRolloff')}</p>
      <p>${game.i18n.localize('Rollies.Chat.NewInitiative')}: ${newInitiative.toFixed(2)}</p>
    </div>`;

    return await ChatMessage.create({
      content: content,
      speaker: ChatMessage.getSpeaker(),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER
    });
  }

  /**
   * Notify GM of ties via dialog
   * @param {Combat} combat - The combat encounter
   * @param {Array<Array<Combatant>>} tieGroups - Array of tie groups
   */
  static _notifyGMOfTies(combat, tieGroups) {
    const dialog = new GMNotificationDialog(combat, tieGroups);
    dialog.render(true);
  }

  /**
   * Manually start rolloffs for tie groups
   * Called when GM manually triggers rolloffs from notification dialog
   * @param {Combat} combat - The combat encounter
   * @param {Array<Array<Combatant>>} tieGroups - Array of tie groups
   */
  static manuallyStartRolloffs(combat, tieGroups) {
    tieGroups.forEach((group) => this._startRolloffForGroup(combat, group));
  }
}
