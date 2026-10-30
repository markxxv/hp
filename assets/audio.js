// Actual acoustic Hang recordings, FreePats (CC0).
// Only original, recorded notes are used. No pitch shifting or synthesizer.
export const NOTES = [
  { midi:57, name:"A3" }, { midi:62, name:"D4" },
  { midi:64, name:"E4" }, { midi:65, name:"F4" },
  { midi:67, name:"G4" }, { midi:69, name:"A4" },
  { midi:70, name:"Bb4" }, { midi:72, name:"C5" },
  { midi:74, name:"D5" }
];
const NOTE_MAP = new Map(NOTES.map((entry) => [entry.midi, entry.name]));
const VARIANTS = 3;

export function getNoteName(midi) {
  return NOTE_MAP.get(midi) || null;
}
export function getSamplePaths() {
  return NOTES.flatMap(({name}) =>
    Array.from({length: VARIANTS}, (_, i) =>
      "./samples/" + name + "_" + String(i + 1).padStart(2, "0") + ".mp3"
    )
  );
}

export class HandpanSampler {
  constructor() {
    this.context = null;
    this.buffers = new Map();
    this.voices = new Set();
    this.loading = null;
    this.roundRobin = new Map();
    this.volume = 0.8;
    this.reverb = 0.2;
  }

  async ensureReady(onProgress = () => {}) {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error("Web Audio API не поддерживается браузером");
      const ctx = new Context();
      this.context = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(ctx.destination);
      this.dry = ctx.createGain();
      this.dry.gain.value = 0.92;
      this.dry.connect(this.master);
      this.wet = ctx.createGain();
      this.wet.gain.value = this.reverb;
      this.wet.connect(this.master);
      this.convolver = ctx.createConvolver();
      this.convolver.buffer = makeImpulse(ctx, 2.5);
      this.convolver.connect(this.wet);
    }
    // Resume on the original user gesture, before any asynchronous fetch.
    await this.context.resume();
    if (!this.loading) {
      this.loading = this.loadAll(onProgress).catch((error) => {
        this.loading = null;
        throw error;
      });
    }
    return this.loading;
  }

  async loadAll(onProgress) {
    const paths = getSamplePaths();
    let done = 0;
    await Promise.all(paths.map(async (path) => {
      const response = await fetch(new URL(path, document.baseURI));
      if (!response.ok) throw new Error("Семпл недоступен: " + path + " (" + response.status + ")");
      const data = await response.arrayBuffer();
      const buffer = await this.context.decodeAudioData(data);
      const name = path.split("/").pop().split("_")[0];
      if (!this.buffers.has(name)) this.buffers.set(name, []);
      this.buffers.get(name).push(buffer);
      onProgress(++done, paths.length);
    }));
  }

  hit(midi, velocity = 0.77) {
    const name = getNoteName(midi);
    if (!name || !this.context || this.context.state !== "running") return false;
    const options = this.buffers.get(name);
    if (!options || !options.length) return false;
    const previous = this.roundRobin.get(name) ?? -1;
    const next = (previous + 1 + Math.floor(Math.random() * Math.max(1, options.length - 1))) % options.length;
    this.roundRobin.set(name, next);
    const source = this.context.createBufferSource();
    source.buffer = options[next];
    const gain = this.context.createGain();
    gain.gain.value = Math.min(1, Math.max(0.05, velocity));
    source.connect(gain);
    gain.connect(this.dry);
    gain.connect(this.convolver);
    const voice = { source, gain };
    this.voices.add(voice);
    source.onended = () => {
      this.voices.delete(voice);
      source.disconnect();
      gain.disconnect();
    };
    source.start();
    return true;
  }

  stopAll() {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const voice of this.voices) {
      try {
        voice.gain.gain.setTargetAtTime(0, now, 0.018);
        voice.source.stop(now + 0.1);
      } catch {
        // Already stopped voices are removed by onended.
      }
    }
  }

  setVolume(value) {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.025);
  }

  setReverb(value) {
    this.reverb = Math.min(0.6, Math.max(0, value));
    if (this.wet) this.wet.gain.setTargetAtTime(this.reverb, this.context.currentTime, 0.025);
  }
}

function makeImpulse(context, seconds) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const decay = Math.pow(1 - i / length, 2.8);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  return buffer;
}