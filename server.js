const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomInt } = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
const rooms = new Map();
const prompts = [
  'What would a penguin pack for a beach vacation?',
  'Invent a terrible name for a tiny dragon.',
  'What is the least helpful superpower?',
  'What would a cloud say after bumping into a mountain?',
  'Name a very suspicious flavor of ice cream.',
  'What does a robot dream about on its day off?',
  'What should you never hear from your toaster?',
  'Describe a llama entering a talent show.',
  'What is the worst possible name for a boat?',
  'What would a squirrel put in a tiny diary?',
  'Invent a new holiday for people who love naps.',
  'What could make a goldfish feel like a genius?',
  'What is a wizard’s most boring spell?',
  'What would be a silly password for a pirate?',
  'What does a dinosaur order at a café?',
  'Name a job that would be tricky for a kangaroo.',
  'What should a moon museum display?',
  'What is the funniest thing to find in a backpack?',
  'What would a ghost be afraid of?',
  'Give a name to a very slow race car.'
];
const timers = { answer: 45, vote: 30, reveal: 8 };

function code() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out;
  do { out = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join(''); }
  while (rooms.has(out));
  return out;
}
function publicRoom(room, playerId) {
  const me = room.players.find(p => p.id === playerId);
  const players = room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected, host: p.id === room.hostId, spectator: !!p.spectator, submitted: room.submissions.has(p.id), voted: room.votes.has(p.id) }));
  const answers = room.phase === 'vote' || room.phase === 'reveal' || room.phase === 'score' || room.phase === 'finished'
    ? room.answerOrder.map(id => ({ id, text: room.submissions.get(id)?.text || '', author: room.phase === 'vote' ? null : room.submissions.get(id)?.name || 'Player', votes: [...room.votes.values()].filter(v => v === id).length })) : [];
  const voters = room.phase === 'vote' ? [...room.votes.keys()] : [];
  return { code: room.code, phase: room.phase, round: room.round, prompt: room.prompt, deadline: room.deadline, players, me: me ? { id: me.id, name: me.name } : null, answers, myVote: room.votes.get(playerId) || null, scores: room.players.map(p => ({ id: p.id, name: p.name, score: room.scores.get(p.id) || 0 })).sort((a,b) => b.score-a.score || a.name.localeCompare(b.name)), answered: room.submissions.size, voted: room.votes.size, voters, winnerIds: room.winnerIds || [], error: room.error || null };
}
function beginRound(room) {
  room.phase = 'answer'; room.submissions = new Map(); room.votes = new Map(); room.answerOrder = []; room.prompt = room.usedPrompts.pop();
  room.deadline = Date.now() + timers.answer * 1000;
}
function transition(room) {
  if (room.phase === 'answer') {
    // Players who missed the answer still get to see and vote on the answers that arrived.
    room.answerOrder = [...room.submissions.keys()];
    for (let i = room.answerOrder.length - 1; i > 0; i--) { const j = randomInt(i + 1); [room.answerOrder[i], room.answerOrder[j]] = [room.answerOrder[j], room.answerOrder[i]]; }
    room.phase = 'vote'; room.deadline = Date.now() + timers.vote * 1000;
    if (room.answerOrder.length === 0) finishVoting(room);
  } else if (room.phase === 'vote') finishVoting(room);
  else if (room.phase === 'reveal') {
    room.phase = 'score'; room.deadline = Date.now() + timers.reveal * 1000;
  } else if (room.phase === 'score') {
    if (room.round >= 5) {
      room.phase = 'finished'; room.deadline = null;
      const max = Math.max(0, ...room.scores.values()); room.winnerIds = room.players.filter(p => (room.scores.get(p.id) || 0) === max).map(p => p.id);
    } else { room.round++; beginRound(room); }
  }
}
function finishVoting(room) {
  for (const [answerId] of room.submissions) room.scores.set(room.submissions.get(answerId).playerId, (room.scores.get(room.submissions.get(answerId).playerId) || 0) + [...room.votes.values()].filter(v => v === answerId).length);
  room.phase = 'reveal'; room.deadline = Date.now() + timers.reveal * 1000;
}
setInterval(() => { for (const room of rooms.values()) {
  for (const p of room.players) if (p.connected && Date.now() - p.lastSeen > 5000) p.connected = false;
  if (!room.players.find(p => p.id === room.hostId)?.connected) { const next = room.players.find(p => p.connected); if (next) room.hostId = next.id; }
  if (room.deadline && Date.now() >= room.deadline) transition(room);
} }, 200);

