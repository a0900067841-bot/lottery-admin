'use strict';
// v0.1.16: hide obsolete sync-key UI; retain authenticated cloud publishing. Browser storage is NEVER a real prize ledger.
const KEY='lottery_ui_v010'; // reuse v0.1.4 data
const defaults={prizes:[],ticket:{store:'',days:7,usage:'',rules:['僅限原店兌換','購物金不可買菸','本券限兌換一次','本券不得折換現金','退貨應繳回所有獎品','退換貨不得再次抽獎'].join('\n'),warning:'逾期無法使用\n須出示實體紙本\n照片、影印無效',paperWidth:55,barcodeType:'qr',barcodeSize:90,rulesFontSize:12,warningFontSize:12,showRules:true,showWarning:true,watermarkEnabled:false,watermarkText:'億柒電子抽獎機',watermarkSize:12,watermarkOpacity:8}};
let state;
try{const v=JSON.parse(localStorage.getItem(KEY));state=v&&Array.isArray(v.prizes)&&v.ticket?v:structuredClone(defaults)}catch{state=structuredClone(defaults)}
const STORE_MIGRATION_KEY='lottery_store_placeholder_migrated_v014';
try{if(localStorage.getItem(STORE_MIGRATION_KEY)!=='1'){if(state.ticket?.store==='示範門市'){state.ticket.store='';localStorage.setItem(KEY,JSON.stringify(state))}localStorage.setItem(STORE_MIGRATION_KEY,'1')}}catch(e){console.warn('舊示範店名資料清理未完成',e)}
const isPrizeId=id=>typeof id==='string'&&/^prize_[a-f0-9]{32}$/.test(id);
function newPrizeId(){return 'prize_'+crypto.randomUUID().replace(/-/g,'')}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function el(id){return document.getElementById(id)}
function txt(tag,value,className){const n=document.createElement(tag);n.textContent=value;if(className)n.className=className;return n}
function renderPrizes(){el('prizeCount').textContent=state.prizes.length;const root=el('prizeList');root.replaceChildren();state.prizes.forEach((p,i)=>{const card=txt('div','','card prize-row'),info=document.createElement('div');info.append(txt('strong',p.name),txt('p',`${p.type} · 權重 ${p.weight} · 總數 ${p.quantity??0} · 已抽出 ${p.issued??0} · 剩餘 ${Math.max(0,(p.quantity??0)-(p.issued??0))}`));const actions=document.createElement('div');const edit=txt('button','編輯'),del=txt('button','刪除');edit.onclick=()=>{el('editIndex').value=i;el('prizeName').value=p.name;el('prizeType').value=p.type;el('prizeWeight').value=p.weight;el('prizeQuantity').value=p.quantity??0;window.scrollTo({top:0,behavior:'smooth'})};del.onclick=()=>{if(confirm(`刪除「${p.name}」？`)){state.prizes.splice(i,1);save();renderPrizes()}};actions.append(edit,del);card.append(info,actions);root.append(card)})}
function clearForm(){el('prizeForm').reset();el('editIndex').value=''}
el('prizeForm').addEventListener('submit',e=>{e.preventDefault();const p={name:el('prizeName').value.trim(),type:el('prizeType').value,weight:Number(el('prizeWeight').value),quantity:Number(el('prizeQuantity').value)};if(!p.name||!Number.isInteger(p.weight)||p.weight<1||!Number.isSafeInteger(p.quantity)||p.quantity<0)return;const i=el('editIndex').value;if(i!==''){const previous=state.prizes[Number(i)];if(previous.id!==undefined)p.id=previous.id;p.issued=previous.issued??0;if(p.quantity<p.issued){alert('總數量不能小於已抽出數量');return}}else{p.issued=0;/* Legacy prizes stay unmodified. New items have stable identity. */p.id=newPrizeId()}if(i==='')state.prizes.push(p);else state.prizes[Number(i)]=p;save();clearForm();renderPrizes()});el('clearEdit').onclick=clearForm;
function loadTicket(){const t=state.ticket;el('storeName').value=t.store||'';el('validDays').value=t.days;el('usage').value=t.usage;el('rules').value=t.rules;el('warning').value=t.warning;el('paperWidth').value=[30,40,50,55,57,58].includes(Number(t.paperWidth))?t.paperWidth:55;el('barcodeType').value=t.barcodeType||'qr';el('barcodeSize').value=t.barcodeSize??90;el('rulesFontSize').value=t.rulesFontSize??12;el('warningFontSize').value=t.warningFontSize??12;el('watermarkEnabled').checked=t.watermarkEnabled===true;el('watermarkText').value=t.watermarkText??'億柒電子抽獎機';el('watermarkSize').value=t.watermarkSize??12;el('watermarkOpacity').value=t.watermarkOpacity??8;el('showRules').checked=t.showRules!==false;el('showWarning').checked=t.showWarning!==false;renderTicket()}
function ticketFormValues(){return {store:el('storeName').value.trim(),days:Number(el('validDays').value),usage:el('usage').value,rules:el('rules').value,warning:el('warning').value,paperWidth:Number(el('paperWidth').value),barcodeType:el('barcodeType').value,barcodeSize:Number(el('barcodeSize').value),rulesFontSize:Number(el('rulesFontSize').value),warningFontSize:Number(el('warningFontSize').value),watermarkEnabled:el('watermarkEnabled').checked,watermarkText:el('watermarkText').value.trim(),watermarkSize:Number(el('watermarkSize').value),watermarkOpacity:Number(el('watermarkOpacity').value),showRules:el('showRules').checked,showWarning:el('showWarning').checked}}
function ticketChanged(){
  renderTicket();
  const changed=JSON.stringify(ticketFormValues())!==JSON.stringify(normalizeTicket(state.ticket));
  el('ticketSaveStatus').textContent=changed?'預覽已更新，但尚未儲存；正式模板仍使用上次儲存版本':'目前設定與已儲存模板相同';
  el('ticketSaveStatus').dataset.saved=changed?'false':'true';
}
function normalizeTicket(t){return {store:t.store||'',days:Number(t.days)||7,usage:t.usage||'',rules:t.rules||'',warning:t.warning||'',paperWidth:Number(t.paperWidth)||55,barcodeType:t.barcodeType||'qr',barcodeSize:Number(t.barcodeSize??90),rulesFontSize:Number(t.rulesFontSize??12),warningFontSize:Number(t.warningFontSize??12),watermarkEnabled:t.watermarkEnabled===true,watermarkText:typeof t.watermarkText==='string'?t.watermarkText:'億柒電子抽獎機',watermarkSize:Number(t.watermarkSize??12),watermarkOpacity:Number(t.watermarkOpacity??8),showRules:t.showRules!==false,showWarning:t.showWarning!==false}}
function renderSavedTicketSummary(){
  const t=normalizeTicket(state.ticket);
  el('savedTicketSummary').textContent=`${t.paperWidth} mm · ${t.barcodeType==='qr'?'QR Code':'Code 128'} · 有效 ${t.days} 天 · 條碼比例 ${t.barcodeSize}%`;
}
el('ticketForm').addEventListener('input',ticketChanged);el('ticketForm').addEventListener('change',ticketChanged);
// v0.1.34: stable, evenly staggered individual watermark labels, entirely inside paper.
// Position only complete labels; never rotate a full-size layer or clip partial words.
function renderReceiptWatermark(receipt,ticket){
  const wm=txt('div','','receipt-watermark');
  wm.setAttribute('aria-hidden','true');
  wm.style.fontSize=ticket.watermarkSize+'px';
  wm.style.opacity=String(ticket.watermarkOpacity/100);
  for(let i=0;i<24;i++)wm.append(txt('span',ticket.watermarkText));
  receipt.append(wm);
}
function layoutReceiptWatermark(receipt){
  const layer=receipt.querySelector('.receipt-watermark');
  if(!layer)return;
  const marks=Array.from(layer.children);
  if(!marks.length)return;
  // Measure the original text without rotation before placing each label.
  for(const el of marks){el.style.display='none';el.style.transform='none'}
  const probe=marks[0];
  probe.style.display='block';probe.style.left='0';probe.style.top='0';
  const rect=probe.getBoundingClientRect();
  const width=receipt.clientWidth,height=receipt.clientHeight;
  const margin=8,cos=Math.cos(Math.PI/6),sin=Math.sin(Math.PI/6);
  const unscaledW=rect.width*cos+rect.height*sin;
  const unscaledH=rect.width*sin+rect.height*cos;
  if(width<=2*margin||height<=2*margin||!unscaledW||!unscaledH){probe.style.display='none';return}
  // Very long admin-supplied text scales down rather than extending outside paper.
  const scale=Math.min(1,(width-2*margin)/unscaledW,(height-2*margin)/unscaledH);
  const halfW=unscaledW*scale/2,halfH=unscaledH*scale/2;
  const minX=margin+halfW,maxX=width-margin-halfW;
  const minY=margin+halfH,maxY=height-margin-halfH;
  const twoColumns=maxX-minX>=unscaledW*scale+12;
  const centers=twoColumns?[minX+2,maxX-2]:[(minX+maxX)/2];
  const rowStep=Math.max(55,unscaledH*scale*1.32);
  // QR and its quiet zone are entirely blank and watermark-free.
  const barcode=receipt.querySelector('.receipt-barcode');
  let qr=null;
  if(barcode){
    const a=barcode.getBoundingClientRect(),b=receipt.getBoundingClientRect();
    qr={l:a.left-b.left-10,r:a.right-b.left+10,t:a.top-b.top-10,b:a.bottom-b.top+10};
  }
  let used=0;
  for(let row=0;used<marks.length;row++){
    let inRange=false;
    for(let col=0;col<centers.length&&used<marks.length;col++){
      const x=centers[col],y=minY+4+row*rowStep+(col%2)*rowStep/2;
      if(y>maxY)continue;
      inRange=true;
      const overlapsQr=qr&&(x+halfW>qr.l&&x-halfW<qr.r&&y+halfH>qr.t&&y-halfH<qr.b);
      if(overlapsQr)continue;
      const mark=marks[used++];
      mark.style.display='block';
      mark.style.left=x+'px';mark.style.top=y+'px';
      mark.style.transform='translate(-50%,-50%) rotate(-30deg) scale('+scale+')';
    }
    if(!inRange)break;
  }
  for(let i=used;i<marks.length;i++)marks[i].style.display='none';
}
const receiptWatermarkResizeObserver=typeof ResizeObserver==='function'
  ?new ResizeObserver(entries=>{for(const entry of entries)layoutReceiptWatermark(entry.target)})
  :null;
