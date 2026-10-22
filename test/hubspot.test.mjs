import test from 'node:test';
import assert from 'node:assert/strict';
import {HubSpot} from '../lib/hubspot.mjs';
test('UAI search lowercases IN strings and follows all result pages',async()=>{
 const bodies=[];
 const client=new HubSpot('secret','6008870',async(url,opt)=>{const body=JSON.parse(opt.body);bodies.push(body);return Response.json(body.after?{results:[{id:'2',properties:{code_uai:'0721317R'}}]}:{results:[{id:'1',properties:{code_uai:'0721317R'}}],paging:{next:{after:'2'}}});});
 const result=await client.loadCompanies(['0721317R']);assert.equal(result.length,2);assert.deepEqual(bodies[0].filterGroups[0].filters[0].values,['0721317r']);assert.equal(bodies[1].after,'2');
});
test('deal associations and batches are read; a partial response never becomes an empty success',async()=>{
 const client=new HubSpot('secret','6008870',async(url)=>Response.json(url.includes('/associations/')?{results:[{from:{id:'1'},to:[{toObjectId:99}]}]}:{results:[{id:'99',properties:{dealname:'Test',hs_is_closed:'false'}}]}));
 const result=await client.loadDeals(['1']);assert.equal(result['1'][0].id,'99');
 const partial=new HubSpot('secret','6008870',async()=>Response.json({status:'PARTIAL',errors:[{message:'private'}],results:[]}));
 await assert.rejects(partial.loadDeals(['1']),/partielle/);
});
test('upstream errors never echo tokens or provider response bodies',async()=>{
 const client=new HubSpot('do-not-leak','6008870',async()=>new Response('do-not-leak',{status:401}));
 await assert.rejects(client.loadDeals(['1']),e=>!e.message.includes('do-not-leak')&&e.message.includes('Jeton'));
});