const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml' };
function send(res, status, data) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control':'no-store', 'access-control-allow-origin':'*' }); res.end(JSON.stringify(data)); }
async function body(req) { let s=''; for await (const chunk of req) s += chunk; try { return JSON.parse(s || '{}'); } catch { return {}; } }
function fail(res, message, status=400) { send(res,status,{error:message}); }
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'OPTIONS') { res.writeHead(204, {'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'}); return res.end(); }
  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const room=rooms.get((url.searchParams.get('code')||'').toUpperCase()); if (!room) return fail(res,'That room is no longer available.',404);
      const playerId=url.searchParams.get('player'); if (!room.players.some(p=>p.id===playerId)) return fail(res,'Your seat is no longer in this room.',404);
      const p=room.players.find(p=>p.id===playerId); p.connected=true; p.lastSeen=Date.now(); return send(res,200,publicRoom(room,playerId));
    }
    if (req.method !== 'POST') return fail(res,'Use POST for game actions.',405);
    const data=await body(req); const action=url.pathname.slice(5);
    if (action==='create') {
      const name=String(data.name||'').trim().slice(0,18); if (!name) return fail(res,'Enter a name to create a room.');
      const id=randomUUID(), roomCode=code(), player={id,name,connected:true,lastSeen:Date.now()};
      const room={code:roomCode,hostId:id,players:[player],phase:'lobby',round:0,prompt:'',deadline:null,submissions:new Map(),votes:new Map(),answerOrder:[],scores:new Map([[id,0]]),usedPrompts:[],winnerIds:[]}; rooms.set(roomCode,room);
      return send(res,200,{code:roomCode,playerId:id,state:publicRoom(room,id)});
    }
    if (action==='join' || action==='reconnect') {
      const roomCode=String(data.code||'').toUpperCase(), room=rooms.get(roomCode); if (!room) return fail(res,'Room code not found. Check it and try again.',404);
      const existing=room.players.find(p=>p.id===data.playerId);
      if (action==='reconnect' && existing) { existing.connected=true; existing.lastSeen=Date.now(); return send(res,200,{code:roomCode,playerId:existing.id,state:publicRoom(room,existing.id)}); }
      if (action==='reconnect') return fail(res,'Your seat could not be restored. Join as a new player.',404);
      const name=String(data.name||'').trim().slice(0,18); if (!name) return fail(res,'Enter a name to join.');
      if (room.players.length>=8) return fail(res,'This room is full (8 players).');
      const player={id:randomUUID(),name,connected:true,lastSeen:Date.now(),spectator:room.phase!=='lobby'}; room.players.push(player); room.scores.set(player.id,0);
      return send(res,200,{code:roomCode,playerId:player.id,state:publicRoom(room,player.id)});
    }
    const room=rooms.get(String(data.code||'').toUpperCase()); if(!room) return fail(res,'Room not found.',404);
    const player=room.players.find(p=>p.id===data.playerId); if(!player) return fail(res,'Player seat not found.',404); player.connected=true; player.lastSeen=Date.now();
    if (action==='start') {
      if(room.hostId!==player.id) return fail(res,'Only the host can start the game.');
      if(room.phase!=='lobby') return fail(res,'A game is already in progress.');
      if(room.players.filter(p=>p.connected).length<3) return fail(res,'You need at least 3 connected players to start.');
      room.round=1; room.scores=new Map(room.players.map(p=>[p.id,0])); room.usedPrompts=[...prompts]; for(let i=room.usedPrompts.length-1;i>0;i--){const j=randomInt(i+1);[room.usedPrompts[i],room.usedPrompts[j]]=[room.usedPrompts[j],room.usedPrompts[i]];} beginRound(room);
    } else if(action==='submit') {
      if(player.spectator) return fail(res,'You joined during the game. Play when the host starts the next game.');
      if(room.phase!=='answer') return fail(res,'The answer round has ended.');
      if(room.submissions.has(player.id)) return fail(res,'Your answer is already locked in.');
      const text=String(data.text||'').trim().replace(/\s+/g,' ').slice(0,100); if(!text) return fail(res,'Write a short answer first.');
      room.submissions.set(player.id,{id:player.id,playerId:player.id,name:player.name,text});
      if(room.submissions.size>=room.players.filter(p=>p.connected).length) { room.deadline=Math.min(room.deadline,Date.now()+900); }
    } else if(action==='vote') {
      if(player.spectator) return fail(res,'You joined during the game. Play when the host starts the next game.');
      if(room.phase!=='vote') return fail(res,'Voting is closed.');
      if(room.votes.has(player.id)) return fail(res,'Your vote is already locked in.');
      if(!room.submissions.has(data.answerId)) return fail(res,'That answer is not available.');
      room.votes.set(player.id,data.answerId);
      if(room.votes.size>=room.players.filter(p=>p.connected).length) room.deadline=Math.min(room.deadline,Date.now()+900);
    } else if(action==='new-game') {
      if(room.hostId!==player.id) return fail(res,'Only the host can start a new game.');
      if(room.phase!=='finished') return fail(res,'Finish this game before starting another.');
      for (const p of room.players) p.spectator = false;
      room.phase='lobby'; room.round=0; room.prompt=''; room.deadline=null; room.winnerIds=[]; room.submissions.clear(); room.votes.clear(); room.answerOrder=[]; room.scores=new Map(room.players.map(p=>[p.id,0]));
    } else if(action==='leave') {
      player.connected=false; player.lastSeen=Date.now();
      const connected=room.players.filter(p=>p.connected); if(room.hostId===player.id && connected.length) room.hostId=connected[0].id;
      return send(res,200,{ok:true});
    } else return fail(res,'Unknown action.',404);
    send(res,200,{state:publicRoom(room,player.id)}); return;
  }
  let pathname=decodeURIComponent(url.pathname); if(pathname==='/') pathname='/index.html';
  const filepath=path.resolve(PUBLIC,'.'+pathname); if(!filepath.startsWith(PUBLIC+path.sep) && filepath!==PUBLIC) {res.writeHead(403);return res.end('Forbidden');}
  fs.readFile(filepath,(err,buf)=>{if(err){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'content-type':mime[path.extname(filepath)]||'application/octet-stream','cache-control':'no-cache'});res.end(buf);});
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Quickdraw is ready at http://localhost:${PORT}`));
