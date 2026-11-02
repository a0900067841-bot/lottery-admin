// YIQI LOTTERY SINGLE WORKER CANDIDATE. DO NOT DEPLOY BEFORE REVIEW / LIVE GATES.
// Source modules are embedded into separate scopes.

const __mods = Object.create(null);

// ==== SOURCE: handoff-operator.mjs ====
__mods["handoff-operator.mjs"] = (() => {

/* Human-attested physical paper handoff. This is NOT a printer acknowledgement. */
const send=(body,status,cors={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store',...cors}});
async function verifyPhysicalDelivery(request,env,{actor=null,cors={}}={}) {
  if(request.method!=='POST')return send({ok:false,error:'Method not allowed'},405,cors);
  if(!actor||actor.role!=='Admin'||actor.mustChange||typeof actor.username!=='string')return send({ok:false,error:'Admin session required'},403,cors);
  if(!env.DB)return send({ok:false,error:'D1 unavailable'},503,cors);
  let b;try{b=await request.json();}catch{return send({ok:false,error:'Invalid JSON'},400,cors);}
  if(!b||typeof b.ticketId!=='string'||b.ticketId.length>128||!b.ticketId||b.confirmedPhysicalPaper!==true||b.confirmedHandedToHolder!==true)
    return send({ok:false,error:'Explicit physical paper confirmation required'},400,cors);
  const now=new Date().toISOString();
  try {
    const r=await env.DB.prepare(`UPDATE lottery_print_handoffs
       SET state='verified_delivered',operator_verified_at=?,operator_verified_by=?,updated_at=?
       WHERE ticket_id=? AND state IN ('uncertain','reported_printed')
         AND EXISTS (SELECT 1 FROM lottery_tickets t WHERE t.id=lottery_print_handoffs.ticket_id AND t.status='issued' AND t.voided_at IS NULL)
       RETURNING ticket_id,state,operator_verified_at`).bind(now,actor.username,now,b.ticketId).first();
    if(!r)return send({ok:false,error:'Ticket not eligible for delivery verification'},409,cors);
    // A database trigger inserts immutable audit evidence atomically with UPDATE.
    return send({ok:true,ticketId:r.ticket_id,state:r.state,operatorVerifiedAt:r.operator_verified_at,printAllowed:false},200,cors);
  }catch{return send({ok:false,error:'Delivery verification unavailable; remain locked'},503);}
}

return {verifyPhysicalDelivery};
})();

// ==== SOURCE: prize-d1-readback.mjs ====
__mods["prize-d1-readback.mjs"] = (() => {

/* Authorized, bounded, read-only D1 snapshot. Never writes to database or KV. */
const respond=(data,status=200,cors={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...cors}});
async function handlePrizeD1Readback(env,{actor,cors={}}={}){
  if(!actor || actor.mustChange || !Array.isArray(actor.permissions) || !actor.permissions.includes('prizes_view') || !actor.permissions.includes('device_sync'))return respond({ok:false,error:'Forbidden'},403,cors);
  if(!env.DB?.prepare || !env.CONFIG_KV?.get)return respond({ok:false,error:'D1/KV unavailable'},503,cors);
  try {
    const result=await env.DB.prepare('SELECT id,name,type,weight,quantity,issued,enabled FROM lottery_prizes ORDER BY id LIMIT 101').all();
    if(!result || result.success===false || !Array.isArray(result.results) || result.results.length>100)throw Error('D1 snapshot unavailable or exceeds limit');
    const prizes=result.results.map(p=>{
      if(typeof p.id!=='string'||typeof p.name!=='string'||!Number.isSafeInteger(p.quantity)||!Number.isSafeInteger(p.issued)||p.issued<0||p.quantity<p.issued)throw Error('Invalid D1 prize row');
      return {id:p.id,name:p.name,type:p.type,weight:p.weight,quantity:p.quantity,issued:p.issued,remaining:p.quantity-p.issued,enabled:p.enabled===1};
    });
    const config=await env.CONFIG_KV.get('device:config','json');
    const state=await env.DB.prepare('SELECT revision FROM lottery_prize_sync_state WHERE singleton=1').first().catch(()=>null);
    return respond({ok:true,readOnly:true,cloudRevision:config?.revision??null,appliedRevision:state?.revision??null,prizes},200,cors);
  } catch {return respond({ok:false,error:'D1 readback unavailable; no changes made'},409,cors)}
}

return {handlePrizeD1Readback};
})();

// ==== SOURCE: device-restart-admin.mjs ====
__mods["device-restart-admin.mjs"] = (() => {

// Fail-closed management entry for future ESP32 software restart.
// No device command is issued here; firmware-side NVS/print guards must pass integration tests first.
const reply=(body,status,cors)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...cors}});
function handleRestartAdmin(request,env,{actor,cors={}}={}){
  if(!actor||actor.role!=='Admin'||actor.mustChange||!Array.isArray(actor.permissions)||!actor.permissions.includes('accounts_manage'))
    return reply({error:'僅允許已登入的管理員使用設備維護'},403,cors);
  const path=new URL(request.url).pathname;
  if(path==='/admin/device/restart/status'&&request.method==='GET')
    return reply({ok:true,available:false,deviceCommandReady:false,reason:'ESP32 尚未完成重啟命令接收、NVS 交易鎖定與列印中斷保護；為避免重複發券，禁止遠端重啟。'},200,cors);
  if(path==='/admin/device/restart'&&request.method==='POST')
    return reply({ok:false,queued:false,error:'安全保護：遠端重新啟動尚未啟用，未送出任何指令。'},423,cors);
  return reply({error:'Method not allowed'},405,{...cors,allow:path.endsWith('/status')?'GET':'POST'});
}

return {handleRestartAdmin};
})();

// ==== SOURCE: prize-sync.mjs ====
__mods["prize-sync.mjs"] = (() => {

/* D1 prize synchronization: stable identity, non-destructive fail-closed. NOT DEPLOYED. */
const allowedTypes = new Set(['購物金', '商品']);
const validId = id => typeof id === 'string' && /^prize_[a-f0-9]{32}$/.test(id);
function withNewPrizeIds(config) {
  if (!config || !Array.isArray(config.prizes)) throw Error('Invalid prizes');
  // Use once for newly created prizes, and persist the returned IDs with the original config.
  // Do not run on an existing D1-backed collection without reconciliation/backup.
  return {...config, prizes:config.prizes.map(p => ({...p, id:p.id || `prize_${crypto.randomUUID().replace(/-/g, '')}`}))};
}
function validatePrizeSnapshot(config) {
  if (!config || !Array.isArray(config.prizes) || config.prizes.length > 100) throw Error('Invalid prizes');
  const seen = new Set();
  return config.prizes.map(p => {
    if (!p || !validId(p.id) || seen.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 40 || /[\x00-\x1f]/.test(p.name) || !allowedTypes.has(p.type) || !Number.isSafeInteger(p.weight) || p.weight < 1 || p.weight > 100000 || !Number.isSafeInteger(p.quantity) || p.quantity < 0 || p.quantity > 1000000) throw Error('Invalid prize / missing or duplicate stable ID');
    seen.add(p.id);
    return {id:p.id,name:p.name.trim(),type:p.type,weight:p.weight,quantity:p.quantity};
  });
}
async function syncPrizeSnapshot(db, config, {disableMissing=true, expectedRevision=null, previousAppliedRevision=null}={}) {
  if (!db?.prepare || !db?.batch) throw Error('D1 database required');
  const entries = validatePrizeSnapshot(config);
  // Empty snapshots are allowed, but only disable prizes; never delete audit/history.
  // A single D1 transaction serializes prize snapshots and rejects stale revisions.
  // KV updates are separate: callers must keep the sync feature gated and re-preview after config changes.
  if (expectedRevision !== null && (typeof expectedRevision !== 'string' || !expectedRevision)) throw Error('Invalid expected revision');
  // Guarded write: each successful sync advances the D1 applied revision.
  // The trigger aborts the entire D1 batch when the expected prior revision is stale.
  const statements = [];
  if(expectedRevision !== null) {
    if(previousAppliedRevision !== null && (typeof previousAppliedRevision !== 'string'||!previousAppliedRevision)) throw Error('Invalid previous revision');
    statements.push(db.prepare(`INSERT INTO lottery_prize_sync_state(singleton,revision) VALUES(1,?)
      ON CONFLICT(singleton) DO UPDATE SET revision=excluded.revision
      WHERE lottery_prize_sync_state.revision IS ?
        AND lottery_prize_sync_state.revision <> excluded.revision`).bind(expectedRevision, previousAppliedRevision));
    statements.push(db.prepare(`INSERT INTO lottery_prize_sync_assert(expected)
      VALUES(?)`).bind(expectedRevision));
  }
  statements.push(...entries.map(x => db.prepare(`INSERT INTO lottery_prizes(id,name,type,weight,quantity,enabled)
    VALUES(?,?,?,?,?,1)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,type=excluded.type,weight=excluded.weight,quantity=excluded.quantity,enabled=1`).bind(x.id,x.name,x.type,x.weight,x.quantity)));
  // Preserve issued count; SQL constraint/trigger rejects shrinking below issued count.
  if (disableMissing && entries.length) {
    const placeholders = entries.map(()=>'?').join(',');
    statements.push(db.prepare(`UPDATE lottery_prizes SET enabled=0 WHERE id NOT IN (${placeholders})`).bind(...entries.map(x=>x.id)));
  } else if(disableMissing) statements.push(db.prepare('UPDATE lottery_prizes SET enabled=0'));
  const results = await db.batch(statements);
  if (!Array.isArray(results) || results.length !== statements.length || results.some(r=>r.success===false)) throw Error('Prize sync failed');
  return {count:entries.length, prizeIds:entries.map(x=>x.id)};
}

return {withNewPrizeIds, validatePrizeSnapshot, syncPrizeSnapshot};
})();

