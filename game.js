/* =========================================================================
 * Wanderer — a tiny FF-style top-down engine
 * Tile renderer + y-sorted object layer + animated, colliding player + camera
 * ========================================================================= */
"use strict";

/* ----------------------------- configuration ---------------------------- */
const TILE = 48;          // on-screen size of one ground tile (px)
const MAP_W = 44;         // map width  in tiles
const MAP_H = 32;         // map height in tiles
const WALK_FPS = 10;      // walk-cycle frames per second
const SPEED = 2.6;        // walk speed (px / frame @60fps)
const RUN_MULT = 1.8;

/* ground tile ids */
const G_GRASS = 0, G_DIRT = 1, G_EDGE = 2;

/* ------------------------------- asset list ------------------------------ */
const ASSETS = {
  grass: "assets/grass.png",
  grass_edge: "assets/grass_edge.png",
  dirt: "assets/dirt.png",
  tree: "assets/tree.png",
  bush: "assets/bush.png",
  flowers_red: "assets/flowers_red.png",
  flowers_orange: "assets/flowers_orange.png",
  rock: "assets/rock.png",
  pond: "assets/pond.png",
  idle: "assets/idle.png",
  walk_0: "assets/walk_0.png", walk_1: "assets/walk_1.png", walk_2: "assets/walk_2.png",
  walk_3: "assets/walk_3.png", walk_4: "assets/walk_4.png", walk_5: "assets/walk_5.png",
  portrait: "assets/portrait.png",
};
// lizard animation frames
const LIZ_ANIMS = { liz_idle: 3, liz_sleep: 3, liz_roar: 4, liz_attack: 4, liz_hurt: 3, liz_death: 4 };
for (const [g, n] of Object.entries(LIZ_ANIMS))
  for (let i = 0; i < n; i++) ASSETS[`${g}_${i}`] = `assets/${g}_${i}.png`;
for (const s of ["skill_fire", "skill_shield", "skill_bolt", "skill_heal"]) ASSETS[s] = `assets/${s}.png`;

/* learnable skills (drag into slots; cost MP in battle) */
const SKILLS = [
  { id: "heal",   name: "Healing",        unlock: 3, mp: 4, icon: "skill_heal",   kind: "heal",   power: 32, desc: "Restore HP to the hero." },
  { id: "fire",   name: "Flaming Sword",  unlock: 4, mp: 5, icon: "skill_fire",   kind: "fire",   power: 1.7, desc: "Fire damage to one foe." },
  { id: "shield", name: "Blue Shield",    unlock: 6, mp: 4, icon: "skill_shield", kind: "shield", power: 0,   desc: "Sharply raise defense for a turn." },
  { id: "bolt",   name: "Lightning Bolt", unlock: 9, mp: 8, icon: "skill_bolt",   kind: "bolt",   power: 2.3, desc: "Heavy lightning damage to one foe." },
];
const SKILL_BY_ID = Object.fromEntries(SKILLS.map(s => [s.id, s]));
const skillSlots = lv => Math.floor(lv / 2);

/* equippable gear — one item per slot may be worn; bonuses add to base stats */
const EQUIP = [
  { id: "wood_sword",   name: "Wood Sword",   slot: "weapon", atk: 3, def: 0, desc: "A sturdy practice blade. +3 Attack." },
  { id: "cloak",        name: "Cloak",        slot: "armor",  atk: 0, def: 2, desc: "A traveler's cloak. +2 Defense." },
  { id: "leather_tunic", name: "Leather Tunic", slot: "armor", atk: 0, def: 5, desc: "Boiled-leather armor. +5 Defense." },
];
const EQUIP_BY_ID = Object.fromEntries(EQUIP.map(e => [e.id, e]));
const EQUIP_SLOTS = ["weapon", "armor"];
const EQUIP_SLOTLABEL = { weapon: "Weapon", armor: "Armor" };

/* the game's title — change this string to rename the game */
const GAME_TITLE = "Game";
const GAME_SUBTITLE = "";
const AREA_NAME = "Greenwood Forest";

const MAIN_MENU = ["Items", "Skills", "Equip", "Status", "Save"];

function loadAll(map) {
  const keys = Object.keys(map);
  return Promise.all(keys.map(k => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res([k, img]);
    img.onerror = () => rej(new Error("failed to load " + map[k]));
    img.src = map[k];
  }))).then(pairs => Object.fromEntries(pairs));
}

/* --------------------------- deterministic RNG --------------------------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ----------------------- world / forest generation ----------------------- */
/* Object kinds: how each decoration draws & whether it blocks movement.
 * widthTiles: drawn width in tiles (height keeps the source aspect ratio).
 * anchor 'base': image bottom-center sits at the tile's bottom-center.       */
const KINDS = {
  tree:           { widthTiles: 1.7, solid: true,  feet: 0.55 },
  rock:           { widthTiles: 1.0, solid: true,  feet: 0.9  },
  bush:           { widthTiles: 1.1, solid: false, feet: 1    },
  flowers_red:    { widthTiles: 1.0, solid: false, feet: 1    },
  flowers_orange: { widthTiles: 1.2, solid: false, feet: 1    },
  pond:           { widthTiles: 3.4, solid: true,  feet: 1, blockW: 3, blockH: 2 },
};

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

  /* five lizards: four sleeping encounters in the clearing, plus a guardian
     blocking the eastern gate — the road to Koro, barred for now */
  const lizards = [
    { id: 0, tx: midX - 8, ty: 8 },
    { id: 1, tx: midX + 7, ty: 7 },
    { id: 2, tx: midX - 5, ty: 17 },
    { id: 3, tx: midX + 9, ty: 19 },
    { id: 4, tx: MAP_W - 4, ty: gateY, guardian: true },   // blocks the gate
  ];
  /* a treasure chest sitting at the north end of the central dirt trail */
  const chest = { tx: trailTopX, ty: 6, opened: false, item: "leather_tunic" };
  for (let i = objects.length - 1; i >= 0; i--)            // clear anything on its tile
    if (objects[i].tx === chest.tx && objects[i].ty === chest.ty) objects.splice(i, 1);
  if (inB(chest.tx, chest.ty)) blocked[chest.ty][chest.tx] = true;  // solid: bump to open

  return { ground, blocked, objects, spawn, lizards, gateY, chest };
}

/* --------------------------------- game ---------------------------------- */
class Game {
  constructor(canvas, art) {
    this.cv = canvas; this.ctx = canvas.getContext("2d");
    this.art = art;
    this.world = buildWorld(1337);

    this.player = {
      x: this.world.spawn.tx * TILE + TILE / 2,
      y: this.world.spawn.ty * TILE + TILE / 2,
      face: 1,            // 1 = right, -1 = left (frames are drawn facing left)
      moving: false,
      animT: 0, frame: 0,
      wTiles: 1.15,       // drawn width in tiles
      // --- RPG stats ---
      name: "GARRAN", job: "Wanderer",
      lv: 1, exp: 0, expNext: 24,
      hp: 30, maxhp: 30, mp: 8, maxmp: 8,
      atk: 9, def: 5, gold: 150,
      skills: [],          // equipped skill ids (slots = floor(LV/2))
      equipOwned: ["wood_sword", "cloak"],          // gear in the pack
      equip: { weapon: "wood_sword", armor: "cloak" },  // gear currently worn
    };
    this.items = [
      { name: "Potion", qty: 3, desc: "Restores 25 HP to one ally." },
      { name: "Antidote", qty: 1, desc: "Cures the Poison status." },
      { name: "Bread", qty: 2, desc: "Travel rations. Restores 8 HP." },
      { name: "Phoenix Down", qty: 1, desc: "Revives a fallen ally." },
    ];

    this.ui = null;          // null | { screen: 'main'|'status'|'items', sel }
    this.dialogue = null;    // null | { name, lines, page, portrait }
    this.introShown = false;

    // lizards: sleeping encounters + one awake guardian on the east gate
    this.lizards = this.world.lizards.map(lz => ({
      id: lz.id, x: lz.tx * TILE + TILE / 2, y: lz.ty * TILE + TILE,
      alive: true, guardian: !!lz.guardian, anim: lz.guardian ? "idle" : "sleep", animT: Math.random() * 1000,
    }));
    for (const lz of this.world.lizards)               // guardian blocks its tile
      if (lz.guardian) this.world.blocked[lz.ty][lz.tx] = true;
    this.encounter = null;   // { phase:'roar'|'whirl', t, target }
    this.battle = null;
    this.nameBuf = "GARRAN"; // name-entry buffer
    this.guardianTalkCD = 0;

    // --- screen / flow state ---
    this.state = "title";       // title | overworld
    this.t = 0;                 // running clock (ms), for animation
    this.titleSel = 0;          // 0 = New Game, 1 = Continue
    this.fade = 1;              // 1 = black; fades in on load
    this.exiting = false; this.exitTo = null;
    this.hud = document.getElementById("hud");

    this.keys = {};
    addEventListener("keydown", e => {
      const key = e.key.toLowerCase();
      if (["arrowup","arrowdown","arrowleft","arrowright"," ","enter","backspace"].includes(key))
        e.preventDefault();
      if (!e.repeat) this.onKey(key);     // discrete (menu) actions
      this.keys[key] = true;              // continuous (movement) state
    });
    addEventListener("keyup", e => { this.keys[e.key.toLowerCase()] = false; });

    // mouse (used for skill drag & drop)
    const toCanvas = e => {
      const r = this.cv.getBoundingClientRect();
      return [(e.clientX - r.left) * (this.cv.width / r.width), (e.clientY - r.top) * (this.cv.height / r.height)];
    };
    this.cv.addEventListener("mousedown", e => { const [x, y] = toCanvas(e); this.onMouse("down", x, y); });
    addEventListener("mousemove", e => { const [x, y] = toCanvas(e); this.onMouse("move", x, y); });
    addEventListener("mouseup", e => { const [x, y] = toCanvas(e); this.onMouse("up", x, y); });

    this.resize(); addEventListener("resize", () => this.resize());
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }

