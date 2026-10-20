// Cloudflare Worker: configuration synchronization ONLY. No voucher issuance or redemption.
const configKey='device:config';
const ackKey='device:ack';
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
export default {
  async fetch(request,env){
    const origin=request.headers.get('Origin');
    const allowed=(env.ADMIN_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
    const cors=origin&&allowed.includes(origin)?{'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Authorization,Content-Type','access-control-max-age':'600'}:{};
    if(request.method==='OPTIONS')return origin&&allowed.includes(origin)?new Response(null,{status:204,headers:cors}):json({error:'Origin not allowed'},403);
    const url=new URL(request.url),path=url.pathname;
    if(!env.CONFIG_KV||!env.ADMIN_API_KEY||!env.DEVICE_API_KEY)return json({error:'Server not configured'},503,cors);
    if(origin&&!allowed.includes(origin))return json({error:'Origin not allowed'},403,cors);
    const bearer=request.headers.get('Authorization')||'';
    const admin=constantTimeEqual(bearer,'Bearer '+env.ADMIN_API_KEY);
    const device=constantTimeEqual(bearer,'Bearer '+env.DEVICE_API_KEY);
    if(path.startsWith('/admin/')&&!admin)return json({error:'Unauthorized'},401,cors);
    if(path.startsWith('/device/')&&!device)return json({error:'Unauthorized'},401,cors);
    try{
      if(path==='/admin/config'&&request.method==='POST'){
        if(Number(request.headers.get('content-length')||0)>12000)return json({error:'Too large'},413,cors);
        const raw=await request.text();if(new TextEncoder().encode(raw).length>12000)return json({error:'Too large'},413,cors);
        const config=validateConfig(JSON.parse(raw));
        const old=await env.CONFIG_KV.get(configKey,'json');
        // Revision is a random id; only equality matters. No clock dependence.
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
        const data=await request.json();const saved=await env.CONFIG_KV.get(configKey,'json');
        if(!saved||data.revision!==saved.revision)return json({error:'Unknown revision'},409,cors);
        await env.CONFIG_KV.put(ackKey,JSON.stringify({revision:data.revision,at:new Date().toISOString()}));
        return json({ok:true},200,cors);
      }
      return json({error:'Not found'},404,cors);
    }catch(e){return json({error:e instanceof SyntaxError?'Invalid JSON':(e.message||'Server error')},400,cors)}
  }
};
