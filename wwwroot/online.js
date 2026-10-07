'use strict';

// Online multiplayer extension. The original offline game remains intact in index.html.
const ONLINE_CONTINUOUS = new Set(['left', 'right', 'up', 'down']);
const ONLINE_KEY_ACTION = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'kick', KeyE: 'kick', KeyQ: 'switch',
  Digit1: 'select1', Digit2: 'select2', Digit3: 'select3', Digit4: 'select4'
};
const ONLINE_DISPLAY_MAP = { left:'ArrowLeft', right:'ArrowRight', up:'ArrowUp', down:'ArrowDown', kick:'Space', sw:'KeyQ' };
const online = {
  active:false, isHost:false, roomCode:'', seatId:'', connection:null, room:null,
  matchStarted:false, matchCfg:null, inputs:{}, remoteTarget:null,
  lastSnapshotMs:0, publishInFlight:false
};
function freshOnlineInput() { return { left:false, right:false, up:false, down:false }; }
function clearOnlineInputs() { online.inputs={P1:freshOnlineInput(),P2:freshOnlineInput(),P3:freshOnlineInput(),P4:freshOnlineInput()}; }
clearOnlineInputs();

function setOnlineStatus(id, text, error=false) {
  const el=$(id); if(!el) return; el.textContent=text||''; el.classList.toggle('error',!!error);
}
function onlineError(err) {
  const msg=err&&err.message ? err.message.replace(/^.*HubException:\s*/,'') : String(err||'Unknown error');
  setOnlineStatus(online.active?'lobbyStatus':'onlineMenuStatus',msg,true);
}
function normalizeRoomCode(v) { return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5); }
function onlinePlayerName() {
  const v=($('onlineName').value||'').trim().slice(0,14)||'Player';
  saveJSON('foosball.onlineName.v1',v); return v;
}

