export const normal = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const uaiKey = value => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g,'');
export const truth = value => value === true || value === 'true' || value === 1 || value === '1';
export const cityKey = value => normal(value).replace(/^\d{5}\s+/, '').replace(/\s+cedex(?:\s+\d+)?$/, '').replace(/\bst\b/g,'saint').replace(/\bste\b/g,'sainte');
export function domainKey(value) {
 if(!value)return '';
 try{const url=new URL(/^[a-z]+:\/\//i.test(String(value))?value:`https://${value}`);return ['http:','https:'].includes(url.protocol)?url.hostname.toLowerCase().replace(/^www\./,''):'';}catch{return '';}
}
export function companyView(company, portalId) {
 const p=company.properties || {};
 return {id:String(company.id),name:p.name||'Établissement sans nom',city:p.city||'',zip:p.zip||'',domain:p.domain||'',website:p.website||'',uai:p.code_uai||'',lifecycle:p.lifecyclestage||'',lastContact:p.notes_last_contacted||null,contactCount:Number(p.num_contacted_notes||0),url:`https://app.hubspot.com/contacts/${portalId}/record/0-2/${company.id}?utm_source=nj_atlas&utm_medium=app&utm_campaign=crm`};
}
const nursing=name=>/\b(ifsi|ifs)\b|soins infirmiers/.test(normal(name));
const otherProfession=name=>/\b(ifas|ifap|ifmk|ifcs|enkre)\b|aides? soign|auxiliaires? de puer|sages? femmes?|maieut|ergotherap|psychomot|manipulat|pharmaci|kinesither/.test(normal(name))&&!nursing(name);
const departmentOf=name=>(String(name??'').match(/-\s*(\d{2,3}|2[AB])\)\s*$/i)||[])[1]||'';
function nameKey(value) {
 return normal(String(value||'').replace(/\([^)]*\)/g,''))
  .replace(/instituts? de formation en soins infirmiers/g,'ifsi').replace(/\bifs\b/g,'ifsi')
  .replace(/centre hospitalier universitaire|ch universitaire/g,'chu').replace(/centre hospitalier regional/g,'chr')
  .replace(/centre hospitalier|hopital/g,'ch').replace(/\bst\b/g,'saint').replace(/\bste\b/g,'sainte')
  .split(' ').filter(w=>!['de','du','des','d','le','la','les','l','en','et','a','au','aux'].includes(w)&&!/^\d+$/.test(w)).sort().join(' ');
}
const generic=new Set('ifsi ifs ifas ifap ifps ifms ifcs chu chr ch institut instituts formation formations soins infirmier infirmiers sante ecole centre hospitalier hospitaliers hospitaliere general regionale regional specialise professionnels groupement groupe direction saint sainte'.split(' '));
function anchors(name,city){const cityWords=new Set(cityKey(city).split(' '));return [...new Set(nameKey(name).split(' ').filter(w=>w.length>2&&!generic.has(w)&&!cityWords.has(w)))];}
function identity(institute,company,context={}) {
 const city=cityKey(institute.city),otherCity=cityKey(company.city);
 const sameCity=Boolean(city&&city===otherCity),cityConflict=Boolean(city&&otherCity&&city!==otherCity);
 const sameUai=Boolean(uaiKey(company.uai)&&uaiKey(company.uai)===uaiKey(institute.uai));
 const uaiConflict=Boolean(uaiKey(company.uai)&&uaiKey(company.uai)!==uaiKey(institute.uai));
 const domain=domainKey(institute.website);
 const sameDomain=Boolean(domain&&[company.domain,company.website].some(v=>domainKey(v)===domain));
 const left=anchors(institute.name,institute.city),right=anchors(company.name,institute.city);
 const shared=left.filter(w=>right.includes(w));
 const named=Boolean(left.length&&right.length&&shared.length>=2&&(shared.length===left.length||shared.length===right.length));
 const exactName=Boolean(nursing(institute.name)&&nursing(company.name)&&nameKey(institute.name)===nameKey(company.name));
 const soleInCity=Boolean(sameCity&&context.cityCounts?.get(city)===1&&nursing(company.name));
 const incompatible=otherProfession(company.name)||/session de formation/.test(normal(company.name));
 const evidence=[];
 if(sameUai)evidence.push('UAI identique');if(sameCity)evidence.push('commune identique (code postal et Cedex normalisés)');
 if(sameDomain)evidence.push('domaine web identique');if(soleInCity)evidence.push('seul IFSI de la commune');if(exactName)evidence.push('intitulé de l’institut identique');else if(named)evidence.push('nom distinctif de l’établissement concordant');
 let rule=null;
 if(!incompatible&&!cityConflict&&!uaiConflict){
  if(sameUai&&(sameCity||sameDomain||(named&&nursing(company.name))))rule='uai';
  else if(sameCity&&(exactName||(named&&nursing(company.name))))rule='name';
  else if(sameDomain&&nursing(company.name)&&(sameCity||!otherCity))rule='domain';
  else if(soleInCity)rule='city';
 }
 let score=(sameUai?100:0)+(sameCity?40:0)+(sameDomain?70:0)+(exactName?70:named?50:0);
 if(!sameCity&&city&&` ${normal(company.name)} `.includes(` ${city} `))score+=25;
 const department=departmentOf(institute.name);if(department&&String(company.zip||'').startsWith(department))score+=10;
 if(nursing(company.name))score+=15;if(incompatible)score-=30;
 return {rule,score,evidence,why:evidence.join(' · ')};
}
export function matchInstitute(institute,companies,override,context={}) {
 if(override?.excluded)return {kind:'excluded',company:null,candidates:[],confidence:'Non résolu',reason:'Écarté manuellement'};
 if(override?.companyId){const c=companies.find(c=>c.id===override.companyId);return {kind:c?'manual':'review',company:c||null,candidates:[],confidence:c?'Certain':'À valider',reason:c?'Correspondance validée manuellement':'Fiche HubSpot introuvable : revalider la correspondance'};}
 const ranked=companies.map(company=>({company,...identity(institute,company,context)})).filter(x=>x.score>=40).sort((a,b)=>b.score-a.score);
 const candidates=ranked.slice(0,8).map(x=>({...x.company,why:x.why}));
 let certain=ranked.filter(x=>x.rule);
 // Commercial priority only resolves identity-proven candidates, never a city-only guess.
 const isClient=x=>context.complete!==false&&commercialState(x.company,context.dealsByCompany?.[x.company.id]||[]).client;
 const clients=certain.filter(isClient);
 if(clients.length)certain=clients;
 // Name/domain rules are reserved for actual customers; UAI remains available to prospects.
 certain=certain.filter(x=>x.rule==='uai'||(context.dealsByCompany&&isClient(x)));
 // An explicit UAI outranks inferred name/domain identity among customer fiches.
 const byUai=certain.filter(x=>x.rule==='uai');if(byUai.length)certain=byUai;
 if(certain.length===1){const best=certain[0];return {kind:'automatic',company:best.company,candidates,confidence:'Certain',rule:best.rule,evidence:best.evidence,reason:'Rapprochement automatique : '+best.why};}
 return {kind:candidates.length?'review':'missing',company:null,candidates,confidence:certain.length>1?'À valider':candidates.length?'Probable':'Non résolu',reason:certain.length>1?'Plusieurs fiches concordantes : correspondance à vérifier':candidates.length?'Indices disponibles, sans identité suffisamment certaine':'Aucune proposition : rechercher la fiche par nom'};
}
export function commercialState(company, deals, complete=true) {
 if(!company) return {status:'unknown',client:false,hot:false,cold:false,openDeals:[],wonDeals:[],reason:'Établissement non rapproché'};
 if(!complete) return {status:'unknown',client:false,hot:false,cold:false,openDeals:[],wonDeals:[],reason:'Lecture des transactions incomplète'};
 const props=d=>d.properties||d;
 const wonDeals=deals.filter(d=>truth(props(d).hs_is_closed_won));
 const openDeals=deals.filter(d=>props(d).hs_is_closed===false || props(d).hs_is_closed==='false');
 const client=['customer','evangelist'].includes(company.lifecycle)||wonDeals.length>0;
 const hot=openDeals.length>0;
 const contacted=Boolean(company.lastContact)||company.contactCount>0;
 const cold=!client&&!hot&&contacted;
 return {status:hot?'hot':client?'client':cold?'cold':'untouched',client,hot,cold,openDeals,wonDeals,reason:hot?'Au moins une transaction ouverte':client?'Cycle de vie client ou transaction gagnée':cold?'Appel, e-mail ou rendez-vous enregistré':'Aucun contact enregistré dans les champs consultés'};
}
const dealSummary=(c,dealsByCompany)=>{const deals=dealsByCompany[c.id]||[],state=commercialState(c,deals);return {...c,client:state.client,dealCount:deals.length,wonCount:state.wonDeals.length,openCount:state.openDeals.length,dealNames:deals.slice(0,3).map(d=>d.name)};};
export function buildRows(institutes,companies,dealsByCompany,overrides,complete=true){
 const cityCounts=new Map();for(const i of institutes){const k=cityKey(i.city);if(k)cityCounts.set(k,(cityCounts.get(k)||0)+1);}
 const rows=institutes.map(i=>{
  const match=matchInstitute(i,companies,overrides[i.uai],{dealsByCompany,complete,cityCounts});
  match.candidates=match.candidates.map(c=>dealSummary(c,dealsByCompany)).sort((a,b)=>Number(b.client)-Number(a.client)||b.openCount-a.openCount||b.dealCount-a.dealCount);
  return {uai:i.uai,match};
 });
 // A group domain or similar name must not spread customer status to several campuses.
 const assignments=new Map();
 for(const row of rows)if(row.match.company){const id=row.match.company.id;assignments.set(id,[...(assignments.get(id)||[]),row]);}
 for(const linked of assignments.values())if(linked.length>1)for(const row of linked){
  if(row.match.kind==='automatic')row.match={...row.match,kind:'review',company:null,confidence:'À valider',reason:'Cette fiche correspond à plusieurs IFSI : distinguer les sites avant association'};
 }
 return rows.map(row=>({...row,...commercialState(row.match.company,row.match.company?(dealsByCompany[row.match.company.id]||[]):[],complete)}));
}