// ==== SOURCE: prize-sync-preflight.mjs ====
__mods["prize-sync-preflight.mjs"] = (() => {
const {validatePrizeSnapshot} = __mods["prize-sync.mjs"];
/* Read-only preflight. Never writes, allocates IDs, or guesses legacy prize identity. */
const validId = id => typeof id === 'string' && /^prize_[a-f0-9]{32}$/.test(id);

function inspectPrizeSync(config, remoteRows, {remoteReadComplete=false, allowDisableMissing=false}={}) {
  const proposed = validatePrizeSnapshot(config);
  if (!remoteReadComplete || !Array.isArray(remoteRows)) throw new Error('D1 全量唯讀快照尚未確認，禁止同步');
  const remoteIds = new Set();
  const remoteNames = new Map();
  for (const r of remoteRows) {
    if (!r || typeof r.id!=='string' || remoteIds.has(r.id) || typeof r.name!=='string') throw new Error('D1 資料不完整或 ID 重複，禁止同步');
    // Reject *all* unconfirmed legacy rows, including rows absent from the incoming config.
    // Otherwise a newly allocated ID could silently treat an existing legacy prize as new.
    if (!validId(r.id)) throw new Error('D1 存在尚未人工對照的舊式獎項 ID，禁止同步');
    remoteIds.add(r.id);
    const key=`${r.type??''}\u0000${r.name.trim()}`;
    if (!remoteNames.has(key)) remoteNames.set(key, []);
    remoteNames.get(key).push(r.id);
  }
  const proposedIds = new Set(proposed.map(x=>x.id));
  const added=[],updated=[],disabled=[];
  for(const p of proposed) {
    const old=remoteRows.find(r=>r.id===p.id);
    if(old) {
      if(!validId(old.id)) throw new Error('D1 舊版 ID 需要人工對照，禁止同步');
      if(!Number.isSafeInteger(old.issued) || old.issued<0 || p.quantity<old.issued) throw new Error(`獎項 ${p.name} 庫存不足或已發數不明，禁止同步`);
      updated.push(p.id);
    } else {
      const exact=remoteNames.get(`${p.type}\u0000${p.name}`)||[];
      if(exact.length) throw new Error(`獎項 ${p.name} 疑似舊資料 ID 不一致，須人工對照`);
      added.push(p.id);
    }
  }
  for(const r of remoteRows) if(!proposedIds.has(r.id)) disabled.push(r.id);
  // In the absence of an exact identity match, a rename cannot be distinguished from
  // a deleted prize plus a new prize. Refuse combined add/disable operations.
  if(added.length && disabled.length) throw new Error('同時新增與停用獎項，可能是改名或舊資料遷移，須人工確認');
  if(disabled.length && !allowDisableMissing) throw new Error('存在未包含於本次設定的 D1 獎項，預設禁止停用');
  return {safeToPropose:true, readOnly:true, added,updated,disabled, remoteCount:remoteRows.length, localCount:proposed.length};
}

return {inspectPrizeSync};
})();

// ==== SOURCE: prize-sync-preview.mjs ====
__mods["prize-sync-preview.mjs"] = (() => {
const {inspectPrizeSync} = __mods["prize-sync-preflight.mjs"];
/* Read-only D1 prize synchronization preview. No writes and no automatic migration. */
const respond=(payload,status=200,cors={})=>new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...cors}});
async function handlePrizeSyncPreview(env,{actor,cors={}}={}) {
  // Explicit permission required, not merely Admin role.
  if(!actor || actor.mustChange || !Array.isArray(actor.permissions) || !actor.permissions.includes('prizes_edit') || !actor.permissions.includes('device_sync'))return respond({ok:false,error:'Forbidden'},403,cors);
  if(!env.DB?.prepare || !env.CONFIG_KV?.get)return respond({ok:false,error:'D1/KV unavailable'},503,cors);
  const configRecord=await env.CONFIG_KV.get('device:config','json');
  const config=configRecord?.config;
  if(!config || !Array.isArray(config.prizes))return respond({ok:false,error:'No saved cloud prize configuration'},409,cors);
  let rows;
  try {
    const result=await env.DB.prepare('SELECT id,name,type,weight,quantity,issued,enabled FROM lottery_prizes ORDER BY id LIMIT 101').all();
    if(!result || result.success===false || !Array.isArray(result.results))throw Error('Incomplete D1 result');
    if(result.results.length>100)return respond({ok:false,error:'D1 prize count exceeds preview limit'},409,cors);
    rows=result.results;
  } catch(e) {
    return respond({ok:false,error:'D1 schema/query unavailable; no changes made'},409,cors);
  }
  try {
    const plan=inspectPrizeSync(config,rows,{remoteReadComplete:true});
    return respond({ok:true,readOnly:true,revision:configRecord.revision,plan},200,cors);
  } catch(e) {
    return respond({ok:false,readOnly:true,error:e.message||'Preflight rejected'},409,cors);
  }
}

return {handlePrizeSyncPreview};
})();

