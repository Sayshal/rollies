import { GMNotificationDialog } from './gm-notification-dialog.mjs';
import { ROLLIES_CONFIG } from './config.mjs';

/**
 * Main manager for handling initiative rolloffs
 */
export class RolloffManager {
  static activeRolloffs = new Map();
  static processedCombats = new Set();

  static initialize() {
    console.log('Rollies | Initializing RolloffManager');
    Hooks.on('updateCombatant', this._onCombatantUpdate.bind(this));
    Hooks.on('createCombatant', this._onCombatantCreate.bind(this));
    Hooks.on('deleteCombat', this._onCombatDelete.bind(this));
  }

  static _onCombatDelete(combat, options) {
    this.processedCombats.delete(combat.id);
    this.activeRolloffs.delete(combat.id);
  }

  static _onCombatantUpdate(combatant, update, options) {
    if (!update.initiative) return;
    if (combatant.combat?.started) return;
    setTimeout(() => {
      this._checkForInitiativeTies(combatant.combat);
    }, 200);
  }

  static _onCombatantCreate(combatant, options) {
    if (combatant.combat?.started) return;
    setTimeout(() => {
      this._checkForInitiativeTies(combatant.combat);
    }, 300);
  }

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
        'Rollies | Found tie groups:',
        tieGroups.map((g) => g.map((c) => c.name))
      );
      this.processedCombats.add(combat.id);
      this._handleInitiativeTies(combat, tieGroups);
    }
  }

  static _getRelevantCombatants(combat) {
    const includeNPCs = game.settings.get(ROLLIES_CONFIG.moduleId, ROLLIES_CONFIG.settings.includeNPCs);
    return combat.combatants.filter((combatant) => {
      if (includeNPCs) return true;
      return combatant.actor?.type === 'character';
    });
  }

  static _findTieGroups(combatants) {
    const initiativeGroups = {};
    combatants.forEach((combatant) => {
      const initiative = combatant.initiative;
      if (!initiativeGroups[initiative]) initiativeGroups[initiative] = [];
      initiativeGroups[initiative].push(combatant);
    });
    return Object.values(initiativeGroups).filter((group) => group.length >= 2);
  }

  static _handleInitiativeTies(combat, tieGroups) {
    if (!game.user.isGM) return;
    const autoRolloff = game.settings.get(ROLLIES_CONFIG.moduleId, ROLLIES_CONFIG.settings.autoRolloff);
    if (autoRolloff) {
      console.log('Rollies | Auto-starting rolloffs');
      tieGroups.forEach((group) => this._startRolloffForGroup(combat, group));
    } else {
      console.log('Rollies | Notifying GM of ties');
      this._notifyGMOfTies(combat, tieGroups);
    }
  }

  static async _startRolloffForGroup(combat, tiedCombatants) {
    const rolloffId = `${combat.id}-${tiedCombatants[0].initiative}-${Date.now()}`;
    if (this.activeRolloffs.has(rolloffId)) return;
    this.activeRolloffs.set(rolloffId, { combat, combatants: tiedCombatants });
    console.log(
      `Rollies | Starting rolloff ${rolloffId} for:`,
      tiedCombatants.map((c) => c.name)
    );

    try {
      if (tiedCombatants.length === 2) await this._conductPairRolloff(combat, tiedCombatants, rolloffId);
      else await this._conductBracketRolloff(combat, tiedCombatants, rolloffId);
    } catch (error) {
      console.error('Rollies | Error in rolloff:', error);
      ui.notifications.error(`Rolloff failed: ${error.message}`);
    } finally {
      this.activeRolloffs.delete(rolloffId);
    }
  }

  static async _conductPairRolloff(combat, tiedCombatants, rolloffId) {
    const dieType = game.settings.get(ROLLIES_CONFIG.moduleId, ROLLIES_CONFIG.settings.rolloffDie);
    console.log(
      'Rollies | Conducting pair rolloff:',
      tiedCombatants.map((c) => c.name)
    );
    const rollPromises = tiedCombatants.map(async (combatant) => {
      const owner = this._getOwnerUser(combatant);
      console.log(`Rollies | Getting roll for ${combatant.name}, owner:`, owner?.name || 'none');
      if (!owner) {
        console.log('Rollies | Auto-rolling for unowned combatant');
        const roll = await new Roll(`1${dieType}`).evaluate();
        await this._createAutoRollChatMessage(combatant, roll);
        return { combatant, roll: roll, total: roll.total };
      }

      try {
        console.log(`Rollies | Sending query to ${owner.name} for ${combatant.name}`);
        const queryData = { combatantId: combatant.id, dieType: dieType, rolloffId: rolloffId };
        const result = await owner.query(`${ROLLIES_CONFIG.moduleId}.requestRoll`, queryData, {
          timeout: game.settings.get(ROLLIES_CONFIG.moduleId, ROLLIES_CONFIG.settings.rolloffTimeout) * 1000
        });
        console.log(`Rollies | Got query result from ${owner.name}:`, result);
        return { combatant, roll: Roll.fromData(result.roll), total: result.total };
      } catch (error) {
        console.warn(`Rollies | Player ${owner.name} failed to respond (${error.message}), auto-rolling`);
        const roll = await new Roll(`1${dieType}`).evaluate();
        await this._createAutoRollChatMessage(combatant, roll);
        return { combatant, roll: roll, total: roll.total };
      }
    });
    console.log('Rollies | Waiting for all rolls to complete...');
    const results = await Promise.all(rollPromises);
    console.log(
      'Rollies | All rolls complete:',
      results.map((r) => ({ name: r.combatant.name, total: r.total }))
    );
    await this._resolveRolloff(combat, results, rolloffId);
  }

  static async _conductBracketRolloff(combat, tiedCombatants, rolloffId) {
    const shuffled = [...tiedCombatants].sort(() => Math.random() - 0.5);
    console.log(
      'Rollies | Starting bracket rolloff with order:',
      shuffled.map((c) => c.name)
    );
    let currentRound = shuffled;
    let roundNumber = 1;
    while (currentRound.length > 1) {
      console.log(
        `Rollies | Bracket round ${roundNumber}:`,
        currentRound.map((c) => c.name)
      );
      const nextRound = [];
      for (let i = 0; i < currentRound.length; i += 2) {
        if (i + 1 < currentRound.length) {
          const pair = [currentRound[i], currentRound[i + 1]];
          const pairRolloffId = `${rolloffId}-r${roundNumber}-p${Math.floor(i / 2)}`;
          await this._conductPairRolloff(combat, pair, pairRolloffId);
          nextRound.push(pair[0]);
        } else {
          nextRound.push(currentRound[i]);
        }
      }
      currentRound = nextRound;
      roundNumber++;
    }

    if (currentRound.length === 1) await this._applyRolloffWinner(combat, currentRound[0]);
  }

  static async _resolveRolloff(combat, results, rolloffId) {
    const maxTotal = Math.max(...results.map((r) => r.total));
    const winners = results.filter((r) => r.total === maxTotal);
    console.log(
      'Rollies | Resolving rolloff. Max total:',
      maxTotal,
      'Winners:',
      winners.map((w) => w.combatant.name)
    );
    if (winners.length > 1) {
      ui.notifications.info(game.i18n.localize('Rollies.Messages.AnotherTie'));
      const tiedCombatants = winners.map((w) => w.combatant);
      console.log('Rollies | Another tie detected, starting exploding rolloff');
      await this._conductPairRolloff(combat, tiedCombatants, `${rolloffId}-explode`);
      return;
    }
    await this._applyRolloffWinner(combat, winners[0].combatant);
  }

  static async _applyRolloffWinner(combat, winner) {
    const newInitiative = winner.initiative + 1;
    console.log(`Rollies | Applying winner: ${winner.name}, new initiative: ${newInitiative}`);
    await winner.update({ initiative: newInitiative });
    await this._createWinnerChatMessage(winner);
    const winnerData = { name: winner.name, img: winner.img || winner.actor?.img || 'icons/svg/mystery-man.svg', initiative: newInitiative };
    for (const user of game.users) {
      if (user.active) await user.query(`${ROLLIES_CONFIG.moduleId}.showWinner`, { winner: winnerData }, { timeout: 5000 });
    }
  }

  static _getOwnerUser(combatant) {
    if (!combatant.actor) return null;
    return game.users.find((user) => user.active && !user.isGM && combatant.actor.testUserPermission(user, 'OWNER'));
  }

  static async _createAutoRollChatMessage(combatant, roll) {
    const content = `<div class="rollies-roll-message">
      <strong>${combatant.name}</strong> ${game.i18n.localize('Rollies.Chat.RolledFor')} ${game.i18n.localize('Rollies.Chat.Rolloff')}: 
      ${roll.total} (${game.i18n.localize('Rollies.Chat.AutoRoll')})
    </div>`;
    await ChatMessage.create({
      content: content,
      speaker: ChatMessage.getSpeaker({ actor: combatant.actor }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      rolls: [roll]
    });
  }

  static async _createWinnerChatMessage(winner) {
    const content = `<div class="rollies-winner-message">
      <h3>${game.i18n.localize('Rollies.Chat.WinnerAnnouncement')}</h3>
      <p><strong>${winner.name}</strong> ${game.i18n.localize('Rollies.Chat.WinsRolloff')}</p>
      <p>${game.i18n.localize('Rollies.Chat.NewInitiative')}: ${winner.initiative}</p>
    </div>`;
    await ChatMessage.create({
      content: content,
      speaker: ChatMessage.getSpeaker(),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER
    });
  }

  static _notifyGMOfTies(combat, tieGroups) {
    const dialog = new GMNotificationDialog(combat, tieGroups);
    dialog.render(true);
  }

  static manuallyStartRolloffs(combat, tieGroups) {
    tieGroups.forEach((group) => this._startRolloffForGroup(combat, group));
  }
}
