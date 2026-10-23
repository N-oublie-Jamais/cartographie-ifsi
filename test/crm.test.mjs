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

test('customer with matching UAI outranks an imported reference company',async()=>{
 const {buildRows}=await import('../lib/crm.mjs');
 const client={...company,id:'customer',lifecycle:'customer'};
 const [row]=buildRows([institute],[company,client],{},{});
 assert.equal(row.match.company.id,'customer');assert.equal(row.client,true);assert.equal(row.match.confidence,'Certain');
});
test('postal prefixes, Cedex and accents no longer prevent UAI customer matches',async()=>{
 const {buildRows}=await import('../lib/crm.mjs');
 const [row]=buildRows([{...institute,city:'Saint-Étienne'}],[{...company,lifecycle:'customer',city:'42055 St Etienne Cedex 2'}],{},{});
 assert.equal(row.match.kind,'automatic');assert.equal(row.client,true);
});
test('exact nursing institution identity matches a customer without UAI',async()=>{
 const {buildRows}=await import('../lib/crm.mjs');
 const client={id:'customer',name:'IFS du CH de Mâcon',city:'71018 Macon Cedex',lifecycle:'customer'};
 const i={uai:'0710000A',name:'IFSI CH de Mâcon (Mâcon - 71)',city:'Mâcon'};
 const [row]=buildRows([i],[client],{},{});
 assert.equal(row.match.kind,'automatic');assert.equal(row.match.rule,'name');assert.equal(row.client,true);
});
test('won deals establish customer evidence even when lifecycle is lead',async()=>{
 const {buildRows}=await import('../lib/crm.mjs');
 const c={...company,uai:'',name:'IFSI CH DU MANS'};
 const [row]=buildRows([institute],[c],{'1':[{properties:{hs_is_closed:'true',hs_is_closed_won:'true'}}]},{});
 assert.equal(row.match.kind,'automatic');assert.equal(row.client,true);
 const [openOnly]=buildRows([institute],[c],{'1':[{properties:{hs_is_closed:'false',hs_is_closed_won:'false'}}]},{});
 assert.equal(openOnly.match.company,null);
});
test('dedicated exact web domain matches a nursing customer with missing city',async()=>{
 const {buildRows,domainKey}=await import('../lib/crm.mjs');
 const i={...institute,website:'https://www.ifsi-test.fr/institut'};
 const c={id:'client',name:'IFSI Test',domain:'ifsi-test.fr',city:'',lifecycle:'customer'};
 const [row]=buildRows([i],[c],{},{});
 assert.equal(row.match.kind,'automatic');assert.equal(row.match.rule,'domain');
 assert.equal(domainKey('https://www.ifsi-test.fr/a'),'ifsi-test.fr');
 for(const domain of ['autre.ifsi-test.fr','ifsi-test.fr.evil.test'])assert.equal(buildRows([i],[{...c,domain}],{},{} )[0].match.company,null);
});
test('city-only, conflicting UAI/city, other professions and generic hospitals never auto-match clients',async()=>{
 const {buildRows}=await import('../lib/crm.mjs');
 const i={...institute,website:'https://ifsi-test.fr'};
 const c={id:'client',name:'IFSI CH DU MANS',city:'Le Mans',lifecycle:'customer',domain:'ifsi-test.fr'};
 for(const changes of [{name:'Centre hospitalier du Mans'},{name:'IFAS du Mans'},{name:'ENKRE - Kiné Saint-Maurice',city:'Le Mans'},{city:'Tours'},{uai:'0370000A'},{name:'IFSI CH DU MANS - Session de formation'}]){
  const [row]=buildRows([i],[{...c,...changes}],{},{});assert.equal(row.match.company,null,JSON.stringify(changes));
 }
});
test('duplicate customer identities and shared multi-campus domains require review',async()=>{
 const {buildRows}=await import('../lib/crm.mjs');
 const c={id:'1',name:'IFSI CH DU MANS',city:'Le Mans',lifecycle:'customer'};
 assert.equal(buildRows([institute],[c,{...c,id:'2'}],{},{} )[0].match.kind,'review');
 const first={...institute,website:'https://groupe.fr'};
 const second={uai:'0729999X',name:'IFSI autre campus',city:'Le Mans',website:'https://groupe.fr'};
 const rows=buildRows([first,second],[{...c,domain:'groupe.fr'}],{},{});
 assert.ok(rows.every(r=>r.match.company===null&&r.match.confidence==='À valider'));
});
test('manual associations and exclusions survive stronger automatic client evidence',async()=>{
 const {buildRows}=await import('../lib/crm.mjs');
 const c={...company,id:'client',lifecycle:'customer'};
 const [manual]=buildRows([institute],[company,c],{}, {[institute.uai]:{companyId:company.id}});
 assert.equal(manual.match.kind,'manual');assert.equal(manual.match.company.id,company.id);
 assert.equal(buildRows([institute],[c],{}, {[institute.uai]:{excluded:true}})[0].match.kind,'excluded');
 const partial=buildRows([institute],[{...c,uai:'',name:'IFSI CH DU MANS'}],{}, {},false)[0];
 assert.equal(partial.match.company,null);assert.equal(partial.client,false);
});
test('a customer with explicit UAI wins over a second customer inferred by name',async()=>{
 const {buildRows}=await import('../lib/crm.mjs');
 const explicit={...company,lifecycle:'customer'};
 const inferred={...company,id:'2',uai:'',name:'IFSI CH DU MANS',lifecycle:'customer'};
 const [row]=buildRows([institute],[explicit,inferred],{},{});
 assert.equal(row.match.company.id,explicit.id);assert.equal(row.match.rule,'uai');
});
test('a customer IFS fiche matches the only institute of its commune, never one of several',async()=>{
 const {buildRows}=await import('../lib/crm.mjs');
 const client={id:'9',uai:'',name:'IFS du CH de Saverne',city:'67703 Saverne Cedex',zip:'',lifecycle:'customer'};
 const saverne={uai:'0670001A',name:'IFSI de Saverne (67)',city:'Saverne'};
 const [row]=buildRows([saverne],[client],{},{});
 assert.equal(row.match.kind,'automatic');assert.equal(row.client,true);assert.match(row.match.reason,/seul IFSI de la commune/);
 const [a,b]=buildRows([saverne,{uai:'0670002B',name:'IFSI Croix-Rouge Saverne',city:'Saverne'}],[client],{},{});
 assert.notEqual(a.match.kind,'automatic');assert.notEqual(b.match.kind,'automatic');
 const [prospect]=buildRows([saverne],[{...client,lifecycle:'opportunity'}],{},{});
 assert.notEqual(prospect.match.kind,'automatic');
});