// ==== SOURCE: handoff-start.mjs ====
__mods["handoff-start.mjs"] = (() => {
// One-shot transfer start. This is NOT evidence that a paper ticket was printed.
const send=(data,status)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
async function startHandoff(request,env,{deviceAuthorized=false}={}) {
  if(!deviceAuthorized)return send({ok:false,error:'Unauthorized'},401);
  if(request.method!=='POST')return send({ok:false,error:'Method not allowed'},405);
  if(!env.DB?.prepare||!env.LOTTERY_DEVICE_ID)return send({ok:false,error:'D1/device configuration unavailable'},503);
  let b;
  try{const raw=await request.text();if(new TextEncoder().encode(raw).length>1024)throw Error('large');b=JSON.parse(raw)}
  catch{return send({ok:false,error:'Invalid request'},400)}
  if(!b||!(/^[a-f0-9]{32}$/.test(b.requestId||''))||typeof b.deviceId!=='string'||b.deviceId!==env.LOTTERY_DEVICE_ID)
    return send({ok:false,error:'Invalid device/request'},400);
  try{
    const now=new Date().toISOString();
    // Atomic compare-and-swap: ONLY the first transition grants permission.
    const changed=await env.DB.prepare(`UPDATE lottery_print_handoffs
       SET state='sending', updated_at=?
       WHERE request_id=? AND device_id=? AND state='prepared' AND print_attempts=1
       AND EXISTS (SELECT 1 FROM lottery_tickets t
         WHERE t.id=lottery_print_handoffs.ticket_id AND t.request_id=? AND t.device_id=?
           AND t.status='issued' AND t.voided_at IS NULL AND t.expires_at>?)
       RETURNING ticket_id,state`).bind(now,b.requestId,b.deviceId,b.requestId,b.deviceId,now).first();
    if(changed)return send({ok:true,requestId:b.requestId,ticketId:changed.ticket_id,state:'sending',printAllowed:true},200);
    const record=await env.DB.prepare('SELECT state FROM lottery_print_handoffs WHERE request_id=? AND device_id=?')
      .bind(b.requestId,b.deviceId).first();
    // A retry MUST NEVER grant a second permission, including after network loss.
    return send({ok:false,requestId:b.requestId,state:record?.state||'missing',printAllowed:false,error:'Print start already consumed or ineligible; manual review required'},409);
  }catch{return send({ok:false,printAllowed:false,error:'Start unavailable; no automatic print'},503)}
}
return {startHandoff};
})();

// ==== SOURCE: handoff-report.mjs ====
__mods["handoff-report.mjs"] = (() => {

/* Fail-closed device report. Does not verify physical delivery or authorize reprinting. */
const out=(data,status)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
async function reportUncertainHandoff(request,env,{deviceAuthorized=false}={}) {
  if (!deviceAuthorized) return out({ok:false,error:'Unauthorized'},401);
  if (request.method!=='POST') return out({ok:false,error:'Method not allowed'},405);
  if (!env.DB||!env.LOTTERY_DEVICE_ID) return out({ok:false,error:'Delivery ledger unavailable'},503);
  let b;
  try { b=await request.json(); } catch { return out({ok:false,error:'Invalid JSON'},400); }
  if (!b||!['print_uncertain','print_reported'].includes(b.event)||typeof b.requestId!=='string'||!/^[a-f0-9]{32}$/.test(b.requestId)||typeof b.deviceId!=='string'||b.deviceId!==env.LOTTERY_DEVICE_ID) return out({ok:false,error:'Invalid device/request/event'},400);
  try {
    const t=await env.DB.prepare('SELECT id, device_id, request_id FROM lottery_tickets WHERE request_id = ?').bind(b.requestId).first();
    if (!t) return out({ok:false,error:'Unknown ticket'},404);
    if (t.device_id!==b.deviceId||t.request_id!==b.requestId) return out({ok:false,error:'Ticket/device mismatch'},403);
    const now=new Date().toISOString();
    // Device report is NOT proof of physical handoff. Preserve verified state.
    // A reported print can upgrade an uncertain result, never authorize a second print.
    const state=b.event==='print_reported'?'reported_printed':'uncertain';
    // Reports must NEVER create a reservation. Only the issuer can reserve
    // the one permitted print attempt before the device receives printAllowed.
    const updated=await env.DB.prepare(`UPDATE lottery_print_handoffs
      SET state=CASE WHEN ?='reported_printed' THEN 'reported_printed'
                     WHEN state='sending' THEN 'uncertain' ELSE state END,
          updated_at=?
      WHERE ticket_id=? AND device_id=? AND request_id=?
        AND print_attempts=1
        AND state IN ('sending','uncertain','reported_printed')`)
      .bind(state,now,t.id,b.deviceId,b.requestId).run();
    if(updated?.success===false) return out({ok:false,error:'Print report update failed'},503);
    const record=await env.DB.prepare('SELECT state,print_attempts FROM lottery_print_handoffs WHERE ticket_id=? AND device_id=? AND request_id=?').bind(t.id,b.deviceId,b.requestId).first();
    if (!record || record.print_attempts!==1 || !['uncertain','reported_printed','verified_delivered'].includes(record.state))
      return out({ok:false,error:'No valid print reservation; manual review required'},409);
    return out({ok:true,requestId:b.requestId,state:record.state,printAllowed:false,deliveryVerified:false},200);
  } catch { return out({ok:false,error:'Delivery report unavailable; remain locked'},503); }
}

return {reportUncertainHandoff};
})();

