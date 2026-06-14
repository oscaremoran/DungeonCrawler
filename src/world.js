function buildWorld(seed) {
  const rng = mulberry32(seed);
  const ground = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(G_GRASS));
  const blocked = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(false));
  const objects = []; // {kind, tx, ty}

  const inB = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  const occupied = (x, y) => !inB(x, y) || blocked[y][x];
  function addObj(kind, tx, ty) {
    const k = KINDS[kind];
    objects.push({ kind, tx, ty });
    if (k.solid) {
      const bw = k.blockW || 1, bh = k.blockH || 1;
      for (let dy = 0; dy < bh; dy++)
        for (let dx = 0; dx < bw; dx++)
          if (inB(tx + dx, ty + dy)) blocked[ty + dy][tx + dx] = true;
    }
  }

  /* a winding dirt trail entering from the south edge up to the clearing */
  let trailX = (MAP_W / 2) | 0, trailTopX = trailX;
  for (let y = MAP_H - 1; y >= 6; y--) {
    for (let w = -1; w <= 1; w++) if (inB(trailX + w, y)) ground[y][trailX + w] = G_DIRT;
    if (y === 6) trailTopX = trailX;          // remember the path's northern end
    if (rng() < 0.45) trailX += rng() < 0.5 ? -1 : 1;
    trailX = Math.max(6, Math.min(MAP_W - 7, trailX));
  }

  /* an eastern trail leading to a gate in the forest wall — the road to Koro */
  const gateY = (MAP_H / 2) | 0, midX = (MAP_W / 2) | 0;
  for (let x = midX; x < MAP_W; x++)
    for (let w = -1; w <= 1; w++) if (inB(x, gateY + w)) ground[gateY + w][x] = G_DIRT;

  /* dense forest wall around the border (leave the trail mouth & east gate open) */
  for (let x = 0; x < MAP_W; x++) {
    for (let y = 0; y < MAP_H; y++) {
      const edge = x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2;
      if (!edge) continue;
      const trailMouth = y >= MAP_H - 2 && Math.abs(x - midX) <= 1;
      const eastGate = x >= MAP_W - 2 && Math.abs(y - gateY) <= 1;
      if (trailMouth || eastGate) continue;
      if (ground[y][x] === G_DIRT) continue;
      if (rng() < 0.9) addObj("tree", x, y);
    }
  }

  /* understory: only non-blocking decor sprinkled on the open floor */
  const sprinkle = (kind, n, chance) => {
    for (let i = 0; i < n; i++) {
      const tx = 3 + ((rng() * (MAP_W - 6)) | 0);
      const ty = 3 + ((rng() * (MAP_H - 6)) | 0);
      if (ground[ty][tx] !== G_GRASS || occupied(tx, ty)) continue;
      if (rng() < chance) addObj(kind, tx, ty);
    }
  };
  sprinkle("bush", 40, 0.7);
  sprinkle("flowers_red", 30, 0.7);
  sprinkle("flowers_orange", 30, 0.7);

  /* spawn near the trail's southern entrance */
  let spawn = { tx: midX, ty: MAP_H - 8 };
  if (occupied(spawn.tx, spawn.ty)) spawn.ty -= 1;

  /* sleeping lizards scattered through the clearing. The eastern gate —
     the road to Koro — is open now; it leads down into the goblin warren. */
  const enemyDefs = [
    { id: 0, type: "lizard", tx: midX - 8,  ty: 8 },
    { id: 1, type: "lizard", tx: midX + 7,  ty: 7 },
    { id: 2, type: "lizard", tx: midX - 5,  ty: 17 },
    { id: 3, type: "lizard", tx: midX + 9,  ty: 19 },
    { id: 4, type: "lizard", tx: midX - 11, ty: 12 },
    { id: 5, type: "lizard", tx: midX + 12, ty: 13 },
    { id: 6, type: "lizard", tx: midX - 9,  ty: 23 },
    { id: 7, type: "lizard", tx: midX + 5,  ty: 24 },
    { id: 8, type: "lizard", tx: midX + 13, ty: 25 },
  ];
  /* a treasure chest sitting in the open at the north end of the central trail */
  const chests = [{ tx: trailTopX, ty: 6, opened: false, item: "leather_tunic" }];
  for (let i = objects.length - 1; i >= 0; i--)             // clear anything on its tile
    if (objects[i].tx === chests[0].tx && objects[i].ty === chests[0].ty) objects.splice(i, 1);
  if (inB(chests[0].tx, chests[0].ty)) blocked[chests[0].ty][chests[0].tx] = true;  // solid: bump to open

  const exits = [{ side: "east", ty0: gateY - 1, ty1: gateY + 1, to: "room2", entry: "west", autosave: true }];
  const entries = { east: { tx: MAP_W - 3, ty: gateY } };  // where we land returning from Koro road
  return { ground, blocked, objects, spawn, enemyDefs, exits, entries, gateY, chests };
}

