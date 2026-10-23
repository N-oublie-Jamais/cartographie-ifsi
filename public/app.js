'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const shortGroup=g=>g?g.replace(/^Regroupement d'IFSI\s*/,'').replace(/^Regroupement IFSI\s*/,''):'Sans regroupement explicite';
const safeUrl=url=>{try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)?u.href:'#';}catch{return '#';}};
let data=[],filtered=[],groups=[],colors={},markers=new Map(),map=null,cluster=null,selected=null;
const places={metro:{center:[46.55,2.6],zoom:6},antilles:{bounds:[[14.25,-61.35],[16.65,-60.7]]},guyane:{center:[4.6,-53.1],zoom:7},indien:{bounds:[[-21.6,44.7],[-12.3,56.1]]},polynesie:{center:[-17.56,-149.57],zoom:11}};
function color(g){return colors[g]||'#8c9692';}
function markerColor(x){return window.crmMode==='commercial'?(window.crmColor?.(x)||'#939aab'):color(x.group);}
const dataIndex=new Map();
function clientBadge(c){const n=c.getAllChildMarkers().filter(m=>dataIndex.get(m.options.uai)?.crm?.client).length;return n?`<b class="cluster-clients" title="${n} client${n>1?'s':''}">✓ ${n}</b>`:'';}
function initMap(){
 if(!window.L){$('map').innerHTML='<div class="map-error">La carte n’a pas pu se charger. Les instituts restent accessibles dans la liste.</div>';return;}
 map=L.map('map',{zoomControl:false,minZoom:2,maxZoom:18,worldCopyJump:true}).setView(places.metro.center,6);
 L.control.zoom({position:'topright'}).addTo(map);
 L.control.scale({position:'bottomleft',imperial:false,maxWidth:90}).addTo(map);
 const osmCredit='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
 const gray=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles &copy; Esri — Esri, HERE, Garmin, OpenStreetMap contributors',maxNativeZoom:16,maxZoom:19});
 const streets=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:osmCredit,maxZoom:19});
 const backgrounds={light:gray,streets};
 let currentBackground=null,errors=0,loaded=0;
 for(const layer of Object.values(backgrounds)){
  layer.on('tileerror',()=>{if(layer===currentBackground&&++errors>5&&!loaded)$('tilewarning').hidden=false;});
  layer.on('tileload',()=>{if(layer===currentBackground){loaded++;$('tilewarning').hidden=true;}});
 }
 function setBackground(value){
  const key=Object.hasOwn(backgrounds,value)?value:'light';
  if(currentBackground)map.removeLayer(currentBackground);
  errors=0;loaded=0;$('tilewarning').hidden=true;
  currentBackground=backgrounds[key];currentBackground.addTo(map);$('basemap').value=key;
  try{localStorage.setItem('nj-ifsi-basemap',key);}catch{}
 }
 let savedBackground='light';try{savedBackground=localStorage.getItem('nj-ifsi-basemap')||'light';}catch{}
 setBackground(savedBackground);$('basemap').onchange=e=>setBackground(e.target.value);
 if(L.markerClusterGroup){cluster=L.markerClusterGroup({maxClusterRadius:35,showCoverageOnHover:false,spiderfyOnMaxZoom:true,iconCreateFunction:c=>L.divIcon({html:'<span>'+c.getChildCount()+'</span>'+clientBadge(c),className:'cluster',iconSize:[37,37]})}).addTo(map);}else{cluster=L.layerGroup().addTo(map);}
 for(const x of data){
   dataIndex.set(x.uai,x);const m=L.marker([x.lat,x.lng],{icon:pinIcon(x),title:x.name,alt:x.name,keyboard:true,uai:x.uai});
   m.bindTooltip(esc(x.name)+'<br><small>'+esc(x.city)+'</small>',{direction:'top',offset:[0,-8]});
   m.on('click',()=>selectIFSI(x.uai,false));markers.set(x.uai,m);
 }
}
function pinIcon(x){return L.divIcon({html:`<span class="pin${selected===x.uai?' selected':''}${window.crmMode==='commercial'?' commercial-pin crm-'+(x.crm?.status||'unknown'):''}${x.crm?.client?' is-client':''}${window.crmClientsOnly&&!x.crm?.client?' is-dimmed':''}" style="background:${markerColor(x)}"></span>`,className:'marker',iconSize:[17,17],iconAnchor:[8.5,8.5]});}
function hideDetail(){if(selected&&map){const old=selected;selected=null;markers.get(old)?.setIcon(pinIcon(data.find(x=>x.uai===old)));}else selected=null;$('detail').hidden=true;document.querySelectorAll('.resultcard.selected').forEach(el=>el.classList.remove('selected'));history.replaceState(null,'',location.pathname+location.search);}
function selectIFSI(uai,move=true){
 const x=data.find(x=>x.uai===uai);if(!x)return;
 if(selected&&map){const old=data.find(x=>x.uai===selected);selected=null;markers.get(old.uai)?.setIcon(pinIcon(old));}
 selected=uai;
 const colorHex=color(x.group),gname=shortGroup(x.group);
 $('detail').style.setProperty('--groupcolor',colorHex);
 const path=x.path.includes('App')?'Apprentissage':'Formation initiale';
 $('detail').innerHTML=`<div class="detailhead"></div><div class="detailbody"><button class="detailclose iconbtn" id="closedetail" aria-label="Fermer la fiche">×</button><div class="eyebrow">FICHE INSTITUT · PARCOURSUP 2026</div><h2>${esc(x.name)}</h2><div class="detailloc">${esc(x.city)} · ${esc(x.department)}<br>${esc(x.region)}</div><span class="tag">${esc(x.status)}</span><span class="tag">${esc(path)}</span><div class="detailgroup"><label>REGROUPEMENT UNIVERSITAIRE</label><p><span class="groupdot" style="background:${colorHex};margin:0 6px 0 0"></span>${esc(gname)}</p>${x.group?'<button id="filterthisgroup">Voir les instituts de ce regroupement →</button>':''}</div>${x.urls.map((u,i)=>`<a class="primarybtn" href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${x.urls.length>1?'Parcoursup · fiche '+(i+1):'Consulter la fiche Parcoursup'} ↗</a>`).join('')}${x.website?`<a class="secondarybtn" href="${esc(safeUrl(x.website))}" target="_blank" rel="noopener">Site de l’établissement ↗</a>`:''}<div class="metadata"><div><label>IDENTIFIANT UAI</label>${esc(x.uai)}</div><div><label>FICHES DE FORMATION</label>${x.pages}</div><div><label>CODE(S) FORMATION GTA</label>${esc(x.gta.join(', '))}</div><div><label>CODE(S) GTI</label>${esc(x.gti.join(', '))}</div></div><div class="detailnotes">${esc(x.notes)}</div><div class="coordinate">Localisation Parcoursup · ${x.lat.toFixed(4)}, ${x.lng.toFixed(4)}</div></div>`;
 $('detail').hidden=false;$('detail').scrollTop=0;
 $('closedetail').onclick=hideDetail;
 if($('filterthisgroup'))$('filterthisgroup').onclick=()=>{$('group').value=x.group;$('region').value='';$('status').value='';$('search').value='';applyFilters(true);};
 document.querySelectorAll('.resultcard').forEach(el=>el.classList.toggle('selected',el.dataset.uai===uai));
 if(map){const marker=markers.get(uai);marker.setIcon(pinIcon(x));
   if(move){
    const zoom=12,point=map.project([x.lat,x.lng],zoom);
    point.x+=innerWidth>760?Math.min(135,map.getSize().x/5):0;point.y+=innerWidth<=760?110:0;
    const center=map.unproject(point,zoom);
    map.flyTo(center,zoom,{duration:.65});
    if(cluster.zoomToShowLayer)map.once('moveend',()=>cluster.zoomToShowLayer(marker,()=>{}));
   }
 }
 window.renderCRMDetail?.(x);
 document.querySelector('.workspace').classList.remove('show-list');
 history.replaceState(null,'',location.pathname+location.search+'#'+encodeURIComponent(uai));
}
function buildOptions(){
 groups=[...new Set(data.map(x=>x.group).filter(Boolean))].sort((a,b)=>shortGroup(a).localeCompare(shortGroup(b),'fr'));
 groups.forEach((g,i)=>colors[g]=`hsl(${Math.round((i*137.508+155)%360)} 39% 43%)`);
 for(const g of groups)$('group').add(new Option(shortGroup(g),g));
 $('group').add(new Option('Sans regroupement explicite','__none'));
 for(const r of [...new Set(data.map(x=>x.region))].sort((a,b)=>a.localeCompare(b,'fr')))$('region').add(new Option(r,r));
 for(const s of [...new Set(data.map(x=>x.status))].sort())$('status').add(new Option(s,s));
 $('legenditems').innerHTML=[...groups,''].map(g=>`<button class="legenditem" data-group="${esc(g||'__none')}"><span class="groupdot" style="background:${color(g)}"></span>${esc(shortGroup(g))}<span>${data.filter(x=>x.group===g).length}</span></button>`).join('');
 $('legenditems').addEventListener('click',e=>{const b=e.target.closest('[data-group]');if(!b)return;$('group').value=b.dataset.group;applyFilters(true);toggleLegend(false);});
}
function renderList(){
 $('count').textContent=filtered.length;$('countlabel').textContent=filtered.length===1?'institut':'instituts';
 const n=new Set(filtered.map(x=>x.group).filter(Boolean)).size;$('groupscount').textContent=n+' regroupement'+(n>1?'s':'');
 $('results').innerHTML=filtered.length?filtered.map(x=>`<button class="resultcard${x.uai===selected?' selected':''}" data-uai="${esc(x.uai)}" aria-label="Ouvrir ${esc(x.name)}"><span class="cardtop"><span class="groupdot" style="background:${markerColor(x)}"></span><span class="cardname">${esc(x.name)}</span><span class="cardarrow" aria-hidden="true">↗</span></span><span class="cardcity">${esc(x.city)} · ${esc(x.department)}</span><span class="cardgroup">${esc(shortGroup(x.group))}</span></button>`).join(''):'<div class="empty"><b>Aucun institut ne correspond.</b><br>Essayez une autre recherche ou réinitialisez les filtres.</div>';
}
function fitResults(){
 if(!map||!filtered.length)return;
 const b=L.latLngBounds(filtered.map(x=>[x.lat,x.lng]));
 map.fitBounds(b,{padding:[55,90],maxZoom:12,animate:true});
}
function applyFilters(fit=false){
 const q=norm($('search').value.trim()).split(/\s+/).filter(Boolean),g=$('group').value,r=$('region').value,s=$('status').value;
 filtered=data.filter(x=>(!window.crmMatchesFilter||window.crmMatchesFilter(x))&&q.every(t=>x.search.includes(t))&&(!g||(g==='__none'?!x.group:x.group===g))&&(!r||x.region===r)&&(!s||x.status===s));
 if(selected&&!filtered.some(x=>x.uai===selected))hideDetail();
 renderList();$('results').scrollTop=0;
 if(cluster){cluster.clearLayers();const ms=filtered.map(x=>markers.get(x.uai));if(cluster.addLayers)cluster.addLayers(ms);else ms.forEach(m=>cluster.addLayer(m));}
 if(fit&&filtered.length)fitResults();
 window.crmAfterFilter?.();
}
function goPlace(name){if(!map)return;const p=places[name];if(p.bounds)map.fitBounds(p.bounds,{padding:[45,75]});else map.flyTo(p.center,p.zoom,{duration:.8});document.querySelectorAll('[data-place]').forEach(b=>b.classList.toggle('active',b.dataset.place===name));}
function toggleLegend(open){$('legend').hidden=!open;$('legendbutton').setAttribute('aria-expanded',String(open));}
function exportCSV(){
 const cols=['IFSI','UAI','Commune','Département','Région','Regroupement','Statut','Voie','GTA','GTI','Parcoursup','Site','Observations','Relation commerciale','Client','Transaction ouverte','Fiche HubSpot'];
 const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const lines=[cols,...filtered.map(x=>[x.name,x.uai,x.city,x.department,x.region,x.group,x.status,x.path,x.gta.join(' / '),x.gti.join(' / '),x.urls.join(' / '),x.website,x.notes,x.crm?.status||'non synchronisé',x.crm?.client?'Oui':'Non',x.crm?.hot?'Oui':'Non',x.crm?.match.company?.url||''])];
 const blob=new Blob(['\ufeff'+lines.map(r=>r.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Selection_IFSI_Parcoursup_2026.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
$('results').addEventListener('click',e=>{const card=e.target.closest('[data-uai]');if(card)selectIFSI(card.dataset.uai);});
let searchTimer;$('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>applyFilters(Boolean($('search').value.trim())),180);});
for(const id of ['group','region','status'])$(id).addEventListener('change',()=>applyFilters(true));
$('reset').onclick=()=>{for(const id of ['search','group','region','status'])$(id).value='';hideDetail();applyFilters();goPlace('metro');};
$('fit').onclick=fitResults;$('export').onclick=exportCSV;
document.querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>{hideDetail();goPlace(b.dataset.place);});
$('legendbutton').onclick=()=>toggleLegend($('legend').hidden);$('closelegend').onclick=()=>toggleLegend(false);
$('about').onclick=()=>$('aboutdialog').showModal();$('closeabout').onclick=()=>$('aboutdialog').close();
$('aboutdialog').addEventListener('click',e=>{if(e.target===$('aboutdialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('mobilelist').onclick=()=>{document.querySelector('.workspace').classList.add('show-list');$('search').focus();};$('mobilemap').onclick=()=>document.querySelector('.workspace').classList.remove('show-list');
document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideDetail();toggleLegend(false);}if(e.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();if(innerWidth<=760)document.querySelector('.workspace').classList.add('show-list');$('search').focus();}});
fetch('data.json').then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).then(json=>{
 data=json;for(const x of data)x.search=norm([x.name,x.city,x.department,x.region,x.group,x.uai].join(' '));
 data.sort((a,b)=>a.city.localeCompare(b.city,'fr')||a.name.localeCompare(b.name,'fr'));
 buildOptions();try{initMap();}catch(e){console.error(e);$('map').innerHTML='<div class="map-error">La carte est indisponible. Vous pouvez consulter tous les instituts dans la liste.</div>';}
 applyFilters();window.dispatchEvent(new Event('atlas-ready'));
 const initial=decodeURIComponent(location.hash.slice(1));if(data.some(x=>x.uai===initial))selectIFSI(initial);
}).catch(e=>{console.error(e);$('results').innerHTML='<div class="empty">Le chargement des données a échoué. <button onclick="location.reload()">Réessayer</button></div>';$('count').textContent='—';});
