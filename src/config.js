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
const G_GRASS = 0, G_DIRT = 1, G_EDGE = 2, G_WOOD = 3, G_INN = 4;

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
  rusty_dagger: "assets/rusty_dagger.png",
  // Village of Koro tileset
  wood_floor: "assets/wood_floor.png",
  cliff: "assets/cliff.png",
  crate: "assets/crate.png",
  house_red: "assets/house_red.png",
  house_blue: "assets/house_blue.png",
  house_green: "assets/house_green.png",
  house_yellow: "assets/house_yellow.png",
  house_purple: "assets/house_purple.png",
  npc_keeper: "assets/npc_keeper.png",
  // Dragon Den Inn + ally + store loot
  sign: "assets/sign.png",
  inn_floor: "assets/inn_floor.png",
  table: "assets/table.png",
  patron_0: "assets/patron_0.png", patron_1: "assets/patron_1.png",
  patron_2: "assets/patron_2.png", patron_3: "assets/patron_3.png",
  ally_idle: "assets/ally_idle.png",
  ally_walk_0: "assets/ally_walk_0.png", ally_walk_1: "assets/ally_walk_1.png", ally_walk_2: "assets/ally_walk_2.png",
  ally_hurt: "assets/ally_hurt.png",
  ally_portrait: "assets/ally_portrait.png",
  iron_sword: "assets/iron_sword.png",
  steel_dagger: "assets/steel_dagger.png",
  knight_sword: "assets/knight_sword.png",
  chain_mail: "assets/chain_mail.png",
  plate_armor: "assets/plate_armor.png",
};
// enemy animation frame counts, keyed by sprite-group name
const LIZ_ANIMS   = { liz_idle: 3, liz_sleep: 3, liz_roar: 4, liz_attack: 4, liz_hurt: 3, liz_death: 4 };
const GOB_ANIMS   = { gob_idle: 4, gob_walk: 6, gob_attack: 6, gob_hurt: 3, gob_die: 4, gob_victory: 4 };
const TROLL_ANIMS = { troll_idle: 4, troll_walk: 6, troll_attack: 3, troll_hurt: 3, troll_death: 4 };
// Mercenary — sliced from the Thrust spritesheet (merc_thrust = the jab he attacks with)
const MERC_ANIMS  = { merc_idle: 8, merc_thrust: 8, merc_hurt: 4, merc_die: 6 };
// Gray Wolf — sliced from a 4x4 sheet (idle / charge / attack / hurt+dead)
const WOLF_ANIMS  = { wolf_idle: 4, wolf_charge: 4, wolf_attack: 4, wolf_hurt: 2, wolf_death: 2 };
const ANIM_FRAMES = { ...LIZ_ANIMS, ...GOB_ANIMS, ...TROLL_ANIMS, ...MERC_ANIMS, ...WOLF_ANIMS };  // group -> frame count
for (const [g, n] of Object.entries(ANIM_FRAMES))
  for (let i = 0; i < n; i++) ASSETS[`${g}_${i}`] = `assets/${g}_${i}.png`;
for (const s of ["skill_fire", "skill_shield", "skill_bolt", "skill_heal", "skill_ember", "skill_inferno", "skill_jolt", "skill_mend"]) ASSETS[s] = `assets/${s}.png`;
for (const s of ["diff_casual", "diff_normal", "diff_hard", "diff_hardcore"]) ASSETS[s] = `assets/${s}.png`;
ASSETS.you_died = "assets/you_died.png";

/* learnable skills (drag into slots; cost MP in battle) */
const SKILLS = [
  { id: "heal",   name: "Healing",        unlock: 3, mp: 2, icon: "skill_heal",   kind: "heal",   power: 32, desc: "Restore HP to the hero." },
  { id: "mend",   name: "Mend",           unlock: 2, mp: 1, icon: "skill_mend",   kind: "heal",   power: 18, desc: "Restore a little HP." },
  { id: "ember",  name: "Ember",          unlock: 2, mp: 3, icon: "skill_ember",  kind: "fire",   power: 1.2, desc: "A quick burst of flame." },
  { id: "fire",   name: "Flaming Sword",  unlock: 4, mp: 5, icon: "skill_fire",   kind: "fire",   power: 1.7, desc: "Fire damage to one foe." },
  { id: "inferno", name: "Inferno",       unlock: 8, mp: 9, icon: "skill_inferno", kind: "fire",  power: 2.6, desc: "A roaring blaze engulfs one foe." },
  { id: "jolt",   name: "Static Jolt",    unlock: 4, mp: 4, icon: "skill_jolt",   kind: "bolt",   power: 1.5, desc: "A crackling jolt of lightning." },
  { id: "bolt",   name: "Lightning Bolt", unlock: 9, mp: 8, icon: "skill_bolt",   kind: "bolt",   power: 2.3, desc: "Heavy lightning damage to one foe." },
  { id: "shield", name: "Blue Shield",    unlock: 6, mp: 4, icon: "skill_shield", kind: "shield", power: 0,   desc: "Sharply raise defense for a turn." },
];
const SKILL_BY_ID = Object.fromEntries(SKILLS.map(s => [s.id, s]));
const skillSlots = lv => Math.floor(lv / 3);

