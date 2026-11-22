import test from "node:test";
import assert from "node:assert/strict";
import {parseABC} from "../src/abc.js";
import {LiveRecording,MAX_RECORD_SECONDS,MAX_RECORD_NOTES} from "../src/recorder.js";
import {createMIDI} from "../src/score-export.js";

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} !== ${b}`);

test("recording trims the lead-in but retains irregular intervals, rests and trailing silence",()=>{
  const take=new LiveRecording("Live");
  assert.equal(take.toABC(9000),null);
  assert.equal(take.elapsed(9000),0);
  take.hit(62,9123);
  take.hit(70,9480);
  take.hit(57,12000);
  take.hit(74,12000);
  const abc=take.toABC(14500);
  assert.match(abc,/M:none/);
  assert.match(abc,/z\d/);
  const score=parseABC(abc);
  const hits=score.notes.filter(note=>note.pitches.length);
  assert.deepEqual(hits.map(n=>n.pitches),[[62],[70],[57,74]]);
  [0,.357,2.877].forEach((time,i)=>near(hits[i].at,time));
  near(score.duration,5.377);
  assert.equal(score.unsupported,0);
});

test("rapid repeated hits and long rests stay valid, recording limits are enforced",()=>{
  const take=new LiveRecording("Long pause");
  assert.equal(take.hit(61,0),false);
  take.hit(62,1000);
  take.hit(62,1000);
  take.hit(64,301000);
  assert.equal(take.hit(65,601000),false);
  const score=parseABC(take.toABC(900000));
  const notes=score.notes.filter(n=>n.pitches.length);
  near(notes[1].at,.001);
  near(notes[2].at,300);
  near(score.duration,MAX_RECORD_SECONDS);
  const full=new LiveRecording("Dense");
  for(let i=0;i<MAX_RECORD_NOTES;i++)assert.equal(full.hit(62,i*100),true);
  assert.equal(full.hit(62,500000),false);
  assert.equal(parseABC(full.toABC(500000)).supported,MAX_RECORD_NOTES);
});

test("MIDI exports the same performance timing, chords, rests and final pause",()=>{
  const take=new LiveRecording("MIDI");
  take.hit(62,10000);
  take.hit(70,10357);
  take.hit(74,10357);
  const sequence=parseABC(take.toABC(12000));
  const bytes=createMIDI(sequence);
  const view=new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.slice(0,4)),"MThd");
  assert.equal(view.getUint16(12),1000);
  assert.equal(view.getUint32(18),bytes.length-22);
  let i=22,tick=0;
  const ons=[];
  while(i<bytes.length){
    let delta=0,b;
    do{b=bytes[i++];delta=delta*128+(b&127);}while(b&128);
    tick+=delta;
    const status=bytes[i++];
    if(status===0xff){i++;const size=bytes[i++];i+=size;}
    else {const pitch=bytes[i++];i++;if(status===0x90)ons.push([tick,pitch]);}
  }
  assert.deepEqual(ons,[[0,62],[714,70],[714,74]]);
  assert.equal(tick,4000);
});
