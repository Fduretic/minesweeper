import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const env = { ...process.env, POSTGRES_PASSWORD: 'local-verification-only' };
const compose = (project, ...args) => execFileSync('docker', ['compose', '-p', project, ...args], { env, encoding:'utf8', timeout:180000 });
const sql = (project, query) => compose(project, 'exec','-T','database','psql','-U','app','-d','app','-Atc',query).trim();
const base = project => {
  const container = compose(project,'ps','-q','web').trim();
  const info = JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
  return 'http://' + Object.values(info.NetworkSettings.Networks)[0].IPAddress;
};
const project = 'arcade-check';
let url = base(project);
async function api(path, body, expected=body === undefined ? 200 : 201) {
  const r = await fetch(url + '/api' + path,{method:body === undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body === undefined?undefined:JSON.stringify(body)});
  assert.equal(r.status,expected,`${path}: ${await r.clone().text()}`); return r.json();
}
const checks=[];
function passed(message) {checks.push(message);console.log('PASS '+message);}
const initialMigrationInLogs = /Applied 001_initial.sql/.test(compose(project,'logs','api'));
assert.equal(sql(project,'SELECT count(*) FROM schema_migrations'),'1');
compose(project,'exec','-T','api','node','migrate.cjs');
compose(project,'exec','-T','api','node','migrate.cjs');
passed(initialMigrationInLogs ? 'Initial empty-database migration and two repeat runs on existing schema' : 'Existing migration ledger and two repeat runs on existing schema');
for(const [service,path,port] of [['web','/health',80],['api','/api/health',3000]]) {
  if(service === 'web') assert.match(compose(project,'exec','-T',service,'wget','-qO-',`http://127.0.0.1:${port}${path}`),/ok/);
  else assert.match(compose(project,'exec','-T',service,'node','-e',`fetch('http://127.0.0.1:${port}${path}').then(r=>r.text()).then(console.log)`),/ready/);
}
assert.match(compose(project,'exec','-T','web','wget','-qO-','http://127.0.0.1/api/health'),/ready/);
assert.match(await (await fetch(url)).text(),/app-root/);
passed('Probes run inside final images; real frontend and relative /api proxy routing');
await api('/games',{level:'__proto__',cell:0},400);
await api('/games',{level:'beginner',cell:-1},400);
await api('/games',{level:'beginner',cell:1.5},400);
await api('/games/not-an-id',undefined,400);
passed('Invalid difficulties, positions, and identifiers rejected');

const won=[];
for(const [level,size] of [['beginner',81],['intermediate',256],['expert',480]]) {
  let game=await api('/games',{level,cell:0});
  assert.ok(!Object.hasOwn(game,'mines'));assert.ok(!game.cells.includes('mine'));assert.equal(game.cells[0],0);
  const mines=JSON.parse(sql(project,`SELECT board->'mines' FROM games WHERE id='${game.id}'`));
  // Test-only DB inspection supplies safe positions; production HTTP never exposes these.
  for(let i=0;i<size && game.status==='playing';i++) if(!mines.includes(i) && game.cells[i]==='hidden') game=await api(`/games/${game.id}/actions`,{cell:i,action:'reveal',revision:game.revision});
  assert.equal(game.status,'won'); assert.ok(game.points>0);
  await api(`/games/${game.id}/score`,{initials:'<x>'},400);
  await api(`/games/${game.id}/score`,{initials:'TST',points:99999999,elapsedMs:0});
  await api(`/games/${game.id}/score`,{initials:'DUP'});
  assert.equal(sql(project,`SELECT count(*) FROM scores WHERE game_id='${game.id}'`),'1');
  assert.equal(Number(sql(project,`SELECT points FROM scores WHERE game_id='${game.id}'`)),game.points);
  assert.equal(Number(sql(project,`SELECT elapsed_ms FROM scores WHERE game_id='${game.id}'`)),game.elapsedMs);
  assert.equal(sql(project,`SELECT initials FROM scores WHERE game_id='${game.id}'`),'TST');
  won.push(game.id);
  passed(`${level}: completed win, server time/points, initials validation, idempotent score saving`);
}
let game=await api('/games',{level:'beginner',cell:0});
const mine=JSON.parse(sql(project,`SELECT board->'mines' FROM games WHERE id='${game.id}'`))[0];
const concurrent=await Promise.all([0,1].map(()=>fetch(url+`/api/games/${game.id}/actions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'flag',cell:mine,revision:game.revision})}).then(r=>r.status)));
assert.deepEqual(concurrent.sort(),[201,409]);
game=await api('/games/'+game.id);
game=await api(`/games/${game.id}/actions`,{action:'flag',cell:mine,revision:game.revision});
game=await api(`/games/${game.id}/actions`,{action:'reveal',cell:mine,revision:game.revision});
assert.equal(game.status,'lost');
await api(`/games/${game.id}/score`,{initials:'BAD'},400);
passed('Concurrent revision protection, mine loss, and rejection of non-winning scores');
const before=sql(project,'SELECT count(*) FROM scores');
for(const service of ['web','api','database']) {
  const container=compose(project,'ps','-q',service).trim();
  execFileSync('docker',['update','--memory','768m','--memory-swap','768m','--cpus','2','--pids-limit','256',container],{encoding:'utf8'});
}
compose(project,'restart');
compose(project,'up','-d','--wait');
url=base(project); await api('/health');
passed('All services restarted healthy with 768 MB / 2 CPU / 256 PID limits');
const resources=execFileSync('docker',['stats','--no-stream','--format','{{.Name}}: {{.MemUsage}}, {{.PIDs}} PIDs',...compose(project,'ps','-q').trim().split('\n')],{encoding:'utf8'});
console.log(resources);
compose(project,'up','-d','--force-recreate','--wait');
url=base(project);
assert.equal(sql(project,'SELECT count(*) FROM scores'),before);
assert.equal((await api('/games/'+won[0])).saved,true);
passed('All services recreated: named-volume scores and resumable sessions persisted');
// Keep the web running while replacing the API; its resolver must find the new backend.
compose(project,'up','-d','--no-deps','--force-recreate','--wait','api');
for(let i=0;i<10;i++) { const r=await fetch(url+'/api/health'); if(r.ok) break; if(i===9) throw new Error('Backend DNS recovery failed'); await new Promise(resolve=>setTimeout(resolve,1000)); }
passed('Running reverse proxy recovered after API-only recreation');
compose('arcade-isolated','up','-d','--build','--wait');
assert.equal(sql('arcade-isolated','SELECT count(*) FROM scores'),'0');
const oldUrl=url;url=base('arcade-isolated');await api('/games/'+won[0],undefined,404);url=oldUrl;
assert.equal(sql(project,'SELECT count(*) FROM scores'),before);
passed('Two distinct Compose projects have isolated database volumes and sessions');
compose('arcade-isolated','down');
mkdirSync('.verification',{recursive:true});
writeFileSync('.verification/deployment.json',JSON.stringify({date:new Date().toISOString(),url,checks,resources},null,2));
console.log('Production web available locally at '+url);
