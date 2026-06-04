/* Game battle methods (attached to the prototype) */
Object.assign(Game.prototype, {

  /* ------------------------------- battle -------------------------------- */
  enterBattle(target) {
    this.state = "battle"; this.fade = 0;
    const cfg = ENEMY_TYPES[target.type];
    const am = this.player.party.find(m => m.id === "ally");   // Elara fights alongside the hero
    const m = { casual: 0.45, normal: 1, hard: 1.30, hardcore: 1.55 }[this.difficulty] ?? 1;
    const eHp = Math.max(1, Math.round(cfg.hp * m));
    const eAtk = Math.max(1, Math.round(cfg.atk * m));
    this.battle = {
      target, cfg,
      enemy: { name: cfg.name, hp: eHp, maxhp: eHp, atk: eAtk, def: cfg.def, hurtT: 0, dead: false, deathT: 0,
               meter: 0, meterMax: cfg.skillMeter || 60 },   // hidden charge meter for enemy skills
      ally: am ? {
        name: am.name, sprite: am.sprite, lv: am.lv ?? this.player.lv,
        // pull in her current pools and equip bonuses so battle reads everything off `b.ally`
        hp: am.hp ?? am.maxhp, maxhp: am.maxhp,
        mp: am.mp ?? (am.maxmp ?? 0), maxmp: am.maxmp ?? 0,
        atk: this.atkTotalFor(am), def: this.defTotalFor(am),
        skills: Array.isArray(am.skills) ? am.skills.slice() : [],
        hurtT: 0, ko: false, lunge: 0,
      } : null,
      heroCmds: ["Attack", "Skill", "Defend", "Item", "Run"],
      allyCmds: ["Attack", "Skill", "Defend", "Item", "Run"],
      actor: "hero",
      cmds: ["Attack", "Skill", "Defend", "Item", "Run"], sel: 0,
      phase: "intro", step: "", timer: 1100, msg: cfg.intro,
      heroKO: false,
      heroLunge: 0, eLunge: 0, heroHurt: 0, allyLunge: 0, enemySkill: null, skillFlash: null,
      defending: false, allyDefending: false, shieldBuff: false, allyShieldBuff: false,
      floats: [], animT: 0, fx: null, sub: null,
    };
  },
  battleMsg(s) { this.battle.msg = s; },
  calcDmg(atk, def) { return Math.max(1, atk - def + (Math.floor(Math.random() * 4) - 1)); },
  addFloat(who, val, color) { this.battle.floats.push({ who, text: "" + val, color, t: 900 }); },

  /* the enemy lands a blow on "hero" or "ally": applies defend/shield mitigation,
     hp + KO bookkeeping, and a damage float. Returns the damage dealt. */
  enemyHit(who, atkVal, announce) {
    const b = this.battle;
    if (who === "ally") {
      let dmg = this.calcDmg(atkVal, b.ally.def);
      if (b.allyShieldBuff) { dmg = Math.max(1, Math.floor(dmg * 0.3)); b.allyShieldBuff = false; }
      else if (b.allyDefending) dmg = Math.max(1, Math.floor(dmg / 2));
      b.ally.hp = Math.max(0, b.ally.hp - dmg); b.ally.hurtT = 400;
      this.addFloat("ally", dmg, "#ff8a8a");
      b.enemy.meter += Math.ceil(dmg * 0.5);          // dealing damage also charges its meter
      if (b.ally.hp <= 0) { b.ally.ko = true; this.battleMsg(b.ally.name + " is knocked out!"); }
      else if (announce) this.battleMsg(b.ally.name + " takes " + dmg + " damage!");
      return dmg;
    }
    let dmg = this.calcDmg(atkVal, this.defTotal());
    if (b.shieldBuff) { dmg = Math.max(1, Math.floor(dmg * 0.3)); b.shieldBuff = false; }
    else if (b.defending) dmg = Math.max(1, Math.floor(dmg / 2));
    this.player.hp = Math.max(0, this.player.hp - dmg); b.heroHurt = 400;
    this.addFloat("hero", dmg, "#ff8a8a");
    b.enemy.meter += Math.ceil(dmg * 0.5);            // dealing damage also charges its meter
    // a fallen hero is only "down", not game over, while Elara still stands
    if (this.player.hp <= 0 && !b.heroKO) { b.heroKO = true; this.battleMsg(this.player.name + " is knocked out!"); }
    else if (announce) this.battleMsg(this.player.name + " takes " + dmg + " damage!");
    return dmg;
  },

  /* resolve a charged enemy skill (called at the impact frame) */
  applyEnemySkill(sk) {
    const b = this.battle, e = b.enemy, nm = "The " + e.name;
    if (sk.kind === "heal") {
      const amt = Math.round(e.maxhp * (sk.heal || 0.25));
      const heal = Math.min(amt, e.maxhp - e.hp); e.hp += heal;
      this.addFloat("enemy", "+" + heal, "#9cf0a0");
      this.battleMsg(nm + " recovers " + heal + " HP!");
    } else if (sk.kind === "buff") {
      e.atk = Math.round(e.atk * (sk.buff || 1.3));
      this.battleMsg(nm + " works into a frenzy — its attack rises!");
    } else if (sk.kind === "double") {
      const atk = Math.round(e.atk * (sk.power || 1));
      this.enemyHit("hero", atk, false);
      if (b.ally && !b.ally.ko) this.enemyHit("ally", atk, false);
      this.battleMsg(nm + "'s " + sk.name + " tears through the party!");
    } else { // "hit" — a heavy single-target strike
      const allyUp = b.ally && !b.ally.ko;
      const who = b.heroKO ? "ally" : (allyUp && Math.random() < 0.4 ? "ally" : "hero");
      this.enemyHit(who, Math.round(e.atk * (sk.power || 1.5)), true);
    }
  },

  grantRewards() {
    const p = this.player, b = this.battle, cfg = b.cfg, exp = cfg.exp, gold = cfg.gold;
    p.gold += gold;
    const levelups = [];                             // one entry per character who leveled

    // --- hero ---
    {
      const fromLv = p.lv, gains = { hp: 0, mp: 0, atk: 0, def: 0 }, newSkills = [];
      p.exp += exp;
      while (p.exp >= p.expNext) {                    // possibly several levels
        p.exp -= p.expNext; p.lv++; p.expNext += 12;
        p.maxhp += 6; p.maxmp += 2; p.atk += 2; p.def += 1;
        gains.hp += 6; gains.mp += 2; gains.atk += 2; gains.def += 1;
      }
      if (p.lv > fromLv) {
        p.hp = p.maxhp; p.mp = p.maxmp;
        for (const s of SKILLS) if (s.unlock > fromLv && s.unlock <= p.lv) newSkills.push(s.name);
        const totals = { hp: p.maxhp, mp: p.maxmp, atk: p.atk, def: p.def };
        levelups.push({ name: p.name, fromLv, toLv: p.lv, gains, totals, newSkills });
      }
    }

    // --- Elara (each recruited ally levels up too) ---
    for (const am of p.party) {
      if (am.id !== "ally") continue;
      if (am.lv == null) { am.lv = p.lv; am.exp = 0; am.expNext = 24 + (am.lv - 1) * 12; }  // back-compat for old saves
      const fromLv = am.lv, gains = { hp: 0, mp: 0, atk: 0, def: 0 };
      am.exp += exp;
      while (am.exp >= am.expNext) {
        am.exp -= am.expNext; am.lv++; am.expNext += 12;
        am.maxhp += 5; am.maxmp += 2; am.atk += 2; am.def += 1;
        gains.hp += 5; gains.mp += 2; gains.atk += 2; gains.def += 1;
      }
      if (am.lv > fromLv) {
        am.hp = am.maxhp; am.mp = am.maxmp;            // level-up fully restores (and revives) her
        if (b.ally) {                                 // reflect into the live battle copy so it shows + persists
          b.ally.ko = false; b.ally.lv = am.lv;
          b.ally.hp = am.hp; b.ally.maxhp = am.maxhp;
          b.ally.mp = am.mp; b.ally.maxmp = am.maxmp;
          b.ally.atk = this.atkTotalFor(am); b.ally.def = this.defTotalFor(am);
        }
        const totals = { hp: am.maxhp, mp: am.maxmp, atk: am.atk, def: am.def };
        levelups.push({ name: am.name, fromLv, toLv: am.lv, gains, totals, newSkills: [] });
      }
    }

    // gear drop (e.g. goblins drop the Rusty Dagger)
    let drop = null;
    if (cfg.drop && Math.random() < cfg.drop.rate) {
      const g = EQUIP_BY_ID[cfg.drop.id];
      if (!p.equipOwned.includes(g.id)) p.equipOwned.push(g.id);
      drop = g.name;
    }
    b.levelups = levelups; b.levelIdx = 0;
    b.reward = { exp, gold, drop, leveled: levelups.length > 0 };
  },
  enemyDies() {
    const b = this.battle;
    b.phase = "enemy_die"; b.timer = 1300; b.enemy.dead = true; b.enemy.deathT = 0;
    this.stats.kills++;
    this.battleMsg("The " + b.enemy.name + " collapses!");
  },
  afterHeroAction() {
    const b = this.battle;
    if (b.enemy.hp <= 0) return this.enemyDies();
    if (b.ally && !b.ally.ko) {                       // Elara now picks her own action
      b.actor = "ally"; b.cmds = b.allyCmds.slice();
      b.sel = 0; b.phase = "menu"; b.msg = "";
      b.allyDefending = false;
      return;
    }
    b.actor = "hero";
    b.phase = "enemy_pre"; b.timer = 600;
  },
  afterAllyAction() {
    const b = this.battle;
    if (b.enemy.hp <= 0) return this.enemyDies();
    b.actor = "hero";
    b.phase = "enemy_pre"; b.timer = 600;
  },
  /* begin the next round: the hero acts, unless he's down — then Elara carries on.
     Game over only fires when every party member has fallen. */
  startHeroTurn() {
    const b = this.battle;
    const allyUp = b.ally && !b.ally.ko;
    if (!b.heroKO) {
      b.actor = "hero"; b.cmds = b.heroCmds.slice();
      b.sel = 0; b.phase = "menu"; b.msg = "";
    } else if (allyUp) {
      b.actor = "ally"; b.cmds = b.allyCmds.slice();
      b.sel = 0; b.phase = "menu"; b.msg = ""; b.allyDefending = false;
    } else {
      this.stats.lastKiller = b.enemy.name;
      b.phase = "lose"; b.msg = this.player.name + " has fallen...  (ENTER)";
    }
  },
  endBattle(result) {
    const tgt = this.battle && this.battle.target;
    // persist Elara's hp/mp back to the party member before tearing down the battle state
    if (this.battle && this.battle.ally) {
      const am = this.player.party.find(m => m.id === "ally");
      if (am) {
        am.hp = Math.max(0, this.battle.ally.hp);
        if (typeof am.maxmp === "number") am.mp = Math.max(0, this.battle.ally.mp);
        if (am.hp <= 0) am.hp = 1;                    // revive at 1 HP if she fell during battle
      }
    }
    if (result !== "lose" && this.player.hp <= 0) this.player.hp = 1;  // a downed hero comes to after the fight
    this.battle = null; this.encounterCD = 1700;
    if (result === "lose") {                          // -> You Died screen with run stats
      this.beginGameOver();
      return;
    }
    if (result === "win" && tgt) {
      tgt.alive = false;                              // slain
      if (ENEMY_TYPES[tgt.type].boss) { this.beginBossOutro(); return; }
      // back away from where it stood, but only onto open ground (rooms have walls)
      const ny = this.player.y + TILE * 2.2;
      if (!this.blockedAt(this.player.x, ny)) this.player.y = ny;
    }
    // We're already standing in the overworld, so don't fade out to black and
    // back in (that read as an extra blackout). Just hold black and fade in once.
    this.state = "overworld"; this.exiting = false; this.exitTo = null;
    this.fade = 1;
    this.showQueuedDialogue();
  },

  /* troll defeated: hero speaks -> fade to black -> arrive in Koro -> speak again */
  beginBossOutro() {
    const nm = this.player.name;
    this.queuedDialogue = {
      name: nm, page: 0,
      lines: [
        ["A Troll? Koro must be in dire trouble", "if a Troll has reached this close to the city."],
        ["Koro can't be far now.", "I'll rest within its walls."],
      ],
      onClose: () => {
        this.queuedDialogue = {
          name: nm, page: 0,
          lines: [
            ["The Town of Koro.", "Civilization, at last.", "Greenwood is behind me."],
            ["I shall meet my contact at the", "Dragon Den Inn."],
          ],
        };
        this.goToArea("koro", "enter", true);         // fade to black -> Koro (autosaves)
      },
    };
    this.beginTransition("overworld");                // fade back into the lair first
  },

  battleKey(key) {
    const b = this.battle; if (!b) return;
    const enter = key === "enter" || key === " ";
    if (b.phase === "victory") { if (enter) (b.reward.leveled ? (b.phase = "levelup", b.levelT = 0, b.levelIdx = 0) : this.endBattle("win")); return; }
    if (b.phase === "levelup") {
      if (enter) {
        b.levelIdx++;
        if (b.levelIdx < b.levelups.length) b.levelT = 0;   // show the next character's screen
        else this.endBattle("win");
      }
      return;
    }
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
  },

  chooseCommand(cmd) {
    const b = this.battle;
    const ally = b.actor === "ally";
    if (ally) b.allyDefending = false; else b.defending = false;
    if (cmd === "Attack") {
      if (ally) { b.phase = "ally_attack"; b.step = "lunge"; b.timer = 260; b.allyLunge = 0; }
      else { b.phase = "hero_attack"; b.step = "lunge"; b.timer = 260; b.heroLunge = 0; }
    }
    else if (cmd === "Defend") {
      if (ally) {
        b.allyDefending = true;
        this.battleMsg(b.ally.name + " takes a guarded stance.");
        this.afterAllyAction();
      } else {
        b.defending = true;
        this.battleMsg(this.player.name + " takes a guarded stance.");
        this.afterHeroAction();
      }
    }
    else if (cmd === "Skill") {
      const src = ally ? b.ally.skills : this.player.skills;
      const eq = (src || []).filter(Boolean);
      if (!eq.length) { this.battleMsg("No skills equipped! (set them in menu after battle)"); return; }
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
  },

  confirmSub() {
    const b = this.battle, p = this.player;
    const ally = b.actor === "ally";
    const after = () => ally ? this.afterAllyAction() : this.afterHeroAction();

    if (b.sub.type === "item") {
      const it = b.sub.list[b.sub.sel];
      const amt = it.name === "Potion" ? 25 : 8;
      it.qty--;
      if (ally) {
        const heal = Math.min(amt, b.ally.maxhp - b.ally.hp); b.ally.hp += heal;
        this.addFloat("ally", "+" + heal, "#9cf0a0");
        this.battleMsg(b.ally.name + " uses " + it.name + ". +" + heal + " HP");
      } else {
        const heal = Math.min(amt, p.maxhp - p.hp); p.hp += heal;
        this.addFloat("hero", "+" + heal, "#9cf0a0");
        this.battleMsg(p.name + " uses " + it.name + ". +" + heal + " HP");
      }
      b.sub = null;
      after();
      return;
    }
    // skill
    const sk = SKILL_BY_ID[b.sub.list[b.sub.sel]];
    const caster = ally ? b.ally : p;
    if (caster.mp < sk.mp) { this.battleMsg("Not enough MP for " + sk.name + "!"); return; }
    caster.mp -= sk.mp; b.sub = null; b.skill = sk;
    this.stats.skillUses[sk.id] = (this.stats.skillUses[sk.id] || 0) + 1;
    if (sk.kind === "heal") {
      const heal = Math.min(sk.power, caster.maxhp - caster.hp); caster.hp += heal;
      this.addFloat(ally ? "ally" : "hero", "+" + heal, "#9cf0a0");
      this.battleMsg(caster.name + " casts Healing. +" + heal + " HP");
      after();
    } else if (sk.kind === "shield") {
      if (ally) { b.allyShieldBuff = true; } else { b.shieldBuff = true; }
      this.battleMsg(caster.name + " raises the Blue Shield!");
      after();
    } else { // fire / bolt damage skill
      if (ally) {
        b.phase = "ally_skill"; b.step = "cast"; b.timer = 520; b.allyLunge = 0;
      } else {
        b.phase = "hero_skill"; b.step = "cast"; b.timer = 520; b.heroLunge = 0;
      }
      b.fx = { kind: sk.kind, t: 0 };
      this.battleMsg(caster.name + " unleashes " + sk.name + "!");
    }
  },

  updateBattle(dt) {
    const b = this.battle; if (!b) return;
    b.animT += dt; b.timer -= dt;
    if (b.enemy.hurtT > 0) b.enemy.hurtT -= dt;
    if (b.heroHurt > 0) b.heroHurt -= dt;
    if (b.ally && b.ally.hurtT > 0) b.ally.hurtT -= dt;   // otherwise her hurt frame sticks forever
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
            this.stats.dmgDealt += dmg; b.enemy.meter += dmg;   // taking hits charges its skill meter
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
            this.stats.dmgDealt += dmg; b.enemy.meter += dmg;   // taking hits charges its skill meter
            this.addFloat("enemy", dmg, sk.kind === "fire" ? "#ffb24a" : "#9fd8ff");
            this.battleMsg(sk.name + " hits for " + dmg + "!");
            b.step = "impact"; b.timer = 520;
          }
        } else if (b.timer <= 0) { b.fx = null; this.afterHeroAction(); }
        break;
      case "ally_pre":
        if (b.timer <= 0) { b.phase = "ally_attack"; b.step = "lunge"; b.timer = 260; b.allyLunge = 0; this.battleMsg(b.ally.name + " strikes!"); }
        break;
      case "ally_attack":
        if (b.step === "lunge") {
          b.allyLunge = Math.min(1, 1 - b.timer / 260);
          if (b.timer <= 0) {
            const dmg = this.calcDmg(b.ally.atk, b.enemy.def);
            b.enemy.hp = Math.max(0, b.enemy.hp - dmg); b.enemy.hurtT = 380;
            this.stats.dmgDealt += dmg; b.enemy.meter += dmg;   // taking hits charges its skill meter
            this.addFloat("enemy", dmg, "#ffd0a0");
            this.battleMsg(b.ally.name + " hits for " + dmg + "!");
            b.step = "return"; b.timer = 380;
          }
        } else {
          b.allyLunge = Math.max(0, b.timer / 380);
          if (b.timer <= 0) this.afterAllyAction();
        }
        break;
      case "ally_skill":
        if (b.step === "cast") {
          if (b.timer <= 0) {
            const sk = b.skill;
            const base = b.ally.atk * sk.power + (sk.kind === "bolt" ? 10 : 6);
            const dmg = Math.max(1, Math.round(base) - b.enemy.def + (Math.floor(Math.random() * 5) - 2));
            b.enemy.hp = Math.max(0, b.enemy.hp - dmg); b.enemy.hurtT = 420;
            this.stats.dmgDealt += dmg; b.enemy.meter += dmg;   // taking hits charges its skill meter
            this.addFloat("enemy", dmg, sk.kind === "fire" ? "#ffb24a" : "#9fd8ff");
            this.battleMsg(sk.name + " hits for " + dmg + "!");
            b.step = "impact"; b.timer = 520;
          }
        } else if (b.timer <= 0) { b.fx = null; this.afterAllyAction(); }
        break;
      case "enemy_pre":
        if (b.timer <= 0) {
          // when the hidden meter is full, the enemy unleashes one of its two skills
          if (b.enemy.meter >= b.enemy.meterMax && b.cfg.skills && b.cfg.skills.length) {
            b.enemy.meter = 0;
            b.enemy.meterMax = Math.round(b.enemy.meterMax * 1.5);   // each use makes the next cost 50% more
            b.enemySkill = b.cfg.skills[(Math.random() * b.cfg.skills.length) | 0];
            b.phase = "enemy_skill"; b.step = "wind"; b.timer = 1680; b.eLunge = 0;   // hold the "uses skill" banner ~3x longer
            this.battleMsg("The " + b.enemy.name + " uses " + b.enemySkill.name + "!");
          } else {
            b.phase = "enemy_attack"; b.step = "lunge"; b.timer = 300; b.eLunge = 0;
            this.battleMsg("The " + b.enemy.name + " attacks!");
          }
        }
        break;
      case "enemy_attack":
        if (b.step === "lunge") {
          b.eLunge = Math.min(1, 1 - b.timer / 300);
          if (b.timer <= 0) {
            // the enemy sometimes lunges at Elara instead of the hero
            // (and always targets her if the hero is already down)
            const allyUp = b.ally && !b.ally.ko;
            const atAlly = allyUp && (b.heroKO || Math.random() < 0.4);
            this.enemyHit(atAlly ? "ally" : "hero", b.enemy.atk, true);
            b.step = "return"; b.timer = 420;
          }
        } else {
          b.eLunge = Math.max(0, b.timer / 420);
          if (b.timer <= 0) this.startHeroTurn();
        }
        break;
      case "enemy_skill":
        if (b.step === "wind") {
          b.eLunge = Math.min(1, 1 - b.timer / 1680);
          if (b.timer <= 0) { this.applyEnemySkill(b.enemySkill); b.step = "impact"; b.timer = 620; b.skillFlash = b.enemySkill.kind; }
        } else {
          b.eLunge = Math.max(0, b.timer / 620);
          if (b.timer <= 0) { b.skillFlash = null; this.startHeroTurn(); }
        }
        break;
      case "enemy_die":
        b.enemy.deathT += dt;
        if (b.timer <= 0) { this.grantRewards(); b.phase = "victory"; b.victoryT = 0; b.msg = ""; }
        break;
      case "flee": if (b.timer <= 0) this.endBattle("flee"); break;
    }
  },

  drawBattleSprite(img, cx, baseY, targetH, flip) {
    const ctx = this.ctx, w = targetH * (img.width / img.height);
    ctx.save();
    if (flip) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
    ctx.drawImage(img, cx - w / 2, baseY - targetH, w, targetH);
    ctx.restore();
  },

  /* a weapon swung in the attacker's forward hand during an Attack.
     swing 0 = wound up over the shoulder, 1 = chopped forward toward the foe.
     facing left (toward the enemy) unless `faceRight`. */
  drawHandWeapon(cx, baseY, charH, swing, weaponId, faceRight) {
    const ctx = this.ctx, dir = faceRight ? -1 : 1;     // dir 1 = thrust to the left
    const eq = weaponId && EQUIP_BY_ID[weaponId];
    const dagger = eq && /dagger/i.test(eq.id);
    const len = charH * (dagger ? 0.34 : 0.52);
    // a forward thrust: the blade stays level, leveled at the foe, and jabs
    // forward along the facing direction as the swing builds (no overhead chop)
    const reach = swing * charH * 0.5;
    const hx = cx - dir * (charH * 0.1 + reach), hy = baseY - charH * 0.42;
    const angle = -dir * Math.PI / 2 + dir * 0.08;      // blade held horizontal, point toward the foe
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle);
    if (dir < 0) ctx.scale(-1, 1);                      // keep art upright when facing right
    const img = eq && eq.sprite && this.art[eq.sprite];
    if (img) {
      const w = len * (img.width / img.height);
      ctx.drawImage(img, -w / 2, -len, w, len);
    } else {
      this.drawBlade(len, dagger);
    }
    ctx.restore();
  },
  /* a simple procedural sword/dagger, hilt at the origin, blade pointing up (-y) */
  drawBlade(len, dagger) {
    const ctx = this.ctx, bw = Math.max(4, len * (dagger ? 0.16 : 0.11));
    ctx.fillStyle = "#5a3a1c";                          // grip
    ctx.fillRect(-bw * 0.45, 0, bw * 0.9, len * 0.2);
    ctx.fillStyle = "#3a2410";                          // pommel
    ctx.beginPath(); ctx.arc(0, len * 0.2, bw * 0.55, 0, 7); ctx.fill();
    ctx.fillStyle = "#caa83c";                          // crossguard
    ctx.fillRect(-bw * 1.5, -2, bw * 3, 5);
    ctx.beginPath();                                    // blade
    ctx.moveTo(-bw * 0.7, 0); ctx.lineTo(bw * 0.7, 0);
    ctx.lineTo(bw * 0.32, -len * 0.85); ctx.lineTo(0, -len); ctx.lineTo(-bw * 0.32, -len * 0.85);
    ctx.closePath();
    const g = ctx.createLinearGradient(-bw, 0, bw, 0);
    g.addColorStop(0, "#8b97a4"); g.addColorStop(0.5, "#f2f6fa"); g.addColorStop(1, "#717d8b");
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = "rgba(40,50,60,0.5)"; ctx.lineWidth = 1; ctx.stroke();
  },

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
    const ayX = W * 0.88, ayBaseY = H * 0.55;        // Elara stands behind & right of the hero

    // --- enemy, faces right toward the hero (sprite groups vary by type) ---
    if (b.phase !== "victory" && b.phase !== "levelup") {
      const A = b.cfg.battle;
      const nf = g => ANIM_FRAMES[g] - 1;             // last frame index of a group
      let grp = A.idle, fr = 0, eOff = 0, jitter = 0;
      if (b.enemy.dead) { grp = A.death; fr = Math.min(nf(grp), (b.enemy.deathT / (1000 / 6)) | 0); }
      else if (b.enemy.hurtT > 0) { grp = A.hurt; fr = Math.min(nf(grp), ((380 - b.enemy.hurtT) / (380 / ANIM_FRAMES[grp])) | 0); jitter = (Math.random() - 0.5) * 6; }
      else if (b.phase === "enemy_attack" || b.phase === "enemy_skill") { grp = A.attack; fr = Math.min(nf(grp), (b.eLunge * ANIM_FRAMES[grp]) | 0); eOff = b.eLunge * (b.phase === "enemy_skill" ? 60 : 80); }
      else { grp = A.idle; fr = ((b.animT / 180) | 0) % ANIM_FRAMES[grp]; }
      const eAlpha = b.enemy.dead ? Math.max(0, 1 - b.enemy.deathT / 1300) : 1;
      ctx.globalAlpha = eAlpha;
      this.drawBattleSprite(art[`${grp}_${fr}`], exX + eOff + jitter, eBaseY, H * A.h, A.flip);
      ctx.globalAlpha = 1;
    }

    // --- hero, faces left toward the enemy ---
    let hOff = 0, hjit = 0;
    if (b.phase === "hero_attack") hOff = -b.heroLunge * 90;
    if (b.heroHurt > 0) hjit = (Math.random() - 0.5) * 7;
    const casting = b.phase === "hero_skill";
    const hFrame = (b.phase === "hero_attack" && b.step === "lunge") || casting ? art.walk_2 : art.idle;
    if (b.phase !== "victory" && b.phase !== "levelup") {
      ctx.globalAlpha = b.heroKO ? 0.4 : 1;           // a downed hero is greyed out
      const hcx = hxX + hOff + hjit;
      this.drawBattleSprite(hFrame, hcx, hBaseY, H * 0.26, false);
      if (b.phase === "hero_attack") this.drawHandWeapon(hcx, hBaseY, H * 0.26, b.heroLunge, this.player.equip.weapon, false);
      ctx.globalAlpha = 1;
    }

    // --- Elara, fighting beside the hero ---
    if (b.ally && b.phase !== "victory" && b.phase !== "levelup") {
      let aOff = 0, ajit = 0, aImg = art.ally_idle;
      if (b.ally.ko) aImg = art.ally_hurt;
      else if (b.ally.hurtT > 0) { aImg = art.ally_hurt; ajit = (Math.random() - 0.5) * 6; }
      else if (b.phase === "ally_attack" && b.step === "lunge") { aImg = art.ally_walk_1; aOff = -b.allyLunge * 80; }
      const bob = b.ally.ko ? 0 : Math.sin(b.animT / 300) * 2;
      const acx = ayX + aOff + ajit;
      ctx.globalAlpha = b.ally.ko ? 0.45 : 1;
      this.drawBattleSprite(aImg, acx, ayBaseY + bob, H * 0.22, false);
      if (b.phase === "ally_attack") {
        const am = this.player.party.find(m => m.id === "ally");
        this.drawHandWeapon(acx, ayBaseY + bob, H * 0.22, b.allyLunge, am && am.equip && am.equip.weapon, false);
      }
      ctx.globalAlpha = 1;
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
      const fx = f.who === "enemy" ? exX : f.who === "ally" ? ayX : hxX;
      const fy = (f.who === "enemy" ? eBaseY : f.who === "ally" ? ayBaseY : hBaseY) - H * 0.22 - rise;
      ctx.globalAlpha = Math.min(1, f.t / 300);
      this.text(f.text, fx, fy, { align: "center", size: 30, bold: true, color: f.color });
      ctx.globalAlpha = 1;
    }

    // --- enemy-skill impact flash (color cues the kind of skill) ---
    if (b.phase === "enemy_skill" && b.step === "impact" && b.skillFlash) {
      const fade = Math.max(0, b.timer / 620);
      const col = b.skillFlash === "heal" ? "120,220,120"
        : b.skillFlash === "buff" ? "240,150,40" : "210,40,40";
      ctx.fillStyle = `rgba(${col},${0.32 * fade})`; ctx.fillRect(0, 0, W, H);
    }

    // --- boss banner (top): name in big text + a wide red HP bar ---
    const boss = b.cfg.boss;
    if (boss && b.phase !== "victory" && b.phase !== "levelup") {
      const bw = Math.min(W - 120, 720), bx = (W - bw) / 2, bh = 22, byr = 56;
      this.text("WARDEN OF GREENWOOD FOREST", W / 2, 42,
        { align: "center", size: Math.min(34, W * 0.034), bold: true, color: "#ff5a5a" });
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath(); ctx.roundRect(bx, byr, bw, bh, 6); ctx.fill();
      const frac = Math.max(0, b.enemy.hp / b.enemy.maxhp);
      const fg = ctx.createLinearGradient(0, byr, 0, byr + bh);
      fg.addColorStop(0, "#ff7a6a"); fg.addColorStop(1, "#b01818");
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.roundRect(bx + 2, byr + 2, Math.max(0, (bw - 4) * frac), bh - 4, 5); ctx.fill();
      ctx.strokeStyle = "#ffd0c0"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(bx + 0.5, byr + 0.5, bw - 1, bh - 1, 6); ctx.stroke();
    }

    // --- message bar (top, dropped below the boss banner when present) ---
    if (b.msg) {
      const my = boss ? 92 : 24;
      this.drawWindow(40, my, W - 80, 56);
      this.text(b.msg, W / 2, my + 36, { align: "center", size: 20, color: "#eef1ff" });
    }

    // --- status window (bottom-left) ---
    const sy = H - 150, sh = 126, sw = 320, sr = 40 + sw - 16;
    this.drawWindow(40, sy, sw, sh);
    this.text(p.name, 64, sy + 34, { size: 20, bold: true, color: b.heroKO ? "#e88" : "#ffe9a0" });
    if (b.heroKO) this.text("DOWN", sr, sy + 34, { size: 16, align: "right", color: "#e88" });
    else this.text("LV " + p.lv, sr, sy + 34, { size: 16, align: "right", color: "#cfd6ff" });
    this.text("HP", 64, sy + 66, { size: 15, color: "#bfe8c0" });
    this.text(p.hp + " / " + p.maxhp, sr, sy + 66, { size: 15, align: "right", color: "#eef" });
    this.bar(96, sy + 74, sw - 120, 9, p.hp / p.maxhp, "#5cd06a");
    this.text("MP", 64, sy + 104, { size: 15, color: "#bcd0f0" });
    this.text(p.mp + " / " + p.maxmp, sr, sy + 104, { size: 15, align: "right", color: "#eef" });
    this.bar(96, sy + 112, sw - 120, 9, p.mp / p.maxmp, "#5aa6f0");

    // --- Elara status (its own panel between the hero's panel and the action menu) ---
    if (b.ally) {
      const ax = 40 + sw + 24, ar = ax + sw - 16;
      this.drawWindow(ax, sy, sw, sh);
      this.text(b.ally.name, ax + 24, sy + 34, { size: 20, bold: true, color: b.ally.ko ? "#e88" : "#ffe9a0" });
      if (b.ally.ko) this.text("DOWN", ar, sy + 34, { size: 16, align: "right", color: "#e88" });
      else this.text("LV " + (b.ally.lv || p.lv), ar, sy + 34, { size: 16, align: "right", color: "#cfd6ff" });
      this.text("HP", ax + 24, sy + 66, { size: 15, color: "#bfe8c0" });
      this.text(b.ally.hp + " / " + b.ally.maxhp, ar, sy + 66, { size: 15, align: "right", color: "#eef" });
      this.bar(ax + 56, sy + 74, sw - 120, 9, Math.max(0, b.ally.hp / b.ally.maxhp), "#5cd06a");
      if ((b.ally.maxmp || 0) > 0) {
        this.text("MP", ax + 24, sy + 104, { size: 15, color: "#bcd0f0" });
        this.text(b.ally.mp + " / " + b.ally.maxmp, ar, sy + 104, { size: 15, align: "right", color: "#eef" });
        this.bar(ax + 56, sy + 112, sw - 120, 9, b.ally.mp / b.ally.maxmp, "#5aa6f0");
      }
    }

    // --- bottom-right panel: command list / submenu (the rest are overlays) ---
    if (b.phase === "menu") {
      const cw = 300, bh = 244, cx = W - cw - 40, rh = 34, cyy = H - bh - 24;
      this.drawWindow(cx, cyy, cw, bh);
      const actorName = b.actor === "ally" ? (b.ally && b.ally.name) : this.player.name;
      this.text(actorName + "'s turn", cx + 20, cyy + 30, { size: 15, color: "#9fb0e8" });
      b.cmds.forEach((c, i) => {
        const yy = cyy + 74 + i * rh, sel = i === b.sel;
        if (sel) this.cursor(cx + 26, yy - 8);
        this.text(c, cx + 52, yy, { size: 23, color: sel ? "#ffe9a0" : "#dfe4ff", bold: sel });
      });
    } else if (b.phase === "submenu") this.drawBattleSub();
    else if (b.phase === "victory") this.drawVictory();
    else if (b.phase === "levelup") this.drawLevelUp();
    else if (b.phase === "lose") this.drawLose();
  },

  drawBattleSub() {
    const W = this.cv.width, H = this.cv.height, b = this.battle, sub = b.sub;
    const cw = 320, bh = 244, cx = W - cw - 40, rh = 30, cyy = H - bh - 24;
    const caster = b.actor === "ally" ? b.ally : this.player;
    this.drawWindow(cx, cyy, cw, bh);
    this.text((sub.type === "skill" ? "SKILLS" : "ITEMS") + "  ·  " + caster.name,
      cx + 20, cyy + 30, { size: 15, color: "#9fb0e8" });
    sub.list.forEach((entry, i) => {
      const yy = cyy + 70 + i * rh, sel = i === sub.sel;
      if (sel) this.cursor(cx + 26, yy - 8);
      if (sub.type === "skill") {
        const sk = SKILL_BY_ID[entry], can = caster.mp >= sk.mp;
        this.text(sk.name, cx + 52, yy, { size: 21, color: sel ? "#ffe9a0" : (can ? "#dfe4ff" : "#8890b0"), bold: sel });
        this.text(sk.mp + " MP", cx + cw - 18, yy, { size: 16, align: "right", color: can ? "#9fd8ff" : "#8890b0" });
      } else {
        this.text(entry.name, cx + 52, yy, { size: 21, color: sel ? "#ffe9a0" : "#dfe4ff", bold: sel });
        this.text("x" + entry.qty, cx + cw - 18, yy, { size: 16, align: "right", color: "#cfd6ff" });
      }
    });
    this.text("ESC  back", cx + cw - 18, cyy + bh - 16, { size: 14, align: "right", color: "rgba(220,228,255,.6)" });
  },

  drawVictory() {
    const W = this.cv.width, H = this.cv.height, r = this.battle.reward;
    const pulse = 0.5 + 0.5 * Math.sin(this.t / 180);
    const bw = 460, bh = r.drop ? 232 : 196, bx = (W - bw) / 2, by = H * 0.28;
    this.drawWindow(bx, by, bw, bh);
    this.text("VICTORY!", W / 2, by + 56, { align: "center", size: 42, bold: true, color: `rgb(255,${(200 + 40 * pulse) | 0},120)` });
    this.text("EXP gained", bx + 44, by + 108, { size: 20, color: "#dfe4ff" });
    this.text("+ " + r.exp, bx + bw - 44, by + 108, { align: "right", size: 20, color: "#ffe9a0" });
    this.text("Gold gained", bx + 44, by + 142, { size: 20, color: "#dfe4ff" });
    this.text("+ " + r.gold + " GOLD", bx + bw - 44, by + 142, { align: "right", size: 20, color: "#ffe9a0" });
    if (r.drop) {
      this.text("Found", bx + 44, by + 176, { size: 20, color: "#dfe4ff" });
      this.text(r.drop + "!", bx + bw - 44, by + 176, { align: "right", size: 20, bold: true, color: "#9cf0a0" });
    }
    this.text("Press ENTER", W / 2, by + bh - 14, { align: "center", size: 14, color: "rgba(230,235,255,.7)" });
  },

  drawLevelUp() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx, b = this.battle, t = b.levelT;
    const ups = b.levelups || [], r = ups[b.levelIdx] || { name: "", fromLv: 0, toLv: 0, gains: {}, totals: {}, newSkills: [] };
    const cx = W / 2, cy = H * 0.42, a = 0.28 + 0.18 * Math.sin(this.t / 140);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 340);
    glow.addColorStop(0, `rgba(255,230,150,${a})`); glow.addColorStop(1, "rgba(255,210,80,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) {                    // rising sparkles
      const sx = cx + Math.sin(i * 2.3 + this.t / 400) * (120 + i * 8);
      const sy = cy + 160 - ((this.t / 6 + i * 50) % 320);
      ctx.fillStyle = `rgba(255,240,180,${0.6})`; ctx.fillRect(sx | 0, sy | 0, 3, 3);
    }
    const bw = 440, bh = 330, bx = (W - bw) / 2, by = H * 0.16;
    this.drawWindow(bx, by, bw, bh);
    const pop = Math.min(1, t / 260);
    ctx.save(); ctx.translate(W / 2, by + 54); ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
    this.text("LEVEL  UP!", 0, 0, { align: "center", size: 40, bold: true, color: "#ffe9a0" });
    ctx.restore();
    this.text(r.name, W / 2, by + 92, { align: "center", size: 26, bold: true, color: "#fff3c8" });
    this.text("LV " + r.fromLv + "   →   " + r.toLv, W / 2, by + 124, { align: "center", size: 22, color: "#fff" });
    const tot = r.totals || {};
    const rows = [["Max HP", r.gains.hp, tot.hp], ["Max MP", r.gains.mp, tot.mp], ["Attack", r.gains.atk, tot.atk], ["Defense", r.gains.def, tot.def]];
    rows.forEach(([k, v, total], i) => {
      if (t < 340 + i * 200) return;                  // cascade in
      const yy = by + 166 + i * 30;
      // show both the gain and the resulting total, e.g. "+ 6,  Max HP = 36"
      this.text("+ " + v, bx + 64, yy, { size: 18, color: "#9cf0a0" });
      this.text(k + " = " + total, bx + bw - 64, yy, { align: "right", size: 18, color: "#cfd6ff" });
    });
    if (r.newSkills.length && t > 340 + 4 * 200)
      this.text("Learned: " + r.newSkills.join(", "), W / 2, by + 296, { align: "center", size: 16, color: "#ffd479" });
    // page dots when more than one character leveled
    if (ups.length > 1) {
      const dotY = by + bh - 34;
      for (let i = 0; i < ups.length; i++) {
        ctx.fillStyle = i === b.levelIdx ? "#ffe9a0" : "rgba(220,228,255,0.35)";
        ctx.beginPath(); ctx.arc(W / 2 + (i - (ups.length - 1) / 2) * 20, dotY, 5, 0, 7); ctx.fill();
      }
    }
    const more = ups.length > 1 && b.levelIdx < ups.length - 1;
    this.text(more ? "Press ENTER  ▶" : "Press ENTER", W / 2, by + bh - 14, { align: "center", size: 14, color: "rgba(230,235,255,.7)" });
  },

  drawLose() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, W, H);
    this.text(this.player.name + " has fallen...", W / 2, H * 0.44, { align: "center", size: 30, bold: true, color: "#e8a0a0" });
    this.text("Press ENTER", W / 2, H * 0.44 + 40, { align: "center", size: 16, color: "rgba(230,235,255,.7)" });
  }
});
