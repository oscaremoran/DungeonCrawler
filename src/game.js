class Game {
  constructor(canvas, art) {
    this.cv = canvas; this.ctx = canvas.getContext("2d");
    this.art = art;
    this.audio = new GameAudio();   // procedural sound (lazily unlocked on first input)

    this.newGame();             // build the world + a fresh hero (re-run by New Game)

    // anti-cheat: disabled for the ?dev test harnesses, active for real play
    this.devMode = /(?:[?&#])dev\b/i.test(location.search + location.hash);
    this.cheated = false;

    // --- screen / flow state ---
    this.state = "title";       // title | difficulty | name | overworld
    this.t = 0;                 // running clock (ms), for animation
    this.titleSel = 0;          // 0 = New Game, 1 = Continue
    this.fade = 1;              // 1 = black; fades in on load
    this.exiting = false; this.exitTo = null;
    this.hud = document.getElementById("hud");

    this.keys = {};
    addEventListener("keydown", e => {
      const key = e.key.toLowerCase();
      this.audio.unlock();                // resume audio on the first gesture
      // N toggles sound — but not while typing a name (where 'n' is a letter)
      if (key === "n" && this.state !== "name" && !this.naming) {
        const m = this.audio.toggleMute(); this.flash = { text: m ? "Sound off" : "Sound on", t: 1000 }; return;
      }
      if (["arrowup","arrowdown","arrowleft","arrowright"," ","enter","backspace","tab"].includes(key))
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
    this.cv.addEventListener("mousedown", e => { this.audio.unlock(); const [x, y] = toCanvas(e); this.onMouse("down", x, y); });
    addEventListener("mousemove", e => { const [x, y] = toCanvas(e); this.onMouse("move", x, y); });
    addEventListener("mouseup", e => { const [x, y] = toCanvas(e); this.onMouse("up", x, y); });

    this.resize(); addEventListener("resize", () => this.resize());
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }

  /* (re)initialize a fresh run: rebuild every area, respawn enemies/NPCs, and
     reset the hero + all per-run flags. Called from the constructor and whenever
     the player picks New Game (otherwise a new game would inherit the last run's
     dead hero — 0 HP, last position). Screen/flow state is left to the caller. */
  newGame() {
    this.areas = {
      forest: buildWorld(1337), room2: buildRoom2(), room3: buildRoom3(), koro: buildKoro(),
      koro_def:   buildKoroInterior({ shop: "def",   returnEntry: "from_def" }),
      koro_off:   buildKoroInterior({ shop: "off",   returnEntry: "from_off" }),
      koro_skill: buildKoroInterior({ shop: "skill", returnEntry: "from_skill" }),
      koro_inn:   buildKoroInterior({ inn: true, returnEntry: "from_inn" }),
      worldmap:   buildWorldMap(),
    };
    for (const id in this.areas) {                  // instantiate persistent enemies per area
      const w = this.areas[id];
      w.enemies = w.enemyDefs.map(d => ({
        id: d.id, type: d.type, x: d.tx * TILE + TILE / 2, y: d.ty * TILE + TILE,
        alive: true, anim: "idle", animT: Math.random() * 1000,
      }));
      w.npcs = (w.npcs || []).map(n => ({
        ...n, x: n.tx * TILE + TILE / 2, y: (n.ty + 1) * TILE, animT: Math.random() * 1000,
      }));
    }
    this.area = "forest";
    this.world = this.areas.forest;

    this.player = {
      x: this.world.spawn.tx * TILE + TILE / 2,
      y: this.world.spawn.ty * TILE + TILE / 2,
      face: 1,            // 1 = right, -1 = left (frames are drawn facing left)
      moving: false,
      animT: 0, frame: 0,
      wTiles: 1.15,       // drawn width in tiles
      // --- RPG stats ---
      name: "GARRAN", job: "Warrior",
      lv: 1, exp: 0, expNext: 24,
      hp: 30, maxhp: 30, mp: 8, maxmp: 8,
      atk: 9, def: 5, gold: 150,
      skills: [],          // equipped skill ids (slots = floor(LV/2))
      boughtSkills: [],    // skills purchased at the Spell Store (usable early)
      party: [],           // recruited allies, e.g. [{ id:'ally', name:'ELARA', sprite:'ally_idle' }]
      equipOwned: ["wood_sword", "cloak"],          // gear in the pack
      equip: { weapon: "wood_sword", armor: "cloak" },  // gear currently worn
    };
    this.shop = null;        // null | { id, sel } — open storefront
    this.naming = null;      // null | { title, buf, onDone } — mid-game name-entry box
    this.trail = [];         // recent player poses, for party followers

    this.ui = null;          // null | { screen: 'main'|'status'|'skills'|'equip'|'quests', sel }
    this.dialogue = null;    // null | { name, lines, page, portrait, onClose }
    this.queuedDialogue = null; // shown once the next fade-transition settles
    this.introShown = false;
    this.cutscene = null;       // null | { type, actors, ... } — scripted overworld scene
    this.mercSceneDone = false; // the Dragon Den Inn mercenary ambush has played out
    this.mercDefeated = false;  // mercenaries beaten -> Koro's north gate is open

    this.enemies = this.world.enemies;   // overworld enemies in the current area
    this.npcs = this.world.npcs;         // shopkeepers in the current area
    this.encounter = null;   // { phase:'roar'|'whirl', t, target }
    this.battle = null;
    this.transition = null;  // area-to-area fade { to, entry, autosave, phase }
    this.autosaveAnim = null;// spinning-sword "saving" indicator
    this.prompt = null;      // yes/no confirmation { sel, target, text }
    this.nameBuf = "GARRAN"; // name-entry buffer
    this.bossTalkCD = 0;

    // --- quest log: ordered list of { id, done }; first quest is live from the start ---
    this.quests = [{ id: "reach_koro", done: false }];
    this.notifs = [];           // stacked toast notifications (quest updates, etc.)

    // --- difficulty (set on New Game; casual|normal|hard|hardcore) ---
    this.difficulty = "normal";
    this.difficultySel = 1;     // 0 Casual, 1 Normal, 2 Hard, 3 Hardcore

    // --- per-run stats, surfaced on the You Died screen ---
    this.resetRunStats();
    this.gameover = null;       // null | { sel: 0|1 }  (Continue / Home)
  }

  /* discrete key presses, routed by screen */
  onKey(key) {
    if (this.cheated || this.exiting) return;
    if (this.state === "title") {
      if (key === "arrowup" || key === "w" || key === "arrowdown" || key === "s")
        { this.titleSel ^= 1; this.audio.play("move"); }            // toggle the two options
      else if (key === "enter" || key === " ") {
        if (this.titleSel === 1) {                  // Continue -> save-picker
          if (this.hasSave()) { this.saveSel = 0; this.beginTransition("saveselect"); }
          else this.flash = { text: "No saved game found.", t: 1500 };
        } else { this.newGame(); this.beginTransition("difficulty"); } // New Game -> fresh hero + pick difficulty
      }
      return;
    }
    if (this.state === "difficulty") {
      const N = 4;
      if (key === "arrowleft" || key === "a" || key === "arrowup" || key === "w")
        this.difficultySel = (this.difficultySel + N - 1) % N;
      else if (key === "arrowright" || key === "d" || key === "arrowdown" || key === "s")
        this.difficultySel = (this.difficultySel + 1) % N;
      else if (key === "escape") this.beginTransition("title");
      else if (key === "enter" || key === " ") {
        this.difficulty = ["casual", "normal", "hard", "hardcore"][this.difficultySel];
        this.beginTransition("name");
      }
      return;
    }
    if (this.state === "saveselect") {
      const list = this.listSaves(); const n = list.length;
      if (!n) { this.beginTransition("title"); return; }
      this.saveSel = Math.min(this.saveSel || 0, n - 1);
      if (key === "arrowup" || key === "w") this.saveSel = (this.saveSel + n - 1) % n;
      else if (key === "arrowdown" || key === "s") this.saveSel = (this.saveSel + 1) % n;
      else if (key === "escape") this.beginTransition("title");
      else if (key === "delete" || key === "backspace") {
        this.deleteSave(list[this.saveSel].id);
        const remaining = this.listSaves();
        if (!remaining.length) this.beginTransition("title");
        else this.saveSel = Math.min(this.saveSel, remaining.length - 1);
      }
      else if (key === "enter" || key === " ") {
        if (this.loadGame(list[this.saveSel].id)) this.beginTransition("overworld");
        else this.flash = { text: "Save load failed.", t: 1500 };
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
    if (this.state === "gameover") { this.gameoverKey(key); return; }
    if (this.state === "overworld") {
      if (this.encounter) return;                 // locked during roar/whirl
      if (this.naming) { this.namingKey(key); return; }  // mid-game name-entry box
      if (this.shop) { this.shopKey(key); return; }  // browsing a storefront
      if (this.prompt) {                           // yes/no confirmation
        if (key === "arrowleft" || key === "a" || key === "arrowright" || key === "d") this.prompt.sel ^= 1;
        else if (key === "escape") this.prompt = null;
        else if (key === "enter" || key === " ") this.resolvePrompt(this.prompt.sel === 0);
        return;
      }
      if (this.dialogue) {                         // advance / close dialogue
        if (key === "enter" || key === " " || key === "escape") this.advanceDialogue();
        return;
      }
      if (this.ui) { this.menuKey(key); return; }  // navigate the menu
      if (key === "escape" || key === "m") this.ui = { screen: "main", sel: 0 };
      else if (key === "enter" || key === " ") {
        if (this.tryTalkNPC()) return;
        if (this.tryReadSign()) return;
        if (this.tryLockedDoor()) return;
        this.tryOpenChest();   // action key opens a nearby chest; otherwise does nothing
      }
    }
  }

  /* menu navigation */
  menuKey(key) {
    const ui = this.ui;
    const back = () => { ui.screen === "main" ? (this.ui = null) : (this.ui = { screen: "main", sel: 0 }); };
    if (key === "escape") return back();
    // Switch the active character with ← / → on the Skills/Equip screens (if an ally is recruited).
    const switchKey = (ui.screen === "skills" || ui.screen === "equip")
      && (key === "arrowright" || key === "arrowleft");
    if (switchKey) {
      if (this.player.party.some(m => m.id === "ally")) {
        ui.target = ui.target === "ally" ? "hero" : "ally";
        ui.drag = null; ui.hover = ui.screen === "skills" ? -1 : null;
      }
      return;
    }

    if (ui.screen === "main") {
      const n = MAIN_MENU.length;
      if (key === "arrowup" || key === "w") { ui.sel = (ui.sel + n - 1) % n; this.audio.play("move"); }
      else if (key === "arrowdown" || key === "s") { ui.sel = (ui.sel + 1) % n; this.audio.play("move"); }
      else if (key === "enter" || key === " ") {
        const pick = MAIN_MENU[ui.sel];
        if (pick === "Status") this.ui = { screen: "status", sel: 0 };
        else if (pick === "Skills") this.ui = { screen: "skills", sel: 0, drag: null, hover: -1, target: "hero" };
        else if (pick === "Equip") this.ui = { screen: "equip", sel: 0, drag: null, hover: null, target: "hero" };
        else if (pick === "Quests") this.ui = { screen: "quests", sel: 0 };
        else if (pick === "Save") {
          if (this.difficulty === "hardcore") this.flash = { text: "Hardcore — saving is disabled.", t: 1600 };
          else this.saveGame();
          this.ui = null;
        }
        else this.flash = { text: pick + " — not implemented yet", t: 1400 };
      }
    }
  }

  /* open the nearest unopened chest the hero is standing beside */
  tryOpenChest() {
    const p = this.player;
    for (const chest of (this.world.chests || [])) {
      if (chest.opened) continue;
      const cx = chest.tx * TILE + TILE / 2, cy = (chest.ty + 0.5) * TILE;
      if (Math.hypot(p.x - cx, p.y - cy) > TILE * 1.7) continue;
      chest.opened = true;
      this.audio.play("chest");
      if (chest.gold) {                                // a pouch of coin
        p.gold += chest.gold;
        this.dialogue = { name: p.name, page: 0, lines: [
          ["A pouch of gold!", "+ " + chest.gold + " gold."],
        ]};
      } else {                                         // a piece of gear
        const it = EQUIP_BY_ID[chest.item];
        if (!p.equipOwned.includes(chest.item)) p.equipOwned.push(chest.item);
        this.dialogue = { name: p.name, page: 0, lines: [
          ["A " + it.name + "!", it.desc],
          ["Equip it from the menu", "(press M, then Equip)."],
        ]};
      }
      return true;
    }
    return false;
  }

  /* talk to a nearby NPC: shopkeeper opens a store, Elara can be recruited,
   * patrons offer a bit of flavour. */
  tryTalkNPC() {
    const p = this.player;
    for (const n of (this.npcs || [])) {
      if (n.ally && this.hasAlly(n)) continue;       // already recruited; she's a follower now
      if (Math.hypot(p.x - n.x, p.y - (n.y - TILE / 2)) > TILE * 1.8) continue;
      // NPC dialogue ALWAYS shows the NPC's own overworld sprite — never the hero's portrait.
      if (n.shop) {
        this.dialogue = {
          name: n.name, page: 0, portrait: n.sprite, lines: [SHOPS[n.shop].greeting],
          onClose: () => { this.shop = { id: n.shop, sel: 0 }; },
        };
      } else if (n.ally) {
        this.dialogue = {
          name: n.name, page: 0, portrait: "ally_portrait",
          lines: [
            ["You're the one who felled the Troll?", "Nice work, the boss says to", "go to Xal'Korr, City of Bone."],
            ["It's deadly, but", "we'd make a better profit."],
            ["Let me come with you.", "Two blades are better than one."],
            ["Let's talk to the innkeeper.", "He'll unlock the north gate for us."],
          ],
          onClose: () => this.beginNameContact(n),
        };
      } else if (n.innkeeper) {
        if (!this.hasAlly()) {
          // gated: you must speak with Elara (and take her on) before he'll deal with you
          this.dialogue = { name: n.name, page: 0, portrait: n.portrait, lines: [
            ["I've no words for you yet, stranger."],
          ]};
        } else if (this.mercSceneDone) {
          this.dialogue = { name: n.name, page: 0, portrait: n.portrait, lines: [
            ["...", "(He keeps a wary eye on the door,", "rag wringing in his fists.)"],
          ]};
        } else {
          this.dialogue = { name: n.name, page: 0, portrait: n.portrait, lines: [
            ["So you're the pair the boss spoke of.", "Good. Koro needs blades it can trust."],
            ["The road to Xal'Korr is open.", "Pelreth is waiting. Move swiftly."],
            ["Wait. The door...", "I didn't send for anyone else."],
          ], onClose: () => this.startMercScene(n) };
        }
      } else if (n.gateGuard) {
        this.dialogue = { name: n.name, page: 0, portrait: n.portrait, lines: [
          ["Hold. The north road's closed.", "Koro's got trouble within its own walls—", "no one leaves for Xal'Korr until it's settled."],
        ]};
      } else {
        this.dialogue = { name: n.name, page: 0, portrait: n.sprite, lines: n.talk || [["..."]] };
      }
      return true;
    }
    return false;
  }

  hasAlly(n) { return this.player.party.some(m => m.id === "ally"); }

  /* open the "Name the Contact" entry box before the recruit finalises */
  beginNameContact(n) {
    if (this.hasAlly(n)) return;
    this.naming = { title: "NAME THE CONTACT", buf: "ELARA", onDone: name => this.recruitAlly(n, name) };
  }

  /* Elara joins: add to the party, drop her from the inn, start her following */
  recruitAlly(n, name) {
    const p = this.player;
    if (this.hasAlly(n)) return;
    const nm = (name || n.name).toUpperCase();
    const lv = p.lv;
    p.party.push({
      id: "ally", name: nm, sprite: n.sprite,
      lv, exp: 0, expNext: 24 + (lv - 1) * 12,        // Elara levels up alongside the hero
      maxhp: 28 + lv * 4, hp: 28 + lv * 4,
      maxmp: 6 + lv * 2, mp: 6 + lv * 2,
      atk: 7 + lv, def: 3 + ((lv / 2) | 0),
      skills: [],                                  // her equipped skill slots (shared catalog)
      equip: { weapon: null, armor: null },        // her worn gear (shared catalog)
    });
    this.npcs = this.npcs.filter(x => x !== n);
    if (this.world.npcs) this.world.npcs = this.world.npcs.filter(x => x !== n);
    this.seedTrail();
    this.completeQuest("find_contact");
    this.flash = { text: nm + " joined the party!", t: 1800 };
  }

  /* prime the follow-trail so a new follower doesn't snap from the origin */
  seedTrail() {
    const p = this.player;
    this.trail = Array.from({ length: 80 }, () => ({ x: p.x, y: p.y, face: p.face, moving: false, frame: 0 }));
  }

  /* ------------------------------- quest log ----------------------------- */
  hasQuest(id) { return this.quests.some(q => q.id === id); }
  /* push a stacked toast (quest updates etc.) — these queue rather than clobber,
     so several can fire on the same beat (e.g. two quests complete at once). */
  pushNotif(text, color) {
    if (this.audio) this.audio.play("quest");
    this.notifs.push({ text, color: color || "#ffe9b0", t: 2600, max: 2600 });
    if (this.notifs.length > 4) this.notifs.shift();   // cap the stack
  }
  /* add a new quest (active) unless it's already in the log */
  addQuest(id) {
    if (!QUESTS[id] || this.hasQuest(id)) return;
    this.quests.push({ id, done: false });
    this.pushNotif("New Quest:  " + QUESTS[id].name, "#ffd479");
  }
  /* mark an existing quest complete */
  completeQuest(id) {
    const q = this.quests.find(q => q.id === id);
    if (q && !q.done) { q.done = true; this.pushNotif("Quest Complete:  " + QUESTS[id].name, "#9cf0a0"); }
  }
  /* the active (first unfinished) quest, or null if all are done */
  activeQuest() { return (this.quests || []).find(q => !q.done) || null; }
  /* tile {tx,ty} in the CURRENT area to point the minimap's quest marker at, or
     null if the objective isn't reachable from here. */
  questMarkerTile() {
    const q = this.activeQuest(); if (!q) return null;
    const w = this.world;
    const eastExit = () => {
      const ex = (w.exits || []).find(e => e.side === "east");
      return ex ? { tx: MAP_W - 2, ty: (ex.ty0 + ex.ty1) / 2 } : null;
    };
    const portalTo = pred => { const pp = (w.portals || []).find(pred); return pp ? { tx: pp.tx, ty: pp.ty } : null; };
    if (q.id === "defeat_troll") {
      const boss = (this.enemies || []).find(e => e.alive && ENEMY_TYPES[e.type] && ENEMY_TYPES[e.type].boss);
      if (boss) return { tx: boss.x / TILE, ty: boss.y / TILE - 0.5 };
      return eastExit();
    }
    if (q.id === "find_contact") {
      const elara = (this.npcs || []).find(n => n.ally);
      if (elara) return { tx: elara.x / TILE, ty: elara.y / TILE - 0.5 };
      return portalTo(p => p.to === "koro_inn") || eastExit();   // not inside yet: head for the inn door
    }
    if (q.id === "reach_xalkorr") {
      return portalTo(p => p.to === "worldmap")
        || (this.area === "worldmap" ? { tx: (MAP_W / 2) | 0, ty: 2 } : eastExit());
    }
    return eastExit();   // reach_koro (default): press on east toward town
  }

  /* advance the quest log when the hero first sets foot in an area */
  updateQuestsForArea(id) {
    if (id === "room3") this.addQuest("defeat_troll");
    else if (id === "koro") {
      this.completeQuest("reach_koro");
      this.completeQuest("defeat_troll");
      this.addQuest("find_contact");
    }
  }

  /* --------------------------- mercenary ambush -------------------------- */
  /* Four mercenaries stride in through the inn door and confront the party.
   * Spawned at the doorway, they walk to confront positions; once all have
   * arrived their leader speaks, then the screen drops into a battle. */
  startMercScene() {
    const door = (this.world.portals && this.world.portals[0]) || { tx: 21, ty: 22 };
    const px = (tx) => tx * TILE + TILE / 2, py = (ty) => (ty + 1) * TILE;
    // staggered spawns at the door, fanning out to confront the party near the bar
    const plan = [
      { tx: 26, ty: 11, delay: 0,   sx: door.tx,     sy: door.ty },
      { tx: 25, ty: 13, delay: 160, sx: door.tx - 1, sy: door.ty },
      { tx: 26, ty: 14, delay: 320, sx: door.tx + 1, sy: door.ty },
      { tx: 24, ty: 12, delay: 480, sx: door.tx,     sy: door.ty - 1 },
    ];
    this.cutscene = {
      type: "merc", t: 0, talked: false,
      actors: plan.map(a => ({
        x: px(a.sx), y: py(a.sy), tx: a.tx, ty: a.ty,
        delay: a.delay, moving: false, face: 1, frame: 0, animT: 0,
      })),
    };
    this.player.moving = false; this.player.frame = 0;
  }
  updateCutscene(dt) {
    const cs = this.cutscene; cs.t += dt;
    const px = (tx) => tx * TILE + TILE / 2, py = (ty) => (ty + 1) * TILE;
    let allArrived = true;
    for (const a of cs.actors) {
      if (cs.t < a.delay) { allArrived = false; continue; }
      const dx = px(a.tx) - a.x, dy = py(a.ty) - a.y, dist = Math.hypot(dx, dy);
      if (dist > 3) {
        const step = SPEED * 0.95 * (dt / (1000 / 60)), m = Math.min(step, dist);
        a.x += (dx / dist) * m; a.y += (dy / dist) * m;
        a.face = dx >= 0 ? 1 : -1; a.moving = true;
        a.animT += dt;
        if (a.animT > 1000 / 8) { a.animT = 0; a.frame = (a.frame + 1) % ANIM_FRAMES.merc_idle; }
        allArrived = false;
      } else { a.moving = false; a.frame = 0; }
    }
    if (allArrived && !cs.talked) {
      cs.talked = true;
      this.dialogue = {
        name: "MERCENARY", page: 0, portrait: "merc_idle_0",
        lines: [
          ["That's far enough. Our boss has new orders—", "and you two aren't in them anymore."],
          ["Nothing personal. Just business."],
        ],
        onClose: () => this.beginMercBattle(),
      };
    }
  }
  /* the parley ends — drop straight into the fight (one Mercenary stands in for
   * the band until the battle engine can field a whole group). */
  beginMercBattle() {
    this.mercSceneDone = true;
    this.cutscene = null;
    this.enterBattle({ type: "mercenary", alive: true, scripted: true });
  }

  /* read a signboard the hero is standing in front of */
  tryReadSign() {
    const p = this.player, ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
    for (const s of (this.world.signs || [])) {
      if (Math.abs(ptx - s.tx) <= 1 && Math.abs(pty - s.ty) <= 1) {
        this.dialogue = { name: "", page: 0, lines: [s.text] };
        return true;
      }
    }
    return false;
  }

  /* bump the sealed (purple) house door */
  tryLockedDoor() {
    const p = this.player, ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
    for (const d of (this.world.lockedDoors || [])) {
      if (Math.abs(ptx - d.tx) <= 1 && Math.abs(pty - d.ty) <= 1) {
        this.flash = { text: "The door is locked. No one answers.", t: 1500 };
        return true;
      }
    }
    return false;
  }

  /* ----------------------------- name-entry box -------------------------- */
  namingKey(key) {
    const nm = this.naming;
    if (key === "enter") {
      const done = nm.onDone, val = nm.buf.trim();
      this.naming = null; done(val);
    } else if (key === "backspace") {
      nm.buf = nm.buf.slice(0, -1);
    } else if (/^[a-z0-9 ]$/i.test(key) && nm.buf.length < 10) {
      nm.buf += key.length === 1 ? key.toUpperCase() : "";
    }
  }

  /* ------------------------------- storefront ---------------------------- */
  shopKey(key) {
    const shop = SHOPS[this.shop.id], n = shop.wares.length;
    if (key === "escape" || key === "m") { this.shop = null; return; }
    if (key === "arrowup" || key === "w") this.shop.sel = (this.shop.sel + n - 1) % n;
    else if (key === "arrowdown" || key === "s") this.shop.sel = (this.shop.sel + 1) % n;
    else if (key === "enter" || key === " ") this.buyWare(shop.wares[this.shop.sel]);
  }
  ownsWare(w) {
    const p = this.player;
    return w.type === "skill" ? (p.boughtSkills.includes(w.id) || p.skills.includes(w.id))
                              : p.equipOwned.includes(w.id);
  }
  buyWare(w) {
    const p = this.player;
    if (this.ownsWare(w)) { this.flash = { text: "You already have that.", t: 1200 }; this.audio.play("cancel"); return; }
    if (p.gold < w.price) { this.flash = { text: "Not enough gold.", t: 1200 }; this.audio.play("cancel"); return; }
    p.gold -= w.price;
    this.audio.play("buy");
    if (w.type === "skill") {
      p.boughtSkills.push(w.id);
      this.flash = { text: "Learned " + SKILL_BY_ID[w.id].name + "!", t: 1600 };
    } else {
      p.equipOwned.push(w.id);
      this.flash = { text: "Bought " + EQUIP_BY_ID[w.id].name + "!", t: 1600 };
    }
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
  showQueuedDialogue() {
    if (this.queuedDialogue) { this.dialogue = this.queuedDialogue; this.queuedDialogue = null; }
  }
  advanceDialogue() {
    if (!this.dialogue) return;
    this.dialogue.page++;
    if (this.dialogue.page >= this.dialogue.lines.length) {
      const cb = this.dialogue.onClose; this.dialogue = null;
      if (cb) cb();                                  // chain scripted scenes
    }
  }

  beginTransition(to) { this.exiting = true; this.exitTo = to; }

  resetRunStats() {
    this.stats = { kills: 0, dmgDealt: 0, skillUses: {}, lastKiller: null };
    this.runId = "r_" + Date.now() + "_" + Math.floor(Math.random() * 1e6).toString(36);
  }

  /* --------------------------- anti-cheat tripwire ---------------------------
   * The hero's base stats are fully determined by level, so any console/save
   * tampering leaves an impossible state we can spot with no false positives. */
  expectedBase(lv) {
    return { maxhp: 30 + 6 * (lv - 1), maxmp: 8 + 2 * (lv - 1), atk: 9 + 2 * (lv - 1), def: 5 + 1 * (lv - 1) };
  }
  checkIntegrity() {
    if (this.cheated) return;
    const p = this.player; if (!p) return;
    const L = p.lv;
    let bad = !Number.isFinite(L) || L < 1 || L > 200;
    if (!bad) {
      const e = this.expectedBase(L);
      if (p.maxhp !== e.maxhp || p.maxmp !== e.maxmp || p.atk !== e.atk || p.def !== e.def) bad = true;
      else if (p.hp > p.maxhp || p.mp > p.maxmp || p.hp < 0 || p.mp < 0) bad = true;
      else if (!Number.isFinite(p.gold) || p.gold < 0 || p.gold > 9000000) bad = true;
    }
    if (bad) this.cheatDetected();
  }
  /* nuke every save and freeze on the DON'T CHEAT screen */
  cheatDetected() {
    if (this.cheated) return;
    this.cheated = true;
    try { localStorage.clear(); } catch (e) {}
    this.state = "cheater"; this.fade = 0;
    this.battle = this.encounter = this.transition = null;
    this.ui = this.shop = this.dialogue = this.prompt = this.naming = null;
    if (this.hud) this.hud.style.display = "none";
  }

  /* enter the You Died screen — called from endBattle on a loss */
  beginGameOver() {
    const hardcore = this.difficulty === "hardcore";
    if (hardcore && this.runId) {                // permadeath: wipe this run's saves
      this.writeSaves(this.listSaves().filter(s => s.runId !== this.runId));
    }
    this.gameover = { sel: hardcore ? 1 : 0 };   // hardcore can only pick Home
    this.state = "gameover"; this.fade = 0;
    this.battle = null; this.encounter = null;
  }

  gameoverKey(key) {
    const g = this.gameover; if (!g) return;
    const hardcore = this.difficulty === "hardcore";
    if (key === "arrowleft" || key === "a" || key === "arrowright" || key === "d") {
      if (!hardcore) g.sel ^= 1;                 // toggle Continue / Home
    } else if (key === "enter" || key === " ") {
      const pickHome = hardcore || g.sel === 1;
      this.gameover = null;
      if (pickHome) {
        this.titleSel = 0;
        this.beginTransition("title");
      } else {
        // Continue from death: load most recent save and revive at full HP/MP
        if (this.loadGame()) {
          const p = this.player;
          p.hp = p.maxhp; p.mp = p.maxmp;
          this.beginTransition("overworld");
        } else { this.newGame(); this.titleSel = 0; this.beginTransition("title"); }
      }
    }
  }

  /* ------------------------------ save / load ----------------------------
   * Saves live in a list under localStorage key "game_saves_v1".
   * Each entry has its own id + timestamp; a new entry is pushed every
   * time the player saves (manual or autosave). Cap = SAVE_CAP. */
  listSaves() {
    try { return JSON.parse(localStorage.getItem("game_saves_v1")) || []; }
    catch (e) { return []; }
  }
  writeSaves(list) {
    try { localStorage.setItem("game_saves_v1", JSON.stringify(list.slice(0, 30))); }
    catch (e) {}
  }
  hasSave() { return this.listSaves().length > 0; }
  deleteSave(id) {
    this.writeSaves(this.listSaves().filter(s => s.id !== id));
  }
  saveGame(silent) {
    if (this.difficulty === "hardcore") return;       // permadeath: no saves, ever (no save-scumming)
    const p = this.player;
    const dead = {};                                  // per-area defeated-enemy flags
    for (const id in this.areas) dead[id] = this.areas[id].enemies.map(e => !e.alive);
    const now = Date.now();
    const data = {
      id: "s_" + now + "_" + Math.floor(Math.random() * 1e6).toString(36),
      runId: this.runId || null,
      v: 3, name: p.name, lv: p.lv, exp: p.exp, expNext: p.expNext,
      hp: p.hp, maxhp: p.maxhp, mp: p.mp, maxmp: p.maxmp, atk: p.atk, def: p.def,
      gold: p.gold, skills: p.skills.slice(), boughtSkills: p.boughtSkills.slice(),
      party: p.party.map(m => ({ ...m })),
      equipOwned: p.equipOwned.slice(), equip: { ...p.equip },
      chestsOpened: Object.fromEntries(Object.keys(this.areas)
        .filter(id => this.areas[id].chests)
        .map(id => [id, this.areas[id].chests.map(c => !!c.opened)])),
      area: this.area, dead, difficulty: this.difficulty,
      mercSceneDone: !!this.mercSceneDone, mercDefeated: !!this.mercDefeated,
      quests: this.quests.map(q => ({ id: q.id, done: !!q.done })),
      stats: { ...this.stats, skillUses: { ...this.stats.skillUses } },
      px: p.x, py: p.y, at: now,
    };
    try {
      const list = this.listSaves();
      list.unshift(data);
      this.writeSaves(list);
      if (!silent) this.flash = { text: "Game saved!", t: 1500 };
    } catch (e) { if (!silent) this.flash = { text: "Save failed.", t: 1500 }; }
  }
  /* loadGame(id?) — loads the save with the given id, or the most recent. */
  loadGame(id) {
    const list = this.listSaves();
    const data = id ? list.find(s => s.id === id) : list[0];
    if (!data) return false;
    const p = this.player;
    Object.assign(p, {
      name: data.name, lv: data.lv, exp: data.exp, expNext: data.expNext,
      hp: data.hp, maxhp: data.maxhp, mp: data.mp, maxmp: data.maxmp,
      atk: data.atk, def: data.def, gold: data.gold, skills: (data.skills || []).slice(),
      x: data.px, y: data.py,
    });
    p.boughtSkills = (data.boughtSkills || []).slice();
    p.party = (data.party || []).map(m => {
      const lv = (data.lv || p.lv || 1);
      return {
        skills: [], equip: { weapon: null, armor: null },
        maxmp: 6 + lv * 2, mp: 6 + lv * 2,
        ...m,
        equip: { weapon: null, armor: null, ...(m.equip || {}) },
        skills: Array.isArray(m.skills) ? m.skills.slice() : [],
      };
    });
    if (data.equipOwned) p.equipOwned = data.equipOwned.slice();
    if (data.equip) p.equip = { weapon: data.equip.weapon || null, armor: data.equip.armor || null };
    const co = data.chestsOpened;
    if (co && !Array.isArray(co)) {                               // per-area map (current format)
      for (const id in this.areas) {
        const cs = this.areas[id].chests; if (cs && co[id]) cs.forEach((c, i) => { c.opened = !!co[id][i]; });
      }
    } else if (Array.isArray(co)) {                              // back-compat: flat forest array
      (this.areas.forest.chests || []).forEach((c, i) => { c.opened = !!co[i]; });
    } else if (this.areas.forest.chests && this.areas.forest.chests[0]) {
      this.areas.forest.chests[0].opened = !!data.chestOpened;   // back-compat: v3 single chest
    }
    const dead = data.dead || { forest: data.dead };  // tolerate v1 saves (flat array)
    for (const id in this.areas)
      this.areas[id].enemies.forEach((e, i) => { e.alive = !(dead[id] && dead[id][i]); });
    this.mercSceneDone = !!data.mercSceneDone;
    this.mercDefeated = !!data.mercDefeated;
    // restore the quest log (tolerate old saves with none)
    this.quests = Array.isArray(data.quests) && data.quests.length
      ? data.quests.filter(q => QUESTS[q.id]).map(q => ({ id: q.id, done: !!q.done }))
      : [{ id: "reach_koro", done: false }];
    if (this.mercDefeated) openKoroGate(this.areas.koro);   // restore the opened gate
    this.cutscene = null;
    if (data.difficulty) this.difficulty = data.difficulty;
    this.difficultySel = { casual: 0, normal: 1, hard: 2, hardcore: 3 }[this.difficulty] ?? 1;
    if (data.stats) this.stats = { kills: 0, dmgDealt: 0, skillUses: {}, lastKiller: null, ...data.stats, skillUses: { ...(data.stats.skillUses || {}) } };
    else this.resetRunStats();
    this.runId = data.runId || ("r_load_" + Date.now());
    this.area = this.areas[data.area] ? data.area : "forest";
    this.world = this.areas[this.area];
    this.enemies = this.world.enemies;
    this.npcs = this.world.npcs || [];
    if (p.party.length) this.seedTrail();
    // never resume onto a corpse: repair a missing/zero stat block to the level's
    // formula values (keeps it consistent with the anti-cheat integrity check)
    const eb = this.expectedBase(Number.isFinite(p.lv) && p.lv >= 1 ? p.lv : (p.lv = 1));
    if (!(p.maxhp > 0)) p.maxhp = eb.maxhp;
    if (!(p.maxmp >= 0)) p.maxmp = eb.maxmp;
    if (!(p.atk > 0)) p.atk = eb.atk;
    if (!(p.def > 0)) p.def = eb.def;
    if (!(p.hp > 0)) { p.hp = p.maxhp; p.mp = p.maxmp; }
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

    if (this.cheated) return;                         // frozen on the DON'T CHEAT screen
    if (!this.devMode) this.checkIntegrity();         // catch tampered hero state

    // age out stacked toast notifications (they advance in every screen/state)
    if (this.notifs && this.notifs.length) {
      for (const nft of this.notifs) nft.t -= dt;
      this.notifs = this.notifs.filter(nft => nft.t > 0);
    }

    // area-to-area transition: fade to black, swap rooms, fade back in
    if (this.transition) {
      const tr = this.transition;
      if (tr.phase === "out") {
        this.fade = Math.min(1, this.fade + dt / 300);
        if (this.fade >= 1) { this.enterArea(tr.to, tr.entry, tr.autosave); tr.phase = "in"; }
      } else {
        this.fade = Math.max(0, this.fade - dt / 450);
        if (this.fade <= 0) { this.transition = null; this.showQueuedDialogue(); }
      }
      if (this.flash) { this.flash.t -= dt; if (this.flash.t <= 0) this.flash = null; }
      if (this.autosaveAnim) { this.autosaveAnim.t -= dt; if (this.autosaveAnim.t <= 0) this.autosaveAnim = null; }
      return;
    }

    // fade-in on load; fade-out then switch when transitioning
    if (this.exiting) {
      this.fade = Math.min(1, this.fade + dt / 380);
      if (this.fade >= 1) {
        this.state = this.exitTo; this.exiting = false;
        if (this.state === "overworld" && !this.introShown) { this.introShown = true; this.startIntro(); }
        else if (this.state === "overworld") this.showQueuedDialogue();
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

    // enemies animate (idle / alert); count down timers
    for (const e of this.enemies) if (e.alive) e.animT += dt;
    if (this.encounterCD > 0) this.encounterCD -= dt;
    if (this.bossTalkCD > 0) this.bossTalkCD -= dt;
    if (this.portalCD > 0) this.portalCD -= dt;
    for (const n of (this.npcs || [])) n.animT += dt;
    if (this.autosaveAnim) { this.autosaveAnim.t -= dt; if (this.autosaveAnim.t <= 0) this.autosaveAnim = null; }

    if (this.encounter) { this.updateEncounter(dt); return; }
    if (this.cutscene) { this.updateCutscene(dt); return; }   // scripted scene: actors move, player frozen
    if (this.ui || this.dialogue || this.prompt || this.shop || this.naming) { p.moving = false; p.frame = 0; return; }  // paused for UI

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

    // record the hero's pose so party followers can trail behind
    if (p.party.length) {
      this.trail.unshift({ x: p.x, y: p.y, face: p.face, moving: p.moving, frame: p.frame });
      if (this.trail.length > 120) this.trail.length = 120;
    }

    if (!this.dialogue && this.checkExits()) return;
    if (!this.dialogue && this.checkPortals()) return;
    if (!this.dialogue) this.checkEnemyProximity();
  }

  /* leave through a doorway in the wall -> begin a fade to the next room */
  checkExits() {
    if (this.transition) return false;
    const p = this.player, tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    for (const ex of (this.world.exits || [])) {
      if (ty < ex.ty0 || ty > ex.ty1) continue;
      const at = ex.side === "east" ? tx >= MAP_W - 2 : tx <= 1;
      if (at) { this.goToArea(ex.to, ex.entry, ex.autosave); return true; }
    }
    return false;
  }

  /* step onto a house door tile -> fade into / out of the interior */
  checkPortals() {
    if (this.transition || this.portalCD > 0) return false;
    const p = this.player, tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    for (const d of (this.world.portals || [])) {
      if (tx === d.tx && ty === d.ty) { this.goToArea(d.to, d.entry, false); return true; }
    }
    return false;
  }

  checkEnemyProximity() {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const cfg = ENEMY_TYPES[e.type];
      const d = Math.hypot(p.x - e.x, p.y - (e.y - TILE / 2));
      if (cfg.boss) {                                 // the troll: gated by level
        if (d < TILE * 2.6 && !(this.bossTalkCD > 0)) {
          this.bossTalkCD = 5000;
          if (this.player.lv < 4) {                   // too weak — only a warning
            this.dialogue = { name: this.player.name, page: 0, lines: [
              ["A monstrous troll fills the lair,", "club dragging across the stone.", "It hasn't noticed me... yet."],
              ["I'm no match for it now.", "Best slip back the way I came."],
            ]};
          } else {                                    // ready — offer the fight
            this.prompt = { sel: 0, target: e, text: "Are you sure you want to start the fight?" };
          }
        }
      } else if (!(this.encounterCD > 0) && d < TILE * 1.7) {
        this.encounter = { phase: "roar", t: 0, target: e };
        e.anim = "alert"; e.animT = 0; this.audio.play("encounter"); return;
      }
    }
  }

  /* answer the yes/no fight prompt */
  resolvePrompt(yes) {
    const target = this.prompt.target; this.prompt = null;
    if (!yes) { this.bossTalkCD = 1200; return; }     // back off; re-ask shortly
    this.encounter = { phase: "roar", t: 0, target };
    target.anim = "alert"; target.animT = 0; this.audio.play("encounter");
  }

  /* begin a fade-out; enterArea swaps the room once the screen is black */
  goToArea(to, entry, autosave) {
    this.transition = { to, entry, autosave: !!autosave, phase: "out" };
    this.encounter = null; this.player.moving = false; this.player.frame = 0;
  }
  enterArea(id, side, autosave) {
    this.area = id; this.world = this.areas[id]; this.enemies = this.world.enemies;
    this.npcs = this.world.npcs || [];
    const e = (this.world.entries && this.world.entries[side]) || this.world.spawn;
    this.player.x = e.tx * TILE + TILE / 2;
    this.player.y = e.ty * TILE + TILE / 2;
    this.encounter = null; this.dialogue = null; this.shop = null; this.encounterCD = 1200; this.bossTalkCD = 0;
    this.portalCD = 600;     // brief grace so we don't instantly re-trigger the door we arrived on
    this.updateQuestsForArea(id);
    if (this.player.party.length) this.seedTrail();
    if (autosave && this.difficulty !== "hardcore") { this.saveGame(true); this.autosaveAnim = { t: 2000 }; }
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
  /* "hero" -> player; "ally" -> party member (or null if no ally). */
  getChar(target) {
    if (target === "ally") return this.player.party.find(m => m.id === "ally") || null;
    return this.player;
  }
  equipBonusFor(c, stat) {
    if (!c || !c.equip) return 0;
    let s = 0;
    for (const slot of EQUIP_SLOTS) { const id = c.equip[slot]; if (id) s += EQUIP_BY_ID[id][stat] || 0; }
    return s;
  }
  atkTotalFor(c) { return (c?.atk || 0) + this.equipBonusFor(c, "atk"); }
  defTotalFor(c) { return (c?.def || 0) + this.equipBonusFor(c, "def"); }
  equipBonus(stat) { return this.equipBonusFor(this.player, stat); }
  atkTotal() { return this.atkTotalFor(this.player); }
  defTotal() { return this.defTotalFor(this.player); }
  /* Slot count for a character (hero or ally) — driven off the hero's level. */
  slotCountFor() { return Math.floor(this.player.lv / 3); }

  /* pick the music track that matches the current screen (no-op if unchanged) */
  updateMusic() {
    const s = this.state;
    const track = s === "battle" ? "battle"
      : s === "overworld" ? "overworld"
      : (s === "title" || s === "difficulty" || s === "name" || s === "saveselect") ? "title"
      : null;
    this.audio.playMusic(track);
  }

  loop(t) {
    const dt = Math.min(50, t - this.last); this.last = t;
    this.update(dt);
    this.updateMusic();
    this.render();
    requestAnimationFrame(tt => this.loop(tt));
  }
}
