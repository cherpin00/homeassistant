// Loaded by HA via `frontend: extra_module_url`. This file must never need to
// change: it is cached by the browser. It asks for the current bundle version
// with caching off, then imports the bundle under that version.
(async () => {
  const base = new URL(".", import.meta.url);
  let v = "dev";
  try {
    const r = await fetch(new URL("dist/version.json", base), { cache: "no-store" });
    v = (await r.json()).version;
  } catch (e) {
    console.warn("stonebridge: version lookup failed, loading unversioned", e);
  }
  await import(new URL(`dist/stonebridge.js?v=${v}`, base).href);
  console.info(`%c stonebridge %c ${v} `, "background:#2c6e66;color:#fff", "background:#14203a;color:#5fd4bf");
})();
