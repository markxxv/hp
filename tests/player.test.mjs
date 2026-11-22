import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getNoteName} from "../src/audio.js";
import {parseABC} from "../src/abc.js";
import {EXAMPLES,readLibrary,saveMelody,removeMelody,getTitle,makeId} from "../src/library.js";
import {LiveRecording,MAX_RECORD_SECONDS,MAX_RECORD_NOTES} from "../src/recorder.js";
import {createMIDI,downloadScore} from "../src/score-export.js";

test("Play button and physical keyboard actually trigger the sampler",async()=>{
  const data=new Map();
  globalThis.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  class Element {
    constructor(id=""){
      this.id=id;this.value="";this.listeners={};this.style={};this.children=[];this.dataset={};
      this.classList={add(){},remove(){}};this.tagName="DIV";
    }
    addEventListener(name,handler){(this.listeners[name]??=[]).push(handler)}
    append(...children){this.children.push(...children)}
    replaceChildren(){this.children=[]}
    setAttribute(){}
  }
  const nodes=new Map();
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id)};
  const pads=[57,64,65,67,69,70,72,74,62].map(midi=>{
    const pad=new Element();
    pad.dataset={midi:String(midi)};
    return pad;
  });
  const dom={
    getElementById:get,
    createElement:()=>new Element(),
    querySelectorAll:()=>pads,
    events:{},
    addEventListener(name,handler){(this.events[name]??=[]).push(handler)}
  };
  const hits=[];
  class FakeSampler {
    constructor(){this.context={currentTime:0,state:"running"}}
    async ensureReady(){return true}
    hit(midi,velocity,atTime){hits.push({midi,velocity,atTime});return true}
    stopAll(){}
    setVolume(){}
    setReverb(){}
  }
  const script=readFileSync(new URL("../src/main.js",import.meta.url),"utf8").replace(/^import .*;\n/gm,"");
  const execute=new Function("document","HandpanSampler","parseABC","EXAMPLES","readLibrary","saveMelody","removeMelody","getTitle","makeId","getNoteName","createIcons","createElement","Play","Pause","SkipBack","SkipForward","Square","Plus","Minus","ClipboardPaste","FileUp","Code2","Save","Check","ListMusic","Volume2","Waves","Trash2","Download","FileAudio","createMP3","downloadMP3","exportFilename","MAX_EXPORT_SECONDS","confirm","setInterval","clearInterval","setTimeout","clearTimeout","LiveRecording","MAX_RECORD_SECONDS","MAX_RECORD_NOTES","createMIDI","downloadScore","performance",script);
  let now=0;
  const downloads=[];
  execute(dom,FakeSampler,parseABC,EXAMPLES,readLibrary,saveMelody,removeMelody,getTitle,makeId,getNoteName,()=>{},()=>new Element(),...Array(18).fill("icon"),async(_sequence,_sampler,progress)=>{progress({stage:"done",percent:100,label:"MP3 ready",eta:0});return new Blob(["mp3"],{type:"audio/mpeg"})},()=>{},title=>title+".mp3",600,()=>true,()=>1,()=>{},()=>0,()=>{},LiveRecording,MAX_RECORD_SECONDS,MAX_RECORD_NOTES,createMIDI,(blob,name)=>downloads.push({blob,name}),{now:()=>now});
  assert.equal(get("library").children.length,2);
  assert.match(get("total-time").textContent,/^\d+:\d\d$/);
  assert.equal(get("tune-name").textContent,"Still Water");
  get("play").listeners.click[0]();
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(get("play-state").textContent,"PLAYING");
  assert.equal(hits[0].midi,62);
  assert.ok(hits[0].atTime>0,"note must be scheduled on Web Audio clock");
  const keyEvent={code:"KeyA",target:{tagName:"BODY"},preventDefault(){}};
  dom.events.keydown[0](keyEvent);
  for(let i=0;i<6;i++)await Promise.resolve();
  assert.equal(hits.at(-1).midi,57);
  dom.events.keydown[0]({...keyEvent,code:"Semicolon"});
  for(let i=0;i<6;i++)await Promise.resolve();
  assert.equal(hits.at(-1).midi,57);
  get("record-toggle").listeners.click[0]();
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(get("record-label").textContent,"Stop & save");
  assert.equal(get("play").disabled,true);
  assert.equal(get("record-status").textContent,"Play your first note to begin");
  now=10000;
  dom.events.keydown[0](keyEvent);
  now=10873;
  pads.find(p=>p.dataset.midi==="62").listeners.pointerdown[0]({pointerType:"touch"});
  now=12900;
  get("record-toggle").listeners.click[0]();
  assert.equal(get("play").disabled,false);
  assert.equal(readLibrary().length,3);
  const recorded=parseABC(readLibrary()[0].abc);
  assert.deepEqual(recorded.notes.filter(n=>n.pitches.length).map(n=>n.pitches),[[57],[62]]);
  assert.ok(Math.abs(recorded.notes.filter(n=>n.pitches.length)[1].at-.873)<1e-8);
  assert.ok(Math.abs(recorded.duration-2.9)<1e-8);
  assert.equal(get("abc-editor").value,readLibrary()[0].abc);
  get("export-abc").listeners.click[0]();
  get("export-midi").listeners.click[0]();
  assert.match(downloads[0].name,/\.abc$/);
  assert.equal(await downloads[0].blob.text(),readLibrary()[0].abc);
  assert.match(downloads[1].name,/\.mid$/);
  assert.equal(new TextDecoder().decode((await downloads[1].blob.arrayBuffer()).slice(0,4)),"MThd");
  const savedBeforeNew=readLibrary();
  get("export-mp3").listeners.click[0]();
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(get("export-progress").hidden,false);
  get("play").listeners.click[0]();
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(get("play-state").textContent,"PLAYING");
  get("new-tune").listeners.click[0]();
  assert.equal(get("abc-editor").value,"");
  assert.equal(get("tune-name").textContent,"—");
  assert.equal(get("tune-tempo").textContent,"—");
  assert.equal(get("current-note").textContent,"—");
  assert.equal(get("elapsed").textContent,"0:00");
  assert.equal(get("total-time").textContent,"0:00");
  assert.equal(get("record-time").textContent,"0:00");
  assert.equal(get("record-label").textContent,"Record");
  assert.equal(get("play-state").textContent,"READY");
  assert.equal(get("export-progress").hidden,true);
  for(const id of ["play","stop","seek","tempo-down","tempo-up","save-tune","export-mp3","export-midi","export-abc"])assert.equal(get(id).disabled,true,id);
  assert.deepEqual(readLibrary(),savedBeforeNew);
  assert.ok(get("library").children.every(row=>row.className==="track-row"));
  get("record-toggle").listeners.click[0]();
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(get("record-status").textContent,"Play your first note to begin");
  get("record-toggle").listeners.click[0]();
  assert.equal(get("abc-editor").value,"");
  assert.deepEqual(readLibrary(),savedBeforeNew);
  get("library").children[0].children[2].listeners.click[0]();
  assert.equal(get("abc-editor").value,savedBeforeNew[0].abc);
  assert.equal(get("play").disabled,false);
});

test("MP3 export helpers validate filenames, duration and actual acoustic samples", async()=>{
  const {exportFilename,exportDuration,MAX_EXPORT_SECONDS}=await import("../src/exporter.js");
  assert.equal(exportFilename("My / Sea: Ambient"),"My Sea Ambient.mp3");
  assert.equal(exportFilename(""),"Handpan.mp3");
  assert.equal(MAX_EXPORT_SECONDS,600);
  const fake={buffers:new Map([["D4",[{duration:2.5}]]])};
  assert.ok(exportDuration({notes:[{at:0,pitches:[62]}],duration:9},fake)>12);
  assert.throws(()=>exportDuration({notes:[],duration:601},fake),/10 minutes/);
});