function registerOnlineHandlers(c) {
  c.on('LobbyUpdated', room => {
    if(!online.active || (online.roomCode && room.roomCode!==online.roomCode)) return;
    online.room=room; renderOnlineLobby(room);
  });
  c.on('MatchStarted', payload => beginOnlineMatch(payload));
  c.on('PlayerInput',(seatId,action,pressed)=>{ if(online.isHost) applyOnlineInput(seatId,action,pressed); });
  c.on('StateSnapshot',snapshot=>{ if(!online.isHost) applyOnlineSnapshot(snapshot); });
  c.on('PlayerLeft',seatId=>{
    if(online.isHost && seatId) online.inputs[seatId]=freshOnlineInput();
    if(online.matchStarted) toast(`${seatId||'A player'} disconnected`);
  });
  c.on('RoomClosed',message=>{
    const old=online.connection, msg=message||'Room closed.';
    resetOnlineState(); if(old) old.stop().catch(()=>{}); showMenu(); setOnlineStatus('onlineMenuStatus',msg,true);
  });
  c.onclose(()=>{
    if(!online.active) return;
    resetOnlineState(); showMenu(); setOnlineStatus('onlineMenuStatus','Connection to the game server was lost.',true);
  });
}
async function ensureOnlineConnection() {
  if(online.connection && online.connection.state===signalR.HubConnectionState.Connected) return online.connection;
  if(typeof signalR==='undefined') throw new Error('SignalR client failed to load.');
  const c=new signalR.HubConnectionBuilder().withUrl('/hubs/game').configureLogging(signalR.LogLevel.Warning).build();
  registerOnlineHandlers(c); await c.start(); online.connection=c; return c;
}
async function createOnlineRoom() {
  try {
    initAudio(); setOnlineStatus('onlineMenuStatus','Connecting…');
    const c=await ensureOnlineConnection();
    const result=await c.invoke('CreateRoom',onlinePlayerName(),$('onlineMode').value);
    online.active=true; online.isHost=true; online.roomCode=result.roomCode; online.seatId=result.seatId; online.room=result.room;
    renderOnlineLobby(result.room); history.replaceState(null,'',`?room=${result.roomCode}`);
  } catch(e) { onlineError(e); }
}
async function joinOnlineRoom() {
  try {
    initAudio(); const code=normalizeRoomCode($('onlineRoomCode').value);
    if(code.length!==5) throw new Error('Enter the 5-character room code.');
    setOnlineStatus('onlineMenuStatus','Connecting…');
    const c=await ensureOnlineConnection();
    const result=await c.invoke('JoinRoom',code,onlinePlayerName());
    online.active=true; online.isHost=result.isHost; online.roomCode=result.roomCode; online.seatId=result.seatId; online.room=result.room;
    renderOnlineLobby(result.room); history.replaceState(null,'',`?room=${result.roomCode}`);
  } catch(e) { onlineError(e); }
}
function renderOnlineLobby(room) {
  if(!online.active||!room) return;
  $('menu').classList.add('hidden'); $('onlineLobby').classList.remove('hidden');
  $('lobbyCode').textContent=room.roomCode;
  $('lobbyMode').textContent=room.mode==='1v1'?'⚔️ 1 v 1':'👥 2 v 2';
  $('lobbySeats').innerHTML=room.seats.map(s=>`<div class="lobbySeat"><span><b>${esc(s.id)}</b> · Team ${esc(s.team)} · ${esc(s.name)}</span><span class="${s.connected?'connected':'waiting'}">${s.connected?'● connected':'○ waiting'}</span></div>`).join('');
  $('hostLobbySettings').classList.toggle('hidden',!online.isHost);
  $('onlineStart').disabled=!room.canStart;
  setOnlineStatus('lobbyStatus',room.canStart?(online.isHost?'Everyone is in. Start when ready.':'Waiting for the host to start…'):`Waiting for players (${room.connectedPlayers}/${room.requiredPlayers})`);
}
async function startOnlineMatchFromLobby() {
  try {
    if(!online.isHost) return;
    await online.connection.invoke('StartMatch',online.roomCode,{target:+$('onlineTarget').value,auto:$('onlineAuto').checked,sound:$('onlineSound').checked});
  } catch(e) { onlineError(e); }
}
function beginOnlineMatch(payload) {
  online.matchStarted=true; online.remoteTarget=null; online.lastSnapshotMs=0; online.publishInFlight=false; clearOnlineInputs();
  const seats={P1:{name:'',type:'idle'},P2:{name:'',type:'idle'},P3:{name:'',type:'idle'},P4:{name:'',type:'idle'}};
  for(const s of payload.seats) seats[s.id]={name:s.name,type:'human'};
  online.matchCfg={mode:payload.mode,target:payload.target,level:'normal',auto:payload.auto,sound:payload.sound,seats};
  initAudio(); $('menu').classList.add('hidden'); $('onlineLobby').classList.add('hidden'); layout(); newMatch(online.matchCfg);
  for(const s of G.seats) if(s.type==='human') s.km=ONLINE_DISPLAY_MAP;
  toast(`ONLINE · ${online.seatId}${online.isHost?' · HOST':''}`);
}
async function restartOnlineMatch() {
  if(!online.isHost||!online.connection||!online.matchCfg) return;
  try { await online.connection.invoke('StartMatch',online.roomCode,{target:online.matchCfg.target,auto:online.matchCfg.auto,sound:online.matchCfg.sound}); }
  catch(e) { onlineError(e); }
}
async function leaveOnlineRoom() {
  const c=online.connection;
  try { if(c&&c.state===signalR.HubConnectionState.Connected) await c.invoke('LeaveRoom'); } catch(_) {}
  resetOnlineState(); try { if(c) await c.stop(); } catch(_) {}
  showMenu(); history.replaceState(null,'',location.pathname);
}
function resetOnlineState() {
  online.active=false; online.isHost=false; online.roomCode=''; online.seatId=''; online.room=null;
  online.matchStarted=false; online.matchCfg=null; online.remoteTarget=null; online.publishInFlight=false; online.connection=null; clearOnlineInputs();
  $('onlineLobby').classList.add('hidden');
}

