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
const G_STONE = 5, G_BONE = 6;   // Xal'Korr: cobble streets over bone-strewn earth

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
  // Xal'Korr, City of Bone — ground tiles + bone-yard decorations
  xk_ground: "assets/xk_ground.png", xk_floor: "assets/xk_floor.png",
  xk_gate: "assets/xk_gate.png", xk_skull_totem: "assets/xk_skull_totem.png",
  xk_skull_big: "assets/xk_skull_big.png", xk_bone_bundle: "assets/xk_bone_bundle.png",
  xk_barrel: "assets/xk_barrel.png", xk_statue: "assets/xk_statue.png",
  xk_gravestone: "assets/xk_gravestone.png", xk_tomb: "assets/xk_tomb.png",
  xk_skull_pile: "assets/xk_skull_pile.png", xk_deadtree: "assets/xk_deadtree.png",
  xk_boulder: "assets/xk_boulder.png", xk_reaper: "assets/xk_reaper.png",
  xk_skull_sign: "assets/xk_skull_sign.png", xk_candles: "assets/xk_candles.png",
};
// enemy animation frame counts, keyed by sprite-group name
const LIZ_ANIMS   = { liz_idle: 3, liz_sleep: 3, liz_roar: 4, liz_attack: 4, liz_hurt: 3, liz_death: 4 };
const GOB_ANIMS   = { gob_idle: 4, gob_walk: 6, gob_attack: 6, gob_hurt: 3, gob_die: 4, gob_victory: 4 };
const TROLL_ANIMS = { troll_idle: 4, troll_walk: 6, troll_attack: 3, troll_hurt: 3, troll_death: 4 };
// Mercenary — sliced from the Thrust spritesheet (merc_thrust = the jab he attacks with)
const MERC_ANIMS  = { merc_idle: 8, merc_thrust: 8, merc_hurt: 4, merc_die: 6 };
// Gray Wolf — sliced from a 4x4 sheet (idle / charge / attack / hurt+dead)
const WOLF_ANIMS  = { wolf_idle: 4, wolf_charge: 4, wolf_attack: 4, wolf_hurt: 2, wolf_death: 2 };
// Xal'Korr skeletons — sliced from the bone-legion sheet (see slice_skeletons.py)
const SKW_ANIMS   = { skw_idle: 4, skw_walk: 5, skw_attack: 5, skw_hurt: 5, skw_death: 5 };  // warrior
const SKM_ANIMS   = { skm_idle: 5, skm_walk: 5, skm_cast: 5,   skm_hurt: 4, skm_death: 5 };  // mage
const SKA_ANIMS   = { ska_idle: 5, ska_walk: 5, ska_shoot: 5,  ska_hurt: 5, ska_death: 4 };  // archer
const ANIM_FRAMES = { ...LIZ_ANIMS, ...GOB_ANIMS, ...TROLL_ANIMS, ...MERC_ANIMS, ...WOLF_ANIMS,
                      ...SKW_ANIMS, ...SKM_ANIMS, ...SKA_ANIMS };  // group -> frame count
for (const [g, n] of Object.entries(ANIM_FRAMES))
  for (let i = 0; i < n; i++) ASSETS[`${g}_${i}`] = `assets/${g}_${i}.png`;
for (const s of ["skill_fire", "skill_shield", "skill_bolt", "skill_heal", "skill_ember", "skill_inferno", "skill_jolt", "skill_mend"]) ASSETS[s] = `assets/${s}.png`;
for (const s of ["diff_casual", "diff_normal", "diff_hard", "diff_hardcore"]) ASSETS[s] = `assets/${s}.png`;
ASSETS.you_died = "assets/you_died.png";

