# Rollies

![Rollies Hero](https://wiki.3deathsaves.com/rollies/hero.png)

![GitHub release](https://img.shields.io/github/v/release/Sayshal/rollies?style=for-the-badge)
![GitHub Downloads (specific asset, all releases)](<https://img.shields.io/github/downloads/Sayshal/rollies/module.zip?style=for-the-badge&logo=foundryvirtualtabletop&logoColor=white&logoSize=auto&label=Downloads%20(Total)&color=ff144f>)
![GitHub Downloads (specific asset, latest release)](<https://img.shields.io/github/downloads/Sayshal/rollies/latest/module.zip?sort=date&style=for-the-badge&logo=foundryvirtualtabletop&logoColor=white&logoSize=auto&label=Downloads%20(Latest)&color=ff144f>)

![Foundry Version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fversion%3Fstyle%3Dfor-the-badge%26url%3Dhttps%3A%2F%2Fgithub.com%2FSayshal%2Frollies%2Freleases%2Flatest%2Fdownload%2Fmodule.json)

## Supporting The Module

[![Discord](https://dcbadge.limes.pink/api/server/PzzUwU9gdz)](https://discord.gg/PzzUwU9gdz)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20Me-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/sayshal)

## Introduction

**Rollies** brings the excitement of Critical Role's initiative rolloffs to your Foundry VTT table. Never let a tie slow down combat again—when two or more combatants roll the same initiative, Rollies automatically detects the tie and prompts players to roll off for the higher position. Fast, fair, and cinematic, just like you see on stream.

Every tie plays out on a full-screen overlay the whole table watches. Two tied combatants get a head-to-head showdown, and three or more get a seeded knockout bracket.

## Why Rollies?

Traditional initiative tie resolution relies on manual intervention, static modifiers, or simple coin flips. Rollies transforms these mundane moments into engaging micro-encounters that:

- **Build Tension**: Players roll in real-time with countdown timers
- **Stay Fair**: Everyone gets their chance to roll, with auto-rolling for AFK players
- **Scale Elegantly**: Handles 2-person ties and 10-person ties with equal grace
- **Respect Player Agency**: Players control their own destiny rather than relying on passive stats
- **Keep Momentum**: Automated detection and resolution means combat starts faster

## Key Features

### Automatic Tie Detection

Rollies monitors initiative rolls and instantly identifies ties:

- **Smart Filtering**: Optionally include or exclude NPCs from rolloffs
- **Pre-Combat Only**: Only triggers before combat starts, never interrupts ongoing battles
- **GM Control**: Choose between automatic rolloffs or manual approval via notification dialog
- **Multiple Ties**: Each tied initiative value gets its own rolloff, one after another

<img src="https://wiki.3deathsaves.com/rollies/gm-notification.png" alt="Initiative tie notification" width="400">

### The Rolloff Overlay

Every client sees the same full-screen overlay while a tie is rolled off:

- **Showdown**: Two tied combatants face off around a centered "Goes first" plate
- **Knockout Bracket**: Three or more are seeded by dexterity into an elimination bracket, with byes for the top seeds
- **Pinwheel Layout**: One half of the bracket flows in from the top left, the other from the bottom right, and both meet at the champion
- **Parallel Rounds**: Every match in a round rolls at the same time
- **Full Order**: The champion goes first, and everyone else is placed by the round they fell in and the roll they lost with
- **Live Standings**: The initiative order fills in along the bottom as rounds finish
- **Themed by ATLAS**: The overlay follows the theme you pick for Rollies in 3DS:ATLAS

<img src="https://wiki.3deathsaves.com/rollies/pair-rolloff.png" alt="Pair rolloff" width="500">

<img src="https://wiki.3deathsaves.com/rollies/bracket-rolloff.png" alt="Knockout bracket rolloff" width="500">

### Player Experience

- **Roll Button**: A player's own combatants get a Roll button in their bracket slot
- **Countdown Timers**: The time left shows in the corner and turns red in the last five seconds
- **Auto-Roll Fallback**: AFK players are rolled for after the timeout
- **Minimize**: The overlay folds into a small bar at the top of the screen and opens again with a click
- **Hidden Combatants**: Players see hidden combatants as "Unknown"

### GM Tools

- **Die Type Selection**: Choose any die (d4, d6, d8, d10, d12, d20, d100)
- **Timeout Configuration**: Set rolloff duration from 3 to 60 seconds
- **Enforcement Options**: Auto-trigger or review ties before starting rolloffs
- **Hold on the Winner**: Keep the decided bracket on screen for a few seconds
- **Chat Integration**: Every roll and the final order appear in chat

## Installation

Get Rollies through Foundry's Module Manager or The Forge's Bazaar for instant setup.

### Manual Installation

1. Open Foundry's Configuration and Setup screen
2. Click Install Module in the Add-on Modules section
3. Paste this URL in the Manifest URL field: `https://github.com/Sayshal/rollies/releases/latest/download/module.json`
4. Click Install
5. Enable the module in your world

## Getting Started

### Quick Setup

1. **Enable the Module**: Activate Rollies in your world's module settings
2. **Configure Settings**: Open Module Settings and adjust Rollies options:
   - **Auto-trigger Rolloffs**: Automatically start rolloffs when ties detected (recommended)
   - **Rolloff Die Type**: Choose which die to use (default: d20)
   - **Include NPCs**: Whether NPCs participate in rolloffs
   - **Rolloff Timeout**: How long players have to roll (default: 30 seconds)
   - **Hold on the Winner**: Keep the decided bracket on screen for a few seconds (recommended)

### Using Rollies

1. **Roll Initiative**: Have players roll initiative as normal
2. **Automatic Detection**: Rollies detects any ties once all combatants have rolled
3. **Player Rolls**: The rolloff overlay opens for everyone and players roll from their bracket slots
4. **Resolution**: Each finishing place is 0.01 initiative above the next, so the tie is fully broken
5. **Start Combat**: Begin the encounter with properly ordered initiative

### For Players

When you're involved in an initiative tie:

1. The rolloff overlay opens and your combatant's slot shows a Roll button
2. Click Roll (or wait for the auto-roll if AFK)
3. Watch the other matches resolve as each roll lands
4. The winner stamps into the center plate and initiative updates automatically
5. If a match ties, both sides roll again

### For GMs

With auto-trigger enabled:

- Rollies handles everything automatically
- Players roll from the overlay
- Initiative updates when rolloffs complete

With auto-trigger disabled:

- Notification dialog appears showing all ties
- Review the tied combatants
- Click "Start Rolloffs" to begin or "Keep Current Initiative" to skip

## Configuration

### Module Settings

All settings are world-level and configurable in Module Settings:

#### Auto-trigger Rolloffs

- **Default**: Enabled
- **Description**: Automatically start rolloffs when ties are detected

#### Rolloff Die Type

- **Default**: d20
- **Options**: d4, d6, d8, d10, d12, d20, d100
- **Description**: The die players roll to break ties

#### Include NPCs in Rolloffs

- **Default**: Disabled
- **Description**: Whether NPCs participate in rolloffs alongside player characters

#### Rolloff Timeout (seconds)

- **Default**: 30 seconds
- **Range**: 3-60 seconds
- **Description**: How long to wait before auto-rolling for inactive players

#### Hold on the Winner

- **Default**: Enabled
- **Description**: Keep the bracket on screen for a few seconds after the winner is decided

## How It Works

### Showdowns (2 Combatants)

1. Everyone sees the showdown overlay
2. The countdown begins from the configured timeout
3. Players click Roll when ready (or get auto-rolled)
4. Each roll shows as it lands
5. The higher roll goes first; a tie rolls again
6. The winner ends 0.01 above the loser

### Knockout Brackets (3+ Combatants)

1. Combatants are seeded by dexterity, highest first
2. When the field is not 4 or 8, the top seeds take byes into the next round
3. Every match in a round rolls at the same time, and winners advance
4. Eliminated players keep watching as spectators
5. The champion goes first, then the finalist; earlier losers are ordered by their losing roll, and equal losing rolls roll off
6. Each place ends 0.01 above the next

### Technical Details

- Initiative ties are detected after all relevant combatants have rolled
- Only runs before combat starts, never during active combat
- The primary GM runs the rolloff and sends each step to every client through Foundry's query system
- Fully compatible with the D&D 5e system
- Handles edge cases like duplicate names and missing actors gracefully

## Compatibility

- **Foundry VTT**: v13+
- **Game System**: Designed for D&D 5e, but should work with any system using standard initiative
- **Other Modules**: As long as the roll is initiative, we're in business

## Troubleshooting

### Rolloffs aren't triggering

- Check that "Auto-trigger Rolloffs" is enabled in settings
- Ensure all combatants have rolled initiative
- Verify that there actually is a tie (Rollies ignores non-ties)
- Check that combat hasn't been started yet

### Players aren't getting a Roll button

- Ensure players have OWNER permission on their characters
- Check that the player is connected and active

### Ties keep happening

- This is normal! Roll again until someone wins
- Consider using a different die size (d100 has very few ties)
- Dexterity tiebreakers are not used - this is intentional design

### Auto-roll isn't working

- Check that the timeout is set appropriately (minimum 3 seconds)
- Players whose tab is in the background may be rolled for when the timer ends
- Try increasing the timeout in settings
