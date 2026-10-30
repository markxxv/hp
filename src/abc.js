// ABC-to-handpan sequencer. Uses no remote scripts or synthesizers.
// Supports note lengths, key signatures, rests, chords, bars, repeats,
// triplets, simple ties, accidentals, and dotted/broken rhythm.
const NATURAL = {C:60,D:62,E:64,F:65,G:67,A:69,B:71};
const FIFTHS_SHARPS = ["F","C","G","D","A","E","B"];
const FIFTHS_FLATS = ["B","E","A","D","G","C","F"];
const MAJOR = {C:0,G:1,D:2,A:3,E:4,B:5,"F#":6,"C#":7,F:-1,Bb:-2,Eb:-3,Ab:-4,Db:-5,Gb:-6,Cb:-7};
const MINOR = {A:0,E:1,B:2,"F#":3,"C#":4,"G#":5,"D#":6,"A#":7,D:-1,G:-2,C:-3,F:-4,Bb:-5,Eb:-6,Ab:-7};
const AVAILABLE = new Set([57,62,64,65,67,69,70,72,74]);

function fraction(input) {
  const [numerator, denominator = "1"] = input.split("/");
  const n = Number(numerator), d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || n <= 0 || d <= 0) throw new Error("Invalid duration: " + input);
  return n / d;
}