// ==== SOURCE: ticket-api.mjs ====
__mods["ticket-api.mjs"] = (() => {

/* Candidate ticket routes for EXISTING Cloudflare Worker; NOT installed or deployed.
   Integrate by adding a route dispatch BEFORE the existing not-found return.
   Existing Worker must supply validated `actor` and `deviceAuthorized` explicitly.
   All operations depend on D1 (env.DB), not KV or browser localStorage.
*/
const json=(value,status=200,cors={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store',...cors}});
const safe=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=max&& !/[\x00-\x1f]/.test(s);
const optionalStore=s=>typeof s==='string'&&s.length<=40&&!/[\x00-\x1f]/.test(s);
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
async function sha256(s){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));}
// Immutable, ESP32-compatible ticket terms. Keep exact JSON bytes for digest verification.
function freezeTicketTerms(config){
 const t=config?.ticket;
 // ESP32 validates UTF-8 byte lengths, not JavaScript UTF-16 string lengths.
 // Reject oversized Chinese text BEFORE a ticket or inventory is committed.
 const bytes=s=>typeof s==='string'?new TextEncoder().encode(s).length:Infinity;
 if(!t||bytes(t.store)>40||bytes(t.usage)>1024||!t.usage?.trim()||
    bytes(t.rules)>2048||bytes(t.warning)>1024||
    typeof t.showRules!=='boolean'||typeof t.showWarning!=='boolean'||
    (t.showRules&&!t.rules?.trim())||(t.showWarning&&!t.warning?.trim()))
    throw Error('Incomplete immutable ticket terms');
 const frozen={store:t.store,usage:t.usage,rules:t.rules,warning:t.warning,
    showRules:t.showRules,showWarning:t.showWarning,days:t.days,
    paperWidth:t.paperWidth,barcodeType:t.barcodeType,barcodeSize:t.barcodeSize,
    rulesFontSize:t.rulesFontSize,warningFontSize:t.warningFontSize};
 const canonicalJson=JSON.stringify(frozen);
 if(bytes(canonicalJson)>4096)throw Error('Frozen terms exceed ESP32 buffer limit');
 return canonicalJson;
}

// The secret is derived from immutable ticket/request identifiers with a stable,
// independently managed server-side 256-bit HMAC key. Never log or expose this key.
// Rotating / losing the key prevents recovery of previously issued QR values.
async function ticketSecret(keyHex,ticketId,requestId){
 if(typeof keyHex!=='string'||!/^[0-9a-f]{64}$/i.test(keyHex))throw Error('Issue recovery key missing or invalid');
 const keyBytes=Uint8Array.from(keyHex.match(/../g),h=>parseInt(h,16));
 const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const payload=new TextEncoder().encode(`YIQI-ISSUE-QR-v1\n${ticketId}\n${requestId}`);
 return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,payload)));
}
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9:_-]{8,100}$/.test(s);
const validUUID=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const safeFetch=async req=>{const s=await req.text(); if(s.length>4000)throw Error('Payload too large');return JSON.parse(s);};
const allowed=(a,p)=>!!a&&!a.mustChange&&Array.isArray(a.permissions)&&a.permissions.includes(p);
const isAdmin=a=>a?.role==='Admin'&&allowed(a,'accounts_manage');
const canRedeem=a=>allowed(a,'redeem');
const publicTicket=t=>({id:t.id,storeName:t.store_name,prizeName:t.prize_name,isTest:!!t.is_test,status:t.voided_at?'void':t.status,issuedAt:t.issued_at,expiresAt:t.expires_at,redeemedAt:t.redeemed_at,voidedAt:t.voided_at});
const err=(m,s,c)=>json({ok:false,error:m},s,c);
async function handleTicketRequest(request,env,{actor=null,deviceAuthorized=false,internalDeviceIssue=false,cors={}}={}){
 const url=new URL(request.url);const path=url.pathname;const method=request.method;
 if(!path.startsWith('/tickets/'))return null;
 if(!env.DB)return err('D1 database is not configured',503,cors);
 try{
  if(path==='/tickets/prizes'&&method==='GET'){
   if(!allowed(actor,'prizes_view'))return err('Prize view permission required',403,cors);
   const found=await env.DB.prepare('SELECT id,name,quantity,issued,enabled FROM lottery_prizes ORDER BY name LIMIT 100').all();
   return json({ok:true,items:found.results||[]},200,cors);
  }
  if(path==='/tickets/prizes'&&method==='POST'){
   // DISABLED: individual prize writes bypass D1 sync revision and could make
   // an already-approved configuration appear unchanged. Use gated whole-snapshot
   // sync route (handlePrizeSyncApply) after preflight and admin authorization.
   return err('Direct prize changes disabled; use reviewed atomic sync',409,cors);
  }
  if(path==='/tickets/issue'&&method==='POST'){
   // Device credentials alone must never choose a winner. The trusted bridge
   // invokes this internal issuer only after server-side prize selection.
   if(!deviceAuthorized||internalDeviceIssue!==true)return err('Direct prize selection prohibited',403,cors);
   const b=await safeFetch(request);
   if(!validId(b.requestId)||!safe(b.deviceId,80)||!validId(b.prizeId))return err('Invalid issue request',400,cors);
   // Server decides test/production only for record classification, never for the printed store name.
   // Keep the ORIGINAL ticket-template rule: configured store shows; blank store does not show.
   // The existing /admin/config writes {revision,config:{ticket:{store,days},...}} into CONFIG_KV.
   const mode=env.LOTTERY_ISSUE_MODE;
   const saved=await env.CONFIG_KV?.get('device:config','json');
   const expectedRevision=saved?.revision;
   const state=await env.DB.prepare('SELECT revision FROM lottery_prize_sync_state WHERE singleton=1').first();
   if(!expectedRevision||state?.revision!==expectedRevision)return err('Prize configuration revision is not synchronized',409,cors);
   const storeName=saved?.config?.ticket?.store;
   const isTest=mode==='test';
   const days=saved?.config?.ticket?.days;
   if(!['test','production'].includes(mode)||!optionalStore(storeName)||!Number.isSafeInteger(days)||days<1||days>365||
      !safe(env.LOTTERY_DEVICE_ID,80)||!(/^[0-9a-f]{64}$/i.test(env.LOTTERY_QR_HMAC_KEY||'')))return err('Issuance disabled: server configuration incomplete',503,cors);
   if(b.deviceId!==env.LOTTERY_DEVICE_ID)return err('Device identity not allowed',403,cors);
   // Same request ID is an idempotency key. Recovery is deliberately restricted
   // to the same authenticated device, same prize, same issue mode and valid ticket.
   const recover=async()=>{
    const prior=await env.DB.prepare('SELECT id,request_id,device_id,prize_id,token_sha256,redeem_code,store_name,prize_name,is_test,status,issued_at,expires_at,voided_at FROM lottery_tickets WHERE request_id=?').bind(b.requestId).first();
    if(!prior)return null;
    if(prior.device_id!==b.deviceId||prior.prize_id!==b.prizeId||!!prior.is_test!==isTest)return err('Request identifier reused with different parameters',409,cors);
    if(prior.status!=='issued'||prior.voided_at||prior.expires_at<=new Date().toISOString())return err('Ticket no longer printable',409,cors);
    const restored=await ticketSecret(env.LOTTERY_QR_HMAC_KEY,prior.id,prior.request_id);
    if(await sha256(restored)!==prior.token_sha256)return err('Ticket recovery integrity check failed',409,cors);
    return json({ok:true,replayed:true,ticketId:prior.id,redeemCode:prior.redeem_code,qrValue:`YIQI1.${prior.id}.${restored}`,storeName:prior.store_name,prizeName:prior.prize_name,isTest:!!prior.is_test,issuedAt:prior.issued_at,expiresAt:prior.expires_at},200,cors);
   };
   const priorResponse=await recover();
   if(priorResponse)return priorResponse;
   // Fail BEFORE issuance if the B3S cannot render a valid frozen snapshot.
   let termsJson;try{termsJson=freezeTicketTerms(saved.config);}catch{return err('Ticket terms incomplete; cannot print',409,cors);}
   const termsHash=await sha256(termsJson);
   const now=new Date(), expires=new Date(now.getTime()+days*86400000),id=crypto.randomUUID(),secret=await ticketSecret(env.LOTTERY_QR_HMAC_KEY,id,b.requestId),redeemCode=hex(crypto.getRandomValues(new Uint8Array(12))).toUpperCase(),digest=await sha256(secret);
   // ESP32 frozen-terms client allows at most 8192 UTF-8 bytes for the ENTIRE
   // JSON response. The convenience ticket object duplicates much of the
   // canonicalJson and can push an otherwise-valid 4096-byte snapshot over
   // that limit. Reject before the D1 ticket/stock/print batch is committed.
   const frozenTerms=JSON.parse(termsJson);
   const projectedTermsResponse={ok:true,requestId:b.requestId,
     deviceId:b.deviceId,ticketId:id,termsSnapshot:{revision:expectedRevision,
     sha256:termsHash,canonicalJson:termsJson,frozenAt:now.toISOString(),
     ticket:frozenTerms}};
   if(new TextEncoder().encode(JSON.stringify(projectedTermsResponse)).length>8192)
     return err('Ticket terms response exceeds ESP32 receive limit',409,cors);
   // Ticket, stock trigger, issue audit, and single-print reservation must commit
   // together. D1 batch is transactional: if reservation fails, no ticket/stock survives.
   if(!env.DB?.batch)return err('Transactional issuance unavailable',503,cors);
   let results;
   try{
    results=await env.DB.batch([
      env.DB.prepare(`INSERT INTO lottery_tickets(id,redeem_code,request_id,device_id,store_name,prize_id,prize_name,token_sha256,is_test,status,issued_at,expires_at)
        SELECT ?,?,?,?,?,id,name,?,?,'issued',?,? FROM lottery_prizes
        WHERE id=? AND enabled=1 AND (?=1 OR issued<quantity)
          AND EXISTS (SELECT 1 FROM lottery_prize_sync_state WHERE singleton=1 AND revision=?)`)
        .bind(id,redeemCode,b.requestId,b.deviceId,storeName,digest,isTest?1:0,now.toISOString(),expires.toISOString(),b.prizeId,isTest?1:0,expectedRevision),
      env.DB.prepare(`INSERT INTO lottery_print_handoffs
        (ticket_id,device_id,request_id,state,created_at,updated_at,print_attempts)
        SELECT id,device_id,request_id,'prepared',?,?,1 FROM lottery_tickets
        WHERE id=? AND request_id=? AND device_id=?`)
        .bind(now.toISOString(),now.toISOString(),id,b.requestId,b.deviceId),
      env.DB.prepare(`INSERT INTO lottery_ticket_terms_snapshots
        (request_id,ticket_id,config_revision,terms_json,terms_sha256,frozen_at)
        VALUES(?,?,?,?,?,?)`)
        .bind(b.requestId,id,expectedRevision,termsJson,termsHash,now.toISOString())
    ]);
   }catch(e){
    if(/UNIQUE constraint failed/i.test(e?.message||'')){
     const concurrent=await recover();
     if(concurrent)return concurrent;
     return err('Request conflict; reconcile using same request identifier',409,cors);
    }
    throw e;
   }
   if(!Array.isArray(results)||results.length!==3||results.some(r=>r?.success===false)||
      results[0]?.meta?.changes!==1||results[1]?.meta?.changes!==1||results[2]?.meta?.changes!==1)
     return err('Issuance not confirmed; reconcile same request ID; never redraw',503,cors);
   const issued=await env.DB.prepare('SELECT prize_name FROM lottery_tickets WHERE id=?').bind(id).first();
   if(!issued)return err('Ticket lookup failed',500,cors);
   return json({ok:true,replayed:false,printAllowed:true,ticketId:id,redeemCode,qrValue:`YIQI1.${id}.${secret}`,storeName,prizeName:issued.prize_name,isTest,issuedAt:now.toISOString(),expiresAt:expires.toISOString()},201,cors);
  }
  if(path==='/tickets/redeem'&&method==='POST'){
   if(!canRedeem(actor))return err('Redeem permission required',403,cors);
   const b=await safeFetch(request);
   const match=typeof b.qrValue==='string'?/^YIQI1\.([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(b.qrValue):null;
   if(!match||!validUUID(match[1]))return err('Invalid QR',400,cors);
   if(b.paperOriginalConfirmed!==true)return err('Original paper ticket must be physically verified',400,cors);
   const digest=await sha256(match[2]), now=new Date().toISOString(), operationId=crypto.randomUUID();
   const t=await env.DB.prepare('SELECT * FROM lottery_tickets WHERE id=? AND token_sha256=?').bind(match[1],digest).first();
   if(!t)return err('Ticket not found',404,cors);
   if(t.is_test!==0)return err('Test ticket cannot be redeemed',409,cors);
   if(t.status!=='issued'||t.voided_at)return err('Ticket is not redeemable',409,cors);
   if(t.expires_at<=now)return err('Ticket expired',409,cors);
   // Single UPDATE; audit trigger must be installed and tested before deploying.
   const result=await env.DB.prepare("UPDATE lottery_tickets SET status='redeemed',redeemed_at=?,redeemed_by=?,last_operation_id=? WHERE id=? AND is_test=0 AND voided_at IS NULL AND status='issued' AND expires_at>?")
     .bind(now,actor.username||'staff',operationId,t.id,now).run();
   if(result.meta?.changes!==1)return err('Ticket already processed',409,cors);
   return json({ok:true,ticketId:t.id,status:'redeemed',isTest:!!t.is_test},200,cors);
  }
  if(path==='/tickets/void'&&method==='POST'){
   if(!isAdmin(actor))return err('Admin permission required',403,cors);
   const b=await safeFetch(request);
   if(!validUUID(b.ticketId)||!safe(b.reason,200))return err('Invalid void request',400,cors);
   const now=new Date().toISOString(), operationId=crypto.randomUUID();
   // Compatibility representation: original CHECK allows only issued/redeemed/expired.
   // A row is logically void iff voided_at IS NOT NULL; status stores expired.
   // Requires coordinated read/API/reporting and audit trigger changes.
   const result=await env.DB.prepare("UPDATE lottery_tickets SET status='expired',voided_at=?,voided_by=?,void_reason=?,last_operation_id=? WHERE id=? AND status='issued' AND voided_at IS NULL")
     .bind(now,actor.username||'Admin',b.reason.trim(),operationId,b.ticketId).run();
   if(result.meta?.changes!==1)return err('Only issued tickets can be voided',409,cors);
   return json({ok:true,ticketId:b.ticketId,status:'void'},200,cors);
  }
  if(path==='/tickets/list'&&method==='GET'){
   if(!allowed(actor,'redeem_history'))return err('History permission required',403,cors);
   const items=await env.DB.prepare('SELECT id,store_name,prize_name,is_test,status,issued_at,expires_at,redeemed_at,voided_at FROM lottery_tickets ORDER BY issued_at DESC LIMIT 100').all();
   return json({ok:true,items:(items.results||[]).map(publicTicket)},200,cors);
  }
  return err('Not found',404,cors);
 }catch(e){return err(/UNIQUE constraint failed/i.test(e?.message||'')?'Request already processed': 'Request failed',/UNIQUE constraint failed/i.test(e?.message||'')?409:500,cors);}
}

return {sha256, ticketSecret, handleTicketRequest};
})();