/* learnable skills (drag into slots; cost MP in battle) */
const SKILLS = [
  { id: "heal",   name: "Healing",        unlock: 3, mp: 2, icon: "skill_heal",   kind: "heal",   power: 32, desc: "Restore HP to the hero." },
  { id: "mend",   name: "Mend",           shop: true, mp: 1, icon: "skill_mend",   kind: "heal",   power: 18, desc: "Restore a little HP." },
  { id: "ember",  name: "Ember",          shop: true, mp: 3, icon: "skill_ember",  kind: "fire",   power: 1.2, desc: "A quick burst of flame." },
  { id: "fire",   name: "Flaming Sword",  unlock: 4, mp: 5, icon: "skill_fire",   kind: "fire",   power: 1.7, desc: "Fire damage to one foe." },
  { id: "inferno", name: "Inferno",       shop: true, mp: 9, icon: "skill_inferno", kind: "fire",  power: 2.6, desc: "A roaring blaze engulfs one foe." },
  { id: "jolt",   name: "Static Jolt",    shop: true, mp: 4, icon: "skill_jolt",   kind: "bolt",   power: 1.5, desc: "A crackling jolt of lightning." },
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
    name: "Troll", hp: 155, atk: 17, def: 12, exp: 150, gold: 90, boss: true,
    intro: "The Troll swipes at you!",
    skillMeter: 53,                                   // fires its skills 2/3 as often
    comboPunish: true,                                // 4 hero Attacks in a row -> Boulder Throw + Frenzy
    bossTitle: "Warden of Greenwood Forest",          // epithet shown above the boss name banner
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
  // --- the bone legion of Xal'Korr ---
  skeleton_warrior: {
    name: "Skeleton Warrior", hp: 120, atk: 25, def: 15, exp: 78, gold: 55,
    intro: "A Skeleton Warrior rattles forward, sword raised!",
    skillMeter: 26,
    skills: [
      { name: "Bone Cleave", kind: "hit", power: 1.9 },
      { name: "Shield Bash", kind: "double", power: 0.9 },
      { name: "Battle Fury", kind: "buff", buff: 1.25 },
    ],
    ow: { idle: "skw_idle", alert: "skw_attack", tiles: 2.0 },
    battle: { idle: "skw_idle", attack: "skw_attack", hurt: "skw_hurt", death: "skw_death", h: 0.25, flip: true, smooth: true },
  },
  skeleton_archer: {
    name: "Skeleton Archer", hp: 88, atk: 27, def: 9, exp: 76, gold: 60,
    intro: "A Skeleton Archer nocks an arrow of bone!",
    skillMeter: 22,
    skills: [
      { name: "Piercing Shot", kind: "hit", power: 2.1 },
      { name: "Rapid Volley", kind: "double", power: 1.0 },
    ],
    ow: { idle: "ska_idle", alert: "ska_shoot", tiles: 2.0 },
    battle: { idle: "ska_idle", attack: "ska_shoot", hurt: "ska_hurt", death: "ska_death", h: 0.25, flip: true, smooth: true },
  },
  skeleton_mage: {
    name: "Skeleton Mage", hp: 150, atk: 28, def: 13, exp: 92, gold: 75,
    intro: "A Skeleton Mage levels its glowing staff!",
    skillMeter: 14,                                   // charges fast — casts constantly
    // a deep spellbook: the meter fires a random one each time it fills
    skills: [
      { name: "Dark Bolt",       kind: "hit",    power: 1.8 },
      { name: "Bone Spear",      kind: "hit",    power: 2.2 },
      { name: "Shadow Lance",    kind: "hit",    power: 2.5 },
      { name: "Withering Hex",   kind: "double", power: 1.1 },
      { name: "Curse of Frailty", kind: "double", power: 1.3 },
      { name: "Soul Drain",      kind: "heal",   heal: 0.30 },
      { name: "Dread Empower",   kind: "buff",   buff: 1.30 },
      { name: "Necrotic Burst",  kind: "hit",    power: 2.0 },
    ],
    ow: { idle: "skm_idle", alert: "skm_cast", tiles: 2.0 },
    battle: { idle: "skm_idle", attack: "skm_cast", hurt: "skm_hurt", death: "skm_death", h: 0.27, flip: true, smooth: true },
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
      { type: "skill", id: "jolt",    price: 150 },
      { type: "skill", id: "inferno", price: 340 },
    ],
  },
};

/* Monster Trading Cards — buyable in packs at the purple house once Elara joins.
 * Owned cards populate the Bestiary (in the ESC menu). Each foe in ENEMY_TYPES is
 * collectible; rarity weights the random pack rolls and tints the card frame. */
const CARD_INFO = {
  lizard:    { rarity: "common", lore: "A grass-stalking reptile. Quick to bite, quicker to flee." },
  goblin:    { rarity: "common", lore: "A scrappy raider of the forest paths. Fights dirty." },
  wolf:      { rarity: "rare",   lore: "A gaunt gray hunter. It runs the tree-line in silence." },
  mercenary: { rarity: "rare",   lore: "A blade for hire, loyal only to the coin in hand." },
  troll:     { rarity: "epic",   lore: "Warden of Greenwood — a mountain of muscle and spite." },
  skeleton_warrior: { rarity: "common", lore: "Risen swordsman of Xal'Korr. Death only sharpened its discipline." },
  skeleton_archer:  { rarity: "rare",   lore: "A bone-fletched marksman. Its arrows never tire, and neither does it." },
  skeleton_mage:    { rarity: "epic",   lore: "A robed caster wreathed in violet death-magic. Spell after spell, endlessly." },
};
const CARD_MONSTERS = ["lizard", "goblin", "wolf", "mercenary", "troll",
  "skeleton_warrior", "skeleton_archer", "skeleton_mage"];
