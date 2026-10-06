(() => {
  const preloader = document.getElementById("preloader");
  const startedAt = performance.now();
  const revealPreloader = () => window.setTimeout(
    () => preloader?.classList.add("done"),
    Math.max(0, 2400 - (performance.now() - startedAt))
  );

  window.addEventListener("load", revealPreloader, { once: true });
  window.setTimeout(() => preloader?.classList.add("done"), 3000);
})();
