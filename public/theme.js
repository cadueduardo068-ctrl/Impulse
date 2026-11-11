(() => {
  let preference;
  try {
    preference = localStorage.getItem("impulsa-theme");
  } catch {
    // A preferência do dispositivo continua disponível com storage bloqueado.
  }
  document.documentElement.dataset.theme =
    preference === "light" || preference === "dark"
      ? preference
      : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
})();
