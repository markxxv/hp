import "./style.css";
import {HandpanSampler, getNoteName} from "./audio.js";
import {parseABC} from "./abc.js";
import {EXAMPLES,readLibrary,saveMelody,removeMelody,getTitle,makeId} from "./library.js";

const $ = id => document.getElementById(id);
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
  $("editor-message").style.color = error ? "#eea497" : "#94ac94";
  lastMessageError = error;
}
function sampleStatus(text,error=false) {
  $("sample-status").textContent = text;
  $("sample-status").style.color = error ? "#eea497" : "#93aa94";
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
}
function renderTransport() {
  const labels={idle:"ГОТОВО",loading:"ЗАГРУЗКА",playing:"ИГРАЕТ",paused:"ПАУЗА",finished:"ЗАВЕРШЕНО"};
  const playing = player.status === "playing";
  $("play-icon").textContent=playing ? "Ⅱ" : "▶";
  $("play-label").textContent=playing ? "Пауза" : player.status === "paused" ? "Продолжить" : "Играть";
  $("play-state").textContent=labels[player.status] || "ГОТОВО";
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
    sampleStatus("Загружаем записи Hang…");
    await sampler.ensureReady((count,total)=>sampleStatus("Загружено "+count+" / "+total+" семплов"));
    sampleStatus("27 записей · инструмент готов");
    return true;
  } catch(error) {
    sampleStatus("Ошибка звука: "+error.message,true);
    message("Не удалось загрузить звук: "+error.message,true);
    return false;
  }
}
async function play() {
  if(player.status==="playing") { pause(); return; }
  if(!player.sequence) { message("Исправь ABC-код перед воспроизведением",true); return; }
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
    if(player.sequence.unsupported) {
      message(player.sequence.unsupported+" нот вне строя handpan пропускаются при воспроизведении",true);
    } else {
      message(dirty?"Изменения ещё не сохранены":"Готово к воспроизведению");
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
  if(dirty && !confirm("Заменить несохранённые изменения?")) return false;
  useTune(entry.abc,entry.id);
  return true;
}
function readEntries() {
  try {return readLibrary()}
  catch(error) {
    if(!lastMessageError) message("LocalStorage недоступен: "+error.message,true);
    return [];
  }
}
function renderLibrary() {
  const list=$("library");
  list.replaceChildren();
  const entries=readEntries();
  $("library-count").textContent=entries.length+" МЕЛОДИЙ";
  if(!entries.length) {
    const empty=document.createElement("p");
    empty.className="track-empty";
    empty.textContent="Плейлист пуст. Создай мелодию или импортируй ABC и нажми «Сохранить».";
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
    playTrack.textContent=selected && player.status==="playing"?"Ⅱ":"▶";
    playTrack.title="Воспроизвести "+getTitle(entry.abc);
    playTrack.setAttribute("aria-label",(selected&&player.status==="playing"?"Пауза: ":"Воспроизвести: ")+getTitle(entry.abc));
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
      active.textContent=player.status==="playing"?"● Играет":player.status==="paused"?"Ⅱ Пауза":"Выбрана";
      info.append(active);
    }
    info.setAttribute("aria-label","Выбрать мелодию "+getTitle(entry.abc));
    info.addEventListener("click",()=>loadEntry(entry));
    const del=document.createElement("button");
    del.type="button";
    del.className="track-delete";
    del.textContent="Удалить";
    del.setAttribute("aria-label","Удалить "+getTitle(entry.abc));
    del.addEventListener("click",()=>{
      if(!confirm("Удалить «"+getTitle(entry.abc)+"»?")) return;
      try{
        removeMelody(entry.id);
        if(selected) {
          stopPlayback();
          selectedId=null;
        }
        renderLibrary();
        message("Мелодия удалена");
      }catch(error){message("Не удалось удалить: "+error.message,true)}
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
  if(!text.trim()){message("ABC-текст пуст",true);return false}
  try{parseABC(text)}catch(error){message("Ошибка импорта: "+error.message,true);return false}
  if(dirty && !confirm("Заменить несохранённые изменения?")) return false;
  useTune(text.trim(),null);
  message("ABC импортирован — сохрани его в плейлисте");
  return true;
}
function register() {
  playButton.addEventListener("click",()=>void play());
  $("stop").addEventListener("click",()=>stopPlayback());
  $("prev").addEventListener("click",()=>skipTrack(-1));
  $("next").addEventListener("click",()=>skipTrack(1));
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
  $("volume").addEventListener("input",event=>sampler.setVolume(Number(event.target.value)/100));
  $("reverb").addEventListener("input",event=>sampler.setReverb(Number(event.target.value)/100));
  $("seek").addEventListener("input",event=>{
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
      message("Сохранено в плейлист");
    }catch(error){message("Ошибка сохранения: "+error.message,true)}
  });
  $("new-tune").addEventListener("click",()=>{
    if(dirty&&!confirm("Удалить несохранённые изменения?"))return;
    useTune(["X:1","T:Новая мелодия","M:6/8","L:1/8","Q:3/8=56","K:Dm","D2 A E F E | D3 z3 |"].join("\n"));
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
    if(file.size>256000){message("Максимальный размер ABC-файла 256 КБ",true);return}
    try{importABC(await file.text())}catch(error){message("Файл не прочитан: "+error.message,true)}
  });
}
register();
try {
  const saved=readLibrary();
  const initial=saved[0]||EXAMPLES[0];
  useTune(initial.abc,saved.length?initial.id:null);
} catch(error) {
  useTune(EXAMPLES[0].abc,null);
  message("Хранилище браузера недоступно: "+error.message,true);
}
