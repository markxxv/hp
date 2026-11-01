import assert from "node:assert/strict";
import test from "node:test";
import {createMp3Encoder} from "wasm-media-encoders";

test("WASM encoder produces a playable MP3 bitstream from stereo PCM",async()=>{
  const encoder=await createMp3Encoder();
  encoder.configure({sampleRate:44100,channels:2,bitrate:192,outputSampleRate:44100});
  const frames=44100;
  const left=new Float32Array(frames),right=new Float32Array(frames);
  for(let i=0;i<frames;i++){
    const value=Math.sin(2*Math.PI*440*i/44100)*0.2;
    left[i]=value;
    right[i]=value;
  }
  const parts=[];
  for(let pos=0;pos<frames;pos+=8192){
    const bytes=encoder.encode([left.subarray(pos,pos+8192),right.subarray(pos,pos+8192)]);
    if(bytes.length)parts.push(bytes.slice());
  }
  const end=encoder.finalize();
  if(end.length)parts.push(end.slice());
  const total=parts.reduce((sum,part)=>sum+part.length,0);
  assert.ok(total>3000,"MP3 file is unexpectedly small");
  const first=parts.find(part=>part.length>2);
  assert.ok(first,"Missing MP3 output");
  assert.ok((first[0]===0x49&&first[1]===0x44&&first[2]===0x33)||
    (first[0]===0xff&&(first[1]&0xe0)===0xe0),"Not an MP3 header");
});
