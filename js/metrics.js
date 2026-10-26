export const METRICS={
 speed:['현재속도','km/h','#5bc6ff',1],avg_speed:['평균속도','km/h','#5bc6ff',1],max_speed:['최고속도','km/h','#5bc6ff',1],
 power3:['현재파워 (3초)','W','#f9d65b',0],avg_power:['평균파워','W','#f9d65b',0],np:['NP','W','#ffa971',0],
 cadence:['현재케이던스','rpm','#b9a3ff',0],avg_cadence:['평균케이던스','rpm','#b9a3ff',0],max_cadence:['최고케이던스','rpm','#b9a3ff',0],
 heart_rate:['현재심박','bpm','#ff7992',0],avg_heart_rate:['평균심박','bpm','#ff7992',0],max_heart_rate:['최고심박','bpm','#ff7992',0],
 segment_distance:['구간거리','km','#72e5c2',2],total_distance:['총거리','km','#72e5c2',2],
 elapsed_time:['경과시간','','#f3f7fb','time'],clock_time:['현재시간','','#f3f7fb','clock'],
 grade:['현재경사도','%','#ffb985',1],ascent:['누적 상승고도','m','#9de0a7',0]
};
const keys=['speed','power','heart_rate','cadence','distance','altitude','grade'];
const max=(a,b)=>a===null?b:b===null?a:Math.max(a,b);
const lerp=(a,b,p)=>a===null?null:b===null?a:a+(b-a)*p;
function findIndex(arr,t) {
 let lo=0,hi=arr.length;
 while(lo<hi){const mid=(lo+hi)>>1;if(arr[mid]<=t)lo=mid+1;else hi=mid;}
 return lo-1;
}
function hms(seconds) {
 const v=Math.max(0,Math.floor(seconds)),h=Math.floor(v/3600),m=Math.floor((v%3600)/60),s=v%60;
 return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
export function formatValue(k,value) {
 const type=METRICS[k]?.[3];
 if(value===null || value===undefined || Number.isNaN(value)) return '—';
 if(type==='time')return hms(value);
 if(type==='clock')return value;
 return Number(value).toFixed(type ?? 0);
}
export function formatTime(s) {return hms(s);}
export class RideStats {
 constructor(ride) {
  this.ride=ride;
  this.times=ride.records.map(x=>x.elapsed);
  this.firstDistance=ride.records.find(x=>x.distance!==null)?.distance??null;
  this.totalSeconds=Math.floor(ride.duration);
  this.summaries=[];
  this.gradeSeries=this.makeGrades();
  this.precompute();
 }
 makeGrades() {
  const rec=this.ride.records;
  return rec.map((r,i)=>{
    if(r.grade!==null) {
      let sum=0,c=0;
      for(let j=Math.max(0,i-2);j<Math.min(rec.length,i+3);j++) {
        if(rec[j].grade!==null && Math.abs(rec[j].elapsed-r.elapsed)<=5){sum+=rec[j].grade;c++;}
      }
      return c?sum/c:null;
    }
    if(r.distance===null || r.altitude===null)return null;
    let left=i,right=i;
    while(left>0 && i-left<30) {
      const n=rec[left-1];
      if(n.distance===null || n.altitude===null || rec[left].elapsed-n.elapsed>3 || r.distance-n.distance>.03)break;
      left--;
    }
    while(right<rec.length-1 && right-i<30) {
      const n=rec[right+1];
      if(n.distance===null || n.altitude===null || n.elapsed-rec[right].elapsed>3 || n.distance-r.distance>.03)break;
      right++;
    }
    const dm=(rec[right].distance-rec[left].distance)*1000;
    return dm<12 ? null : Math.max(-35,Math.min(35,100*(rec[right].altitude-rec[left].altitude)/dm));
  });
 }
 rawAt(t) {
  const i=findIndex(this.times,t);
  if(i<0)return null;
  const a=this.ride.records[i],b=this.ride.records[Math.min(i+1,this.times.length-1)];
  const gap=b.elapsed-a.elapsed;
  if((gap>3 && t-a.elapsed>.01) || t-a.elapsed>3) return null;
  const f=gap>0&&gap<=3?(t-a.elapsed)/gap:0;
  const r=Object.fromEntries(keys.map(k=>[k,lerp(a[k],b[k],f)]));
  r.grade=lerp(this.gradeSeries[i],this.gradeSeries[Math.min(i+1,this.times.length-1)],f);
  return r;
 }
 precompute() {
  const sum={speed:0,power:0,cadence:0,heart_rate:0},count={speed:0,power:0,cadence:0,heart_rate:0};
  const mx={speed:null,cadence:null,heart_rate:null};
  let lastAlt=null,ascent=0,distIntegrated=0,altHistory=[];
  let powerHistory=[],np4Sum=0,npCount=0;
  const hasAltitude=this.ride.dataPresent.altitude;
  for(let sec=0;sec<=this.totalSeconds;sec++) {
    const r=this.rawAt(sec);
    if(r) {
      for(const k of Object.keys(sum)) {
        const v=r[k];
        if(v!==null && (k!=='speed'||v>=.5)){sum[k]+=v;count[k]++;}
      }
      mx.speed=max(mx.speed,r.speed);mx.cadence=max(mx.cadence,r.cadence);mx.heart_rate=max(mx.heart_rate,r.heart_rate);
      if(r.power!==null) {
        powerHistory.push(r.power);
        if(powerHistory.length>30)powerHistory.shift();
        if(powerHistory.length===30) {
          const avg=powerHistory.reduce((a,b)=>a+b,0)/30;
          np4Sum+=avg**4;npCount++;
        }
      } else powerHistory=[];
      if(sec>0&&r.speed!==null)distIntegrated+=r.speed/3600;
      if(r.altitude!==null){
        altHistory.push(r.altitude);if(altHistory.length>5)altHistory.shift();
        const alt=altHistory.reduce((a,b)=>a+b,0)/altHistory.length;
        if(lastAlt!==null && alt-lastAlt>.35)ascent+=alt-lastAlt;
        lastAlt=alt;
      }
    } else {powerHistory=[];altHistory=[];lastAlt=null;}
    const latest=this.ride.records[Math.max(0,findIndex(this.times,sec))];
    const dist=r?.distance??latest.distance;
    const totalDist=dist!==null&&this.firstDistance!==null?Math.max(0,dist-this.firstDistance):count.speed?distIntegrated:null;
    this.summaries.push({
      avg_speed:count.speed?sum.speed/count.speed:null,max_speed:mx.speed,
      avg_power:count.power?sum.power/count.power:null,np:npCount?(np4Sum/npCount)**.25:null,
      avg_cadence:count.cadence?sum.cadence/count.cadence:null,max_cadence:mx.cadence,
      avg_heart_rate:count.heart_rate?sum.heart_rate/count.heart_rate:null,max_heart_rate:mx.heart_rate,
      total_distance:totalDist,ascent:hasAltitude?ascent:null
    });
  }
 }
 totalDistanceAt(t) {
  const raw=this.rawAt(t);
  if(raw?.distance!==null && raw?.distance!==undefined && this.firstDistance!==null) return Math.max(0,raw.distance-this.firstDistance);
  return this.summaries[Math.floor(Math.min(this.totalSeconds,Math.max(0,t)))].total_distance;
 }
 at(t,segmentStart=0) {
  t=Math.max(0,Math.min(this.ride.duration,t));
  const s=Math.floor(t),a={...this.summaries[s]},r=this.rawAt(t);
  const recent=[];
  for(let p=Math.max(0,s-2);p<=s;p++) {
    const v=this.rawAt(p)?.power;
    if(v===null||v===undefined)recent.length=0;
    else recent.push(v);
  }
  a.speed=r?.speed??null;a.power3=r&&recent.length?recent.reduce((x,y)=>x+y,0)/recent.length:null;
  a.cadence=r?.cadence??null;a.heart_rate=r?.heart_rate??null;a.grade=r?.grade??null;
  a.total_distance=this.totalDistanceAt(t);
  const base=this.totalDistanceAt(segmentStart);
  a.segment_distance=a.total_distance===null||base===null?null:Math.max(0,a.total_distance-base);
  a.elapsed_time=t;
  a.clock_time=new Date(this.ride.startTimeMs+t*1000).toLocaleTimeString('ko-KR',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
  return a;
 }
}
