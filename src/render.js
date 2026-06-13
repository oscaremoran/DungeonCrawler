/* Game rendering & UI methods (attached to the prototype) */
Object.assign(Game.prototype, {
  drawNameContact() {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height, nm = this.naming, t = this.t / 1000;
    ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, W, H);
    const bw = Math.min(460, W - 60), bh = 200, bx = (W - bw) / 2, by = (H - bh) / 2;
    this.drawWindow(bx, by, bw, bh);
    this.text(nm.title, W / 2, by + 50, { align: "center", size: 24, bold: true, color: "#ffe9a0" });
    const fw = bw - 80, fx = bx + 40, fy = by + 80;
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.strokeStyle = "rgba(220,228,255,0.7)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(fx, fy, fw, 48, 6); ctx.fill(); ctx.stroke();
    const caret = Math.sin(t * 5) > 0 ? "|" : " ";
    this.text(nm.buf + caret, fx + 16, fy + 33, { size: 26, color: "#fff" });
    this.text("Type a name  ·  ENTER  confirm", W / 2, by + bh - 26, { align: "center", size: 15, color: "#cfd6ff" });
  },

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
  },

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
  },

  render() {
    if (this.state === "cheater") { this.renderCheater(); return; }
    if (this.state === "title") this.renderTitle();
    else if (this.state === "difficulty") this.renderDifficulty();
    else if (this.state === "name") this.renderName();
    else if (this.state === "saveselect") this.renderSaveSelect();
    else if (this.state === "gameover") this.renderGameOver();
    else if (this.state === "battle" && this.battle) this.renderBattle();
    else if (this.encounter && this.encounter.phase === "whirl") this.renderWhirl();
    else this.renderOverworld();

    if (this.notifs && this.notifs.length) this.drawNotifs();
    if (this.flash) this.drawFlash();

    // global fade overlay (load-in / transitions)
    if (this.fade > 0) {
      const ctx = this.ctx;
      ctx.fillStyle = `rgba(0,0,0,${this.fade})`;
      ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    }
  },

  /* anti-cheat: shown after tampering is detected; saves are already wiped */
  renderCheater() {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height, t = this.t / 1000;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(t * 4));
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const big = Math.floor(H * 0.13);
    ctx.font = `bold ${big}px Georgia, 'Times New Roman', serif`;
    ctx.lineJoin = "round"; ctx.lineWidth = Math.max(4, H * 0.012);
    ctx.strokeStyle = "#1a0000"; ctx.strokeText("DON'T CHEAT", W / 2, H / 2);
    ctx.fillStyle = `rgba(${220 + (35 * pulse) | 0}, 20, 20, 1)`;
    ctx.shadowColor = "rgba(255,0,0,0.8)"; ctx.shadowBlur = 30 * pulse;
    ctx.fillText("DON'T CHEAT", W / 2, H / 2);
    ctx.shadowBlur = 0;
    ctx.font = `${Math.floor(H * 0.03)}px Georgia, serif`;
    ctx.fillStyle = "rgba(220,170,170,0.85)";
    ctx.fillText("Your saves have been erased.", W / 2, H / 2 + big * 0.7);
    ctx.textBaseline = "alphabetic";
  },

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
  },

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
  },

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
        const img = g === G_DIRT ? art.dirt : g === G_EDGE ? art.grass_edge : g === G_WOOD ? art.wood_floor : g === G_INN ? art.inn_floor : art.grass;
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
      if (o.tx < x0 - 2 || o.tx > x1 + 1 || o.ty < y0 - 3 || o.ty > y1 + 1) continue;  // cull off-screen
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
    for (const chest of (this.world.chests || [])) {
      const cwx = chest.tx * TILE + TILE / 2, cby = (chest.ty + 1) * TILE;
      renderables.push({ sortY: (chest.ty + 0.9) * TILE, draw: () => {
        shadow(cwx, cby, 0.85);
        this.drawChest(cwx, cby, chest.opened);
      }});
    }
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const cfg = ENEMY_TYPES[e.type], alert = e.anim === "alert";
      const grp = alert ? cfg.ow.alert : cfg.ow.idle;
      const fps = alert ? 9 : cfg.boss ? 4 : 2.5;
      const fr = Math.floor((e.animT || 0) / (1000 / fps)) % ANIM_FRAMES[grp];
      const img = art[`${grp}_${fr}`];
      const w = cfg.ow.tiles;
      renderables.push({ sortY: e.y, draw: () => {
        this.drawSprite(img, e.x, e.y, w, false);
      }});
    }
    const allyHere = p.party.some(m => m.id === "ally");
    for (const n of (this.npcs || [])) {
      if (n.ally && allyHere) continue;                 // she's following the hero now
      const bob = Math.sin((n.animT || 0) / 500) * 2;   // gentle idle bob
      const img = art[n.sprite] || art.npc_keeper;
      renderables.push({ sortY: n.y, draw: () => {
        shadow(n.x, n.y, 0.7);
        this.drawSprite(img, n.x, n.y + bob, 1.0, false);
      }});
    }
    // scripted cutscene actors (e.g. the mercenaries striding into the inn)
    if (this.cutscene && this.cutscene.actors) {
      for (const a of this.cutscene.actors) {
        const fr = a.moving ? (a.frame % ANIM_FRAMES.merc_idle) : 0;
        const img = art[`merc_idle_${fr}`] || art.merc_idle_0;
        renderables.push({ sortY: a.y, draw: () => {
          shadow(a.x, a.y, 0.9);
          this.drawSprite(img, a.x, a.y + 14, 2.0, a.face === -1);
        }});
      }
    }
    // party followers trail the hero along recent poses (walk-cycle animated)
    const heroPixelH = p.wTiles * TILE * (art.idle.height / art.idle.width);   // Garran's on-screen height
    p.party.forEach((m, i) => {
      const pose = this.trail[Math.min(this.trail.length - 1, 14 * (i + 1))];
      if (!pose) return;
      const base = m.sprite || "ally_idle", stem = base.replace(/_idle$/, "");
      const img = pose.moving && art[`${stem}_walk_${pose.frame % 3}`]
        ? art[`${stem}_walk_${pose.frame % 3}`] : (art[base] || art.idle);
      const wT = heroPixelH * img.width / (TILE * img.height);   // render her the same height as Garran
      renderables.push({ sortY: pose.y - 1, draw: () => {
        this.drawSprite(img, pose.x, pose.y + 14, wT, pose.face === 1);
      }});
    });
    const pFrame = p.moving ? art["walk_" + p.frame] : art.idle;
    renderables.push({
      sortY: p.y,
      draw: () => {
        this.drawSprite(pFrame, p.x, p.y + 14, p.wTiles, p.face === 1);
      },
    });
    renderables.sort((a, b) => a.sortY - b.sortY);
    for (const r of renderables) r.draw();

    // --- minimap (hidden while a full-screen panel is up) ---
    if (!this.ui && !this.shop && !this.dialogue && !this.naming && !this.prompt) this.drawMinimap();

    // --- overlays ---
    if (this.ui) this.drawMenu();
    if (this.shop) this.drawShop();
    if (this.dialogue) this.drawDialogue();
    if (this.naming) this.drawNameContact();
    if (this.prompt) this.drawPrompt();
    if (this.autosaveAnim) this.drawAutosave();
  },

  /* a yes/no confirmation window with two buttons (keyboard or click) */
  promptButtons() {
    const W = this.cv.width, H = this.cv.height;
    const bw = Math.min(520, W - 80), bh = 150, bx = (W - bw) / 2, by = H * 0.5 - bh / 2;
    const btnW = 130, btnH = 44, gap = 40, byy = by + bh - btnH - 22;
    const yes = { x: W / 2 - btnW - gap / 2, y: byy, w: btnW, h: btnH };
    const no  = { x: W / 2 + gap / 2,        y: byy, w: btnW, h: btnH };
    return { bx, by, bw, bh, yes, no };
  },
  drawPrompt() {
    const ctx = this.ctx, W = this.cv.width, L = this.promptButtons(), sel = this.prompt.sel;
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 0, W, this.cv.height);
    this.drawWindow(L.bx, L.by, L.bw, L.bh);
    this.text(this.prompt.text, W / 2, L.by + 50, { align: "center", size: 21, color: "#eef1ff" });
    [["YES", L.yes, 0], ["NO", L.no, 1]].forEach(([label, r, i]) => {
      const on = sel === i;
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, on ? "rgba(70,96,180,0.95)" : "rgba(24,36,90,0.9)");
      g.addColorStop(1, on ? "rgba(36,52,120,0.95)" : "rgba(12,18,50,0.9)");
      ctx.fillStyle = g;
      ctx.strokeStyle = on ? "#ffe9a0" : "rgba(150,165,230,0.8)"; ctx.lineWidth = on ? 3 : 2;
      ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8); ctx.fill(); ctx.stroke();
      this.text(label, r.x + r.w / 2, r.y + r.h / 2 + 8, { align: "center", size: 20, bold: on, color: on ? "#ffe9a0" : "#dfe4ff" });
    });
  },

  /* ------------------------------- storefront UI ------------------------- */
  drawShop() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx, p = this.player;
    const shop = SHOPS[this.shop.id];
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 0, W, H);
    const bw = Math.min(620, W - 80), bh = 130 + shop.wares.length * 64;
    const bx = (W - bw) / 2, by = Math.max(40, (H - bh) / 2);
    this.drawWindow(bx, by, bw, bh);
    this.text(shop.title.toUpperCase(), bx + 28, by + 46, { size: 24, bold: true, color: "#ffe9a0" });
    this.text("GOLD  " + p.gold, bx + bw - 28, by + 46, { size: 20, align: "right", color: "#ffd86a" });

    shop.wares.forEach((w, i) => {
      const ry = by + 78 + i * 64, rx = bx + 50, rw = bw - 78;
      const on = this.shop.sel === i, owned = this.ownsWare(w), poor = p.gold < w.price;
      ctx.fillStyle = on ? "rgba(120,150,230,0.32)" : "rgba(0,0,0,0.25)";
      ctx.strokeStyle = on ? "#ffe9a0" : "rgba(150,165,230,0.5)"; ctx.lineWidth = on ? 2.5 : 1.5;
      ctx.beginPath(); ctx.roundRect(rx, ry, rw, 54, 7); ctx.fill(); ctx.stroke();
      if (on) this.cursor(rx - 18, ry + 27);
      const info = w.type === "skill" ? SKILL_BY_ID[w.id] : EQUIP_BY_ID[w.id];
      const dim = owned ? "#8a92b4" : "#eef1ff";
      this.text(info.name, rx + 16, ry + 24, { size: 19, bold: true, color: dim });
      this.text(info.desc, rx + 16, ry + 45, { size: 13, color: owned ? "#777e9c" : "#bcd0f0" });
      if (owned) this.text("OWNED", rx + rw - 16, ry + 32, { size: 16, align: "right", color: "#9cf0a0" });
      else this.text(w.price + "g", rx + rw - 16, ry + 32, { size: 18, align: "right", bold: true, color: poor ? "#e88" : "#ffd86a" });
    });
    this.text("ENTER  buy        ESC  leave", W / 2, by + bh - 22, { align: "center", size: 15, color: "rgba(230,235,255,0.7)" });
  },

  /* a spinning sword + "Saving" tag in the bottom-left while autosaving */
  drawAutosave() {
    const ctx = this.ctx, H = this.cv.height, a = this.autosaveAnim;
    const fade = Math.min(1, Math.min(a.t, 2000 - a.t + 1700) / 350);   // ease in & out
    const cx = 52, cy = H - 52, ang = this.t / 200;
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    // soft dark disc behind the icon
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 7); ctx.fill();
    // spinning blade
    ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.lineCap = "round";
    ctx.strokeStyle = "#e9eefc"; ctx.lineWidth = 4;            // blade
    ctx.beginPath(); ctx.moveTo(0, 13); ctx.lineTo(0, -15); ctx.stroke();
    ctx.strokeStyle = "#cfd6ff"; ctx.lineWidth = 3;            // point
    ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(-3, -10); ctx.moveTo(0, -15); ctx.lineTo(3, -10); ctx.stroke();
    ctx.strokeStyle = "#d9a441"; ctx.lineWidth = 4;            // crossguard
    ctx.beginPath(); ctx.moveTo(-8, 8); ctx.lineTo(8, 8); ctx.stroke();
    ctx.strokeStyle = "#7a4a1e"; ctx.lineWidth = 4;            // grip
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, 15); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    this.text("Saving" + ".".repeat(1 + (((this.t / 350) | 0) % 3)), cx + 34, cy + 5, { size: 16, color: "#ffe9b0" });
    ctx.restore();
  },

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
  },
  text(s, x, y, opt = {}) {
    const ctx = this.ctx;
    ctx.font = `${opt.bold ? "bold " : ""}${opt.size || 18}px Georgia, serif`;
    ctx.textAlign = opt.align || "left"; ctx.textBaseline = "alphabetic";
    if (opt.shadow !== false) { ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillText(s, x + 1.5, y + 1.5); }
    ctx.fillStyle = opt.color || "#eef1ff"; ctx.fillText(s, x, y);
  },
  // a small padlock glyph centered on (cx, cy); r is the body half-width
  drawLock(cx, cy, r, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(2, r * 0.28);
    // shackle (the arc over the body)
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.35, r * 0.6, Math.PI, 0);
    ctx.stroke();
    // body
    const bw = r * 1.5, bh = r * 1.25;
    ctx.beginPath(); ctx.roundRect(cx - bw / 2, cy - r * 0.35, bw, bh, r * 0.3); ctx.fill();
    ctx.restore();
  },
  bar(x, y, w, h, frac, color) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * frac), h - 2);
    ctx.strokeStyle = "rgba(220,228,255,0.6)"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  },
  cursor(x, y) {                                    // gold ▶ selection arrow
    const ctx = this.ctx, b = 0.5 + 0.5 * Math.sin(this.t / 120);
    ctx.fillStyle = `rgba(255,224,128,${0.6 + 0.4 * b})`;
    ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 11, y); ctx.lineTo(x, y + 7); ctx.closePath(); ctx.fill();
  },

  /* bottom-left minimap of the current area: terrain tiles + marker dots
     (white = hero, black = enemies, green = current quest, red = shops). */
  drawMinimap() {
    const ctx = this.ctx, H = this.cv.height, p = this.player, w = this.world;
    const cell = 4, mapW = MAP_W * cell, mapH = MAP_H * cell, pad = 8;
    const boxX = 14, boxY = H - mapH - pad * 2 - 14;
    this.drawWindow(boxX, boxY, mapW + pad * 2, mapH + pad * 2);
    const mx = boxX + pad, my = boxY + pad;

    // chest tiles are solid, but shouldn't betray themselves as dark squares
    const chestTiles = new Set((w.chests || []).map(c => c.ty * MAP_W + c.tx));

    // terrain: blocked tiles dark, walkable tinted by ground type
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        let col;
        if (w.blocked[ty][tx] && !chestTiles.has(ty * MAP_W + tx)) col = "#16241b";
        else {
          const g = w.ground[ty][tx];
          col = g === G_DIRT ? "#6b5836" : (g === G_WOOD || g === G_INN) ? "#6e4f33" : "#34603a";
        }
        ctx.fillStyle = col;
        ctx.fillRect(mx + tx * cell, my + ty * cell, cell, cell);
      }
    }

    const dot = (tx, ty, color, r) => {
      const cx = mx + tx * cell, cy = my + ty * cell;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    };
    // shops (blue): shopkeeper NPCs in here, plus store-building doors in town
    for (const n of (this.npcs || [])) if (n.shop) dot(n.x / TILE, n.y / TILE - 0.5, "#4aa8ff", 3);
    for (const pt of (w.portals || [])) if (pt.to === "koro_def" || pt.to === "koro_off" || pt.to === "koro_skill") dot(pt.tx + 0.5, pt.ty, "#4aa8ff", 3);
    // enemies (red)
    for (const e of (this.enemies || [])) if (e.alive) dot(e.x / TILE, e.y / TILE - 0.5, "#ff4444", 2.5);
    // current quest objective (green, gently pulsing)
    const qm = this.questMarkerTile();
    if (qm) dot(qm.tx, qm.ty, "#4cff6a", 2.6 + Math.sin(this.t / 200) * 1.1);
    // player (white) on top, ringed for contrast
    dot(p.x / TILE, p.y / TILE, "#ffffff", 3);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(mx + (p.x / TILE) * cell, my + (p.y / TILE) * cell, 3, 0, 7); ctx.stroke();
  },

  /* stacked toast notifications (quest updates etc.), top-right, newest on top */
  drawNotifs() {
    const W = this.cv.width, ctx = this.ctx;
    const nw = 360, x = W - nw - 24, rh = 50, gap = 10;
    let y = 96;                                        // sits below the world HUD
    for (const n of this.notifs) {
      const fadeIn = Math.min(1, (n.max - n.t) / 200);   // ease in just after spawn
      const fadeOut = Math.min(1, n.t / 320);            // ease out before expiry
      ctx.globalAlpha = Math.max(0, Math.min(fadeIn, fadeOut));
      this.drawWindow(x, y, nw, rh);
      this.text(n.text, x + nw / 2, y + rh / 2 + 6, { align: "center", size: 16, color: n.color });
      ctx.globalAlpha = 1;
      y += rh + gap;
    }
  },

  drawFlash() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx;
    const a = Math.min(1, this.flash.t / 300);
    ctx.globalAlpha = a;
    const w = Math.min(W - 40, ctx.measureText(this.flash.text).width + 80);
    this.drawWindow((W - 360) / 2, H - 120, 360, 46);
    this.text(this.flash.text, W / 2, H - 90, { align: "center", size: 17, color: "#ffe9b0" });
    ctx.globalAlpha = 1;
  },

  /* ----------------------------- menu screens ---------------------------- */
  drawMenu() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 0, W, H);   // dim world
    const ui = this.ui;
    if (ui.screen === "main") this.drawMainMenu();
    else if (ui.screen === "status") this.drawStatusScreen();
    else if (ui.screen === "skills") this.drawSkillsScreen();
    else if (ui.screen === "equip") this.drawEquipScreen();
    else if (ui.screen === "quests") this.drawQuestsScreen();
  },

  /* ----------------------------- quests screen --------------------------- */
  drawQuestsScreen() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx;
    const x = 40, y = 36, w = W - 80, h = H - 110;
    this.drawWindow(x, y, w, h);
    this.text("QUEST LOG", x + 28, y + 44, { size: 24, bold: true, color: "#ffe9a0" });

    const quests = this.quests || [];
    if (!quests.length) {
      this.text("No quests yet.", x + 28, y + 100, { size: 18, color: "#cfd6ff" });
    }
    let ry = y + 90;
    const cardW = w - 56, cardH = 78;
    quests.forEach(q => {
      const def = QUESTS[q.id]; if (!def) return;
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath(); ctx.roundRect(x + 28, ry, cardW, cardH, 8); ctx.fill();
      // status pip
      const px = x + 50, py = ry + cardH / 2;
      ctx.beginPath(); ctx.arc(px, py, 9, 0, 7);
      ctx.fillStyle = q.done ? "#5cd06a" : "#ffd479"; ctx.fill();
      if (q.done) {                                    // checkmark
        ctx.strokeStyle = "#123"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(px - 4, py); ctx.lineTo(px - 1, py + 4); ctx.lineTo(px + 5, py - 4); ctx.stroke();
      }
      const tx = x + 76;
      this.text(def.name, tx, ry + 30, { size: 20, bold: true, color: q.done ? "#9aa7c8" : "#fff3c8" });
      this.text(q.done ? "COMPLETE" : "ACTIVE", x + 28 + cardW - 20, ry + 30,
        { size: 14, align: "right", color: q.done ? "#5cd06a" : "#ffd479" });
      this.text(def.desc, tx, ry + 56, { size: 14, color: q.done ? "#8893b4" : "#cfd6ff" });
      ry += cardH + 14;
    });

    this.text("ESC  back", W / 2, H - 32, { align: "center", size: 15, color: "rgba(230,235,255,0.7)" });
  },

  /* ----------------------------- skills screen --------------------------- */
  skillLayout() {
    const W = this.cv.width, H = this.cv.height;
    const x = 40, y = 36, w = W - 80, h = H - 110;
    const listX = x + 36, listY = y + 130;
    // shrink the row pitch if the catalog has grown past what 70px rows would fit
    const rowH = Math.max(52, Math.min(70, Math.floor((y + h - 40 - listY) / SKILLS.length)));
    const rows = SKILLS.map((s, i) => ({ skill: s, x: listX, y: listY + i * rowH, w: 380, h: rowH - 12 }));
    const n = skillSlots(this.player.lv);
    const slotX = x + w - 320, slotY = y + 138, ss = 74, gap = 22;
    const slots = [];
    for (let i = 0; i < n; i++) slots.push({ i, x: slotX + (i % 3) * (ss + gap), y: slotY + ((i / 3) | 0) * (ss + gap), w: ss, h: ss });
    return { x, y, w, h, rows, slots, n, slotX, slotY };
  },
  /* the character whose skills/equip the current menu screen is editing */
  activeChar() {
    const ui = this.ui;
    return (ui && ui.target === "ally")
      ? (this.player.party.find(m => m.id === "ally") || this.player)
      : this.player;
  },
  onMouse(type, mx, my) {
    if (this.prompt) {                                // yes/no buttons
      const L = this.promptButtons();
      const hit = r => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
      if (type === "move") { if (hit(L.yes)) this.prompt.sel = 0; else if (hit(L.no)) this.prompt.sel = 1; }
      else if (type === "down") { if (hit(L.yes)) this.resolvePrompt(true); else if (hit(L.no)) this.resolvePrompt(false); }
      return;
    }
    if (!this.ui) return;
    if (this.ui.screen === "equip") return this.onEquipMouse(type, mx, my);
    if (this.ui.screen !== "skills") return;
    const ui = this.ui, p = this.player, c = this.activeChar(), L = this.skillLayout();
    const hit = r => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
    while (c.skills.length < L.n) c.skills.push(null);
    c.skills.length = L.n;
    // a skill is usable if purchased, or (for non-shop skills) level-unlocked
    const known = id => {
      const sk = SKILL_BY_ID[id]; if (!sk) return false;
      return p.boughtSkills.includes(id) || (!sk.shop && p.lv >= sk.unlock);
    };
    if (type === "down") {
      for (const r of L.rows) if (hit(r) && known(r.skill.id)) { ui.drag = { id: r.skill.id, from: "list", mx, my }; return; }
      for (const s of L.slots) if (hit(s) && c.skills[s.i]) { ui.drag = { id: c.skills[s.i], from: "slot", slot: s.i, mx, my }; return; }
    } else if (type === "move" && ui.drag) {
      ui.drag.mx = mx; ui.drag.my = my; ui.hover = -1;
      for (const s of L.slots) if (hit(s)) ui.hover = s.i;
    } else if (type === "up" && ui.drag) {
      let drop = -1; for (const s of L.slots) if (hit(s)) drop = s.i;
      const id = ui.drag.id;
      if (drop >= 0) {
        if (ui.drag.from === "slot") { const t = c.skills[drop]; c.skills[drop] = id; c.skills[ui.drag.slot] = t; }
        else { const ex = c.skills.indexOf(id); if (ex >= 0) c.skills[ex] = null; c.skills[drop] = id; }
      } else if (ui.drag.from === "slot") c.skills[ui.drag.slot] = null;   // dragged out = unequip
      ui.drag = null; ui.hover = -1;
    }
  },
  drawSkillsScreen() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx, p = this.player, ui = this.ui, art = this.art;
    const c = this.activeChar();
    const L = this.skillLayout();
    while (c.skills.length < L.n) c.skills.push(null); c.skills.length = L.n;
    this.drawWindow(L.x, L.y, L.w, L.h);
    this.text("SKILLS", L.x + 28, L.y + 44, { size: 24, bold: true, color: "#ffe9a0" });
    this.text("SKILL SLOTS:  " + L.n, L.x + L.w - 28, L.y + 44, { size: 19, align: "right", color: "#9fd8ff" });
    this.drawCharTabs(L.x + 28, L.y + 78);
    this.text("Drag a skill into a slot.  Drag a slot out to remove.", L.x + 28, L.y + 110, { size: 14, color: "#cfd6ff" });

    // skill list
    for (const r of L.rows) {
      const s = r.skill, owned = p.boughtSkills.includes(s.id);
      const locked = !owned && (s.shop || p.lv < s.unlock), equipped = c.skills.includes(s.id);
      const source = s.shop ? "Skill Shop" : "Lv " + s.unlock;   // how this skill is obtained
      ctx.globalAlpha = ui.drag && ui.drag.id === s.id && ui.drag.from === "list" ? 0.35 : 1;
      if (locked) {
        // locked rows are fully blacked out with a lock glyph; only the right-side
        // tag stays legible — orange "SHOP" for shop skills, red level req for level skills
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 6); ctx.fill();
        this.drawLock(r.x + 32, r.y + r.h / 2, 11, "#fff");
        if (s.shop) this.text("SHOP", r.x + r.w - 14, r.y + r.h / 2 + 6, { size: 15, bold: true, align: "right", color: "#ffb347" });
        else this.text("LOCKED · Lv " + s.unlock, r.x + r.w - 14, r.y + r.h / 2 + 6, { size: 14, bold: true, align: "right", color: "#e85a5a" });
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 6); ctx.fill();
        ctx.drawImage(art[s.icon], r.x + 6, r.y + 5, 48, 48);
        this.text(s.name, r.x + 66, r.y + 22, { size: 18, bold: true, color: "#eef1ff" });
        this.text(source + "   ·   " + s.mp + " MP", r.x + 66, r.y + 40, { size: 13, color: "#bcd0f0" });
        this.text(s.desc, r.x + 66, r.y + 56, { size: 13, color: "#aeb8d8" });
        if (equipped) this.text("equipped", r.x + r.w - 14, r.y + 30, { size: 13, align: "right", color: "#9cf0a0" });
      }
      ctx.globalAlpha = 1;
    }

    // slots
    this.text("EQUIPPED", L.slotX, L.slotY - 14, { size: 15, color: "#9fb0e8" });
    if (L.n === 0) this.text("Reach Level 2 to unlock a slot.", L.slotX, L.slotY + 30, { size: 15, color: "#cfd6ff" });
    for (const s of L.slots) {
      ctx.fillStyle = ui.hover === s.i && ui.drag ? "rgba(120,150,230,0.4)" : "rgba(0,0,0,0.35)";
      ctx.strokeStyle = "rgba(220,228,255,0.7)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(s.x, s.y, s.w, s.h, 8); ctx.fill(); ctx.stroke();
      const id = c.skills[s.i];
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
    const tab = this.player.party.some(m => m.id === "ally") ? "← →  switch character  ·  " : "";
    this.text(tab + "ESC  back", W / 2, H - 32, { align: "center", size: 15, color: "rgba(230,235,255,0.7)" });
  },

  /* a small two-tab header on Skills/Equip showing whose loadout we're editing */
  drawCharTabs(x, y) {
    const ui = this.ui, ally = this.player.party.find(m => m.id === "ally");
    if (!ally) return;
    const ctx = this.ctx;
    const tabs = [
      { id: "hero", label: this.player.name },
      { id: "ally", label: ally.name },
    ];
    let cx = x;
    for (const t of tabs) {
      const sel = (ui.target || "hero") === t.id;
      ctx.font = "bold 14px Georgia, serif";
      const w = ctx.measureText(t.label).width + 22;
      ctx.beginPath(); ctx.roundRect(cx, y - 16, w, 24, 6);
      ctx.fillStyle = sel ? "rgba(120,90,30,0.85)" : "rgba(20,18,40,0.55)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = sel ? "rgba(255,224,128,0.9)" : "rgba(180,180,210,0.35)";
      ctx.stroke();
      this.text(t.label, cx + w / 2, y + 1,
        { align: "center", size: 13, bold: true, color: sel ? "#ffe9a0" : "#cfd6ff", shadow: false });
      cx += w + 8;
    }
  },

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
  },
  onEquipMouse(type, mx, my) {
    const ui = this.ui, c = this.activeChar(), L = this.equipLayout();
    const hit = r => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
    if (type === "down") {
      for (const r of L.rows) if (hit(r)) { ui.drag = { id: r.id, from: "list", mx, my }; return; }
      for (const s of L.slots) { const id = c.equip[s.slot]; if (id && hit(s)) { ui.drag = { id, from: "slot", slot: s.slot, mx, my }; return; } }
    } else if (type === "move" && ui.drag) {
      ui.drag.mx = mx; ui.drag.my = my; ui.hover = null;
      for (const s of L.slots) if (hit(s)) ui.hover = s.slot;
    } else if (type === "up" && ui.drag) {
      let drop = null; for (const s of L.slots) if (hit(s)) drop = s.slot;
      const item = EQUIP_BY_ID[ui.drag.id];
      if (drop && item.slot === drop) {
        // a single gear instance can only be worn by one character at a time
        const other = ui.target === "ally" ? this.player : (this.player.party.find(m => m.id === "ally") || null);
        if (other && other.equip[drop] === ui.drag.id) other.equip[drop] = null;
        c.equip[drop] = ui.drag.id;
      }
      else if (drop === null && ui.drag.from === "slot") c.equip[ui.drag.slot] = null;  // dragged out = remove
      ui.drag = null; ui.hover = null;
    }
  },
  drawEquipIcon(x, y, s, item) {                       // procedural gear icon
    const ctx = this.ctx, cx = x + s / 2, cy = y + s / 2;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.roundRect(x, y, s, s, 8); ctx.fill();
    if (item.sprite && this.art[item.sprite]) {         // pre-drawn gear sprite
      const img = this.art[item.sprite], pad = s * 0.12;
      const iw = s - pad * 2, ih = iw * (img.height / img.width);
      this.ctx.drawImage(img, x + pad, cy - ih / 2, iw, ih);
      ctx.restore(); return;
    }
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
  },
  drawEquipScreen() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx, p = this.player, ui = this.ui;
    const c = this.activeChar();
    const L = this.equipLayout();
    this.drawWindow(L.x, L.y, L.w, L.h);
    this.text("EQUIPMENT", L.x + 28, L.y + 44, { size: 24, bold: true, color: "#ffe9a0" });
    this.text("ATK " + this.atkTotalFor(c) + "    DEF " + this.defTotalFor(c),
      L.x + L.w - 28, L.y + 44, { size: 19, align: "right", color: "#9fd8ff" });
    this.drawCharTabs(L.x + 28, L.y + 78);
    this.text("Drag gear into its slot.  Drag a slot out to remove.", L.x + 28, L.y + 110, { size: 14, color: "#cfd6ff" });

    // owned gear list
    const other = ui.target === "ally" ? p : (p.party.find(m => m.id === "ally") || null);
    for (const r of L.rows) {
      const it = r.item, worn = c.equip[it.slot] === it.id;
      const wornByOther = other && other.equip[it.slot] === it.id;
      ctx.globalAlpha = (ui.drag && ui.drag.id === it.id && ui.drag.from === "list") ? 0.35 : 1;
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 6); ctx.fill();
      this.drawEquipIcon(r.x + 6, r.y + 5, 44, it);
      this.text(it.name, r.x + 62, r.y + 24, { size: 18, bold: true, color: "#eef1ff" });
      const bonus = it.atk ? "+" + it.atk + " ATK" : "+" + it.def + " DEF";
      this.text(EQUIP_SLOTLABEL[it.slot] + "   ·   " + bonus, r.x + 62, r.y + 44, { size: 14, color: "#bcd0f0" });
      if (worn) this.text("equipped", r.x + r.w - 14, r.y + 28, { size: 13, align: "right", color: "#9cf0a0" });
      else if (wornByOther) this.text("worn by " + other.name, r.x + r.w - 14, r.y + 28, { size: 13, align: "right", color: "#e0b070" });
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
      const id = c.equip[s.slot];
      if (id && !(ui.drag && ui.drag.from === "slot" && ui.drag.slot === s.slot)) {
        this.drawEquipIcon(s.x + (s.w - 56) / 2, s.y + (s.h - 56) / 2, 56, EQUIP_BY_ID[id]);
        this.text(EQUIP_BY_ID[id].name, s.x + s.w + 18, s.y + 50, { size: 14, color: "#9cf0a0" });
      } else {
        this.text("(empty)", s.x + s.w + 18, s.y + 50, { size: 14, color: "#8890b0" });
      }
    }

    if (ui.drag) this.drawEquipIcon(ui.drag.mx - 28, ui.drag.my - 28, 56, EQUIP_BY_ID[ui.drag.id]);
    const tab = this.player.party.some(m => m.id === "ally") ? "← →  switch character  ·  " : "";
    this.text(tab + "ESC  back", W / 2, H - 32, { align: "center", size: 15, color: "rgba(230,235,255,0.7)" });
  },

  drawMainMenu() {
    const W = this.cv.width, p = this.player;
    // command list (top-right)
    const cw = 240, cx = W - cw - 24, cy = 24, rh = 40;
    this.drawWindow(cx, cy, cw, 24 + MAIN_MENU.length * rh);
    MAIN_MENU.forEach((o, i) => {
      const y = cy + 34 + i * rh, sel = i === this.ui.sel;
      const dis = o === "Save" && this.difficulty === "hardcore";   // permadeath: saving disabled
      if (sel) this.cursor(cx + 20, y - 6);
      this.text(o, cx + 40, y, { size: 20, color: dis ? "rgba(150,150,165,0.5)" : (sel ? "#ffe9a0" : "#dfe4ff"), bold: sel && !dis });
    });
    // hero card (left)
    const px = 24, py = 24, pw = W - cw - 24 - px - 20, ph = 150;
    this.drawWindow(px, py, pw, ph);
    const portraitH = ph - 28;
    this.drawPortrait(px + 16, py + 14, portraitH);
    const ix = px + 16 + portraitH * (this.art.portrait.width / this.art.portrait.height) + 18;
    this.text(p.name, ix, py + 44, { size: 24, bold: true, color: "#ffe9a0" });
    this.text("LV " + p.lv + "  " + p.job, ix, py + 70, { size: 16, color: "#cfd6ff" });
    this.text("HP", ix, py + 100, { size: 15, color: "#bfe8c0" });
    this.text(p.hp + " / " + p.maxhp, ix + 150, py + 100, { size: 15, align: "right", color: "#eef" });
    this.bar(ix, py + 106, 150, 8, p.hp / p.maxhp, "#5cd06a");
    this.text("MP", ix, py + 128, { size: 15, color: "#bcd0f0" });
    this.text(p.mp + " / " + p.maxmp, ix + 150, py + 128, { size: 15, align: "right", color: "#eef" });
    this.bar(ix, py + 134, 150, 8, p.mp / p.maxmp, "#5aa6f0");

    // ally status blocks (one card per recruited party member, e.g. Elara)
    let cardY = py + ph + 14;
    const ch = 132;
    p.party.forEach(m => {
      this.drawWindow(px, cardY, pw, ch);
      const cpH = ch - 28;
      let mx = px + 16;
      const por = this.art.ally_portrait || this.art[m.sprite];
      if (por) {
        const aw = cpH * (por.width / por.height);
        this.ctx.drawImage(por, mx, cardY + 14, aw, cpH);
        mx += aw + 18;
      }
      this.text(m.name, mx, cardY + 40, { size: 22, bold: true, color: "#ffe9a0" });
      this.text("LV " + (m.lv || p.lv) + "  Contact", mx, cardY + 64, { size: 15, color: "#cfd6ff" });
      this.text("HP", mx, cardY + 90, { size: 14, color: "#bfe8c0" });
      this.text(m.hp + " / " + m.maxhp, mx + 150, cardY + 90, { size: 14, align: "right", color: "#eef" });
      this.bar(mx, cardY + 96, 150, 7, m.hp / m.maxhp, "#5cd06a");
      this.text("MP", mx, cardY + 118, { size: 14, color: "#bcd0f0" });
      this.text(m.mp + " / " + m.maxmp, mx + 150, cardY + 118, { size: 14, align: "right", color: "#eef" });
      this.bar(mx, cardY + 124, 150, 7, m.mp / Math.max(1, m.maxmp), "#5aa6f0");
      cardY += ch + 14;
    });

    // gold + hint (bottom-left, below the cards)
    this.drawWindow(px, cardY, 220, 50);
    this.text("Gold", px + 18, cardY + 31, { size: 17, color: "#cfd6ff" });
    this.text(p.gold + " ", px + 202, cardY + 31, { size: 17, align: "right", color: "#ffe9a0" });
    this.text("↑↓ select   ENTER choose   ESC close", this.cv.width / 2, this.cv.height - 22,
      { align: "center", size: 14, color: "rgba(230,235,255,0.7)" });
  },

  drawStatusScreen() {
    const W = this.cv.width, H = this.cv.height, p = this.player;
    const x = 40, y = 36, w = W - 80, h = H - 110;
    this.drawWindow(x, y, w, h);
    const ph = h - 90;
    this.drawPortrait(x + 30, y + 30, ph);
    const colX = x + 30 + ph * (this.art.portrait.width / this.art.portrait.height) + 28;
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
    // party roster
    const py0 = y + 286 + 3 * 34 + 16;
    this.text("PARTY", colX, py0, { size: 16, color: "#9fb0e8" });
    if (p.party.length) {
      p.party.forEach((m, i) => {
        const px = colX + i * 60;
        const img = this.art[m.sprite];
        if (img) this.ctx.drawImage(img, px, py0 + 8, 40, 40 * img.height / img.width);
        this.text(m.name, px, py0 + 64, { size: 13, color: "#eef1ff" });
      });
    } else {
      this.text("(traveling alone)", colX, py0 + 22, { size: 15, color: "#8890b0" });
    }
    this.text("ESC  back", W / 2, H - 36, { align: "center", size: 15, color: "rgba(230,235,255,0.7)" });
  },

  drawPortrait(x, y, h, key) {
    const img = (key && this.art[key]) || this.art.portrait, w = h * (img.width / img.height), ctx = this.ctx;
    ctx.save();                                     // framed portrait with a dark backing
    ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = "rgba(220,228,255,0.7)"; ctx.lineWidth = 2; ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  },

  /* ----------------------------- dialogue box ---------------------------- */
  drawDialogue() {
    const W = this.cv.width, H = this.cv.height, ctx = this.ctx, d = this.dialogue;
    const lines = d.lines[d.page] || [];
    const bx = 40, bw = W - 80, bh = 150, by = H - bh - 30;
    this.drawWindow(bx, by, bw, bh);
    // portrait thumbnail on the left (skipped for speaker-less notes like signs)
    const ph = bh - 36;
    const showPortrait = d.name !== "";
    const pImg = (d.portrait && this.art[d.portrait]) || this.art.portrait;
    if (showPortrait) this.drawPortrait(bx + 18, by + 18, ph, d.portrait);
    const tx = showPortrait ? bx + 18 + ph * (pImg.width / pImg.height) + 26 : bx + 28;
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
  },

  /* ---------------------------- difficulty ------------------------------- */
  renderDifficulty() {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height, t = this.t / 1000;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1a1340"); g.addColorStop(1, "#3a2550");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const bw = Math.min(1100, W - 60), bh = Math.min(560, H - 60);
    const bx = (W - bw) / 2, by = (H - bh) / 2;
    this.drawWindow(bx, by, bw, bh);
    this.text("CHOOSE YOUR DIFFICULTY", W / 2, by + 60,
      { align: "center", size: 30, bold: true, color: "#ffe9a0" });

    const opts = [
      { id: "casual",   blurb: "A gentler journey for beginners." },
      { id: "normal",   blurb: "The intended challenge." },
      { id: "hard",     blurb: "Foes hit harder and endure more." },
      { id: "hardcore", blurb: "Brutal. For the true warriors." },
    ];

    const slotW = (bw - 80) / opts.length;
    const slotsY = by + 110;
    const slotH = bh - 220;

    opts.forEach((o, i) => {
      const sel = i === this.difficultySel;
      const cx = bx + 40 + slotW * (i + 0.5);
      const cy = slotsY + slotH / 2;
      const img = this.art["diff_" + o.id];
      if (!img) return;

      // selected pulse / glow
      if (sel) {
        const pulse = 0.55 + 0.35 * Math.sin(t * 4);
        ctx.save();
        const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, slotW * 0.55);
        glow.addColorStop(0, `rgba(255,220,120,${0.55 * pulse})`);
        glow.addColorStop(1, "rgba(255,220,120,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(cx - slotW * 0.6, cy - slotH * 0.55, slotW * 1.2, slotH * 1.1);
        ctx.restore();
      }

      // fit the badge inside the slot, preserving aspect
      const pad = sel ? 8 : 18;
      const scale = Math.min((slotW - pad * 2) / img.width, (slotH - pad * 2) / img.height);
      const dw = img.width * scale * (sel ? 1.06 : 1);
      const dh = img.height * scale * (sel ? 1.06 : 1);
      ctx.save();
      ctx.globalAlpha = sel ? 1 : 0.62;
      ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
      ctx.restore();

      // selection arrow above
      if (sel) {
        const blink = 0.45 + 0.55 * Math.sin(t * 6);
        ctx.fillStyle = `rgba(255,224,128,${blink})`;
        const ay = slotsY - 14;
        ctx.beginPath();
        ctx.moveTo(cx - 10, ay - 10); ctx.lineTo(cx + 10, ay - 10); ctx.lineTo(cx, ay + 2);
        ctx.closePath(); ctx.fill();
      }
    });

    // blurb for the selected option
    const cur = opts[this.difficultySel];
    this.text(cur.blurb, W / 2, by + bh - 70,
      { align: "center", size: 20, color: "#eef1ff" });

    this.text("◀ ▶  select  ·  ENTER  confirm  ·  ESC  back",
      W / 2, by + bh - 32, { align: "center", size: 15, color: "#cfd6ff" });
  },

  /* ----------------------------- name entry ------------------------------ */
  renderName() {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height, t = this.t / 1000;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1a1340"); g.addColorStop(1, "#3a2550");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const bw = Math.min(720, W - 80), bh = 280, bx = (W - bw) / 2, by = (H - bh) / 2;
    this.drawWindow(bx, by, bw, bh);
    const portraitH = bh - 56;
    const garranAR = this.art.portrait.width / this.art.portrait.height;
    this.drawPortrait(bx + 28, by + 28, portraitH);
    const colX = bx + 28 + portraitH * garranAR + 24;
    this.text("NAME THE WARRIOR", colX, by + 56, { size: 24, bold: true, color: "#ffe9a0" });

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
  },

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
  },

  /* ----------------------------- You Died -------------------------------- */
  renderGameOver() {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height, t = this.t / 1000;
    const g = this.gameover || { sel: 1 };
    const hardcore = this.difficulty === "hardcore";
    const p = this.player, s = this.stats || { kills: 0, dmgDealt: 0, skillUses: {}, lastKiller: null };

    // black backdrop
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);

    // background art: scale to "cover" the screen, then darken
    const img = this.art.you_died;
    if (img) {
      const ar = img.width / img.height, sar = W / H;
      let dw, dh;
      if (sar > ar) { dw = W; dh = W / ar; } else { dh = H; dw = H * ar; }
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      // keep the art vivid: a light overall darken plus a heavier bottom vignette for UI legibility
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(0, 0, W, H);
      const vg = ctx.createLinearGradient(0, H * 0.48, 0, H);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.74)");
      ctx.fillStyle = vg; ctx.fillRect(0, H * 0.48, W, H * 0.52);
    }

    // (the art has its own baked-in "YOU DIED" sign — no "<name> has fallen" headline)

    // stats panel
    const skillUses = s.skillUses || {};
    const skillEntries = Object.entries(skillUses).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const skillStr = skillEntries.length
      ? skillEntries.map(([id, n]) => {
          const sk = (typeof SKILL_BY_ID !== "undefined" && SKILL_BY_ID[id]) ? SKILL_BY_ID[id] : null;
          return (sk ? sk.name : id) + " ×" + n;
        }).join(",  ")
      : "—";
    const rows = [
      ["Difficulty",      this.difficulty.toUpperCase()],
      ["Level reached",   String((p && p.lv) || 1)],
      ["Enemies slain",   String(s.kills || 0)],
      ["Damage dealt",    String(s.dmgDealt || 0)],
      ["Felled by",       s.lastKiller || "—"],
      ["Most-used skills",skillStr],
    ];

    const pw = Math.min(720, W - 80), ph = 28 + rows.length * 28;
    const px = (W - pw) / 2, py = H * 0.56;
    ctx.fillStyle = "rgba(10,6,6,0.72)";
    ctx.strokeStyle = "rgba(220,80,40,0.55)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill(); ctx.stroke();
    rows.forEach((r, i) => {
      const ry = py + 24 + i * 28;
      this.text(r[0], px + 28, ry, { size: 16, color: "#d9b9a4" });
      this.text(r[1], px + pw - 28, ry, { size: 16, color: "#ffe9a0", align: "right", bold: true });
    });

    // buttons: CONTINUE / HOME (Continue greyed on hardcore)
    const btns = [
      { id: "continue", label: "CONTINUE", disabled: hardcore },
      { id: "home",     label: "HOME",     disabled: false },
    ];
    const bw = 200, bh = 50, gap = 32, by0 = py + ph + 20;
    const totalW = bw * btns.length + gap * (btns.length - 1);
    let bx0 = (W - totalW) / 2;
    btns.forEach((b, i) => {
      const x = bx0 + i * (bw + gap);
      const sel = i === g.sel && !b.disabled;
      ctx.beginPath(); ctx.roundRect(x, by0, bw, bh, 8);
      ctx.fillStyle = b.disabled ? "rgba(40,30,30,0.6)"
                   : sel ? "rgba(120,30,20,0.85)"
                         : "rgba(40,20,18,0.78)";
      ctx.fill();
      ctx.lineWidth = sel ? 3 : 2;
      ctx.strokeStyle = b.disabled ? "rgba(120,90,80,0.4)"
                     : sel ? `rgba(255,${180 + Math.round(40 * Math.sin(t * 6))},120,0.95)`
                           : "rgba(220,80,40,0.6)";
      ctx.stroke();
      const color = b.disabled ? "rgba(170,150,150,0.45)" : sel ? "#ffe9a0" : "#e8d8c8";
      this.text(b.label, x + bw / 2, by0 + bh / 2 + 7, { size: 20, bold: true, color, align: "center" });
    });

    if (hardcore) {
      this.text("Hardcore — your save has been consumed.",
        W / 2, by0 + bh + 26, { align: "center", size: 13, color: "#d9a89a" });
    } else {
      this.text("◀ ▶  select  ·  ENTER  confirm",
        W / 2, by0 + bh + 26, { align: "center", size: 13, color: "#cfb3a8" });
    }
  },

  /* ---------------------------- save picker ------------------------------ */
  renderSaveSelect() {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height, t = this.t / 1000;
    const list = this.listSaves();

    // moody backdrop
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1a1340"); g.addColorStop(1, "#3a2550");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const bw = Math.min(720, W - 60), bh = Math.min(560, H - 60);
    const bx = (W - bw) / 2, by = (H - bh) / 2;
    this.drawWindow(bx, by, bw, bh);
    this.text("CONTINUE A SAVE", W / 2, by + 50,
      { align: "center", size: 24, bold: true, color: "#ffe9a0" });

    if (!list.length) {
      this.text("No saves found.", W / 2, by + bh / 2,
        { align: "center", size: 18, color: "#cfd6ff" });
      return;
    }

    const sel = Math.min(this.saveSel || 0, list.length - 1);
    const rowH = 64;
    const listX = bx + 28, listY = by + 80;
    const listW = bw - 56, listH = bh - 130;
    const visible = Math.max(1, Math.floor(listH / rowH));
    const start = Math.max(0, Math.min(list.length - visible, sel - Math.floor(visible / 2)));

    // clip the scroll viewport
    ctx.save();
    ctx.beginPath(); ctx.rect(listX, listY, listW, listH); ctx.clip();

    for (let i = start; i < Math.min(list.length, start + visible); i++) {
      const s = list[i];
      const y = listY + (i - start) * rowH;
      const isSel = i === sel;

      ctx.beginPath(); ctx.roundRect(listX, y + 4, listW, rowH - 8, 6);
      ctx.fillStyle = isSel ? "rgba(80,60,30,0.85)" : "rgba(20,18,40,0.65)";
      ctx.fill();
      if (isSel) {
        const pulse = 0.6 + 0.3 * Math.sin(t * 5);
        ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,224,128,${pulse})`;
        ctx.stroke();
      } else {
        ctx.lineWidth = 1; ctx.strokeStyle = "rgba(180,180,210,0.25)"; ctx.stroke();
      }

      const tx = listX + 16, ty = y + rowH / 2;
      this.text(s.name || "—", tx, ty - 4, { size: 18, bold: true, color: "#ffe9a0" });
      const meta = `LV ${s.lv}  ·  ${(s.difficulty || "normal").toUpperCase()}  ·  ${s.area || "?"}`;
      this.text(meta, tx, ty + 16, { size: 13, color: "#cfd6ff" });

      const when = s.at ? new Date(s.at) : null;
      const stamp = when
        ? when.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
        : "";
      this.text(stamp, listX + listW - 16, ty + 4,
        { size: 13, color: "#cfd6ff", align: "right" });
    }
    ctx.restore();

    // scroll indicators
    if (start > 0) this.text("▲", bx + bw / 2, listY + 14, { align: "center", size: 16, color: "#ffe9a0" });
    if (start + visible < list.length)
      this.text("▼", bx + bw / 2, listY + listH - 4, { align: "center", size: 16, color: "#ffe9a0" });

    this.text("UP / DOWN  select  ·  ENTER  load  ·  DEL  remove  ·  ESC  back",
      W / 2, by + bh - 24, { align: "center", size: 14, color: "#cfd6ff" });
  }
});