// ==== SOURCE: trusted-draw.mjs ====
__mods["trusted-draw.mjs"] = (() => {

/* Read-only server-side draw selector. No device supplied prize ID is accepted.
   Requires a synchronized, stable-ID config and matching current D1 ledger.
   D1 issued count is authoritative; KV issued count may lag by design.
   Drawing and issuing are separate here; concurrent configuration changes must
   be blocked by deployment-level synchronization before production activation. */
const exact=(x)=>Number.isSafeInteger(x)&&x>=0;
async function selectTrustedPrize({env}) {
  if (!env.DB || !env.CONFIG_KV) throw Error('Draw services unavailable');
  const saved=await env.CONFIG_KV.get('device:config','json');
  const config=saved?.config;
  if (!config || !Array.isArray(config.prizes)||!config.prizes.length||config.prizes.length>100)
    throw Error('Prize config missing');
  const rows=(await env.DB.prepare('SELECT id,name,type,weight,quantity,issued,enabled FROM lottery_prizes').all()).results||[];
  const ledger=new Map(rows.map(x=>[x.id,x]));
  const ids=new Set();let total=0;const candidates=[];
  for(const p of config.prizes){
    if(typeof p?.id!=='string'||!/^prize_[a-f0-9]{32}$/.test(p.id)||ids.has(p.id))throw Error('Prize ID missing or duplicated');
    ids.add(p.id);
    const d=ledger.get(p.id);
    // Fail closed on stale config; never silently substitute winner or trust device input.
    if(!d||d.name!==p.name||d.type!==p.type||d.weight!==p.weight||d.quantity!==p.quantity||
       !exact(d.issued)||!exact(d.quantity)||!Number.isSafeInteger(d.weight)||d.weight<1||d.weight>100000)
      throw Error('Prize ledger not synchronized');
    if(d.enabled===1&&d.issued<d.quantity){total+=d.weight;if(!Number.isSafeInteger(total))throw Error('Weight overflow');candidates.push(d);}
  }
  if(ledger.size!==ids.size)throw Error('Prize ledger has unknown items');
  if(total<1)throw Error('No prizes available');
  // Rejection sample unbiased bounded integer [0,total)
  const limit=2**32-Math.floor(2**32%total);
  let n; do {n=crypto.getRandomValues(new Uint32Array(1))[0];} while(n>=limit);
  let ticket=n%total;
  for(const d of candidates){if(ticket<d.weight)return d.id;ticket-=d.weight;}
  throw Error('Draw failure');
}

return {selectTrustedPrize};
})();