/* ----------------------- enclosed battle rooms --------------------------- */
/* A smaller dirt-floored clearing walled in by dense trees, with passable
 * gaps (west/east) cut through the wall. Everything outside the interior is a
 * solid tree wall (rendered, but culled to camera). Returns interior bounds so
 * the caller can place enemies and wire up exits relative to the room. */
function buildRoomBase(seed, iw, ih, sides) {
  const rng = mulberry32(seed);
  const ground = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(G_GRASS));
  const blocked = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(false));
  const objects = [];
  const ix0 = ((MAP_W - iw) / 2) | 0, iy0 = ((MAP_H - ih) / 2) | 0;
  const ix1 = ix0 + iw - 1, iy1 = iy0 + ih - 1;
  const cx = ((ix0 + ix1) / 2) | 0, cy = ((iy0 + iy1) / 2) | 0;

  const inInterior = (x, y) => x >= ix0 && x <= ix1 && y >= iy0 && y <= iy1;
  const inWestGap = (x, y) => sides.west && y >= cy - 1 && y <= cy + 1 && x < ix0;
  const inEastGap = (x, y) => sides.east && y >= cy - 1 && y <= cy + 1 && x > ix1;

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (inInterior(x, y) || inWestGap(x, y) || inEastGap(x, y)) {
        ground[y][x] = G_DIRT;                 // walkable floor / corridor
      } else {
        blocked[y][x] = true;                  // wall (also caps the corridors)
        objects.push({ kind: "tree", tx: x, ty: y });
      }
    }
  }

  /* a little non-blocking understory so the floor isn't bare */
  for (let i = 0; i < 18; i++) {
    const tx = ix0 + 1 + ((rng() * (iw - 2)) | 0);
    const ty = iy0 + 1 + ((rng() * (ih - 2)) | 0);
    if (ground[ty][tx] !== G_DIRT) continue;
    const kind = rng() < 0.5 ? "bush" : rng() < 0.5 ? "flowers_red" : "flowers_orange";
    objects.push({ kind, tx, ty });
  }

  const spawn = { tx: ix0 + 1, ty: cy };
  return { ground, blocked, objects, spawn, ix0, iy0, ix1, iy1, cx, cy };
}

/* room 2 — the goblin warren: four lizards and two goblins */
function buildRoom2() {
  const r = buildRoomBase(0x20a2, 20, 14, { west: true, east: true });
  const { ix0, ix1, iy0, iy1, cx, cy } = r;
  r.enemyDefs = [
    { id: 0, type: "lizard", tx: ix0 + 3, ty: iy0 + 2 },
    { id: 1, type: "lizard", tx: ix1 - 3, ty: iy0 + 3 },
    { id: 2, type: "lizard", tx: ix0 + 4, ty: iy1 - 2 },
    { id: 3, type: "lizard", tx: ix1 - 4, ty: iy1 - 2 },
    { id: 4, type: "goblin", tx: cx - 1, ty: cy - 3 },
    { id: 5, type: "goblin", tx: cx + 2, ty: cy + 3 },
  ];
  r.exits = [
    { side: "west", ty0: cy - 1, ty1: cy + 1, to: "forest", entry: "east" },
    { side: "east", ty0: cy - 1, ty1: cy + 1, to: "room3", entry: "west", autosave: true },
  ];
  r.entries = { west: { tx: ix0 + 1, ty: cy }, east: { tx: ix1 - 1, ty: cy } };
  return r;
}

