import {setTimeout as delay} from 'node:timers/promises';
import {companyView} from './crm.mjs';
const chunks=(xs,n)=>Array.from({length:Math.ceil(xs.length/n)},(_,i)=>xs.slice(i*n,(i+1)*n));
export const companyProperties=['name','city','zip','domain','website','code_uai','lifecyclestage','notes_last_contacted','num_contacted_notes'];
export class HubSpot {
 constructor(token,portalId,fetcher=fetch){this.token=token;this.portalId=portalId;this.fetcher=fetcher;this.next=0;this.queue=Promise.resolve();}
 async request(path,body,{lenient=false}={}){
  const run=async()=>{
   // Serial, paced reads stay below the Search API rate limit.
   await delay(Math.max(0,this.next-Date.now()));this.next=Date.now()+250;
   let response;
   try{response=await this.fetcher('https://api.hubapi.com'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});}catch{throw Error('HubSpot ne répond pas. Réessayez plus tard.');}
   if(!response.ok){const retry=response.headers.get('retry-after');throw Error(response.status===401?'Jeton HubSpot refusé ou expiré.':response.status===403?'Permissions HubSpot insuffisantes : lecture des entreprises et transactions requise.':response.status===429?`Limite HubSpot atteinte. Réessayez après ${retry||'quelques'} secondes.`:`Lecture HubSpot impossible (HTTP ${response.status}).`);}
   const result=await response.json();
   if(!lenient&&(result.status==='PARTIAL' || result.errors?.length))throw Error('HubSpot a renvoyé une lecture partielle. Les données précédentes sont conservées.');
   return result;
  };
  const result=this.queue.then(run);this.queue=result.catch(()=>{});return result;
 }
 async validate(){
  const info=await this.request('/oauth/v2/private-apps/get/access-token-info',{tokenKey:this.token});
  if(String(info.hubId)!==String(this.portalId))throw Error('Ce jeton appartient à un autre compte HubSpot. Vérifiez le numéro du compte.');
  for(const scope of ['crm.objects.companies.read','crm.objects.deals.read'])if(!info.scopes?.includes(scope))throw Error(`Permission manquante : ${scope}`);
  await this.request('/crm/v3/objects/companies?limit=1');
  await this.request('/crm/v3/objects/deals?limit=1');
 }
 async search(body){return this.request('/crm/v3/objects/companies/search',{properties:companyProperties,limit:200,...body});}
 async loadCompanies(uais,manualIds=[]){
  const found=new Map();
  for(const values of chunks([...new Set(uais.map(x=>x.toLowerCase()))],60)){
   let after;
   do{const page=await this.search({filterGroups:[{filters:[{propertyName:'code_uai',operator:'IN',values}]}],...(after?{after}:{})});
    for(const c of page.results||[])found.set(String(c.id),c);after=page.paging?.next?.after;
   }while(after);
  }
  // Read known customers even when they have no UAI or associated deal.
  let clientAfter;
  do{const page=await this.search({filterGroups:[{filters:[{propertyName:'lifecyclestage',operator:'IN',values:['customer','evangelist']}]}],...(clientAfter?{after:clientAfter}:{})});
   for(const c of page.results||[])found.set(String(c.id),c);clientAfter=page.paging?.next?.after;
  }while(clientAfter);
  const missing=[...new Set(manualIds)].filter(id=>!found.has(id));
  for(const ids of chunks(missing,100)){const page=await this.request('/crm/v3/objects/companies/batch/read',{properties:companyProperties,inputs:ids.map(id=>({id}))});for(const c of page.results||[])found.set(String(c.id),c);}
  return [...found.values()].map(c=>companyView(c,this.portalId));
 }
 async loadDealCompanyIds(){
  const dealIds=[];let after;
  do{const page=await this.request(`/crm/v3/objects/deals?limit=100${after?`&after=${encodeURIComponent(after)}`:''}`);dealIds.push(...(page.results||[]).map(d=>String(d.id)));after=page.paging?.next?.after;}while(after);
  const companyIds=new Set();
  for(const ids of chunks(dealIds,100)){
   // Deals without a company are normal here and may be reported as errors.
   const result=await this.request('/crm/v4/associations/deals/companies/batch/read',{inputs:ids.map(id=>({id}))},{lenient:true});
   for(const entry of result.results||[])for(const to of entry.to||[])companyIds.add(String(to.toObjectId));
  }
  return [...companyIds];
 }
 async searchCompanies(query){const result=await this.search({query,limit:30});return {total:result.total,companies:(result.results||[]).map(c=>companyView(c,this.portalId))};}
 async loadDeals(companyIds){
  const idsByCompany={};
  for(const ids of chunks(companyIds,100)){
   const result=await this.request('/crm/v4/associations/companies/deals/batch/read',{inputs:ids.map(id=>({id}))});
   for(const entry of result.results||[]){
    const companyId=String(entry.from.id);idsByCompany[companyId]=(entry.to||[]).map(x=>String(x.toObjectId));
    let after=entry.paging?.next?.after;
    while(after){const page=await this.request(`/crm/v4/objects/companies/${companyId}/associations/deals?limit=500&after=${encodeURIComponent(after)}`);idsByCompany[companyId].push(...(page.results||[]).map(x=>String(x.toObjectId)));after=page.paging?.next?.after;}
   }
  }
  const dealIds=[...new Set(Object.values(idsByCompany).flat())],deals=new Map();
  for(const ids of chunks(dealIds,100)){
   const result=await this.request('/crm/v3/objects/deals/batch/read',{properties:['dealname','dealstage','hs_is_closed','hs_is_closed_won','closedate'],inputs:ids.map(id=>({id}))});
   for(const d of result.results||[])deals.set(String(d.id),{id:String(d.id),name:d.properties?.dealname||'Transaction',properties:d.properties,url:`https://app.hubspot.com/contacts/${this.portalId}/record/0-3/${d.id}?utm_source=nj_atlas&utm_medium=app&utm_campaign=crm`});
  }
  if(dealIds.some(id=>!deals.has(id)))throw Error('Certaines transactions sont introuvables. Lecture commerciale incomplète.');
  return Object.fromEntries(companyIds.map(id=>[id,(idsByCompany[id]||[]).map(d=>deals.get(d))]));
 }
}