// ==== SOURCE: device-bridge.mjs ====
__mods["device-bridge.mjs"] = (() => {
const {reportUncertainHandoff} = __mods["handoff-report.mjs"];
const {startHandoff} = __mods["handoff-start.mjs"];
const {handleTicketRequest, ticketSecret, sha256} = __mods["ticket-api.mjs"];
const {selectTrustedPrize} = __mods["trusted-draw.mjs"];
/* Candidate bridge, NOT deployed. Caller MUST validate device authentication before invoking. */
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const validRequestId=s=>typeof s==='string'&&/^[a-f0-9]{32}$/.test(s);
const validDeviceId=s=>typeof s==='string'&&s.length>0&&s.length<=64&&!/[\x00-\x1f]/.test(s);
function shape(body, requestId){
  if(!body?.ok)return body;
  return {ok:true,requestId,printAllowed:body.printAllowed===true,ticket:{ticketId:body.ticketId,redeemCode:body.redeemCode,redemptionCode:body.redeemCode,prizeName:body.prizeName,qrPayload:body.qrValue,expiresAt:body.expiresAt}};
}
async function handleDeviceBridge(request,env,{deviceAuthorized=false,selectPrize=null}={}){
  const url=new URL(request.url), path=url.pathname;
  if(!['/device/lottery/issue','/device/lottery/handoff','/device/lottery/handoff/start','/device/lottery/handoff/status'].includes(path))return null;
  if(!deviceAuthorized)return response({ok:false,error:'Device authentication required'},401);
  if(!env.DB)return response({ok:false,error:'D1 unavailable'},503);
  if(path==='/device/lottery/handoff/start')return startHandoff(request,env,{deviceAuthorized});
  if(path==='/device/lottery/handoff/status'){
    if(request.method!=='GET')return response({ok:false,error:'Method not allowed'},405);
    const requestId=url.searchParams.get('requestId');
    const deviceId=url.searchParams.get('deviceId');
    const ticketId=url.searchParams.get('ticketId');
    if(!validRequestId(requestId)||!validDeviceId(deviceId)||
       typeof ticketId!=='string'||!(/^[0-9a-f-]{36}$/i.test(ticketId)))
      return response({ok:false,error:'Invalid handoff identity'},400);
    if(deviceId!==env.LOTTERY_DEVICE_ID)return response({ok:false,error:'Device not allowed'},403);
    try{
      const row=await env.DB.prepare(`SELECT h.ticket_id,h.request_id,h.device_id,h.state,
          h.operator_verified_at,h.operator_verified_by
          FROM lottery_print_handoffs h
          INNER JOIN lottery_tickets t ON t.id=h.ticket_id
          WHERE h.ticket_id=? AND h.request_id=? AND h.device_id=?
            AND t.request_id=? AND t.device_id=? AND t.status='issued' AND t.voided_at IS NULL`)
        .bind(ticketId,requestId,deviceId,requestId,deviceId).first();
      if(!row)return response({ok:false,error:'Handoff record not found'},404);
      const verified=row.state==='verified_delivered'&&
        !!row.operator_verified_at&&!!row.operator_verified_by;
      return response({ok:true,requestId,ticketId,
        deliveryConfirmed:verified,printAllowed:false,state:row.state},200);
    }catch{return response({ok:false,error:'Handoff status unavailable'},503);}
  }
  if(path==='/device/lottery/handoff')return reportUncertainHandoff(request,env,{deviceAuthorized});
  if(!['POST','GET'].includes(request.method))return response({ok:false,error:'Method not allowed'},405);
  let b;
  try{b=request.method==='GET'?Object.fromEntries(url.searchParams):await request.json();}catch{return response({ok:false,error:'Invalid JSON'},400);}
  if(!validRequestId(b.requestId)||!validDeviceId(b.deviceId))return response({ok:false,error:'Invalid device/request identifier'},400);
  if(b.deviceId!==env.LOTTERY_DEVICE_ID)return response({ok:false,error:'Device not allowed'},403);
  if(request.method==='GET'){
    // Strictly READ ONLY: never call POST issuance in the recovery path.
    const t=await env.DB.prepare('SELECT id,request_id,device_id,prize_name,redeem_code,token_sha256,status,voided_at,expires_at,is_test FROM lottery_tickets WHERE request_id=?').bind(b.requestId).first();
    if(!t)return response({ok:false,requestId:b.requestId,status:'not_found',error:'Existing ticket not found'},404);
    if(t.device_id!==b.deviceId)return response({ok:false,error:'Ticket belongs to different device'},403);
    if(t.status!=='issued'||t.voided_at||t.expires_at<=new Date().toISOString())return response({ok:false,requestId:b.requestId,status:'conflict',error:'Ticket is not recoverable'},409);
    if(!['production','test'].includes(env.LOTTERY_ISSUE_MODE)||!!t.is_test!==(env.LOTTERY_ISSUE_MODE==='test'))return response({ok:false,requestId:b.requestId,status:'conflict',error:'Issue mode mismatch'},409);
    try{
      const token=await ticketSecret(env.LOTTERY_QR_HMAC_KEY,t.id,t.request_id);
      if(await sha256(token)!==t.token_sha256)return response({ok:false,requestId:b.requestId,status:'conflict',error:'Recovery integrity failed'},409);
      return response(shape({ok:true,ticketId:t.id,redeemCode:t.redeem_code,prizeName:t.prize_name,qrValue:`YIQI1.${t.id}.${token}`,expiresAt:t.expires_at,replayed:true},b.requestId));
    }catch{return response({ok:false,error:'Recovery key unavailable'},503);}
  }
  // A retried request must reuse its stored draw before any new random selection.
  // This GET is read-only and keeps the same device identity, status and token checks.
  const lookupUrl=new URL(url);
  lookupUrl.searchParams.set('requestId',b.requestId);
  lookupUrl.searchParams.set('deviceId',b.deviceId);
  const preflight=await handleDeviceBridge(new Request(lookupUrl,{method:'GET'}),env,{deviceAuthorized:true});
  if(preflight.status!==404)return preflight;
  // Server-side winner selection is mandatory. Never accept prizeId from ESP32.
  if(typeof selectPrize!=='function')return response({ok:false,error:'Server draw not enabled until config/ledger revisions are atomic'},503);
  let prizeId;
  try {prizeId=await selectPrize({deviceId:b.deviceId,requestId:b.requestId,env});}
  catch {return response({ok:false,error:'Prize selection unavailable or out of sync'},503);}
  if(typeof prizeId!=='string'||!prizeId)return response({ok:false,error:'No authorized draw outcome'},503);
  const coreRequest=new Request(new URL('/tickets/issue',url),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:b.requestId,deviceId:b.deviceId,prizeId})});
  const core=await handleTicketRequest(coreRequest,env,{deviceAuthorized:true,internalDeviceIssue:true});
  const body=await core.json();
  if(core.status===409){
    // Another concurrent request may have issued a DIFFERENT randomly chosen
    // prize for this requestId. Recover the authoritative first winner, not
    // retry another INSERT or expose a newly selected prize.
    const winner=await handleDeviceBridge(new Request(lookupUrl,{method:'GET'}),env,{deviceAuthorized:true});
    if(winner.status===200)return winner;
    if(winner.status!==404)return winner;
  }
  // The issuer already atomically committed ticket + reservation via D1.batch.
  // Never reserve or grant a second print permit in the bridge.
  return response(shape(body,b.requestId),core.status);
}

return {handleDeviceBridge};
})();

// ==== SOURCE: prize-identity-guard.mjs ====
__mods["prize-identity-guard.mjs"] = (() => {

/* Legacy prize identity is not inferable from display names or positions.
   Never allocate an identity when migrating existing configurations. */
const idOk = id => typeof id === 'string' && /^prize_[a-f0-9]{32}$/.test(id);
function assertPrizeIdentitySafe(previous, next) {
  const old=previous?.prizes || [];
  const now=next?.prizes || [];
  if(!Array.isArray(old)||!Array.isArray(now)) throw Error('Invalid prize collections');
  const oldIds=old.map(p=>p?.id);
  const newIds=now.map(p=>p?.id);
  const oldHas=oldIds.some(v=>v!==undefined);
  const newHas=newIds.some(v=>v!==undefined);
  if(oldHas && oldIds.some(v=>!idOk(v)))throw Error('舊獎項 ID 不完整，禁止覆寫');
  if(newHas && newIds.some(v=>!idOk(v)))throw Error('新獎項 ID 不完整，禁止覆寫');
  if(new Set(newIds.filter(Boolean)).size!==newIds.filter(Boolean).length)throw Error('獎項 ID 重複');
  if(old.length && !oldHas && newHas)throw Error('舊獎項尚未完成固定 ID 人工對照，禁止自動改配');
  if(oldHas && !newHas)throw Error('此設定已使用固定 ID，不可移除');
  if(oldHas){
    const nextSet=new Set(newIds);
    for(const id of oldIds)if(!nextSet.has(id))throw Error(`原有獎項 ${id} 缺失，禁止直接刪除或重建`);
  }
  // In legacy no-ID mode, never assert identities by array index or name.
  return {safe:true,legacyNeedsReconciliation:old.length>0&&!oldHas};
}

return {assertPrizeIdentitySafe};
})();

