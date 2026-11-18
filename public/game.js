import * as THREE from '/vendor/three.module.js';

// SOLAR DUEL — prototyp strzelanki FPS 3D bez krwi.
// W trybie online klient wysyła ruch i próby strzału, a serwer rozlicza obrażenia.
const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const W = {rifle:{label:'KARABIN',size:30,interval:115,damage:19,reload:1850,spread:0.006},
           pistol:{label:'PISTOLET',size:15,interval:330,damage:32,reload:1350,spread:0.009},
           knife:{label:'NÓŻ',size:0,interval:670,damage:48,reload:0,spread:0}};
let mode='menu', socket=null, myNick='', inviteFrom='', onlineNames=[];
let player={pos:new THREE.Vector3(-20,0,0),yaw:-Math.PI/2,pitch:0,hp:100,kills:0,deaths:0,alive:true};
let enemy={pos:new THREE.Vector3(20,0,0),target:new THREE.Vector3(20,0,0),yaw:Math.PI/2,weapon:'rifle',hp:100,kills:0,alive:true,model:null, lastShot:0,strafe:1};
let weapon='rifle', ammo={rifle:30,pistol:15}, reloading=false, reloadAt=0, shootAt=0;
let velocityY=0, ground=true, moving=false, bob=0, recoil=0, muzzleUntil=0, prevTick=performance.now();
let lastNetwork=0, lastBotAttack=0, frames=0, fpsStart=performance.now(), toastTimeout=0, hitTimeout=0;
let keys=new Set(), pointerLocked=false, mouseDown=false, worldColliders=[], FX=[];
const scratchRay=new THREE.Raycaster(), aimDir=new THREE.Vector3(), bufV=new THREE.Vector3();
const qualityLevels={performance:{ratio:1,shadows:false,dust:55},balanced:{ratio:1.4,shadows:true,dust:180},cinematic:{ratio:2,shadows:true,dust:400}};
let cfg=qualityLevels.balanced, quality='balanced';

const scene = new THREE.Scene();
scene.background=new THREE.Color(0xa4c4d0); scene.fog=new THREE.FogExp2(0xc1c9c1,0.0072);
const camera = new THREE.PerspectiveCamera(76,innerWidth/innerHeight,0.045,260);
camera.rotation.order='YXZ'; camera.position.set(-20,1.68,0);
const renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',stencil:false,alpha:false});
renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio,1.4));
renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.34;renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
$('game').append(renderer.domElement);
scene.add(camera);
const sunLight=new THREE.DirectionalLight(0xffe1ac,3.5);
sunLight.position.set(-38,65,-49);sunLight.castShadow=true;
sunLight.shadow.mapSize.set(2048,2048);
sunLight.shadow.camera.left=-67;sunLight.shadow.camera.right=67;
sunLight.shadow.camera.top=67;sunLight.shadow.camera.bottom=-67;
sunLight.shadow.camera.near=1;sunLight.shadow.camera.far=160;
sunLight.shadow.bias=-0.0008;
scene.add(sunLight);
scene.add(new THREE.HemisphereLight(0xc9e7ff,0x675340,1.75));
const sunBall=new THREE.Mesh(new THREE.SphereGeometry(6,20,14),new THREE.MeshBasicMaterial({color:0xffe1a5,fog:false}));
sunBall.position.set(-100,132,-145);scene.add(sunBall);