/* room 3 — the troll's lair. With the beast felled, its eastern passage opens
 * onto the road up to Koro. */
function buildRoom3() {
  const r = buildRoomBase(0x30a3, 22, 15, { west: true, east: true });
  const { ix1, cx, cy } = r;
  const tx = ix1 - 4;
  r.enemyDefs = [{ id: 0, type: "troll", tx, ty: cy }];
  for (let dy = -1; dy <= 0; dy++)                 // the troll's bulk blocks movement
    for (let dx = -1; dx <= 1; dx++) r.blocked[cy + dy][tx + dx] = true;
  r.exits = [
    { side: "west", ty0: cy - 1, ty1: cy + 1, to: "room2", entry: "east" },
    { side: "east", ty0: cy - 1, ty1: cy + 1, to: "koro", entry: "from_room3" },
  ];
  r.entries = { west: { tx: r.ix0 + 1, ty: cy }, from_koro: { tx: ix1 - 1, ty: cy } };
  return r;
}

/* shared helper: stamp an object and (if solid) mark its footprint blocked */
function placeObj(r, kind, tx, ty) {
  const inB = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  const k = KINDS[kind]; r.objects.push({ kind, tx, ty });
  if (k.solid) for (let dy = 0; dy < (k.blockH || 1); dy++)
    for (let dx = 0; dx < (k.blockW || 1); dx++) if (inB(tx + dx, ty + dy)) r.blocked[ty + dy][tx + dx] = true;
}

/* add treasure chests to an area built with placeObj (objects/blocked/ground/chests).
   Each chest tile is made solid (bump to open); chests flagged `hide` get nestled
   in a ring of bushes plus a front-cover bush on their own tile (bushes are
   non-solid, so the hero can still push through to reach them). */
function addChests(r, defs) {
  const inB = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  r.chests = r.chests || [];
  for (const c of defs) {
    for (let i = r.objects.length - 1; i >= 0; i--)
      if (r.objects[i].tx === c.tx && r.objects[i].ty === c.ty) r.objects.splice(i, 1);
    if (inB(c.tx, c.ty)) r.blocked[c.ty][c.tx] = true;
    if (c.hide) {
      const ring = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [-1, 1], [0, 1], [1, 1]];
      for (const [dx, dy] of ring) {
        const bx = c.tx + dx, by = c.ty + dy;
        if (!inB(bx, by) || r.ground[by][bx] !== G_GRASS) continue;
        if (dx === 0 && dy === 0) placeObj(r, "bush", bx, by);     // front-cover bush on the chest tile
        else if (!r.blocked[by][bx]) placeObj(r, "bush", bx, by);
      }
    }
    r.chests.push({ tx: c.tx, ty: c.ty, opened: false, item: c.item, gold: c.gold });
  }
}

/* the Village of Koro — a wooden-plank plaza ringed by grassy cliffs, reached
 * after the troll falls. Five houses line the square; four can be entered
 * (the stores + the inn), the purple one is sealed for now. A central fountain. */
