import {getNoteName} from "./audio.js";

export const MAX_RECORD_SECONDS=600;
export const MAX_RECORD_NOTES=5000;
const NOTE={57:"A,",62:"D",64:"E",65:"F",67:"G",69:"A",70:"B",72:"c",74:"d"};
const UNIT_MS=250; // L:1/8 at Q:1/4=120; rational ABC lengths retain millisecond timing.
const STRIKE_MS=125;

export class LiveRecording {
  constructor(title) {
    this.title=title;
    this.startedAt=null;
    this.events=[];
    this.count=0;
  }
  elapsed(now) {return this.startedAt===null?0:Math.max(0,now-this.startedAt);}
  hit(midi,now) {
    if(!getNoteName(midi)||!Number.isFinite(now)||this.count>=MAX_RECORD_NOTES)return false;
    if(this.startedAt===null)this.startedAt=now;
    let at=Math.round(this.elapsed(now));
    const last=this.events.at(-1);
    if(last)at=Math.max(at,last.at);
    if(last?.at===at&&last.pitches.includes(midi))at++;
    if(at>=MAX_RECORD_SECONDS*1000)return false;
    if(last?.at===at)last.pitches.push(midi);
    else this.events.push({at,pitches:[midi]});
    this.count++;
    return true;
  }
  toABC(now) {
    if(!this.events.length)return null;
    const end=Math.min(MAX_RECORD_SECONDS*1000,Math.max(this.events.at(-1).at+1,Math.round(this.elapsed(now))));
    const tokens=[];
    for(let i=0;i<this.events.length;i++) {
      const event=this.events[i];
      const gap=(this.events[i+1]?.at??end)-event.at;
      const duration=Math.min(STRIKE_MS,gap);
      const pitches=event.pitches.map(midi=>NOTE[midi]).join("");
      tokens.push((event.pitches.length===1?pitches:"["+pitches+"]")+length(duration));
      let rest=gap-duration;
      while(rest>0) {
        const part=Math.min(rest,120000); // Respect the ABC parser's individual duration limit.
        tokens.push("z"+length(part));
        rest-=part;
      }
    }
    const lines=[];
    for(let i=0;i<tokens.length;i+=12)lines.push(tokens.slice(i,i+12).join(" "));
    return ["X:1","T:"+this.title.replace(/[\r\n%]/g," "),"M:none","L:1/8","Q:1/4=120","K:Dm",...lines,"|]"].join("\n");
  }
}

function length(ms) {
  let a=ms,b=UNIT_MS;
  while(b)[a,b]=[b,a%b];
  const n=ms/a,d=UNIT_MS/a;
  return d===1?(n===1?"":String(n)):n+"/"+d;
}