  /* discrete key presses, routed by screen */
  onKey(key) {
    if (this.exiting) return;
    if (this.state === "title") {
      if (key === "arrowup" || key === "w" || key === "arrowdown" || key === "s")
        this.titleSel ^= 1;                       // toggle the two options
      else if (key === "enter" || key === " ") {
        if (this.titleSel === 1) {                  // Continue
          if (this.loadGame()) this.beginTransition("overworld");
          else this.flash = { text: "No saved game found.", t: 1500 };
        } else this.beginTransition("name");        // New Game -> choose a name
      }
      return;
    }
    if (this.state === "name") {
      if (key === "enter") {
        const nm = (this.nameBuf.trim() || "GARRAN").slice(0, 10);
        this.player.name = nm.toUpperCase();
        this.beginTransition("overworld");
      } else if (key === "backspace") {
        this.nameBuf = this.nameBuf.slice(0, -1);
      } else if (/^[a-z0-9 ]$/i.test(key) && this.nameBuf.length < 10) {
        this.nameBuf += key.length === 1 ? key.toUpperCase() : "";
      }
      return;
    }
    if (this.state === "battle") { this.battleKey(key); return; }
    if (this.state === "overworld") {
      if (this.encounter) return;                 // locked during roar/whirl
      if (this.dialogue) {                         // advance / close dialogue
        if (key === "enter" || key === " " || key === "escape") this.advanceDialogue();
        return;
      }
      if (this.ui) { this.menuKey(key); return; }  // navigate the menu
      if (key === "escape" || key === "m") this.ui = { screen: "main", sel: 0 };
      else if (key === "i") this.ui = { screen: "items", sel: 0 };
      else if (key === "enter" || key === " ") { if (!this.tryOpenChest()) this.startIntro(); }
    }
  }

  /* menu navigation */
  menuKey(key) {
    const ui = this.ui;
    const back = () => { ui.screen === "main" ? (this.ui = null) : (this.ui = { screen: "main", sel: 0 }); };
    if (key === "escape") return back();

    if (ui.screen === "main") {
      const n = MAIN_MENU.length;
      if (key === "arrowup" || key === "w") ui.sel = (ui.sel + n - 1) % n;
      else if (key === "arrowdown" || key === "s") ui.sel = (ui.sel + 1) % n;
      else if (key === "enter" || key === " ") {
        const pick = MAIN_MENU[ui.sel];
        if (pick === "Items") this.ui = { screen: "items", sel: 0 };
        else if (pick === "Status") this.ui = { screen: "status", sel: 0 };
        else if (pick === "Skills") this.ui = { screen: "skills", sel: 0, drag: null, hover: -1 };
        else if (pick === "Equip") this.ui = { screen: "equip", sel: 0, drag: null, hover: null };
        else if (pick === "Save") { this.saveGame(); this.ui = null; }
        else this.flash = { text: pick + " — not implemented yet", t: 1400 };
      }
    } else if (ui.screen === "items") {
      const n = this.items.length;
      if (n) {
        if (key === "arrowup" || key === "w") ui.sel = (ui.sel + n - 1) % n;
        else if (key === "arrowdown" || key === "s") ui.sel = (ui.sel + 1) % n;
      }
      if (key === "enter" || key === " ") this.flash = { text: "Can't use that here.", t: 1200 };
    }
  }

  /* open the trail-end chest if the hero is standing beside it */
  tryOpenChest() {
    const chest = this.world.chest; if (!chest || chest.opened) return false;
    const p = this.player;
    const cx = chest.tx * TILE + TILE / 2, cy = (chest.ty + 0.5) * TILE;
    if (Math.hypot(p.x - cx, p.y - cy) > TILE * 1.7) return false;
    chest.opened = true;
    const it = EQUIP_BY_ID[chest.item];
    if (!p.equipOwned.includes(chest.item)) p.equipOwned.push(chest.item);
    this.dialogue = { name: p.name, page: 0, lines: [
      ["A " + it.name + "!", it.desc],
      ["Equip it from the menu", "(press M, then Equip)."],
    ]};
    return true;
  }

  startIntro() {
    const nm = this.player.name;
    this.dialogue = {
      name: nm, page: 0,
      lines: [
        [AREA_NAME + ", at last.", "Quiet... but the air carries", "the scent of something restless."],
        ["I should press on toward", "the town of Koro.", "But mind what stalks the grass."],
      ],
    };
  }
  advanceDialogue() {
    if (!this.dialogue) return;
    this.dialogue.page++;
    if (this.dialogue.page >= this.dialogue.lines.length) this.dialogue = null;
  }

  beginTransition(to) { this.exiting = true; this.exitTo = to; }

  /* ------------------------------ save / load ---------------------------- */
  hasSave() { try { return !!localStorage.getItem("game_save"); } catch (e) { return false; } }
  saveGame() {
    const p = this.player;
    const data = {
      v: 1, name: p.name, lv: p.lv, exp: p.exp, expNext: p.expNext,
      hp: p.hp, maxhp: p.maxhp, mp: p.mp, maxmp: p.maxmp, atk: p.atk, def: p.def,
      gold: p.gold, skills: p.skills.slice(),
      equipOwned: p.equipOwned.slice(), equip: { ...p.equip },
      chestOpened: !!(this.world.chest && this.world.chest.opened),
      items: this.items.map(i => ({ name: i.name, qty: i.qty })),
      dead: this.lizards.map(l => !l.alive),
      px: p.x, py: p.y, at: Date.now(),
    };
    try { localStorage.setItem("game_save", JSON.stringify(data)); this.flash = { text: "Game saved!", t: 1500 }; }
    catch (e) { this.flash = { text: "Save failed.", t: 1500 }; }
  }
  loadGame() {
    let data; try { data = JSON.parse(localStorage.getItem("game_save")); } catch (e) { return false; }
    if (!data) return false;
    const p = this.player;
    Object.assign(p, {
      name: data.name, lv: data.lv, exp: data.exp, expNext: data.expNext,
      hp: data.hp, maxhp: data.maxhp, mp: data.mp, maxmp: data.maxmp,
      atk: data.atk, def: data.def, gold: data.gold, skills: (data.skills || []).slice(),
      x: data.px, y: data.py,
    });
    if (data.equipOwned) p.equipOwned = data.equipOwned.slice();
    if (data.equip) p.equip = { weapon: data.equip.weapon || null, armor: data.equip.armor || null };
    if (this.world.chest) this.world.chest.opened = !!data.chestOpened;
    for (const it of this.items) { const s = (data.items || []).find(i => i.name === it.name); it.qty = s ? s.qty : it.qty; }
    this.lizards.forEach((l, i) => { l.alive = !(data.dead && data.dead[i]); });
    this.introShown = true;
    return true;
  }

  resize() {
    this.cv.width = Math.min(innerWidth, 1280);
    this.cv.height = Math.min(innerHeight, 800);
    this.ctx.imageSmoothingEnabled = false;   // crisp pixel-art scaling (resize resets ctx state)
  }

  /* feet-box collision against blocked tiles */
  blockedAt(px, py) {
    const half = 9;                     // feet half-width
    for (const [ox, oy] of [[-half, 0], [half, 0], [0, -half], [0, half], [-half,-half],[half,half]]) {
      const tx = Math.floor((px + ox) / TILE), ty = Math.floor((py + oy) / TILE);
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
      if (this.world.blocked[ty][tx]) return true;
    }
    return false;
  }

  update(dt) {
    this.t += dt;

    // fade-in on load; fade-out then switch when transitioning
    if (this.exiting) {
      this.fade = Math.min(1, this.fade + dt / 380);
      if (this.fade >= 1) {
        this.state = this.exitTo; this.exiting = false;
        if (this.state === "overworld" && !this.introShown) { this.introShown = true; this.startIntro(); }
      }
    } else if (this.fade > 0) {
      this.fade = Math.max(0, this.fade - dt / 600);
    }

    if (this.flash) { this.flash.t -= dt; if (this.flash.t <= 0) this.flash = null; }

    // keep the on-canvas world HUD hidden unless we're roaming
    const wantHud = this.state === "overworld" ? "block" : "none";
    if (this.hud && this.hud.style.display !== wantHud) this.hud.style.display = wantHud;

    if (this.state === "battle") { this.updateBattle(dt); return; }
    if (this.state !== "overworld") return;

    const p = this.player;

    // lizards animate (sleep / idle / roar)
    for (const lz of this.lizards) if (lz.alive) lz.animT += dt;
    if (this.encounterCD > 0) this.encounterCD -= dt;
    if (this.guardianTalkCD > 0) this.guardianTalkCD -= dt;

    if (this.encounter) { this.updateEncounter(dt); return; }
    if (this.ui || this.dialogue) { p.moving = false; p.frame = 0; return; }  // paused for UI

    const k = this.keys;
    let dx = 0, dy = 0;
    if (k["a"] || k["arrowleft"])  dx -= 1;
    if (k["d"] || k["arrowright"]) dx += 1;
    if (k["w"] || k["arrowup"])    dy -= 1;
    if (k["s"] || k["arrowdown"])  dy += 1;

    p.moving = dx !== 0 || dy !== 0;
    if (dx !== 0) p.face = dx > 0 ? 1 : -1;

    if (p.moving) {
      const len = Math.hypot(dx, dy) || 1;
      const run = (k["shift"]) ? RUN_MULT : 1;
      const step = SPEED * run * (dt / (1000 / 60));
      const nx = p.x + (dx / len) * step;
      const ny = p.y + (dy / len) * step;
      // resolve axes independently so we slide along walls
      if (!this.blockedAt(nx, p.y)) p.x = nx;
      if (!this.blockedAt(p.x, ny)) p.y = ny;

      p.animT += dt;
      if (p.animT > 1000 / WALK_FPS) { p.animT = 0; p.frame = (p.frame + 1) % 6; }
    } else {
      p.frame = 0; p.animT = 0;
    }

    if (!this.dialogue) this.checkLizardProximity();
  }

  checkLizardProximity() {
    const p = this.player;
    for (const lz of this.lizards) {
      if (!lz.alive) continue;
      const d = Math.hypot(p.x - lz.x, p.y - (lz.y - TILE / 2));
      if (lz.guardian) {
        if (d < TILE * 2.2 && !(this.guardianTalkCD > 0)) {
          this.guardianTalkCD = 5000;
          this.dialogue = { name: this.player.name, page: 0, lines: [
            ["A huge lizard guards the road", "east to the town of Koro.", "Its eyes track my every step."],
            ["I'm not ready to face it.", "Best turn back... for now."],
          ]};
        }
      } else if (!(this.encounterCD > 0) && d < TILE * 1.7) {
        this.encounter = { phase: "roar", t: 0, target: lz };
        lz.anim = "roar"; lz.animT = 0; return;
      }
    }
  }

