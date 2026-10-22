import test from 'node:test';
import assert from 'node:assert/strict';
import {matchInstitute,commercialState} from '../lib/crm.mjs';
const institute={uai:'0721317R',name:'IFSI CH DU MANS',city:'Le Mans'};
const company={id:'1',uai:'0721317r',name:'Institut de formation en soins infirmiers',city:'Le Mans',lifecycle:'lead'};
test('UAI and city identify a unique company, accent/case tolerant',()=>{
 assert.equal(matchInstitute(institute,[company]).kind,'automatic');
 assert.equal(matchInstitute({...institute,city:'Évreux'},[{...company,city:'evreux'}]).kind,'automatic');
});
test('shared UAI, different professions or locations require review',()=>{
 assert.equal(matchInstitute(institute,[company,{...company,id:'2'}]).kind,'review');
 assert.equal(matchInstitute(institute,[{...company,name:'École de sages-femmes'}]).kind,'review');
 assert.equal(matchInstitute(institute,[{...company,city:'Tours'}]).kind,'review');
});
test('manual choices and exclusion persist independently of inferred matches',()=>{
 assert.equal(matchInstitute(institute,[company],{companyId:'1'}).kind,'manual');
 assert.equal(matchInstitute(institute,[company],{excluded:true}).company,null);
 assert.equal(matchInstitute(institute,[],{companyId:'gone'}).kind,'review');
});
test('client status combines with an open deal without losing customer badge',()=>{
 const c=commercialState({...company,lifecycle:'customer'},[{properties:{hs_is_closed:'false',hs_is_closed_won:'false'}}]);
 assert.equal(c.status,'hot');assert.equal(c.client,true);assert.equal(c.openDeals.length,1);
});
test('lost or unknown deals are not warm leads; lifecycle opportunity is insufficient',()=>{
 assert.equal(commercialState({...company,lifecycle:'opportunity'},[{properties:{hs_is_closed:'true',hs_is_closed_won:'false'}}]).status,'untouched');
 assert.equal(commercialState(company,[{properties:{}}]).hot,false);
 assert.equal(commercialState(company,[{properties:{hs_is_closed:'true',hs_is_closed_won:'true'}}]).client,true);
});
test('cold means a logged contact, not merely a CRM company; incomplete reads stay unknown',()=>{
 assert.equal(commercialState({...company,lastContact:'2026-01-01'},[]).status,'cold');
 assert.equal(commercialState(company,[]).status,'untouched');
 assert.equal(commercialState(company,[],false).status,'unknown');
});
test('a company without UAI is proposed by commune and name, never matched automatically',()=>{
 const noUai={id:'7',uai:'',name:'CH du Mans - Direction',city:'Le Mans',zip:'72000',lifecycle:''};
 const m=matchInstitute({...institute,name:'IFSI CH DU MANS (Le Mans - 72)'},[noUai,{...noUai,id:'8',city:'Tours',name:'Clinique de Tours'}]);
 assert.equal(m.kind,'review');assert.equal(m.company,null);
 assert.deepEqual(m.candidates.map(c=>c.id),['7']);assert.match(m.candidates[0].why,/commune/);
 assert.equal(matchInstitute(institute,[{...noUai,city:'Tours',name:'Clinique de Tours'}]).kind,'missing');
});
test('buildRows attaches deal counts and names to candidates',async()=>{
 const {buildRows}=await import('../lib/crm.mjs');
 const c={id:'7',uai:'',name:'CH du Mans',city:'Le Mans',zip:'72000'};
 const [row]=buildRows([institute],[c],{7:[{name:'Formation 2026',properties:{hs_is_closed:'false'}}]},{});
 assert.equal(row.match.candidates[0].dealCount,1);assert.equal(row.match.candidates[0].openCount,1);assert.deepEqual(row.match.candidates[0].dealNames,['Formation 2026']);
});
