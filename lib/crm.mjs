export const normal = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const uaiKey = value => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g,'');
export const truth = value => value === true || value === 'true' || value === 1 || value === '1';
export function companyView(company, portalId) {
 const p=company.properties || {};
 return {id:String(company.id),name:p.name||'Établissement sans nom',city:p.city||'',uai:p.code_uai||'',lifecycle:p.lifecyclestage||'',lastContact:p.notes_last_contacted||null,contactCount:Number(p.num_contacted_notes||0),url:`https://app.hubspot.com/contacts/${portalId}/record/0-2/${company.id}?utm_source=nj_atlas&utm_medium=app&utm_campaign=crm`};
}
export function matchInstitute(institute, companies, override) {
 if (override?.excluded) return {kind:'excluded',company:null,candidates:[],reason:'Écarté manuellement'};
 if (override?.companyId) {
  const c=companies.find(c=>c.id===override.companyId);
  return {kind:c?'manual':'review',company:c||null,candidates:[],reason:c?'Correspondance validée manuellement':'Fiche HubSpot introuvable : revalider la correspondance'};
 }
 const candidates=companies.filter(c=>uaiKey(c.uai)===uaiKey(institute.uai));
 // A UAI can cover several professions/sites. Never merge their commercial states.
 const plausible=candidates.filter(c=>!/(sages? femmes?|maieut|ergotherap|psychomot|manipulat|pharmaci)/.test(normal(c.name)) || /infirm|ifsi/.test(normal(c.name)));
 if(candidates.length===1 && plausible.length===1 && normal(candidates[0].city) && normal(candidates[0].city)===normal(institute.city))
  return {kind:'automatic',company:candidates[0],candidates,reason:'Code UAI unique et commune identique'};
 return {kind:candidates.length?'review':'missing',company:null,candidates,reason:candidates.length?'Nom, commune ou fiches multiples à vérifier':'Aucun code UAI identique : rechercher la fiche par nom'};
}
export function commercialState(company, deals, complete=true) {
 if(!company) return {status:'unknown',client:false,hot:false,cold:false,openDeals:[],wonDeals:[],reason:'Établissement non rapproché'};
 if(!complete) return {status:'unknown',client:false,hot:false,cold:false,openDeals:[],wonDeals:[],reason:'Lecture des transactions incomplète'};
 const props=d=>d.properties||d;
 const wonDeals=deals.filter(d=>truth(props(d).hs_is_closed_won));
 // Unknown closed state is not an open deal.
 const openDeals=deals.filter(d=>props(d).hs_is_closed===false || props(d).hs_is_closed==='false');
 const client=['customer','evangelist'].includes(company.lifecycle)||wonDeals.length>0;
 const hot=openDeals.length>0;
 const contacted=Boolean(company.lastContact)||company.contactCount>0;
 const cold=!client&&!hot&&contacted;
 return {status:hot?'hot':client?'client':cold?'cold':'untouched',client,hot,cold,openDeals,wonDeals,reason:hot?'Au moins une transaction ouverte':client?'Cycle de vie client ou transaction gagnée':cold?'Appel, e-mail ou rendez-vous enregistré':'Aucun contact enregistré dans les champs consultés'};
}
export function buildRows(institutes, companies, dealsByCompany, overrides, complete=true){
 return institutes.map(i=>{const match=matchInstitute(i,companies,overrides[i.uai]);return {uai:i.uai,match,...commercialState(match.company,match.company?(dealsByCompany[match.company.id]||[]):[],complete)};});
}
