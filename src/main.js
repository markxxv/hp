import "./style.css";
import {createIcons,createElement,Play,Pause,SkipBack,SkipForward,Square,Plus,Minus,ClipboardPaste,FileUp,Code2,Save,Check,ListMusic,Volume2,Waves,Trash2} from "lucide";
import {HandpanSampler, getNoteName} from "./audio.js";
import {parseABC} from "./abc.js";
import {EXAMPLES,readLibrary,saveMelody,removeMelody,getTitle,makeId} from "./library.js";

const $ = id => document.getElementById(id);
const icon = (name,size=16) => createElement(name,{width:size,height:size,"stroke-width":1.8});
const iconSet={Play,Pause,SkipBack,SkipForward,Square,Plus,Minus,ClipboardPaste,FileUp,Code2,Save,Check,ListMusic,Volume2,Waves,Trash2};
function updateSlider(input){ if(!input) return; const min=Number(input.min||0),max=Number(input.max||100);const pct=max>min?Math.round((Number(input.value)-min)*100/(max-min)):0;input.style?.setProperty?.("--range-fill",pct+"%");input.closest?.(".slider-meter")?.style?.setProperty?.("--range-fill",pct+"%"); }

const editor = $("abc-editor");
const playButton = $("play");
const sampler = new HandpanSampler();
const pads = new Map([...document.querySelectorAll(".tone")].map(node => [Number(node.dataset.midi),node]));
const KEYS = {
  KeyA:57, KeyS:62, KeyD:64, KeyF:65, KeyG:67, KeyH:69, KeyJ:70, KeyK:72, KeyL:74,
  Semicolon:57, Quote:62, Backslash:64
};
const player = {
  status:"idle", sequence:null, offset:0, startedAt:0, nextIndex:0,
  ticker:null, visualTimers:[], token:0
};
let selectedId = null;
let dirty = false;
let editorDebounce = null;
let lastMessageError = false;

