import assert from "node:assert/strict";
import test from "node:test";
import {parseABC} from "../assets/abc.js";
import {EXAMPLES} from "../assets/library.js";
import {HandpanSampler} from "../assets/audio.js";

test("both bundled melodies have audible notes, full repetitions, and increasing event times", () => {
  for(const item of EXAMPLES) {
    const parsed=parseABC(item.abc);
    assert.ok(parsed.notes.length>=20, item.id+" should have a real sequence");
    assert.ok(parsed.duration>5 && parsed.duration<180, item.id+": incorrect duration");
    assert.equal(parsed.unsupported,0,item.id+" uses pitches outside D minor handpan");
    assert.ok(parsed.supported>20,item.id+" should have more than 20 playable hits");
    for(let i=1;i<parsed.notes.length;i++) {
      assert.ok(parsed.notes[i].at>=parsed.notes[i-1].at, item.id+" must be chronological");
    }
    assert.ok(parsed.notes.every(e=>e.at>=0 && e.duration>0 && e.at<parsed.duration));
  }
});

test("D minor key signature flattens B, retains C5, and maps A, to MIDI 57", () => {
  const piece=parseABC("X:1\nT:Keys\nM:6/8\nL:1/8\nQ:3/8=60\nK:Dm\nA, D B c |");
  assert.deepEqual(piece.notes.map(e=>e.pitches[0]),[57,62,70,72]);
  assert.ok(Math.abs(piece.notes[1].at-1/3)<0.001);
});

test("a normal pair of repeat signs doubles the region", () => {
  const piece=parseABC("X:1\nT:Repeat\nM:2/4\nL:1/4\nQ:1/4=60\nK:Dm\n|: D F :|");
  assert.deepEqual(piece.notes.map(e=>e.pitches[0]),[62,65,62,65]);
  assert.equal(piece.duration,4);
});

test("rests, chords, accidentals, dotted and broken rhythm are interpreted", () => {
  const piece=parseABC("X:1\nT:Rhythm\nM:4/4\nL:1/8\nQ:1/4=120\nK:Dm\n[DF]2 z/ D>E _B B | B");
  assert.deepEqual(piece.notes[0].pitches,[62,65]);
  assert.deepEqual(piece.notes[1].pitches,[]);
  assert.ok(piece.notes[3].duration<piece.notes[2].duration);
  assert.equal(piece.notes[4].pitches[0],70); // Explicit flat B remains Bb.
});

test("invalid and unplayable ABC fails clearly", () => {
  assert.throws(()=>parseABC("garbage"),/K:/);
  assert.throws(()=>parseABC("X:1\nK:Dm\n^C2"),/Нет нот из строя/);
  assert.throws(()=>parseABC("X:1\nK:Dm\n[DF"),/Незакрытый аккорд/);
});

test("sampler schedules a real recorded buffer at an audio-clock timestamp", () => {
  const sampler=new HandpanSampler();
  const scheduled=[];
  const mockSource={
    connect(){},disconnect(){},
    start(at){scheduled.push(at)},
    stop(){}
  };
  const mockGain={gain:{value:0},connect(){},disconnect(){}};
  sampler.context={currentTime:3.5,state:"running",createBufferSource:()=>({...mockSource}),createGain:()=>({...mockGain,gain:{value:0}})};
  sampler.dry={};sampler.convolver={};
  sampler.buffers.set("D4",[{}]);
  assert.equal(sampler.hit(62,0.8,4.25),true);
  assert.equal(scheduled[0],4.25);
  assert.equal(sampler.hit(61,0.8,4.25),false);
});
