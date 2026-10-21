// Lottery configuration synchronization + admin login. No voucher issuance/redemption.
// Secrets: ADMIN_API_KEY, DEVICE_API_KEY, ADMIN_LOGIN_PASSWORD; KV: CONFIG_KV.
// ADMIN_ORIGINS: comma-separated exact origins, e.g. https://example.github.io
const configKey='device:config';
const ackKey='device:ack';
const SESSION_SECONDS=7*24*60*60;
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const constantTimeEqual=(a,b)=>{
  if(typeof a!=='string'||typeof b!=='string')return false;
  let diff=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
};
const isInt=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const validString=(s,max)=>typeof s==='string'&&s.length<=max;
function validateConfig(d){
  if(!d||d.schema!=='lottery-device-config'||d.version!==1)throw Error('Wrong schema/version');
  const t=d.ticket,s=d.sound,p=d.prizes;
  if(!t||!validString(t.store,40)||!validString(t.usage,3000)||!validString(t.rules,6000)||!validString(t.warning,3000)||!isInt(t.days,1,365)||![30,40,50,55,57,58].includes(t.paperWidth)||!['qr','code128'].includes(t.barcodeType)||!isInt(t.barcodeSize,60,100)||!isInt(t.rulesFontSize,10,18)||!isInt(t.warningFontSize,10,18)||typeof t.showRules!=='boolean'||typeof t.showWarning!=='boolean')throw Error('Invalid ticket settings');
  if(!Array.isArray(p)||p.length>100)throw Error('Invalid prize count');
  for(const item of p){if(!item||!validString(item.name,40)||!item.name.trim()||!['購物金','商品'].includes(item.type)||!isInt(item.weight,1,100000)||!isInt(item.quantity,0,1000000)||!isInt(item.issued,0,item.quantity))throw Error('Invalid prize data')}
  if(!s||typeof s.enabled!=='boolean'||!isInt(s.volume,0,100)||!['short','double','triple'].includes(s.pattern))throw Error('Invalid sound settings');
  return {schema:'lottery-device-config',version:1,ticket:t,prizes:p,sound:s};
}
async function tokenHash(token){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
async function sessionKey(token){return 'auth:session:'+await tokenHash(token)}
function bearerToken(request){const h=request.headers.get('Authorization')||'';return h.startsWith('Bearer ')?h.slice(7):''}
async function isAdmin(request,env){
  const h=request.headers.get('Authorization')||'';
  if(constantTimeEqual(h,'Bearer '+env.ADMIN_API_KEY))return true; // Backward compatibility
  const token=bearerToken(request);
  if(!/^[a-f0-9]{64}$/.test(token))return false;
  return (await env.CONFIG_KV.get(await sessionKey(token)))==='Yuan';
}
async function readSmallJSON(request,max=2048){
  if(Number(request.headers.get('content-length')||0)>max)throw Error('Too large');
  const raw=await request.text();
  if(new TextEncoder().encode(raw).length>max)throw Error('Too large');
  return JSON.parse(raw);
}
export default {
  async fetch(request,env){
    const origin=request.headers.get('Origin');
    const allowed=(env.ADMIN_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
    const cors=origin&&allowed.includes(origin)?{'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Authorization,Content-Type','access-control-max-age':'600'}:{};
    if(request.method==='OPTIONS')return origin&&allowed.includes(origin)?new Response(null,{status:204,headers:cors}):json({error:'Origin not allowed'},403);
    const url=new URL(request.url),path=url.pathname;
    if(!env.CONFIG_KV||!env.ADMIN_API_KEY||!env.DEVICE_API_KEY)return json({error:'Server not configured'},503,cors);
    if(origin&&!allowed.includes(origin))return json({error:'Origin not allowed'},403,cors);
    // Login is only permitted from the approved browser origin.
    if(path==='/auth/login'&&(!origin||!allowed.includes(origin)))return json({error:'Origin not allowed'},403,cors);
    const device=constantTimeEqual(request.headers.get('Authorization')||'','Bearer '+env.DEVICE_API_KEY);
    if(path.startsWith('/device/')&&!device)return json({error:'Unauthorized'},401,cors);
    try{
      if(path==='/auth/login'&&request.method==='POST'){
        if(!env.ADMIN_LOGIN_PASSWORD)return json({error:'Login not configured'},503,cors);
        const body=await readSmallJSON(request);
        const good=body&&body.username==='Yuan'&&typeof body.password==='string'&&constantTimeEqual(body.password,env.ADMIN_LOGIN_PASSWORD);
        if(!good)return json({error:'帳號或密碼錯誤'},401,cors);
        const bytes=crypto.getRandomValues(new Uint8Array(32));
        const token=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
        await env.CONFIG_KV.put(await sessionKey(token),'Yuan',{expirationTtl:SESSION_SECONDS});
        return json({ok:true,token,expiresIn:SESSION_SECONDS,username:'Yuan'},200,cors);
      }
      if(path==='/auth/me'&&request.method==='GET'){
        return await isAdmin(request,env)?json({ok:true,username:'Yuan'},200,cors):json({error:'Unauthorized'},401,cors);
      }
      if(path==='/auth/logout'&&request.method==='POST'){
        const token=bearerToken(request);
        if(/^[a-f0-9]{64}$/.test(token))await env.CONFIG_KV.delete(await sessionKey(token));
        return json({ok:true},200,cors);
      }
      if(path.startsWith('/admin/')&&!(await isAdmin(request,env)))return json({error:'Unauthorized'},401,cors);
      if(path==='/admin/config'&&request.method==='POST'){
        const config=validateConfig(await readSmallJSON(request,12000));
        const revision=crypto.randomUUID();
        await env.CONFIG_KV.put(configKey,JSON.stringify({revision,config}));
        const ack=await env.CONFIG_KV.get(ackKey,'json');
        return json({ok:true,revision,deviceAckRevision:ack?.revision||null},200,cors);
      }
      if(path==='/admin/status'&&request.method==='GET'){
        const saved=await env.CONFIG_KV.get(configKey,'json');const ack=await env.CONFIG_KV.get(ackKey,'json');
        return json({revision:saved?.revision||null,deviceAckRevision:ack?.revision||null,deviceAckAt:ack?.at||null},200,cors);
      }
      if(path==='/device/config'&&request.method==='GET'){
        const saved=await env.CONFIG_KV.get(configKey,'json');
        return saved?json(saved,200,cors):json({error:'No config'},404,cors);
      }
      if(path==='/device/ack'&&request.method==='POST'){
        const data=await readSmallJSON(request);const saved=await env.CONFIG_KV.get(configKey,'json');
        if(!saved||data.revision!==saved.revision)return json({error:'Unknown revision'},409,cors);
        await env.CONFIG_KV.put(ackKey,JSON.stringify({revision:data.revision,at:new Date().toISOString()}));
        return json({ok:true},200,cors);
      }
      return json({error:'Not found'},404,cors);
    }catch(e){return json({error:e instanceof SyntaxError?'Invalid JSON':(e.message||'Server error')},400,cors)}
  }
};
