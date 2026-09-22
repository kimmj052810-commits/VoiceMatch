const songs = [
  {title:"새벽빛 (Original)", language:"한국어", genre:"발라드", key:0, bpm:76},
  {title:"여름 산책 (Original)", language:"한국어", genre:"팝", key:7, bpm:96},
  {title:"Sora Walk (Original)", language:"日本語", genre:"시티팝", key:2, bpm:92},
  {title:"Open Road (Original)", language:"English", genre:"Pop", key:9, bpm:100},
  {title:"Public-Domain Practice", language:"Instrumental", genre:"연습곡", key:0, bpm:80}
];

const NOTE_NAMES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const $=id=>document.getElementById(id);

const songSelect=$("songSelect"), transpose=$("transpose");
songs.forEach((s,i)=>{
  const o=document.createElement("option");
  o.value=i; o.textContent=`${s.title} · ${s.language}`;
  songSelect.appendChild(o);
});

function selectedSong(){return songs[Number(songSelect.value)]}
function currentKey(){return (selectedSong().key+Number(transpose.value)+120)%12}
function updateSongInfo(){
  const s=selectedSong();
  $("transposeValue").textContent=(Number(transpose.value)>0?"+":"")+transpose.value;
  $("songInfo").textContent=`${s.genre} · ${s.bpm} BPM · 현재 키 ${NOTE_NAMES[currentKey()]}`;
}
songSelect.onchange=updateSongInfo;
transpose.oninput=updateSongInfo;
updateSongInfo();

let audioCtx=null, master=null, timer=null;
const activeOsc=[];

function midiToFreq(m){return 440*Math.pow(2,(m-69)/12)}
function stopAccompaniment(){
  if(timer) clearTimeout(timer);
  timer=null;
  activeOsc.splice(0).forEach(o=>{try{o.stop()}catch{}});
  $("playBtn").textContent="▶ 반주 시작";
}
function chordLoop(index=0){
  if(!audioCtx || audioCtx.state==="closed") return;
  const s=selectedSong(), root=currentKey();
  const roots=[root,(root+5)%12,(root+7)%12,(root+2)%12];
  const r=roots[index%roots.length];
  const base=48+r;
  const now=audioCtx.currentTime;
  [0,4,7].forEach((d,j)=>{
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.type="triangle"; o.frequency.value=midiToFreq(base+d);
    g.gain.setValueAtTime(0.0001,now);
    g.gain.exponentialRampToValueAtTime(0.045,now+0.03);
    g.gain.exponentialRampToValueAtTime(0.0001,now+1.75);
    o.connect(g).connect(master); o.start(now); o.stop(now+1.8); activeOsc.push(o);
  });
  timer=setTimeout(()=>chordLoop(index+1),60000/s.bpm*2);
}
$("playBtn").onclick=async()=>{
  if(!audioCtx) audioCtx=new AudioContext();
  await audioCtx.resume();
  if(!master){master=audioCtx.createGain(); master.gain.value=.75; master.connect(audioCtx.destination)}
  stopAccompaniment();
  $("playBtn").textContent="▶ 재생 중";
  chordLoop();
};
$("stopBtn").onclick=stopAccompaniment;

let stream=null, analyser=null, raf=null, pitches=[], brightnesses=[], rmsValues=[];
const canvas=$("pitchCanvas"), ctx=canvas.getContext("2d");

function autoCorrelate(buf,sampleRate){
  let rms=0;
  for(let i=0;i<buf.length;i++) rms+=buf[i]*buf[i];
  rms=Math.sqrt(rms/buf.length);
  if(rms<0.012) return {freq:null,rms};
  let best=-1,bestCorr=0;
  for(let lag=20;lag<Math.min(1000,buf.length/2);lag++){
    let corr=0;
    for(let i=0;i<buf.length-lag;i++) corr+=buf[i]*buf[i+lag];
    corr/=buf.length-lag;
    if(corr>bestCorr){bestCorr=corr;best=lag}
  }
  const freq=best>0?sampleRate/best:null;
  return {freq:freq&&freq>60&&freq<1200?freq:null,rms};
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle="#21262d"; ctx.lineWidth=1;
  for(let y=20;y<canvas.height;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke()}
  if(pitches.length<2)return;
  ctx.strokeStyle="#58a6ff";ctx.lineWidth=2;ctx.beginPath();
  pitches.slice(-180).forEach((f,i)=>{
    const x=i/(179)*canvas.width;
    const midi=69+12*Math.log2(f/440);
    const y=canvas.height-((midi%24)/24)*canvas.height;
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  });
  ctx.stroke();
}

function noteName(freq){
  const midi=Math.round(69+12*Math.log2(freq/440));
  return NOTE_NAMES[(midi%12+12)%12]+(Math.floor(midi/12)-1);
}