const CARD_RARITY_COLOR = { common: "#9fb4e8", rare: "#7fd0ff", epic: "#ffd479" };
const CARD_RARITY_LABEL = { common: "COMMON", rare: "RARE", epic: "EPIC" };
const CARD_PACKS = [
  { id: "common", name: "Monster Card Pack", price: 60,  count: 3, desc: "Three random monster cards.",
    weights: { common: 10, rare: 4, epic: 1 } },
  { id: "deluxe", name: "Deluxe Card Pack",  price: 150, count: 5, desc: "Five cards — better odds for rare beasts.",
    weights: { common: 7, rare: 6, epic: 2 } },
];

/* Combat Arena ladder. Each rung is a scaled-up, renamed clone of a base foe —
 * registered here as its own ENEMY_TYPES entry (sharing the base's sprites &
 * skills) so it's a first-class monster that gets a Bestiary card. Arena cards
 * are EARNED by defeating the foe in the pit (flagged `arena`, so card packs
 * never roll them — see rollCards). ARENA_FOES is the ladder order; clearing
 * rung i unlocks i+1 (see game.js openArena / battle.js endBattle). */
const ARENA_VARIANTS = [
  { id: "pit_goblin",   base: "goblin",           name: "Pit Goblin",    scale: 1.6, rarity: "common",
    lore: "A goblin fattened on pit-blood and bad temper. Bigger, meaner, and twice as loud." },
  { id: "dire_wolf",    base: "wolf",             name: "Dire Wolf",     scale: 1.9, rarity: "rare",
    lore: "A monstrous wolf bred for the sands. It has never lost — and never eaten its fill." },
  { id: "sellsword",    base: "mercenary",        name: "Sellsword",     scale: 2.1, rarity: "rare",
    lore: "A pit veteran who fights for the roar of the crowd as much as the purse." },
  { id: "bone_champion", base: "skeleton_warrior", name: "Bone Champion", scale: 2.4, rarity: "epic",
    lore: "An undead gladiator, victor of a hundred bouts it cannot remember winning." },
  { id: "bone_marksman", base: "skeleton_archer",  name: "Bone Marksman", scale: 2.7, rarity: "epic",
    lore: "Every arrow finds a heart. The pit keeps it well-supplied with both." },
  { id: "lich_acolyte", base: "skeleton_mage",    name: "Lich Acolyte",  scale: 3.0, rarity: "epic",
    lore: "The Arena Master's champion — a death-mage who treats each bout as fresh research." },
];
for (const v of ARENA_VARIANTS) {
  const b = ENEMY_TYPES[v.base];
  ENEMY_TYPES[v.id] = {
    ...b, name: v.name, boss: false,
    hp:  Math.round(b.hp  * v.scale), atk:  Math.round(b.atk  * v.scale),
    def: Math.round(b.def * v.scale), exp:  Math.round(b.exp  * v.scale),
    gold: Math.round(b.gold * v.scale),
    intro: v.name + " strides into the pit, eyes on you!",
  };
  CARD_INFO[v.id] = { rarity: v.rarity, lore: v.lore, arena: true };
  CARD_MONSTERS.push(v.id);
}
const ARENA_FOES = ARENA_VARIANTS.map(v => v.id);   // ladder order, by type id

/* the game's title — change this string to rename the game */
const GAME_TITLE = "Game";
const GAME_SUBTITLE = "";
const AREA_NAME = "Greenwood Forest";

const MAIN_MENU = ["Skills", "Equip", "Status", "Bestiary", "Achievements", "Quests", "Save"];

/* Achievements — earned once and kept forever (a global localStorage trophy
 * case, independent of any save slot). `test(g)` is run against live game state
 * each tick; the first time it returns true the achievement unlocks with a toast.
 * `icon` is the badge shown when earned; locked rows show a padlock instead. */