const mats={
 concrete:new THREE.MeshStandardMaterial({color:0x8c9290,roughness:0.94}),
 dark:new THREE.MeshStandardMaterial({color:0x444e52,roughness:0.82,metalness:0.25}),
 metal:new THREE.MeshStandardMaterial({color:0x68737b,metalness:0.68,roughness:0.38}),
 sand:new THREE.MeshStandardMaterial({color:0x8b8371,roughness:0.97}),
 yellow:new THREE.MeshStandardMaterial({color:0xf2bc61,metalness:0.35,roughness:0.48}),
 rusty:new THREE.MeshStandardMaterial({color:0x98684e,metalness:0.55,roughness:0.64}),
 black:new THREE.MeshStandardMaterial({color:0x20292d,metalness:0.4,roughness:0.5}),
 visor:new THREE.MeshStandardMaterial({color:0x121c24,metalness:0.8,roughness:0.12}),
 cloth:new THREE.MeshStandardMaterial({color:0x455c50,roughness:0.95}),
 bot:new THREE.MeshStandardMaterial({color:0x936246,roughness:0.96})
};
function meshBox(w,h,d,mat,x=0,y=0,z=0,parent=scene) {
 const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function cyl(rt,rb,h,mat,x,y,z,parent=scene,seg=12){
 const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;
}
function trackBox(x1,x2,z1,z2,h=3.4){worldColliders.push({x1,x2,z1,z2,h});}
function addContainer(x1,x2,z1,z2,color=0){
 const x=(x1+x2)/2,z=(z1+z2)/2,w=x2-x1,d=z2-z1,h=3.5;
 const group=new THREE.Group();group.position.set(x,0,z);scene.add(group);
 const material=color?mats.rusty:mats.concrete;
 meshBox(w,h,d,material,0,h/2,0,group);
 for(let i=-w/2+.35;i<w/2;i+=.8) {
   meshBox(.11,h-.3,.07,mats.dark,i,h/2,d/2+.03,group);
   meshBox(.11,h-.3,.07,mats.dark,i,h/2,-d/2-.03,group);
 }
 meshBox(w+.18,.12,d+.18,mats.metal,0,h+.04,0,group);
 meshBox(w+.18,.12,d+.18,mats.dark,0,.08,0,group);
 for(const s of [-1,1])for(const t of [-1,1])cyl(.10,.10,h,mats.metal,s*(w/2-.16),h/2,t*(d/2-.16),group,8);
 trackBox(x1,x2,z1,z2,h);
}
function paintLines(){
 for(let x=-32;x<33;x+=8){meshBox(.09,.014,1.3,mats.yellow,x,.018,-27);meshBox(.09,.014,1.3,mats.yellow,x,.018,27);}
 for(let z=-30;z<31;z+=8)meshBox(1.3,.014,.085,mats.yellow,0,.017,z);
 for(const x of [-32.2,32.2])meshBox(.13,.014,62,mats.yellow,x,.018,0);
}
function buildArena(){
 const ground=meshBox(130,.35,130,mats.sand,0,-.2,0);ground.receiveShadow=true;ground.castShadow=false;
 meshBox(72,.045,72,mats.concrete,0,-.007,0).castShadow=false;
 paintLines();
 for(const x of [-36,36]){
   meshBox(1.1,8,74,mats.concrete,x,4,0);
   for(let z=-34;z<=34;z+=6)meshBox(1.6,8.6,1.6,mats.dark,x,4.3,z);
 }
 for(const z of [-36,36]){
   meshBox(74,8,1.1,mats.concrete,0,4,z);
   for(let x=-32;x<=32;x+=6)meshBox(1.4,8.6,1.6,mats.dark,x,4.3,z);
 }
 const items=[[-3,3,-3,3,0],[-19,-14,-7,-3,1],[14,19,3,7,1],[-17,-13,9,13,0],[13,17,-13,-9,0],[-6,-2,13,16,1],[2,6,-16,-13,1],[-30,-24,-21,-16,0],[24,30,16,21,0]];
 for(const [x1,x2,z1,z2,c] of items) addContainer(x1,x2,z1,z2,c);
 // Osłony, barykady i dekoracyjne detale.
 for(let j=0;j<2;j++)for(let i=0;i<4;i++){
   const s=i<2?-1:1;const x=s*(8+i%2*2),z=j?24:-24;
   cyl(.55,.58,1.2,mats.rusty,x,.62,z);cyl(.59,.59,.1,mats.metal,x,1.12,z);
   cyl(.59,.59,.1,mats.metal,x,.17,z);
 }
 for(let i=-2;i<=2;i++){
   meshBox(3.2,1.4,.8,mats.concrete,-26+i*2.15,.7,26).rotation.y=.13;
   meshBox(3.2,1.4,.8,mats.concrete,26+i*2.15,.7,-26).rotation.y=.13;
 }
 for(const x of [-25,25]) for(const z of [-28,28]) {
   cyl(.18,.18,7.2,mats.metal,x,3.6,z);
   const lamp=new THREE.Mesh(new THREE.BoxGeometry(1.8,.22,.8),new THREE.MeshStandardMaterial({color:0xe8dfb1,emissive:0xffd89b,emissiveIntensity:1.7}));
   lamp.position.set(x,7.1,z);scene.add(lamp);
 }
 // Odległe bryły budynków uzupełniają sylwetkę otoczenia.
 for(let i=0;i<35;i++){
   const a=i*2.3999,r=65+(i%6)*6,x=Math.cos(a)*r,z=Math.sin(a)*r;
   meshBox(7+(i%5)*2,9+(i%7)*5,8+(i%3)*2,i%3?mats.dark:mats.concrete,x,5+(i%7)*2.5,z);
 }
 // Jasne, półprzezroczyste pasma światła (stylizowana objętość powietrza).
 const shaftMat=new THREE.MeshBasicMaterial({color:0xffe2ae,side:THREE.DoubleSide,depthWrite:false,transparent:true,opacity:.045,blending:THREE.AdditiveBlending});
 for(let i=0;i<5;i++) {
   const beam=new THREE.Mesh(new THREE.ConeGeometry(8+i%3*2,88,32,1,true),shaftMat.clone());
   beam.position.set(-25+i*12,38,-21+i*9);beam.rotation.z=-0.37;beam.rotation.x=.16;
   scene.add(beam);
 }
 // Drobny pył zawieszony w świetle.
 const positions=new Float32Array(400*3);
 for(let i=0;i<400;i++){positions[i*3]=Math.random()*70-35;positions[i*3+1]=Math.random()*14+1;positions[i*3+2]=Math.random()*70-35;}
 const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));
 const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:0xffdfad,size:.078,transparent:true,opacity:.55,depthWrite:false}));
 dust.name='dust';scene.add(dust);
}
buildArena();

