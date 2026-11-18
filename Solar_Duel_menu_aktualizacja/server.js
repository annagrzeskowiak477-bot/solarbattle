'use strict';
// SOLAR DUEL / mały serwer HTTP + WebSocket. Bez bazy danych.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, 'public');
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.ico':'image/x-icon'};
const threeModules = new Map([
  ['/vendor/three.module.js', path.join(__dirname, 'node_modules/three/build/three.module.js')],
  ['/vendor/three.core.js', path.join(__dirname, 'node_modules/three/build/three.core.js')]
]);
const server = http.createServer((req, res) => {
  const route = new URL(req.url, 'http://localhost').pathname;
  const vendorFile = threeModules.get(route);
  const file = vendorFile || path.join(ROOT, route === '/' ? 'index.html' : route);
  if (!vendorFile && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {'Content-Type': MIME[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(data);
  });
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
const players = new Map(); // lowercase nickname => player
const rooms = new Map();
const obstacleBoxes = [
  [-3, 3, -3, 3], [-19, -14, -7, -3], [14, 19, 3, 7],
  [-17, -13, 9, 13], [13, 17, -13, -9],
  [-6, -2, 13, 16], [2, 6, -16, -13],
  [-30, -24, -21, -16], [24, 30, 16, 21]
];
function send(p, message) {
  if (p?.ws?.readyState === 1) p.ws.send(JSON.stringify(message));
}
function safeName(input) { return typeof input === 'string' && /^[A-Za-z0-9_-]{3,18}$/.test(input) ? input : null; }
function peer(p) {
  const r = rooms.get(p.roomId);
  return r?.players.find(q => q !== p);
}
function broadcastOnline() {
  const list = [...players.values()].filter(p => !p.roomId).map(p => p.nick);
  for (const p of players.values()) send(p, {type:'online', names:list});
}
function removeRoom(p, reason='Gracz opuścił rozgrywkę.') {
  const room = rooms.get(p.roomId);
  if (!room) { p.roomId = null; return; }
  rooms.delete(room.id);
  for (const q of room.players) {
    q.roomId = null;
    q.hp = 100;
    q.score = 0;
    q.lastShot = 0;
    send(q, {type:'roomClosed', message:reason});
  }
  broadcastOnline();
}
function rayHitsOpponent(origin, dir, target, maxDist) {
  const v = [target.pos[0] - origin[0], 1.4 - origin[1], target.pos[2] - origin[2]];
  const projection = v[0]*dir[0] + v[1]*dir[1] + v[2]*dir[2];
  if (projection < 0 || projection > maxDist) return false;
  const dx = v[0]-dir[0]*projection, dy=v[1]-dir[1]*projection, dz=v[2]-dir[2]*projection;
  if (dx*dx + dy*dy + dz*dz > 0.72*0.72) return false;
  // Minimalna kontrola przeszkód: blokady AABB na wysokości linii strzału.
  for (const [x1,x2,z1,z2] of obstacleBoxes) {
    let tmin=0, tmax=projection;
    for (const [low,high,o,d] of [[x1,x2,origin[0],dir[0]],[z1,z2,origin[2],dir[2]]]) {
      if (Math.abs(d) < 1e-7) { if (o < low || o > high) { tmin=Infinity; break; } continue; }
      const a=(low-o)/d, b=(high-o)/d;
      tmin=Math.max(tmin,Math.min(a,b)); tmax=Math.min(tmax,Math.max(a,b));
    }
    if (tmax>=tmin && tmax>0 && tmin<projection && origin[1] + dir[1]*tmin < 3.5) return false;
  }
  return true;
}
function positionValid(pos) {
  return Array.isArray(pos) && pos.length === 3 && pos.every(n => Number.isFinite(n))
    && Math.abs(pos[0]) <= 34 && Math.abs(pos[2]) <= 34 && Math.abs(pos[1]) <= 4;
}
function createMatch(a,b) {
  const id=crypto.randomUUID();
  const room={id, players:[a,b]}; rooms.set(id,room);
  for (const [i,p] of room.players.entries()) {
    p.roomId=id; p.pendingFrom=null; p.hp=100; p.score=0;
    p.pos=i===0?[-20,0,0]:[20,0,0]; p.lastShot=0;
    send(p,{type:'start', nick:p.nick, opponent:room.players[1-i].nick, spawn:p.pos, otherSpawn:room.players[1-i].pos});
  }
  broadcastOnline();
}
function handle(p, m) {
  if (!m || typeof m !== 'object' || typeof m.type !== 'string') return;
  if (m.type === 'identify') {
    if (p.nick) return;
    const nick=safeName(m.nick);
    if (!nick) return send(p,{type:'error',message:'Nick: 3–18 znaków, litery bez polskich znaków, cyfry, _ lub -.'});
    if (players.has(nick.toLowerCase())) return send(p,{type:'error',message:'Ten nick jest już zajęty. Wybierz inny.'});
    p.nick=nick; players.set(nick.toLowerCase(),p);
    send(p,{type:'identified',nick}); broadcastOnline(); return;
  }
  if (!p.nick) return;
  if (m.type === 'invite') {
    if (p.roomId) return send(p,{type:'error',message:'Najpierw zakończ bieżący pojedynek.'});
    const name=safeName(m.to);
    const to=name && players.get(name.toLowerCase());
    if (!to || to===p) return send(p,{type:'error',message:'Nie znaleziono gracza o tym nicku.'});
    if (to.roomId) return send(p,{type:'error',message:'Ten gracz już jest w meczu.'});
    to.pendingFrom=p.nick.toLowerCase();
    send(to,{type:'invite',from:p.nick}); send(p,{type:'notice',message:`Zaproszenie wysłano do ${to.nick}.`}); return;
  }
  if (m.type === 'accept') {
    const from=typeof m.from==='string'?players.get(m.from.toLowerCase()):null;
    if (!from || p.pendingFrom!==from.nick.toLowerCase() || from.roomId || p.roomId) {
      return send(p,{type:'error',message:'Zaproszenie jest już nieaktualne.'});
    }
    return createMatch(from,p);
  }
  if (m.type === 'decline') {
    const from=players.get(p.pendingFrom); if(from)send(from,{type:'notice',message:`${p.nick} odrzucił zaproszenie.`});
    p.pendingFrom=null; return;
  }
  if (m.type === 'leave') return removeRoom(p,'Przeciwnik opuścił pojedynek.');
  if (!p.roomId || !rooms.has(p.roomId)) return;
  const other=peer(p); if(!other)return;
  if (m.type === 'state') {
    if (!positionValid(m.pos) || !Number.isFinite(m.yaw) || !Number.isFinite(m.pitch)) return;
    p.pos=m.pos.slice(0,3); p.yaw=m.yaw;
    p.weapon=['rifle','pistol','knife'].includes(m.weapon)?m.weapon:'rifle';
    send(other,{type:'state',pos:p.pos,yaw:p.yaw,pitch:m.pitch,weapon:p.weapon}); return;
  }
  if (m.type === 'fire') {
    const w=['rifle','pistol','knife'].includes(m.weapon)?m.weapon:'rifle';
    const info={rifle:[110,19,90],pistol:[300,32,75],knife:[650,48,2.9]}[w];
    const now=Date.now(); if(now-p.lastShot < info[0]-15)return;
    p.lastShot=now;
    if (!Array.isArray(m.dir) || m.dir.length!==3 || !m.dir.every(n=>Number.isFinite(n)))return;
    const mag=Math.hypot(...m.dir); if(mag<0.95 || mag>1.05)return;
    const dir=m.dir.map(v=>v/mag), origin=[p.pos[0],1.65,p.pos[2]];
    send(other,{type:'enemyShot',weapon:w,origin,dir});
    const hit=rayHitsOpponent(origin,dir,other,info[2]);
    if (!hit || other.hp<=0) return;
    other.hp=Math.max(0,other.hp-info[1]);
    send(other,{type:'damage',hp:other.hp,from:p.nick});
    send(p,{type:'hit',hp:other.hp});
    if (other.hp===0) {
      p.score++;
      const ended=p.score>=10;
      send(p,{type:'frag',score:p.score,enemyScore:other.score,ended,winner:p.nick});
      send(other,{type:'frag',score:other.score,enemyScore:p.score,ended,winner:p.nick});
      if (ended) { removeRoom(p,`${p.nick} wygrywa 1v1 (10 eliminacji)!`); return; }
      const index=rooms.get(p.roomId).players.indexOf(other);
      other.pos=index===0?[-20,0,0]:[20,0,0]; other.hp=100;
      send(other,{type:'respawn',pos:other.pos});
      send(p,{type:'enemyRespawn',pos:other.pos});
    }
  }
}
wss.on('connection', ws => {
  const p={ws,nick:null,roomId:null,pendingFrom:null,hp:100,score:0,pos:[0,0,0],lastShot:0,yaw:0,weapon:'rifle'};
  ws.on('message', raw => { try { handle(p,JSON.parse(raw.toString())); }catch(e){ /* zły pakiet -> pomiń */ } });
  ws.on('close',()=>{
    if(p.nick) {
      if(p.roomId) removeRoom(p,'Przeciwnik rozłączył się.');
      players.delete(p.nick.toLowerCase());broadcastOnline();
    }
  });
  ws.on('error',()=>{});
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Solar Duel: http://localhost:${PORT}`));