function keyAccidentals(value) {
  const match = /^([A-Ga-g])([#b]?)(m(?:in)?|maj)?/i.exec(value.trim());
  if (!match) throw new Error("Unknown key K: " + value);
  const root = match[1].toUpperCase() + (match[2] || "");
  const minor = !!match[3] && /^m(in)?$/i.test(match[3]);
  const fifths = (minor ? MINOR : MAJOR)[root];
  if (fifths === undefined) throw new Error("Unsupported key: " + value);
  const result = {};
  const letters = fifths > 0 ? FIFTHS_SHARPS : FIFTHS_FLATS;
  for (let i = 0; i < Math.abs(fifths); i++) result[letters[i]] = fifths > 0 ? 1 : -1;
  return result;
}

function readLength(source, index) {
  const match = /^(\d+)?(\/+(\d+)?)?/.exec(source.slice(index));
  const text = match[0];
  const number = match[1] ? Number(match[1]) : 1;
  if (!text.includes("/")) return {length: number, next: index + text.length};
  const slashCount = (match[2].match(/\//g) || []).length;
  const denominator = match[3] ? Number(match[3]) * 2 ** (slashCount - 1) : 2 ** slashCount;
  if (!denominator || !Number.isFinite(number / denominator)) throw new Error("Invalid note length");
  return {length: number / denominator, next: index + text.length};
}

function parseHeaders(source) {
  if (typeof source !== "string" || !source.trim()) throw new Error("Enter an ABC melody");
  const headers = {};
  const music = [];
  let inMusic = false;
  for (const original of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = original.replace(/(^|[^\\])%.*/, "$1").trim();
    if (!line || line.startsWith("%%")) continue;
    const field = /^([A-Za-z]):\s*(.*)$/.exec(line);
    if (field) {
      const name = field[1];
      if (name === "X" && inMusic) break; // First tune in multi-tune imports.
      if (name === "K") inMusic = true;
      if (!inMusic || ["K","Q","M","L"].includes(name)) {
        headers[name] = field[2].trim();
        continue;
      }
      if (name === "V") continue;
    }
    if (inMusic) music.push(line);
  }
  if (!headers.K) throw new Error("Add a K: header (e.g. K:Dm)");
  if (!music.length) throw new Error("No notes found after K:");
  return {headers, body:music.join(" ")};
}

function getTempoInfo(q) {
  if (!q) return {bpm:100, beatValue:0.25, label:"100"};
  const raw = q.replace(/"[^"]*"/g,"").trim();
  const metronome = /(?:(\d+\/\d+)\s*=\s*)?(\d+(?:\.\d+)?)/.exec(raw);
  if (!metronome) throw new Error("Invalid tempo Q: " + q);
  const bpm = Number(metronome[2]);
  if (!(bpm > 0 && bpm <= 500)) throw new Error("Tempo must be between 1 and 500 BPM");
  return {bpm, beatValue:metronome[1] ? fraction(metronome[1]) : 0.25, label:String(bpm)};
}

export function parseABC(source) {
  const {headers, body} = parseHeaders(source);
  const tempo = getTempoInfo(headers.Q);
  const noteValue = headers.L ? fraction(headers.L) : headers.M === "C" ? 0.125 : 0.125;
  const secondsPerWhole = 60 / tempo.bpm / tempo.beatValue;
  const key = keyAccidentals(headers.K);
  const barAccidentals = new Map();
  const notes = [];
  let position = 0, index = 0, repeatStart = 0, repeatPosition = 0;
  let tupletRemaining = 0, tupletFactor = 1, nextFactor = 1;
  let pendingTie = false;
  let unsupportedSymbols = 0;

  function emit(pitches, multiplier) {
    let duration = multiplier * noteValue * secondsPerWhole;
    if (tupletRemaining > 0) {
      duration *= tupletFactor;
      tupletRemaining--;
    }
    duration *= nextFactor;
    nextFactor = 1;
    if (!Number.isFinite(duration) || duration <= 0 || duration > 120) throw new Error("Invalid note duration");
    // A tied pitch sustains instead of being struck again. Other notes still strike.
    if (pendingTie && pitches.length && notes.length) {
      const previous = notes[notes.length - 1];
      if (pitches.every((pitch) => previous.pitches.includes(pitch))) {
        previous.duration += duration;
        position += duration;
        pendingTie = false;
        return;
      }
    }
    pendingTie = false;
    notes.push({at:position, pitches, duration});
    position += duration;
    if (notes.length > 12000 || position > 3600) throw new Error("Melody is too long");
  }

  function pitchAt() {
    let accidental = "";
    while (body[index] === "^" || body[index] === "_" || body[index] === "=") {
      accidental += body[index++];
    }
    const letter = body[index];
    if (!/[A-Ga-g]/.test(letter || "")) return null;
    index++;
    let octave = letter === letter.toLowerCase() ? 1 : 0;
    while (body[index] === "," || body[index] === "'") {
      octave += body[index++] === "'" ? 1 : -1;
    }
    const upper = letter.toUpperCase();
    const slot = upper + ":" + octave;
    let offset = barAccidentals.has(slot) ? barAccidentals.get(slot) : (key[upper] || 0);
    if (accidental) {
      offset = accidental[0] === "=" ? 0 : (accidental[0] === "^" ? 1 : -1) * accidental.length;
      barAccidentals.set(slot, offset);
    }
    return NATURAL[upper] + octave * 12 + offset;
  }

  while (index < body.length) {
    const c = body[index];
    if (/\s/.test(c)) { index++; continue; }
    if (c === '"' || c === '!') {
      const close = body.indexOf(c, index + 1);
      if (close < 0) throw new Error("Unclosed ABC decoration");
      index = close + 1;
      continue;
    }
    if (c === "+" && body.indexOf("+", index + 1) > index) {
      index = body.indexOf("+", index + 1) + 1;
      continue;
    }
    if (c === "{") {
      const close = body.indexOf("}", index + 1);
      if (close < 0) throw new Error("Unclosed grace-note group");
      index = close + 1;
      continue;
    }
    if (body.startsWith("|:", index)) {
      repeatStart = notes.length;
      repeatPosition = position;
      barAccidentals.clear();
      index += 2;
      continue;
    }
    if (body.startsWith(":|", index) || body.startsWith("::", index)) {
      const start = repeatStart;
      const before = notes.length;
      const offset = position - repeatPosition;
      for (let p = start; p < before; p++) {
        const original = notes[p];
        notes.push({at:original.at + offset, pitches:[...original.pitches], duration:original.duration});
      }
      position += offset;
      if (notes.length > 12000 || position > 3600) throw new Error("Melody is too long");
      repeatStart = notes.length;
      repeatPosition = position;
      barAccidentals.clear();
      index += 2;
      continue;
    }
    if (body.startsWith("|]", index) || body.startsWith("||", index) || body.startsWith("[|", index)) {
      barAccidentals.clear(); index += 2; continue;
    }
    if (c === "|" || c === ":") {
      barAccidentals.clear(); index++; continue;
    }
    if (c === "[") {
      if (/^\[[1-9]/.test(body.slice(index))) {
        // Alternative endings require conditional repeat control, not a flat duplication.
        throw new Error("First/second endings [1/[2 are not supported yet");
      }
      if (/^\[[KMLQV]:/.test(body.slice(index))) {
        const close = body.indexOf("]",index + 1);
        if (close < 0) throw new Error("Unclosed inline ABC header");
        const field = body.slice(index + 1,close);
        if (field.startsWith("K:")) {
          Object.assign(key, keyAccidentals(field.slice(2)));
          barAccidentals.clear();
        }
        index = close + 1;
        continue;
      }
      index++;
      const pitches = [];
      while (index < body.length && body[index] !== "]") {
        if (/\s/.test(body[index])) { index++; continue; }
        const midi = pitchAt();
        if (midi === null) throw new Error("Unknown note in chord");
        pitches.push(midi);
        // Length inside chords can be specified independently; use outer length for strikes.
        const inner = readLength(body,index);
        index = inner.next;
      }
      if (body[index] !== "]") throw new Error("Unclosed chord [...]");
      index++;
      const length = readLength(body,index);
      index = length.next;
      emit(pitches,length.length);
      continue;
    }
    if (c === "(" && /^\(\d/.test(body.slice(index))) {
      const match = /^\((\d)(?::\d(?::\d)?)?/.exec(body.slice(index));
      const n = Number(match[1]);
      if (n < 2 || n > 9) throw new Error("Unsupported ABC tuplet");
      tupletRemaining = n;
      tupletFactor = n === 2 || n === 4 || n === 8 ? (n + 1) / n : (n - 1) / n;
      index += match[0].length;
      continue;
    }
    if (c === "(" || c === ")" || c === "~" || c === ".") { index++; continue; }
    if (c === "-") { pendingTie = true; index++; continue; }
    if (c === ">" || c === "<") {
      let count = 0;
      while (body[index] === c) { count++; index++; }
      if (!notes.length) throw new Error("Broken rhythm >/< without a previous note");
      const stretch = 2 - 1 / 2**count, shrink = 1 / 2**count;
      const factor = c === ">" ? stretch : shrink;
      const previous = notes[notes.length-1];
      const old = previous.duration;
      previous.duration *= factor;
      position += previous.duration - old;
      nextFactor = c === ">" ? shrink : stretch;
      continue;
    }
    if (/[zZxX]/.test(c)) {
      index++;
      const length = readLength(body,index);
      index = length.next;
      if (c === "Z" || c === "X") {
        const fractionOfBar = headers.M && /^(\d+)\/(\d+)$/.test(headers.M) ? fraction(headers.M) : 1;
        emit([], length.length * fractionOfBar / noteValue);
      } else emit([],length.length);
      continue;
    }
    if (/[\^_=A-Ga-g]/.test(c)) {
      const before = index;
      const midi = pitchAt();
      if (midi === null || index === before) throw new Error("Invalid note near " + body.slice(index,index+12));
      const length = readLength(body,index);
      index = length.next;
      emit([midi],length.length);
      continue;
    }
    // Hard-fail on unsupported notation instead of silently pretending it plays.
    if (/[&{}\\]/.test(c)) throw new Error("Unsupported ABC symbol: " + c);
    unsupportedSymbols++;
    if (unsupportedSymbols > 10) throw new Error("Unsupported ABC syntax near " + body.slice(index,index+12));
    index++;
  }

  if (!notes.some((event) => event.pitches.length)) throw new Error("Melody has no notes");
  const supported = notes.reduce((sum, event) => sum + event.pitches.filter(midi => AVAILABLE.has(midi)).length, 0);
  const unsupported = notes.reduce((sum, event) => sum + event.pitches.filter(midi => !AVAILABLE.has(midi)).length, 0);
  if (!supported) throw new Error("No notes in the handpan scale (A3, D4, E4, F4, G4, A4, Bb4, C5, D5)");
  return {
    title:headers.T || "Untitled",
    meter:headers.M || "—",
    tempo:tempo.bpm,
    tempoLabel:tempo.label,
    notes,
    duration:position,
    supported,
    unsupported
  };
}