function applyOnlineInput(seatId,action,pressed) {
  const input=online.inputs[seatId]||(online.inputs[seatId]=freshOnlineInput());
  if(ONLINE_CONTINUOUS.has(action)) { input[action]=pressed; return; }
  if(!pressed||!online.isHost||!online.matchStarted) return;
  const seat=seatById(seatId); if(!seat) return;
  if(action.startsWith('select')) {
    const idx=+action.slice(6)-1; if(idx>=0&&idx<seat.rods.length){seat.sel=idx;seat.manualT=1.5;} return;
  }
  const rod=G.rods[seat.rods[seat.sel]];
  if(action==='kick'&&(G.state==='play'||G.state==='ready')) startKick(rod);
  if(action==='switch'){seat.sel=(seat.sel+1)%seat.rods.length;seat.manualT=1.5;}
}
function sendOrApplyOnlineInput(action,pressed) {
  if(!online.active||!online.seatId) return;
  if(online.isHost) applyOnlineInput(online.seatId,action,pressed);
  else if(online.connection) online.connection.send('SendInput',online.roomCode,action,pressed).catch(onlineError);
}
function onlineKeyDown(e) {
  if(!online.active) return;
  e.stopImmediatePropagation();
  if(e.code==='KeyM'&&!e.repeat){e.preventDefault();leaveOnlineRoom();return;}
  if(e.code==='Backquote'&&!e.repeat){e.preventDefault();G.debug=!G.debug;return;}
  if(!online.matchStarted) return;
  if(online.isHost){
    if(e.code==='Escape'&&!e.repeat){e.preventDefault();G.paused=!G.paused;return;}
    if(e.code==='Backspace'&&!e.repeat){e.preventDefault();if(G.state==='replay')endReplay();else if(G.state==='play'){toast('Re-serve');serve();}return;}
    if(e.code==='KeyR'&&!e.repeat&&G.state==='over'){e.preventDefault();restartOnlineMatch();return;}
  }
  const action=ONLINE_KEY_ACTION[e.code]; if(!action) return;
  e.preventDefault(); if(e.repeat&&!ONLINE_CONTINUOUS.has(action)) return; sendOrApplyOnlineInput(action,true);
}
function onlineKeyUp(e) {
  if(!online.active) return;
  e.stopImmediatePropagation(); const action=ONLINE_KEY_ACTION[e.code];
  if(action&&ONLINE_CONTINUOUS.has(action)){e.preventDefault();sendOrApplyOnlineInput(action,false);}
}
window.addEventListener('keydown',onlineKeyDown,true);
window.addEventListener('keyup',onlineKeyUp,true);
window.addEventListener('blur',()=>{if(online.active)for(const a of ONLINE_CONTINUOUS)sendOrApplyOnlineInput(a,false);});

const offlineControlRods=controlRods;
controlRods=function(h){
  if(!online.active||!online.isHost) return offlineControlRods(h);
  const live=G.state==='play'||G.state==='ready';
  for(const s of G.seats){
    if(s.type==='human'){
      if(G.auto&&G.state==='play')autoSelect(s,h);
      const r=G.rods[s.rods[s.sel]],input=online.inputs[s.id]||freshOnlineInput();
      const mv=(input.right?1:0)-(input.left?1:0);
      if(mv){r.hold+=h;r.c+=mv*(SLIDE_MIN+(SLIDE_MAX-SLIDE_MIN)*Math.min(1,r.hold/0.25))*h;}else r.hold=0;
      const tilt=(input.up?1:0)-(input.down?1:0);
      if(tilt)r.ang=clamp(r.ang+tilt*(-r.dir)*ANG_RATE*h,-90,90);
    }else if(s.type==='bot'&&live){for(const ri of s.rods)botRod(G.rods[ri],h);}
  }
  for(const r of G.rods){
    r.c=clamp(r.c,r.min,r.max);r.vx=(r.c-r.lastC)/h;r.lastC=r.c;
    if(r.kick){r.kick.t+=h;if(r.kick.t>KICK_OUT+KICK_BACK)r.kick=null;}
    if(r.trapCd>0)r.trapCd-=h;
  }
};