function buildKoro() {
  const ground = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(G_GRASS));
  const blocked = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(false));
  const r = { ground, blocked, objects: [], enemyDefs: [], exits: [], npcs: [], portals: [], lockedDoors: [], signs: [] };

  const ix0 = 4, iy0 = 4, ix1 = 39, iy1 = 26, cx = 21, cy = 15;
  // wooden plank floor across the plaza interior
  for (let y = iy0 + 1; y <= iy1 - 1; y++)
    for (let x = ix0 + 1; x <= ix1 - 1; x++) ground[y][x] = G_WOOD;
  // grassy-cliff border ring (solid)
  for (let x = ix0; x <= ix1; x++) { placeObj(r, "cliff", x, iy0); placeObj(r, "cliff", x, iy1); }
  for (let y = iy0 + 1; y <= iy1 - 1; y++) { placeObj(r, "cliff", ix0, y); placeObj(r, "cliff", ix1, y); }
  // everything outside the ring is impassable (the cliff drop-off)
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++)
      if (x < ix0 || x > ix1 || y < iy0 || y > iy1) blocked[y][x] = true;

  placeObj(r, "pond", cx - 1, cy - 1);              // a fountain at the heart of town

  // five houses: three along the north, two along the south.
  // door tile (front step) = (htx+1, hty+2); we return the hero just below it.
  const houses = [
    { kind: "house_red",    htx: 6,  hty: 6,  to: "koro_def",   entry: "from_def" },
    { kind: "house_blue",   htx: 18, hty: 6,  to: "koro_off",   entry: "from_off" },
    { kind: "house_green",  htx: 30, hty: 6,  to: "koro_skill", entry: "from_skill" },
    { kind: "house_yellow", htx: 10, hty: 19, to: "koro_inn",   entry: "from_inn" },
    // the purple house: a card collector. Sealed until Elara joins (needsAlly),
    // after which stepping on its door opens the Monster Cards shop interior.
    { kind: "house_purple", htx: 26, hty: 19, to: "koro_cards", entry: "from_cards",
      needsAlly: true, lockedText: ["The shutters are drawn.", "No one answers — yet."] },
  ];
  r.entries = { enter: { tx: cx, ty: iy1 - 2 } };
  for (const h of houses) {
    placeObj(r, h.kind, h.htx, h.hty);
    const dx = h.htx + 1, dy = h.hty + 2;           // front-door tile
    blocked[dy][dx] = false;                        // ensure the doorstep is walkable
    r.portals.push({ tx: dx, ty: dy, to: h.to, entry: "in", needsAlly: h.needsAlly });
    r.entries[h.entry] = { tx: dx, ty: dy + 1 };    // stand in front on return
    // a door that needs Elara also registers as "locked" so bumping it before she
    // joins shows a message instead of silently doing nothing.
    if (h.needsAlly) r.lockedDoors.push({ tx: dx, ty: dy, needsAlly: true, text: h.lockedText });
  }

  // southern opening in the cliff wall — the road back down to the troll's lair
  ground[iy1][cx] = G_WOOD; blocked[iy1][cx] = false;
  r.objects = r.objects.filter(o => !(o.kind === "cliff" && o.tx === cx && o.ty === iy1));
  r.portals.push({ tx: cx, ty: iy1, to: "room3", entry: "from_koro" });
  r.entries.from_room3 = { tx: cx, ty: iy1 - 1 };

  // northern gate: a permanent gap in the cliff wall onto the road to the world
  // map. It's always visible, but a guard stands planted in the gateway and bars
  // the way north until the inn mercenaries are dealt with (see openKoroGate).
  ground[iy0][cx] = G_DIRT; blocked[iy0][cx] = false;
  r.objects = r.objects.filter(o => !(o.kind === "cliff" && o.tx === cx && o.ty === iy0));
  r.portals.push({ tx: cx, ty: iy0, to: "worldmap", entry: "from_koro" });
  r.gate = { tx: cx, ty: iy0 };
  r.entries.from_worldmap = { tx: cx, ty: iy0 + 1 };
  r.npcs.push({ tx: cx, ty: iy0, name: "GATE GUARD", sprite: "npc_keeper", portrait: "npc_keeper", gateGuard: true });
  blocked[iy0][cx] = true;                           // the guard bars the road north
  placeObj(r, "sign", cx + 2, iy0 + 1);
  r.signs.push({ tx: cx + 2, ty: iy0 + 1, text: ["North Gate — the road to Xal'Korr."] });

  // a signboard standing in front of the Dragon Den Inn (the yellow house)
  placeObj(r, "sign", 13, 22);
  r.signs.push({ tx: 13, ty: 22, text: ["Dragon Den Inn"] });

  // crates scattered around the square (skip blocked / door tiles)
  const crates = [[8, 15], [12, 12], [34, 17], [29, 22], [16, 23], [24, 11], [37, 23], [5, 22]];
  for (const [x, y] of crates) if (!blocked[y][x]) placeObj(r, "crate", x, y);
  // a little colour along the plaza
  for (let x = ix0 + 3; x <= ix1 - 3; x += 6) {
    placeObj(r, x % 2 ? "flowers_red" : "flowers_orange", x, iy0 + 1);
    placeObj(r, x % 2 ? "flowers_orange" : "flowers_red", x, iy1 - 1);
  }
  return r;
}

