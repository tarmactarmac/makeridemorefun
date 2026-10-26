/* ZIP writer that streams individual PNGs to disk in Chromium where available.
   Other browsers use an in-memory Blob fallback. Each PNG is already compressed. */
const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);return c>>>0;});
function crc32(data){let crc=0xffffffff;for(const b of data)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function u16(out,pos,v){out[pos]=v&255;out[pos+1]=(v>>>8)&255;}
function u32(out,pos,v){u16(out,pos,v&65535);u16(out,pos+2,Math.floor(v/65536));}
const encoder=new TextEncoder();
function dated() {
 const d=new Date();
 return [((d.getHours()&31)<<11)|((d.getMinutes()&63)<<5)|((d.getSeconds()/2)|0),
 ((Math.max(1980,d.getFullYear())-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()];
}
export class ZipWriter {
 constructor(){this.entries=[];this.chunks=[];this.position=0;this.stream=null;this.name='';}
 async open(name) {
  this.name=name;
  if(window.showSaveFilePicker) {
   try{
    const handle=await window.showSaveFilePicker({suggestedName:name,types:[{description:'ZIP files',accept:{'application/zip':['.zip']}}]});
    this.stream=await handle.createWritable();
   }catch(e){if(e?.name==='AbortError')throw e;this.stream=null;}
  }
 }
 async write(bytes){if(this.stream)await this.stream.write(bytes);else this.chunks.push(bytes);this.position+=bytes.byteLength;}
 async add(name,data) {
  if(this.entries.length>=65535)throw new Error('ZIP 항목 65,535개 제한');
  const nameBytes=encoder.encode(name);
  const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
  const crc=crc32(bytes),offset=this.position;
  if(this.position+bytes.length>0xffffffff)throw new Error('ZIP 4GB 제한. 구간을 나눠서 출력하세요.');
  const [tm,dt]=dated();
  const h=new Uint8Array(30+nameBytes.length);
  u32(h,0,0x04034b50);u16(h,4,20);u16(h,6,0x800);u16(h,8,0);
  u16(h,10,tm);u16(h,12,dt);u32(h,14,crc);u32(h,18,bytes.length);u32(h,22,bytes.length);
  u16(h,26,nameBytes.length);h.set(nameBytes,30);
  await this.write(h);await this.write(bytes);
  this.entries.push({nameBytes,crc,offset,length:bytes.length,tm,dt});
 }
 async close() {
  const centralOffset=this.position;
  if(centralOffset>0xffffffff)throw new Error('ZIP 4GB 제한 초과');
  for(const e of this.entries){
   const h=new Uint8Array(46+e.nameBytes.length);
   u32(h,0,0x02014b50);u16(h,4,20);u16(h,6,20);u16(h,8,0x800);
   u16(h,10,0);u16(h,12,e.tm);u16(h,14,e.dt);u32(h,16,e.crc);
   u32(h,20,e.length);u32(h,24,e.length);u16(h,28,e.nameBytes.length);u32(h,42,e.offset);
   h.set(e.nameBytes,46);await this.write(h);
  }
  const cdLength=this.position-centralOffset;
  if(this.position>0xffffffff)throw new Error('ZIP 4GB 제한 초과');
  const end=new Uint8Array(22);u32(end,0,0x06054b50);u16(end,8,this.entries.length);
  u16(end,10,this.entries.length);u32(end,12,cdLength);u32(end,16,centralOffset);await this.write(end);
  if(this.stream){await this.stream.close();return null;}
  return new Blob(this.chunks,{type:'application/zip'});
 }
 async abort() {if(this.stream){try{await this.stream.abort();}catch{}}this.chunks=[];}
}
