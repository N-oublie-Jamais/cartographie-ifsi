import http from 'node:http';
import {readFile,writeFile,mkdir,rename,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {HubSpot} from './lib/hubspot.mjs';
import {buildRows} from './lib/crm.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
export const passwordHash=p=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(p,salt,64).toString('hex');};
export function passwordValid(password,encoded){try{const [salt,value]=encoded.split(':');const expected=Buffer.from(value,'hex');return expected.length===64&&timingSafeEqual(expected,scryptSync(password,salt,64));}catch{return false;}}
async function readJSON(file,fallback){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function saveJSON(file,value){await mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.tmp';await writeFile(tmp,JSON.stringify(value,null,2),{mode:0o600});await rename(tmp,file);}
export async function createApp({dataDir=process.env.DATA_DIR||path.join(root,'runtime'),origin=process.env.APP_ORIGIN||'http://127.0.0.1:8787',production=process.env.NODE_ENV==='production',hubFactory=(token,id)=>new HubSpot(token,id),config:initialConfig}={}){
 const base=new URL(origin);
 if(!['http:','https:'].includes(base.protocol)||base.pathname!=='/')throw Error('APP_ORIGIN doit être une origine HTTP(S).');
 if(production&&base.protocol!=='https:')throw Error('APP_ORIGIN doit utiliser HTTPS en production.');
 let config=initialConfig||await readJSON(path.join(dataDir,'config.json'),null);
 if(process.env.HUBSPOT_ACCESS_TOKEN&&process.env.APP_PASSWORD&&process.env.HUBSPOT_PORTAL_ID)config={token:process.env.HUBSPOT_ACCESS_TOKEN,portalId:process.env.HUBSPOT_PORTAL_ID,passwordHash:passwordHash(process.env.APP_PASSWORD)};
 const configured=()=>Boolean(config?.token&&config?.portalId&&config?.passwordHash);
 const institutes=JSON.parse(await readFile(path.join(root,'public/data.json'),'utf8'));
 const overrides=await readJSON(path.join(dataDir,'matches.json'),{});
 const sessions=new Map(),attempts=new Map(),searched=new Map();
 let snapshot={companies:[],dealsByCompany:{},lastSynced:null,error:null},refreshing=null,hubClient=null;
 const hub=()=>hubClient ||= hubFactory(config.token,config.portalId);
 const json=(res,status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(value));};
 const body=async req=>{let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>16384)throw Error('Requête trop volumineuse.');}return JSON.parse(text||'{}');};
 const cookie=req=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('nj_session='))?.slice(11);
 const sessionFor=req=>{const key=cookie(req),s=sessions.get(key);if(s?.expires>Date.now())return s;if(key)sessions.delete(key);return null;};
 const setCookie=value=>`nj_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${base.protocol==='https:'?'; Secure':''}`;
 const rows=()=>buildRows(institutes,snapshot.companies,snapshot.dealsByCompany,overrides);
 async function refresh(){
  if(refreshing)return refreshing;
  refreshing=(async()=>{try{const client=hub();await client.validate();
   const dealCompanyIds=await client.loadDealCompanyIds();
   const companies=await client.loadCompanies(institutes.map(i=>i.uai),[...Object.values(overrides).map(x=>x.companyId).filter(Boolean),...dealCompanyIds]);
   const dealsByCompany=await client.loadDeals(companies.map(c=>c.id));
   snapshot={companies,dealsByCompany,lastSynced:new Date().toISOString(),error:null};searched.clear();
  }catch(error){snapshot.error=error.message;throw error;}finally{refreshing=null;}})();return refreshing;
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://tile.openstreetmap.org https://server.arcgisonline.com; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
  if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
  let url;
  try{
   if(req.headers.host!==base.host)return json(res,400,{error:'Hôte non autorisé.'});
   url=new URL(req.url,origin);
   if(!['GET','HEAD','POST'].includes(req.method))return json(res,405,{error:'Méthode non autorisée.'});
   if(req.method==='POST'&&req.headers.origin!==base.origin)return json(res,403,{error:'Origine non autorisée.'});
   if(url.pathname==='/health')return json(res,200,{ok:true});
   let session=sessionFor(req);
   if(url.pathname==='/api/session'&&req.method==='GET')return json(res,200,{configured:configured(),authenticated:Boolean(session),csrf:session?.csrf||null,setupAllowed:!production&&['127.0.0.1','localhost','[::1]'].includes(base.hostname)});
   if(url.pathname==='/api/setup'&&req.method==='POST'){
    if(configured()||production||!['127.0.0.1','localhost','[::1]'].includes(base.hostname))return json(res,403,{error:'Configuration disponible uniquement au premier démarrage local.'});
    const input=await body(req);
    if(typeof input.token!=='string'||input.token.trim().length<15||!/^\d+$/.test(String(input.portalId))||typeof input.password!=='string'||input.password.length<12)return json(res,400,{error:'Indiquez un jeton valide, le numéro du compte et un mot de passe d’au moins 12 caractères.'});
    const client=hubFactory(input.token.trim(),String(input.portalId));await client.validate();
    config={token:input.token.trim(),portalId:String(input.portalId),passwordHash:passwordHash(input.password)};
    try{await saveJSON(path.join(dataDir,'config.json'),config);}catch{config=null;throw Error('Impossible d’enregistrer la configuration.');}
    return json(res,200,{ok:true});
   }
   if(url.pathname==='/api/login'&&req.method==='POST'){
    if(!configured())return json(res,409,{error:'Configurez d’abord HubSpot.'});
    const ip=req.socket.remoteAddress||'local',now=Date.now();for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
    if(attempts.size>1000||attempts.get(ip)?.count>=10)return json(res,429,{error:'Trop de tentatives. Réessayez dans 15 minutes.'});
    const input=await body(req);
    if(!passwordValid(String(input.password||''),config.passwordHash)){const a=attempts.get(ip)||{count:0,until:now+900000};a.count++;attempts.set(ip,a);return json(res,401,{error:'Mot de passe incorrect.'});}
    attempts.delete(ip);for(const [k,s]of sessions)if(s.expires<now)sessions.delete(k);
    const key=randomBytes(32).toString('hex');session={csrf:randomBytes(24).toString('hex'),expires:now+28800000};sessions.set(key,session);
    return json(res,200,{ok:true,csrf:session.csrf},{'Set-Cookie':setCookie(key)});
   }
   if(url.pathname.startsWith('/api/')){
    if(!session)return json(res,401,{error:'Connectez-vous à l’atlas.'});
    if(req.method==='POST'&&req.headers['x-csrf-token']!==session.csrf)return json(res,403,{error:'Session expirée. Rechargez la page.'});
    if(url.pathname==='/api/logout'&&req.method==='POST'){sessions.delete(cookie(req));return json(res,200,{ok:true},{'Set-Cookie':setCookie('')+'; Max-Age=0'});}
    if(url.pathname==='/api/crm'&&req.method==='GET')return json(res,200,{rows:rows(),lastSynced:snapshot.lastSynced,error:snapshot.error,refreshing:Boolean(refreshing)});
    if(url.pathname==='/api/refresh'&&req.method==='POST'){await refresh();return json(res,200,{rows:rows(),lastSynced:snapshot.lastSynced,error:null});}
    if(url.pathname==='/api/search'&&req.method==='POST'){
     const input=await body(req),query=String(input.query||'').trim();if(query.length<3||query.length>100)return json(res,400,{error:'Saisissez entre 3 et 100 caractères.'});
     const result=await hub().searchCompanies(query);for(const c of result.companies)searched.set(c.id,c);return json(res,200,result);
    }
    if(url.pathname==='/api/match'&&req.method==='POST'){
     const input=await body(req),uai=String(input.uai||'');if(!institutes.some(i=>i.uai===uai))return json(res,400,{error:'IFSI inconnu.'});
     const previous=overrides[uai];
     if(input.action==='reset')delete overrides[uai];
     else if(input.action==='exclude')overrides[uai]={excluded:true,updatedAt:new Date().toISOString()};
     else{
      const companyId=String(input.companyId||''),company=snapshot.companies.find(c=>c.id===companyId)||searched.get(companyId);
      if(!company)return json(res,400,{error:'Recherchez la fiche HubSpot avant de la valider.'});
      const linked=Object.entries(overrides).find(([other,o])=>other!==uai&&o.companyId===companyId);
      if(linked&&!input.confirmShared)return json(res,409,{error:`Fiche déjà liée à l’UAI ${linked[0]}. Confirmez si elle représente bien les deux sites.`,shared:true});
      overrides[uai]={companyId,updatedAt:new Date().toISOString()};
     }
     try{await saveJSON(path.join(dataDir,'matches.json'),overrides);}catch{if(previous)overrides[uai]=previous;else delete overrides[uai];throw Error('Correspondance non enregistrée.');}
     try{await refresh();}catch{return json(res,200,{ok:true,saved:true,warning:'Correspondance enregistrée. Actualisation HubSpot échouée ; les statuts ne sont pas à jour.'});}
     return json(res,200,{ok:true,saved:true});
    }
    return json(res,404,{error:'Route inconnue.'});
   }
   if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Méthode non autorisée.'});
   const publicRoot=path.join(root,'public'),file=path.resolve(publicRoot,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!file.startsWith(publicRoot+path.sep)||path.relative(publicRoot,file).split(path.sep).some(x=>x.startsWith('.')))return json(res,404,{error:'Fichier introuvable.'});
   const resolved=await realpath(file);if(!resolved.startsWith(publicRoot+path.sep))return json(res,404,{error:'Fichier introuvable.'});
   if(!(await stat(file)).isFile())return json(res,404,{error:'Fichier introuvable.'});
   const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
   res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:await readFile(file));
  }catch(error){if(error.code==='ENOENT')return json(res,404,{error:'Fichier introuvable.'});json(res,502,{error:error instanceof SyntaxError?'Requête JSON invalide.':error.message||'Erreur de lecture.'});}
 });
 return {server,origin};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||8787),host=process.env.HOST||'127.0.0.1';
 if(!['127.0.0.1','localhost','::1'].includes(host)&&process.env.NODE_ENV!=='production')throw Error('L’exposition réseau nécessite NODE_ENV=production et APP_ORIGIN=https://…');
 const app=await createApp({origin:process.env.APP_ORIGIN||`http://127.0.0.1:${port}`});
 app.server.listen(port,host,()=>console.log(`Atlas NJ autonome : ${app.origin}`));
}