/* equippable gear — one item per slot may be worn; bonuses add to base stats */
const EQUIP = [
  { id: "wood_sword",   name: "Wood Sword",   slot: "weapon", atk: 3, def: 0, desc: "A sturdy practice blade. +3 Attack." },
  { id: "rusty_dagger", name: "Rusty Dagger", slot: "weapon", atk: 4, def: 0, sprite: "rusty_dagger", desc: "A pitted goblin blade. +4 Attack." },
  { id: "cloak",        name: "Cloak",        slot: "armor",  atk: 0, def: 2, desc: "A traveler's cloak. +2 Defense." },
  { id: "leather_tunic", name: "Leather Tunic", slot: "armor", atk: 0, def: 5, desc: "Boiled-leather armor. +5 Defense." },
  // --- Koro store stock ---
  { id: "iron_sword",   name: "Iron Sword",   slot: "weapon", atk: 6, def: 0, sprite: "iron_sword",   desc: "A keen soldier's blade. +6 Attack." },
  { id: "steel_dagger", name: "Steel Dagger", slot: "weapon", atk: 7, def: 0, sprite: "steel_dagger", desc: "A fast, vicious fang. +7 Attack." },
  { id: "knight_sword", name: "Knight Sword", slot: "weapon", atk: 9, def: 1, sprite: "knight_sword", desc: "A knight's longsword. +9 Attack, +1 Def." },
  { id: "chain_mail",   name: "Chain Mail",   slot: "armor",  atk: 0, def: 8, sprite: "chain_mail",   desc: "Interlocking steel rings. +8 Defense." },
  { id: "plate_armor",  name: "Plate Armor",  slot: "armor",  atk: 0, def: 12, sprite: "plate_armor", desc: "Heavy forged plate. +12 Defense." },
];
const EQUIP_BY_ID = Object.fromEntries(EQUIP.map(e => [e.id, e]));
const EQUIP_SLOTS = ["weapon", "armor"];
const EQUIP_SLOTLABEL = { weapon: "Weapon", armor: "Armor" };

/* enemy archetypes — overworld sprite + battle sprite/stat block.
 * ow.idle/alert: sprite groups used roaming (alert plays during the pre-battle
 * whirl). battle.{idle,attack,hurt,death}: groups used in the turn-based screen.
 * drop: gear that may fall on victory at the given rate. boss: can't be fought. */
const ENEMY_TYPES = {
  lizard: {
    name: "Lizard", hp: 26, atk: 8, def: 3, exp: 30, gold: 40,
    intro: "A wild Lizard lunges from the grass!",
    // hidden meter charges from damage dealt/taken; at full the enemy fires one of these two
    skillMeter: 20,
    skills: [
      { name: "Venom Bite", kind: "hit", power: 1.7 },
      { name: "Tail Sweep", kind: "double", power: 0.9 },
    ],
    ow: { idle: "liz_sleep", alert: "liz_roar", tiles: 2.1 },
    battle: { idle: "liz_idle", attack: "liz_attack", hurt: "liz_hurt", death: "liz_death", h: 0.30, flip: true },
  },
  goblin: {
    name: "Goblin", hp: 45, atk: 16, def: 4, exp: 41, gold: 50,
    intro: "A Goblin slashes at you!",
    drop: { id: "rusty_dagger", rate: 0.55 },
    skillMeter: 20,
    skills: [
      { name: "Frenzy", kind: "buff", buff: 1.35 },
      { name: "Savage Cleave", kind: "double", power: 1.0 },
    ],
    ow: { idle: "gob_idle", alert: "gob_attack", tiles: 1.6 },
    battle: { idle: "gob_idle", attack: "gob_attack", hurt: "gob_hurt", death: "gob_die", h: 0.26, flip: false },
  },
  wolf: {
    name: "Gray Wolf", hp: 190, atk: 20, def: 7, exp: 36, gold: 38,
    intro: "A Gray Wolf bares its fangs and lunges!",
    skillMeter: 18,            // aggressive — charges its skill fast
    skills: [
      { name: "Lunging Bite", kind: "hit", power: 1.7 },
      { name: "Savage Rend", kind: "double", power: 0.85 },
    ],
    ow: { idle: "wolf_idle", alert: "wolf_charge", tiles: 2.9 },   // canvas is padded wide; scale up to keep size
    battle: { idle: "wolf_idle", attack: "wolf_attack", hurt: "wolf_hurt", death: "wolf_death", h: 0.182, flip: false },
  },
  troll: {
    name: "Troll", hp: 200, atk: 22, def: 12, exp: 150, gold: 90, boss: true,
    intro: "The Troll swipes at you!",
    skillMeter: 35,
    skills: [
      { name: "Boulder Throw", kind: "hit", power: 1.7 },
      { name: "Enrage", kind: "buff", buff: 1.2 },
    ],
    ow: { idle: "troll_idle", alert: "troll_attack", tiles: 3.1 },
    battle: { idle: "troll_idle", attack: "troll_attack", hurt: "troll_hurt", death: "troll_death", h: 0.44, flip: false },
  },
  mercenary: {
    name: "Mercenary", hp: 92, atk: 18, def: 7, exp: 64, gold: 85,
    intro: "A mercenary comes at you, blade leveled!",
    skillMeter: 22,
    // both the basic Attack and these skills play the THRUST animation (battle.attack)
    skills: [
      { name: "Cutthroat Thrust", kind: "hit", power: 1.9 },
      { name: "Twin Fang", kind: "double", power: 1.95 },
    ],
    ow: { idle: "merc_idle", alert: "merc_thrust", tiles: 2.0 },
    battle: { idle: "merc_idle", attack: "merc_thrust", hurt: "merc_hurt", death: "merc_die", h: 0.34, flip: false },
  },
};

