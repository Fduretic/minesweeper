import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import assert from 'node:assert/strict';
const compose = parse(readFileSync('compose.yaml','utf8'));
const manifest = parse(readFileSync('vps-admin.yaml','utf8'));
const top = ['services','volumes','name','version'];
const allowed = ['image','build','command','entrypoint','working_dir','environment','depends_on','healthcheck','restart','init','read_only','tmpfs','user','volumes','stop_grace_period','expose'];
for(const key of Object.keys(compose)) assert.ok(top.includes(key),key);
assert.deepEqual(Object.keys(compose.services).sort(),['api','database','web']);
for(const [name,s] of Object.entries(compose.services)) {
  for(const key of Object.keys(s)) assert.ok(allowed.includes(key),`${name}.${key}`);
  assert.ok(s.image || s.build); assert.ok(s.healthcheck?.test?.length);
  if(s.build) { assert.equal(s.build.context,'.'); assert.ok(existsSync(s.build.dockerfile)); for(const key of Object.keys(s.build)) assert.ok(['context','dockerfile','args','target'].includes(key)); }
  for(const val of Object.values(s.environment ?? {})) assert.match(val,/^\$\{[A-Z_]+(?::-[^}]*)?\}$/);
  for(const volume of s.volumes ?? []) assert.ok(compose.volumes[volume.split(':')[0]]);
}
for(const v of Object.values(compose.volumes)) { assert.ok(!v.external); assert.ok(!v.name); }
assert.equal(manifest.version,1); assert.equal(manifest.compose,'compose.yaml');
assert.deepEqual(manifest.public,{service:'web',port:80}); assert.equal(manifest.routing.pathPrefix,false);
assert.deepEqual(manifest.database,{service:'database',name:'app',user:'app',passwordEnv:'POSTGRES_PASSWORD'});
assert.deepEqual(manifest.migration,{service:'api',command:['node','migrate.cjs']});
assert.deepEqual(manifest.storage,[]); assert.deepEqual(manifest.schedules,[]); assert.deepEqual(manifest.services,[]);
assert.ok(manifest.environment.some(e=>e.key==='POSTGRES_PASSWORD' && e.required && e.secret && e.phase==='runtime'));
for(const file of ['package-lock.json','.dockerignore','.env.example','README.md','api/migrations/001_initial.sql']) assert.ok(existsSync(file),file);
console.log('Compose and manifest satisfy the supplied structural contract. VPS Admin itself was not invoked.');
