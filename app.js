'use strict';
// v0.1.8: local-only UI prototype. Browser storage is NEVER a real prize ledger.
const KEY='lottery_ui_v010'; // reuse v0.1.4 data
const defaults={prizes:[{name:'購物金 10 元',type:'購物金',weight:5,quantity:10,issued:0},{name:'指定商品一份',type:'商品',weight:3,quantity:10,issued:0}],ticket:{store:'',days:7,usage:'限店使用',rules:['僅限原店兌換','購物金不可買菸','本券限兌換一次','本券不得折換現金','退貨應繳回所有獎品','退換貨不得再次抽獎'].join('\n'),warning:'逾期無法使用\n須出示實體紙本\n照片、影印無效',paperWidth:55,barcodeType:'qr',barcodeSize:90,rulesFontSize:12,warningFontSize:12,showRules:true,showWarning:true}};
let state;
try{const v=JSON.parse(localStorage.getItem(KEY));state=v&&Array.isArray(v.prizes)&&v.ticket?v:structuredClone(defaults)}catch{state=structuredClone(defaults)}
const STORE_MIGRATION_KEY='lottery_store_placeholder_migrated_v014';
try{if(localStorage.getItem(STORE_MIGRATION_KEY)!=='1'){if(state.ticket?.store==='示範門市'){state.ticket.store='';localStorage.setItem(KEY,JSON.stringify(state))}localStorage.setItem(STORE_MIGRATION_KEY,'1')}}catch(e){console.warn('舊示範店名資料清理未完成',e)}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function el(id){return document.getElementById(id)}
function txt(tag,value,className){const n=document.createElement(tag);n.textContent=value;if(className)n.className=className;return n}
function renderPrizes(){el('prizeCount').textContent=state.prizes.length;const root=el('prizeList');root.replaceChildren();state.prizes.forEach((p,i)=>{const card=txt('div','','card prize-row'),info=document.createElement('div');info.append(txt('strong',p.name),txt('p',`${p.type} · 權重 ${p.weight} · 總數 ${p.quantity??0} · 已抽出 ${p.issued??0} · 剩餘 ${Math.max(0,(p.quantity??0)-(p.issued??0))}`));const actions=document.createElement('div');const edit=txt('button','編輯'),del=txt('button','刪除');edit.onclick=()=>{el('editIndex').value=i;el('prizeName').value=p.name;el('prizeType').value=p.type;el('prizeWeight').value=p.weight;el('prizeQuantity').value=p.quantity??0;window.scrollTo({top:0,behavior:'smooth'})};del.onclick=()=>{if(confirm(`刪除「${p.name}」？`)){state.prizes.splice(i,1);save();renderPrizes()}};actions.append(edit,del);card.append(info,actions);root.append(card)})}
function clearForm(){el('prizeForm').reset();el('editIndex').value=''}
el('prizeForm').addEventListener('submit',e=>{e.preventDefault();const p={name:el('prizeName').value.trim(),type:el('prizeType').value,weight:Number(el('prizeWeight').value),quantity:Number(el('prizeQuantity').value)};if(!p.name||!Number.isInteger(p.weight)||p.weight<1||!Number.isSafeInteger(p.quantity)||p.quantity<0)return;const i=el('editIndex').value;if(i!==''){p.issued=state.prizes[Number(i)].issued??0;if(p.quantity<p.issued){alert('總數量不能小於已抽出數量');return}}else p.issued=0;if(i==='')state.prizes.push(p);else state.prizes[Number(i)]=p;save();clearForm();renderPrizes()});el('clearEdit').onclick=clearForm;
function loadTicket(){const t=state.ticket;el('storeName').value=t.store||'';el('validDays').value=t.days;el('usage').value=t.usage;el('rules').value=t.rules;el('warning').value=t.warning;el('paperWidth').value=[30,40,50,55,57,58].includes(Number(t.paperWidth))?t.paperWidth:55;el('barcodeType').value=t.barcodeType||'qr';el('barcodeSize').value=t.barcodeSize??90;el('rulesFontSize').value=t.rulesFontSize??12;el('warningFontSize').value=t.warningFontSize??12;el('showRules').checked=t.showRules!==false;el('showWarning').checked=t.showWarning!==false;renderTicket()}
function ticketFormValues(){return {store:el('storeName').value.trim(),days:Number(el('validDays').value),usage:el('usage').value,rules:el('rules').value,warning:el('warning').value,paperWidth:Number(el('paperWidth').value),barcodeType:el('barcodeType').value,barcodeSize:Number(el('barcodeSize').value),rulesFontSize:Number(el('rulesFontSize').value),warningFontSize:Number(el('warningFontSize').value),showRules:el('showRules').checked,showWarning:el('showWarning').checked}}
function ticketChanged(){
  renderTicket();
  const changed=JSON.stringify(ticketFormValues())!==JSON.stringify(normalizeTicket(state.ticket));
  el('ticketSaveStatus').textContent=changed?'預覽已更新，但尚未儲存；正式模板仍使用上次儲存版本':'目前設定與已儲存模板相同';
  el('ticketSaveStatus').dataset.saved=changed?'false':'true';
}
function normalizeTicket(t){return {store:t.store||'',days:Number(t.days)||7,usage:t.usage||'',rules:t.rules||'',warning:t.warning||'',paperWidth:Number(t.paperWidth)||55,barcodeType:t.barcodeType||'qr',barcodeSize:Number(t.barcodeSize??90),rulesFontSize:Number(t.rulesFontSize??12),warningFontSize:Number(t.warningFontSize??12),showRules:t.showRules!==false,showWarning:t.showWarning!==false}}
function renderSavedTicketSummary(){
  const t=normalizeTicket(state.ticket);
  el('savedTicketSummary').textContent=`${t.paperWidth} mm · ${t.barcodeType==='qr'?'QR Code':'Code 128'} · 有效 ${t.days} 天 · 條碼比例 ${t.barcodeSize}%`;
}
el('ticketForm').addEventListener('input',ticketChanged);el('ticketForm').addEventListener('change',ticketChanged);
function renderTicket(){const t=ticketFormValues(),r=el('receipt');r.replaceChildren();const paperWidth=[30,40,50,55,57,58].includes(t.paperWidth)?t.paperWidth:55;r.style.width=paperWidth+'mm';el('previewPaperWidth').textContent=paperWidth+' mm';for(const [id,v] of [['barcodeSizeValue',t.barcodeSize+'%'],['rulesFontSizeValue',t.rulesFontSize+' px'],['warningFontSizeValue',t.warningFontSize+' px']])el(id).textContent=v;const now=new Date(),pad=n=>String(n).padStart(2,'0'),fmt=d=>`${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`;const expiry=new Date(now.getFullYear(),now.getMonth(),now.getDate()+Math.max(1,Number(t.days)||1));const line=(label,value)=>{const p=txt('p','','receipt-meta');p.append(txt('strong',label),document.createTextNode(value));return p};const section=(heading,body,size)=>{const block=txt('section','','receipt-section');block.append(txt('strong',heading,'receipt-section-title'),txt('div',body||'','receipt-section-text'));if(size)block.querySelector('.receipt-section-text').style.fontSize=size+'px';return block};if(t.store)r.append(txt('h2',t.store,'receipt-store'));const prize=state.prizes.find(p=>Number(p.quantity)>0)||state.prizes[0];r.append(txt('h3',prize?.name||'獎項名稱（示意）','receipt-prize'));r.append(line('列印日期：',`${fmt(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`));r.append(document.createElement('hr'));const code=txt('div','','receipt-barcode');const isQR=t.barcodeType==='qr';const symbol=txt('div',isQR?'QR 示意':'CODE 128 示意',isQR?'barcode-qr-placeholder':'barcode-128-placeholder');symbol.style.width=Math.max(60,Math.min(100,t.barcodeSize??90))+'%';symbol.setAttribute('aria-label','不可掃描的條碼版面佔位圖');code.append(symbol,txt('small','版面示意｜不可掃描核銷','receipt-qr-note'));r.append(code);r.append(line('活動序號：','DEMO-NOT-VALID'));r.append(line('序號有效期限：',fmt(expiry)));r.append(document.createElement('hr'));const rules=String(t.rules||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).join('\n');if(t.usage.trim())r.append(section('活動說明：',t.usage));if(rules&&t.showRules)r.append(section('使用規則：',rules,t.rulesFontSize));if(t.warning.trim()&&t.showWarning){r.append(document.createElement('hr'));r.append(section('注意事項：',t.warning,t.warningFontSize))}r.append(txt('p','展示預覽｜非有效獎券','preview-warning'))}
el('ticketForm').addEventListener('submit',e=>{e.preventDefault();state.ticket=ticketFormValues();try{save();renderTicket();el('ticketSaveStatus').textContent='已儲存列印模板（目前瀏覽器）；等待未來同步至 ESP32';el('ticketSaveStatus').dataset.saved='true';renderSavedTicketSummary()}catch(err){el('ticketSaveStatus').textContent='儲存失敗：請檢查瀏覽器儲存空間';el('ticketSaveStatus').dataset.saved='false'}});
el('checkCode').onclick=()=>{const code=el('redeemCode').value.trim();el('redeemResult').textContent=code?'展示版尚未連接伺服器，無法驗證或核銷此編號。':'請先輸入活動序號。'};
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===b.dataset.tab))});
const SOUND_KEY='lottery_sound_v015';let sound={enabled:true,volume:70,pattern:'short'};try{sound={...sound,...JSON.parse(localStorage.getItem(SOUND_KEY)||'{}')}}catch{}
function loadSound(){el('soundEnabled').checked=!!sound.enabled;el('soundVolume').value=sound.volume;el('soundPattern').value=sound.pattern;el('soundVolumeValue').textContent=sound.volume+'%'}
el('soundVolume').addEventListener('input',()=>{el('soundVolumeValue').textContent=el('soundVolume').value+'%'});
for(const id of ['soundEnabled','soundVolume','soundPattern']){el(id).addEventListener('change',()=>{el('soundSaveStatus').textContent='尚未儲存修改';el('soundSaveStatus').dataset.saved='false'})}
el('soundForm').addEventListener('submit',e=>{e.preventDefault();sound={enabled:el('soundEnabled').checked,volume:Number(el('soundVolume').value),pattern:el('soundPattern').value};try{localStorage.setItem(SOUND_KEY,JSON.stringify(sound));el('soundSaveStatus').textContent='已儲存至目前瀏覽器，尚未同步 ESP32';el('soundSaveStatus').dataset.saved='true'}catch(err){el('soundSaveStatus').textContent='儲存失敗：請檢查瀏覽器儲存空間';el('soundSaveStatus').dataset.saved='false'}});
el('restoreTicket').addEventListener('click',()=>{loadTicket();el('ticketSaveStatus').textContent='已還原至上次儲存的模板';el('ticketSaveStatus').dataset.saved='true'});
el('exportTicketConfig').addEventListener('click',()=>{
  const payload={schema:'lottery-ticket-template',version:1,template:normalizeTicket(state.ticket)};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='lottery-saved-ticket-template.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
renderPrizes();loadTicket();loadSound();renderSavedTicketSummary();


// v0.1.8 device configuration interchange format (not a redeemable voucher).
const DEVICE_SCHEMA='lottery-device-config';
function deviceStatus(message,success=false){const e=el('deviceConfigStatus');e.textContent=message;e.dataset.saved=success?'true':'false'}
function fullDeviceConfig(){
  return {schema:DEVICE_SCHEMA,version:1,exportedAt:new Date().toISOString(),
    ticket:normalizeTicket(state.ticket),
    prizes:state.prizes.map(p=>({name:p.name,type:p.type,weight:Number(p.weight),quantity:Number(p.quantity),issued:Number(p.issued??0)})),
    sound:{enabled:!!sound.enabled,volume:Number(sound.volume),pattern:sound.pattern},
    note:'CONFIG_ONLY_NO_VOUCHERS_NO_REDEMPTION'};
}
function downloadJSON(obj,name){
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
el('exportDeviceConfig').addEventListener('click',()=>{
  try{downloadJSON(fullDeviceConfig(),'lottery-device-config-v1.json');deviceStatus('已產生完整設備設定備份（尚未傳送 ESP32）',true)}
  catch(e){deviceStatus('匯出失敗：'+e.message)}
});
function validText(v,max){return typeof v==='string'&&v.length<=max}
function intRange(v,min,max){return Number.isSafeInteger(v)&&v>=min&&v<=max}
function validateDeviceConfig(x){
  if(!x||typeof x!=='object'||x.schema!==DEVICE_SCHEMA||x.version!==1)throw Error('不是支援的設備設定格式（版本 1）');
  const t=x.ticket;
  if(!t||!validText(t.store,40)||!intRange(t.days,1,365)||!validText(t.usage,3000)||!validText(t.rules,6000)||!validText(t.warning,3000))throw Error('獎券文字或有效期限不正確');
  if(![30,40,50,55,57,58].includes(t.paperWidth)||!['qr','code128'].includes(t.barcodeType)||!intRange(t.barcodeSize,60,100)||!intRange(t.rulesFontSize,10,18)||!intRange(t.warningFontSize,10,18)||typeof t.showRules!=='boolean'||typeof t.showWarning!=='boolean')throw Error('紙寬、條碼或文字設定不正確');
  if(!Array.isArray(x.prizes)||x.prizes.length>100)throw Error('獎項數量格式不正確（最多 100 項）');
  for(const p of x.prizes){
    if(!p||!validText(p.name,40)||!p.name.trim()||!['購物金','商品'].includes(p.type)||!intRange(p.weight,1,100000)||!intRange(p.quantity,0,1000000)||!intRange(p.issued,0,p.quantity))throw Error('獎項內容或庫存數值不正確');
  }
  const s=x.sound;
  if(!s||typeof s.enabled!=='boolean'||!intRange(s.volume,0,100)||!['short','double','triple'].includes(s.pattern))throw Error('提示音設定不正確');
  return {prizes:x.prizes.map(p=>({...p})),ticket:{...t},sound:{...s}};
}
el('importDeviceConfig').addEventListener('click',async()=>{
  const file=el('importDeviceFile').files?.[0];
  if(!file){deviceStatus('請先選擇 JSON 備份檔');return}
  if(file.size>150000){deviceStatus('檔案超過 150 KB，已拒絕匯入');return}
  let incoming;
  try{incoming=validateDeviceConfig(JSON.parse(await file.text()))}
  catch(e){deviceStatus('匯入檢查失敗：'+e.message);return}
  if(!confirm('確定要用這份備份覆蓋目前瀏覽器的獎項、獎券模板及提示音設定嗎？這不會傳送至 ESP32。')){deviceStatus('已取消還原');return}
  const oldState=state,oldSound=sound;
  try{
    // Update storage first. Revert both keys if any write fails.
    const previousState=localStorage.getItem(KEY),previousSound=localStorage.getItem(SOUND_KEY);
    try{
      localStorage.setItem(KEY,JSON.stringify({prizes:incoming.prizes,ticket:incoming.ticket}));
      localStorage.setItem(SOUND_KEY,JSON.stringify(incoming.sound));
    }catch(err){
      if(previousState===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,previousState);
      if(previousSound===null)localStorage.removeItem(SOUND_KEY);else localStorage.setItem(SOUND_KEY,previousSound);
      throw err;
    }
    state={prizes:incoming.prizes,ticket:incoming.ticket};sound=incoming.sound;
    renderPrizes();loadTicket();loadSound();renderSavedTicketSummary();
    el('ticketSaveStatus').textContent='已從備份還原至此瀏覽器';el('ticketSaveStatus').dataset.saved='true';
    el('soundSaveStatus').textContent='已從備份還原至此瀏覽器';el('soundSaveStatus').dataset.saved='true';
    deviceStatus('備份還原成功（僅此瀏覽器，尚未同步 ESP32）',true);
  }catch(e){state=oldState;sound=oldSound;deviceStatus('還原失敗：瀏覽器儲存空間可能不足')}
});


// V08 phase 1: HTTPS cloud configuration publishing (not direct ESP32 access).
// Keep the admin key in memory only. Never embed it in GitHub Pages or URL query strings.
const cloudPushBtn=el('cloudPush');
const cloudStatusBtn=el('cloudStatusRefresh');
function cloudStatus(message,success=false){
  const target=el('cloudSyncStatus');target.textContent=message;target.dataset.saved=success?'true':'false';
}
// v0.1.10: fixed public API endpoint; temporary tab-scoped key retention.
const CLOUD_API_BASE='https://yijia-lottery-api.a0900067841.workers.dev';
const CLOUD_SESSION_KEY='lottery_cloud_admin_key_session_v0110';
el('cloudApiUrl').value=CLOUD_API_BASE;
el('cloudApiUrl').readOnly=true;
try{el('cloudAdminKey').value=sessionStorage.getItem(CLOUD_SESSION_KEY)||''}catch(_){}
el('cloudAdminKey').addEventListener('input',()=>{
  try{const v=el('cloudAdminKey').value;if(v)sessionStorage.setItem(CLOUD_SESSION_KEY,v);else sessionStorage.removeItem(CLOUD_SESSION_KEY)}catch(_){}
});
function cloudCredentials(){
  const raw=el('cloudApiUrl').value.trim().replace(/\/+$/,'');
  const key=el('cloudAdminKey').value;
  if(!raw)throw Error('雲端 API 網址未設定');
  const parsed=new URL(raw);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw Error('請輸入 HTTPS API 根網址，不含路徑或參數');
  if(!key)throw Error('請輸入管理員同步金鑰');
  return {base:parsed.origin,key};
}
async function cloudRequest(method,path,body){
  const {base,key}=cloudCredentials();
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const resp=await fetch(base+path,{method,headers:{'Authorization':'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store'});
    const data=await resp.json().catch(()=>({error:'API 回傳不是 JSON'}));
    if(!resp.ok)throw Error(data.error||('HTTP '+resp.status));
    return data;
  }finally{clearTimeout(timeout)}
}
cloudPushBtn.addEventListener('click',async()=>{
  cloudPushBtn.disabled=true;
  cloudStatus('正在驗證設定並送往雲端…');
  try{
    const payload=fullDeviceConfig();
    validateDeviceConfig(payload);
    const result=await cloudRequest('POST','/admin/config',payload);
    cloudStatus('雲端已儲存設定版本 '+result.revision+'；'+(result.deviceAckRevision===result.revision?'設備已回報套用':'等待 ESP32 回報套用')+'。',true);
  }catch(err){cloudStatus('同步未完成：'+err.message)}
  finally{cloudPushBtn.disabled=false}
});
cloudStatusBtn.addEventListener('click',async()=>{
  cloudStatusBtn.disabled=true;
  try{
    const result=await cloudRequest('GET','/admin/status');
    cloudStatus(result.revision===null?'雲端尚無設定':('雲端版本 '+result.revision+'；設備已回報版本 '+(result.deviceAckRevision??'無')+(result.deviceAckRevision===result.revision?'（已同步）':'（尚未同步）')),true);
  }catch(err){cloudStatus('查詢失敗：'+err.message)}
  finally{cloudStatusBtn.disabled=false}
});
