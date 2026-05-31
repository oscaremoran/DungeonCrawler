/* -------------------------------- bootstrap ------------------------------ */
loadAll(ASSETS).then(art => {
  document.getElementById("loader").remove();
  const game = new Game(document.getElementById("game"), art);

  // Anti-cheat honeypot: the real instance lives in this closure (NOT on window).
  // Poking the bait globals from the console trips the tripwire. Disabled for the
  // ?dev test harnesses, which need a real handle.
  if (game.devMode) {
    window.GAME = game;
    return;
  }
  const honeypot = new Proxy(function () {}, {
    get() { game.cheatDetected(); return undefined; },
    set() { game.cheatDetected(); return true; },
    has() { game.cheatDetected(); return false; },
    apply() { game.cheatDetected(); },
    construct() { game.cheatDetected(); return {}; },
  });
  for (const bait of ["GAME", "cheat", "cheats", "godmode", "noclip", "hack"]) {
    try { Object.defineProperty(window, bait, { configurable: false, get() { return honeypot; } }); }
    catch (e) {}
  }
}).catch(err => {
  document.getElementById("loader").textContent = "Asset load error: " + err.message;
  console.error(err);
});