function message(text, error = false) {
  $("editor-message").textContent = text;
  $("editor-message").style.color = error ? "#ef9292" : "#a0a0a3";
  lastMessageError = error;
}
function sampleStatus(text,error=false) {
  $("sample-status").textContent = text;
  $("sample-status").style.color = error ? "#ef9292" : "#a0a0a3";
}
function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds || 0));
  return Math.floor(seconds/60) + ":" + String(seconds%60).padStart(2,"0");
}
function renderClock(position=player.offset) {
  const duration = player.sequence?.duration || 0;
  $("seek").value = duration ? String(Math.round(Math.min(1000,Math.max(0,position/duration*1000)))) : "0";
  $("elapsed").textContent = formatTime(position);
  $("total-time").textContent = formatTime(duration);
  updateSlider($("seek"));
}
function renderTransport() {
  const labels={idle:"READY",loading:"LOADING",playing:"PLAYING",paused:"PAUSED",finished:"FINISHED"};
  const playing = player.status === "playing";
  $("play-icon").replaceChildren(icon(playing ? Pause : Play,17));
  $("play-label").textContent=playing ? "Pause" : player.status === "paused" ? "Resume" : "Play";
  $("play-state").textContent=labels[player.status] || "READY";
  playButton.disabled=player.status === "loading";
  $("play").setAttribute("aria-label",$("play-label").textContent);
}
function lightPad(midi) {
  const pad=pads.get(midi);
  if(!pad) return;
  pad.classList.add("active");
  $("current-note").textContent=getNoteName(midi);
  clearTimeout(pad.lightTimer);
  pad.lightTimer=setTimeout(()=>pad.classList.remove("active"),240);
}
function cancelClock() {
  clearInterval(player.ticker);
  player.ticker=null;
  for(const timer of player.visualTimers) clearTimeout(timer);
  player.visualTimers=[];
}
function currentPosition() {
  if(player.status!=="playing" || !sampler.context) return player.offset;
  return Math.max(0,Math.min(player.sequence?.duration || 0,sampler.context.currentTime-player.startedAt));
}
function stopPlayback({reset=true,silence=true}={}) {
  player.token++;
  cancelClock();
  if(silence) sampler.stopAll();
  if(reset) player.offset=0;
  player.status="idle";
  renderClock();
  renderTransport();
}
function endPlayback(token) {
  if(token!==player.token) return;
  cancelClock();
  player.status="finished";
  player.offset=player.sequence.duration;
  renderClock();
  renderTransport();
  renderLibrary();
}
function tick(token) {
  if(token!==player.token || player.status!=="playing") return;
  const context=sampler.context;
  const now=context.currentTime;
  const relative=now-player.startedAt;
  const events=player.sequence.notes;

  // Look ahead so AudioBufferSourceNode.start() happens on the audio clock,
  // not on an imprecise JavaScript timer.
  while(player.nextIndex<events.length && events[player.nextIndex].at<=relative+0.13) {
    const entry=events[player.nextIndex++];
    const when=Math.max(now+0.005,player.startedAt+entry.at);
    let supported=0;
    for(const pitch of entry.pitches) {
      if(sampler.hit(pitch,0.74,when)) {
        supported++;
        const timer=setTimeout(()=>{if(token===player.token && player.status==="playing") lightPad(pitch)},Math.max(0,(when-now)*1000));
        player.visualTimers.push(timer);
      }
    }
    // A rest or an unsupported pitch must not block later notes.
    void supported;
  }
  renderClock(Math.max(0,Math.min(player.sequence.duration,relative)));
  if(relative>=player.sequence.duration+0.04) endPlayback(token);
}
function startClock(offset=0) {
  cancelClock();
  const token=++player.token;
  player.offset=offset;
  player.startedAt=sampler.context.currentTime+0.05-offset;
  player.nextIndex=player.sequence.notes.findIndex(event=>event.at>=offset-0.0001);
  if(player.nextIndex<0) player.nextIndex=player.sequence.notes.length;
  player.status="playing";
  renderTransport();
  renderLibrary();
  player.ticker=setInterval(()=>tick(token),25);
  tick(token);
}
function pause() {
  if(player.status!=="playing") return;
  player.offset=currentPosition();
  player.token++;
  cancelClock();
  sampler.stopAll();
  player.status="paused";
  renderTransport();
  renderClock();
  renderLibrary();
}
async function prepareSound() {
  try {
    sampleStatus("Loading acoustic samples…");
    await sampler.ensureReady((count,total)=>sampleStatus("Loaded "+count+" / "+total+" samples"));
    sampleStatus("27 acoustic samples · ready");
    return true;
  } catch(error) {
    sampleStatus("Audio error: "+error.message,true);
    message("Unable to load samples: "+error.message,true);
    return false;
  }
}
async function play() {
  if(player.status==="playing") { pause(); return; }
  if(!player.sequence) { message("Fix the ABC notation before playing",true); return; }
  if(player.status==="loading") return;
  const offset=player.status==="paused" ? player.offset : 0;
  const generation=++player.token;
  player.status="loading";
  renderTransport();
  const ready=await prepareSound();
  if(generation!==player.token) return;
  if(!ready) { player.status="idle";renderTransport();return; }
  startClock(offset);
}
async function hit(midi) {
  if(!await prepareSound()) return;
  if(sampler.hit(midi)) lightPad(midi);
}
function seekTo(position) {
  if(!player.sequence) return;
  const duration=player.sequence.duration;
  const offset=Math.min(duration,Math.max(0,position));
  const state=player.status;
  if(state==="loading") return;
  player.token++;
  cancelClock();
  sampler.stopAll();
  player.offset=offset;
  if(state==="playing" && offset<duration) startClock(offset);
  else {
    player.status=offset>=duration ? "finished" : state==="paused" ? "paused" : "idle";
    renderTransport();
    renderClock();
  }
}
function refreshEditor() {
  stopPlayback();
  player.sequence=null;
  $("tune-name").textContent=getTitle(editor.value);
  try {
    player.sequence=parseABC(editor.value);
    $("tune-name").textContent=player.sequence.title;
    $("tune-tempo").textContent=player.sequence.tempoLabel+" BPM";
    $("tempo-down").disabled=player.sequence.tempo<=30;
    $("tempo-up").disabled=player.sequence.tempo>=240;
    if(player.sequence.unsupported) {
      message(player.sequence.unsupported+" notes outside the handpan scale will be skipped",true);
    } else {
      message(dirty?"Unsaved changes":"Ready to play");
    }
  } catch(error) {
    $("tune-tempo").textContent="—";
    message(error.message,true);
  }
  renderClock();
  renderLibrary();
}
function useTune(text,id=null) {
  clearTimeout(editorDebounce);
  editor.value=text;
  selectedId=id;
  dirty=false;
  refreshEditor();
  renderLibrary();
}
function loadEntry(entry) {
  if(selectedId===entry.id && !dirty) return true;
  if(dirty && !confirm("Discard unsaved changes?")) return false;
  useTune(entry.abc,entry.id);
  return true;
}
function readEntries() {
  try {return readLibrary()}
  catch(error) {
    if(!lastMessageError) message("Local storage unavailable: "+error.message,true);
    return [];
  }
}
function renderLibrary() {
  const list=$("library");
  list.replaceChildren();
  const entries=readEntries();
  $("library-count").textContent=entries.length+" TRACKS";
  if(!entries.length) {
    const empty=document.createElement("p");
    empty.className="track-empty";
    empty.textContent="Playlist is empty. Create a track or import an ABC melody, then save it.";
    list.append(empty);
    return;
  }
  entries.forEach((entry,index)=>{
    const selected=entry.id===selectedId;
    const row=document.createElement("div");
    row.className="track-row"+(selected?" selected":"");
    const playTrack=document.createElement("button");
    playTrack.type="button";
    playTrack.className="track-play";
    playTrack.replaceChildren(icon(selected && player.status==="playing" ? Pause : Play,16));
    playTrack.title="Play "+getTitle(entry.abc);
    playTrack.setAttribute("aria-label",(selected&&player.status==="playing"?"Pause: ":"Play: ")+getTitle(entry.abc));
    playTrack.addEventListener("click",()=>{
      if(!selected || dirty) {
        if(!loadEntry(entry)) return;
        void play();
      } else void play();
    });
    const number=document.createElement("span");
    number.className="track-index";
    number.textContent=String(index+1).padStart(2,"0");
    const info=document.createElement("button");
    info.type="button";
    info.className="track-info";
    const details=document.createElement("span");
    details.className="track-details";
    const title=document.createElement("span");
    title.className="track-name";
    title.textContent=getTitle(entry.abc);
    const meta=document.createElement("span");
    meta.className="track-meta";
    const meter=entry.abc.match(/^M:\s*(.+)$/m)?.[1] || "—";
    const tempo=entry.abc.match(/^Q:\s*(.+)$/m)?.[1] || "—";
    meta.textContent=meter+" · "+tempo;
    details.append(title,meta);
    info.append(details);
    if(selected) {
      const active=document.createElement("span");
      active.className="track-playing";
      active.textContent=player.status==="playing"?"● Playing":player.status==="paused"?"Paused":"Selected";
      info.append(active);
    }
    info.setAttribute("aria-label","Select "+getTitle(entry.abc));
    info.addEventListener("click",()=>loadEntry(entry));
    const del=document.createElement("button");
    del.type="button";
    del.className="track-delete";
    del.replaceChildren(icon(Trash2,15));
    del.title="Delete track";
    del.setAttribute("aria-label","Delete "+getTitle(entry.abc));
    del.addEventListener("click",()=>{
      if(!confirm("Delete "+getTitle(entry.abc)+"?")) return;
      try{
        removeMelody(entry.id);
        if(selected) {
          stopPlayback();
          selectedId=null;
        }
        renderLibrary();
        message("Track deleted");
      }catch(error){message("Delete failed: "+error.message,true)}
    });
    row.append(playTrack,number,info,del);
    list.append(row);
  });
}
function skipTrack(step) {
  const entries=readEntries();
  if(!entries.length) return;
  const index=entries.findIndex(entry=>entry.id===selectedId);
  const next=index<0 ? (step>0?0:entries.length-1) : (index+step+entries.length)%entries.length;
  if(!loadEntry(entries[next])) return;
  void play();
}
function importABC(text) {
  if(!text.trim()){message("ABC text is empty",true);return false}
  try{parseABC(text)}catch(error){message("Import failed: "+error.message,true);return false}
  if(dirty && !confirm("Discard unsaved changes?")) return false;
  useTune(text.trim(),null);
  message("ABC imported. Save it to add it to your playlist.");
  return true;
}