function brightness(data){
  let sum=0,weighted=0;
  for(let i=0;i<data.length;i++){const v=data[i];sum+=v;weighted+=i*v}
  return sum?weighted/sum/(data.length-1):0;
}

function updateAnalysis(freq,rms,bright){
  $("freq").textContent=freq?`${freq.toFixed(1)} Hz`:"-";
  $("note").textContent=freq?noteName(freq):"-";
  $("rms").textContent=rms.toFixed(3);
  $("brightness").textContent=Math.round(bright*100)+"%";
  if(freq){pitches.push(freq);if(pitches.length>500)pitches.shift()}
  rmsValues.push(rms); if(rmsValues.length>500)rmsValues.shift();
  brightnesses.push(bright); if(brightnesses.length>500)brightnesses.shift();
  draw();
  updateResults();
}

function updateResults(){
  if(!pitches.length)return;
  const midi=pitches.map(f=>69+12*Math.log2(f/440));
  const min=Math.min(...midi),max=Math.max(...midi);
  $("rangeResult").textContent=`${NOTE_NAMES[((Math.round(min)%12)+12)%12]} ~ ${NOTE_NAMES[((Math.round(max)%12)+12)%12]}`;
  const mean=midi.reduce((a,b)=>a+b,0)/midi.length;
  const variance=midi.reduce((a,b)=>a+(b-mean)**2,0)/midi.length;
  const stability=Math.max(0,Math.min(100,100-Math.sqrt(variance)*12));
  $("stabilityResult").textContent=Math.round(stability)+"%";
  const b=brightnesses.reduce((a,v)=>a+v,0)/brightnesses.length;
  $("timbreResult").textContent=b>.55?"밝은 편":b>.35?"중간":"어두운 편";
  $("keyResult").textContent=estimateKey(midi);
  makeRecommendations();
  $("feedback").innerHTML=feedbackText(stability,b);
}

function estimateKey(midi){
  const bins=Array(12).fill(0);
  midi.forEach(m=>bins[((Math.round(m)%12)+12)%12]++);
  let idx=bins.indexOf(Math.max(...bins));
  return NOTE_NAMES[idx]+" 중심 추정";
}

function makeRecommendations(){
  const base=currentKey();
  const list=songs.map((s,i)=>{
    const dist=Math.min((s.key-base+12)%12,(base-s.key+12)%12);
    return {...s,i,dist};
  }).sort((a,b)=>a.dist-b.dist).slice(0,3);
  $("recommendations").innerHTML=list.map(s=>`<div class="rec"><strong>${s.title}</strong><br><span class="muted">${s.language} · ${s.genre} · 원키 ${NOTE_NAMES[s.key]} · 현재 키와 ${s.dist}반음 차이</span></div>`).join("");
}

function feedbackText(stability,b){
  const items=[];
  if(stability<60)items.push("음정이 흔들리는 구간이 있어, 한 음을 길게 유지하는 연습을 해보세요.");
  else items.push("현재 측정 구간에서는 음정이 비교적 안정적으로 감지됩니다.");
  if(b>.55)items.push("고주파 성분이 상대적으로 많아 밝은 음색으로 추정됩니다.");
  else if(b<.35)items.push("고주파 성분이 상대적으로 적어 부드럽거나 어두운 음색으로 추정됩니다.");
  else items.push("음색 밝기는 중간 범위로 추정됩니다.");
  items.push("다음 단계에서는 실제 멜로디와 비교해 '어디서 음이 낮거나 높은지'를 표시할 수 있습니다.");
  return items.map(x=>`• ${x}`).join("<br>");
}

async function startMic(){
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(!audioCtx)audioCtx=new AudioContext();
    const source=audioCtx.createMediaStreamSource(stream);
    analyser=audioCtx.createAnalyser();
    analyser.fftSize=2048;
    source.connect(analyser);
    const buf=new Float32Array(analyser.fftSize);
    const freqBuf=new Uint8Array(analyser.frequencyBinCount);
    const loop=()=>{
      analyser.getFloatTimeDomainData(buf);
      analyser.getByteFrequencyData(freqBuf);
      const r=autoCorrelate(buf,audioCtx.sampleRate);
      const br=brightness(freqBuf);
      updateAnalysis(r.freq,r.rms,br);
      raf=requestAnimationFrame(loop);
    };
    loop();
  }catch(e){
    $("feedback").textContent="마이크 권한을 허용할 수 없습니다. GitHub Pages(HTTPS)에서 다시 시도해 주세요.";
  }
}
function stopMic(){
  if(raf)cancelAnimationFrame(raf);
  if(stream)stream.getTracks().forEach(t=>t.stop());
  stream=null;analyser=null;
}
$("micBtn").onclick=startMic;
$("micStopBtn").onclick=stopMic;
