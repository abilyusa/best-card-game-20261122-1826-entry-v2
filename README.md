# Tidebound — Roguelike Deck-Builder Card Duel

Entry for the make.fun competition `best-card-game-20261122-1826` ($50, deadline 23 Nov 2026 13:26 WIB).

## The game

You are the Tidecaller, descending into the Sunken Court to take the Drowned
Crown. Duel three guardians in a row — the **Drowned Knight**, the **Tide
Witch**, and the **Sunken King** — each with its own telegraphed attack
pattern. After every victory, draft 1 of 3 new cards, heal, and gain +1 max
energy. Lose once and the deep claims you.

**45 unique cards in 4 suits** (each suit has its own colour and shape):
- **Tide** (blue, droplet) — control, card draw, block
- **Storm** (violet, bolt) — burst damage and Burn
- **Kelp** (green, leaf) — Thorns, Weak, healing
- **Sun** (gold, sun) — Strength, energy, big hits

**Systems:** energy/mana per turn, hand management (draw 5, 10-card hand
cap), block, Strength, Weak, Burn (ticks at turn start, then fades), Thorns
(reflect), deck-building drafts, boss enrage (the Sunken King rages below
50% HP), and a scaling threat — every boss gains +1 Strength every 3rd
turn, so long fights get dangerous.

**Presentation:** title screen, combat, draft screen, win screen and lose
screen; animated bubbles and light rays; floating damage numbers; screen
shake; card-play flight animation; WebAudio sound effects (play, hit,
block, heal, win fanfare, lose dirge) with mute (M).

## How to run

Open `game/index.html` in any modern browser (no build step, no network).
Or serve it locally:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/game/
```

## Controls

- **Mouse:** click a card to play it, click END TURN, click a draft card
- **Keys 1–7:** play a card from your hand
- **Space / Enter:** end turn
- **M:** mute / unmute
- **R:** restart after a win or loss

## Files

- `game/engine.js` — pure game logic (cards, bosses, combat, drafts); no DOM,
  unit-tested headlessly with a 60-game self-play simulation
- `game/ui.js` — canvas rendering, input, animation, sound
- `game/index.html` — page shell
- `main.ts` — hand-in program: copies `game/` and `screenshots/` to `/output`
  and writes `dossier.json` via `vendor/makefun-game.ts`
- `vendor/makefun-game.ts` — make.fun dossier library, unchanged from the kit
- `screenshots/` — 4 real renders of the game (title, combat, draft, win)
- `LICENSE` — MIT

## License

MIT — see `LICENSE`.
