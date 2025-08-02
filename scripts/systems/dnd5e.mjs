/**
 * D&D 5e specific support for Rollies
 */
export function initializeDND5eSupport() {
  console.log('Rollies | Initializing D&D 5e support');

  // D&D 5e specific hooks can go here
  // For now, the core system should work fine with D&D 5e

  // Example: Listen for D&D 5e initiative rolls
  Hooks.on('dnd5e.rollInitiative', (actor, combatants) => {
    console.log(`Rollies | D&D 5e initiative rolled for ${actor.name}`);
  });
}
