---
name: mtg-deck-and-rules
description: Use when parsing decklists, validating format legality (Commander color identity, deck limits, banlists), interfacing with Scryfall/Moxfield APIs, or analyzing mana bases.
---

# Magic: The Gathering Domain & Data Protocols

## 1. Deck Formats & Rules Ruleset

### Commander / EDH Construction
- **Deck Size**: Exactly 100 cards (including Commander / Partner / Background / Companion).
- **Singleton**: Exactly 1 copy of each card except basic lands and cards with explicit exceptions (*"A deck can have any number of..."* like *Relentless Rats*, *Dragon's Approach*).
- **Color Identity**:
  - Color identity includes mana symbols in the casting cost + rules text (excluding reminder text).
  - Front and back faces of DFCs/MDFCs both contribute to color identity.
  - No card in the 99 may contain color pips outside the Commander's color identity.
  - Hybrid mana symbols count for **both** colors (e.g., `{W/U}` requires both White and Blue in the Commander's identity).

## 2. Moxfield & Scryfall Integration

### Moxfield Deck Object Navigation
When consuming Moxfield JSON exports:
- `boards.mainboard.cards`: Dictionary keyed by card ID containing card counts and metadata.
- `boards.commanders.cards`: Commander definitions.
- `boards.companions.cards`: Companions.
- `boards.sideboard.cards`: Sideboard / wishboard.
- `boards.considering.cards`: Maybeboard / considering list.

### Scryfall Batch Card Lookup
Always batch card fetches using `/cards/collection` (max 75 identifiers per query):
```json
POST https://api.scryfall.com/cards/collection
Content-Type: application/json

{
  "identifiers": [
    { "name": "Lightning Bolt" },
    { "id": "f295b713-1d6a-43fd-910d-fb35414bf58a" },
    { "set": "mh2", "collector_number": "229" }
  ]
}
```

### 3. Decklist Parser Regular Expression
Match standard export lines like:
- `1 Sol Ring`
- `1x Counterspell (EMA) 43 *F*`
- `SB: 2 Flusterstorm`

Regex:
```regex
^(?:(?<board>SB|Sideboard|Commander):\s*)?(?:(?<qty>\d+)x?\s+)?(?<name>[^(\[\n\r]+?)(?:\s+[\(\[](?:(?<set>[A-Za-z0-9]+))?(?:\s+(?<cn>[A-Za-z0-9★-]+))?[\)\]])?(?:\s+\*(?<foil>F|NF)\*)?$
```
