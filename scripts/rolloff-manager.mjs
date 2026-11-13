/**
 * Detects initiative ties and runs knockout rolloffs from the primary GM's client
 * @module rolloff-manager
 */

import { createBracket, initiativeFor, openMatches, placeRound } from './bracket.mjs';
import { createResultsMessage, createRollMessage } from './chat.mjs';
import { MODULE } from './config.mjs';
import { GMNotificationDialog } from './dialogs/gm-notification.mjs';
import { KnockoutOverlay } from './dialogs/knockout-overlay.mjs';

/** Milliseconds the overlay's entrance plays before the first roll */
const INTRO_DELAY = 1400;

/** Milliseconds between rounds so the winners' lines can draw */
const ROUND_DELAY = 1100;

/** Milliseconds a tied match stays on screen before the re-roll */
const TIE_DELAY = 1200;

/**
 * Detects initiative ties and runs knockout rolloffs
 */
export class RolloffManager {
  /**
   * Combat IDs whose ties have already been handled
   * @type {Set<string>}
   */
  static processedCombats = new Set();

  /**
   * Register combat hooks on every client
   */
  static initialize() {
    Hooks.on('updateCombatant', this._onCombatantUpdate.bind(this));
    Hooks.on('createCombatant', this._onCombatantCreate.bind(this));
    Hooks.on('deleteCombat', this._onCombatDelete.bind(this));
  }

  /**
   * Forget a deleted combat and close its overlay
   * @param {Combat} combat - The deleted combat encounter
   */
  static _onCombatDelete(combat) {
    this.processedCombats.delete(combat.id);
    KnockoutOverlay.dismiss(combat.id);
  }

  /**
   * Check for ties when a combatant's initiative changes before combat starts
   * @param {Combatant} combatant - The updated combatant
   * @param {object} update - Update data
   * @param {object} options - Update options
   */
  static _onCombatantUpdate(combatant, update, options) {
    if (!('initiative' in update)) return;
    if (options?.rollies?.rolloffResolution) return;
    if (combatant.combat?.started) return;
    setTimeout(() => this._checkForInitiativeTies(combatant.combat), 200);
  }

  /**
   * Check for ties when a combatant joins before combat starts
   * @param {Combatant} combatant - The created combatant
   */
  static _onCombatantCreate(combatant) {
    if (combatant.combat?.started) return;
    setTimeout(() => this._checkForInitiativeTies(combatant.combat), 300);
  }

  /**
   * Find ties once every relevant combatant has rolled initiative
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
   * Combatants that take part in rolloffs, per the NPC setting
   * @param {Combat} combat - The combat encounter
   * @returns {Array<Combatant>} Relevant combatants
   */
  static _getRelevantCombatants(combat) {
    const includeNPCs = game.settings.get(MODULE.ID, MODULE.SETTINGS.INCLUDE_NPCS);
    return combat.combatants.filter((combatant) => includeNPCs || combatant.actor?.type === 'character');
  }

  /**
   * Group combatants sharing an initiative value
   * @param {Array<Combatant>} combatants - Combatants to check
   * @returns {Array<Array<Combatant>>} Tie groups of two or more
   */
  static _findTieGroups(combatants) {
    const initiativeGroups = Map.groupBy(combatants, (combatant) => combatant.initiative);
    return [...initiativeGroups.values()].map((group) => this._collapseCombatantGroups(group)).filter((group) => group.length >= 2);
  }

  /**
   * Reduce a tied bucket so each group of combatants contributes a single entrant
   * @param {Array<Combatant>} combatants - Combatants sharing one initiative value
   * @returns {Array<Combatant>} One entrant per group, plus every ungrouped combatant
   */
  static _collapseCombatantGroups(combatants) {
    const seenGroups = new Set();
    return combatants.filter((combatant) => {
      const key = this._getGroupingKey(combatant);
      if (!key) return true;
      if (seenGroups.has(key)) return false;
      seenGroups.add(key);
      return true;
    });
  }

  /**
   * Build the key identifying combatants that act as one
   * @param {Combatant} combatant - The combatant to key
   * @returns {string|null} The grouping key, or null when the combatant stands alone
   */
  static _getGroupingKey(combatant) {
    if (combatant.group?.id) return `group:${combatant.group.id}`;
    const token = combatant.token;
    if (!token || token.actorLink) return null;
    const baseActorId = token.baseActor?.id;
    if (!baseActorId) return null;
    return `token:${token.disposition}:${baseActorId}`;
  }

