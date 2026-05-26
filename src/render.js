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
    const chest = this.world.chest;
    if (chest) {
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
        shadow(e.x, e.y, w * 0.8);
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
    // party followers trail the hero along recent poses (walk-cycle animated)
    p.party.forEach((m, i) => {
      const pose = this.trail[Math.min(this.trail.length - 1, 14 * (i + 1))];
      if (!pose) return;
      const base = m.sprite || "ally_idle", stem = base.replace(/_idle$/, "");
      const img = pose.moving && art[`${stem}_walk_${pose.frame % 3}`]
        ? art[`${stem}_walk_${pose.frame % 3}`] : (art[base] || art.idle);
      renderables.push({ sortY: pose.y - 1, draw: () => {
        shadow(pose.x, pose.y + 14, 0.7);
        this.drawSprite(img, pose.x, pose.y + 14, 1.0, pose.face === 1);
      }});
    });
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
    else if (ui.screen === "items") this.drawItemsScreen();
    else if (ui.screen === "skills") this.drawSkillsScreen();
    else if (ui.screen === "equip") this.drawEquipScreen();
  },

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
    const ui = this.ui, p = this.player, L = this.skillLayout();
    const hit = r => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
    while (p.skills.length < L.n) p.skills.push(null);
    p.skills.length = L.n;
    if (type === "down") {
      for (const r of L.rows) if (hit(r) && (p.lv >= r.skill.unlock || p.boughtSkills.includes(r.skill.id))) { ui.drag = { id: r.skill.id, from: "list", mx, my }; return; }
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
  },
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
      const s = r.skill, locked = p.lv < s.unlock && !p.boughtSkills.includes(s.id), equipped = p.skills.includes(s.id);
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
  },

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
  },

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
  }
});