// Uproszczony model postaci: tułów, oporządzenie, hełm, kończyny i broń.
function buildCharacter(){
 const root=new THREE.Group();
 const waist=meshBox(.64,.45,.35,mats.black,0,.93,0,root);
 meshBox(.79,.86,.45,mats.bot,0,1.48,0,root);
 meshBox(.58,.55,.51,mats.dark,0,1.46,-.16,root);
 meshBox(.45,.18,.58,mats.black,0,1.43,-.47,root);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.3,14,10),mats.cloth);
 head.position.set(0,2.14,0);head.castShadow=true;root.add(head);
 const helmet=new THREE.Mesh(new THREE.SphereGeometry(.34,14,10,0,Math.PI*2,0,Math.PI*.62),mats.dark);
 helmet.position.set(0,2.22,0);helmet.castShadow=true;root.add(helmet);
 meshBox(.54,.17,.10,mats.visor,0,2.13,-.25,root);
 for(const side of [-1,1]) {
   const arm=meshBox(.22,.75,.27,mats.bot,side*.51,1.56,-.10,root);
   arm.rotation.x=-.22;meshBox(.25,.28,.28,mats.black,side*.51,1.23,-.16,root);
   meshBox(.27,.74,.29,mats.cloth,side*.2,.53,0,root);
   meshBox(.3,.2,.5,mats.black,side*.2,.11,-.13,root);
 }
 meshBox(.18,.17,.8,mats.black,.24,1.43,-.58,root);
 cyl(.047,.047,.70,mats.metal,.24,1.43,-1.12,root).rotation.x=Math.PI/2;
 root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 return root;
}
function makeWeaponModel(kind){
 const g=new THREE.Group();
 const bl=mats.black,mt=mats.metal,dk=mats.dark;
 if(kind==='rifle'){
   meshBox(.18,.24,.75,bl,0,-.04,-.16,g);
   meshBox(.26,.15,.31,dk,0,.07,-.22,g);
   meshBox(.14,.12,.50,mt,0,-.02,-.66,g);
   const barrel=cyl(.044,.044,.75,mt,0,-.04,-.93,g,10);barrel.rotation.x=Math.PI/2;
   meshBox(.23,.14,.38,bl,0,-.025,.38,g);
   meshBox(.12,.38,.13,bl,0,-.31,.01,g).rotation.x=-.22;
   meshBox(.12,.42,.17,mt,0,-.37,-.27,g).rotation.x=.22;
   meshBox(.08,.13,.2,mt,0,.20,-.09,g);
   meshBox(.18,.06,.08,bl,0,.20,-.4,g);
 }else if(kind==='pistol'){
   meshBox(.19,.16,.45,dk,0,.04,-.17,g);
   meshBox(.18,.12,.42,mt,0,.15,-.18,g);
   meshBox(.13,.36,.14,bl,0,-.18,.02,g).rotation.x=-.19;
   meshBox(.04,.08,.09,bl,0,.25,-.32,g);
 }else{
   meshBox(.10,.16,.46,bl,0,-.09,.14,g);
   meshBox(.05,.06,.62,mt,0,-.03,-.36,g);
   const tip=new THREE.Mesh(new THREE.ConeGeometry(.10,.20,4),mt);
   tip.rotation.x=-Math.PI/2;tip.position.set(0,-.03,-.77);g.add(tip);
   meshBox(.15,.10,.12,mt,0,-.06,-.03,g);
 }
 g.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
 return g;
}
const weaponModels={};
for(const k of Object.keys(W)){
 weaponModels[k]=makeWeaponModel(k);
 camera.add(weaponModels[k]);weaponModels[k].visible=k==='rifle';
}
const muzzle=new THREE.PointLight(0xffa548,0,5,2);muzzle.position.set(.3,-.2,-1.2);camera.add(muzzle);

