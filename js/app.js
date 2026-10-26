import {parseFit} from './fit.js';
import {RideStats,METRICS,formatTime} from './metrics.js';
import {DEFAULT_LAYOUT,ALL_LAYOUT,cloneLayout,clampBox,renderHUD} from './render.js';
import {ZipWriter} from './zip.js';

const $=id=>document.getElementById(id);
let layout=cloneLayout(DEFAULT_LAYOUT), selected=-1, stats=null,ride=null,fitName='ride',cursor=0,playing=false,playOrigin=0,playStart=0;
let exporting=false,cancelRequested=false,drag=null;
const fake={speed:36.8,avg_speed:29.2,max_speed:64.8,power3:286,avg_power:203,np:227,cadence:91,avg_cadence:87,max_cadence:117,heart_rate:166,avg_heart_rate:148,max_heart_rate:186,segment_distance:5.7,total_distance:45.2,elapsed_time:4580,clock_time:'13:47:09',grade:4.2,ascent:742};
const preview=$('preview');
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const sleep=()=>new Promise(resolve=>setTimeout(resolve,0));
function options(){return {theme:$('styleSelect').value,opacity:Number($('opacity').value),ftp:Number($('ftp').value)||223};}
function dataAt(t){return stats?stats.at(t,readTime($('startInput').value)||0):fake;}
function draw(){renderHUD(preview,layout,dataAt(cursor),{...options(),selected,edit:!exporting});$('currentTime').textContent=formatTime(cursor);$('seek').value=cursor;}
function refreshLayers(){
 const cont=$('layers');cont.replaceChildren();
 layout.forEach((item,i)=>{
  const row=document.createElement('button');row.className='layer'+(selected===i?' selected':'');row.type='button';
  const num=document.createElement('span');num.className='layer-index';num.textContent=String(i+1).padStart(2,'0');
  const name=document.createElement('span');name.textContent=METRICS[item.metric]?.[0]||item.metric;
  const del=document.createElement('button');del.type='button';del.className='layer-delete';del.textContent='×';del.title='카드 삭제';
  del.addEventListener('click',e=>{e.stopPropagation();removeItem(i);});
  row.append(num,name,del);row.addEventListener('click',()=>{selected=i;syncSelected();});cont.append(row);
 });
 $('layersCount').textContent=`${layout.length}개`;
 const item=layout[selected];$('itemOptions').hidden=!item;
 if(item){$('changeMetric').value=item.metric;$('itemColor').value=item.color||METRICS[item.metric][2];}
}
function syncSelected(){refreshLayers();draw();}
function removeItem(i){layout.splice(i,1);selected=selected===i?-1:selected>i?selected-1:selected;syncSelected();}
function addItem(metric){if(!METRICS[metric])return;if(layout.length>=40){notice('최대 40개 카드까지 추가 가능합니다.',true);return;}
 const offset=layout.length%8;layout.push({metric,x:.06+offset*.03,y:.25+offset*.04,w:.18,h:.145});selected=layout.length-1;syncSelected();}
