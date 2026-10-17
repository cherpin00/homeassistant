// The one stylesheet. Cards never define their own palette — change colours here.
export const theme = `
:host {
  --sb-card: #181c23; --sb-navy: #14203a; --sb-navy2: #1a2a4a; --sb-line: #2a3140;
  --sb-text: #e9edf3; --sb-muted: #9aa4b5; --sb-dim: #6b7486;
  --sb-ok: #5fd4bf; --sb-ok-d: #2c6e66; --sb-warn: #f2b45a; --sb-alert: #e86a6a;
  --sb-info: #9fb3d8; --sb-violet: #a98bff; --sb-r: 26px;
  display: block; color: var(--sb-text);
  max-width: 560px; margin: 0 auto; padding: 12px;
  font-family: var(--ha-font-family-body, Roboto, system-ui, sans-serif);
}
* { box-sizing: border-box; }
.card { background: var(--sb-card); border: 1px solid var(--sb-line); border-radius: var(--sb-r);
  padding: 18px; position: relative; overflow: hidden; }
.card.navy { background: linear-gradient(180deg, var(--sb-navy2), var(--sb-navy)); border-color: #2a3a5c; }
.stack { display: flex; flex-direction: column; gap: 12px; }
.eyebrow { color: var(--sb-muted); font-size: 13px; }
.headline { font-size: 23px; font-weight: 500; line-height: 1.2; margin: 4px 0 6px; }
.sub { color: var(--sb-muted); font-size: 14px; line-height: 1.45; }
.section { color: #aab4c8; font-size: 16px; font-weight: 500; margin: 6px 4px 0; }
.tone-ok { color: var(--sb-ok); } .tone-warn { color: var(--sb-warn); }
.tone-alert { color: var(--sb-alert); } .tone-info { color: var(--sb-info); }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 10px;
  background: currentColor; box-shadow: 0 0 8px currentColor; flex: none; }
.grid { display: grid; gap: 10px; }
.g2 { grid-template-columns: 1fr 1fr; } .g3 { grid-template-columns: repeat(3, 1fr); }
.g4 { grid-template-columns: repeat(4, 1fr); }
.tile { background: var(--sb-card); border: 1px solid var(--sb-line); border-radius: 20px; padding: 14px;
  min-height: 92px; cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent; text-align: left;
  color: inherit; font: inherit; }
.tile.ok { background: linear-gradient(180deg, #183a37, #142826); border-color: #2b5d56; }
.tile.warn { background: linear-gradient(180deg, #3a2d18, #261f14); border-color: #6a5124; }
.tile.alert { background: linear-gradient(180deg, #3a1d1d, #261414); border-color: #6a2a2a; }
.tile.armed { border-color: var(--sb-alert); background: #2a1a1a; }
.tile ha-icon { --mdc-icon-size: 22px; color: var(--sb-info); }
.tile.ok ha-icon { color: var(--sb-ok); } .tile.warn ha-icon { color: var(--sb-warn); }
.tile b { display: block; font-weight: 500; font-size: 16px; margin-top: 8px; }
.tile small { color: var(--sb-muted); font-size: 13px; }
.round { display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;
  background: none; border: 0; color: inherit; font: inherit; padding: 0; -webkit-tap-highlight-color: transparent; }
.round .btn { width: 62px; height: 62px; border-radius: 50%; border: 2px solid var(--sb-ok-d); background: #16302d;
  display: grid; place-items: center; color: var(--sb-ok); transition: transform .1s; }
.round:active .btn { transform: scale(.94); }
.round.on .btn { background: var(--sb-ok-d); color: #fff; }
.round span { font-size: 13px; text-align: center; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { border: 1px solid #2f5a55; color: var(--sb-ok); border-radius: 999px; padding: 6px 12px; font-size: 13px; }
.chip.mute { border-color: var(--sb-line); color: var(--sb-muted); }
.chip.warn { border-color: #6a5124; color: var(--sb-warn); }
.bar { height: 12px; background: #262c38; border-radius: 99px; position: relative; }
.bar > div { position: absolute; inset: 0 auto 0 0; border-radius: 99px; background: var(--sb-ok); box-shadow: 0 0 12px #5fd4bf66; }
.bar .mark { position: absolute; top: -6px; bottom: -6px; width: 2px; background: #cfd6e0; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 0;
  border-bottom: 1px solid #232937; }
.row:last-child { border-bottom: 0; }
.row > span:first-child { display: flex; align-items: center; }
.seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.seg button { border: 1px solid var(--sb-line); border-radius: 18px; padding: 12px 6px; text-align: center; font: inherit;
  font-size: 15px; background: var(--sb-card); color: inherit; cursor: pointer; display: flex; flex-direction: column;
  align-items: center; gap: 4px; }
.seg button.on { border-color: #cfd6e0; background: #232a36; }
.pending { outline: 2px solid var(--sb-warn); outline-offset: 2px; }
.pending .btn, .pending.tile { border-color: var(--sb-warn) !important; }
.muted { opacity: .45; }
.big { font-size: 56px; font-weight: 300; line-height: 1; }
.unavail { color: var(--sb-dim); }
`;