  /**
   * Start rolloffs, or ask the GM first when auto-rolloff is off
   * @param {Combat} combat - The combat encounter
   * @param {Array<Array<Combatant>>} tieGroups - Tie groups
   */
  static _handleInitiativeTies(combat, tieGroups) {
    if (!ATLAS.isPrimaryGM) return;
    if (game.settings.get(MODULE.ID, MODULE.SETTINGS.AUTO_ROLLOFF)) this.manuallyStartRolloffs(combat, tieGroups);
    else new GMNotificationDialog(combat, tieGroups).render(true);
  }

  /**
   * Run each tie group's knockout in turn, so only one overlay shows at a time
   * @param {Combat} combat - The combat encounter
   * @param {Array<Array<Combatant>>} tieGroups - Tie groups
   * @returns {Promise<void>}
   */
  static async manuallyStartRolloffs(combat, tieGroups) {
    for (const [i, group] of tieGroups.entries()) {
      try {
        await this._runKnockout(combat, group);
      } catch (error) {
        ATLAS.log(1, 'Error in rolloff:', error);
      }
      if (i < tieGroups.length - 1) await this._pause(KnockoutOverlay.linger + 400);
    }
  }

  /**
   * Dexterity score used for seeding
   * @param {Combatant} combatant - The combatant
   * @returns {number|null} The dexterity score, or null when the system has none
   */
  static _getDexterity(combatant) {
    return combatant.actor?.system?.abilities?.dex?.value ?? null;
  }