// ==== SOURCE: prize-sync-apply.mjs ====
__mods["prize-sync-apply.mjs"] = (() => {
const {inspectPrizeSync} = __mods["prize-sync-preflight.mjs"];
const {syncPrizeSnapshot} = __mods["prize-sync.mjs"];
/* Strictly gated D1 synchronization. Not deployed. Never disables missing prizes. */
const send=(data,status=200,cors={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...cors}});
const maxRows=101;
async function handlePrizeSyncApply(req,env,{actor,cors={}}={}) {
  if(env.ENABLE_PRIZE_SYNC_APPLY!=='true')return send({error:'獎項寫入尚未啟用'},503,cors);
  if(!actor||actor.mustChange||!Array.isArray(actor.permissions)||!actor.permissions.includes('prizes_edit')||!actor.permissions.includes('device_sync'))return send({error:'Forbidden'},403,cors);
  if(!env.DB?.prepare||!env.DB?.batch||!env.CONFIG_KV?.get)return send({error:'D1/KV unavailable'},503,cors);
  let body;
  try { const raw=await req.text(); if(new TextEncoder().encode(raw).length>2048)throw Error('Payload too large');body=JSON.parse(raw); }
  catch {return send({error:'Invalid request'},400,cors)}
  if(!body||typeof body.expectedRevision!=='string'||!body.expectedRevision||body.confirm!=='SYNC_PRIZES')return send({error:'需提供設定版本與明確確認'},400,cors);
  const record=await env.CONFIG_KV.get('device:config','json');
  if(!record?.revision||record.revision!==body.expectedRevision)return send({error:'雲端設定已變更，需重新預覽'},409,cors);
  if(!Array.isArray(record.config?.prizes))return send({error:'獎項設定不存在'},409,cors);
  let result;
  let writeAttempted=false;
  try {
    const q=await env.DB.prepare(`SELECT id,name,type,weight,quantity,issued,enabled FROM lottery_prizes ORDER BY id LIMIT ${maxRows}`).all();
    if(q?.success===false||!Array.isArray(q?.results)||q.results.length>=maxRows)throw Error('D1 快照不完整');
    // If any prior ticket exists for a prize, its type cannot be silently changed.
    // Historical tickets retain their printed names, but type changes could alter accounting rules.
    const byId=new Map(q.results.map(p=>[p.id,p]));
    for(const p of record.config.prizes){
      const old=byId.get(p.id);
      if(old && Number(old.issued)>0 && old.type!==p.type)throw Error('已發券獎項不可變更獎項類型');
    }
    result=inspectPrizeSync(record.config,q.results,{remoteReadComplete:true});
    // No deletion / disabling or ambiguous rename in automated write path.
    if(result.disabled.length)throw Error('存在未對應獎項，禁止寫入');
    // Refuse all writes if configuration changed between preview and write.
    const again=await env.CONFIG_KV.get('device:config','json');
    if(again?.revision!==record.revision)throw Error('雲端設定已變更');
    // Last KV recheck narrows the stale-update window; it is NOT an atomic
    // transaction with D1, so concurrent admin writes still require D1-side CAS.
    const state=await env.DB.prepare('SELECT revision FROM lottery_prize_sync_state WHERE singleton=1').first();
    writeAttempted=true;
    const applied=await syncPrizeSnapshot(env.DB,record.config,{disableMissing:false,expectedRevision:record.revision,previousAppliedRevision:state?.revision||null});
    // Read back D1 after the transactional batch; never report verified if rows mismatch.
    const checked=await env.DB.prepare(`SELECT id,name,type,weight,quantity,issued,enabled FROM lottery_prizes ORDER BY id LIMIT ${maxRows}`).all();
    const committedRevision=await env.DB.prepare('SELECT revision FROM lottery_prize_sync_state WHERE singleton=1').first();
    if(checked?.success===false||!Array.isArray(checked?.results)||checked.results.length>=maxRows||committedRevision?.revision!==record.revision)
      return send({ok:false,writeAttempted:true,verification:'FAILED',error:'D1 寫入後版本或快照無法確認，請唯讀回查，勿重複提交'},503,cors);
    const expected=new Map(record.config.prizes.map(p=>[p.id,p]));
    const actual=new Map(checked.results.map(p=>[p.id,p]));
    const matched=expected.size===actual.size&&[...expected].every(([id,p])=>{
      const a=actual.get(id);
      return a&&a.name===p.name.trim()&&a.type===p.type&&Number(a.weight)===p.weight&&Number(a.quantity)===p.quantity&&Number(a.enabled)===1&&Number.isSafeInteger(Number(a.issued))&&Number(a.issued)>=0&&Number(a.issued)<=Number(a.quantity);
    });
    if(!matched)return send({ok:false,writeAttempted:true,verification:'MISMATCH',error:'D1 寫入後內容不一致，請停止同步並唯讀回查'},409,cors);
    return send({ok:true,verified:true,revision:record.revision,added:result.added.length,updated:result.updated.length,count:applied.count},200,cors);
  } catch(e) {
    if(writeAttempted)return send({ok:false,writeAttempted:true,verification:'UNKNOWN',error:'D1 寫入已嘗試，但結果未確認。請先執行唯讀回查，切勿直接重送同步。'},503,cors);
    return send({ok:false,writeAttempted:false,error:e.message||'同步拒絕'},409,cors);
  }
}

return {handlePrizeSyncApply};
})();

// ==== SOURCE: ticket-access.mjs ====
__mods["ticket-access.mjs"] = (() => {

/** Only identity() in the existing Worker may supply actor.
 * Preserve actual role and exact per-account permissions; no Admin blanket grant.
 */
function ticketAccess(actor, deviceAuthorized=false) {
  const verified = actor && typeof actor.username === 'string' && !actor.mustChange;
  if (!verified) return {actor:null, deviceAuthorized:deviceAuthorized===true};
  const scopes = Array.isArray(actor.permissions) ? actor.permissions : [];
  const permissions = scopes;
  return {actor:{username:actor.username,role:actor.role,permissions},deviceAuthorized:deviceAuthorized===true};
}

return {ticketAccess};
})();

// ==== SOURCE: worker.js ====
const { verifyPhysicalDelivery } = __mods["handoff-operator.mjs"];
const {handlePrizeD1Readback} = __mods["prize-d1-readback.mjs"];
const {handleRestartAdmin} = __mods["device-restart-admin.mjs"];
const {handlePrizeSyncPreview} = __mods["prize-sync-preview.mjs"];
const { handleDeviceBridge } = __mods["device-bridge.mjs"];
const { selectTrustedPrize } = __mods["trusted-draw.mjs"];
const { assertPrizeIdentitySafe } = __mods["prize-identity-guard.mjs"];
const { handlePrizeSyncApply } = __mods["prize-sync-apply.mjs"];
const { handleTicketRequest } = __mods["ticket-api.mjs"];
const { ticketAccess } = __mods["ticket-access.mjs"];
// yijia-lottery-api — account management v0.1.25; existing device config API retained.
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
 // Prevent discarding stable IDs after prize reconciliation has begun.
 const ids=p.map(x=>x.id);
 if(ids.some(x=>x!==undefined)){
   if(ids.some(x=>typeof x!=='string'||!/^prize_[a-f0-9]{32}$/.test(x))||new Set(ids).size!==ids.length)throw Error('Invalid stable prize IDs');
 }
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

const PERMS=['dashboard','prizes_view','prizes_edit','ticket_view','ticket_edit','device_sync','print_prep','sound_settings','device_config_view','redeem','redeem_history','accounts_view','accounts_manage','permissions_manage'];
const defaults=role=>role==='Admin'?['dashboard','prizes_view','prizes_edit','ticket_view','ticket_edit','device_sync','redeem','redeem_history','accounts_view','accounts_manage','permissions_manage']:['redeem'];
const permitted=(u,p)=>!!u&&!u.mustChange&&(u.role==='Admin'||USER_PERMS.includes(p))&&Array.isArray(u.permissions)&&u.permissions.includes(p);
const normalized=a=>{const allowed=a.role==='Admin'?PERMS:USER_PERMS;return Array.isArray(a.permissions)?allowed.filter(p=>a.permissions.includes(p)):defaults(a.role)};
const validPerms=p=>Array.isArray(p)&&p.length<=PERMS.length&&p.every(x=>PERMS.includes(x))&&new Set(p).size===p.length;
const USER_PERMS=['prizes_view', 'redeem', 'redeem_history'];
const validRolePerms=(p,role)=>validPerms(p)&&(role==='Admin'||p.every(x=>USER_PERMS.includes(x)));


