'use strict';
let crmSession=null,crmSnapshot=null,crmReady=false,crmBusy=false;
window.crmMode='groups';
const crmPalette={client:'#168355',hot:'#b85b08',cold:'#0343e5',untouched:'#737d8d',unknown:'#737d8d'};
const crmNames={client:'Client',hot:'Transaction ouverte',cold:'Prospect froid',untouched:'Aucun contact enregistré',unknown:'À rapprocher'};
window.crmColor=x=>crmPalette[x.crm?.status||'unknown'];
async function api(url,payload){
 const response=await fetch(url,{method:payload?'POST':'GET',headers:payload?{'Content-Type':'application/json','X-CSRF-Token':crmSession?.csrf||''}:{},body:payload?JSON.stringify(payload):undefined});
 const value=await response.json();
 if(!response.ok){if(response.status===401&&url!=='/api/login')showLogin();const err=Error(value.error||'Une erreur est survenue.');err.shared=value.shared;throw err;}
 return value;
}
function errIn(id,error){const el=$(id);if(el){el.textContent=error.message;el.hidden=false;}}
const dateFR=value=>value?new Date(value).toLocaleString('fr-FR'):'Jamais';
function showLogin(){
 $('auth-screen').hidden=false;
 $('auth-content').innerHTML='<p>Connectez-vous pour consulter votre suivi commercial.</p><form id="login-form"><label>Mot de passe de l’atlas<input name="password" type="password" required autocomplete="current-password"></label><button class="primarybtn">Ouvrir mon atlas</button><p id="auth-error" class="form-error" role="alert"></p></form>';
 $('login-form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const r=await api('/api/login',{password:e.target.password.value});crmSession={authenticated:true,csrf:r.csrf};e.target.reset();$('auth-screen').hidden=true;$('crm-open').textContent='HubSpot & correspondances';await getCRM();}catch(err){errIn('auth-error',err);}finally{button.disabled=false;}};
}
function showSetup(allowed){
 $('auth-screen').hidden=false;
 if(!allowed){$('auth-content').innerHTML='<p>Configurez les variables HUBSPOT_ACCESS_TOKEN, HUBSPOT_PORTAL_ID et APP_PASSWORD sur le serveur, puis redémarrez l’application.</p>';return;}
 $('auth-content').innerHTML=`<p>Connectez votre compte HubSpot en lecture seule. Le jeton est enregistré sur ce Mac, côté serveur.</p><p>Dans HubSpot : <b>Développement → Applications héritées → Créer une application privée</b>. Activez <code>crm.objects.companies.read</code> et <code>crm.objects.deals.read</code>.</p><form id="setup-form"><label>Numéro de compte HubSpot<input name="portalId" value="6008870" inputmode="numeric" pattern="[0-9]+" required></label><label>Jeton de l’application privée<input name="token" type="password" required autocomplete="off" spellcheck="false"></label><label>Choisissez le mot de passe de l’atlas<input name="password" type="password" required minlength="12" autocomplete="new-password" placeholder="Au moins 12 caractères"></label><button class="primarybtn">Vérifier et connecter HubSpot</button><p id="auth-error" class="form-error" role="alert"></p></form><p class="small">La vérification lit les entreprises et les transactions. Aucune modification n’est envoyée au CRM.</p>`;
 $('setup-form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;button.textContent='Vérification…';try{await api('/api/setup',{portalId:e.target.portalId.value,token:e.target.token.value,password:e.target.password.value});e.target.reset();showLogin();}catch(err){errIn('auth-error',err);}finally{button.disabled=false;button.textContent='Vérifier et connecter HubSpot';}};
}
async function getCRM(){crmSnapshot=await api('/api/crm');applyCRM();}
function applyCRM(){
 if(!crmReady||!crmSnapshot)return;
 const byUai=new Map(crmSnapshot.rows.map(r=>[r.uai,r]));for(const x of data)x.crm=byUai.get(x.uai);
 const refreshed=crmSnapshot.lastSynced;
 $('crm-sync-state').textContent=refreshed?`Actualisé le ${dateFR(refreshed)}${crmSnapshot.error?' · données anciennes':''}`:'Prêt à synchroniser';
 $('crm-sync-state').title=crmSnapshot.error||'';$('crm-refresh').disabled=crmBusy;
 updateCRMMap();if(selected)window.renderCRMDetail(data.find(x=>x.uai===selected));
}
function updateCRMMap(){
 window.crmMode=$('crm-mode').value;for(const x of data)markers.get(x.uai)?.setIcon(pinIcon(x));
 if(cluster?.refreshClusters)cluster.refreshClusters();applyFilters();
 $('crm-map-legend')?.remove();
 if(window.crmMode==='commercial'){
  const legend=document.createElement('div');legend.id='crm-map-legend';legend.innerHTML='<b>RELATION COMMERCIALE</b>'+Object.entries(crmNames).map(([s,n])=>`<span><i style="background:${crmPalette[s]}"></i>${esc(n)}</span>`).join('')+'<span>✓ Badge client, cumulable avec une transaction ouverte</span>';
  document.querySelector('.mapspace').append(legend);
 }
}
window.crmMatchesFilter=x=>{const f=$('crm-filter').value,c=x.crm;if(!f)return true;if(!crmSnapshot?.lastSynced)return false;if(f==='client')return c?.client;if(f==='review')return !c?.match?.company;return c?.status===f;};
window.renderCRMDetail=x=>{
 if(!x)return;const c=x.crm;
 const old=$('crm-detail');if(old)old.remove();const el=document.createElement('section');el.id='crm-detail';
 if(!crmSnapshot?.lastSynced)el.innerHTML='<h3>Suivi HubSpot</h3><p>Actualisez HubSpot pour afficher les informations commerciales.</p>';
 else{
  const company=c?.match.company,open=c?.openDeals||[];
  el.innerHTML=`<h3>Suivi HubSpot</h3>${crmSnapshot.error?'<p class="form-error">Données anciennes : la dernière actualisation a échoué.</p>':''}<span class="crm-badge" style="color:${crmPalette[c?.status||'unknown']}">${esc(crmNames[c?.status||'unknown'])}</span>${c?.client&&c.status!=='client'?'<span class="crm-badge client">✓ Client</span>':''}<p>${esc(c?.reason||'À rapprocher')}</p>${company?`<a href="${esc(company.url)}" target="_blank" rel="noopener">${esc(company.name)} ↗</a><p class="small">Dernier contact : ${esc(dateFR(company.lastContact))}</p>`:''}${open.length?`<ul>${open.map(d=>`<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)} ↗</a></li>`).join('')}</ul>`:''}<p class="small">${esc(c?.match.reason)}</p><button id="review-this" class="text-button">Vérifier la correspondance →</button>`;
 }
 $('detail').querySelector('.detailbody').append(el);if($('review-this'))$('review-this').onclick=()=>showMatches(x.uai);
};
function statusPanel(){
 const rows=crmSnapshot?.rows||[],mapped=rows.filter(r=>r.match.company).length;
 $('crm-content').innerHTML=`<p>Synchronisation en lecture seule. Les correspondances sont enregistrées dans cet atlas.</p><div class="crm-stats"><b>${mapped}</b> rapprochés · <b>${rows.length-mapped}</b> à vérifier</div><p>Dernière lecture complète : ${esc(dateFR(crmSnapshot?.lastSynced))}</p>${crmSnapshot?.error?`<p class="form-error">${esc(crmSnapshot.error)}</p>`:''}<button class="primarybtn" id="review-all">Vérifier les correspondances</button><button class="secondarybtn" id="logout">Se déconnecter</button><p class="small">Un prospect froid a un appel, un e-mail ou un rendez-vous enregistré, sans transaction ouverte et sans statut client. La présence d’une personne dans la base ne suffit pas.</p><p class="small">Les correspondances automatiques reposent sur un UAI unique et une commune identique ; elles restent modifiables. L’absence de contact enregistré ne prouve pas l’absence d’échanges hors CRM.</p>`;
 $('review-all').onclick=()=>showMatches();$('logout').onclick=async()=>{try{await api('/api/logout',{});crmSnapshot=null;for(const x of data)delete x.crm;crmSession=null;hideDetail();$('crm-dialog').close();$('crm-filter').value='';$('crm-mode').value='groups';updateCRMMap();showLogin();}catch(e){errIn('crm-message',e);}};
}
function showMatches(uai){
 const choices=data.filter(x=>uai?x.uai===uai:!x.crm?.match.company);let list=choices.length?choices:data;
 $('crm-content').innerHTML=`<label>Institut à rapprocher<select id="match-institute">${list.map(x=>`<option value="${esc(x.uai)}">${esc(x.name)} · ${esc(x.city)}</option>`).join('')}</select></label><div id="match-target"></div><p id="crm-message" class="form-error" role="alert"></p><button id="back-crm" class="text-button">← Vue d’ensemble</button>`;
 $('match-institute').onchange=renderCandidates;$('back-crm').onclick=statusPanel;renderCandidates();if(!$('crm-dialog').open)$('crm-dialog').showModal();
}
function candidateHTML(c){return `<article class="candidate"><b>${esc(c.name)}</b><p>${esc(c.city)} · UAI ${esc(c.uai||'non renseigné')}</p><a href="${esc(c.url)}" target="_blank" rel="noopener">Vérifier dans HubSpot ↗</a><button class="primarybtn" data-company="${esc(c.id)}">Associer cette fiche</button></article>`;}
function renderCandidates(){
 const x=data.find(i=>i.uai===$('match-institute').value),match=x.crm?.match;
 $('match-target').innerHTML=`<p><b>${esc(x.city)}</b> · UAI ${esc(x.uai)}</p><p>${esc(match?.reason||'Actualisez HubSpot avant de rapprocher les instituts.')}</p><div id="candidate-list">${(match?.company?[match.company]:match?.candidates||[]).map(candidateHTML).join('')}</div><form id="company-search"><label>Rechercher une entreprise HubSpot<input name="query" required minlength="3" placeholder="Nom, ville, établissement…" value="${esc(x.city||'')}"></label><button class="secondarybtn">Rechercher</button></form><div class="match-actions"><button id="exclude-match" class="text-button">Laisser sans correspondance</button><button id="reset-match" class="text-button">Revenir au rapprochement automatique</button></div>`;
 $('company-search').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const r=await api('/api/search',{query:e.target.query.value});$('candidate-list').innerHTML=`<p>${r.companies.length} résultat(s) affiché(s) sur ${r.total}. Affinez si nécessaire.</p>`+r.companies.map(candidateHTML).join('');bindCandidates();}catch(err){errIn('crm-message',err);}finally{b.disabled=false;}};
 $('exclude-match').onclick=()=>saveMatch({action:'exclude'});$('reset-match').onclick=()=>saveMatch({action:'reset'});bindCandidates();
}
function bindCandidates(){document.querySelectorAll('[data-company]').forEach(b=>b.onclick=()=>saveMatch({companyId:b.dataset.company}));}
async function saveMatch(payload){
 const uai=$('match-institute').value;document.querySelectorAll('#crm-content button').forEach(b=>b.disabled=true);
 try{let result;try{result=await api('/api/match',{uai,...payload});}catch(err){if(!err.shared)throw err;if(!confirm(err.message))return;result=await api('/api/match',{uai,...payload,confirmShared:true});}await getCRM();renderCandidates();$('crm-message').textContent=result.warning||'Correspondance enregistrée.';}catch(err){errIn('crm-message',err);}finally{document.querySelectorAll('#crm-content button').forEach(b=>b.disabled=false);}
}
async function refreshCRM(){
 if(crmBusy)return;crmBusy=true;$('crm-refresh').disabled=true;$('crm-sync-state').textContent='Lecture de HubSpot en cours…';
 try{crmSnapshot=await api('/api/refresh',{});applyCRM();}catch(err){if(crmSnapshot)crmSnapshot.error=err.message;applyCRM();$('crm-sync-state').textContent=`Échec : ${err.message}${crmSnapshot?.lastSynced?' · données précédentes conservées':''}`;}finally{crmBusy=false;$('crm-refresh').disabled=false;}
}
$('crm-mode').onchange=updateCRMMap;$('crm-filter').onchange=()=>applyFilters();
$('crm-refresh').onclick=refreshCRM;$('crm-open').onclick=()=>{statusPanel();$('crm-dialog').showModal();};$('crm-close').onclick=()=>$('crm-dialog').close();
window.addEventListener('atlas-ready',()=>{crmReady=true;if(cluster?.options){const baseIcon=cluster.options.iconCreateFunction;cluster.options.iconCreateFunction=c=>{if(window.crmMode!=='commercial')return baseIcon(c);const counts={};for(const marker of c.getAllChildMarkers()){const row=data.find(x=>markers.get(x.uai)===marker)?.crm;const key=row?.status||'unknown';counts[key]=(counts[key]||0)+1;}return L.divIcon({html:`<span>${c.getChildCount()}</span><small class="cluster-crm">${Object.entries(counts).map(([s,n])=>`<i style="background:${crmPalette[s]}" title="${esc(crmNames[s])} : ${n}"></i>`).join('')}</small>`,className:'cluster',iconSize:[37,37]});};}applyCRM();});
(async()=>{try{crmSession=await api('/api/session');if(!crmSession.configured)return showSetup(crmSession.setupAllowed);if(!crmSession.authenticated)return showLogin();$('auth-screen').hidden=true;$('crm-open').textContent='HubSpot & correspondances';await getCRM();}catch(err){$('auth-content').textContent='Connexion au serveur impossible : '+err.message;}})();
