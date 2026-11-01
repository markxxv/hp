// Offline export shares the note buffers and effect settings with the live sampler.
// No microphone, external service or real-time playback is involved.
import {getNoteName} from "./audio.js";

export const EXPORT_RATE = 44100;
export const EXPORT_BITRATE = 192;
export const MAX_EXPORT_SECONDS = 600; // Avoid browser memory exhaustion on tablets.

export function exportFilename(title) {
  const safe=String(title||"Handpan").replace(/[<>:"/\\|?*\x00-\x1f]/g," ").replace(/\s+/g," ").replace(/[.\s]+$/,"").trim().slice(0,100);
  return (safe||"Handpan")+".mp3";
}

export function exportDuration(sequence,sampler) {
  if (!sequence || !Array.isArray(sequence.notes) || !Number.isFinite(sequence.duration) || sequence.duration<=0)
    throw new Error("Select a valid ABC melody to export.");
  if (sequence.duration>MAX_EXPORT_SECONDS)
    throw new Error("MP3 export supports melodies up to 10 minutes. Shorten the ABC composition.");
  const all=[...sampler.buffers.values()].flat();
  if (!all.length) throw new Error("Handpan samples are not loaded.");
  const lastTail=Math.max(3,Math.min(12,Math.max(...all.map(buffer=>buffer.duration))+2.5));
  return sequence.duration+lastTail;
}

export async function renderABC(sequence,sampler,onProgress=()=>{}) {
  const seconds=exportDuration(sequence,sampler);
  const Context=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  if(!Context) throw new Error("Offline audio rendering is not supported by this browser.");
  const frames=Math.ceil(seconds*EXPORT_RATE);
  const ctx=new Context(2,frames,EXPORT_RATE);
  const master=ctx.createGain();
  master.gain.value=sampler.volume;
  master.connect(ctx.destination);

  const dry=ctx.createGain();
  dry.gain.value=0.92;
  dry.connect(master);

  const wet=ctx.createGain();
  wet.gain.value=sampler.reverb;
  wet.connect(master);

  const convolver=ctx.createConvolver();
  convolver.buffer=makeImpulse(ctx,2.5);
  convolver.connect(wet);

  // A deterministic round-robin picks the recorded variations for each note.
  const roundRobin=new Map();
  let scheduled=0;
  for(const event of sequence.notes) {
    for(const midi of event.pitches) {
      const name=getNoteName(midi);
      const takes=name&&sampler.buffers.get(name);
      if(!takes?.length)continue;
      const index=roundRobin.get(name)||0;
      roundRobin.set(name,index+1);
      const source=ctx.createBufferSource();
      source.buffer=takes[index%takes.length];
      const gain=ctx.createGain();
      gain.gain.value=0.74; // Same default velocity as ABC playback.
      source.connect(gain);
      gain.connect(dry);
      gain.connect(convolver);
      source.start(Math.max(0,event.at));
      scheduled++;
    }
  }
  if(!scheduled)throw new Error("No playable handpan notes were found in this melody.");
  onProgress({stage:"render",percent:15,label:"Rendering audio",eta:null});
  const rendered=await ctx.startRendering();
  onProgress({stage:"rendered",percent:38,label:"Audio rendered",eta:null});
  return rendered;
}

function makeImpulse(context,seconds) {
  const length=Math.floor(context.sampleRate*seconds);
  const buffer=context.createBuffer(2,length,context.sampleRate);
  for(let channel=0;channel<2;channel++) {
    const data=buffer.getChannelData(channel);
    for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/length,2.8);
  }
  return buffer;
}

export function encodeMP3(buffer,onProgress=()=>{}) {
  if(typeof Worker==="undefined")return Promise.reject(new Error("MP3 encoding requires Web Workers."));
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL("./mp3.worker.js",import.meta.url),{type:"module"});
    let settled=false;
    const finish=(error,blob)=>{
      if(settled)return;
      settled=true;
      worker.terminate();
      if(error)reject(error);
      else resolve(blob);
    };
    worker.onerror=event=>finish(new Error(event.message||"MP3 worker failed."));
    worker.onmessage=event=>{
      const data=event.data||{};
      if(data.type==="progress"){
        const ratio=Math.max(0,Math.min(1,Number(data.ratio)||0));
        const percent=Math.round(38+ratio*60);
        const eta=ratio>=0.04?Math.ceil((data.elapsedMs/1000)*(1-ratio)/ratio):null;
        onProgress({stage:"encoding",percent,label:"Encoding MP3",eta});
      }
      if(data.type==="error")finish(new Error(data.message||"MP3 encoding failed."));
      if(data.type==="done")finish(null,new Blob(data.parts,{type:"audio/mpeg"}));
    };
    try{
      // Transfer PCM ownership to the worker instead of duplicating large buffers.
      // AudioBuffer channel data can be backed by internal Web Audio memory, so copy first.
      const left=buffer.getChannelData(0).slice();
      const right=buffer.getChannelData(1).slice();
      worker.postMessage({type:"encode",sampleRate:EXPORT_RATE,bitrate:EXPORT_BITRATE,left,right},[left.buffer,right.buffer]);
    }catch(error){finish(error)}
  });
}

export async function createMP3(sequence,sampler,onProgress=()=>{}) {
  onProgress({stage:"render",percent:12,label:"Preparing offline render",eta:null});
  const rendered=await renderABC(sequence,sampler,onProgress);
  const blob=await encodeMP3(rendered,onProgress);
  if(!blob.size)throw new Error("The MP3 encoder returned an empty file.");
  onProgress({stage:"done",percent:100,label:"MP3 ready",eta:0});
  return blob;
}

export function downloadMP3(blob,name) {
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=exportFilename(name);
  link.style.display="none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
