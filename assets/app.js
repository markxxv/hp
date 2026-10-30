import { HandpanSampler, getNoteName } from "./audio.js";
import { EXAMPLES, readLibrary, saveMelody, removeMelody, getTitle, getMeter, getTempo, makeId } from "./library.js";

const $ = (id) => document.getElementById(id);
const editor = $("abc-editor");
const playButton = $("play");
const playLabel = $("play-label");
const playIcon = $("play-icon");
const timeline = $("timeline-bar");
const stateLabel = $("play-state");
const elapsed = $("elapsed");
const engine = new HandpanSampler();
const pads = new Map([...document.querySelectorAll(".tone")].map((button) => [Number(button.dataset.midi), button]));

let currentId = null;
let visualTune = null;
let clock = null;
let playing = false;
let paused = false;
let dirty = false;
let generation = 0;
let debounce = 0;
let totalMilliseconds = 0;
let unsupportedShown = false;

function inform(message, error = false) {
  const element = $("editor-message");
  element.textContent = message;
  element.style.color = error ? "#e6a49b" : "#89948b";
}

function sampleStatus(message, error = false) {
  const element = $("sample-status");
  element.textContent = message;
  element.style.color = error ? "#e6a49b" : "#8eaa96";
}

function formatTime(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

function progress(value, total = totalMilliseconds) {
  timeline.style.width = (total > 0 ? Math.min(100, Math.max(0, value / total * 100)) : 0) + "%";
  elapsed.textContent = formatTime(value);
}

function setTransportState(label) {
  stateLabel.textContent = label;
  playLabel.textContent = playing ? "Пауза" : paused ? "Продолжить" : "Играть";
  playIcon.textContent = playing ? "Ⅱ" : "▶";
  playButton.setAttribute("aria-label", playLabel.textContent);
}

function lightPad(midi) {
  const pad = pads.get(midi);
  if (!pad) return;
  pad.classList.add("active");
  $("current-note").textContent = getNoteName(midi);
  clearTimeout(pad.lightTimer);
  pad.lightTimer = setTimeout(() => pad.classList.remove("active"), 280);
}

function stop() {
  generation++;
  if (clock) clock.stop();
  clock = null;
  playing = false;
  paused = false;
  totalMilliseconds = 0;
  engine.stopAll();
  progress(0);
  setTransportState("READY");
}

function showScore() {
  stop();
  const abc = editor.value.trim();
  $("tune-name").textContent = getTitle(abc);
  $("tune-tempo").textContent = getTempo(abc).replace(/.*=/, "") + " BPM";
  if (!abc) {
    visualTune = null;
    $("score").textContent = "Вставь ABC-нотацию, чтобы увидеть партитуру";
    inform("Введите ABC-нотацию");
    return;
  }
  if (!window.ABCJS) {
    visualTune = null;
    inform("Не загрузилась библиотека ABCJS. Проверь интернет.", true);
    return;
  }
  try {
    const tunes = window.ABCJS.renderAbc("score", abc, {
      responsive: "resize",
      add_classes: true,
      staffwidth: 800,
      paddingtop: 10,
      paddingleft: 5,
      paddingright: 5,
      paddingbottom: 5
    });
    if (!tunes.length) throw new Error("ABC не содержит мелодии");
    visualTune = tunes[0];
    const warnings = visualTune.warnings || [];
    if (warnings.length) inform("Проверь ABC-нотацию: " + String(warnings[0]), true);
    else inform("Партитура обновлена · " + getMeter(abc));
  } catch (error) {
    visualTune = null;
    $("score").textContent = "Не удалось прочитать нотацию";
    inform(error.message || "Ошибка ABC-нотации", true);
  }
}

function renderLibrary() {
  const container = $("library");
  container.replaceChildren();
  let entries = [];
  try {
    entries = readLibrary();
  } catch {
    inform("LocalStorage недоступен. Разреши хранение данных в браузере.", true);
  }
  $("library-count").textContent = entries.length + " SAVED LOCALLY";
  if (!entries.length) {
    const message = document.createElement("p");
    message.className = "library-help";
    message.textContent = "Пока нет сохранённых мелодий. Нажми «Сохранить» в редакторе.";
    container.append(message);
    return;
  }
  entries.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "library-card" + (entry.id === currentId ? " selected" : "");
    const head = document.createElement("div");
    head.className = "library-card-head";
    const heading = document.createElement("div");
    const title = document.createElement("div");
    title.className = "library-card-title";
    title.textContent = getTitle(entry.abc);
    const sub = document.createElement("div");
    sub.className = "library-card-label";
    sub.textContent = getMeter(entry.abc) + " · " + getTempo(entry.abc);
    heading.append(title, sub);
    head.append(heading);
    const actions = document.createElement("div");
    actions.className = "library-actions";
    const load = document.createElement("button");
    load.type = "button";
    load.className = "library-load";
    load.textContent = entry.id === currentId ? "Открыта ✓" : "Загрузить ↗";
    load.addEventListener("click", () => {
      if (dirty && !confirm("Заменить несохранённые изменения?")) return;
      useTune(entry.abc, entry.id);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "library-delete";
    del.textContent = "Удалить";
    del.setAttribute("aria-label", "Удалить " + getTitle(entry.abc));
    del.addEventListener("click", () => {
      if (!confirm("Удалить «" + getTitle(entry.abc) + "» из этого браузера?")) return;
      try {
        removeMelody(entry.id);
        if (entry.id === currentId) currentId = null;
        renderLibrary();
        inform("Мелодия удалена");
      } catch {
        inform("Не удалось удалить мелодию из LocalStorage", true);
      }
    });
    actions.append(load, del);
    card.append(head, actions);
    container.append(card);
  });
}

function useTune(abc, id = null) {
  editor.value = abc;
  currentId = id;
  dirty = false;
  showScore();
  renderLibrary();
  window.scrollTo({top:0, behavior:"smooth"});
}

async function prepareSound() {
  try {
    sampleStatus("Загружаем записи инструмента…");
    await engine.ensureReady((loaded, total) => {
      sampleStatus("Загружено " + loaded + " из " + total + " семплов");
    });
    sampleStatus("27 настоящих записей · инструмент готов");
    return true;
  } catch (error) {
    sampleStatus("Загрузка не удалась: " + error.message, true);
    inform("Нет звука. Проверь наличие файлов samples/*.mp3 и интернет.", true);
    return false;
  }
}

async function hit(midi) {
  const didLoad = await prepareSound();
  if (!didLoad) return;
  if (engine.hit(midi)) lightPad(midi);
}

async function play() {
  if (playing) {
    clock?.pause();
    playing = false;
    paused = true;
    engine.stopAll();
    setTransportState("PAUSED");
    return;
  }
  if (paused && clock) {
    try {
      await engine.context.resume();
      clock.start();
      paused = false;
      playing = true;
      setTransportState("PLAYING");
    } catch (error) {
      inform(error.message, true);
    }
    return;
  }
  if (!visualTune) {
    inform("Сначала введи корректную ABC-мелодию", true);
    return;
  }

  const thisGeneration = ++generation;
  playButton.disabled = true;
  setTransportState("LOADING");
  const ready = await prepareSound();
  playButton.disabled = false;
  if (!ready || thisGeneration !== generation) {
    setTransportState("READY");
    return;
  }

  unsupportedShown = false;
  playing = true;
  paused = false;
  setTransportState("PLAYING");
  try {
    clock = new window.ABCJS.TimingCallbacks(visualTune, {
      beatSubdivisions: 2,
      beatCallback: (beat, totalBeats, totalTime) => {
        if (generation !== thisGeneration || !playing) return;
        totalMilliseconds = totalTime || 0;
        progress(totalBeats ? beat / totalBeats * totalMilliseconds : 0);
      },
      eventCallback: (event) => {
        if (generation !== thisGeneration) return;
        if (event === null) {
          clock = null;
          playing = false;
          paused = false;
          progress(totalMilliseconds);
          setTransportState("FINISHED");
          return;
        }
        for (const note of event.midiPitches || []) {
          if (engine.hit(note.pitch, 0.58 + Math.min(0.35, (note.volume ?? 80) / 300))) {
            lightPad(note.pitch);
          } else if (!getNoteName(note.pitch) && !unsupportedShown) {
            unsupportedShown = true;
            inform("Есть ноты вне диапазона Hang: A3, D4, E4, F4, G4, A4, Bb4, C5, D5", true);
          }
        }
      }
    });
    clock.start();
  } catch (error) {
    stop();
    inform(error.message || "Не удалось начать воспроизведение", true);
  }
}

function importText(text) {
  if (!text.trim()) {
    inform("Текст ABC пуст", true);
    return false;
  }
  if (dirty && !confirm("Заменить несохранённые изменения?")) return false;
  useTune(text.trim(), null);
  inform("ABC импортирован. Нажми «Сохранить» для добавления в библиотеку.");
  return true;
}

function registerEvents() {
  $("play").addEventListener("click", play);
  $("stop").addEventListener("click", stop);
  for (const [midi, pad] of pads) {
    pad.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      hit(midi);
    });
  }
  const order = [57,64,65,67,69,70,72,74,62];
  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    const tag = event.target?.tagName;
    if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag) || event.target?.isContentEditable) return;
    const index = Number(event.key) - 1;
    if (Number.isInteger(index) && index >= 0 && index < 9) hit(order[index]);
    if (event.code === "Space") { event.preventDefault(); play(); }
  });
  $("volume").addEventListener("input", (event) => engine.setVolume(Number(event.target.value) / 100));
  $("reverb").addEventListener("input", (event) => engine.setReverb(Number(event.target.value) / 100));
  editor.addEventListener("input", () => {
    dirty = true;
    inform("Несохранённые изменения");
    clearTimeout(debounce);
    debounce = setTimeout(showScore, 320);
  });
  $("save-tune").addEventListener("click", () => {
    if (!visualTune) {
      inform("Исправь ABC-нотацию перед сохранением", true);
      return;
    }
    const id = currentId || makeId();
    try {
      saveMelody(id, editor.value.trim());
      currentId = id;
      dirty = false;
      renderLibrary();
      inform("Мелодия сохранена в LocalStorage");
    } catch {
      inform("Не удалось сохранить. Проверь настройки хранилища браузера.", true);
    }
  });
  $("new-tune").addEventListener("click", () => {
    if (dirty && !confirm("Сбросить несохранённые изменения?")) return;
    useTune([
      "X:1",
      "T:Новая мелодия",
      "M:6/8",
      "L:1/8",
      "Q:3/8=56",
      "K:Dm",
      "D2 A E F E | D3 z3 |"
    ].join("\n"), null);
    editor.focus();
  });
  const dialog = $("import-dialog");
  $("import-open").addEventListener("click", () => {
    $("import-editor").value = "";
    dialog.showModal();
  });
  $("import-close").addEventListener("click", () => dialog.close());
  $("import-cancel").addEventListener("click", () => dialog.close());
  $("import-apply").addEventListener("click", () => {
    if (importText($("import-editor").value)) dialog.close();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  $("import-file").addEventListener("click", () => $("file-input").click());
  $("file-input").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 256000) {
      inform("Файл слишком большой. Максимум 256 КБ.", true);
      return;
    }
    try {
      importText(await file.text());
    } catch {
      inform("Не удалось прочитать файл", true);
    }
  });
}

registerEvents();
try {
  const saved = readLibrary();
  useTune((saved[0] || EXAMPLES[0]).abc, saved[0]?.id || null);
} catch {
  useTune(EXAMPLES[0].abc, null);
  inform("Хранилище браузера недоступно — мелодии не будут сохраняться.", true);
}