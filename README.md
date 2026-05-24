# Wanderer — Greenwood

A tiny FF-style top-down game engine running in the browser (HTML5 canvas, no
build step, no dependencies). The opening area is a lush green forest clearing
with a winding dirt trail.

## Run it

The game loads images, so it must be served over HTTP (opening the file
directly via `file://` will fail to load assets in most browsers):

```bash
cd "/Users/seanmoran/Desktop/DungeonCrawler"
python3 serve.py 8765
```

Then open <http://localhost:8765/> in a browser. `serve.py` is a thin
`http.server` wrapper that sends no-cache headers, so Safari (which otherwise
caches `game.js` aggressively) always refetches your latest edits. Plain
`python3 -m http.server 8765` also works if you don't mind hard-reloading.

## Controls

- **WASD** / **Arrow keys** — move
- **Shift** — run

## What's here

```
index.html   page shell + HUD
game.js       the engine (asset loader, world gen, renderer, player, camera)
assets/       sprites sliced from the source tileset & character sheet
```

### Engine (game.js)

- **Asset loader** — preloads every PNG, then boots the game.
- **World generation** (`buildWorld`) — a seeded, deterministic forest: a dense
  tree border, scattered interior trees that leave a central clearing, a winding
  dirt trail in from the south, a pond, and an understory of bushes, flowers and
  rocks. Change the seed in `new Game(...)` for a different forest.
- **Tile renderer** — draws only the on-screen ground tiles. Grass is a
  light-flattened, mirror-symmetric tile so it tiles seamlessly, with per-tile
  flips for variety (no visible grid).
- **Player** — 6-frame walk cycle (sliced from the character sheet) plus an idle
  frame; faces left/right by flipping the sprite; runs with Shift.
- **Collision** — a feet-box is tested against a blocked-tile grid; axes resolve
  independently so you slide along walls.
- **Depth** — objects and the player are y-sorted each frame, so you walk behind
  tree canopies and in front of their trunks.
- **Camera** — follows the player and is clamped to the map edges.

### Assets

All art was sliced programmatically from the two source images:

- Ground & decoration (`grass`, `dirt`, `tree`, `bush`, `flowers_*`, `rock`,
  `pond`) from the forest tileset, with background removed via edge flood-fill.
- `idle` + `walk_0..5` from the character style sheet (white background keyed
  out, auto-trimmed, bottom-centered onto a uniform frame).

## Extending it

- Add a tile id and case in the ground-draw switch for new terrain.
- Add an entry to `KINDS` and drop `addObj(kind, tx, ty)` calls in `buildWorld`
  for new props (set `solid` to make them block movement).
- New areas: write another `buildWorld`-style map and swap it on a map-edge
  trigger.
