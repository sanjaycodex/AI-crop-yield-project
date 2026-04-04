const startPredictionBtn = document.getElementById("startPredictionBtn");

startPredictionBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  window.location.assign(new URL("form.html", window.location.href).href);
});
