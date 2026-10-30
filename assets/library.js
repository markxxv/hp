export const EXAMPLES = [
  {
    id: "demo-still-water",
    abc: [
      "X:1",
      "T:Still Water",
      "C:HP Studio",
      "M:6/8",
      "L:1/8",
      "Q:3/8=56",
      "K:Dm",
      "|: D2 A E F E | D3 z A2 | D E F A2 G | F3 E2 D |",
      "A,2 D F E D | G2 A B A G | F E D E F G | A3 z3 |",
      "D2 F A G F | E3 D2 A, | D E F G2 A | B3 A2 G |",
      "F2 E D2 A, | D E F A G E | D3 [DA]3 | D6 :|"
    ].join("\n")
  },
  {
    id: "demo-copper-sky",
    abc: [
      "X:2",
      "T:Copper Sky",
      "C:HP Studio",
      "M:3/4",
      "L:1/8",
      "Q:1/4=76",
      "K:Dm",
      "|: A,2 D2 F2 | A3 G F E | D2 F2 A2 | G4 E2 |",
      "D2 E2 F2 | A2 B2 c2 | B2 A2 G2 | F4 z2 |",
      "A,2 D2 A2 | G2 F2 E2 | D2 F2 G2 | A4 B2 |",
      "c2 B2 A2 | G2 F2 E2 | [DF]2 E2 D2 | D6 :|"
    ].join("\n")
  }
];

const KEY = "hp-studio:melodies:v1";

export function readLibrary() {
  const raw = localStorage.getItem(KEY);
  if (raw === null) {
    localStorage.setItem(KEY, JSON.stringify(EXAMPLES));
    return EXAMPLES.map((tune) => ({...tune}));
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Некорректная библиотека");
  return parsed.filter((item) =>
    item && typeof item.id === "string" && typeof item.abc === "string"
  );
}

export function saveMelody(id, abc) {
  const entries = readLibrary();
  const entry = {id, abc};
  const index = entries.findIndex((item) => item.id === id);
  if (index === -1) entries.unshift(entry);
  else entries[index] = entry;
  localStorage.setItem(KEY, JSON.stringify(entries));
  return entries;
}

export function removeMelody(id) {
  const entries = readLibrary().filter((entry) => entry.id !== id);
  localStorage.setItem(KEY, JSON.stringify(entries));
  return entries;
}

export function getTitle(abc) {
  return abc.match(/^T:\s*(.+)$/m)?.[1]?.trim() || "Без названия";
}

export function getMeter(abc) {
  return abc.match(/^M:\s*(.+)$/m)?.[1]?.trim() || "—";
}

export function getTempo(abc) {
  return abc.match(/^Q:\s*(.+)$/m)?.[1]?.trim() || "—";
}

export function makeId() {
  return globalThis.crypto?.randomUUID?.() || "melody-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}