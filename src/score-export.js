// Standard MIDI File format 0. A 120 BPM clock with 1000 PPQ gives 0.5 ms ticks.
const PPQ=1000;
const TICKS_PER_SECOND=2000;

function vlq(value) {
  const bytes=[value&127];
  while((value>>=7)>0)bytes.unshift((value&127)|128);
  return bytes;
}

export function createMIDI(sequence) {
  const events=[];
  for(const note of sequence.notes) {
    const at=Math.round(note.at*TICKS_PER_SECOND);
    const end=Math.max(at+1,Math.round((note.at+note.duration)*TICKS_PER_SECOND));
    for(const pitch of new Set(note.pitches)) {
      if(pitch<0||pitch>127)continue;
      events.push({tick:at,off:false,pitch},{tick:end,off:true,pitch});
    }
  }
  events.sort((a,b)=>a.tick-b.tick||Number(b.off)-Number(a.off));
  const track=[0,0xff,0x51,3,0x07,0xa1,0x20]; // 500,000 µs per quarter.
  let last=0;
  for(const {tick,off,pitch} of events) {
    track.push(...vlq(tick-last),off?0x80:0x90,pitch,off?0:96);
    last=tick;
  }
  track.push(...vlq(Math.max(0,Math.round(sequence.duration*TICKS_PER_SECOND)-last)),0xff,0x2f,0);
  const size=track.length;
  return new Uint8Array([0x4d,0x54,0x68,0x64,0,0,0,6,0,0,0,1,PPQ>>8,PPQ&255,0x4d,0x54,0x72,0x6b,(size>>>24)&255,(size>>>16)&255,(size>>>8)&255,size&255,...track]);
}

export function downloadScore(blob,filename) {
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
