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
test('companies linked to any deal are discovered across deal pages, tolerating deals without company',async()=>{
 const urls=[];
 const client=new HubSpot('secret','6008870',async(url)=>{urls.push(url);
  if(url.includes('/objects/deals?'))return Response.json(url.includes('after=')?{results:[{id:'12'}]}:{results:[{id:'11'}],paging:{next:{after:'p2'}}});
  return Response.json({status:'COMPLETE_WITH_ERRORS',errors:[{message:'no association'}],results:[{from:{id:'11'},to:[{toObjectId:5},{toObjectId:6}]}]});});
 assert.deepEqual((await client.loadDealCompanyIds()).sort(),['5','6']);assert.ok(urls.some(u=>u.includes('/associations/deals/companies/')));
});
test('known customers without UAI or deals are loaded across pages with web identity',async()=>{
 const bodies=[];
 const client=new HubSpot('secret','6008870',async(url,opt)=>{
  const body=JSON.parse(opt.body);bodies.push(body);
  if(body.filterGroups?.[0].filters[0].propertyName==='code_uai')return Response.json({results:[]});
  return Response.json(body.after?{results:[{id:'2',properties:{name:'Second IFSI',lifecyclestage:'customer',website:'https://second.fr'}}]}:{results:[{id:'1',properties:{name:'Premier IFSI',lifecyclestage:'customer',domain:'premier.fr'}}],paging:{next:{after:'next'}}});
 });
 const companies=await client.loadCompanies(['0721317R']);
 assert.equal(companies.length,2);assert.equal(companies[0].domain,'premier.fr');assert.equal(companies[1].website,'https://second.fr');
 assert.ok(bodies.every(b=>b.properties.includes('domain')&&b.properties.includes('website')));
 assert.deepEqual(bodies[1].filterGroups[0].filters[0].values,['customer','evangelist']);
 assert.equal(bodies[2].after,'next');
});
