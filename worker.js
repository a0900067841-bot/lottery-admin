// yijia-lottery-api — account management v0.1.19; existing device config API retained.
const configKey='device:config',ackKey='device:ack',SESSION_SECONDS=7*86400;
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0};
const int=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const str=(s,max)=>typeof s==='string'&&s.length<=max;
function validateConfig(d){
 if(!d||d.schema!=='lottery-device-config'||d.version!==1)throw Error('Wrong schema/version');
 const t=d.ticket,s=d.sound,p=d.prizes;
 if(!t||!str(t.store,40)||!str(t.usage,3000)||!str(t.rules,6000)||!str(t.warning,3000)||!int(t.days,1,365)||![30,40,50,55,57,58].includes(t.paperWidth)||!['qr','code128'].includes(t.barcodeType)||!int(t.barcodeSize,60,100)||!int(t.rulesFontSize,10,18)||!int(t.warningFontSize,10,18)||typeof t.showRules!=='boolean'||typeof t.showWarning!=='boolean')throw Error('Invalid ticket settings');
 if(!Array.isArray(p)||p.length>100)throw Error('Invalid prize count');
 for(const x of p)if(!x||!str(x.name,40)||!x.name.trim()||!['購物金','商品'].includes(x.type)||!int(x.weight,1,100000)||!int(x.quantity,0,1000000)||!int(x.issued,0,x.quantity))throw Error('Invalid prize data');
 if(!s||typeof s.enabled!=='boolean'||!int(s.volume,0,100)||!['short','double','triple'].includes(s.pattern))throw Error('Invalid sound settings');
 return {schema:'lottery-device-config',version:1,ticket:t,prizes:p,sound:s};
}
async function sha256(s){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')}
const sessionKey=async token=>'auth:session:'+await sha256(token);
const bearer=req=>{const h=req.headers.get('Authorization')||'';return h.startsWith('Bearer ')?h.slice(7):''};
const accountKey=name=>'auth:account:'+name;
const validName=name=>typeof name==='string'&&/^[A-Za-z0-9_-]{3,24}$/.test(name)&&name!=='Yuan';
const validFullName=name=>typeof name==='string'&&name.trim().length>=1&&name.trim().length<=40;
const validTemp=p=>typeof p==='string'&&/^\d{4}$/.test(p);
const validPermanent=p=>typeof p==='string'&&p.length>=8&&p.length<=12;

const PERMS=['dashboard','prizes_view','prizes_edit','ticket_view','ticket_edit','device_sync','sound_settings','device_config_view','redeem','redeem_history','accounts_view','accounts_manage','permissions_manage'];
const defaults=role=>role==='Admin'?[...PERMS]:['redeem'];
const permitted=(u,p)=>!!u&&(u.username==='Yuan'||(!u.mustChange&&u.permissions?.includes(p)));
const normalized=a=>Array.isArray(a.permissions)?PERMS.filter(p=>a.permissions.includes(p)):defaults(a.role);
const validPerms=p=>Array.isArray(p)&&p.length<=PERMS.length&&p.every(x=>PERMS.includes(x))&&new Set(p).size===p.length;

async function derive(password,salt){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256);
 return Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('');
}
async function identity(req,env){
 const token=bearer(req);if(!/^[a-f0-9]{64}$/.test(token))return null;
 const raw=await env.CONFIG_KV.get(await sessionKey(token));if(!raw)return null;
 if(raw==='Yuan')return {username:'Yuan',role:'Admin',mustChange:false,permissions:[...PERMS]};
 let session;try{session=JSON.parse(raw)}catch{return null}
 if(session?.username==='Yuan'&&session.role==='Admin')return {username:'Yuan',role:'Admin',mustChange:false,permissions:[...PERMS]};
 if(!validName(session?.username))return null;
 const a=await env.CONFIG_KV.get(accountKey(session.username),'json');
 if(!a||a.disabled||a.version!==session.version)return null;
 const role=a.role==='Admin'?'Admin':'User';
 return {username:session.username,role,mustChange:!!a.mustChange,permissions:normalized(a)};
}
async function isAdmin(req,env){
 if(equal(req.headers.get('Authorization')||'','Bearer '+env.ADMIN_API_KEY))return true;
 const u=await identity(req,env);return permitted(u,'accounts_manage');
}
async function readJSON(req,max=2048){
 if(Number(req.headers.get('content-length')||0)>max)throw Error('Too large');
 const raw=await req.text();if(new TextEncoder().encode(raw).length>max)throw Error('Too large');
 return JSON.parse(raw);
}
async function accounts(env,publicOnly=false){
 const out=publicOnly?['Yuan']:[{username:'Yuan',fullName:'Yuan',role:'Admin',disabled:false,mustChange:false,protected:true,permissions:[...PERMS]}];
 let cursor;
 do{
  const page=await env.CONFIG_KV.list({prefix:'auth:account:',limit:100,...(cursor?{cursor}:{})});
  for(const k of page.keys){
   const a=await env.CONFIG_KV.get(k.name,'json');if(!a)continue;
   const username=k.name.slice('auth:account:'.length);
   if(publicOnly){if(!a.disabled)out.push(username)}
   else out.push({username,fullName:a.fullName||'',role:a.role==='Admin'?'Admin':'User',disabled:!!a.disabled,mustChange:!!a.mustChange,permissions:normalized(a)});
  }
  cursor=page.list_complete?null:page.cursor;
 }while(cursor);
 return out;
}
const attemptKey=async username=>'auth:attempt:'+await sha256(username);
export default {async fetch(request,env){
 const origin=request.headers.get('Origin');
 const allowed=(env.ADMIN_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 const cors=origin&&allowed.includes(origin)?{'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Authorization,Content-Type','access-control-max-age':'600'}:{};
 if(request.method==='OPTIONS')return origin&&allowed.includes(origin)?new Response(null,{status:204,headers:cors}):json({error:'Origin not allowed'},403);
 const path=new URL(request.url).pathname;
 if(!env.CONFIG_KV||!env.ADMIN_API_KEY||!env.DEVICE_API_KEY)return json({error:'Server not configured'},503,cors);
 if(origin&&!allowed.includes(origin))return json({error:'Origin not allowed'},403,cors);
 if(path==='/auth/login'&&(!origin||!allowed.includes(origin)))return json({error:'Origin not allowed'},403,cors);
 const device=equal(request.headers.get('Authorization')||'','Bearer '+env.DEVICE_API_KEY);
 if(path.startsWith('/device/')&&!device)return json({error:'Unauthorized'},401,cors);
 try{
  if(path==='/auth/accounts'&&request.method==='GET')return json({accounts:await accounts(env,true)},200,cors);
  if(path==='/auth/login'&&request.method==='POST'){
   if(!env.ADMIN_LOGIN_PASSWORD)return json({error:'Login not configured'},503,cors);
   const body=await readJSON(request),name=body?.username;
   if(typeof name!=='string'||typeof body.password!=='string')return json({error:'帳號或密碼錯誤'},401,cors);
   const lockKey=await attemptKey(name),attempt=await env.CONFIG_KV.get(lockKey,'json');
   if(attempt?.until>Date.now())return json({error:'登入失敗次數過多，請稍後再試'},429,cors);
   let user=null,version=0,mustChange=false,permissions=[];
   if(name==='Yuan'&&equal(body.password,env.ADMIN_LOGIN_PASSWORD))user={username:'Yuan',role:'Admin'};
   else if(validName(name)){
    const a=await env.CONFIG_KV.get(accountKey(name),'json');
    if(a&&!a.disabled&&typeof a.salt==='string'&&typeof a.hash==='string'&&equal(await derive(body.password,a.salt),a.hash)){
     user={username:name,role:a.role==='Admin'?'Admin':'User'};version=a.version;mustChange=!!a.mustChange;permissions=normalized(a);
    }
   }
   if(!user){const count=(attempt?.count||0)+1;await env.CONFIG_KV.put(lockKey,JSON.stringify({count:count>=5?0:count,until:count>=5?Date.now()+15*60000:0}),{expirationTtl:900});return json({error:'帳號或密碼錯誤'},401,cors)}
   await env.CONFIG_KV.delete(lockKey);
   const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
   await env.CONFIG_KV.put(await sessionKey(token),JSON.stringify({...user,version}),{expirationTtl:SESSION_SECONDS});
   return json({ok:true,token,expiresIn:SESSION_SECONDS,...user,mustChange,permissions:user.username==='Yuan'?[...PERMS]:permissions},200,cors);
  }
  if(path==='/auth/me'&&request.method==='GET'){
   const u=await identity(request,env);return u?json({ok:true,...u},200,cors):json({error:'Unauthorized'},401,cors);
  }
  if(path==='/auth/logout'&&request.method==='POST'){
   const token=bearer(request);if(/^[a-f0-9]{64}$/.test(token))await env.CONFIG_KV.delete(await sessionKey(token));
   return json({ok:true},200,cors);
  }
  if(path==='/auth/change-password'&&request.method==='POST'){
   const u=await identity(request,env);
   if(!u||u.username==='Yuan')return json({error:'Unauthorized'},401,cors);
   const body=await readJSON(request);
   if(!validPermanent(body?.newPassword))return json({error:'正式密碼必須為 8～12 位'},400,cors);
   const key=accountKey(u.username),a=await env.CONFIG_KV.get(key,'json');
   if(!a||!equal(await derive(body?.currentPassword||'',a.salt),a.hash))return json({error:'目前密碼錯誤'},401,cors);
   if(body.currentPassword===body.newPassword)return json({error:'新密碼不可與臨時密碼相同'},400,cors);
   const salt=crypto.randomUUID(),hash=await derive(body.newPassword,salt);
   await env.CONFIG_KV.put(key,JSON.stringify({...a,salt,hash,mustChange:false,version:(a.version||0)+1}));
   const token=bearer(request);await env.CONFIG_KV.delete(await sessionKey(token));
   return json({ok:true,relogin:true},200,cors);
  }
  if(path.startsWith('/admin/')){
   const u=await identity(request,env),legacy=equal(request.headers.get('Authorization')||'','Bearer '+env.ADMIN_API_KEY);
   const needed=path==='/admin/accounts'?(request.method==='GET'?'accounts_view':'accounts_manage'):(path==='/admin/config'?'device_sync':'device_sync');
   if(!(legacy&&path!=='/admin/accounts')&&!permitted(u,needed))return json({error:'Forbidden'},403,cors);
  }
  if(path==='/admin/accounts'&&request.method==='GET')return json({accounts:await accounts(env)},200,cors);
  if(path==='/admin/accounts'&&request.method==='POST'){
   const body=await readJSON(request,2048);
   if(!validName(body?.username)||!['create','password','disable','enable','name','permissions','delete'].includes(body?.action))return json({error:'Invalid account or action'},400,cors);
   const key=accountKey(body.username),old=await env.CONFIG_KV.get(key,'json');
   if(body.action==='create'&&old)return json({error:'Account exists'},409,cors);
   if(body.action!=='create'&&!old)return json({error:'Account not found'},404,cors);
   if(body.action==='permissions'){
    const actor=await identity(request,env);
    if(!permitted(actor,'permissions_manage'))return json({error:'Forbidden'},403,cors);
    if(!validPerms(body.permissions))return json({error:'權限資料不正確'},400,cors);
    await env.CONFIG_KV.put(key,JSON.stringify({...old,permissions:body.permissions,version:(old.version||0)+1}));
   }else if(body.action==='delete'){
    const actor=await identity(request,env);
    if(!permitted(actor,'accounts_manage'))return json({error:'Forbidden'},403,cors);
    if(actor.username===body.username)return json({error:'不可刪除目前登入的帳號'},400,cors);
    await env.CONFIG_KV.delete(key);
   }else if(body.action==='create'){
    if(!validFullName(body.fullName)||!['Admin','User'].includes(body.role))return json({error:'請填寫姓名並選擇帳號權限'},400,cors);
    if(!validTemp(body.password))return json({error:'臨時密碼必須為 4 位數字'},400,cors);
    const salt=crypto.randomUUID(),hash=await derive(body.password,salt);
    await env.CONFIG_KV.put(key,JSON.stringify({salt,hash,fullName:body.fullName.trim(),role:body.role,disabled:false,mustChange:true,permissions:validPerms(body.permissions)?body.permissions:defaults(body.role),version:1}));
   }else if(body.action==='password'){
    if(!validTemp(body.password))return json({error:'臨時密碼必須為 4 位數字'},400,cors);
    const salt=crypto.randomUUID(),hash=await derive(body.password,salt);
    await env.CONFIG_KV.put(key,JSON.stringify({...old,salt,hash,mustChange:true,version:(old.version||0)+1}));
   }else if(body.action==='name'){
    if(!validFullName(body.fullName))return json({error:'請輸入姓名（1～40 字）'},400,cors);
    await env.CONFIG_KV.put(key,JSON.stringify({...old,fullName:body.fullName.trim()}));
   }else await env.CONFIG_KV.put(key,JSON.stringify({...old,disabled:body.action==='disable',version:(old.version||0)+1}));
   return json({ok:true},200,cors);
  }
  if(path==='/admin/config'&&request.method==='POST'){
   const config=validateConfig(await readJSON(request,12000)),revision=crypto.randomUUID();
   await env.CONFIG_KV.put(configKey,JSON.stringify({revision,config}));
   const ack=await env.CONFIG_KV.get(ackKey,'json');
   return json({ok:true,revision,deviceAckRevision:ack?.revision||null},200,cors);
  }
  if(path==='/admin/status'&&request.method==='GET'){
   const saved=await env.CONFIG_KV.get(configKey,'json'),ack=await env.CONFIG_KV.get(ackKey,'json');
   return json({revision:saved?.revision||null,deviceAckRevision:ack?.revision||null,deviceAckAt:ack?.at||null},200,cors);
  }
  if(path==='/device/config'&&request.method==='GET'){
   const saved=await env.CONFIG_KV.get(configKey,'json');
   return saved?json(saved,200,cors):json({error:'No config'},404,cors);
  }
  if(path==='/device/ack'&&request.method==='POST'){
   const data=await readJSON(request),saved=await env.CONFIG_KV.get(configKey,'json');
   if(!saved||data.revision!==saved.revision)return json({error:'Unknown revision'},409,cors);
   await env.CONFIG_KV.put(ackKey,JSON.stringify({revision:data.revision,at:new Date().toISOString()}));
   return json({ok:true},200,cors);
  }
  return json({error:'Not found'},404,cors);
 }catch(e){return json({error:e instanceof SyntaxError?'Invalid JSON':e.message||'Server error'},400,cors)}
}};