/* Open Koro's northern gate (idempotent). Called once the inn mercenaries are
 * beaten: the guard barring the gateway stands down (is removed) and the road
 * tile he held is cleared, so the hero can step through to the world map. */
function openKoroGate(r) {
  if (!r || r._gateOpen || !r.gate) return;
  const { tx, ty } = r.gate;
  r.npcs = (r.npcs || []).filter(n => !n.gateGuard);
  r.blocked[ty][tx] = false;
  r._gateOpen = true;
}

/* the world map — a grassy region north of Koro, a winding dirt road pushing on
 * toward Xal'Korr. A simple, enemy-free overworld for now: tree-walled, with a
 * southern gap that leads back down into the town. */
function buildWorldMap() {
  const rng = mulberry32(0x4711);
  const ground = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(G_GRASS));
  const blocked = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(false));
  const r = { ground, blocked, objects: [], enemyDefs: [], exits: [], npcs: [], portals: [], lockedDoors: [], signs: [] };
  const rx = (MAP_W / 2) | 0;
  // a wolf pack roams the road north of Koro
  r.enemyDefs = [
    { id: 0, type: "wolf", tx: 12, ty: 9 },
    { id: 1, type: "wolf", tx: 33, ty: 13 },
    { id: 2, type: "wolf", tx: 15, ty: 21 },
  ];

  // a winding dirt road climbing the full height of the map — south mouth (back
  // to Koro) to the north mouth (on to Xal'Korr)
  let tx = rx;
  for (let y = MAP_H - 1; y >= 0; y--) {
    for (let w = -1; w <= 1; w++) if (tx + w >= 0 && tx + w < MAP_W) ground[y][tx + w] = G_DIRT;
    if (y > 2 && rng() < 0.4) tx += rng() < 0.5 ? -1 : 1;   // straighten as it nears the north gate
    tx = Math.max(6, Math.min(MAP_W - 7, tx));
  }
  const northX = tx;   // where the road meets the top edge

  // dense tree wall around the border, leaving the south + north road-mouths open
  for (let x = 0; x < MAP_W; x++) {
    for (let y = 0; y < MAP_H; y++) {
      const edge = x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2;
      if (!edge) continue;
      const southMouth = y >= MAP_H - 2 && Math.abs(x - rx) <= 1;
      const northMouth = y < 2 && Math.abs(x - northX) <= 1;
      if (southMouth || northMouth || ground[y][x] === G_DIRT) continue;
      if (rng() < 0.92) placeObj(r, "tree", x, y);
    }
  }

  // scattered, non-blocking understory + a few rocks
  const sprinkle = (kind, n, chance) => {
    for (let i = 0; i < n; i++) {
      const x = 3 + ((rng() * (MAP_W - 6)) | 0), y = 3 + ((rng() * (MAP_H - 6)) | 0);
      if (ground[y][x] !== G_GRASS || blocked[y][x]) continue;
      if (rng() < chance) placeObj(r, kind, x, y);
    }
  };
  sprinkle("rock", 8, 0.7);
  sprinkle("bush", 26, 0.7);
  sprinkle("flowers_red", 22, 0.7);
  sprinkle("flowers_orange", 22, 0.7);

  // arrive from Koro at the southern road-mouth; step back onto the mouth to return.
  // the northern mouth carries on into Xal'Korr (and returns the hero here).
  r.entries = { from_koro: { tx: rx, ty: MAP_H - 4 }, from_xalkorr: { tx: northX, ty: 3 } };
  r.spawn = { tx: rx, ty: MAP_H - 4 };
  r.portals.push({ tx: rx, ty: MAP_H - 2, to: "koro", entry: "from_worldmap" });
  r.portals.push({ tx: northX, ty: 1, to: "xalkorr", entry: "from_worldmap" });
  // a signpost by the entrance
  placeObj(r, "sign", rx + 2, MAP_H - 5);
  r.signs.push({ tx: rx + 2, ty: MAP_H - 5, text: ["Xal'Korr, City of Bone — north.", "Koro — back south."] });

  // three chests tucked away in the bushes off the road, well clear of the dirt
  addChests(r, [
    { tx: 6,          ty: 6,          item: "steel_dagger", hide: true },
    { tx: MAP_W - 7,  ty: 7,          item: "chain_mail",   hide: true },
    { tx: 7,          ty: MAP_H - 8,  gold: 250,            hide: true },
  ]);

  // a Combat Arena off the eastern side of the road (reuses the purple house art).
  // Door tile = (atx+1, aty+2); the hero returns to the tile just below it.
  const atx = 33, aty = 20;
  placeObj(r, "house_purple", atx, aty);
  r.objects[r.objects.length - 1].noCrest = true;     // arena, not the Collector's house — no skull crest
  const adx = atx + 1, ady = aty + 2;
  for (const o of r.objects) if (o.tx === adx && o.ty === ady && o.kind !== "house_purple") o._gone = true;
  r.objects = r.objects.filter(o => !o._gone);
  blocked[ady][adx] = false;                          // keep the doorstep walkable
  r.portals.push({ tx: adx, ty: ady, to: "arena", entry: "in" });
  r.entries.from_arena = { tx: adx, ty: ady + 1 };
  placeObj(r, "sign", adx + 2, ady);
  r.signs.push({ tx: adx + 2, ty: ady, text: ["Combat Arena", "Test your steel within."] });
  return r;
}

