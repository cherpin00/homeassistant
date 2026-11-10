import { esc, icon } from "./base.js";

// The house, traced from the measured plan dated 09/05/2025 ("Full House Plan",
// 1:110). Coordinates are that drawing's pixels. The street side — front door
// and garage — is the bottom edge. Rooms sit slightly inside their walls, so the
// shell showing through the gaps reads as the walls.
//
// `area` is the Home Assistant area id for the room. That is what places a
// device on the plan: assign the device to the area in HA and it appears here.
const SHELL = "318,405 990,405 990,170 1420,170 1420,1087 990,1087 990,980 318,980";
const ROOMS = {
  garage: { area: "garage", name: "Garage", pts: "328,622 655,622 655,970 328,970", at: [491, 806] },
  laundry: { area: "utility", name: "Utility", pts: "328,415 480,415 480,612 328,612", at: [404, 524] },
  kitchen: { area: "kitchen", name: "Kitchen", pts: "487,415 700,415 700,612 487,612", at: [593, 524] },
  living: { area: "living_room", name: "Living room", pts: "706,415 1135,415 1135,480 1088,480 1088,750 990,750 990,975 910,975 910,750 660,750 660,618 706,618", at: [880, 590] },
  office: { area: "office", name: "Office", pts: "660,756 905,756 905,970 660,970", at: [782, 872] },
  wet_bar: { area: "wet_bar", title: "Wet bar", name: "", pts: "994,752 1082,752 1082,786 994,786", at: [1038, 776] },
  half_bath: { area: "half_bath", title: "Half bath", name: "", pts: "994,792 1082,792 1082,880 994,880", at: [1038, 844] },
  hall_closet: { name: "", pts: "1088,758 1170,758 1170,880 1088,880", at: [1129, 820] },
  hallway: { area: "hallway", title: "Hallway", name: "", pts: "1095,690 1235,690 1235,890 1178,890 1178,752 1095,752", at: [1165, 722] },
  bed_1: { area: "bed_1", name: "Bed 1", pts: "1242,692 1410,692 1410,862 1242,862", at: [1326, 786] },
  bed_2: { area: "bed_2", name: "Bed 2", pts: "1178,898 1410,898 1410,1080 1178,1080", at: [1294, 998] },
  bed_3: { area: "bed_3", name: "Bed 3", pts: "994,888 1170,888 1170,1080 994,1080", at: [1082, 993] },
  guest_bath: { area: "guest_bath", name: "Guest bath", pts: "1217,597 1410,597 1410,685 1217,685", at: [1313, 650] },
  primary_closet: { name: "Closet", pts: "1094,486 1209,486 1209,655 1094,655", at: [1151, 578] },
  primary_bath: { area: "master_bath", title: "Master bath", name: "Bath", pts: "1217,442 1410,442 1410,590 1217,590", at: [1313, 524] },
  closets: { name: "", pts: "1088,758 1172,758 1172,884 1088,884", at: [1130, 820] },
  bed_1_closets: { name: "", pts: "1242,868 1410,868 1410,892 1242,892", at: [1326, 880] },
  fireplace: { name: "", pts: "1000,358 1144,358 1144,405 1000,405", at: [1072, 382] },
  primary_bed: { area: "master", name: "Master", pts: "1000,180 1410,180 1410,435 1150,435 1150,352 1000,352", at: [1215, 300] },
};

// Named places outside the rooms, for markers. The camera corners are as seen
// from the street. A config entry can give `at: [x, y]` instead of a `spot`.
const SPOTS = {
  front_door: [948, 926],
  doorbell: [948, 1052],
  back_door: [408, 372],
  garage_door: [491, 1012],
  front_left: [286, 1012],
  front_right: [1452, 1112],
  back_left: [286, 372],
  back_right: [1452, 146],
};

// The plan room for a Home Assistant area id, or null if the area is not a room here.
export function roomForArea(areaId) {
  if (!areaId) return null;
  return Object.keys(ROOMS).find((id) => ROOMS[id].area === areaId) ?? null;
}

// Rooms that stand for an HA area: [{ id, area, name }].
export function planRooms() {
  return Object.entries(ROOMS).filter(([, r]) => r.area).map(([id, r]) => ({ id, area: r.area, name: r.title ?? r.name }));
}

export function planSpot(p) {
  if (Array.isArray(p.at)) return p.at;
  if (p.spot == null) return null;
  if (!SPOTS[p.spot]) throw new Error(`floor plan has no spot "${p.spot}" (have: ${Object.keys(SPOTS).join(", ")})`);
  return SPOTS[p.spot];
}