function adjustTempo(delta) {
  if(!player.sequence || player.status==="loading") return;
  const bpm=Math.max(30,Math.min(240,player.sequence.tempo+delta));
  if(bpm===player.sequence.tempo) return;
  const oldDuration=player.sequence.duration;
  const ratio=oldDuration>0?currentPosition()/oldDuration:0;
  const wasPlaying=player.status==="playing";
  const wasPaused=player.status==="paused";
  const current=editor.value;
  const next=/^Q:[^\n]*$/m.test(current)
    ? current.replace(/^Q:[^\n]*$/m,line=>line.replace(/\d+(?:\.\d+)?\s*$/,String(bpm)))
    : current.replace(/^K:/m,"Q:1/4="+bpm+"\nK:");
  if(next===current){message("Unable to update ABC tempo",true);return}
  editor.value=next;
  dirty=true;
  clearTimeout(editorDebounce);
  refreshEditor();
  if(player.sequence) {
    const offset=player.sequence.duration*ratio;
    if(wasPlaying && sampler.context?.state==="running") startClock(offset);
    else if(wasPaused) {
      player.offset=offset;
      player.status="paused";
      renderTransport();
      renderClock(offset);
    }
  }
}

function register() {
  playButton.addEventListener("click",()=>void play());
  $("stop").addEventListener("click",()=>stopPlayback());
  $("prev").addEventListener("click",()=>skipTrack(-1));
  $("next").addEventListener("click",()=>skipTrack(1));
  $("tempo-down").addEventListener("click",()=>adjustTempo(-5));
  $("tempo-up").addEventListener("click",()=>adjustTempo(5));
  for(const [midi,pad] of pads){
    pad.addEventListener("pointerdown",event=>{
      if(event.pointerType==="mouse"&&event.button!==0)return;
      void hit(midi);
    });
  }
  document.addEventListener("keydown",event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||event.repeat)return;
    const target=event.target;
    if(target?.isContentEditable||["INPUT","TEXTAREA","SELECT"].includes(target?.tagName)||$("import-dialog").open)return;
    const midi=KEYS[event.code];
    if(midi!==undefined){
      event.preventDefault();
      void hit(midi);
    } else if(event.code==="Space"&&target?.tagName!=="BUTTON") {
      event.preventDefault();
      void play();
    }
  });
  $("volume").addEventListener("input",event=>{sampler.setVolume(Number(event.target.value)/100);$("volume-display").textContent=event.target.value+"%";updateSlider(event.target)});
  $("reverb").addEventListener("input",event=>{sampler.setReverb(Number(event.target.value)/100);$("reverb-display").textContent=event.target.value+"%";updateSlider(event.target)});
  $("seek").addEventListener("input",event=>{
    updateSlider(event.target);
    const duration=player.sequence?.duration||0;
    $("elapsed").textContent=formatTime(duration*Number(event.target.value)/1000);
  });
  $("seek").addEventListener("change",event=>{
    const duration=player.sequence?.duration||0;
    seekTo(duration*Number(event.target.value)/1000);
  });
  editor.addEventListener("input",()=>{
    dirty=true;
    clearTimeout(editorDebounce);
    editorDebounce=setTimeout(refreshEditor,250);
  });
  $("save-tune").addEventListener("click",()=>{
    clearTimeout(editorDebounce);
    if(!player.sequence) {
      try {player.sequence=parseABC(editor.value)} catch(error){message(error.message,true);return}
    }
    const id=selectedId||makeId();
    try{
      saveMelody(id,editor.value.trim());
      selectedId=id;
      dirty=false;
      renderLibrary();
      message("Saved to playlist");
    }catch(error){message("Save failed: "+error.message,true)}
  });
  $("new-tune").addEventListener("click",()=>{
    if(dirty&&!confirm("Discard unsaved changes?"))return;
    useTune(["X:1","T:New melody","M:6/8","L:1/8","Q:3/8=56","K:Dm","D2 A E F E | D3 z3 |"].join("\n"));
    editor.focus();
  });
  const dialog=$("import-dialog");
  $("import-open").addEventListener("click",()=>{$("import-editor").value="";dialog.showModal()});
  $("import-close").addEventListener("click",()=>dialog.close());
  $("import-cancel").addEventListener("click",()=>dialog.close());
  $("import-apply").addEventListener("click",()=>{if(importABC($("import-editor").value))dialog.close()});
  dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close()});
  $("import-file").addEventListener("click",()=>$("file-input").click());
  $("file-input").addEventListener("change",async event=>{
    const file=event.target.files?.[0];
    event.target.value="";
    if(!file)return;
    if(file.size>256000){message("ABC files must be under 256 KB",true);return}
    try{importABC(await file.text())}catch(error){message("Unable to read file: "+error.message,true)}
  });
}
register();
createIcons({icons:iconSet,attrs:{"stroke-width":1.8,width:16,height:16}});
updateSlider($("volume"));
updateSlider($("reverb"));
updateSlider($("seek"));
try {
  const saved=readLibrary();
  const initial=saved[0]||EXAMPLES[0];
  useTune(initial.abc,saved.length?initial.id:null);
} catch(error) {
  useTune(EXAMPLES[0].abc,null);
  message("Browser storage unavailable: "+error.message,true);
}