async function derive(password,salt){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256);
 return Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('');
}
async function identity(req,env){
 const token=bearer(req);if(!/^[a-f0-9]{64}$/.test(token))return null;
 const raw=await env.CONFIG_KV.get(await sessionKey(token));if(!raw)return null;
 let session;try{session=JSON.parse(raw)}catch{return null}
 if(session?.username==='Yuan'&&session.role==='Admin'&&session.version===0)return {username:'Yuan',role:'Admin',mustChange:false,permissions:[...PERMS]};
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
   // Remote restart is explicitly disabled until device-side transaction guards are validated.
   // Never enqueue a command merely because a browser requests restart.
   if(path==='/admin/device/restart/status'||path==='/admin/device/restart'){
     const actor=await identity(request,env);
     return handleRestartAdmin(request,env,{actor,cors});
   }
   if(path==='/admin/prizes/d1-readback'&&request.method==='GET'){
     const actor=await identity(request,env);
     return await handlePrizeD1Readback(env,{actor,cors});
   }
   // READ ONLY preview: checks actual D1 snapshot against saved KV configuration.
   if(path==='/admin/prizes/sync-preview'&&request.method==='GET'){
     const actor=await identity(request,env);
     return await handlePrizeSyncPreview(env,{actor,cors});
   }
   // YIQI_PRIZE_SYNC_GATED_V1: no legacy API key; require actual logged-in actor.
   // Feature defaults off. The handler performs additional D1/KV revision checks.
   if(path==='/admin/prizes/sync'&&request.method==='POST'){
     const actor=await identity(request,env);
     return await handlePrizeSyncApply(request,env,{actor,cors});
   }
   // Admin-only paper handoff confirmation; session authorization remains enforced.
   if(path==='/admin/lottery/handoff/verify'){
     const actor=await identity(request,env);
     return await verifyPhysicalDelivery(request,env,{actor,cors});
   }
   if(path==='/device/lottery/terms'&&request.method==='GET'){
     if(!device)return json({error:'Unauthorized'},401,cors);
     const q=new URL(request.url).searchParams;
     const requestId=q.get('requestId'),deviceId=q.get('deviceId'),ticketId=q.get('ticketId');
     if(!/^[a-f0-9]{32}$/.test(requestId||'') ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(deviceId||'') ||
        !/^[a-f0-9-]{36}$/i.test(ticketId||''))
       return json({error:'Invalid terms request'},400,cors);
     if(deviceId!==env.LOTTERY_DEVICE_ID)return json({error:'Device mismatch'},403,cors);
     if(!env.DB?.prepare)return json({error:'D1 unavailable'},503,cors);
     try{
       const r=await env.DB.prepare(`SELECT t.id,t.status,t.voided_at,t.request_id,t.device_id,
         s.ticket_id,s.config_revision,s.terms_json,s.terms_sha256,s.frozen_at
         FROM lottery_tickets t JOIN lottery_ticket_terms_snapshots s
           ON s.request_id=t.request_id AND s.ticket_id=t.id
         WHERE t.id=? AND t.request_id=? AND t.device_id=?`).bind(ticketId,requestId,deviceId).first();
       if(!r||r.status!=='issued'||r.voided_at)return json({error:'Frozen terms not found'},404,cors);
       if(await sha256(r.terms_json)!==r.terms_sha256)return json({error:'Snapshot integrity failure'},409,cors);
       const terms=JSON.parse(r.terms_json);
       return json({ok:true,requestId,deviceId,ticketId,termsSnapshot:{
         revision:r.config_revision,sha256:r.terms_sha256,
         canonicalJson:r.terms_json,frozenAt:r.frozen_at,ticket:terms}},200,cors);
     }catch{return json({error:'Frozen terms unavailable'},503,cors);}
   }
   // Device-only bridge shares the ticket issuer and trusted server draw.
   // Handoff reports print uncertainty only; never authorizes automatic reprint.
   if(path==='/device/lottery/issue'||path==='/device/lottery/handoff'||path==='/device/lottery/handoff/start'||path==='/device/lottery/handoff/status'){
     return await handleDeviceBridge(request,env,{deviceAuthorized:device,selectPrize:selectTrustedPrize});
   }
   // YIQI_TICKET_DISPATCH_V1: protect ticket endpoints with existing authenticated session.
   if(path.startsWith('/tickets/')){
     const actor=await identity(request,env);
     const deviceAuthorized=false; // Public /tickets/issue is always closed, including for device keys.
     const access=ticketAccess(actor,deviceAuthorized);
     return await handleTicketRequest(request,env,{...access,cors});
   }
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
    if(!validRolePerms(body.permissions,old.role))return json({error:'此帳號角色不允許使用指定權限'},400,cors);
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
    await env.CONFIG_KV.put(key,JSON.stringify({salt,hash,fullName:body.fullName.trim(),role:body.role,disabled:false,mustChange:true,permissions:validRolePerms(body.permissions,body.role)?body.permissions:defaults(body.role),version:1}));
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
   let config=validateConfig(await readJSON(request,12000));
   const previous=await env.CONFIG_KV.get(configKey,'json');
   // Initial legacy-ID conversion only. Never infer identity when any D1 prize,
   // ticket, or applied sync revision exists; never silently reorder legacy prizes.
   const noIds=config.prizes.length>0&&config.prizes.every(p=>p.id===undefined);
   if(noIds && !previous?.config?.prizes?.some(p=>p.id!==undefined)) {
     if(!env.DB?.prepare) return json({error:'D1 required for legacy prize identity initialization'},503,cors);
     const original=previous?.config?.prizes||[];
     // If an existing legacy collection exists, this first save must preserve its
     // exact prize data. A later save may change amounts after IDs are anchored.
     const equalPrize=(a,b)=>a.name===b.name&&a.type===b.type&&a.weight===b.weight&&a.quantity===b.quantity&&a.issued===b.issued;
     if(original.length && (original.length!==config.prizes.length||original.some((p,i)=>!equalPrize(p,config.prizes[i]))))
       return json({error:'請先原樣儲存既有獎項以建立固定 ID，再修改獎項設定'},409,cors);
     const [counts,revisionRow]=await Promise.all([
       env.DB.prepare(`SELECT (SELECT COUNT(*) FROM lottery_prizes) AS prizes, (SELECT COUNT(*) FROM lottery_tickets) AS tickets`).first(),
       env.DB.prepare('SELECT revision FROM lottery_prize_sync_state WHERE singleton=1').first()
     ]);
     if(!counts||Number(counts.prizes)!==0||Number(counts.tickets)!==0||revisionRow)
       return json({error:'D1 已有獎項、獎券或同步紀錄；禁止自動分配獎項 ID'},409,cors);
     config={...config,prizes:config.prizes.map(p=>({...p,id:`prize_${crypto.randomUUID().replace(/-/g,'')}`}))};
     // The user is explicitly saving the existing unchanged legacy set, after
     // verifying empty D1. No D1 data is modified by this conversion.
   }
   if(!(noIds && config.prizes.every(p=>typeof p.id==='string') && previous?.config?.prizes?.every(p=>p.id===undefined)))
     assertPrizeIdentitySafe(previous?.config,config);
   const revision=crypto.randomUUID();
   await env.CONFIG_KV.put(configKey,JSON.stringify({revision,config}));
   const ack=await env.CONFIG_KV.get(ackKey,'json');
   return json({ok:true,revision,deviceAckRevision:ack?.revision||null,prizeIds:config.prizes.map(p=>p.id||null)},200,cors);
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
