/* -------------------------------- bootstrap ------------------------------ */
loadAll(ASSETS).then(art => {
  document.getElementById("loader").remove();
  window.GAME = new Game(document.getElementById("game"), art);
}).catch(err => {
  document.getElementById("loader").textContent = "Asset load error: " + err.message;
  console.error(err);
});