/* Koro storefronts — each shopkeeper NPC opens one of these.
 * wares: { type:'equip'|'skill', id, price }. Skills bought here unlock early. */
const SHOPS = {
  def: {
    title: "Defense Store", keeper: "BORIN",
    greeting: ["Steel between you and the grave,", "friend. Best armor in Koro."],
    wares: [
      { type: "equip", id: "chain_mail",  price: 220 },
      { type: "equip", id: "plate_armor", price: 480 },
    ],
  },
  off: {
    title: "Offense Store", keeper: "DRELL",
    greeting: ["Swords, daggers, edges that bite.", "What'll cut for you today?"],
    wares: [
      { type: "equip", id: "iron_sword",   price: 200 },
      { type: "equip", id: "steel_dagger", price: 260 },
      { type: "equip", id: "knight_sword", price: 420 },
    ],
  },
  // The reopened green building: a skill seller. Each skill book teaches one
  // skill outright (added to boughtSkills, so it's usable before its level gate).
  skill: {
    title: "Skill Shop", keeper: "MIRA",
    greeting: ["Spells bound in vellum and wax.", "Every book a new trick. Which calls to you?"],
    wares: [
      { type: "skill", id: "mend",    price: 60 },
      { type: "skill", id: "ember",   price: 80 },
      { type: "skill", id: "heal",    price: 130 },
      { type: "skill", id: "jolt",    price: 150 },
      { type: "skill", id: "fire",    price: 170 },
      { type: "skill", id: "shield",  price: 220 },
      { type: "skill", id: "inferno", price: 340 },
      { type: "skill", id: "bolt",    price: 380 },
    ],
  },
};

/* the game's title — change this string to rename the game */
const GAME_TITLE = "Game";
const GAME_SUBTITLE = "";
const AREA_NAME = "Greenwood Forest";

const MAIN_MENU = ["Items", "Skills", "Equip", "Status", "Quests", "Save"];

/* quest log entries — added/completed as the story progresses (see game.js). */
const QUESTS = {
  reach_koro:    { name: "Reach Koro",        desc: "Travel east through Greenwood Forest to the town of Koro." },
  defeat_troll:  { name: "Defeat the Troll",  desc: "A monstrous Troll guards the path ahead. Defeat it to reach Koro." },
  find_contact:  { name: "Find the Contact",  desc: "Seek out your contact at the Dragon Den Inn in Koro." },
  reach_xalkorr: { name: "Reach Xal'Korr",    desc: "The north gate is open. Journey on to Xal'Korr, the City of Bone." },
};

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
  // Village of Koro
  cliff:          { widthTiles: 1.05, solid: true, feet: 1 },
  crate:          { widthTiles: 0.85, solid: true, feet: 0.9 },
  sign:           { widthTiles: 1.0, solid: true, feet: 0.9 },
  table:          { widthTiles: 2.0, solid: true, feet: 1, blockW: 2, blockH: 1 },
  house_red:      { widthTiles: 3.4, solid: true, feet: 1.9, blockW: 3, blockH: 2 },
  house_blue:     { widthTiles: 3.4, solid: true, feet: 1.9, blockW: 3, blockH: 2 },
  house_green:    { widthTiles: 3.4, solid: true, feet: 1.9, blockW: 3, blockH: 2 },
  house_yellow:   { widthTiles: 3.4, solid: true, feet: 1.9, blockW: 3, blockH: 2 },
  house_purple:   { widthTiles: 3.4, solid: true, feet: 1.9, blockW: 3, blockH: 2 },
};