window.addEventListener('resize',()=>layoutReceiptWatermark(el('receipt')));
function renderTicket(){const t=ticketFormValues(),r=el('receipt');r.replaceChildren();const paperWidth=[30,40,50,55,57,58].includes(t.paperWidth)?t.paperWidth:55;r.style.width=paperWidth+'mm';if(t.watermarkEnabled&&t.watermarkText)renderReceiptWatermark(r,t);el('previewPaperWidth').textContent=paperWidth+' mm';for(const [id,v] of [['barcodeSizeValue',t.barcodeSize+'%'],['rulesFontSizeValue',t.rulesFontSize+' px'],['warningFontSizeValue',t.warningFontSize+' px'],['watermarkSizeValue',t.watermarkSize+' px'],['watermarkOpacityValue',t.watermarkOpacity+'%']])el(id).textContent=v;const now=new Date(),pad=n=>String(n).padStart(2,'0'),fmt=d=>`${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`;const expiry=new Date(now.getFullYear(),now.getMonth(),now.getDate()+Math.max(1,Number(t.days)||1));const line=(label,value)=>{const p=txt('p','','receipt-meta');p.append(txt('strong',label),document.createTextNode(value));return p};const section=(heading,body,size)=>{const block=txt('section','','receipt-section');block.append(txt('strong',heading,'receipt-section-title'),txt('div',body||'','receipt-section-text'));if(size)block.querySelector('.receipt-section-text').style.fontSize=size+'px';return block};if(t.store)r.append(txt('h2',t.store,'receipt-store'));const prize=state.prizes.find(p=>Number(p.quantity)>0)||state.prizes[0];r.append(txt('h3',prize?.name||'獎項名稱（示意）','receipt-prize'));r.append(line('列印日期：',`${fmt(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`));r.append(document.createElement('hr'));const code=txt('div','','receipt-barcode');const isQR=t.barcodeType==='qr';const symbol=txt('div',isQR?'QR 示意':'CODE 128 示意',isQR?'barcode-qr-placeholder':'barcode-128-placeholder');symbol.style.width=Math.max(50,Math.min(100,t.barcodeSize??90))+'%';symbol.setAttribute('aria-label','不可掃描的條碼版面佔位圖');code.append(symbol,txt('small','版面示意｜不可掃描核銷','receipt-qr-note'));r.append(code);r.append(line('活動序號：','DEMO-NOT-VALID'));r.append(line('序號有效期限：',fmt(expiry)));r.append(document.createElement('hr'));const rules=String(t.rules||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).join('\n');if(t.usage.trim())r.append(section('活動說明：',t.usage));if(rules&&t.showRules)r.append(section('使用規則：',rules,t.rulesFontSize));if(t.warning.trim()&&t.showWarning){r.append(document.createElement('hr'));r.append(section('注意事項：',t.warning,t.warningFontSize))}r.append(txt('p','展示預覽｜非有效獎券','preview-warning'));layoutReceiptWatermark(r);if(receiptWatermarkResizeObserver)receiptWatermarkResizeObserver.observe(r)}
el('ticketForm').addEventListener('submit',e=>{e.preventDefault();state.ticket=ticketFormValues();try{save();renderTicket();el('ticketSaveStatus').textContent='已儲存列印模板（目前瀏覽器）；等待未來同步至 ESP32';el('ticketSaveStatus').dataset.saved='true';renderSavedTicketSummary()}catch(err){el('ticketSaveStatus').textContent='儲存失敗：請檢查瀏覽器儲存空間';el('ticketSaveStatus').dataset.saved='false'}});
// Actual redemption availability is enforced by the authenticated Worker.
// A stale website cannot turn on issuance or bypass the server-side paper checks.
el('checkCode').onclick=async()=>{
  const output=el('redeemResult'),button=el('checkCode');
  const qrValue=el('redeemCode').value.trim();
  output.textContent='';

  if(!/^YIQI1\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/.test(qrValue)){output.textContent='請掃描紙本正本獎券上的完整 QR Code。單獨輸入兌換編號不能核銷。';return}
  if(!el('originalPaperConfirmed').checked){output.textContent='請先實際確認收到實體紙本正本獎券。';return}
  button.disabled=true;output.textContent='正在確認雲端核銷服務…';
  try{
    const ready=await cloudRequest('GET','/tickets/readiness');
    if(ready.ok!==true||ready.redemptionAvailable!==true)
      throw Error('雲端核銷服務尚未就緒，未修改任何獎券');
    if(!confirm('已確認收到實體紙本正本，確定核銷？此操作不可撤銷。')){
      output.textContent='已取消核銷，獎券沒有修改。';return;
    }
    output.textContent='正在向伺服器核銷…';
    const result=await cloudRequest('POST','/tickets/redeem',{qrValue,paperOriginalConfirmed:true});
    if(result.ok&&result.status==='redeemed'){
      output.textContent='核銷成功｜獎券 ID：'+result.ticketId;
      el('redeemCode').value='';el('originalPaperConfirmed').checked=false;
    }else output.textContent='伺服器未確認核銷；請先查詢交易狀態，不要直接重試。';
  }catch(e){output.textContent='核銷結果未確認：'+e.message+'。請查詢交易狀態，避免重複操作。'}
  finally{button.disabled=false}
};
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
    prizes:state.prizes.map(p=>({...p.id?{id:p.id}:{},name:p.name,type:p.type,weight:Number(p.weight),quantity:Number(p.quantity),issued:Number(p.issued??0)})),
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
  if(![30,40,50,55,57,58].includes(t.paperWidth)||!['qr','code128'].includes(t.barcodeType)||!intRange(t.barcodeSize,50,100)||!intRange(t.rulesFontSize,1,18)||!intRange(t.warningFontSize,1,18)||typeof t.showRules!=='boolean'||typeof t.showWarning!=='boolean'||(t.watermarkEnabled!==undefined&&typeof t.watermarkEnabled!=='boolean')||(t.watermarkText!==undefined&&!validText(t.watermarkText,40))||(t.watermarkSize!==undefined&&!intRange(t.watermarkSize,6,30))||(t.watermarkOpacity!==undefined&&!intRange(t.watermarkOpacity,1,25)))throw Error('紙寬、條碼或文字設定不正確');
  if(!Array.isArray(x.prizes)||x.prizes.length>100)throw Error('獎項數量格式不正確（最多 100 項）');
  const ids=new Set();
  for(const p of x.prizes){
    if(p.id!==undefined){if(!isPrizeId(p.id)||ids.has(p.id))throw Error('獎項 ID 格式錯誤或重複');ids.add(p.id)}
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
// v0.1.15: fixed API endpoint. Login token is provided in memory by auth.js.
// Never cache login tokens or administrator keys in localStorage/sessionStorage.
const CLOUD_API_BASE='https://yijia-lottery-api.a0900067841.workers.dev';
el('cloudApiUrl').value=CLOUD_API_BASE;
el('cloudApiUrl').readOnly=true;
// The login module owns cloudAdminKey and hides the legacy field after loading.
// Remove the obsolete explanation without altering the working HTML structure.
const cloudCard=el('cloudSyncCard');
if(cloudCard){
  const legacyHint=Array.from(cloudCard.querySelectorAll('p')).find(p=>p.textContent.includes('正式帳號登入尚未完成'));
  if(legacyHint)legacyHint.textContent='管理員登入後即可同步雲端設定；ESP32 V07 尚未支援接收與回報。';
  // Keep the input in the DOM: auth.js supplies the session token to it.
  // Some existing styles use `label { display:block }`, which can override
  // the native [hidden] presentation. Force the obsolete row to stay hidden.
  const legacyLabel=el('cloudAdminKey')?.closest('label');
  if(legacyLabel){
    legacyLabel.hidden=true;
    legacyLabel.style.setProperty('display','none','important');
  }
  for(const p of cloudCard.querySelectorAll('p.muted')){
    if(p.textContent.includes('請勿在此輸入 Wi-Fi 密碼') || p.textContent.includes('API 金鑰不會寫入')){
      p.textContent='雲端同步使用目前登入的管理員權限，不需要另外輸入同步金鑰。ESP32 V07 尚未支援接收及回報設定。';
    }
  }
  const intro=cloudCard.querySelector('h2 + p.muted');
  if(intro)intro.textContent='登入管理員帳號後，可將已儲存的獎項、獎券模板及提示音設定送至雲端。設定已上傳不代表 ESP32 已套用。';
}
cloudStatus('尚未查詢雲端狀態；管理員登入後可儲存設定或查詢設備同步狀態。');
function cloudCredentials(){
  const raw=el('cloudApiUrl').value.trim().replace(/\/+$/,'');
  const key=el('cloudAdminKey').value;
  if(!raw)throw Error('雲端 API 網址未設定');
  const parsed=new URL(raw);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw Error('請輸入 HTTPS API 根網址，不含路徑或參數');
  if(!key)throw Error('請先以管理員帳號登入');
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
// Preserve the server-assigned prize IDs after the exact legacy configuration is saved.
// IDs are accepted only when returned by the authenticated Worker in request order.
function preserveServerPrizeIds(submitted,returnedIds){
  if(!Array.isArray(returnedIds)||returnedIds.length!==submitted.prizes.length||
     !returnedIds.every(isPrizeId)||new Set(returnedIds).size!==returnedIds.length)
    throw Error('雲端已處理設定，但固定獎項 ID 回傳不完整；請停止修改並先回查雲端');
  const current=fullDeviceConfig().prizes;
  if(JSON.stringify(current)!==JSON.stringify(submitted.prizes))
    throw Error('儲存期間瀏覽器獎項已改動；雲端版本需重新核對，不能套用 ID');
  for(let i=0;i<returnedIds.length;i++){
    if(submitted.prizes[i].id!==undefined&&submitted.prizes[i].id!==returnedIds[i])
      throw Error('雲端與瀏覽器的獎項 ID 不一致；禁止覆蓋');
  }
  const previous=state.prizes;
  try{
    state.prizes=previous.map((prize,i)=>({...prize,id:returnedIds[i]}));
    save();
    renderPrizes();
  }catch(e){state.prizes=previous;throw Error('雲端已儲存，但瀏覽器無法保存固定 ID；請勿再次上傳或更改獎項，先匯出備份');}
}

cloudPushBtn.addEventListener('click',async()=>{
  cloudPushBtn.disabled=true;
  cloudStatus('正在驗證設定並送往雲端…');
  try{
    const payload=fullDeviceConfig();
    validateDeviceConfig(payload);
    if(!payload.prizes.length||!payload.ticket.usage?.trim())throw Error('正式同步前，請先設定獎項與完整使用方式。');
    // Legacy prize identities must be reconciled against the actual saved cloud/D1
    // records. Never infer IDs from names, list positions or newly generated IDs.
    const idCount=payload.prizes.filter(p=>isPrizeId(p.id)).length;
    if(idCount>0&&idCount<payload.prizes.length)throw Error('目前獎項同時包含舊版無 ID 與新版固定 ID，禁止同步；請先完成人工對照。瀏覽器中的獎項不會被刪除。');
    const server=await cloudRequest('GET','/admin/lottery/readiness');
    if(server.ok!==true||server.readOnly!==true||server.deviceId!=='esp32-48375cd33fb0')throw Error('新版 Worker 尚未啟用，不可修改雲端設定');
    const result=await cloudRequest('POST','/admin/config',payload);
    // Do not send another /admin/config after a successful save just to discover IDs.
    preserveServerPrizeIds(payload,result.prizeIds);
    resetD1Apply(); // KV revision changed; every prior D1 preview is stale.
    cloudStatus('KV 設定已儲存，固定獎項 ID 已保存在本機（版本 '+result.revision+'）。D1 庫存尚未因此同步。'+(result.deviceAckRevision===result.revision?'設備已回報設定。':'ESP32 尚未回報設定。'),true);
  }catch(err){cloudStatus('同步未完成：'+err.message)}
  finally{cloudPushBtn.disabled=false}
});
// Manually load the authenticated KV configuration on another phone/computer.
// Never infer prize IDs or overwrite a local draft without the operator's consent.
const cloudLoadBtn=el('cloudLoad');
if(cloudLoadBtn)cloudLoadBtn.addEventListener('click',async()=>{
  cloudLoadBtn.disabled=true;
  cloudStatus('正在從雲端讀取已保存的設定（唯讀）…');
  try{
    const found=await cloudRequest('GET','/admin/config');
    if(found.ok!==true||found.exists!==true||!found.config)
      throw Error('目前雲端沒有已儲存的設備設定');
    validateDeviceConfig(found.config);
    if(!Array.isArray(found.config.prizes)||!found.config.prizes.every(p=>isPrizeId(p.id)))
      throw Error('雲端獎項尚未完成固定 ID 對照，禁止取代本機草稿');
    const msg=`從雲端讀回 ${found.config.prizes.length} 項獎項及獎券設定（版本 ${found.revision}）？\n這會取代目前瀏覽器尚未同步的草稿，但不會修改 D1 或雲端資料。建議先按「下載完整設備設定 JSON」備份。`;
    if(!window.confirm(msg)){cloudStatus('已取消讀取套用；本機設定保持不變。');return;}
    const oldState=state,oldSound=sound;
    const oldStateJSON=localStorage.getItem(KEY),oldSoundJSON=localStorage.getItem(SOUND_KEY);
    try{
      state={prizes:found.config.prizes.map(p=>({...p})),ticket:{...found.config.ticket}};
      sound={...found.config.sound};
      save();localStorage.setItem(SOUND_KEY,JSON.stringify(sound));
      renderPrizes();loadTicket();loadSound();renderSavedTicketSummary();resetD1Apply();
    }catch(e){
      state=oldState;sound=oldSound;
      try{
        if(oldStateJSON===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,oldStateJSON);
        if(oldSoundJSON===null)localStorage.removeItem(SOUND_KEY);else localStorage.setItem(SOUND_KEY,oldSoundJSON);
      }catch{}
      throw e;
    }
    cloudStatus(`已載入雲端版本 ${found.revision} 到這個瀏覽器（唯讀取得）。D1 庫存不會因此改變。`,true);
  }catch(e){cloudStatus('雲端讀取失敗：'+e.message);}
  finally{cloudLoadBtn.disabled=false;}
});
// Actual cloud preflight: useful on iPhone and PC without exposing any secret.
const readinessBtn=el('lotteryReadiness'),readinessResult=el('lotteryReadinessResult');
if(readinessBtn)readinessBtn.addEventListener('click',async()=>{
  readinessBtn.disabled=true;
  readinessResult.textContent='正在唯讀檢查後端、D1 和正式發券設定…';
  try{
    const r=await cloudRequest('GET','/admin/lottery/readiness');
    if(r.ok!==true||r.readOnly!==true||!r.checks)throw Error('無法取得完整檢查結果');
    const label={cloudConfigSaved:'已儲存雲端設定',deviceMatched:'ESP32 設備 ID',
      qrSigningKeySet:'QR 簽章密鑰',modeIsProduction:'正式發券模式',
      frozenTermsValid:'獎券條款完整',d1RevisionMatched:'D1 庫存同步版本',
      inventoryAvailable:'仍有可抽獎庫存',d1Available:'D1 資料表可讀取'};
    const lines=Object.entries(label).map(([k,v])=>`${r.checks[k]?'✓':'✕'} ${v}`);
    readinessResult.textContent=(r.productionPreflight?'雲端正式發券條件已符合；仍須實機驗收。':'尚未符合正式發券條件。')+'\n'+lines.join('\n')+'\n此檢查不會修改獎券或資料庫。';
    readinessResult.style.whiteSpace='pre-line';
    readinessResult.dataset.saved=r.productionPreflight?'true':'false';
  }catch(e){readinessResult.textContent='檢查未完成：'+e.message;readinessResult.dataset.saved='false';}
  finally{readinessBtn.disabled=false;}
});
cloudStatusBtn.addEventListener('click',async()=>{
  cloudStatusBtn.disabled=true;
  try{
    const result=await cloudRequest('GET','/admin/status');
    cloudStatus(result.revision===null?'雲端尚無設定':('雲端版本 '+result.revision+'；設備已回報版本 '+(result.deviceAckRevision??'無')+(result.deviceAckRevision===result.revision?'（已同步）':'（尚未同步）')),true);
  }catch(err){cloudStatus('查詢失敗：'+err.message)}
  finally{cloudStatusBtn.disabled=false}
});


// Re-preview whenever a cloud save occurs; D1 writing is NEVER automatic.
let d1PreviewRevision=null;
function resetD1Apply(){
  d1PreviewRevision=null;
  const b=el('d1Apply'); if(b)b.disabled=true;
  const c=el('d1ApplyCheck'); if(c)c.checked=false;
  const x=el('d1ApplyConfirm'); if(x)x.value='';
}
function updateD1ApplyState(){
  const b=el('d1Apply');
  if(b)b.disabled=!(d1PreviewRevision&&el('d1ApplyCheck').checked&&el('d1ApplyConfirm').value.trim()==='SYNC_PRIZES');
}
const d1ApplyButton=el('d1Apply'),d1ApplyResult=el('d1ApplyResult');
el('d1ApplyCheck').addEventListener('change',updateD1ApplyState);
el('d1ApplyConfirm').addEventListener('input',updateD1ApplyState);
if(d1ApplyButton)d1ApplyButton.addEventListener('click',async()=>{
  if(!d1PreviewRevision||!el('d1ApplyCheck').checked||el('d1ApplyConfirm').value.trim()!=='SYNC_PRIZES')return;
  const originalRevision=d1PreviewRevision;
  resetD1Apply();
  d1ApplyResult.textContent='正在重新唯讀確認雲端版本與 D1 差異…';
  try{
    // Re-preview immediately before a guarded write and fail closed on any missing prizes.
    const again=await cloudRequest('GET','/admin/prizes/sync-preview');
    if(again.ok!==true||again.readOnly!==true||again.revision!==originalRevision||
       again.plan?.safeToPropose!==true||!Array.isArray(again.plan.disabled)||again.plan.disabled.length!==0)
      throw Error('D1 或 KV 狀態已變，請重新預覽；沒有執行同步');
    const acknowledged=window.confirm(`將 ${again.plan.localCount} 項獎項寫入正式 D1（雲端設定版本 ${originalRevision}）？此步驟會修改實際庫存；若不是你已核對的最終數量，請取消。`);
    if(!acknowledged){d1ApplyResult.textContent='已取消，D1 沒有修改。';return;}
    const r=await cloudRequest('POST','/admin/prizes/sync',{expectedRevision:originalRevision,confirm:'SYNC_PRIZES'});
    if(r.ok!==true||r.verified!==true||r.revision!==originalRevision)
      throw Error('伺服器未確認 D1 同步；請先唯讀查詢，不要重送');
    d1ApplyResult.textContent=`D1 同步完成並由伺服器回查驗證：${r.count} 項，版本 ${r.revision}。仍須查詢實際庫存，尚未開放正式出票。`;
  }catch(e){d1ApplyResult.textContent='D1 同步未確認：'+e.message+'。若曾嘗試寫入，請先唯讀回查，勿直接重送。';}
  finally{d1ApplyButton.disabled=true;}
});

// Phase 2: read-only D1 sync preflight; no writes, migration, or issuance.
const d1PreviewButton=el('d1Preview');
const d1PreviewResult=el('d1PreviewResult');
d1PreviewButton.addEventListener('click',async()=>{
  resetD1Apply();
  d1PreviewButton.disabled=true;
  d1PreviewResult.textContent='正在讀取 D1 與雲端設定差異（唯讀）…';
  try{
    const result=await cloudRequest('GET','/admin/prizes/sync-preview');
    if(result.ok!==true || result.readOnly!==true || !result.plan?.safeToPropose)throw Error('伺服器未確認安全的唯讀預覽');
    const p=result.plan;
    d1PreviewResult.textContent=`D1 唯讀預覽（雲端版本 ${result.revision||"未知"}）：目前 ${p.remoteCount} 項；雲端設定 ${p.localCount} 項；新增 ${p.added.length}、更新 ${p.updated.length}、停用 ${p.disabled.length}。此結果不代表已同步，也不會執行寫入。`;
    d1PreviewResult.dataset.saved='true';
    if(p.disabled.length===0 && typeof result.revision==='string' && result.revision){
      d1PreviewRevision=result.revision;
      updateD1ApplyState();
    }
  }catch(e){d1PreviewResult.textContent='D1 同步預覽未通過：'+e.message+'。未修改任何資料。';d1PreviewResult.dataset.saved='false'}
  finally{d1PreviewButton.disabled=false}
});


// Phase 8: read actual D1 prize rows; never overwrite the browser's draft prizes.
const d1Readback=el('d1Readback'),d1ReadbackResult=el('d1ReadbackResult');
d1Readback.addEventListener('click',async()=>{
  d1Readback.disabled=true;
  d1ReadbackResult.textContent='正在讀取 D1 實際獎項與庫存…';
  try {
    const r=await cloudRequest('GET','/admin/prizes/d1-readback');
    if(r.ok!==true||r.readOnly!==true||!Array.isArray(r.prizes))throw Error('讀取結果不完整');
    const lines=r.prizes.map(p=>`${p.name}｜總數 ${p.quantity}｜已發 ${p.issued}｜剩餘 ${p.remaining}｜${p.enabled?'啟用':'停用'}`);
    d1ReadbackResult.textContent=`D1 共有 ${r.prizes.length} 項。雲端設定版本 ${r.cloudRevision||'無'}；D1 套用版本 ${r.appliedRevision||'無'}。\n`+(lines.length?lines.join('\n'):'目前 D1 沒有獎項。')+'\n以上為唯讀結果，不代表已同步，不會改動目前編輯內容。';
    d1ReadbackResult.style.whiteSpace='pre-line';
  }catch(e){d1ReadbackResult.textContent='D1 實際庫存查詢失敗：'+e.message}
  finally {d1Readback.disabled=false}
});

// Equipment maintenance: fail closed until the firmware can reject restart during unresolved transactions.
const restartCheck=el('restartCheck'),restartDevice=el('restartDevice'),restartResult=el('restartResult');
restartCheck.addEventListener('click',async()=>{
  restartCheck.disabled=true;
  restartDevice.disabled=true;
  restartResult.textContent='正在查詢後端是否支援安全重啟…';
  try{
    const r=await cloudRequest('GET','/admin/device/restart/status');
    restartResult.textContent=r.reason||'無法確認安全重啟狀態';
    // Do not offer a restart operation until full device-side transaction safety is verified.
  }catch(e){restartResult.textContent='無法確認重啟狀態：'+e.message+'。按鈕維持鎖定。'}
  finally{restartCheck.disabled=false}
});

// V08: Admin-attested physical ORIGINAL ticket delivery.
// This never creates a ticket or reprints it; the Worker independently checks
// Admin session, unresolved print state and the exact ticket identity.
const handoffButton=el('handoffConfirm');
if(handoffButton) handoffButton.addEventListener('click',async()=>{
  const result=el('handoffResult');
  result.textContent='';
  // Frontend is a convenience only: the Worker MUST enforce role=Admin.
  if(typeof window.lotteryCan!=='function'||!window.lotteryCan('accounts_manage')){
    result.textContent='只有已登入的管理員可以確認紙本交付。';return;
  }
  const qr=el('handoffQrValue').value.trim();
  const match=/^YIQI1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{64})$/.exec(qr);
  if(!match){result.textContent='必須掃描完整紙本 QR，不能只輸入獎券 ID 或手工猜測。';return;}
  if(!el('handoffPaperOriginal').checked||!el('handoffPaperDelivered').checked){
    result.textContent='請先親自確認紙本完整、已交給持有人，並勾選兩項確認。';return;
  }
  if(!window.confirm('這張 B3S 實體紙券確實已完整列印並交付持有人？確認後抽獎機可能允許下一次抽獎。'))return;
  handoffButton.disabled=true;
  result.textContent='正在向伺服器確認實體紙本交付…';
  try{
    const reply=await cloudRequest('POST','/admin/lottery/handoff/verify',{
      qrValue:qr,ticketId:match[1],confirmedPhysicalPaper:true,confirmedHandedToHolder:true
    });
    if(reply.ok===true&&reply.state==='verified_delivered'&&reply.ticketId?.toLowerCase()===match[1].toLowerCase()){
      result.textContent='紙本交付已由伺服器確認。'+(reply.remoteCommandStatus==='completed'?'遠端指令已結案；設備仍須自行確認並解除鎖定。':reply.remoteCommandStatus==='pending'?'遠端指令仍鎖定，請先查詢狀態，不要重複發券。':'ESP32 將自行查詢確認結果；請以設備實際狀態為準。');
      el('handoffQrValue').value='';
      el('handoffPaperOriginal').checked=false;
      el('handoffPaperDelivered').checked=false;
    }else result.textContent='伺服器未回傳完整的交付確認，先不要重新列印。';
  }catch(e){
    result.textContent='交付結果尚未確認：'+e.message+'。請先查核伺服器紀錄，不要盲目重送。';
  }finally{handoffButton.disabled=false;}
});

// Real D1 ticket history; read-only, gated both by authenticated UI and Worker permission.
const historyButton=el('loadTicketHistory');
if(historyButton)historyButton.addEventListener('click',async()=>{
  const status=el('ticketHistoryStatus'),root=el('ticketHistoryItems');
  status.textContent='';root.replaceChildren();
  if(typeof window.lotteryCan!=='function'||!window.lotteryCan('redeem_history')){
    status.textContent='目前帳號沒有核銷紀錄查詢權限。';return;
  }
  historyButton.disabled=true;status.textContent='正在從 D1 查詢最新獎券紀錄（唯讀）…';
  try{
    const r=await cloudRequest('GET','/tickets/list');
    if(r.ok!==true||!Array.isArray(r.items))throw Error('伺服器回傳資料格式不正確');
    status.textContent=`已取得 ${r.items.length} 筆紀錄（最多 100 筆，唯讀）。`;
    for(const t of r.items){
      const card=document.createElement('article');card.className='card';
      const head=document.createElement('strong');head.textContent=t.prizeName||'未命名獎項';
      const line=document.createElement('p');
      const stateLabel=t.status==='redeemed'?'已核銷':t.status==='issued'?'已發行':t.status==='void'?'已作廢':t.status==='expired'?'已到期':(t.status||'未知');
      line.textContent=`${t.isTest?'【測試券】':'【正式券】'}${stateLabel}｜${t.storeName||'未標示店名'}｜發行：${t.issuedAt||'無資料'}`;
      const id=document.createElement('small');id.textContent='獎券 ID：'+(t.id||'無');
      card.append(head,line,id);root.append(card);
    }
    if(!r.items.length)status.textContent='D1 目前沒有獎券紀錄。';
  }catch(e){status.textContent='查詢失敗：'+e.message+'。沒有修改任何獎券。';}
  finally{historyButton.disabled=false;}
});


// Site -> Worker -> ESP32 remote draw. Authorization must ALSO be enforced by Worker.
// Do not send a command without cloud preflight; never equate ACK with physical output.
const remoteDrawButton=el('remoteDrawSubmit');
const remoteDrawStatus=el('remoteDrawStatus');
const remoteDrawStatusButton=el('remoteDrawStatusButton');
let lastRemoteCommandId=null,remoteReady=false,remoteIssueMode=null;
try{const stored=sessionStorage.getItem('yiqiLastRemoteDrawId');if(/^[0-9a-f-]{36}$/i.test(stored||''))lastRemoteCommandId=stored;}catch{}
// D1—not browser sessionStorage—is the authority for unfinished commands.
// This is read-only recovery; if status cannot be verified, leave printing locked.
async function refreshRemoteCommandFromCloud(){
  const pending=await cloudRequest('GET','/admin/device/draw-commands');
  if(pending.ok!==true || pending.readOnly!==true)throw Error('無法確認未完成的遠端指令');
  if(pending.command){
    if(!/^[0-9a-f-]{36}$/i.test(pending.command.commandId||''))throw Error('雲端指令識別碼不正確');
    lastRemoteCommandId=pending.command.commandId;
    try{sessionStorage.setItem('yiqiLastRemoteDrawId',lastRemoteCommandId)}catch{}
    return `雲端尚有未完成指令（${pending.command.state}）。已找回編號；不可重新出券，請先完成原紙本的交付確認。`;
  }
  if(lastRemoteCommandId){
    // A stale browser ID may be cleared ONLY after the server confirms completion.
    const prev=await cloudRequest('GET','/admin/device/draw-commands?commandId='+encodeURIComponent(lastRemoteCommandId));
    if(prev.ok!==true||prev.commandId!==lastRemoteCommandId||prev.state!=='completed')
      throw Error('上一筆指令尚無已完成證據；維持鎖定');
    lastRemoteCommandId=null;
    try{sessionStorage.removeItem('yiqiLastRemoteDrawId')}catch{}
  }
  return '';
}
async function checkRemoteDrawReadiness(){
  remoteReady=false;remoteIssueMode=null;remoteDrawButton.disabled=true;
  if(typeof window.lotteryCan!=='function'||!window.lotteryCan('ticket_edit')){
    remoteDrawStatus.textContent='目前帳號沒有獎券模板編輯／遠端列印權限。';return false;
  }
  try{
    const note=await refreshRemoteCommandFromCloud();
    if(note){remoteDrawStatus.textContent=note;return false;}
    const r=await cloudRequest('GET','/admin/lottery/readiness');
    const testReady=r.ok===true&&r.readOnly===true&&
      r.checks?.modeIsTest===true&&r.testPreflight===true;
    const productionReady=r.ok===true&&r.readOnly===true&&
      r.checks?.modeIsProduction===true&&r.productionPreflight===true&&
      r.remoteProductionEnabled===true;
    if(!testReady&&!productionReady){
      remoteDrawStatus.textContent='測試／正式發券或獎項同步尚未就緒；不會下達列印指令。';return false;
    }
    remoteIssueMode=testReady?'test':'production';
    remoteReady=true;
    remoteDrawButton.disabled=!!lastRemoteCommandId;
    const modeLabel=remoteIssueMode==='test'?'測試券（不可兌換）':'正式獎券';
    remoteDrawStatus.textContent=lastRemoteCommandId?'已有上次指令，請先查詢狀態。':
      `雲端已允許 ${modeLabel}；仍須確認 B3S 實際出紙。`;
    return true;
  }catch(e){remoteDrawStatus.textContent='遠端列印保持鎖定：'+e.message;return false;}
}
remoteDrawButton.addEventListener('click',async()=>{
  if(lastRemoteCommandId){remoteDrawStatus.textContent='已有尚未查明的指令，請先查詢狀態，不可重複下達。';return;}
  if(!(await checkRemoteDrawReadiness()))return;
  const expectedMode=remoteIssueMode;
  if(expectedMode!=='test'&&expectedMode!=='production')return;
  const confirmation=expectedMode==='test'
    ?'確定要讓 ESP32 抽出一張測試券並嘗試由 B3S 列印嗎？測試券不可兌換。'
    :'確定要讓 ESP32 抽出一張新的正式獎券並嘗試由 B3S 列印嗎？';
  if(!confirm(confirmation))return;
  const id=crypto.randomUUID();
  lastRemoteCommandId=id;
  try{sessionStorage.setItem('yiqiLastRemoteDrawId',id)}catch{}
  remoteDrawButton.disabled=true;
  remoteDrawStatus.textContent='正在向雲端登記指令，尚未印出獎券…';
  try{
    const r=await cloudRequest('POST','/admin/device/draw-commands',{commandId:id,confirmedNewTicket:true,expectedMode});
    if(r.ok!==true||r.commandId!==id)throw Error('未收到一致的雲端指令確認');
    remoteDrawStatus.textContent='指令已登記：'+r.state+'。請確認 B3S 實際出紙；伺服器接收不等於列印成功。';
  }catch(e){remoteDrawStatus.textContent='指令結果未確認：'+e.message+'。請先查詢相同指令，切勿重複列印。';}
});
remoteDrawStatusButton.addEventListener('click',async()=>{
  if(!lastRemoteCommandId){await checkRemoteDrawReadiness();if(!lastRemoteCommandId)return;}
  try{
    const r=await cloudRequest('GET','/admin/device/draw-commands?commandId='+encodeURIComponent(lastRemoteCommandId));
    if(r.ok!==true||r.commandId!==lastRemoteCommandId)throw Error('伺服器未確認原始指令');
    remoteDrawStatus.textContent='指令狀態：'+r.state+(r.state==='completed'?'（已確認紙本交付）':'（未確認紙本交付，不可視為列印成功）');
    if(r.state==='completed'){
      lastRemoteCommandId=null;
      try{sessionStorage.removeItem('yiqiLastRemoteDrawId')}catch{}
      await checkRemoteDrawReadiness();
    }
  }catch(e){remoteDrawStatus.textContent='指令仍未確認：'+e.message+'。不要重複下達。';}
});
window.addEventListener('lottery-auth-ready',()=>{void checkRemoteDrawReadiness()});
// Also re-check after login since older auth.js versions do not emit an event.
setTimeout(()=>{void checkRemoteDrawReadiness()},1000);
