import {createMp3Encoder} from "wasm-media-encoders";

self.onmessage=async (event)=>{
  if(event.data?.type!=="encode")return;
  try{
    const {sampleRate,bitrate,left,right}=event.data;
    if(!(left instanceof Float32Array)||!(right instanceof Float32Array)||left.length!==right.length)
      throw new Error("Invalid PCM data for MP3 encoding.");

    const start=performance.now();
    const encoder=await createMp3Encoder();
    encoder.configure({sampleRate,channels:2,bitrate,outputSampleRate:sampleRate});

    const blockSize=16384;
    const total=Math.ceil(left.length/blockSize);
    const parts=[];
    for(let offset=0,chunk=0;offset<left.length;offset+=blockSize,chunk++){
      const end=Math.min(offset+blockSize,left.length);
      const bytes=encoder.encode([left.subarray(offset,end),right.subarray(offset,end)]);
      if(bytes.length)parts.push(bytes.slice()); // WASM owns the original memory.
      if(chunk%16===0||end===left.length){
        self.postMessage({type:"progress",ratio:end/left.length,elapsedMs:performance.now()-start});
      }
    }
    const remaining=encoder.finalize();
    if(remaining.length)parts.push(remaining.slice());
    self.postMessage({type:"done",parts},parts.map(part=>part.buffer));
  }catch(error){
    self.postMessage({type:"error",message:error?.message||String(error)});
  }
};
