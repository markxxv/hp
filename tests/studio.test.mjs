import assert from "node:assert/strict";
import test from "node:test";
import { NOTES, getNoteName, getSamplePaths } from "../assets/audio.js";
import { EXAMPLES, getTitle, getMeter, getTempo, readLibrary, saveMelody, removeMelody } from "../assets/library.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value)
  };
}

test("only nine genuinely sampled notes are exposed", () => {
  assert.deepEqual(NOTES.map((n) => n.midi), [57,62,64,65,67,69,70,72,74]);
  assert.equal(getNoteName(70), "Bb4");
  assert.equal(getNoteName(61), null);
  assert.equal(getSamplePaths().length, 27);
  assert.equal(new Set(getSamplePaths()).size, 27);
});

test("examples have complete ABC headers", () => {
  assert.equal(EXAMPLES.length, 2);
  for (const tune of EXAMPLES) {
    for (const header of ["X:", "T:", "M:", "L:", "Q:", "K:"]) {
      assert.ok(tune.abc.includes("\n" + header) || tune.abc.startsWith(header));
    }
    assert.ok(getTitle(tune.abc).length > 0);
    assert.notEqual(getMeter(tune.abc), "—");
    assert.notEqual(getTempo(tune.abc), "—");
  }
});

test("library seeds once, stores, overwrites and deletes melodies", () => {
  globalThis.localStorage = storage();
  assert.equal(readLibrary().length, 2);
  saveMelody("custom", "X:1\nT:Original\nK:Dm\nD2");
  assert.equal(readLibrary().length, 3);
  saveMelody("custom", "X:1\nT:Edited\nK:Dm\nD2");
  assert.equal(readLibrary().length, 3);
  assert.equal(getTitle(readLibrary()[0].abc), "Edited");
  removeMelody("custom");
  assert.equal(readLibrary().length, 2);
  removeMelody("demo-still-water");
  removeMelody("demo-copper-sky");
  assert.equal(readLibrary().length, 0);
  assert.equal(readLibrary().length, 0);
});
