/* Minimal FIT activity reader: record messages only. No uploads, no dependencies.
   Handles endian, compressed timestamps and developer-field skipping.
   Field IDs match the Garmin FIT public profile; other manufacturer/private
   and developer metrics are intentionally not decoded. */
const FIT_EPOCH_MS = Date.UTC(1989, 11, 31);
const TYPES = {
  0:[1, 255, 'u8'], 1:[1, 127, 'i8'], 2:[1, 255, 'u8'],
  3:[2, 32767, 'i16'], 4:[2, 65535, 'u16'],
  5:[4, 2147483647, 'i32'], 6:[4, 4294967295, 'u32'],
  8:[4, null, 'f32'], 9:[8, null, 'f64'],
  10:[1, 0, 'u8'], 11:[2, 0, 'u16'], 12:[4, 0, 'u32'],
  14:[8, 9223372036854775807n, 'i64'], 15:[8, 18446744073709551615n, 'u64'],
  16:[8, 0n, 'u64']
};
function scalar(view, start, size, type, little) {
  const t = type & 31, def = TYPES[t];
  if (!def) return null;
  const [width, invalid, method] = def;
  if (size < width || size % width) return null;
  for (let i=0; i<size; i+=width) {
    const p=start+i;
    let v;
    if (method==='u8') v=view.getUint8(p);
    else if (method==='i8') v=view.getInt8(p);
    else if (method==='u16') v=view.getUint16(p,little);
    else if (method==='i16') v=view.getInt16(p,little);
    else if (method==='u32') v=view.getUint32(p,little);
    else if (method==='i32') v=view.getInt32(p,little);
    else if (method==='f32') v=view.getFloat32(p,little);
    else if (method==='f64') v=view.getFloat64(p,little);
    else if (method==='u64') v=view.getBigUint64(p,little);
    else v=view.getBigInt64(p,little);
    if (v===invalid || (typeof v==='number'&&!Number.isFinite(v))) continue;
    return typeof v==='bigint' ? Number(v) : v;
  }
  return null;
}
function numberOrNull(a) { return typeof a==='number' && Number.isFinite(a) ? a : null; }
const primary = (v,a,b)=>numberOrNull(v.get(a)) ?? numberOrNull(v.get(b));
function decodedRecord(values, ts) {
  const s=primary(values,73,6);
  const altitude=primary(values,78,2), distance=numberOrNull(values.get(5)), grade=numberOrNull(values.get(9));
  return {
    t:ts,
    power:numberOrNull(values.get(7)),
    speed:s===null ? null : s*3.6/1000,
    cadence:numberOrNull(values.get(4)),
    heart_rate:numberOrNull(values.get(3)),
    distance:distance===null ? null : distance/100000,
    altitude:altitude===null ? null : altitude/5-500,
    grade:grade===null ? null : grade/100
  };
}
export function parseFit(buffer) {
  if (!(buffer instanceof ArrayBuffer)) throw new Error('FIT ArrayBuffer가 필요합니다.');
  const view=new DataView(buffer);
  if (buffer.byteLength < 14) throw new Error('FIT 파일이 너무 작습니다.');
  const head=view.getUint8(0), dataSize=view.getUint32(4,true);
  if (head<12 || head>buffer.byteLength || String.fromCharCode(...new Uint8Array(buffer,8,4))!=='.FIT') throw new Error('유효한 FIT 파일이 아닙니다.');
  const end=head+dataSize;
  if (end>buffer.byteLength) throw new Error('FIT 데이터가 잘렸습니다.');
  const defs=new Map(), records=[];
  let ptr=head, ts=null, counter=0;
  while(ptr<end) {
    if (++counter>3000000) throw new Error('FIT 메시지 개수 제한 초과');
    const h=view.getUint8(ptr++), compressed=!!(h&128);
    const local=compressed ? (h>>5)&3 : h&15;
    if (!compressed && (h&64)) {
      if(ptr+5>end) throw new Error('손상된 FIT 정의 메시지');
      const little=view.getUint8(ptr+1)===0;
      const global=view.getUint16(ptr+2,little);
      const count=view.getUint8(ptr+4);
      ptr+=5;
      const fields=[];
      for(let i=0;i<count;i++) {
        if(ptr+3>end) throw new Error('손상된 필드 정의');
        fields.push([view.getUint8(ptr),view.getUint8(ptr+1),view.getUint8(ptr+2)]);
        ptr+=3;
      }
      const dev=[];
      if(h&32) {
        if(ptr>=end) throw new Error('손상된 개발자 필드');
        const n=view.getUint8(ptr++);
        for(let i=0;i<n;i++) {
          if(ptr+3>end) throw new Error('손상된 개발자 정의');
          dev.push(view.getUint8(ptr+1)); ptr+=3;
        }
      }
      defs.set(local, {little,global,fields,dev});
      continue;
    }
    const d=defs.get(local);
    if(!d) throw new Error('알 수 없는 FIT 메시지 정의');
    const vals=new Map();
    for(const [field,size,type] of d.fields) {
      if(ptr+size>end) throw new Error('손상된 FIT 레코드');
      if(d.global===20 || field===253) vals.set(field,scalar(view,ptr,size,type,d.little));
      ptr+=size;
    }
    for(const size of d.dev) {
      if(ptr+size>end) throw new Error('손상된 개발자 필드 값');
      ptr+=size;
    }
    const explicit=vals.get(253);
    if(Number.isFinite(explicit)) ts=explicit;
    else if(compressed && ts!==null) {
      const off=h&31, base=ts-(ts%32);
      ts=base+off+(off<ts%32 ? 32 : 0);
    }
    if(d.global===20 && ts!==null) records.push(decodedRecord(vals,ts));
  }
  if(!records.length) throw new Error('시간 정보가 있는 record 데이터가 없습니다. 활동 기록 FIT인지 확인하세요.');
  const byTime=new Map();
  for(const r of records) {
    const prev=byTime.get(r.t);
    if(prev) for(const k of ['power','speed','cadence','heart_rate','distance','altitude','grade']) if(r[k]===null) r[k]=prev[k];
    byTime.set(r.t,r);
  }
  const sorted=[...byTime.values()].sort((a,b)=>a.t-b.t);
  const t0=sorted[0].t;
  for(const r of sorted) r.elapsed=r.t-t0;
  return {
    records:sorted,
    startTimeMs:FIT_EPOCH_MS+t0*1000,
    duration:sorted.at(-1).elapsed,
    samples:sorted.length,
    dataPresent:Object.fromEntries(['power','speed','cadence','heart_rate','distance','altitude','grade'].map(k=>[k,sorted.some(x=>x[k]!==null)]))
  };
}