function setQuality(which){
 quality=qualityLevels[which]?which:'balanced';cfg=qualityLevels[quality];
 renderer.setPixelRatio(Math.min(devicePixelRatio,cfg.ratio));
 renderer.shadowMap.enabled=cfg.shadows;sunLight.castShadow=cfg.shadows;
 sunLight.shadow.mapSize.set(which==='cinematic'?2048:1024,which==='cinematic'?2048:1024);
 sunLight.shadow.map?.dispose();sunLight.shadow.map=null;
 renderer.setSize(innerWidth,innerHeight);
 const dust=scene.getObjectByName('dust');if(dust)dust.geometry.setDrawRange(0,cfg.dust);
 $('qualityText').textContent=quality.toUpperCase();
}
$('quality').addEventListener('change',e=>setQuality(e.target.value));setQuality('balanced');
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

// Syntetyzowany dźwięk: huk, klik mechanizmu i krótki pogłos. Przeglądarka wymaga gestu użytkownika.
let audioCtx=null,noiseBuffer=null;
function audioInit(){
 if(audioCtx){if(audioCtx.state==='suspended')audioCtx.resume();return;}
 audioCtx=new (window.AudioContext||window.webkitAudioContext)();
 noiseBuffer=audioCtx.createBuffer(1,Math.floor(audioCtx.sampleRate*.55),audioCtx.sampleRate);
 const a=noiseBuffer.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;
}
function noiseBurst(freq,duration,vol,delay=0){
 if(!audioCtx)return;
 const t=audioCtx.currentTime+delay;
 const src=audioCtx.createBufferSource();src.buffer=noiseBuffer;
 const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(freq,t);
 filter.frequency.exponentialRampToValueAtTime(Math.max(200,freq*.3),t+duration);
 const gain=audioCtx.createGain();gain.gain.setValueAtTime(Math.max(.0001,vol),t);
 gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
 src.connect(filter).connect(gain).connect(audioCtx.destination);src.start(t);src.stop(t+duration+.01);
}
function tone(freq,duration,vol,type='sine',delay=0){
 if(!audioCtx)return;
 const t=audioCtx.currentTime+delay,osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
 osc.type=type;osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.15),t+duration);
 gain.gain.setValueAtTime(Math.max(.0001,vol),t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
 osc.connect(gain).connect(audioCtx.destination);osc.start(t);osc.stop(t+duration+.02);
}
function soundShot(kind,far=false){
 const v=far?.19:1;
 if(kind==='knife'){noiseBurst(2300,.15,.14*v);tone(300,.14,.045*v);return;}
 const pistol=kind==='pistol';
 noiseBurst(pistol?4200:3600,pistol?.17:.24,(pistol?.39:.48)*v);
 noiseBurst(1100,.38,.22*v,.016);tone(pistol?180:110,.23,.30*v,'triangle');
 noiseBurst(650,.34,.06*v,.13);tone(510,.04,.014*v,'square',.03);
}
function soundReload(){noiseBurst(3200,.075,.11);tone(640,.055,.07,'square',.09);noiseBurst(1900,.08,.07,.34);}
function soundHit(){tone(920,.05,.05,'triangle');tone(1400,.07,.04,'sine',.055);}
function soundDamage(){tone(83,.22,.15,'triangle');noiseBurst(550,.16,.13);}