  /**
   * Play a full knockout for one tie group and apply the resulting initiative
   * @param {Combat} combat - The combat encounter
   * @param {Array<Combatant>} tied - Tied combatants
   * @returns {Promise<void>}
   */
  static async _runKnockout(combat, tied) {
    const entrants = [...tied]
      .sort((a, b) => (this._getDexterity(b) ?? 0) - (this._getDexterity(a) ?? 0))
      .map((c, i) => ({ id: c.id, name: c.name, img: c.img || c.actor?.img || null, dex: this._getDexterity(c), seed: i + 1, hidden: c.hidden }));
    const die = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_DIE);
    const bracket = createBracket({ id: foundry.utils.randomID(), combatId: combat.id, base: tied[0].initiative, die, entrants });
    this._broadcast(bracket);
    await this._pause(INTRO_DELAY);
    while (bracket.current < bracket.R) {
      const r = bracket.current;
      await Promise.all(openMatches(bracket, r).map((seats) => this._playMatch(bracket, r, seats)));
      if (!game.combats.has(combat.id)) return;
      placeRound(bracket, r, () => Math.ceil(CONFIG.Dice.randomUniform() * 20));
      bracket.current++;
      this._broadcast(bracket);
      if (bracket.current < bracket.R) await this._pause(ROUND_DELAY);
    }
    await this._applyResults(combat, bracket);
    bracket.done = true;
    this._broadcast(bracket);
  }

  /**
   * Roll one match until it has a winner, then advance the winner
   * @param {object} bracket - The bracket, mutated
   * @param {number} r - Round index
   * @param {Array<number>} seats - Seat indices of the match
   * @returns {Promise<void>}
   */
  static async _playMatch(bracket, r, [ka, kb]) {
    const pair = [bracket.rounds[r][ka], bracket.rounds[r][kb]];
    for (;;) {
      bracket.rolling.push(...pair.map((seat) => seat.c));
      this._broadcast(bracket);
      await Promise.all(
        pair.map(async (seat) => {
          seat.roll = await this._rollFor(bracket, seat.c);
          bracket.rolling = bracket.rolling.filter((c) => c !== seat.c);
          this._broadcast(bracket);
        })
      );
      if (!game.combats.has(bracket.combatId)) return;
      if (pair[0].roll !== pair[1].roll) break;
      await this._pause(TIE_DELAY);
      pair.forEach((seat) => {
        seat.tie = seat.roll;
        delete seat.roll;
      });
    }
    const [winner, loser] = pair[0].roll > pair[1].roll ? pair : [pair[1], pair[0]];
    winner.result = 'won';
    loser.result = 'lost';
    bracket.rounds[r + 1][ka >> 1].c = winner.c;
    bracket.eliminated.push({ c: loser.c, round: r, roll: loser.roll });
    this._broadcast(bracket);
  }

  /**
   * Get one entrant's roll: their owner rolls in the overlay, anyone else is rolled for
   * @param {object} bracket - The bracket
   * @param {number} c - Entrant index
   * @returns {Promise<number>} The roll total
   */
  static async _rollFor(bracket, c) {
    const entrant = bracket.entrants[c];
    const combatant = game.combats.get(bracket.combatId)?.combatants.get(entrant.id);
    const owner = combatant ? this._getOwnerUser(combatant) : null;
    if (owner) {
      const base = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT);
      const multiplier = game.settings.get(MODULE.ID, MODULE.SETTINGS.MANUAL_DICE_TIMEOUT_MULTIPLIER);
      const timeout = (base * multiplier + base) * 1000 + 5000;
      let timer;
      try {
        // Core passes the timeout to the server but never rejects on the client, so race it here
        const result = await Promise.race([
          owner.query(`${MODULE.ID}.knockoutRoll`, { bracket, entrant: c }, { timeout }),
          new Promise((_resolve, reject) => (timer = setTimeout(() => reject(new Error('Timed out')), timeout)))
        ]);
        return result.total;
      } catch (error) {
        ATLAS.log(3, `No roll from ${owner.name} for ${entrant.name}, rolling for them:`, error);
      } finally {
        clearTimeout(timer);
      }
    }
    if (!game.combats.has(bracket.combatId)) return 0;
    const roll = await new Roll(`1${bracket.die}`).evaluate({ allowInteractive: false });
    await createRollMessage(entrant, combatant, roll, true);
    return roll.total;
  }

  /**
   * Write the final initiative, fire the public hook and post the results card
   * @param {Combat} combat - The combat encounter
   * @param {object} bracket - The decided bracket
   * @returns {Promise<void>}
   */
  static async _applyResults(combat, bracket) {
    const updates = bracket.places.map((place, i) => ({ _id: bracket.entrants[place.c].id, initiative: initiativeFor(bracket, i) })).filter((update) => combat.combatants.has(update._id));
    await combat.updateEmbeddedDocuments('Combatant', updates, { rollies: { rolloffResolution: true } });
    const [winner, ...losers] = bracket.places.map((place) => combat.combatants.get(bracket.entrants[place.c].id)).filter(Boolean);
    Hooks.callAll(`${MODULE.ID}.rolloffResolved`, {
      combatId: combat.id,
      mode: bracket.count === 2 ? 'pair' : 'bracket',
      winner: this._toHookData(winner),
      losers: losers.map((c) => this._toHookData(c))
    });
    await createResultsMessage(bracket);
  }

  /**
   * Show the bracket on this client and send it to every other active user
   * @param {object} bracket - The bracket
   */
  static _broadcast(bracket) {
    if (!game.combats.has(bracket.combatId)) return;
    const snapshot = foundry.utils.deepClone(bracket);
    KnockoutOverlay.show(snapshot);
    for (const user of game.users) {
      if (!user.active || user.isSelf) continue;
      user.query(`${MODULE.ID}.knockoutState`, snapshot, { timeout: 5000 }).catch(() => {});
    }
  }

  /**
   * Wait a beat
   * @param {number} ms - Milliseconds
   * @returns {Promise<void>}
   */
  static _pause(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Reduce a combatant to the plain shape used in hook payloads
   * @param {Combatant} combatant - The combatant
   * @returns {{id: string, name: string, img: string}} Plain combatant data
   */
  static _toHookData(combatant) {
    return { id: combatant.id, name: combatant.name, img: combatant.img || combatant.actor?.img };
  }

  /**
   * The active non-GM owner who rolls for a combatant
   * @param {Combatant} combatant - The combatant
   * @returns {User|undefined} The owner, if one is online
   */
  static _getOwnerUser(combatant) {
    if (!combatant.actor) return undefined;
    return game.users.find((user) => user.active && !user.isGM && combatant.actor.testUserPermission(user, 'OWNER'));
  }
}