  /* roar -> whirl -> battle */
  updateEncounter(dt) {
    const e = this.encounter; e.t += dt;
    if (e.phase === "roar") {
      if (e.t > 950) {
        // snapshot the current overworld frame to spin during the whirl
        this.snapshot = document.createElement("canvas");
        this.snapshot.width = this.cv.width; this.snapshot.height = this.cv.height;
        this.snapshot.getContext("2d").drawImage(this.cv, 0, 0);
        e.phase = "whirl"; e.t = 0;
      }
    } else if (e.phase === "whirl") {
      if (e.t > 850) { const tgt = e.target; this.encounter = null; this.enterBattle(tgt); }
    }
  }

  /* a small pixel treasure chest, anchored bottom-center at (worldX, baseY) */
  drawChest(worldX, baseY, opened) {
    const ctx = this.ctx, cam = this.cam;
    const w = TILE * 0.78, h = TILE * 0.66;
    const x = worldX - w / 2 - cam.x, y = baseY - h - cam.y;
    ctx.save();
    ctx.fillStyle = "#7a4a1e"; ctx.fillRect(x, y + h * 0.34, w, h * 0.66);          // body
    ctx.fillStyle = "#5c3514"; ctx.fillRect(x, y + h * 0.34, w, h * 0.08);          // shadow lip
    if (opened) {
      ctx.fillStyle = "#2a1a0c"; ctx.fillRect(x + w * 0.08, y + h * 0.2, w * 0.84, h * 0.2);  // open interior
      ctx.fillStyle = "#8a5a26"; ctx.fillRect(x - w * 0.02, y - h * 0.04, w * 1.04, h * 0.16); // raised lid
    } else {
      ctx.fillStyle = "#8a5a26"; ctx.fillRect(x, y + h * 0.08, w, h * 0.3);         // closed lid
      ctx.fillStyle = "#d9a441"; ctx.fillRect(x + w * 0.43, y + h * 0.2, w * 0.14, h * 0.2); // lock
    }
    ctx.fillStyle = "#d9a441";                                                      // metal bands
    ctx.fillRect(x + w * 0.1, y + h * 0.34, w * 0.06, h * 0.66);
    ctx.fillRect(x + w * 0.84, y + h * 0.34, w * 0.06, h * 0.66);
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
  }