/* Xal'Korr, the City of Bone — the journey's end (for now). A cobbled avenue
 * climbs from the great bone gate in the south up to a plaza crowned by a
 * skeletal reaper statue, all of it ringed by a wall of skulls and gravestones,
 * with a graveyard of tombs and dead trees sprawling to either side. Reached
 * through the worldmap's north mouth. */
function buildXalkorr() {
  const rng = mulberry32(0xB04E);
  const ground = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(G_BONE));
  const blocked = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(false));
  const r = { ground, blocked, objects: [], enemyDefs: [], exits: [], npcs: [], portals: [], lockedDoors: [], signs: [] };
  const cx = (MAP_W / 2) | 0;

  // a cobbled avenue up the middle, opening into a broad plaza near the top
  for (let y = 2; y <= MAP_H - 1; y++)
    for (let w = -2; w <= 2; w++) ground[y][cx + w] = G_STONE;
  for (let y = 3; y <= 9; y++)
    for (let x = cx - 7; x <= cx + 7; x++) ground[y][x] = G_STONE;

  // a wall of bones & headstones around the border, leaving the south gate open
  const wallProps = ["xk_gravestone", "xk_skull_big", "xk_bone_bundle", "xk_gravestone"];
  for (let x = 1; x < MAP_W - 1; x += 2) {
    for (const y of [1, MAP_H - 2]) {
      if (y >= MAP_H - 2 && Math.abs(x - cx) <= 2) continue;    // south gate gap
      placeObj(r, wallProps[(rng() * wallProps.length) | 0], x, y);
    }
  }
  for (let y = 1; y < MAP_H - 1; y += 2) {
    for (const x of [1, MAP_W - 2])
      placeObj(r, wallProps[(rng() * wallProps.length) | 0], x, y);
  }

  // the great bone gate straddling the south entrance — its pillars block, but
  // the archway itself stays walkable so the hero can pass beneath it
  const gy = MAP_H - 4;
  placeObj(r, "xk_gate", cx, gy);
  blocked[gy][cx - 1] = true; blocked[gy][cx + 1] = true; blocked[gy][cx] = false;

  // the plaza centrepiece: a skeletal reaper, candle-lit and totem-flanked
  placeObj(r, "xk_reaper", cx, 5);
  placeObj(r, "xk_candles", cx - 2, 6);
  placeObj(r, "xk_candles", cx + 2, 6);
  placeObj(r, "xk_statue", cx - 6, 5);
  placeObj(r, "xk_statue", cx + 6, 5);

  // skull totems lining the avenue like lamp-posts
  for (let y = 13; y <= MAP_H - 7; y += 4) {
    placeObj(r, "xk_skull_totem", cx - 4, y);
    placeObj(r, "xk_skull_totem", cx + 4, y);
  }

  // a graveyard sprawling off the avenue: tombs, headstones and dead trees
  const yard = [
    ["xk_tomb", cx - 9, 13], ["xk_tomb", cx + 8, 16],
    ["xk_deadtree", cx - 12, 9], ["xk_deadtree", cx + 11, 20], ["xk_deadtree", cx - 11, 23],
    ["xk_gravestone", cx - 8, 18], ["xk_gravestone", cx - 10, 20], ["xk_gravestone", cx + 9, 11],
    ["xk_gravestone", cx + 12, 13], ["xk_gravestone", cx - 13, 16], ["xk_gravestone", cx + 10, 24],
    ["xk_skull_pile", cx + 11, 7], ["xk_skull_pile", cx - 13, 26], ["xk_skull_pile", cx + 8, 27],
    ["xk_boulder", cx - 14, 12], ["xk_boulder", cx + 13, 18],
    ["xk_barrel", cx - 6, gy - 1], ["xk_barrel", cx + 5, gy - 1],
  ];
  for (const [kind, x, y] of yard)
    if (x >= 1 && x < MAP_W - 2 && !blocked[y][x]) placeObj(r, kind, x, y);

  // a skull sign just inside the gate
  placeObj(r, "xk_skull_sign", cx + 4, gy - 1);
  r.signs.push({ tx: cx + 4, ty: gy - 1, text: ["XAL'KORR — the City of Bone.", "Tread softly. The dead keep court here."] });

  // arrive from the worldmap just inside the gate; step onto the bottom mouth to return
  r.entries = { from_worldmap: { tx: cx, ty: MAP_H - 5 } };
  r.spawn = { tx: cx, ty: MAP_H - 5 };
  r.portals.push({ tx: cx, ty: MAP_H - 1, to: "worldmap", entry: "from_xalkorr" });

  // chests rewarding a detour into the graves (placed before the legion so
  // their now-solid tiles are skipped by the scatter below)
  addChests(r, [
    { tx: cx - 13, ty: 13, item: "plate_armor" },
    { tx: cx + 12, ty: 26, gold: 400 },
    { tx: cx - 8,  ty: 9,  gold: 200 },
    { tx: cx + 8,  ty: 13, gold: 200 },
    { tx: cx - 6,  ty: 24, gold: 200 },
  ]);

  // the bone legion prowling the streets and graves: a handful of warriors,
  // archers and mages. Placed on open ground, kept clear of the gate so the
  // hero isn't ambushed the instant they arrive.
  const roster = [];
  for (let i = 0; i < 4; i++) roster.push("skeleton_warrior");
  for (let i = 0; i < 3; i++) roster.push("skeleton_archer");
  for (let i = 0; i < 3; i++) roster.push("skeleton_mage");
  for (let i = roster.length - 1; i > 0; i--) {       // deterministic shuffle
    const j = (rng() * (i + 1)) | 0; const t = roster[i]; roster[i] = roster[j]; roster[j] = t;
  }
  const placed = [];
  let eid = 0;
  for (const type of roster) {
    for (let tries = 0; tries < 50; tries++) {
      const x = 3 + ((rng() * (MAP_W - 6)) | 0), y = 4 + ((rng() * (MAP_H - 12)) | 0);
      if (r.blocked[y][x]) continue;                                  // not on a prop
      if (Math.abs(x - cx) + Math.abs(y - (MAP_H - 5)) <= 6) continue; // clear of the gate
      if (placed.some(p => Math.abs(p.tx - x) <= 1 && Math.abs(p.ty - y) <= 1)) continue;
      const def = { id: eid++, type, tx: x, ty: y };
      r.enemyDefs.push(def); placed.push(def);
      break;
    }
  }
  return r;
}

