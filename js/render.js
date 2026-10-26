import {METRICS,formatValue} from './metrics.js';
export const DEFAULT_LAYOUT = [
 ['power3',.055,.748,.24,.166],['speed',.306,.748,.194,.166],
 ['heart_rate',.511,.748,.177,.166],['cadence',.698,.748,.175,.166],
 ['np',.055,.654,.153,.082],['grade',.22,.654,.153,.082],
 ['total_distance',.385,.654,.153,.082],['elapsed_time',.55,.654,.221,.082]
].map(([metric,x,y,w,h])=>({metric,x,y,w,h}));
export const ALL_LAYOUT=Object.keys(METRICS).map((metric,i)=>({metric,x:.025+(i%6)*.162,y:.16+Math.floor(i/6)*.235,w:.149,h:.205}));
export const cloneLayout=arr=>arr.map(x=>({...x}));
export function clampBox(v) {
 v.w=Math.max(.07,Math.min(.95,v.w));v.h=Math.max(.055,Math.min(.9,v.h));
 v.x=Math.max(0,Math.min(1-v.w,v.x));v.y=Math.max(0,Math.min(1-v.h,v.y));
 return v;
}
function roundRect(ctx,x,y,w,h,r,fill) {
 ctx.beginPath();ctx.roundRect(x,y,w,h,Math.min(r,h/3,w/3));ctx.fillStyle=fill;ctx.fill();
}
function textFit(ctx,txt,maxW,size,min=10) {
 let fs=size;
 while(fs>min){ctx.font=`700 ${fs}px Inter, 'Segoe UI', sans-serif`;if(ctx.measureText(txt).width<=maxW)break;fs-=2;}
 return fs;
}
export function renderHUD(canvas,layout,values,{theme='glass',opacity=.86,selected=-1,edit=false,ftp=220,background='transparent'}={}) {
 const ctx=canvas.getContext('2d',{alpha:true});const W=canvas.width,H=canvas.height,scale=W/1920;
 ctx.clearRect(0,0,W,H);
 if(background!=='transparent'){ctx.fillStyle=background;ctx.fillRect(0,0,W,H);}
 for(let i=0;i<layout.length;i++) {
  const item=layout[i];if(!METRICS[item.metric])continue;
  const [title,unit,defaultColor] = METRICS[item.metric];
  const x=item.x*W,y=item.y*H,w=item.w*W,h=item.h*H;
  let color=item.color||defaultColor;
  if(item.metric==='power3' && values?.power3!==null && values?.power3!==undefined && ftp>0 && item.colorMode!=='fixed'){
    const p=values.power3/ftp;
    color=p<.55?'#a9afb9':p<.75?'#5ec9ef':p<.9?'#74df93':p<1.05?'#f6d85c':p<1.2?'#f8a04b':'#ff6c8d';
  }
  ctx.save();
  const isMini=h<=100*H/1080;
  if(theme==='glass'){
    ctx.shadowColor='rgba(0,0,0,.23)';ctx.shadowBlur=18*scale;
    roundRect(ctx,x,y,w,h,18*scale,`rgba(13,20,30,${opacity})`);
    ctx.shadowBlur=0;
    ctx.strokeStyle='rgba(230,238,255,.12)';ctx.lineWidth=1*scale;
    ctx.beginPath();ctx.roundRect(x+.5*scale,y+.5*scale,w-1*scale,h-1*scale,17*scale);ctx.stroke();
  }else if(theme==='outline'){
    ctx.strokeStyle='rgba(245,249,255,.4)';ctx.lineWidth=2*scale;
    ctx.beginPath();ctx.roundRect(x+scale,y+scale,w-2*scale,h-2*scale,8*scale);ctx.stroke();
  }
  const inner=Math.max(10*scale,Math.min(24*scale,w*.08));
  const labelFs=Math.max(11*scale,Math.min(isMini?16*scale:21*scale,w*.09,h*.22));
  ctx.textAlign='left';ctx.textBaseline='middle';
  ctx.font=`600 ${labelFs}px Inter, 'Segoe UI', sans-serif`;
  ctx.fillStyle=theme==='outline'?'rgba(255,255,255,.95)':'#a7b7ca';
  const label=(item.label||title).toUpperCase();
  const showLabel=label.length>16?label.slice(0,16)+'…':label;
  ctx.fillText(showLabel,x+inner,y+(isMini?h*.30:h*.25),Math.max(12,w-2*inner));
  const val=formatValue(item.metric,values?.[item.metric]);
  const numberSize=textFit(ctx,val,w-inner*2-(unit?53*scale:0),Math.min(isMini?44*scale:85*scale,h*(isMini?.44:.46)),12*scale);
  const baseline=y+(isMini?h*.70:h*.65);
  ctx.textBaseline='middle';ctx.font=`750 ${numberSize}px Inter, 'Segoe UI', sans-serif`;
  ctx.fillStyle=color;ctx.fillText(val,x+inner,baseline,Math.max(10,w-inner*2));
  if(unit){
    const tw=ctx.measureText(val).width;
    const ux=Math.min(x+w-60*scale,x+inner+tw+9*scale);
    ctx.font=`500 ${Math.min(19*scale,h*.20)}px Inter, 'Segoe UI',sans-serif`;
    ctx.fillStyle='#bac5d6';ctx.fillText(unit,ux,baseline+5*scale,Math.max(5,x+w-inner-ux));
  }
  if(!isMini&&theme==='glass'){
    ctx.fillStyle='rgba(255,255,255,.12)';roundRect(ctx,x+inner,y+h-21*scale,w-inner*2,4*scale,4*scale,ctx.fillStyle);
    const pct=item.metric==='power3' && ftp>0&&values?.power3!=null?Math.min(1,values.power3/(ftp*1.6)):
      item.metric==='speed'&&values?.speed!=null?Math.min(1,values.speed/75):null;
    if(pct!==null)roundRect(ctx,x+inner,y+h-21*scale,(w-inner*2)*pct,4*scale,4*scale,color);
  }
  if(edit && i===selected){
    ctx.strokeStyle='#5adcff';ctx.lineWidth=3*scale;ctx.strokeRect(x,y,w,h);
    ctx.fillStyle='#5adcff';roundRect(ctx,x+w-15*scale,y+h-15*scale,15*scale,15*scale,2*scale,'#5adcff');
  }
  ctx.restore();
 }
}