function currentOnlineView(){
  if(G.state==='replay'&&G.replay){
    const R=G.replay;while(R.i<R.frames.length-1&&R.frames[R.i+1].t<=R.t)R.i++;
    const f=R.frames[R.i];return{bx:f.bx,by:f.by,rods:f.r.map(x=>[x[0],x[1]]),replay:true};
  }
  return{bx:G.ball.x,by:G.ball.y,rods:G.rods.map(r=>[r.c,rodAngle(r)]),replay:false};
}
function publishOnlineSnapshot(ts){
  if(!online.connection||online.publishInFlight||ts-online.lastSnapshotMs<50)return;
  online.lastSnapshotMs=ts;
  const snapshot={view:currentOnlineView(),state:G.state,paused:G.paused,score:{...G.score},target:G.target,touches:G.touches,mult:G.mult,winner:G.winner,banner:G.banner?{...G.banner}:null,shake:G.shake,ballPinned:!!G.ball.pin,selections:G.seats.map(s=>({id:s.id,sel:s.sel}))};
  online.publishInFlight=true;online.connection.send('PublishState',online.roomCode,snapshot).catch(()=>{}).finally(()=>online.publishInFlight=false);
}
function applyOnlineSnapshot(s){
  if(!s||!s.view)return;
  const prevState=G.state,prevA=G.score.A,prevB=G.score.B;
  online.remoteTarget={bx:s.view.bx,by:s.view.by,rods:s.view.rods.map(x=>[x[0],x[1]]),replay:!!s.view.replay};
  G.state=s.state;G.paused=!!s.paused;G.score=s.score||G.score;G.target=s.target||G.target;G.touches=s.touches||0;G.mult=s.mult||1;G.winner=s.winner||null;G.banner=s.banner||null;G.shake=s.shake||0;G.ball.pin=s.ballPinned?{remote:true}:null;
  if(G.score.A!==prevA||G.score.B!==prevB)sfx('goal');if(G.state==='over'&&prevState!=='over')sfx('win');
  if(Array.isArray(s.selections))for(const x of s.selections){const seat=seatById(x.id);if(seat)seat.sel=x.sel;}
}
function interpolateRemoteState(dt){
  const b=online.remoteTarget;if(!b)return;const k=1-Math.exp(-24*dt);
  G.ball.x+=(b.bx-G.ball.x)*k;G.ball.y+=(b.by-G.ball.y)*k;
  for(let i=0;i<G.rods.length&&i<b.rods.length;i++){const r=G.rods[i];r.kick=null;r.c+=(b.rods[i][0]-r.c)*k;r.ang+=(b.rods[i][1]-r.ang)*k;}
}

frame=function(ts){
  const dt=Math.min(0.05,(ts-lastTs)/1000||0);lastTs=ts;if(dt>0)G.fps=G.fps*0.95+(1/dt)*0.05;
  if(G.state!=='menu'){
    if(online.active&&!online.isHost)interpolateRemoteState(dt);
    else if(!G.paused){G.acc+=dt;while(G.acc>=STEP){fixedStep(STEP);G.acc-=STEP;}updateFx(dt);}
  }
  if(online.active&&online.isHost&&online.matchStarted)publishOnlineSnapshot(ts);
  render();requestAnimationFrame(frame);
};

$('onlineCreate').addEventListener('click',createOnlineRoom);
$('onlineJoin').addEventListener('click',joinOnlineRoom);
$('onlineStart').addEventListener('click',startOnlineMatchFromLobby);
$('onlineLeave').addEventListener('click',leaveOnlineRoom);
$('copyRoomLink').addEventListener('click',async()=>{
  const link=`${location.origin}${location.pathname}?room=${online.roomCode}`;
  try{await navigator.clipboard.writeText(link);setOnlineStatus('lobbyStatus','Invite link copied.');}
  catch(_){setOnlineStatus('lobbyStatus',link);}
});
$('onlineRoomCode').addEventListener('input',e=>e.target.value=normalizeRoomCode(e.target.value));
$('onlineName').value=loadJSON('foosball.onlineName.v1','');
const roomFromUrl=normalizeRoomCode(new URLSearchParams(location.search).get('room'));
if(roomFromUrl)$('onlineRoomCode').value=roomFromUrl;