function notify(text){
 const el=$('toast');el.textContent=text;el.style.opacity=1;clearTimeout(toastTimeout);
 toastTimeout=setTimeout(()=>el.style.opacity=0,3200);
}
function netSend(msg){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(msg));}
function connect(){
 const nick=$('nickname').value.trim();
 if(!/^[A-Za-z0-9_-]{3,18}$/.test(nick))return notify('Nick: 3–18 znaków (litery, cyfry, _ lub -).');
 if(socket){try{socket.close();}catch{}}
 const url=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws';
 $('onlineStatus').textContent='Łączenie...'; $('connect').disabled=true;
 socket=new WebSocket(url);
 socket.onopen=()=>netSend({type:'identify',nick});
 socket.onclose=()=>{ $('connect').disabled=false;$('sendInvite').disabled=true;$('onlineStatus').textContent='Serwer rozłączony';myNick='';if(mode==='online')finish('POŁĄCZENIE UTRACONE','Przeciwnik lub serwer rozłączył się.'); };
 socket.onerror=()=>notify('Błąd połączenia z serwerem.');
 socket.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}handleMessage(m)};
}
function handleMessage(m){
 switch(m.type){
 case 'identified': myNick=m.nick;$('connect').disabled=false;$('sendInvite').disabled=false;
  $('identityText').textContent='Zalogowano jako: '+myNick;$('onlineStatus').textContent='● ONLINE — możesz wysyłać zaproszenia';notify('Połączono jako '+myNick);break;
 case 'error':$('connect').disabled=false;notify(m.message);break;
 case 'notice':notify(m.message);break;
 case 'online':onlineNames=m.names||[];$('onlineNames').textContent='Dostępni: '+(onlineNames.filter(n=>n!==myNick).join(', ')||'na razie nikogo');break;
 case 'invite':inviteFrom=m.from;$('inviteName').textContent=m.from;$('invitePrompt').style.display='block';break;
 case 'start':$('invitePrompt').style.display='none';startGame('online',m.spawn,m.otherSpawn,m.opponent);break;
 case 'state':if(mode!=='online')break;enemy.target.set(...m.pos);enemy.yaw=m.yaw;enemy.weapon=m.weapon;break;
 case 'enemyShot':if(mode!=='online')break;remoteMuzzle(m);break;
 case 'hit':if(mode!=='online')break;feedbackHit();enemy.hp=m.hp;break;
 case 'damage':if(mode!=='online')break;player.hp=m.hp;updateHud();damageFeedback();if(player.hp<=0){player.alive=false;notify('Zostałeś wyeliminowany!');}break;
 case 'frag':if(mode!=='online')break;player.kills=m.score;enemy.kills=m.enemyScore;updateHud();if(m.ended)finish(m.winner===myNick?'ZWYCIĘSTWO!':'PORAŻKA',`${m.winner} zdobył 10 eliminacji.`);break;
 case 'respawn':if(mode!=='online')break;respawnPlayer(m.pos);break;
 case 'enemyRespawn':if(mode!=='online')break;enemy.pos.set(...m.pos);enemy.target.copy(enemy.pos);enemy.alive=true;break;
 case 'roomClosed':if(mode==='online')finish('KONIEC POJEDYNKU',m.message);break;
 }
}
$('connect').addEventListener('click',()=>{audioInit();connect();});
$('nickname').addEventListener('keydown',e=>{if(e.key==='Enter')connect();});
$('botStart').addEventListener('click',()=>{audioInit();startGame('bot',[-20,0,0],[20,0,0],'BOT-01');});
$('sendInvite').addEventListener('click',()=>{
 const to=$('inviteNick').value.trim();if(!to)return notify('Wpisz nick kolegi.');
 netSend({type:'invite',to});
});
$('acceptInvite').addEventListener('click',()=>{audioInit();netSend({type:'accept',from:inviteFrom});$('invitePrompt').style.display='none';});
$('declineInvite').addEventListener('click',()=>{netSend({type:'decline'});$('invitePrompt').style.display='none';});
$('backMenu').addEventListener('click',backToMenu);