// rooms:   { id: { cls?, label?, note?, action?, level?, badges? } } — rooms not listed are drawn plain.
//          cls "lit" fills the room; level (0..1) is how strongly. note is a small
//          second line. badges: [{ icon, cls?, action? }] sit in the room's top-right corner.
// markers: [{ at: [x, y], icon, cls?, label?, action? }]
// cls on the plan itself: "armed" outlines the house.
export function floorplan({ rooms = {}, markers = [], cls = "", labels = true } = {}) {
  for (const id of Object.keys(rooms)) {
    if (!ROOMS[id]) throw new Error(`floor plan has no room "${id}" (have: ${Object.keys(ROOMS).join(", ")})`);
  }
  const room = ([id, r]) => {
    const s = rooms[id] ?? {};
    const [w, , maxX, minY] = extent(r.pts);
    // In a narrow room, move the label clear of the corner badges.
    const lx = r.at[0] - (w < 220 ? 24 * (s.badges?.length ?? 0) : 0);
    const label = labels ? s.label ?? r.name : "";
    // Shrink a label that would not fit its room.
    const size = label ? Math.min(26, (w * 1.75) / label.length) : 0;
    return `
      <polygon class="room ${s.cls ?? ""} ${s.action ? "tap" : ""}" points="${r.pts}"
        ${s.cls?.startsWith("lit") ? `style="fill-opacity:${(0.35 + 0.55 * (s.level ?? 1)).toFixed(2)}"` : ""}
        ${s.action ? `data-action="${esc(s.action)}"` : ""}/>
      ${label && size >= 13 ? `<text class="${s.cls ?? ""}" x="${lx}" y="${r.at[1] - (s.note != null ? 14 : 0)}" font-size="${size.toFixed(1)}">${esc(label)}</text>` : ""}
      ${s.note != null ? `<text class="note ${s.cls ?? ""}" x="${lx}" y="${r.at[1] + (label && size >= 13 ? 18 : 0)}" font-size="30">${esc(s.note)}</text>` : ""}
      ${(s.badges ?? []).map((b, i) => `
        <g class="badge ${b.cls ?? ""} ${b.action ? "tap" : ""}" ${b.action ? `data-action="${esc(b.action)}"` : ""}>
          <circle class="hit" cx="${maxX - 30 - i * 52}" cy="${minY + 30}" r="34"/>
          <circle class="disc" cx="${maxX - 30 - i * 52}" cy="${minY + 30}" r="22"/>
          <foreignObject x="${maxX - 46 - i * 52}" y="${minY + 14}" width="32" height="32"><div xmlns="http://www.w3.org/1999/xhtml" class="glyph">${icon(b.icon)}</div></foreignObject>
        </g>`).join("")}`;
  };
  // Labels near a side edge grow inward so they are not cut off.
  const side = (x) => (x > 1380 ? ["end", 30] : x < 360 ? ["start", -30] : ["middle", 0]);
  const mark = (m) => `
    <g class="mark ${m.cls ?? ""} ${m.action ? "tap" : ""}" ${m.action ? `data-action="${esc(m.action)}"` : ""}>
      <circle class="hit" cx="${m.at[0]}" cy="${m.at[1]}" r="52"/>
      <circle class="disc" cx="${m.at[0]}" cy="${m.at[1]}" r="30"/>
      <foreignObject x="${m.at[0] - 20}" y="${m.at[1] - 20}" width="40" height="40"><div xmlns="http://www.w3.org/1999/xhtml" class="glyph">${icon(m.icon)}</div></foreignObject>
      ${m.label ? `<text style="text-anchor:${side(m.at[0])[0]}" x="${m.at[0] + side(m.at[0])[1]}" y="${m.at[1] + (m.at[1] > 600 ? 56 : -40)}" font-size="22">${esc(m.label)}</text>` : ""}
    </g>`;
  return `
  <svg class="plan ${cls}" viewBox="236 96 1266 1086" aria-hidden="true">
    <polygon class="shell" points="${SHELL}"/>
    ${Object.entries(ROOMS).map(room).join("")}
    ${markers.filter((m) => m.at).map(mark).join("")}
  </svg>`;
}

function extent(pts) {
  const xy = pts.split(" ").map((p) => p.split(",").map(Number));
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Math.max(...xs), Math.min(...ys)];
}