/* a house interior: a door back out to Koro, plus either a store (shopkeeper
 * behind a crate counter) or the Dragon Den Inn (plank floor packed with tables,
 * seated patrons, and the red-haired wanderer Elara who can join the party). */
function buildKoroInterior(opt) {
  const ground = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(G_GRASS));
  const blocked = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(true));
  const r = { ground, blocked, objects: [], enemyDefs: [], exits: [], npcs: [], portals: [], lockedDoors: [] };

  const inn = !!opt.inn, floor = inn ? G_INN : G_WOOD;
  const ix0 = inn ? 12 : 15, iy0 = inn ? 9 : 11, ix1 = inn ? 31 : 28, iy1 = inn ? 22 : 20, cx = 21;
  for (let y = iy0 + 1; y <= iy1 - 1; y++)
    for (let x = ix0 + 1; x <= ix1 - 1; x++) ground[y][x] = floor;
  for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++)
    blocked[y][x] = (x === ix0 || x === ix1 || y === iy0 || y === iy1);
  for (let x = ix0; x <= ix1; x++) { placeObj(r, "cliff", x, iy0); placeObj(r, "cliff", x, iy1); }
  for (let y = iy0 + 1; y <= iy1 - 1; y++) { placeObj(r, "cliff", ix0, y); placeObj(r, "cliff", ix1, y); }

  // doorway out, bottom-centre
  ground[iy1][cx] = floor; blocked[iy1][cx] = false;
  r.objects = r.objects.filter(o => !(o.kind === "cliff" && o.tx === cx && o.ty === iy1));
  r.portals.push({ tx: cx, ty: iy1, to: opt.returnTo || "koro", entry: opt.returnEntry });
  r.entries = { in: { tx: cx, ty: iy1 - 2 } };

  if (opt.shop) {
    placeObj(r, "crate", cx - 3, iy0 + 3);          // a counter of crates
    placeObj(r, "crate", cx + 3, iy0 + 3);
    r.npcs.push({ tx: cx, ty: iy0 + 3, name: SHOPS[opt.shop].keeper, shop: opt.shop, sprite: "npc_keeper" });
    blocked[iy0 + 3][cx] = true;                    // the keeper blocks their spot
  }

  if (opt.cards) {
    // the card collector behind a crate counter, packs stacked beside him
    placeObj(r, "crate", cx - 3, iy0 + 3);
    placeObj(r, "crate", cx + 3, iy0 + 3);
    placeObj(r, "crate", cx + 4, iy0 + 3);
    r.npcs.push({ tx: cx, ty: iy0 + 3, name: "FENWICK", cards: true, sprite: "npc_keeper", portrait: "npc_keeper" });
    blocked[iy0 + 3][cx] = true;
  }

  if (opt.arena) {
    // the Arena Master presides at the head of a crate-ringed fighting pit
    r.npcs.push({ tx: cx, ty: iy0 + 3, name: "ARENA MASTER", arena: true, sprite: "npc_keeper", portrait: "npc_keeper" });
    blocked[iy0 + 3][cx] = true;
    for (const dx of [-4, 4]) { placeObj(r, "crate", cx + dx, iy0 + 3); placeObj(r, "crate", cx + dx, iy1 - 3); }
  }

  if (inn) {
    const sit = (tx, ty, npc) => { blocked[ty][tx] = true; r.npcs.push({ tx, ty, ...npc }); };
    const table = (tx, ty) => placeObj(r, "table", tx, ty);  // 2-wide
    const PATRON = i => ({ sprite: "patron_" + i, name: "Patron", talk: [[
      ["Ale's good here, traveler.", "The innkeep keeps the fire warm."],
      ["Heard a Troll fell in the forest.", "About time someone dealt with it."],
      ["Rest your boots a while.", "The road's long past Koro."],
      ["...", "(They nurse their drink in silence.)"],
    ][i % 4]] });
    // four tables with seated patrons
    table(14, 12); sit(14, 11, PATRON(0));
    table(24, 12); sit(25, 11, PATRON(1));
    table(14, 17); sit(14, 16, PATRON(2));
    table(19, 19); sit(20, 18, PATRON(3));
    // Elara's table — the wanderer who can join you
    table(24, 17);
    sit(24, 16, {
      sprite: "ally_idle", name: "ELARA", portrait: "ally_portrait", ally: true,
    });
    // a bar running down the right side: a back-shelf of crates against the wall,
    // with the innkeeper standing in front of it (approachable from the left).
    for (let ty = iy0 + 2; ty <= iy0 + 6; ty++) placeObj(r, "crate", ix1 - 1, ty);
    sit(ix1 - 2, iy0 + 3, {
      sprite: "npc_keeper", name: "INNKEEPER", portrait: "npc_keeper", innkeeper: true,
    });
  }
  return r;
}

/* --------------------------------- game ---------------------------------- */
