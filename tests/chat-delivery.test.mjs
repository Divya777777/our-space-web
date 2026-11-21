import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/chatDelivery.ts', import.meta.url), 'utf8');
assert.equal(source, readFileSync(new URL('../../mobile/src/lib/chatDelivery.ts', import.meta.url), 'utf8'));
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { confirmLocalDelivery } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
test('ack waits for durable local save, not receipt or UI display', async () => {
 let saved; const events=[];
 const done=confirmLocalDelivery(()=>new Promise(resolve=>{saved=()=>{events.push('stored');resolve();};}),async()=>events.push('ack'),()=>true);
 assert.deepEqual(events,[]);saved();assert.equal(await done,true);assert.deepEqual(events,['stored','ack']);
});
test('storage failure never acknowledges; server failure keeps queue retryable',async()=>{
 let calls=0;
 await assert.rejects(confirmLocalDelivery(async()=>{throw Error('disk full')},async()=>calls++,()=>true),/disk full/);
 assert.equal(calls,0);
 await assert.rejects(confirmLocalDelivery(async()=>{},async()=>{throw Error('offline')},()=>true),/offline/);
 assert.equal(await confirmLocalDelivery(async()=>{},async()=>calls++,()=>true),true);assert.equal(calls,1);
});
test('leaving the room/account while saving prevents acknowledgement by the new session',async()=>{
 let active=true, calls=0;
 assert.equal(await confirmLocalDelivery(async()=>{active=false},async()=>calls++,()=>active),false);assert.equal(calls,0);
});
