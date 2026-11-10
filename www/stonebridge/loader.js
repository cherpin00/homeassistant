// Loaded by HA as a dashboard resource (Settings > Dashboards > Resources).
// Devices cache this file hard: HA serves /local/ with a 31-day browser cache
// and its service worker answers from its own cache first. If this file ever
// changes, bump the ?v= on the resource URL so every device fetches it again.
//
// It asks for the current bundle version, then imports the bundle under that
// version, so card updates reach every device on its next page load.
(async () => {
  // An older copy of this loader may also be running; only one may load a bundle.
  if (window.__stonebridgeLoader) return;
  window.__stonebridgeLoader = true;

  const base = new URL(".", import.meta.url);
  let v = "dev";
  try {
    // A URL nobody has seen before is the only thing that gets past the service
    // worker, which otherwise hands back the previous version.json.
    const r = await fetch(new URL(`dist/version.json?t=${Date.now()}`, base), { cache: "no-store" });
    v = (await r.json()).version;
  } catch (e) {
    console.warn("stonebridge: version lookup failed, loading unversioned", e);
  }
  try {
    await import(new URL(`dist/stonebridge.js?v=${v}`, base).href);
    console.info(`%c stonebridge %c ${v} `, "background:#2c6e66;color:#fff", "background:#14203a;color:#5fd4bf");
  } catch (e) {
    console.error("stonebridge: bundle failed to load", e);
    logToHa(`bundle ${v} failed to load: ${e?.stack ?? e} — ${navigator.userAgent}`);
  }
})();

// The cards never registered, so nothing else can report this. Wait for the
// frontend to connect, then write to HA's system log (logger "stonebridge").
async function logToHa(message) {
  for (let i = 0; i < 60; i++) {
    const hass = document.querySelector("home-assistant")?.hass;
    if (hass?.callService) {
      hass.callService("system_log", "write", { logger: "stonebridge", level: "error", message: message.slice(0, 2000) }).catch(() => {});
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
