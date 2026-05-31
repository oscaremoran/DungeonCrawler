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
      enemy: { name: cfg.name, hp: eHp, maxhp: eHp, atk: eAtk, def: cfg.def, hurtT: 0, dead: false, deathT: 0 },
      ally: am ? {
        name: am.name, sprite: am.sprite,
        // pull in her current pools and equip bonuses so battle reads everything off `b.ally`
        hp: am.hp ?? am.maxhp, maxhp: am.maxhp,
        mp: am.mp ?? (am.maxmp ?? 0), maxmp: am.maxmp ?? 0,
        atk: this.atkTotalFor(am), def: this.defTotalFor(am),
        skills: Array.isArray(am.skills) ? am.skills.slice() : [],
        hurtT: 0, ko: false, lunge: 0,
      } : null,
      heroCmds: ["Attack", "Skill", "Defend", "Item", "Run"],
      allyCmds: ["Attack", "Skill", "Defend", "Item"],
      actor: "hero",
      cmds: ["Attack", "Skill", "Defend", "Item", "Run"], sel: 0,
      phase: "intro", step: "", timer: 1100, msg: cfg.intro,
      heroLunge: 0, eLunge: 0, heroHurt: 0, allyLunge: 0,
      defending: false, allyDefending: false, shieldBuff: false, allyShieldBuff: false,
      floats: [], animT: 0, fx: null, sub: null,
    };
  },
  battleMsg(s) { this.battle.msg = s; },
  calcDmg(atk, def) { return Math.max(1, atk - def + (Math.floor(Math.random() * 4) - 1)); },
  addFloat(who, val, color) { this.battle.floats.push({ who, text: "" + val, color, t: 900 }); },
  grantRewards() {
    const p = this.player, cfg = this.battle.cfg, fromLv = p.lv, exp = cfg.exp, gold = cfg.gold;
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
    // gear drop (e.g. goblins drop the Rusty Dagger)
    let drop = null;
    if (cfg.drop && Math.random() < cfg.drop.rate) {
      const g = EQUIP_BY_ID[cfg.drop.id];
      if (!p.equipOwned.includes(g.id)) p.equipOwned.push(g.id);
      drop = g.name;
    }
    this.battle.reward = { exp, gold, leveled, gains, newSkills, fromLv, toLv: p.lv, drop };
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
    this.beginTransition("overworld");
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
            this.stats.dmgDealt += dmg;
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
            this.stats.dmgDealt += dmg;
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
            this.stats.dmgDealt += dmg;
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
            this.stats.dmgDealt += dmg;
            this.addFloat("enemy", dmg, sk.kind === "fire" ? "#ffb24a" : "#9fd8ff");
            this.battleMsg(sk.name + " hits for " + dmg + "!");
            b.step = "impact"; b.timer = 520;
          }
        } else if (b.timer <= 0) { b.fx = null; this.afterAllyAction(); }
        break;
      case "enemy_pre":
        if (b.timer <= 0) { b.phase = "enemy_attack"; b.step = "lunge"; b.timer = 300; b.eLunge = 0; this.battleMsg("The " + b.enemy.name + " attacks!"); }
        break;
      case "enemy_attack":
        if (b.step === "lunge") {
          b.eLunge = Math.min(1, 1 - b.timer / 300);
          if (b.timer <= 0) {
            // the enemy sometimes lunges at Elara instead of the hero
            const atAlly = b.ally && !b.ally.ko && Math.random() < 0.4;
            if (atAlly) {
              let dmg = this.calcDmg(b.enemy.atk, b.ally.def);
              if (b.allyShieldBuff) dmg = Math.max(1, Math.floor(dmg * 0.3));
              else if (b.allyDefending) dmg = Math.max(1, Math.floor(dmg / 2));
              b.allyShieldBuff = false;
              b.ally.hp = Math.max(0, b.ally.hp - dmg); b.ally.hurtT = 400;
              this.addFloat("ally", dmg, "#ff8a8a");
              if (b.ally.hp <= 0) { b.ally.ko = true; this.battleMsg(b.ally.name + " is knocked out!"); }
              else this.battleMsg(b.ally.name + " takes " + dmg + " damage!");
            } else {
              let dmg = this.calcDmg(b.enemy.atk, this.defTotal());
              if (b.shieldBuff) dmg = Math.max(1, Math.floor(dmg * 0.3));
              else if (b.defending) dmg = Math.max(1, Math.floor(dmg / 2));
              b.shieldBuff = false;
              this.player.hp = Math.max(0, this.player.hp - dmg); b.heroHurt = 400;
              this.addFloat("hero", dmg, "#ff8a8a");
              this.battleMsg(this.player.name + " takes " + dmg + " damage!");
            }
            b.step = "return"; b.timer = 420;
          }
        } else {
          b.eLunge = Math.max(0, b.timer / 420);
          if (b.timer <= 0) {
            if (this.player.hp <= 0) {
              this.stats.lastKiller = b.enemy.name;
              b.phase = "lose"; b.msg = this.player.name + " has fallen...  (ENTER)";
            }
            else {
              b.actor = "hero"; b.cmds = b.heroCmds.slice();
              b.sel = 0; b.phase = "menu"; b.msg = "";
            }
          }
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

    // platform shadows
    const platShadow = (cx, by, rx) => {
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath();
      ctx.ellipse(cx, by, rx, rx * 0.3, 0, 0, 7); ctx.fill();
    };

    // --- enemy, faces right toward the hero (sprite groups vary by type) ---
    if (b.phase !== "victory" && b.phase !== "levelup") {
      const A = b.cfg.battle;
      const nf = g => ANIM_FRAMES[g] - 1;             // last frame index of a group
      let grp = A.idle, fr = 0, eOff = 0, jitter = 0;
      if (b.enemy.dead) { grp = A.death; fr = Math.min(nf(grp), (b.enemy.deathT / (1000 / 6)) | 0); }
      else if (b.enemy.hurtT > 0) { grp = A.hurt; fr = Math.min(nf(grp), ((380 - b.enemy.hurtT) / (380 / ANIM_FRAMES[grp])) | 0); jitter = (Math.random() - 0.5) * 6; }
      else if (b.phase === "enemy_attack") { grp = A.attack; fr = Math.min(nf(grp), (b.eLunge * ANIM_FRAMES[grp]) | 0); eOff = b.eLunge * 80; }
      else { grp = A.idle; fr = ((b.animT / 180) | 0) % ANIM_FRAMES[grp]; }
      const eAlpha = b.enemy.dead ? Math.max(0, 1 - b.enemy.deathT / 1300) : 1;
      platShadow(exX, eBaseY + 4, H * A.h * 0.42);
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
      platShadow(hxX, hBaseY + 4, 46);
      this.drawBattleSprite(hFrame, hxX + hOff + hjit, hBaseY, H * 0.26, false);
    }

    // --- Elara, fighting beside the hero ---
    if (b.ally && b.phase !== "victory" && b.phase !== "levelup") {
      let aOff = 0, ajit = 0, aImg = art.ally_idle;
      if (b.ally.ko) aImg = art.ally_hurt;
      else if (b.ally.hurtT > 0) { aImg = art.ally_hurt; ajit = (Math.random() - 0.5) * 6; }
      else if (b.phase === "ally_attack" && b.step === "lunge") { aImg = art.ally_walk_1; aOff = -b.allyLunge * 80; }
      const bob = b.ally.ko ? 0 : Math.sin(b.animT / 300) * 2;
      platShadow(ayX, ayBaseY + 4, 38);
      ctx.globalAlpha = b.ally.ko ? 0.45 : 1;
      this.drawBattleSprite(aImg, ayX + aOff + ajit, ayBaseY + bob, H * 0.22, false);
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
    this.text(p.name, 64, sy + 34, { size: 20, bold: true, color: "#ffe9a0" });
    this.text("LV " + p.lv, sr, sy + 34, { size: 16, align: "right", color: "#cfd6ff" });
    this.text("HP", 64, sy + 66, { size: 15, color: "#bfe8c0" });
    this.text(p.hp + " / " + p.maxhp, sr, sy + 66, { size: 15, align: "right", color: "#eef" });
    this.bar(96, sy + 74, sw - 120, 9, p.hp / p.maxhp, "#5cd06a");
    this.text("MP", 64, sy + 104, { size: 15, color: "#bcd0f0" });
    this.text(p.mp + " / " + p.maxmp, sr, sy + 104, { size: 15, align: "right", color: "#eef" });
    this.bar(96, sy + 112, sw - 120, 9, p.mp / p.maxmp, "#5aa6f0");

    // --- Elara status (a compact bar just above the hero's panel) ---
    if (b.ally) {
      const ay = sy - 86, ah = 78;
      this.drawWindow(40, ay, sw, ah);
      this.text(b.ally.name, 64, ay + 24, { size: 17, bold: true, color: b.ally.ko ? "#a08" : "#ffd0e0" });
      if (b.ally.ko) this.text("DOWN", sr, ay + 24, { size: 14, align: "right", color: "#e88" });
      else this.text(b.ally.hp + " / " + b.ally.maxhp, sr, ay + 24, { size: 14, align: "right", color: "#eef" });
      this.bar(64, ay + 30, sw - 48, 7, Math.max(0, b.ally.hp / b.ally.maxhp), "#e06a8a");
      if ((b.ally.maxmp || 0) > 0) {
        this.text("MP", 64, ay + 56, { size: 13, color: "#bcd0f0" });
        this.text(b.ally.mp + " / " + b.ally.maxmp, sr, ay + 56, { size: 13, align: "right", color: "#eef" });
        this.bar(96, ay + 62, sw - 120, 7, b.ally.mp / b.ally.maxmp, "#5aa6f0");
      }
    }

    // --- bottom-right panel: command list / submenu (the rest are overlays) ---
    if (b.phase === "menu") {
      const cw = 220, cx = W - cw - 40, rh = 22, cyy = H - 150;
      this.drawWindow(cx, cyy, cw, 126);
      const actorName = b.actor === "ally" ? (b.ally && b.ally.name) : this.player.name;
      this.text(actorName + "'s turn", cx + 16, cyy + 20, { size: 13, color: "#9fb0e8" });
      b.cmds.forEach((c, i) => {
        const yy = cyy + 44 + i * rh, sel = i === b.sel;
        if (sel) this.cursor(cx + 22, yy - 6);
        this.text(c, cx + 42, yy, { size: 17, color: sel ? "#ffe9a0" : "#dfe4ff", bold: sel });
      });
    } else if (b.phase === "submenu") this.drawBattleSub();
    else if (b.phase === "victory") this.drawVictory();
    else if (b.phase === "levelup") this.drawLevelUp();
    else if (b.phase === "lose") this.drawLose();
  },

  drawBattleSub() {
    const W = this.cv.width, H = this.cv.height, b = this.battle, sub = b.sub;
    const cw = 320, cx = W - cw - 40, cyy = H - 150;
    const caster = b.actor === "ally" ? b.ally : this.player;
    this.drawWindow(cx, cyy, cw, 126);
    this.text((sub.type === "skill" ? "SKILLS" : "ITEMS") + "  ·  " + caster.name,
      cx + 20, cyy + 24, { size: 14, color: "#9fb0e8" });
    sub.list.forEach((entry, i) => {
      const yy = cyy + 50 + i * 23, sel = i === sub.sel;
      if (sel) this.cursor(cx + 22, yy - 6);
      if (sub.type === "skill") {
        const sk = SKILL_BY_ID[entry], can = caster.mp >= sk.mp;
        this.text(sk.name, cx + 42, yy, { size: 17, color: sel ? "#ffe9a0" : (can ? "#dfe4ff" : "#8890b0"), bold: sel });
        this.text(sk.mp + " MP", cx + cw - 18, yy, { size: 14, align: "right", color: can ? "#9fd8ff" : "#8890b0" });
      } else {
        this.text(entry.name, cx + 42, yy, { size: 17, color: sel ? "#ffe9a0" : "#dfe4ff", bold: sel });
        this.text("x" + entry.qty, cx + cw - 18, yy, { size: 14, align: "right", color: "#cfd6ff" });
      }
    });
    this.text("ESC  back", cx + cw - 18, cyy + 118, { size: 13, align: "right", color: "rgba(220,228,255,.6)" });
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
  },

  drawLose() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, W, H);
    this.text(this.player.name + " has fallen...", W / 2, H * 0.44, { align: "center", size: 30, bold: true, color: "#e8a0a0" });
    this.text("Press ENTER", W / 2, H * 0.44 + 40, { align: "center", size: 16, color: "rgba(230,235,255,.7)" });
  }
});
