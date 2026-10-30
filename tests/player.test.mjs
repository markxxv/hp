import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseABC} from "../src/abc.js";
import {EXAMPLES,readLibrary,saveMelody,removeMelody,getTitle,makeId} from "../src/library.js";

test("Play button and physical keyboard actually trigger the sampler",async()=>{
  const data=new Map();
  globalThis.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  class Element {
    constructor(id=""){
      this.id=id;this.value="";this.listeners={};this.style={};this.children=[];
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
  const execute=new Function("document","HandpanSampler","parseABC","EXAMPLES","readLibrary","saveMelody","removeMelody","getTitle","makeId","confirm","setInterval","clearInterval","setTimeout","clearTimeout",script);
  execute(dom,FakeSampler,parseABC,EXAMPLES,readLibrary,saveMelody,removeMelody,getTitle,makeId,()=>true,()=>1,()=>{},()=>0,()=>{});
  assert.equal(get("library").children.length,2);
  assert.match(get("total-time").textContent,/^\d+:\d\d$/);
  assert.equal(get("tune-name").textContent,"Still Water");
  get("play").listeners.click[0]();
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(get("play-state").textContent,"ИГРАЕТ");
  assert.equal(hits[0].midi,62);
  assert.ok(hits[0].atTime>0,"note must be scheduled on Web Audio clock");
  const keyEvent={code:"KeyA",target:{tagName:"BODY"},preventDefault(){}};
  dom.events.keydown[0](keyEvent);
  for(let i=0;i<6;i++)await Promise.resolve();
  assert.equal(hits.at(-1).midi,57);
  dom.events.keydown[0]({...keyEvent,code:"Semicolon"});
  for(let i=0;i<6;i++)await Promise.resolve();
  assert.equal(hits.at(-1).midi,57);
});