function setLayout(items) {layout=items.filter(x=>METRICS[x.metric]).slice(0,40).map(x=>clampBox({metric:x.metric,x:Number(x.x)||0,y:Number(x.y)||0,w:Number(x.w)||.18,h:Number(x.h)||.14,color:x.color,colorMode:x.colorMode,label:x.label}));selected=-1;syncSelected();}
function populateChoices(){
 for(const id of ['addMetric','changeMetric']){
  const select=$(id);for(const [k,v] of Object.entries(METRICS)){const opt=document.createElement('option');opt.value=k;opt.textContent=v[0];select.append(opt);}
 }
}
function previewCoords(e){const box=preview.getBoundingClientRect();return {x:(e.clientX-box.left)/box.width,y:(e.clientY-box.top)/box.height};}
function findCard(x,y){for(let i=layout.length-1;i>=0;i--){const p=layout[i];if(x>=p.x&&x<=p.x+p.w&&y>=p.y&&y<=p.y+p.h)return i;}return -1;}
preview.addEventListener('pointerdown',e=>{
 if(exporting)return;
 const p=previewCoords(e),found=findCard(p.x,p.y);
 selected=found;syncSelected();if(found<0)return;
 const item=layout[found],scale=preview.getBoundingClientRect().width;
 const resize=Math.abs(p.x-item.x-item.w)*scale<24&&Math.abs(p.y-item.y-item.h)*scale<24;
 drag={mode:resize?'size':'move',x:p.x,y:p.y,orig:{...item},i:found};preview.setPointerCapture(e.pointerId);
});
preview.addEventListener('pointermove',e=>{
 if(!drag || exporting)return;const p=previewCoords(e),b=layout[drag.i],dx=p.x-drag.x,dy=p.y-drag.y;
 if(drag.mode==='move'){b.x=drag.orig.x+dx;b.y=drag.orig.y+dy;}
 else {b.w=drag.orig.w+dx;b.h=drag.orig.h+dy;}
 clampBox(b);draw();
});
preview.addEventListener('pointerup',()=>{drag=null;});preview.addEventListener('pointercancel',()=>{drag=null;});
function notice(txt,error=false){$('exportStatus').textContent=txt;$('exportStatus').style.color=error?'#ff9caa':'#9ab6c8';}
function readTime(v){
 if(/^\d+(\.\d+)?$/.test(v.trim()))return Number(v.trim());
 const parts=v.trim().split(':');
 if(parts.length<2||parts.length>3||parts.some(p=>!/^\d+$/.test(p)))return null;
 if(parts.length===2)return Number(parts[0])*60+Number(parts[1]);
 return Number(parts[0])*3600+Number(parts[1])*60+Number(parts[2]);
}
function validRange(){if(!stats)throw Error('먼저 FIT 파일을 불러오세요.');
 const start=readTime($('startInput').value),end=readTime($('endInput').value);
 if(start===null||end===null||start<0||end>ride.duration+.001||end<=start)throw Error('시작·종료 시간은 FIT 기록 범위 내의 HH:MM:SS 값이어야 합니다.');
 if(end-start<1/60)throw Error('구간 길이는 최소 1프레임이어야 합니다.');
 return {start,end,duration:end-start};
}
function loadStats(buffer,name){
 ride=parseFit(buffer);stats=new RideStats(ride);fitName=(name||'ride').replace(/\.fit$/i,'').replace(/[^a-zA-Z0-9가-힣._-]/g,'_');
 cursor=0;playing=false;$('playBtn').textContent='▶';
 $('seek').max=ride.duration;$('seek').value=0;$('endTime').textContent=formatTime(ride.duration);
 $('startInput').value='00:00:00';$('endInput').value=formatTime(Math.min(15,Math.floor(ride.duration)));
 $('fileMeta').innerHTML='';const parts=[name, `${ride.samples.toLocaleString()}개 레코드 · ${formatTime(ride.duration)}`,
 '센서: '+Object.entries(ride.dataPresent).filter(x=>x[1]).map(x=>({power:'파워',speed:'속도',heart_rate:'심박',cadence:'케이던스',distance:'거리',grade:'경사도',altitude:'고도'}[x[0]])).join(' / ')];
 for(const v of parts){const d=document.createElement('div');d.textContent=v;$('fileMeta').append(d);}
 notice(`FIT 파일을 불러왔습니다. ${ride.samples}개 레코드.`);draw();
}
async function handleFile(file) {
 if(!file)return;
 try{$('fileMeta').textContent='분석 중...';loadStats(await file.arrayBuffer(),file.name);}
 catch(e){$('fileMeta').textContent='파일 오류: '+e.message;notice(e.message,true);}
}
$('fitInput').addEventListener('change',e=>handleFile(e.target.files[0]));
const drop=$('dropzone');drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragover');});drop.addEventListener('dragleave',()=>drop.classList.remove('dragover'));
drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragover');handleFile(e.dataTransfer.files[0]);});
$('demoBtn').addEventListener('click',async()=>{try{const res=await fetch('./examples/DEMO_SYNTHETIC.fit');if(!res.ok)throw Error('샘플 파일을 찾지 못했습니다.');loadStats(await res.arrayBuffer(),'DEMO_SYNTHETIC.fit');}catch(e){notice('샘플을 불러오지 못했습니다. GitHub Pages 또는 웹서버에서 실행하세요. '+e.message,true);}});
$('addBtn').addEventListener('click',()=>addItem($('addMetric').value));$('addMetric').addEventListener('change',()=>{});
$('presetSimple').addEventListener('click',()=>setLayout(cloneLayout(DEFAULT_LAYOUT)));
$('presetAll').addEventListener('click',()=>setLayout(cloneLayout(ALL_LAYOUT)));
$('changeMetric').addEventListener('change',e=>{if(layout[selected]){layout[selected].metric=e.target.value;layout[selected].color=undefined;layout[selected].colorMode=undefined;syncSelected();}});
$('itemColor').addEventListener('input',e=>{if(layout[selected]){layout[selected].color=e.target.value;layout[selected].colorMode='fixed';draw();}});
$('deleteItem').addEventListener('click',()=>{if(selected>=0)removeItem(selected);});
for(const id of ['ftp','opacity','styleSelect'])$(id).addEventListener('input',()=>{$('opacityVal').textContent=Math.round(Number($('opacity').value)*100)+'%';draw();});
$('saveLayout').addEventListener('click',()=>download(new Blob([JSON.stringify({version:3,style:options(),items:layout},null,2)],{type:'application/json'}),'ridehud_layout.json'));
$('loadLayout').addEventListener('click',()=>$('layoutFile').click());
$('layoutFile').addEventListener('change',async e=>{try{const json=JSON.parse(await e.target.files[0].text());if(!Array.isArray(json.items))throw Error('레이아웃 형식이 아닙니다.');setLayout(json.items);if(json.style){if(json.style.theme)$('styleSelect').value=json.style.theme;if(json.style.opacity)$('opacity').value=json.style.opacity;if(json.style.ftp)$('ftp').value=json.style.ftp;}draw();notice('레이아웃을 불러왔습니다.');}catch(err){notice(err.message,true);}e.target.value='';});
$('seek').addEventListener('input',e=>{cursor=Number(e.target.value);playing=false;$('playBtn').textContent='▶';draw();});
$('startAtPlayhead').addEventListener('click',()=>{$('startInput').value=formatTime(cursor);draw();});
$('endAtPlayhead').addEventListener('click',()=>{$('endInput').value=formatTime(cursor);draw();});
$('startInput').addEventListener('change',draw);
$('playBtn').addEventListener('click',()=>{
 if(!stats){notice('FIT 파일을 먼저 불러오세요.',true);return;}
 playing=!playing;$('playBtn').textContent=playing?'Ⅱ':'▶';
 if(playing){if(cursor>=ride.duration)cursor=0;playOrigin=performance.now();playStart=cursor;requestAnimationFrame(playTick);}
});
function playTick(now){if(!playing)return;cursor=Math.min(ride.duration,playStart+(now-playOrigin)/1000);draw();if(cursor>=ride.duration){playing=false;$('playBtn').textContent='▶';return;}requestAnimationFrame(playTick);}
$('helpBtn').addEventListener('click',()=>$('helpDialog').showModal());$('closeHelp').addEventListener('click',()=>$('helpDialog').close());
function download(blob,name){const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function progress(p,text){$('progressTrack').hidden=false;$('progressFill').style.width=(100*p).toFixed(1)+'%';notice(text);}
function setExporting(v){exporting=v;$('exportBtn').disabled=v;$('cancelBtn').hidden=!v;if(!v){$('progressTrack').hidden=true;draw();}}
$('cancelBtn').addEventListener('click',()=>{cancelRequested=true;notice('취소 요청 중...');});
function frameCanvas(width){const c=document.createElement('canvas');c.width=width;c.height=Math.round(width*9/16);return c;}
function drawExport(c,t,segmentStart,bg){renderHUD(c,layout,stats.at(t,segmentStart),{...options(),selected:-1,edit:false,background:bg});}
function canvasPng(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG 인코딩 실패')),'image/png'));}
async function pngExport({start,end,duration},width) {
 const frames=Math.ceil(duration*60);
 if(frames>12000)throw Error('PNG 내보내기는 한 번에 최대 200초입니다. 구간을 나눠 출력해 주세요.');
 if(!('showSaveFilePicker' in window) && frames>600)throw Error('이 브라우저에서 PNG ZIP 메모리 제한은 10초입니다. Chrome/Edge의 HTTPS GitHub Pages에서 실행하거나 짧게 나눠 주세요.');
 const zip=new ZipWriter();
 await zip.open(`${fitName}_${Math.floor(start)}s_60fps_alpha.zip`);
 const canvas=frameCanvas(width);
 try {
  await zip.add('README_IMPORT.txt',new TextEncoder().encode('RideHUD PNG image sequence — RGBA transparent\r\nFPS: 60 EXACT. Import frames as an image sequence in your editor and set 60fps.\r\nName pattern: frames/frame_000000.png\r\n'));
  await zip.add('timing.json',new TextEncoder().encode(JSON.stringify({start,end,fps:60,frames,resolution:[canvas.width,canvas.height]},null,2)));
  for(let i=0;i<frames;i++) {
   if(cancelRequested)throw new Error('출력이 취소되었습니다.');
   const t=Math.min(end,start+i/60);
   drawExport(canvas,t,start,'transparent');
   const bytes=new Uint8Array(await (await canvasPng(canvas)).arrayBuffer());
   await zip.add(`frames/frame_${String(i).padStart(6,'0')}.png`,bytes);
   if(i%10===0){progress((i+1)/frames,`투명 PNG 생성 중... ${i+1} / ${frames} 프레임`);await sleep();}
  }
  const blob=await zip.close();
  if(blob)download(blob,zip.name);
  progress(1,`완료! ${frames}프레임, 60fps PNG 시퀀스가 저장되었습니다.`);
 } catch(e){await zip.abort();throw e;}
}
async function webmExport({start,end,duration},width,green=false){
 if(!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream)throw Error('브라우저에서 WebM 녹화를 지원하지 않습니다. Chrome이나 Edge를 이용하세요.');
 if(duration<2)throw Error('WebM은 인코더 시작 안정성을 위해 최소 2초 구간으로 내보내 주세요. 1초 이하는 PNG 시퀀스를 사용하세요.');
 if(duration>180)throw Error('WebM은 메모리 보호를 위해 한 번에 최대 3분까지 내보낼 수 있습니다. 구간을 나눠 주세요.');
 const canvas=frameCanvas(width);
 const bg=green?'#00ff00':'transparent';
 drawExport(canvas,start,start,bg);
 const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));
 if(!mime)throw Error('WebM 인코딩을 지원하지 않는 브라우저입니다.');
 const stream=canvas.captureStream(60);
 const chunks=[];
 const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:width===3840?26000000:11000000});
 const finished=new Promise((resolve,reject)=>{recorder.addEventListener('stop',resolve,{once:true});recorder.addEventListener('error',e=>reject(e.error||Error('녹화 오류')),{once:true});});
 recorder.addEventListener('dataavailable',e=>{if(e.data.size)chunks.push(e.data);});
 let stopped=false;
 try{
  recorder.start(1000);
  const begun=performance.now();
  while(!cancelRequested){
   const elapsed=(performance.now()-begun)/1000;
   if(elapsed>=duration)break;
   drawExport(canvas,Math.min(end,start+elapsed),start,bg);
   if(Math.floor(elapsed*5)!==Math.floor((elapsed-1/60)*5))progress(elapsed/duration,`WebM 생성 중... ${elapsed.toFixed(1)} / ${duration.toFixed(1)}초 (실시간 녹화)`);
   await new Promise(requestAnimationFrame);
  }
  recorder.stop();stopped=true;
  await finished;
  if(cancelRequested)throw Error('출력이 취소되었습니다.');
  if(!chunks.length)throw Error('인코딩된 WebM 데이터가 없습니다.');
  download(new Blob(chunks,{type:mime}),`${fitName}_${Math.floor(start)}s_${green?'greenscreen':'alpha_try'}_60fps.webm`);
  progress(1,`WebM 완료! ${green?'크로마키 제거 후 합성하세요.':'투명도는 편집기에서 확인하세요. 미지원 시 PNG 시퀀스를 사용하세요.'}`);
 }finally{
  if(!stopped&&recorder.state!=='inactive'){recorder.stop();await finished.catch(()=>{});}
  stream.getTracks().forEach(t=>t.stop());
 }
}
$('exportBtn').addEventListener('click',async()=>{
 if(exporting)return;
 let range;try{range=validRange();}catch(e){notice(e.message,true);return;}
 const format=document.querySelector('input[name="format"]:checked').value;
 const width=Number($('exportResolution').value);
 if(width===3840 && range.duration>60 && !confirm('4K 장시간 출력은 메모리를 많이 사용합니다. 계속할까요?'))return;
 if(format==='webm-alpha' && !confirm('WebM 투명도는 브라우저·영상 편집기에서 보장되지 않습니다. 확실한 투명 배경은 PNG 시퀀스 ZIP을 추천합니다. 계속할까요?'))return;
 cancelRequested=false;playing=false;$('playBtn').textContent='▶';setExporting(true);
 try{
  if(format==='png')await pngExport(range,width);
  else await webmExport(range,width,format==='webm-green');
 }catch(e){notice(`내보내기 종료: ${e.message}`,true);}
 finally{setExporting(false);}
});
populateChoices();refreshLayers();$('opacityVal').textContent='86%';draw();