  /* draw one decoration / the player, anchored at the tile's base */
  drawSprite(img, worldX, baseY, wTiles, flip) {
    const w = wTiles * TILE;
    const h = w * (img.height / img.width);
    const ctx = this.ctx;
    const sx = worldX - w / 2 - this.cam.x;
    const sy = baseY - h - this.cam.y;
    if (flip) {
      ctx.save();
      ctx.translate(sx + w, sy); ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, sx, sy, w, h);
    }
  }

  render() {
    if (this.state === "title") this.renderTitle();
    else if (this.state === "name") this.renderName();
    else if (this.state === "battle" && this.battle) this.renderBattle();
    else if (this.encounter && this.encounter.phase === "whirl") this.renderWhirl();
    else this.renderOverworld();

    if (this.flash) this.drawFlash();

    // global fade overlay (load-in / transitions)
    if (this.fade > 0) {
      const ctx = this.ctx;
      ctx.fillStyle = `rgba(0,0,0,${this.fade})`;
      ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    }
  }

  /* ----------------------------- title screen ---------------------------- */
  renderTitle() {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height, t = this.t / 1000;

    // sky: night-indigo high up, melting into a sunset at the horizon
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0.00, "#1b1440");
    sky.addColorStop(0.40, "#4a2f73");
    sky.addColorStop(0.60, "#9c4a5a");
    sky.addColorStop(0.74, "#d9763c");
    sky.addColorStop(0.84, "#f2b04a");
    sky.addColorStop(1.00, "#f7d27a");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // stars (only in the dark upper band), gently twinkling
    for (let i = 0; i < 70; i++) {
      const sx = (i * 173.7) % W, sy = ((i * 97.3) % (H * 0.45));
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + i));
      ctx.fillStyle = `rgba(255,255,235,${tw * (1 - sy / (H * 0.5)) * 0.9})`;
      ctx.fillRect(sx | 0, sy | 0, 2, 2);
    }

    // setting sun + warm glow
    const sunX = W * 0.66, sunY = H * 0.70, sunR = Math.max(34, H * 0.075);
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 6);
    glow.addColorStop(0, "rgba(255,240,200,0.85)");
    glow.addColorStop(0.35, "rgba(255,200,120,0.45)");
    glow.addColorStop(1, "rgba(255,180,90,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff1c6";
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, 7); ctx.fill();

    // layered mountain ridges (far -> near, darkening)
    const ridge = (baseY, color, amp, wl, phase) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 4) {
        const y = baseY + Math.sin(x / wl + phase) * amp
                        + Math.sin(x / (wl * 0.37) + phase * 1.7) * amp * 0.4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    };
    ridge(H * 0.66, "#5b3a6e", H * 0.05, 240, 0.5);
    ridge(H * 0.74, "#3c2552", H * 0.07, 300, 2.1);

    // foreground cliff: a dark plateau on the left where the hero stands,
    // sloping down to a low foreground ridge on the right
    const plateauY = H * 0.56, lowY = H * 0.87;
    const cliffTop = x => {
      const k = x / W;
      if (k < 0.30) return plateauY + Math.sin(x / 70) * 4;
      if (k < 0.42) return plateauY + (k - 0.30) / 0.12 * (lowY - plateauY);
      return lowY + Math.sin(x / 80 + 1) * 8;
    };
    ctx.fillStyle = "#150f24"; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) ctx.lineTo(x, cliffTop(x));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

    // a tree and the hero, silhouetted (backlit) on the plateau, gazing at the sun
    this.drawSilhouette(this.art.tree, W * 0.06, plateauY + 6, H * 0.30, "#0c0a16", false);
    this.drawSilhouette(this.art.idle, W * 0.20, plateauY + 8, H * 0.26, "#110d20", true);

    // a few birds drifting across the sky
    ctx.strokeStyle = "rgba(20,12,30,0.6)"; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const bx = ((t * 18 + i * 130) % (W + 80)) - 40, by = H * (0.16 + 0.04 * i) + Math.sin(t + i) * 4, s = 7 - i;
      ctx.beginPath();
      ctx.moveTo(bx - s, by); ctx.lineTo(bx, by - s * 0.6); ctx.lineTo(bx + s, by);
      ctx.stroke();
    }

    // ---- title text: gold, outlined, with drop shadow ----
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    const tx = W / 2, ty = H * 0.30;
    const big = Math.floor(H * 0.135);
    ctx.font = `bold ${big}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillText(GAME_TITLE, tx + 4, ty + 6);
    const grad = ctx.createLinearGradient(0, ty - big, 0, ty + big * 0.15);
    grad.addColorStop(0, "#fff7d6"); grad.addColorStop(0.5, "#f3cf6c"); grad.addColorStop(1, "#a9701f");
    ctx.lineWidth = Math.max(3, H * 0.011); ctx.strokeStyle = "#3a230d";
    ctx.lineJoin = "round"; ctx.strokeText(GAME_TITLE, tx, ty);
    ctx.fillStyle = grad; ctx.fillText(GAME_TITLE, tx, ty);

    if (GAME_SUBTITLE) {
      ctx.font = `${Math.floor(H * 0.032)}px Georgia, serif`;
      ctx.fillStyle = "#f2e3bd";
      ctx.fillText(GAME_SUBTITLE, tx, ty + H * 0.075);
    }

    // ---- menu options ----
    const opts = ["NEW GAME", "CONTINUE"];
    ctx.font = `bold ${Math.floor(H * 0.040)}px Georgia, serif`;
    const oy = H * 0.74, gap = H * 0.075;
    const canContinue = this.hasSave();
    opts.forEach((o, i) => {
      const y = oy + i * gap, sel = i === this.titleSel;
      const w = ctx.measureText(o).width;
      const disabled = i === 1 && !canContinue;
      ctx.fillStyle = disabled ? "rgba(180,180,190,0.32)" : (sel ? "#ffe9a0" : "rgba(235,225,205,0.5)");
      ctx.fillText(o, tx, y);
      if (sel) {                                  // blinking cursor gem to the left
        const blink = 0.45 + 0.55 * Math.sin(t * 6);
        ctx.fillStyle = `rgba(255,224,128,${blink})`;
        const cxp = tx - w / 2 - 24, cy = y - H * 0.014;
        ctx.beginPath();
        ctx.moveTo(cxp, cy - 9); ctx.lineTo(cxp + 14, cy); ctx.lineTo(cxp, cy + 9);
        ctx.closePath(); ctx.fill();
      }
    });

    // hint
    ctx.font = `${Math.floor(H * 0.024)}px Georgia, serif`;
    ctx.fillStyle = `rgba(255,255,235,${0.4 + 0.4 * Math.sin(t * 3)})`;
    ctx.fillText("PRESS  ENTER", tx, H * 0.93);
    ctx.fillStyle = "rgba(255,255,235,0.5)";
    ctx.font = `${Math.floor(H * 0.02)}px Georgia, serif`;
    ctx.fillText("© 2026", W - 50, H - 16);
  }

  /* draw a sprite as a flat backlit silhouette, anchored at its base */
  drawSilhouette(img, cx, baseY, targetH, color, flip) {
    const h = targetH, w = h * (img.width / img.height);
    const ctx = this.ctx;
    const off = document.createElement("canvas");
    off.width = img.width; off.height = img.height;
    const o = off.getContext("2d");
    o.drawImage(img, 0, 0);
    o.globalCompositeOperation = "source-atop";
    o.fillStyle = color; o.fillRect(0, 0, off.width, off.height);
    ctx.save();
    if (flip) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
    ctx.drawImage(off, cx - w / 2, baseY - h, w, h);
    ctx.restore();
  }

  renderOverworld() {
    const ctx = this.ctx, p = this.player, art = this.art;

    // camera centered on player, clamped to the map
    const viewW = this.cv.width, viewH = this.cv.height;
    this.cam = {
      x: Math.max(0, Math.min(MAP_W * TILE - viewW, p.x - viewW / 2)),
      y: Math.max(0, Math.min(MAP_H * TILE - viewH, p.y - viewH / 2)),
    };
    const cam = this.cam;

    ctx.clearRect(0, 0, viewW, viewH);

    // --- ground layer (only visible tiles) ---
    const x0 = Math.max(0, Math.floor(cam.x / TILE));
    const y0 = Math.max(0, Math.floor(cam.y / TILE));
    const x1 = Math.min(MAP_W, Math.ceil((cam.x + viewW) / TILE));
    const y1 = Math.min(MAP_H, Math.ceil((cam.y + viewH) / TILE));
    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        const g = this.world.ground[ty][tx];
        const img = g === G_DIRT ? art.dirt : g === G_EDGE ? art.grass_edge : art.grass;
        const px = tx * TILE - cam.x, py = ty * TILE - cam.y;
        if (g === G_GRASS) {
          // deterministic rotate/flip per tile so the repeat doesn't read as a grid
          const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
          ctx.save();
          ctx.translate(px + TILE / 2, py + TILE / 2);
          // grass is mirror-symmetric, so flips & 180° keep edges seamless
          if (h & 1) ctx.scale(-1, 1);
          if (h & 2) ctx.scale(1, -1);
          ctx.drawImage(img, -TILE / 2 - 1, -TILE / 2 - 1, TILE + 2, TILE + 2);
          ctx.restore();
        } else {
          ctx.drawImage(img, px, py, TILE + 1, TILE + 1);
        }
      }
    }

    // --- y-sorted object + player layer (painter's depth) ---
    const shadow = (worldX, baseY, wTiles) => {
      const rx = wTiles * TILE * 0.42, ry = rx * 0.32;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(worldX - cam.x, baseY - cam.y - ry * 0.5, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    const renderables = [];
    for (const o of this.world.objects) {
      const k = KINDS[o.kind];
      const worldX = o.tx * TILE + (k.blockW || 1) * TILE / 2;
      const baseY = (o.ty + (k.blockH || 1)) * TILE;        // bottom of footprint
      const sortY = (o.ty + k.feet) * TILE;
      renderables.push({ sortY, draw: () => {
        if (o.kind !== "pond" && o.kind !== "flowers_red" && o.kind !== "flowers_orange")
          shadow(worldX, baseY, k.widthTiles * 0.8);
        this.drawSprite(art[o.kind], worldX, baseY, k.widthTiles, false);
      }});
    }
    const chest = this.world.chest;
    if (chest) {
      const cwx = chest.tx * TILE + TILE / 2, cby = (chest.ty + 1) * TILE;
      renderables.push({ sortY: (chest.ty + 0.9) * TILE, draw: () => {
        shadow(cwx, cby, 0.85);
        this.drawChest(cwx, cby, chest.opened);
      }});
    }
    for (const lz of this.lizards) {
      if (!lz.alive) continue;
      const grp = lz.anim === "roar" ? "liz_roar" : lz.guardian ? "liz_idle" : "liz_sleep";
      const fps = lz.anim === "roar" ? 9 : lz.guardian ? 4 : 2.5;
      const fr = Math.floor((lz.animT || 0) / (1000 / fps)) % LIZ_ANIMS[grp];
      const img = art[`${grp}_${fr}`];
      const w = lz.guardian ? 2.7 : 2.1;
      renderables.push({ sortY: lz.y, draw: () => {
        shadow(lz.x, lz.y, w * 0.8);
        this.drawSprite(img, lz.x, lz.y, w, false);
      }});
    }
    const pFrame = p.moving ? art["walk_" + p.frame] : art.idle;
    renderables.push({
      sortY: p.y,
      draw: () => {
        shadow(p.x, p.y + 14, p.wTiles * 0.7);
        this.drawSprite(pFrame, p.x, p.y + 14, p.wTiles, p.face === 1);
      },
    });
    renderables.sort((a, b) => a.sortY - b.sortY);
    for (const r of renderables) r.draw();

    // --- overlays ---
    if (this.ui) this.drawMenu();
    if (this.dialogue) this.drawDialogue();
  }

  /* ----------------------------- UI primitives --------------------------- */
  /* an FF-style blue window: navy gradient fill, light double border */
  drawWindow(x, y, w, h) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "rgba(20,32,86,0.94)");
    g.addColorStop(1, "rgba(10,16,46,0.94)");
    ctx.fillStyle = g;
    ctx.strokeStyle = "#dfe6ff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, 9); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(120,140,210,0.7)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x + 6, y + 6, w - 12, h - 12, 6); ctx.stroke();
  }
  text(s, x, y, opt = {}) {
    const ctx = this.ctx;
    ctx.font = `${opt.bold ? "bold " : ""}${opt.size || 18}px Georgia, serif`;
    ctx.textAlign = opt.align || "left"; ctx.textBaseline = "alphabetic";
    if (opt.shadow !== false) { ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillText(s, x + 1.5, y + 1.5); }
    ctx.fillStyle = opt.color || "#eef1ff"; ctx.fillText(s, x, y);
  }
  bar(x, y, w, h, frac, color) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * frac), h - 2);
    ctx.strokeStyle = "rgba(220,228,255,0.6)"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  cursor(x, y) {                                    // gold ▶ selection arrow
    const ctx = this.ctx, b = 0.5 + 0.5 * Math.sin(this.t / 120);
    ctx.fillStyle = `rgba(255,224,128,${0.6 + 0.4 * b})`;
    ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 11, y); ctx.lineTo(x, y + 7); ctx.closePath(); ctx.fill();
  }

  drawFlash() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx;
    const a = Math.min(1, this.flash.t / 300);
    ctx.globalAlpha = a;
    const w = Math.min(W - 40, ctx.measureText(this.flash.text).width + 80);
    this.drawWindow((W - 360) / 2, H - 120, 360, 46);
    this.text(this.flash.text, W / 2, H - 90, { align: "center", size: 17, color: "#ffe9b0" });
    ctx.globalAlpha = 1;
  }

  /* ----------------------------- menu screens ---------------------------- */
  drawMenu() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 0, W, H);   // dim world
    const ui = this.ui;
    if (ui.screen === "main") this.drawMainMenu();
    else if (ui.screen === "status") this.drawStatusScreen();
    else if (ui.screen === "items") this.drawItemsScreen();
    else if (ui.screen === "skills") this.drawSkillsScreen();
    else if (ui.screen === "equip") this.drawEquipScreen();
  }

  /* ----------------------------- skills screen --------------------------- */
  skillLayout() {
    const W = this.cv.width, H = this.cv.height;
    const x = 40, y = 36, w = W - 80, h = H - 110;
    const listX = x + 36, listY = y + 110, rowH = 70;
    const rows = SKILLS.map((s, i) => ({ skill: s, x: listX, y: listY + i * rowH, w: 380, h: 58 }));
    const n = skillSlots(this.player.lv);
    const slotX = x + w - 320, slotY = y + 116, ss = 74, gap = 22;
    const slots = [];
    for (let i = 0; i < n; i++) slots.push({ i, x: slotX + (i % 3) * (ss + gap), y: slotY + ((i / 3) | 0) * (ss + gap), w: ss, h: ss });
    return { x, y, w, h, rows, slots, n, slotX, slotY };
  }
  onMouse(type, mx, my) {
    if (!this.ui) return;
    if (this.ui.screen === "equip") return this.onEquipMouse(type, mx, my);
    if (this.ui.screen !== "skills") return;
    const ui = this.ui, p = this.player, L = this.skillLayout();
    const hit = r => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
    while (p.skills.length < L.n) p.skills.push(null);
    p.skills.length = L.n;
    if (type === "down") {
      for (const r of L.rows) if (hit(r) && p.lv >= r.skill.unlock) { ui.drag = { id: r.skill.id, from: "list", mx, my }; return; }
      for (const s of L.slots) if (hit(s) && p.skills[s.i]) { ui.drag = { id: p.skills[s.i], from: "slot", slot: s.i, mx, my }; return; }
    } else if (type === "move" && ui.drag) {
      ui.drag.mx = mx; ui.drag.my = my; ui.hover = -1;
      for (const s of L.slots) if (hit(s)) ui.hover = s.i;
    } else if (type === "up" && ui.drag) {
      let drop = -1; for (const s of L.slots) if (hit(s)) drop = s.i;
      const id = ui.drag.id;
      if (drop >= 0) {
        if (ui.drag.from === "slot") { const t = p.skills[drop]; p.skills[drop] = id; p.skills[ui.drag.slot] = t; }
        else { const ex = p.skills.indexOf(id); if (ex >= 0) p.skills[ex] = null; p.skills[drop] = id; }
      } else if (ui.drag.from === "slot") p.skills[ui.drag.slot] = null;   // dragged out = unequip
      ui.drag = null; ui.hover = -1;
    }
  }
  drawSkillsScreen() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx, p = this.player, ui = this.ui, art = this.art;
    const L = this.skillLayout();
    while (p.skills.length < L.n) p.skills.push(null); p.skills.length = L.n;
    this.drawWindow(L.x, L.y, L.w, L.h);
    this.text("SKILLS", L.x + 28, L.y + 44, { size: 24, bold: true, color: "#ffe9a0" });
    this.text("SKILL SLOTS:  " + L.n, L.x + L.w - 28, L.y + 44, { size: 19, align: "right", color: "#9fd8ff" });
    this.text("Drag a skill into a slot.  Drag a slot out to remove.", L.x + 28, L.y + 76, { size: 14, color: "#cfd6ff" });

    // skill list
    for (const r of L.rows) {
      const s = r.skill, locked = p.lv < s.unlock, equipped = p.skills.includes(s.id);
      ctx.globalAlpha = locked ? 0.4 : (ui.drag && ui.drag.id === s.id && ui.drag.from === "list" ? 0.35 : 1);
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 6); ctx.fill();
      ctx.drawImage(art[s.icon], r.x + 6, r.y + 5, 48, 48);
      this.text(s.name, r.x + 66, r.y + 26, { size: 18, bold: true, color: locked ? "#9aa" : "#eef1ff" });
      this.text("Unlocks at Lv " + s.unlock + "   ·   " + s.mp + " MP", r.x + 66, r.y + 48, { size: 14, color: locked ? "#889" : "#bcd0f0" });
      if (locked) this.text("LOCKED", r.x + r.w - 14, r.y + 30, { size: 14, align: "right", color: "#e88" });
      else if (equipped) this.text("equipped", r.x + r.w - 14, r.y + 30, { size: 13, align: "right", color: "#9cf0a0" });
      ctx.globalAlpha = 1;
    }

    // slots
    this.text("EQUIPPED", L.slotX, L.slotY - 14, { size: 15, color: "#9fb0e8" });
    if (L.n === 0) this.text("Reach Level 2 to unlock a slot.", L.slotX, L.slotY + 30, { size: 15, color: "#cfd6ff" });
    for (const s of L.slots) {
      ctx.fillStyle = ui.hover === s.i && ui.drag ? "rgba(120,150,230,0.4)" : "rgba(0,0,0,0.35)";
      ctx.strokeStyle = "rgba(220,228,255,0.7)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(s.x, s.y, s.w, s.h, 8); ctx.fill(); ctx.stroke();
      const id = p.skills[s.i];
      if (id && !(ui.drag && ui.drag.from === "slot" && ui.drag.slot === s.i)) {
        const sk = SKILL_BY_ID[id];
        ctx.drawImage(art[sk.icon], s.x + (s.w - 52) / 2, s.y + 6, 52, 52);
      }
    }

    // dragged icon follows the cursor
    if (ui.drag) {
      const sk = SKILL_BY_ID[ui.drag.id];
      ctx.globalAlpha = 0.9; ctx.drawImage(art[sk.icon], ui.drag.mx - 28, ui.drag.my - 28, 56, 56); ctx.globalAlpha = 1;
    }
    this.text("ESC  back", W / 2, H - 32, { align: "center", size: 15, color: "rgba(230,235,255,0.7)" });
  }

  /* ----------------------------- equip screen --------------------------- */
  equipLayout() {
    const W = this.cv.width, H = this.cv.height;
    const x = 40, y = 36, w = W - 80, h = H - 110;
    const listX = x + 36, listY = y + 110, rowH = 64;
    const rows = this.player.equipOwned.map((id, i) =>
      ({ id, item: EQUIP_BY_ID[id], x: listX, y: listY + i * rowH, w: 380, h: 54 }));
    const ss = 84, gap = 30, slotX = x + w - 300, slotY = y + 126;
    const slots = EQUIP_SLOTS.map((slot, i) => ({ slot, x: slotX, y: slotY + i * (ss + gap), w: ss, h: ss }));
    return { x, y, w, h, rows, slots, listX, listY, slotX, slotY };
  }
  onEquipMouse(type, mx, my) {
    const ui = this.ui, p = this.player, L = this.equipLayout();
    const hit = r => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
    if (type === "down") {
      for (const r of L.rows) if (hit(r)) { ui.drag = { id: r.id, from: "list", mx, my }; return; }
      for (const s of L.slots) { const id = p.equip[s.slot]; if (id && hit(s)) { ui.drag = { id, from: "slot", slot: s.slot, mx, my }; return; } }
    } else if (type === "move" && ui.drag) {
      ui.drag.mx = mx; ui.drag.my = my; ui.hover = null;
      for (const s of L.slots) if (hit(s)) ui.hover = s.slot;
    } else if (type === "up" && ui.drag) {
      let drop = null; for (const s of L.slots) if (hit(s)) drop = s.slot;
      const item = EQUIP_BY_ID[ui.drag.id];
      if (drop && item.slot === drop) p.equip[drop] = ui.drag.id;            // worn (only fits its slot)
      else if (drop === null && ui.drag.from === "slot") p.equip[ui.drag.slot] = null;  // dragged out = remove
      ui.drag = null; ui.hover = null;
    }
  }
  drawEquipIcon(x, y, s, item) {                       // procedural gear icon
    const ctx = this.ctx, cx = x + s / 2, cy = y + s / 2;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.roundRect(x, y, s, s, 8); ctx.fill();
    if (item.slot === "weapon") {
      ctx.lineCap = "round";
      ctx.strokeStyle = "#cfd6e6"; ctx.lineWidth = Math.max(3, s * 0.09);   // blade
      ctx.beginPath(); ctx.moveTo(cx - s * 0.2, cy + s * 0.24); ctx.lineTo(cx + s * 0.22, cy - s * 0.22); ctx.stroke();
      ctx.strokeStyle = "#d9a441"; ctx.lineWidth = Math.max(3, s * 0.07);   // crossguard
      ctx.beginPath(); ctx.moveTo(cx - s * 0.3, cy + s * 0.06); ctx.lineTo(cx - s * 0.06, cy + s * 0.3); ctx.stroke();
      ctx.strokeStyle = "#7a4a1e"; ctx.lineWidth = Math.max(3, s * 0.08);   // hilt
      ctx.beginPath(); ctx.moveTo(cx - s * 0.22, cy + s * 0.18); ctx.lineTo(cx - s * 0.32, cy + s * 0.28); ctx.stroke();
    } else {
      ctx.fillStyle = item.id === "leather_tunic" ? "#9a6a32" : "#5a6b8a";  // tunic
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.22, cy - s * 0.22); ctx.lineTo(cx + s * 0.22, cy - s * 0.22);
      ctx.lineTo(cx + s * 0.3, cy + s * 0.26); ctx.lineTo(cx - s * 0.3, cy + s * 0.26);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath();                    // collar notch
      ctx.moveTo(cx - s * 0.09, cy - s * 0.22); ctx.lineTo(cx + s * 0.09, cy - s * 0.22); ctx.lineTo(cx, cy - s * 0.05);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  drawEquipScreen() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx, p = this.player, ui = this.ui;
    const L = this.equipLayout();
    this.drawWindow(L.x, L.y, L.w, L.h);
    this.text("EQUIPMENT", L.x + 28, L.y + 44, { size: 24, bold: true, color: "#ffe9a0" });
    this.text("ATK " + this.atkTotal() + "    DEF " + this.defTotal(), L.x + L.w - 28, L.y + 44, { size: 19, align: "right", color: "#9fd8ff" });
    this.text("Drag gear into its slot.  Drag a slot out to remove.", L.x + 28, L.y + 76, { size: 14, color: "#cfd6ff" });

    // owned gear list
    for (const r of L.rows) {
      const it = r.item, worn = p.equip[it.slot] === it.id;
      ctx.globalAlpha = (ui.drag && ui.drag.id === it.id && ui.drag.from === "list") ? 0.35 : 1;
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 6); ctx.fill();
      this.drawEquipIcon(r.x + 6, r.y + 5, 44, it);
      this.text(it.name, r.x + 62, r.y + 24, { size: 18, bold: true, color: "#eef1ff" });
      const bonus = it.atk ? "+" + it.atk + " ATK" : "+" + it.def + " DEF";
      this.text(EQUIP_SLOTLABEL[it.slot] + "   ·   " + bonus, r.x + 62, r.y + 44, { size: 14, color: "#bcd0f0" });
      if (worn) this.text("equipped", r.x + r.w - 14, r.y + 28, { size: 13, align: "right", color: "#9cf0a0" });
      ctx.globalAlpha = 1;
    }
    if (!L.rows.length) this.text("(no gear)", L.listX, L.listY + 20, { size: 18, color: "#9aa" });

    // slots
    this.text("WORN", L.slotX, L.slotY - 16, { size: 15, color: "#9fb0e8" });
    for (const s of L.slots) {
      const hover = ui.hover === s.slot && ui.drag && EQUIP_BY_ID[ui.drag.id].slot === s.slot;
      ctx.fillStyle = hover ? "rgba(120,150,230,0.4)" : "rgba(0,0,0,0.35)";
      ctx.strokeStyle = "rgba(220,228,255,0.7)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(s.x, s.y, s.w, s.h, 8); ctx.fill(); ctx.stroke();
      this.text(EQUIP_SLOTLABEL[s.slot], s.x + s.w + 18, s.y + 26, { size: 16, bold: true, color: "#dfe4ff" });
      const id = p.equip[s.slot];
      if (id && !(ui.drag && ui.drag.from === "slot" && ui.drag.slot === s.slot)) {
        this.drawEquipIcon(s.x + (s.w - 56) / 2, s.y + (s.h - 56) / 2, 56, EQUIP_BY_ID[id]);
        this.text(EQUIP_BY_ID[id].name, s.x + s.w + 18, s.y + 50, { size: 14, color: "#9cf0a0" });
      } else {
        this.text("(empty)", s.x + s.w + 18, s.y + 50, { size: 14, color: "#8890b0" });
      }
    }

    if (ui.drag) this.drawEquipIcon(ui.drag.mx - 28, ui.drag.my - 28, 56, EQUIP_BY_ID[ui.drag.id]);
    this.text("ESC  back", W / 2, H - 32, { align: "center", size: 15, color: "rgba(230,235,255,0.7)" });
  }

  drawMainMenu() {
    const W = this.cv.width, p = this.player;
    // command list (top-right)
    const cw = 200, cx = W - cw - 24, cy = 24, rh = 38;
    this.drawWindow(cx, cy, cw, 24 + MAIN_MENU.length * rh);
    MAIN_MENU.forEach((o, i) => {
      const y = cy + 34 + i * rh, sel = i === this.ui.sel;
      if (sel) this.cursor(cx + 20, y - 6);
      this.text(o, cx + 40, y, { size: 20, color: sel ? "#ffe9a0" : "#dfe4ff", bold: sel });
    });
    // party member card (left)
    const px = 24, py = 24, pw = W - cw - 24 - px - 20, ph = 150;
    this.drawWindow(px, py, pw, ph);
    this.drawPortrait(px + 16, py + 14, ph - 28);
    const ix = px + 16 + (ph - 28) * (this.art.portrait.width / this.art.portrait.height) + 22;
    this.text(p.name, ix, py + 44, { size: 24, bold: true, color: "#ffe9a0" });
    this.text("LV " + p.lv + "  " + p.job, ix, py + 70, { size: 16, color: "#cfd6ff" });
    this.text("HP", ix, py + 100, { size: 15, color: "#bfe8c0" });
    this.text(p.hp + " / " + p.maxhp, ix + 150, py + 100, { size: 15, align: "right", color: "#eef" });
    this.bar(ix, py + 106, 150, 8, p.hp / p.maxhp, "#5cd06a");
    this.text("MP", ix, py + 128, { size: 15, color: "#bcd0f0" });
    this.text(p.mp + " / " + p.maxmp, ix + 150, py + 128, { size: 15, align: "right", color: "#eef" });
    this.bar(ix, py + 134, 150, 8, p.mp / p.maxmp, "#5aa6f0");
    // gold + hint (bottom-left)
    this.drawWindow(px, py + ph + 14, 220, 50);
    this.text("Gold", px + 18, py + ph + 45, { size: 17, color: "#cfd6ff" });
    this.text(p.gold + " GOLD", px + 202, py + ph + 45, { size: 17, align: "right", color: "#ffe9a0" });
    this.text("↑↓ select   ENTER choose   ESC close", this.cv.width / 2, this.cv.height - 22,
      { align: "center", size: 14, color: "rgba(230,235,255,0.7)" });
  }

  drawStatusScreen() {
    const W = this.cv.width, H = this.cv.height, p = this.player;
    const x = 40, y = 36, w = W - 80, h = H - 110;
    this.drawWindow(x, y, w, h);
    this.drawPortrait(x + 30, y + 30, h - 90);
    const colX = x + 30 + (h - 90) * (this.art.portrait.width / this.art.portrait.height) + 40;
    this.text(p.name, colX, y + 56, { size: 30, bold: true, color: "#ffe9a0" });
    this.text(p.job + "   ·   Level " + p.lv, colX, y + 86, { size: 18, color: "#cfd6ff" });

    const rows = [
      ["HP", p.hp + " / " + p.maxhp, p.hp / p.maxhp, "#5cd06a"],
      ["MP", p.mp + " / " + p.maxmp, p.mp / p.maxmp, "#5aa6f0"],
      ["EXP", p.exp + " / " + p.expNext, p.exp / p.expNext, "#e7c84e"],
    ];
    rows.forEach((r, i) => {
      const ry = y + 130 + i * 46;
      this.text(r[0], colX, ry, { size: 18, color: "#dfe4ff" });
      this.text(r[1], colX + 260, ry, { size: 18, align: "right", color: "#eef" });
      this.bar(colX, ry + 8, 260, 10, r[2], r[3]);
    });
    const ab = this.equipBonus("atk"), db = this.equipBonus("def");
    const stats = [
      ["Attack", this.atkTotal() + (ab ? "  (" + p.atk + " +" + ab + ")" : "")],
      ["Defense", this.defTotal() + (db ? "  (" + p.def + " +" + db + ")" : "")],
      ["Gold", p.gold + " GOLD"],
    ];
    stats.forEach(([k, v], i) => {
      const ry = y + 286 + i * 34;
      this.text(k, colX, ry, { size: 18, color: "#cfd6ff" });
      this.text("" + v, colX + 260, ry, { size: 18, align: "right", color: "#ffe9a0" });
    });
    this.text("ESC  back", W / 2, H - 36, { align: "center", size: 15, color: "rgba(230,235,255,0.7)" });
  }

  drawItemsScreen() {
    const W = this.cv.width, H = this.cv.height;
    const x = 40, y = 36, w = W - 80, h = H - 110;
    this.drawWindow(x, y, w, h);
    this.text("ITEMS", x + 28, y + 44, { size: 24, bold: true, color: "#ffe9a0" });
    const listY = y + 70, rh = 40;
    this.items.forEach((it, i) => {
      const ry = listY + i * rh, sel = i === this.ui.sel;
      if (sel) this.cursor(x + 34, ry - 6);
      this.text(it.name, x + 54, ry, { size: 19, color: sel ? "#ffe9a0" : "#e4e8ff", bold: sel });
      this.text(": " + it.qty, x + 300, ry, { size: 19, align: "right", color: "#cfd6ff" });
    });
    if (!this.items.length) this.text("(empty)", x + 54, listY, { size: 18, color: "#9aa" });
    // description strip
    const dY = y + h - 60;
    this.ctx.strokeStyle = "rgba(120,140,210,0.5)"; this.ctx.lineWidth = 1;
    this.ctx.beginPath(); this.ctx.moveTo(x + 20, dY - 14); this.ctx.lineTo(x + w - 20, dY - 14); this.ctx.stroke();
    const cur = this.items[this.ui.sel];
    if (cur) this.text(cur.desc, x + 28, dY + 12, { size: 17, color: "#dfe4ff" });
    this.text("↑↓ select   ESC back", W / 2, H - 36, { align: "center", size: 15, color: "rgba(230,235,255,0.7)" });
  }

  drawPortrait(x, y, h) {
    const img = this.art.portrait, w = h * (img.width / img.height), ctx = this.ctx;
    ctx.save();                                     // framed portrait with a dark backing
    ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = "rgba(220,228,255,0.7)"; ctx.lineWidth = 2; ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  }

  /* ----------------------------- dialogue box ---------------------------- */
  drawDialogue() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx, d = this.dialogue;
    const lines = d.lines[d.page] || [];
    const bx = 40, bw = W - 80, bh = 150, by = H - bh - 30;
    this.drawWindow(bx, by, bw, bh);
    // portrait thumbnail on the left
    const ph = bh - 36;
    this.drawPortrait(bx + 18, by + 18, ph);
    const tx = bx + 18 + ph * (this.art.portrait.width / this.art.portrait.height) + 26;
    // name plate
    if (d.name) {
      this.drawWindow(bx + 16, by - 22, 150, 38);
      this.text(d.name, bx + 36, by + 3, { size: 18, bold: true, color: "#ffe9a0" });
    }
    lines.forEach((ln, i) => this.text(ln, tx, by + 44 + i * 32, { size: 20, color: "#eef1ff" }));
    // blinking advance ▼
    if (0.5 + 0.5 * Math.sin(this.t / 150) > 0.5) {
      ctx.fillStyle = "#ffe9a0";
      const ax = bx + bw - 30, ay = by + bh - 22;
      ctx.beginPath(); ctx.moveTo(ax - 7, ay); ctx.lineTo(ax + 7, ay); ctx.lineTo(ax, ay + 8); ctx.closePath(); ctx.fill();
    }
  }

  /* ----------------------------- name entry ------------------------------ */
  renderName() {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height, t = this.t / 1000;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1a1340"); g.addColorStop(1, "#3a2550");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const bw = Math.min(560, W - 80), bh = 280, bx = (W - bw) / 2, by = (H - bh) / 2;
    this.drawWindow(bx, by, bw, bh);
    this.drawPortrait(bx + 28, by + 28, bh - 56);
    const colX = bx + 28 + (bh - 56) * (this.art.portrait.width / this.art.portrait.height) + 30;
    this.text("NAME THE WANDERER", colX, by + 56, { size: 24, bold: true, color: "#ffe9a0" });

    // name field
    const fy = by + 92, fw = bw - (colX - bx) - 36;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.strokeStyle = "rgba(220,228,255,0.7)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(colX, fy, fw, 48, 6); ctx.fill(); ctx.stroke();
    const caret = Math.sin(t * 5) > 0 ? "|" : " ";
    this.text(this.nameBuf + caret, colX + 16, fy + 33, { size: 26, color: "#fff" });

    this.text("Type a name (letters & numbers).", colX, by + 178, { size: 15, color: "#cfd6ff" });
    this.text("BACKSPACE  delete", colX, by + 204, { size: 15, color: "#cfd6ff" });
    this.text("ENTER  begin the journey", colX, by + 230, { size: 16, color: "#ffe9a0" });
  }

  /* --------------------------- whirl transition -------------------------- */
  renderWhirl() {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height;
    const p = Math.min(1, this.encounter.t / 850);
    ctx.fillStyle = "#080c16"; ctx.fillRect(0, 0, W, H);
    if (this.snapshot) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(p * Math.PI * 5);
      const s = 1 + p * 1.4; ctx.scale(s, s);
      ctx.globalAlpha = Math.max(0, 1 - p * 0.55);
      ctx.drawImage(this.snapshot, -W / 2, -H / 2);
      ctx.restore();
    }
    const fl = Math.abs(Math.sin(p * Math.PI * 7)) * p;        // strobe
    ctx.fillStyle = `rgba(255,255,255,${0.55 * fl})`; ctx.fillRect(0, 0, W, H);
    if (p > 0.74) { ctx.fillStyle = `rgba(8,12,22,${(p - 0.74) / 0.26})`; ctx.fillRect(0, 0, W, H); }
  }

  /* ------------------------------- battle -------------------------------- */
  enterBattle(target) {
    this.state = "battle"; this.fade = 0;
    this.battle = {
      target,
      enemy: { name: "Lizard", hp: 26, maxhp: 26, atk: 8, def: 3, hurtT: 0, dead: false, deathT: 0 },
      cmds: ["Attack", "Skill", "Defend", "Item", "Run"], sel: 0,
      phase: "intro", step: "", timer: 1100, msg: "A wild Lizard lunges from the grass!",
      heroLunge: 0, eLunge: 0, heroHurt: 0, defending: false, shieldBuff: false,
      floats: [], animT: 0, fx: null, sub: null,
    };
  }
  battleMsg(s) { this.battle.msg = s; }
  calcDmg(atk, def) { return Math.max(1, atk - def + (Math.floor(Math.random() * 4) - 1)); }
  equipBonus(stat) {                                  // summed bonus from worn gear
    let s = 0;
    for (const slot of EQUIP_SLOTS) { const id = this.player.equip[slot]; if (id) s += EQUIP_BY_ID[id][stat] || 0; }
    return s;
  }
  atkTotal() { return this.player.atk + this.equipBonus("atk"); }
  defTotal() { return this.player.def + this.equipBonus("def"); }
  addFloat(who, val, color) { this.battle.floats.push({ who, text: "" + val, color, t: 900 }); }
  grantRewards() {
    const p = this.player, fromLv = p.lv, exp = 30, gold = 40;
    p.exp += exp; p.gold += gold;
    const gains = { hp: 0, mp: 0, atk: 0, def: 0 }, newSkills = [];
    while (p.exp >= p.expNext) {                     // possibly several levels
      p.exp -= p.expNext; p.lv++; p.expNext += 12;
      p.maxhp += 6; p.maxmp += 2; p.atk += 2; p.def += 1;
      gains.hp += 6; gains.mp += 2; gains.atk += 2; gains.def += 1;
    }
    const leveled = p.lv > fromLv;
    if (leveled) {
      p.hp = p.maxhp; p.mp = p.maxmp;
      for (const s of SKILLS) if (s.unlock > fromLv && s.unlock <= p.lv) newSkills.push(s.name);
    }
    this.battle.reward = { exp, gold, leveled, gains, newSkills, fromLv, toLv: p.lv };
  }
  afterHeroAction() {
    const b = this.battle;
    if (b.enemy.hp <= 0) { b.phase = "enemy_die"; b.timer = 1300; b.enemy.dead = true; b.enemy.deathT = 0; this.battleMsg("The Lizard collapses!"); }
    else { b.phase = "enemy_pre"; b.timer = 600; }
  }
  endBattle(result) {
    const tgt = this.battle && this.battle.target;
    this.battle = null; this.encounterCD = 1700;
    if (result === "lose") {                          // game over -> revive, back to title
      this.player.hp = this.player.maxhp; this.player.y = this.world.spawn.ty * TILE;
      this.introShown = true; this.beginTransition("title");
      return;
    }
    if (result === "win" && tgt) tgt.alive = false;   // slain
    this.player.y += TILE * 3;                        // step back from where it stood
    this.beginTransition("overworld");
  }

  battleKey(key) {
    const b = this.battle; if (!b) return;
    const enter = key === "enter" || key === " ";
    if (b.phase === "victory") { if (enter) (b.reward.leveled ? (b.phase = "levelup", b.levelT = 0) : this.endBattle("win")); return; }
    if (b.phase === "levelup") { if (enter) this.endBattle("win"); return; }
    if (b.phase === "lose") { if (enter) this.endBattle("lose"); return; }

    if (b.phase === "submenu") {
      const list = b.sub.list, n = list.length;
      if (key === "escape") { b.phase = "menu"; b.sub = null; }
      else if (key === "arrowup" || key === "w") b.sub.sel = (b.sub.sel + n - 1) % n;
      else if (key === "arrowdown" || key === "s") b.sub.sel = (b.sub.sel + 1) % n;
      else if (enter) this.confirmSub();
      return;
    }
    if (b.phase !== "menu") return;
    const n = b.cmds.length;
    if (key === "arrowup" || key === "w") b.sel = (b.sel + n - 1) % n;
    else if (key === "arrowdown" || key === "s") b.sel = (b.sel + 1) % n;
    else if (enter) this.chooseCommand(b.cmds[b.sel]);
  }

  chooseCommand(cmd) {
    const b = this.battle; b.defending = false;
    if (cmd === "Attack") { b.phase = "hero_attack"; b.step = "lunge"; b.timer = 260; b.heroLunge = 0; }
    else if (cmd === "Defend") { b.defending = true; this.battleMsg(this.player.name + " takes a guarded stance."); b.phase = "enemy_pre"; b.timer = 650; }
    else if (cmd === "Skill") {
      const eq = this.player.skills.filter(Boolean);
      if (!eq.length) { this.battleMsg("No skills equipped! (set them in Skills)"); return; }
      b.phase = "submenu"; b.sub = { type: "skill", sel: 0, list: eq };
    }
    else if (cmd === "Item") {
      const list = this.items.filter(i => i.qty > 0 && (i.name === "Potion" || i.name === "Bread"));
      if (!list.length) { this.battleMsg("No usable items!"); return; }
      b.phase = "submenu"; b.sub = { type: "item", sel: 0, list };
    }
    else if (cmd === "Run") {
      if (Math.random() < 0.6) { this.battleMsg("Got away safely!"); b.phase = "flee"; b.timer = 900; }
      else { this.battleMsg("Couldn't escape!"); b.phase = "enemy_pre"; b.timer = 750; }
    }
  }

  confirmSub() {
    const b = this.battle, p = this.player;
    if (b.sub.type === "item") {
      const it = b.sub.list[b.sub.sel];
      const amt = it.name === "Potion" ? 25 : 8;
      it.qty--; const heal = Math.min(amt, p.maxhp - p.hp); p.hp += heal;
      this.addFloat("hero", "+" + heal, "#9cf0a0");
      this.battleMsg(p.name + " uses " + it.name + ". +" + heal + " HP");
      b.sub = null; b.phase = "enemy_pre"; b.timer = 700;
      return;
    }
    // skill
    const sk = SKILL_BY_ID[b.sub.list[b.sub.sel]];
    if (p.mp < sk.mp) { this.battleMsg("Not enough MP for " + sk.name + "!"); return; }
    p.mp -= sk.mp; b.sub = null; b.skill = sk;
    if (sk.kind === "heal") {
      const heal = Math.min(sk.power, p.maxhp - p.hp); p.hp += heal;
      this.addFloat("hero", "+" + heal, "#9cf0a0");
      this.battleMsg(p.name + " casts Healing. +" + heal + " HP");
      b.phase = "enemy_pre"; b.timer = 750;
    } else if (sk.kind === "shield") {
      b.shieldBuff = true; this.battleMsg(p.name + " raises the Blue Shield!");
      b.phase = "enemy_pre"; b.timer = 750;
    } else { // fire / bolt damage skill
      b.phase = "hero_skill"; b.step = "cast"; b.timer = 520; b.heroLunge = 0;
      b.fx = { kind: sk.kind, t: 0 };
      this.battleMsg(p.name + " unleashes " + sk.name + "!");
    }
  }

  updateBattle(dt) {
    const b = this.battle; if (!b) return;
    b.animT += dt; b.timer -= dt;
    if (b.enemy.hurtT > 0) b.enemy.hurtT -= dt;
    if (b.heroHurt > 0) b.heroHurt -= dt;
    if (b.fx) b.fx.t += dt;
    if (b.phase === "victory") b.victoryT = (b.victoryT || 0) + dt;
    if (b.phase === "levelup") b.levelT = (b.levelT || 0) + dt;
    for (const f of b.floats) f.t -= dt;
    b.floats = b.floats.filter(f => f.t > 0);

    switch (b.phase) {
      case "intro": if (b.timer <= 0) { b.phase = "menu"; b.msg = ""; } break;
      case "hero_attack":
        if (b.step === "lunge") {
          b.heroLunge = Math.min(1, 1 - b.timer / 260);
          if (b.timer <= 0) {
            const dmg = this.calcDmg(this.atkTotal(), b.enemy.def);
            b.enemy.hp = Math.max(0, b.enemy.hp - dmg); b.enemy.hurtT = 380;
            this.addFloat("enemy", dmg, "#ffffff");
            this.battleMsg(this.player.name + " strikes for " + dmg + "!");
            b.step = "return"; b.timer = 420;
          }
        } else {
          b.heroLunge = Math.max(0, b.timer / 420);
          if (b.timer <= 0) this.afterHeroAction();
        }
        break;
      case "hero_skill":
        if (b.step === "cast") {
          if (b.timer <= 0) {
            const sk = b.skill;
            const base = this.atkTotal() * sk.power + (sk.kind === "bolt" ? 10 : 6);
            const dmg = Math.max(1, Math.round(base) - b.enemy.def + (Math.floor(Math.random() * 5) - 2));
            b.enemy.hp = Math.max(0, b.enemy.hp - dmg); b.enemy.hurtT = 420;
            this.addFloat("enemy", dmg, sk.kind === "fire" ? "#ffb24a" : "#9fd8ff");
            this.battleMsg(sk.name + " hits for " + dmg + "!");
            b.step = "impact"; b.timer = 520;
          }
        } else if (b.timer <= 0) { b.fx = null; this.afterHeroAction(); }
        break;
      case "enemy_pre":
        if (b.timer <= 0) { b.phase = "enemy_attack"; b.step = "lunge"; b.timer = 300; b.eLunge = 0; this.battleMsg("The Lizard attacks!"); }
        break;
      case "enemy_attack":
        if (b.step === "lunge") {
          b.eLunge = Math.min(1, 1 - b.timer / 300);
          if (b.timer <= 0) {
            let dmg = this.calcDmg(b.enemy.atk, this.defTotal());
            if (b.shieldBuff) dmg = Math.max(1, Math.floor(dmg * 0.3));
            else if (b.defending) dmg = Math.max(1, Math.floor(dmg / 2));
            b.shieldBuff = false;
            this.player.hp = Math.max(0, this.player.hp - dmg); b.heroHurt = 400;
            this.addFloat("hero", dmg, "#ff8a8a");
            this.battleMsg(this.player.name + " takes " + dmg + " damage!");
            b.step = "return"; b.timer = 420;
          }
        } else {
          b.eLunge = Math.max(0, b.timer / 420);
          if (b.timer <= 0) {
            if (this.player.hp <= 0) { b.phase = "lose"; b.msg = this.player.name + " has fallen...  (ENTER)"; }
            else { b.phase = "menu"; b.msg = ""; }
          }
        }
        break;
      case "enemy_die":
        b.enemy.deathT += dt;
        if (b.timer <= 0) { this.grantRewards(); b.phase = "victory"; b.victoryT = 0; b.msg = ""; }
        break;
      case "flee": if (b.timer <= 0) this.endBattle("flee"); break;
    }
  }

  drawBattleSprite(img, cx, baseY, targetH, flip) {
    const ctx = this.ctx, w = targetH * (img.width / img.height);
    ctx.save();
    if (flip) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
    ctx.drawImage(img, cx - w / 2, baseY - targetH, w, targetH);
    ctx.restore();
  }

  renderBattle() {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height, b = this.battle, p = this.player, art = this.art;

    // --- backdrop: forest dusk + grassy battlefield ---
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
    sky.addColorStop(0, "#16241d"); sky.addColorStop(0.6, "#274a32"); sky.addColorStop(1, "#3f6e44");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H * 0.62);
    const gnd = ctx.createLinearGradient(0, H * 0.55, 0, H);
    gnd.addColorStop(0, "#3c6438"); gnd.addColorStop(1, "#24401f");
    ctx.fillStyle = gnd; ctx.fillRect(0, H * 0.55, W, H * 0.45);
    // distant tree-line silhouette
    ctx.fillStyle = "rgba(15,30,18,0.55)";
    ctx.beginPath(); ctx.moveTo(0, H * 0.55);
    for (let x = 0; x <= W; x += 24) ctx.lineTo(x, H * 0.50 + Math.sin(x / 60) * 12 + Math.sin(x / 23) * 6);
    ctx.lineTo(W, H * 0.55); ctx.closePath(); ctx.fill();

    const exX = W * 0.27, eBaseY = H * 0.64;
    const hxX = W * 0.74, hBaseY = H * 0.66;

    // platform shadows
    const platShadow = (cx, by, rx) => {
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath();
      ctx.ellipse(cx, by, rx, rx * 0.3, 0, 0, 7); ctx.fill();
    };

    // --- enemy (lizard), faces right toward the hero ---
    if (b.phase !== "victory" && b.phase !== "levelup") {
      let grp = "liz_idle", fr = 0, eOff = 0, jitter = 0;
      if (b.enemy.dead) { grp = "liz_death"; fr = Math.min(3, (b.enemy.deathT / (1000 / 5)) | 0); }
      else if (b.enemy.hurtT > 0) { grp = "liz_hurt"; fr = Math.min(2, ((380 - b.enemy.hurtT) / (380 / 3)) | 0); jitter = (Math.random() - 0.5) * 6; }
      else if (b.phase === "enemy_attack") { grp = "liz_attack"; fr = Math.min(3, (b.eLunge * 4) | 0); eOff = b.eLunge * 80; }
      else { grp = "liz_idle"; fr = ((b.animT / 180) | 0) % LIZ_ANIMS.liz_idle; }
      const eAlpha = b.enemy.dead ? Math.max(0, 1 - b.enemy.deathT / 1300) : 1;
      platShadow(exX, eBaseY + 4, 70);
      ctx.globalAlpha = eAlpha;
      this.drawBattleSprite(art[`${grp}_${fr}`], exX + eOff + jitter, eBaseY, H * 0.30, true);
      ctx.globalAlpha = 1;
    }

    // --- hero, faces left toward the enemy ---
    let hOff = 0, hjit = 0;
    if (b.phase === "hero_attack") hOff = -b.heroLunge * 90;
    if (b.heroHurt > 0) hjit = (Math.random() - 0.5) * 7;
    const casting = b.phase === "hero_skill";
    const hFrame = (b.phase === "hero_attack" && b.step === "lunge") || casting ? art.walk_2 : art.idle;
    if (b.phase !== "victory" && b.phase !== "levelup") {
      platShadow(hxX, hBaseY + 4, 46);
      this.drawBattleSprite(hFrame, hxX + hOff + hjit, hBaseY, H * 0.26, false);
    }

    // --- skill FX over the enemy ---
    if (b.fx) {
      const fxX = exX, fxY = eBaseY - H * 0.13, prog = Math.min(1, b.fx.t / 900);
      if (b.fx.kind === "fire") {
        const r = 28 + prog * 90;
        const g = ctx.createRadialGradient(fxX, fxY, 0, fxX, fxY, r);
        g.addColorStop(0, `rgba(255,244,190,${0.9 * (1 - prog)})`);
        g.addColorStop(0.5, `rgba(255,140,40,${0.7 * (1 - prog)})`);
        g.addColorStop(1, "rgba(255,80,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fxX, fxY, r, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = `rgba(180,220,255,${0.35 * (1 - prog)})`; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = `rgba(170,220,255,${1 - prog})`; ctx.lineWidth = 6; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(fxX, 0);
        for (let yy = 0; yy < eBaseY - 16; yy += 26) ctx.lineTo(fxX + (Math.random() - 0.5) * 44, yy);
        ctx.stroke();
      }
    }

    // --- floating damage numbers ---
    ctx.textAlign = "center";
    for (const f of b.floats) {
      const rise = (900 - f.t) * 0.06;
      const fx = f.who === "enemy" ? exX : hxX, fy = (f.who === "enemy" ? eBaseY : hBaseY) - H * 0.22 - rise;
      ctx.globalAlpha = Math.min(1, f.t / 300);
      this.text(f.text, fx, fy, { align: "center", size: 30, bold: true, color: f.color });
      ctx.globalAlpha = 1;
    }

    // --- message bar (top) ---
    if (b.msg) {
      this.drawWindow(40, 24, W - 80, 56);
      this.text(b.msg, W / 2, 60, { align: "center", size: 20, color: "#eef1ff" });
    }

    // --- status window (bottom-left) ---
    const sy = H - 150, sh = 126, sw = 320, sr = 40 + sw - 16;
    this.drawWindow(40, sy, sw, sh);
    this.text(p.name, 64, sy + 34, { size: 20, bold: true, color: "#ffe9a0" });
    this.text("LV " + p.lv, sr, sy + 34, { size: 16, align: "right", color: "#cfd6ff" });
    this.text("HP", 64, sy + 66, { size: 15, color: "#bfe8c0" });
    this.text(p.hp + " / " + p.maxhp, sr, sy + 66, { size: 15, align: "right", color: "#eef" });
    this.bar(96, sy + 74, sw - 120, 9, p.hp / p.maxhp, "#5cd06a");
    this.text("MP", 64, sy + 104, { size: 15, color: "#bcd0f0" });
    this.text(p.mp + " / " + p.maxmp, sr, sy + 104, { size: 15, align: "right", color: "#eef" });
    this.bar(96, sy + 112, sw - 120, 9, p.mp / p.maxmp, "#5aa6f0");

    // --- bottom-right panel: command list / submenu (the rest are overlays) ---
    if (b.phase === "menu") {
      const cw = 220, cx = W - cw - 40, rh = 22, cyy = H - 150;
      this.drawWindow(cx, cyy, cw, 126);
      b.cmds.forEach((c, i) => {
        const yy = cyy + 30 + i * rh, sel = i === b.sel;
        if (sel) this.cursor(cx + 22, yy - 6);
        this.text(c, cx + 42, yy, { size: 17, color: sel ? "#ffe9a0" : "#dfe4ff", bold: sel });
      });
    } else if (b.phase === "submenu") this.drawBattleSub();
    else if (b.phase === "victory") this.drawVictory();
    else if (b.phase === "levelup") this.drawLevelUp();
    else if (b.phase === "lose") this.drawLose();
  }

  drawBattleSub() {
    const W = this.cv.width, H = this.cv.height, b = this.battle, sub = b.sub;
    const cw = 320, cx = W - cw - 40, cyy = H - 150;
    this.drawWindow(cx, cyy, cw, 126);
    this.text(sub.type === "skill" ? "SKILLS" : "ITEMS", cx + 20, cyy + 24, { size: 14, color: "#9fb0e8" });
    sub.list.forEach((entry, i) => {
      const yy = cyy + 50 + i * 23, sel = i === sub.sel;
      if (sel) this.cursor(cx + 22, yy - 6);
      if (sub.type === "skill") {
        const sk = SKILL_BY_ID[entry], can = this.player.mp >= sk.mp;
        this.text(sk.name, cx + 42, yy, { size: 17, color: sel ? "#ffe9a0" : (can ? "#dfe4ff" : "#8890b0"), bold: sel });
        this.text(sk.mp + " MP", cx + cw - 18, yy, { size: 14, align: "right", color: can ? "#9fd8ff" : "#8890b0" });
      } else {
        this.text(entry.name, cx + 42, yy, { size: 17, color: sel ? "#ffe9a0" : "#dfe4ff", bold: sel });
        this.text("x" + entry.qty, cx + cw - 18, yy, { size: 14, align: "right", color: "#cfd6ff" });
      }
    });
    this.text("ESC  back", cx + cw - 18, cyy + 118, { size: 13, align: "right", color: "rgba(220,228,255,.6)" });
  }

  drawVictory() {
    const W = this.cv.width, H = this.cv.height, r = this.battle.reward;
    const pulse = 0.5 + 0.5 * Math.sin(this.t / 180);
    const bw = 460, bh = 196, bx = (W - bw) / 2, by = H * 0.30;
    this.drawWindow(bx, by, bw, bh);
    this.text("VICTORY!", W / 2, by + 56, { align: "center", size: 42, bold: true, color: `rgb(255,${(200 + 40 * pulse) | 0},120)` });
    this.text("EXP gained", bx + 44, by + 108, { size: 20, color: "#dfe4ff" });
    this.text("+ " + r.exp, bx + bw - 44, by + 108, { align: "right", size: 20, color: "#ffe9a0" });
    this.text("Gold gained", bx + 44, by + 142, { size: 20, color: "#dfe4ff" });
    this.text("+ " + r.gold + " GOLD", bx + bw - 44, by + 142, { align: "right", size: 20, color: "#ffe9a0" });
    this.text("Press ENTER", W / 2, by + bh - 14, { align: "center", size: 14, color: "rgba(230,235,255,.7)" });
  }

  drawLevelUp() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx, r = this.battle.reward, t = this.battle.levelT;
    const cx = W / 2, cy = H * 0.42, a = 0.28 + 0.18 * Math.sin(this.t / 140);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 340);
    glow.addColorStop(0, `rgba(255,230,150,${a})`); glow.addColorStop(1, "rgba(255,210,80,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) {                    // rising sparkles
      const sx = cx + Math.sin(i * 2.3 + this.t / 400) * (120 + i * 8);
      const sy = cy + 160 - ((this.t / 6 + i * 50) % 320);
      ctx.fillStyle = `rgba(255,240,180,${0.6})`; ctx.fillRect(sx | 0, sy | 0, 3, 3);
    }
    const bw = 440, bh = 308, bx = (W - bw) / 2, by = H * 0.18;
    this.drawWindow(bx, by, bw, bh);
    const pop = Math.min(1, t / 260);
    ctx.save(); ctx.translate(W / 2, by + 56); ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
    this.text("LEVEL  UP!", 0, 0, { align: "center", size: 40, bold: true, color: "#ffe9a0" });
    ctx.restore();
    this.text("LV " + r.fromLv + "   →   " + r.toLv, W / 2, by + 96, { align: "center", size: 24, color: "#fff" });
    const rows = [["Max HP", r.gains.hp], ["Max MP", r.gains.mp], ["Attack", r.gains.atk], ["Defense", r.gains.def]];
    rows.forEach(([k, v], i) => {
      if (t < 340 + i * 200) return;                  // cascade in
      const yy = by + 140 + i * 30;
      this.text(k, bx + 64, yy, { size: 18, color: "#cfd6ff" });
      this.text("+ " + v, bx + bw - 64, yy, { align: "right", size: 18, color: "#9cf0a0" });
    });
    if (r.newSkills.length && t > 340 + 4 * 200)
      this.text("Learned: " + r.newSkills.join(", "), W / 2, by + 270, { align: "center", size: 16, color: "#ffd479" });
    this.text("Press ENTER", W / 2, by + bh - 14, { align: "center", size: 14, color: "rgba(230,235,255,.7)" });
  }

  drawLose() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, W, H);
    this.text(this.player.name + " has fallen...", W / 2, H * 0.44, { align: "center", size: 30, bold: true, color: "#e8a0a0" });
    this.text("Press ENTER", W / 2, H * 0.44 + 40, { align: "center", size: 16, color: "rgba(230,235,255,.7)" });
  }

  loop(t) {
    const dt = Math.min(50, t - this.last); this.last = t;
    this.update(dt);
    this.render();
    requestAnimationFrame(tt => this.loop(tt));
  }
}

/* -------------------------------- bootstrap ------------------------------ */
loadAll(ASSETS).then(art => {
  document.getElementById("loader").remove();
  window.GAME = new Game(document.getElementById("game"), art);
}).catch(err => {
  document.getElementById("loader").textContent = "Asset load error: " + err.message;
  console.error(err);
});