function updateHud(){
 $('hp').innerHTML=Math.max(0,player.hp)+' <span style="font-size:18px">HP</span>';
 $('scoreText').textContent=`${player.kills} : ${enemy.kills}`;
 $('weaponName').textContent=W[weapon].label;
 $('ammo').textContent=weapon==='knife'?'∞':`${ammo[weapon]} / ∞`;
}
function equip(w){
 if(!W[w]||weapon===w)return;
 weapon=w;reloading=false;
 for(const [kind,model] of Object.entries(weaponModels))model.visible=kind===weapon;
 updateHud();
}
function startGame(kind,spawn,otherSpawn,enemyName){
 mode=kind;
 $('mainMenu').style.display='none';$('endPanel').style.display='none';$('hud').style.display='block';
 $('pauseTip').style.display='none';$('matchMode').textContent=kind==='bot'?'VS BOT':'1V1 ONLINE';
 player={pos:new THREE.Vector3(...spawn),yaw:spawn[0]<0?-Math.PI/2:Math.PI/2,pitch:0,hp:100,kills:0,deaths:0,alive:true};
 enemy={pos:new THREE.Vector3(...otherSpawn),target:new THREE.Vector3(...otherSpawn),yaw:spawn[0]<0?Math.PI/2:-Math.PI/2,weapon:'rifle',hp:100,kills:0,alive:true,model:enemy.model,lastShot:0,strafe:1,name:enemyName};
 if(!enemy.model){enemy.model=buildCharacter();scene.add(enemy.model);}
 enemy.model.visible=true;enemy.model.position.copy(enemy.pos);
 weapon='rifle';ammo={rifle:30,pistol:15};for(const k of Object.keys(W))weaponModels[k].visible=k==='rifle';
 reloading=false;ground=true;velocityY=0;mouseDown=false;
 keys.clear();updateHud();audioInit();
 camera.position.copy(player.pos).add(new THREE.Vector3(0,1.68,0));
 $('pauseTip').style.display='block';
 const lockAttempt=renderer.domElement.requestPointerLock?.();
 lockAttempt?.catch?.(()=>{$('pauseTip').style.display='block';});
 notify(kind==='bot'?'Trening z botem — do 10 eliminacji.':`1v1 z ${enemyName} — powodzenia!`);
}
function respawnPlayer(spawn){
 player.pos.set(...spawn);player.yaw=spawn[0]<0?-Math.PI/2:Math.PI/2;
 player.pitch=0;player.hp=100;player.alive=true;velocityY=0;ammo={rifle:30,pistol:15};
 updateHud();notify('ODRODZENIE');
}
function finish(title,detail){
 if(mode==='menu'||mode==='finished')return;
 mode='finished';mouseDown=false;keys.clear();
 document.exitPointerLock?.();$('endTitle').textContent=title;$('endDetail').textContent=detail;
 $('endPanel').style.display='flex';$('pauseTip').style.display='none';
}
function backToMenu(){
 if(mode==='online')netSend({type:'leave'});
 mode='menu';mouseDown=false;keys.clear();
 enemy.model&&(enemy.model.visible=false);$('endPanel').style.display='none';
 $('hud').style.display='none';$('mainMenu').style.display='flex';$('pauseTip').style.display='none';
}
function togglePause(){
 pointerLocked=document.pointerLockElement===renderer.domElement;
 $('pauseTip').style.display=!pointerLocked&&['bot','online'].includes(mode)?'block':'none';
 if(!pointerLocked)mouseDown=false;
}
document.addEventListener('pointerlockchange',togglePause);
$('pauseTip').addEventListener('click',()=>renderer.domElement.requestPointerLock());
renderer.domElement.addEventListener('click',()=>{
 if(['bot','online'].includes(mode)&&!pointerLocked)renderer.domElement.requestPointerLock();
});
window.addEventListener('blur',()=>{mouseDown=false;keys.clear();});
window.addEventListener('keydown',e=>{
 if(!['bot','online'].includes(mode))return;
 if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
 keys.add(e.code);
 if(e.repeat)return;
 if(e.code==='Digit1')equip('rifle');if(e.code==='Digit2')equip('pistol');if(e.code==='Digit3')equip('knife');
 if(e.code==='KeyR')reload();
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('mousedown',e=>{if(e.button===0&&pointerLocked)mouseDown=true;});
window.addEventListener('mouseup',e=>{if(e.button===0)mouseDown=false;});
window.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('mousemove',e=>{
 if(!pointerLocked||!player.alive)return;
 player.yaw-=e.movementX*.00225;
 player.pitch=clamp(player.pitch-e.movementY*.00225,-1.43,1.43);
});
function reload(){
 if(weapon==='knife'||reloading||ammo[weapon]===W[weapon].size||!player.alive)return;
 reloading=true;reloadAt=performance.now()+W[weapon].reload;soundReload();notify('Przeładowywanie...');
}
function collideMove(pos,rad=.36){
 pos.x=clamp(pos.x,-34.7+rad,34.7-rad);pos.z=clamp(pos.z,-34.7+rad,34.7-rad);
 for(const b of worldColliders){
   const nx=clamp(pos.x,b.x1,b.x2),nz=clamp(pos.z,b.z1,b.z2);
   const dx=pos.x-nx,dz=pos.z-nz,dist=Math.hypot(dx,dz);
   if(dist<rad){
     if(dist>1e-5){pos.x+=(dx/dist)*(rad-dist);pos.z+=(dz/dist)*(rad-dist);}
     else {const sides=[Math.abs(pos.x-b.x1),Math.abs(pos.x-b.x2),Math.abs(pos.z-b.z1),Math.abs(pos.z-b.z2)];
       const min=Math.min(...sides),i=sides.indexOf(min);
       if(i===0)pos.x=b.x1-rad;else if(i===1)pos.x=b.x2+rad;
       else if(i===2)pos.z=b.z1-rad;else pos.z=b.z2+rad;
     }
   }
 }
}
function showTracer(start,end,color=0xffd494){
 const lineStart=start.clone(),lineEnd=end.clone();
 const geo=new THREE.BufferGeometry().setFromPoints([lineStart,lineEnd]);
 const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity:.65,depthWrite:false}));
 line.userData.exp=performance.now()+95;scene.add(line);FX.push(line);
}
function spark(pos){
 for(let i=0;i<5;i++){
   const m=new THREE.Mesh(new THREE.SphereGeometry(.025+Math.random()*.03,5,4),new THREE.MeshBasicMaterial({color:0xffdc82,transparent:true}));
   m.position.copy(pos);m.userData.exp=performance.now()+260+Math.random()*150;
   m.userData.vel=new THREE.Vector3((Math.random()-.5)*3,Math.random()*3,(Math.random()-.5)*3);
   scene.add(m);FX.push(m);
 }
}
function feedbackHit(){
 $('crosshair').classList.add('hit');$('hitNotice').style.opacity=1;soundHit();
 clearTimeout(hitTimeout);hitTimeout=setTimeout(()=>{$('crosshair').classList.remove('hit');$('hitNotice').style.opacity=0;},135);
}
function damageFeedback(){
 $('damageOverlay').style.opacity='.8';soundDamage();
 setTimeout(()=>$('damageOverlay').style.opacity='0',90);
}
function hitsCover(from,dir,maxDistance=90){
 scratchRay.set(from,dir);scratchRay.far=maxDistance;
 // Prawdziwe obiekty osłon są oznaczone prostymi bryłami — szybkie testy AABB.
 let near=Infinity;
 for(const b of worldColliders){
  let t0=0,t1=maxDistance;
  const ranges=[[b.x1,b.x2,from.x,dir.x],[0,b.h,from.y,dir.y],[b.z1,b.z2,from.z,dir.z]];
  for(const [lo,hi,o,d] of ranges){
   if(Math.abs(d)<1e-8){if(o<lo||o>hi){t0=Infinity;break;}continue;}
   let a=(lo-o)/d,c=(hi-o)/d;if(a>c)[a,c]=[c,a];t0=Math.max(t0,a);t1=Math.min(t1,c);
  }
  if(t1>=t0&&t0<near&&t1>=0)near=t0;
 }
 return near;
}
function shoot(){
 if(!player.alive||reloading||!pointerLocked)return;
 const now=performance.now(),spec=W[weapon];
 if(now-shootAt<spec.interval)return;
 if(weapon!=='knife' && ammo[weapon]<=0){reload();return;}
 shootAt=now;if(weapon!=='knife')ammo[weapon]--;
 const from=camera.position.clone();camera.getWorldDirection(aimDir);const dir=aimDir.clone();
 if(weapon==='rifle'||weapon==='pistol'){
   dir.x+=(Math.random()-.5)*spec.spread;dir.y+=(Math.random()-.5)*spec.spread;
   dir.z+=(Math.random()-.5)*spec.spread;dir.normalize();
 }
 const range=weapon==='knife'?2.9:90;
 const coverDist=hitsCover(from,dir,range);
 const ray=new THREE.Ray(from,dir), targetPoint=new THREE.Vector3(), enemyCenter=enemy.pos.clone().add(new THREE.Vector3(0,1.45,0));
 ray.closestPointToPoint(enemyCenter,targetPoint);
 const eDist=from.distanceTo(targetPoint), eHit=targetPoint.distanceTo(enemyCenter)<.72 && eDist<range && eDist<coverDist;
 if(mode==='bot'&&enemy.alive&&eHit){
   enemy.hp=Math.max(0,enemy.hp-spec.damage);feedbackHit();spark(targetPoint);
   if(enemy.hp<=0){enemy.alive=false;enemy.model.visible=false;player.kills++;updateHud();notify('ELIMINACJA +1');
     if(player.kills>=10){finish('WYGRANA!','Pokonałeś bota — 10 eliminacji.');}
     else setTimeout(()=>{if(mode==='bot'){enemy.pos.set(20,0,0);enemy.target.copy(enemy.pos);enemy.hp=100;enemy.alive=true;enemy.model.visible=true;}},2400);
   }
 }
 const end=from.clone().addScaledVector(dir,eHit?eDist:Math.min(range,coverDist));
 if(weapon!=='knife'){
   showTracer(from.clone().addScaledVector(dir,1.1),end);
   if(Number.isFinite(coverDist)&&coverDist<range&&!eHit)spark(end);
   muzzleUntil=now+62;recoil+=weapon==='rifle'?.085:.16;
 }
 soundShot(weapon);updateHud();
 if(mode==='online')netSend({type:'fire',weapon,dir:[dir.x,dir.y,dir.z]});
}
function remoteMuzzle(m){
 soundShot(m.weapon,true);
 const p=new THREE.Vector3(...m.origin),d=new THREE.Vector3(...m.dir);
 if(m.weapon!=='knife')showTracer(p,p.clone().addScaledVector(d,45),0xff9060);
}
function botTick(dt,now){
 if(!enemy.alive||!player.alive)return;
 const toPlayer=player.pos.clone().sub(enemy.pos);toPlayer.y=0;const dist=toPlayer.length();
 enemy.yaw=Math.atan2(-toPlayer.x,-toPlayer.z);
 const canSee=hitsCover(enemy.pos.clone().add(new THREE.Vector3(0,1.5,0)),toPlayer.clone().normalize(),dist) >= dist-.1;
 if(dist>11){const toward=toPlayer.clone().normalize().multiplyScalar(dt*2.65);enemy.pos.add(toward);}
 if(dist<8){const away=toPlayer.clone().normalize().multiplyScalar(dt*1.4);enemy.pos.sub(away);}
 const strafe=new THREE.Vector3(-toPlayer.z,0,toPlayer.x).normalize().multiplyScalar(dt*.95*enemy.strafe);
 if(Math.random()<.004)enemy.strafe*=-1;
 enemy.pos.add(strafe);collideMove(enemy.pos,.4);enemy.target.copy(enemy.pos);
 if(canSee&&dist<39&&now-lastBotAttack>650){
  lastBotAttack=now;soundShot('rifle',true);
  const bulletFrom=enemy.pos.clone().add(new THREE.Vector3(0,1.6,0));
  showTracer(bulletFrom,player.pos.clone().add(new THREE.Vector3(0,1.65,0)),0xffad72);
  if(Math.random()<.50){player.hp=Math.max(0,player.hp-8);damageFeedback();updateHud();
   if(player.hp===0){player.alive=false;enemy.kills++;notify('BOT zdobył eliminację!');updateHud();
    if(enemy.kills>=10){finish('PRZEGRANA','Bot zdobył 10 eliminacji.');}
    else setTimeout(()=>{if(mode==='bot')respawnPlayer([-20,0,0]);},2300);
   }
  }
 }
}
function updateMovement(dt){
 if(!player.alive)return;
 let fw=0,side=0;
 if(keys.has('KeyW')||keys.has('ArrowUp'))fw++;
 if(keys.has('KeyS')||keys.has('ArrowDown'))fw--;
 if(keys.has('KeyD')||keys.has('ArrowRight'))side++;
 if(keys.has('KeyA')||keys.has('ArrowLeft'))side--;
 const speed=keys.has('ShiftLeft')?10.5:6.8;
 const l=Math.hypot(fw,side);moving=l>0;
 if(l){fw/=l;side/=l;
   const fx=-Math.sin(player.yaw),fz=-Math.cos(player.yaw),rx=Math.cos(player.yaw),rz=-Math.sin(player.yaw);
   player.pos.x+=(fw*fx+side*rx)*speed*dt;player.pos.z+=(fw*fz+side*rz)*speed*dt;
   collideMove(player.pos);
   bob+=dt*(keys.has('ShiftLeft')?16:11);
 }
 if(ground&&keys.has('Space')){velocityY=7;ground=false;}
 if(!ground){velocityY-=20*dt;player.pos.y+=velocityY*dt;if(player.pos.y<=0){player.pos.y=0;ground=true;velocityY=0;}}
}
function animate(now){
 requestAnimationFrame(animate);
 const dt=Math.min((now-prevTick)/1000,.055);prevTick=now;
 const playing=['bot','online'].includes(mode);
 if(playing){
   // Przy ESC gra pokazuje kursor; animacja i synchronizacja wciąż działają.
   updateMovement(dt);
   camera.position.set(player.pos.x,player.pos.y+1.68+(moving&&ground?Math.sin(bob)*.025:0),player.pos.z);
   camera.rotation.y=player.yaw;camera.rotation.x=player.pitch;
   for(const [k,m] of Object.entries(weaponModels)){
    if(!m.visible)continue;
    const sway=moving?Math.sin(bob)*.015:0;
    m.position.set(k==='knife'?.51:.38+sway,-.32+Math.abs(sway),-.7+recoil*.45);
    m.rotation.set(-.08-recoil*.48,k==='knife'?.05:-.06,Math.sin(bob)*.012);
   }
   recoil=THREE.MathUtils.damp(recoil,0,18,dt);
   muzzle.intensity=now<muzzleUntil?5:0;
   if(reloading&&now>=reloadAt){ammo[weapon]=W[weapon].size;reloading=false;updateHud();}
   if(mouseDown&&pointerLocked)shoot();
   if(mode==='bot')botTick(dt,now);
   if(enemy.model){
     if(mode==='online')enemy.pos.lerp(enemy.target,Math.min(1,dt*14));
     enemy.model.position.copy(enemy.pos);enemy.model.rotation.y=enemy.yaw;
     enemy.model.visible=enemy.alive;
   }
   if(mode==='online'&&now-lastNetwork>=33){
     lastNetwork=now;
     netSend({type:'state',pos:[player.pos.x,player.pos.y,player.pos.z],yaw:player.yaw,pitch:player.pitch,weapon});
   }
 }
 for(let i=FX.length-1;i>=0;i--){
   const f=FX[i];if(f.userData.exp<now){scene.remove(f);f.geometry.dispose();f.material.dispose();FX.splice(i,1);}
   else if(f.userData.vel){f.position.addScaledVector(f.userData.vel,dt);f.userData.vel.y-=dt*8;f.material.opacity=clamp((f.userData.exp-now)/400,0,1);}
 }
 renderer.render(scene,camera);
 frames++;if(now-fpsStart>550){
   $('fps').textContent=`FPS ${Math.round(frames*1000/(now-fpsStart))}`;fpsStart=now;frames=0;
 }
}
requestAnimationFrame(animate);
