/**
 * Main manager for handling initiative rolloffs
 * @module rolloff-manager
 */

import { GMNotificationDialog } from './dialogs/gm-notification.mjs';
import { MODULE } from './config.mjs';

/**
 * Rolloff tracking data
 * @typedef {object} RolloffData
 * @property {Combat} combat - The combat encounter
 * @property {Array<Combatant>} combatants - Array of tied combatants
 * @property {string} mode - Rolloff mode: 'pair' or 'bracket'
 * @property {Map<string, object>} rolls - Map of combatant IDs to roll results
 * @property {object} [bracket] - Bracket structure for bracket mode
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
      if (!initiativeGroups[initiative]) initiativeGroups[initiative] = [];
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
    if (autoRolloff) tieGroups.forEach((group) => this._startRolloffForGroup(combat, group));
    else this._notifyGMOfTies(combat, tieGroups);
  }

  /**
   * Get dexterity score for a combatant
   * @param {Combatant} combatant - The combatant
   * @returns {number} The dexterity score
   */
  static _getDexterity(combatant) {
    const actor = combatant.actor;
    if (!actor) return 0;
    // D&D 5e system
    return actor.system?.abilities?.dex?.value || 0;
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

    const mode = tiedCombatants.length === 2 ? 'pair' : 'bracket';
    this.activeRolloffs.set(rolloffId, {
      combat,
      combatants: tiedCombatants,
      mode,
      rolls: new Map()
    });

    try {
      if (mode === 'pair') {
        await this._conductPairRolloff(combat, tiedCombatants, rolloffId);
      } else {
        await this._conductBracketRolloff(combat, tiedCombatants, rolloffId);
      }
    } catch (error) {
      console.error(`${MODULE.ID} | Error in rolloff:`, error);
    } finally {
      this.activeRolloffs.delete(rolloffId);
    }
  }

  /**
   * Broadcast a roll update to all active users
   * @param {string} rolloffId - The rolloff ID
   * @param {Combatant} combatant - The combatant who rolled
   * @param {number} total - The roll total
   * @returns {Promise<void>}
   */
  static async _broadcastRollUpdate(rolloffId, combatant, total) {
    const updateData = {
      rolloffId,
      combatantId: combatant.id,
      total,
      name: combatant.name,
      img: combatant.img || combatant.actor?.img
    };

    for (const user of game.users) if (user.active && !user.isGM) await user.query(`${MODULE.ID}.rollUpdate`, updateData, { timeout: 1000 });
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

    // Prepare opponent data for each combatant
    const opponentsData = tiedCombatants.map((c) => ({
      id: c.id,
      name: c.name,
      img: c.img || c.actor?.img,
      userId: this._getOwnerUser(c)?.id
    }));

    const rollPromises = tiedCombatants.map(async (combatant, index) => {
      const opponents = [opponentsData[1 - index]]; // The other combatant
      const owner = this._getOwnerUser(combatant);

      if (!owner) {
        const roll = await new Roll(`1${dieType}`).evaluate({ allowInteractive: false });
        await this._createAutoRollChatMessage(combatant, roll);

        console.log(`${MODULE.ID} | 🔔 Broadcasting roll (NPC auto-roll):`, {
          rolloffId,
          combatantId: combatant.id,
          combatantName: combatant.name,
          total: roll.total
        });

        // ORIGINAL BROADCAST CODE - adding logs
        for (const user of game.users) {
          if (user.active && !user.isGM) {
            try {
              await user.query(
                `${MODULE.ID}.rollUpdate`,
                {
                  rolloffId,
                  combatantId: combatant.id,
                  total: roll.total,
                  name: combatant.name,
                  img: combatant.img || combatant.actor?.img
                },
                { timeout: 1000 }
              );
              console.log(`${MODULE.ID} | ✅ Broadcast sent to ${user.name}`);
            } catch (err) {
              console.warn(`${MODULE.ID} | ⚠️ Broadcast failed to ${user.name}:`, err.message);
            }
          }
        }

        return { combatant, roll: roll, total: roll.total };
      }

      try {
        const queryData = {
          combatantId: combatant.id,
          dieType: dieType,
          rolloffId: rolloffId,
          mode: 'pair',
          opponents: opponents
        };

        console.log(`${MODULE.ID} | 📤 Requesting roll from ${owner.name} for ${combatant.name}`);

        const result = await owner.query(`${MODULE.ID}.requestRoll`, queryData, {
          timeout: game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT) * 1000
        });

        console.log(`${MODULE.ID} | 📥 Got roll result from ${owner.name}:`, result.total);
        console.log(`${MODULE.ID} | 🔔 Broadcasting roll (player roll):`, {
          rolloffId,
          combatantId: combatant.id,
          combatantName: combatant.name,
          total: result.total
        });

        // ORIGINAL BROADCAST CODE - adding logs
        for (const user of game.users) {
          if (user.active && !user.isGM) {
            try {
              await user.query(
                `${MODULE.ID}.rollUpdate`,
                {
                  rolloffId,
                  combatantId: combatant.id,
                  total: result.total,
                  name: combatant.name,
                  img: combatant.img || combatant.actor?.img
                },
                { timeout: 1000 }
              );
              console.log(`${MODULE.ID} | ✅ Broadcast sent to ${user.name}`);
            } catch (err) {
              console.warn(`${MODULE.ID} | ⚠️ Broadcast failed to ${user.name}:`, err.message);
            }
          }
        }

        return { combatant, roll: Roll.fromData(result.roll), total: result.total };
      } catch (error) {
        console.warn(`${MODULE.ID} | Player ${owner.name} failed to respond (${error.message}), auto-rolling`);
        const roll = await new Roll(`1${dieType}`).evaluate({ allowInteractive: false });
        await this._createAutoRollChatMessage(combatant, roll);

        console.log(`${MODULE.ID} | 🔔 Broadcasting roll (timeout auto-roll):`, {
          rolloffId,
          combatantId: combatant.id,
          combatantName: combatant.name,
          total: roll.total
        });

        // ORIGINAL BROADCAST CODE - adding logs
        for (const user of game.users) {
          if (user.active && !user.isGM) {
            try {
              await user.query(
                `${MODULE.ID}.rollUpdate`,
                {
                  rolloffId,
                  combatantId: combatant.id,
                  total: roll.total,
                  name: combatant.name,
                  img: combatant.img || combatant.actor?.img
                },
                { timeout: 1000 }
              );
              console.log(`${MODULE.ID} | ✅ Broadcast sent to ${user.name}`);
            } catch (err) {
              console.warn(`${MODULE.ID} | ⚠️ Broadcast failed to ${user.name}:`, err.message);
            }
          }
        }

        return { combatant, roll: roll, total: roll.total };
      }
    });

    const results = await Promise.all(rollPromises);
    await this._resolveRolloff(combat, results, rolloffId);
  }

  /**
   * Build bracket structure - lowest 2 dex fight first, winner fights highest dex
   * @param {Array<Combatant>} combatants - Array of tied combatants
   * @param {string} baseRolloffId - Base rolloff ID
   * @returns {object} Bracket structure
   */
  static _buildBracket(combatants, baseRolloffId) {
    // Sort by dexterity (lowest first for easier indexing)
    const sorted = [...combatants].sort((a, b) => this._getDexterity(a) - this._getDexterity(b));

    const bracket = {
      rounds: [],
      combatants: sorted.map((c) => ({
        id: c.id,
        name: c.name,
        img: c.img || c.actor?.img,
        dex: this._getDexterity(c)
      }))
    };

    // Round 0: Lowest two dex fight each other
    bracket.rounds.push({
      roundNumber: 0,
      matches: [
        {
          matchId: `${baseRolloffId}-r0-m0`,
          combatant1: {
            id: sorted[0].id,
            name: sorted[0].name,
            img: sorted[0].img || sorted[0].actor?.img
          },
          combatant2: {
            id: sorted[1].id,
            name: sorted[1].name,
            img: sorted[1].img || sorted[1].actor?.img
          },
          winner: null,
          loser: null
        }
      ]
    });

    // Round 1: Winner of round 0 vs highest dex player
    bracket.rounds.push({
      roundNumber: 1,
      matches: [
        {
          matchId: `${baseRolloffId}-r1-m0`,
          combatant1: {
            id: sorted[2].id,
            name: sorted[2].name,
            img: sorted[2].img || sorted[2].actor?.img
          },
          combatant2: null, // Will be filled by winner from round 0
          winner: null,
          loser: null
        }
      ]
    });

    return bracket;
  }

  /**
   * Conduct a bracket-style rolloff for 3+ combatants
   * @param {Combat} combat - The combat encounter
   * @param {Array<Combatant>} tiedCombatants - Array of tied combatants
   * @param {string} rolloffId - Unique rolloff identifier
   * @returns {Promise<void>}
   */
  static async _conductBracketRolloff(combat, tiedCombatants, rolloffId) {
    const bracket = this._buildBracket(tiedCombatants, rolloffId);

    // Store bracket in active rolloffs
    const rolloffData = this.activeRolloffs.get(rolloffId);
    if (rolloffData) rolloffData.bracket = bracket;

    // Round 0: Lowest two dex fight
    const round0 = bracket.rounds[0];
    const match0 = round0.matches[0];

    const combatant1 = tiedCombatants.find((c) => c.id === match0.combatant1.id);
    const combatant2 = tiedCombatants.find((c) => c.id === match0.combatant2.id);

    await this._conductBracketMatch(combat, combatant1, combatant2, match0, bracket, tiedCombatants);

    // Round 1: Winner vs highest dex
    const round1 = bracket.rounds[1];
    const match1 = round1.matches[0];

    // Fill in combatant2 with the winner from round 0
    match1.combatant2 = match0.winner;

    const combatant3 = tiedCombatants.find((c) => c.id === match1.combatant1.id);
    const winnerFromR0 = tiedCombatants.find((c) => c.id === match0.winner.id);

    await this._conductBracketMatch(combat, combatant3, winnerFromR0, match1, bracket, tiedCombatants);

    // Final winner announcement
    const finalWinner = combat.combatants.get(match1.winner.id);
    const winnerData = {
      name: finalWinner.name,
      img: finalWinner.img || finalWinner.actor?.img,
      initiative: finalWinner.initiative
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
   * Conduct a single bracket match
   * @param {Combat} combat - The combat encounter
   * @param {Combatant} combatant1 - First combatant
   * @param {Combatant} combatant2 - Second combatant
   * @param {object} match - Match data object
   * @param {object} bracket - Full bracket structure
   * @param {Array<Combatant>} allCombatants - All combatants in the bracket
   * @returns {Promise<void>}
   * @private
   */
  static async _conductBracketMatch(combat, combatant1, combatant2, match, bracket, allCombatants) {
    const dieType = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_DIE);

    // Prepare opponents for this match
    const opponents = [
      { id: combatant2.id, name: combatant2.name, img: combatant2.img || combatant2.actor?.img },
      { id: combatant1.id, name: combatant1.name, img: combatant1.img || combatant1.actor?.img }
    ];

    // Conduct match
    const matchCombatants = [combatant1, combatant2];
    const rollPromises = matchCombatants.map(async (combatant, index) => {
      const owner = this._getOwnerUser(combatant);
      const opponentData = [opponents[index]];

      if (!owner) {
        const roll = await new Roll(`1${dieType}`).evaluate({ allowInteractive: false });
        await this._createAutoRollChatMessage(combatant, roll);
        await this._broadcastRollUpdate(match.matchId, combatant, roll.total);
        return { combatant, roll, total: roll.total };
      }

      try {
        const queryData = {
          combatantId: combatant.id,
          dieType,
          rolloffId: match.matchId,
          mode: 'bracket',
          opponents: opponentData,
          bracket: bracket
        };
        const result = await owner.query(`${MODULE.ID}.requestRoll`, queryData, {
          timeout: game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT) * 1000
        });
        await this._broadcastRollUpdate(match.matchId, combatant, result.total);
        return { combatant, roll: Roll.fromData(result.roll), total: result.total };
      } catch (error) {
        console.warn(`${MODULE.ID} | Player failed to respond, auto-rolling`, error);
        const roll = await new Roll(`1${dieType}`).evaluate({ allowInteractive: false });
        await this._createAutoRollChatMessage(combatant, roll);
        await this._broadcastRollUpdate(match.matchId, combatant, roll.total);
        return { combatant, roll, total: roll.total };
      }
    });

    const matchResults = await Promise.all(rollPromises);

    // Determine winner
    const maxTotal = Math.max(...matchResults.map((r) => r.total));
    const winners = matchResults.filter((r) => r.total === maxTotal);

    if (winners.length > 1) {
      // Tie - reroll this match
      ui.notifications.info(game.i18n.localize('Rollies.Messages.AnotherTie'));
      await this._conductBracketMatch(combat, combatant1, combatant2, match, bracket, allCombatants);
      return; // Winner/loser set in recursive call
    }

    const winner = winners[0].combatant;
    const loser = matchResults.find((r) => r.combatant.id !== winner.id).combatant;

    // Update initiative for winner
    const maxPairInitiative = Math.max(combatant1.initiative, combatant2.initiative);
    const newInitiative = maxPairInitiative + 0.01;
    await winner.update({ initiative: newInitiative });
    await this._createWinnerChatMessage(winner, newInitiative);

    match.winner = { id: winner.id, name: winner.name, img: winner.img || winner.actor?.img };
    match.loser = { id: loser.id, name: loser.name, img: loser.img || loser.actor?.img };
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
    if (winners.length > 1) {
      ui.notifications.info(game.i18n.localize('Rollies.Messages.AnotherTie'));
      const tiedCombatants = winners.map((w) => w.combatant);
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
    await winner.update({ initiative: newInitiative });
    await this._createWinnerChatMessage(winner, newInitiative);
    const winnerData = { name: winner.name, img: winner.img || winner.actor?.img, initiative: newInitiative };
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
    return await ChatMessage.create({ content: content, speaker: ChatMessage.getSpeaker({ actor: combatant.actor }), style: CONST.CHAT_MESSAGE_STYLES.OTHER, rolls: [roll] });
  }

  /**
   * Create a chat message announcing the rolloff winner
   * @param {Combatant} winner - The winning combatant
   * @param {number} _newInitiative - The winner's new initiative value
   * @returns {Promise<ChatMessage>} The created chat message
   */
  static async _createWinnerChatMessage(winner, _newInitiative) {
    const content = `<div class="rollies-winner-message">
    <h3>${game.i18n.localize('Rollies.Chat.WinnerAnnouncement')}</h3>
    <p><strong>${winner.name}</strong> ${game.i18n.localize('Rollies.Chat.WinsRolloff')}</p>
  </div>`;
    return await ChatMessage.create({ content: content, speaker: ChatMessage.getSpeaker(), style: CONST.CHAT_MESSAGE_STYLES.OTHER });
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