const ACHIEVEMENTS = [
  { id: "first_blood",  name: "First Blood",     icon: "sword",  desc: "Win your first battle.",
    test: g => (g.stats.kills || 0) >= 1 },
  { id: "slayer",       name: "Slayer",          icon: "dagger", desc: "Defeat 25 foes.",
    test: g => (g.stats.kills || 0) >= 25 },
  { id: "exterminator", name: "Exterminator",    icon: "skull",  desc: "Defeat 75 foes.",
    test: g => (g.stats.kills || 0) >= 75 },
  { id: "merc_work",    name: "Hired Steel",     icon: "shield", desc: "Beat the mercenaries at the inn.",
    test: g => !!g.mercDefeated },
  { id: "giant_slayer", name: "Giant Slayer",    icon: "axe",    desc: "Fell the Warden of Greenwood.",
    test: g => !!(g.stats.byType && g.stats.byType.troll) },
  { id: "bone_breaker", name: "Bone Breaker",    icon: "bone",   desc: "Destroy one of the risen dead.",
    test: g => !!(g.stats.byType && (g.stats.byType.skeleton_warrior || g.stats.byType.skeleton_archer || g.stats.byType.skeleton_mage)) },
  { id: "veteran",      name: "Veteran",         icon: "star",   desc: "Reach level 10.",
    test: g => g.player.lv >= 10 },
  { id: "not_alone",    name: "Not Alone",       icon: "allies", desc: "Recruit a companion.",
    test: g => g.player.party.some(m => m.id === "ally") },
  { id: "spellsword",   name: "Spellsword",      icon: "spark",  desc: "Equip your first skill.",
    test: g => (g.player.skills || []).length >= 1 },
  { id: "geared_up",    name: "Geared Up",       icon: "armor",  desc: "Wear a weapon and armor at once.",
    test: g => !!(g.player.equip.weapon && g.player.equip.armor) },
  { id: "treasure",     name: "Treasure Hunter", icon: "chest",  desc: "Open a treasure chest.",
    test: g => (g.stats.chests || 0) >= 1 },
  { id: "moneybags",    name: "Moneybags",       icon: "coin",   desc: "Amass 500 gold.",
    test: g => g.player.gold >= 500 },
  { id: "collector",    name: "Collector",       icon: "card",   desc: "Obtain your first monster card.",
    test: g => Object.keys(g.player.cards || {}).length >= 1 },
  { id: "loremaster",   name: "Loremaster",      icon: "book",   desc: "Discover every monster card.",
    test: g => CARD_MONSTERS.every(t => (g.player.cards || {})[t]) },
  { id: "road_koro",    name: "Road to Koro",    icon: "house",  desc: "Reach the town of Koro.",
    test: g => !!(g.stats.visited && g.stats.visited.koro) },
  { id: "city_bone",    name: "City of Bone",    icon: "castle", desc: "Set foot in Xal'Korr.",
    test: g => !!(g.stats.visited && g.stats.visited.xalkorr) },
];

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
  // Xal'Korr, City of Bone — gate is non-solid (build() blocks its pillars so the
  // archway stays walkable); the rest are bone-yard props.
  xk_gate:        { widthTiles: 3.4, solid: false, feet: 1.9 },
  xk_skull_totem: { widthTiles: 0.95, solid: true, feet: 0.95 },
  xk_skull_big:   { widthTiles: 1.1,  solid: true, feet: 0.95 },
  xk_bone_bundle: { widthTiles: 1.0,  solid: true, feet: 0.95 },
  xk_barrel:      { widthTiles: 0.85, solid: true, feet: 0.95 },
  xk_statue:      { widthTiles: 1.3,  solid: true, feet: 0.95 },
  xk_gravestone:  { widthTiles: 1.0,  solid: true, feet: 0.95 },
  xk_tomb:        { widthTiles: 2.6,  solid: true, feet: 1, blockW: 2, blockH: 1 },
  xk_skull_pile:  { widthTiles: 2.1,  solid: true, feet: 1, blockW: 2, blockH: 1 },
  xk_deadtree:    { widthTiles: 1.6,  solid: true, feet: 0.55 },
  xk_boulder:     { widthTiles: 1.9,  solid: true, feet: 0.9, blockW: 2, blockH: 1 },
  xk_reaper:      { widthTiles: 1.7,  solid: true, feet: 0.6 },
  xk_skull_sign:  { widthTiles: 1.7,  solid: true, feet: 0.95 },
  xk_candles:     { widthTiles: 0.7,  solid: false, feet: 1 },
};
