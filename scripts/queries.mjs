import { ROLLIES_CONFIG } from './config.mjs';
import { PlayerRollDialog } from './player-roll-dialog.mjs';

/**
 * Register query handlers for inter-client communication
 */
export function registerQueries() {
  console.log('Rollies | Registering queries');
  CONFIG.queries[`${ROLLIES_CONFIG.moduleId}.requestRoll`] = handleRollRequest;
  CONFIG.queries[`${ROLLIES_CONFIG.moduleId}.showWinner`] = handleShowWinner;
}

async function handleRollRequest(queryData, { timeout }) {
  console.log('Rollies | Received roll request:', queryData);
  const { combatantId, dieType, rolloffId } = queryData;
  const combatant = game.combat?.combatants?.get(combatantId);
  if (!combatant) throw new Error(`Combatant ${combatantId} not found`);
  if (!game.user.isGM && !combatant.isOwner) throw new Error(`User ${game.user.name} cannot roll for ${combatant.name}`);
  console.log('Rollies | Showing roll dialog for', combatant.name);
  const result = await showRollDialog(combatant, dieType, rolloffId);
  console.log('Rollies | Roll result:', result);
  return { combatantId, rolloffId, roll: result.roll.toJSON(), total: result.total };
}

async function handleShowWinner(queryData, { timeout }) {
  const { winner } = queryData;
  const showAnnouncement = game.settings.get(ROLLIES_CONFIG.moduleId, ROLLIES_CONFIG.settings.showWinnerAnnouncement);
  if (showAnnouncement) {
    const { WinnerAnnouncementDialog } = await import('./winner-announcement-dialog.mjs');
    const dialog = new WinnerAnnouncementDialog(winner);
    dialog.render(true);
  }
  return { acknowledged: true };
}

async function showRollDialog(combatant, dieType, rolloffId) {
  return new Promise((resolve, reject) => {
    console.log('Rollies | Creating PlayerRollDialog');
    const dialog = new PlayerRollDialog(combatant, dieType, rolloffId, resolve, reject);
    dialog.render(true);
  });
}
