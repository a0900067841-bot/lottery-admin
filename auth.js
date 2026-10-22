'use strict';
// v0.1.27 - empty permission state and role-specific permission display.
(()=>{
const BASE='https://yijia-lottery-api.a0900067841.workers.dev';
const key=document.getElementById('cloudAdminKey');
if(!key){console.error('Missing cloudAdminKey');return}
const legacy=key.closest('label');if(legacy)legacy.replaceWith(key);
key.type='hidden';key.hidden=true;key.setAttribute('aria-hidden','true');
try{localStorage.removeItem('lottery_admin_session_v0111');sessionStorage.removeItem('lottery_cloud_admin_key_session_v0110')}catch(_){}
const css=document.createElement('style');css.textContent=`
#lotteryAuthGate[hidden],#lotteryAuthBar[hidden],.lottery-role-hidden,#lotteryManagePerms label[hidden]{display:none!important}
#lotteryAuthGate{position:fixed;inset:0;z-index:9999;background:#f4f7fb;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto}
#lotteryAuthGate form{width:min(100%,390px);background:white;border-radius:18px;padding:25px;box-shadow:0 10px 40px #0002;color:#17223b}
#lotteryAuthGate label{display:block;margin:15px 0 6px}#lotteryAuthGate input,#lotteryAuthGate select{width:100%;padding:12px;font-size:16px;box-sizing:border-box}
.lottery-passrow{display:flex;align-items:center;gap:8px}.lottery-passrow input{flex:1;min-width:0}.lottery-eye{flex:none;width:52px;min-height:42px}
#lotteryAuthGate .remember{display:flex;gap:8px;align-items:center;font-weight:400}#lotteryAuthGate .remember input{width:auto;margin:0}
#lotteryAuthGate .submit{width:100%;background:#155eef;color:#fff;border:0;margin-top:12px;padding:12px;border-radius:8px}
#lotteryAuthGate p{font-size:14px;line-height:1.6}#lotteryAuthBar{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin:10px 15px}
#lotteryAccountCard input,#lotteryAccountCard select{width:100%;max-width:450px}#lotteryAccountCard .lottery-passrow{max-width:450px}
nav{flex-wrap:nowrap!important;overflow-x:auto!important;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch;touch-action:pan-x}nav::-webkit-scrollbar{display:none}nav button{flex:0 0 auto;white-space:nowrap}
#lotteryCreatePanel,#lotteryManagePanel{min-width:0}#lotteryAccountCard{margin-top:0}#lotteryAccountCard fieldset{border:1px solid #dce5f1;border-radius:10px;margin:15px 0;padding:12px}#lotteryAccountCard fieldset label{font-weight:400;margin:9px 0}

html.lottery-prizes-readonly #prizeList .prize-row button{display:none!important}
`;document.head.append(css);
const gate=document.createElement('div');gate.id='lotteryAuthGate';gate.innerHTML=`
<form id="lotteryLoginForm"><h2>電子抽獎機｜帳號登入</h2><p>每次開啟網站都需要登入。</p>
<div id="lotteryLoginFields"><label for="lotteryUsername">帳號</label><select id="lotteryUsername" autocomplete="username" required><option value="">載入帳號中…</option></select>
<label for="lotteryPassword">密碼</label><div class="lottery-passrow"><input id="lotteryPassword" type="password" autocomplete="off" required><button type="button" class="lottery-eye" aria-label="顯示密碼">👁️</button></div>
<label class="remember"><input type="checkbox" id="lotteryRemember">記住密碼（使用手機／瀏覽器密碼管理）</label>
<button type="submit" class="submit" id="lotteryLoginButton">登入</button></div><p id="lotteryLoginMessage" role="status"></p></form>
<form id="lotteryChangeForm" hidden><h2>首次登入｜設定正式密碼</h2><p>首次登入或密碼重設後，必須設定 8～12 位正式密碼，完成前無法使用其他功能。</p>
<label>目前的 4 位數臨時密碼</label><div class="lottery-passrow"><input id="lotteryOldPass" type="password" inputmode="numeric" required><button type="button" class="lottery-eye" aria-label="顯示密碼">👁️</button></div>
<label>新密碼（8～12 位）</label><div class="lottery-passrow"><input id="lotteryChangePass" type="password" minlength="8" maxlength="12" required><button type="button" class="lottery-eye" aria-label="顯示密碼">👁️</button></div>
<label>確認新密碼</label><div class="lottery-passrow"><input id="lotteryChangeConfirm" type="password" minlength="8" maxlength="12" required><button type="button" class="lottery-eye" aria-label="顯示密碼">👁️</button></div>
<button type="submit" class="submit" id="lotteryChangeButton">儲存新密碼</button><button type="button" id="lotteryChangeCancel">登出</button><p id="lotteryChangeMsg" role="status"></p></form>`;
document.body.append(gate);
const loginForm=gate.querySelector('#lotteryLoginForm'),changeForm=gate.querySelector('#lotteryChangeForm');
// HTML hidden must override the form display rule.
const style=document.createElement('style');style.textContent='#lotteryAuthGate form[hidden],#lotteryManagePasswordRow[hidden]{display:none!important}';document.head.append(style);
const bar=document.createElement('div');bar.id='lotteryAuthBar';bar.hidden=true;
const who=document.createElement('span'),logout=document.createElement('button');logout.textContent='登出';logout.type='button';bar.append(who,logout);
const nav=document.querySelector('nav');if(nav)nav.before(bar);else document.body.prepend(bar);
const username=gate.querySelector('#lotteryUsername'),pw=gate.querySelector('#lotteryPassword'),remember=gate.querySelector('#lotteryRemember'),msg=gate.querySelector('#lotteryLoginMessage'),loginBtn=gate.querySelector('#lotteryLoginButton');
let token='',role='',currentName='',mustChange=false,permissions=[];
window.lotteryCan=p=>!!token&&!mustChange&&can(p);
const ALL_PERMS=[['dashboard','管理總覽'],['prizes_view','查看獎項'],['prizes_edit','修改獎項'],['ticket_view','查看獎券模板'],['ticket_edit','修改獎券模板'],['device_sync','設備雲端同步'],['print_prep','列印前置狀態'],['sound_settings','蜂鳴器設定'],['device_config_view','完整設備設定檔'],['redeem','獎券核銷'],['redeem_history','查詢核銷紀錄（預留）'],['accounts_view','查看人員'],['accounts_manage','建立／停用／刪除人員'],['permissions_manage','修改人員權限']];
const USER_PERMS=['prizes_view', 'redeem', 'redeem_history'];
const can=p=>currentName==='Yuan'||((role==='Admin'||USER_PERMS.includes(p))&&permissions.includes(p));
const panels=Array.from(document.querySelectorAll('.panel')),tabs=Array.from(document.querySelectorAll('nav button'));
const emptyNotice=document.createElement('section');emptyNotice.id='lotteryNoPermissionNotice';emptyNotice.className='card';emptyNotice.hidden=true;emptyNotice.setAttribute('role','status');emptyNotice.innerHTML='<h2>目前沒有可使用的功能</h2><p>目前帳號尚未開放任何功能，請聯絡管理員設定權限。</p>';document.querySelector('main')?.append(emptyNotice);
function bindEyes(root){for(const row of root.querySelectorAll('.lottery-passrow')){const input=row.querySelector('input'),btn=row.querySelector('button');btn.addEventListener('click',()=>{input.type=input.type==='password'?'text':'password';btn.setAttribute('aria-label',input.type==='password'?'顯示密碼':'隱藏密碼');btn.textContent=input.type==='password'?'👁️':'🙈'})}}
bindEyes(gate);
// Stop prize editing from delegated clicks even if an old button remains in the DOM.
document.addEventListener('click',e=>{
 if(token&&!mustChange&&can('prizes_edit'))return;
 const button=e.target.closest?.('#prizeList .prize-row button');
 if(button){e.preventDefault();e.stopImmediatePropagation()}
},true);

function showRole(){
 const mapping={dashboard:'dashboard',prizes:'prizes_view',ticket:'ticket_view',redeem:'redeem',redeemHistory:'redeem_history',createAccount:'accounts_manage',manageAccount:'accounts_view'};
 const ticketAccess=['ticket_view','ticket_edit','device_sync','sound_settings','print_prep','device_config_view'].some(can);
 for(const tab of tabs)tab.classList.toggle('lottery-role-hidden',!token||mustChange||!(tab.dataset.tab==='ticket'?ticketAccess:can(mapping[tab.dataset.tab])));
 for(const panel of panels)panel.classList.toggle('lottery-role-hidden',!token||mustChange||!(panel.id==='ticket'?ticketAccess:can(mapping[panel.id])));
 createPanel.classList.toggle('lottery-role-hidden',!token||mustChange||!can('accounts_manage'));
 managePanel.classList.toggle('lottery-role-hidden',!token||mustChange||!can('accounts_view'));
 if(token&&!mustChange)showSelectedAccount();
 for(const [id,perm] of [['lotterySoundCard','sound_settings'],['lotteryDeviceConfigCard','device_config_view']]){const block=document.getElementById(id);if(block)block.classList.toggle('lottery-role-hidden',!token||mustChange||!can(perm))}
 for(const [id,perm] of [['lotteryPrintPrepCard','print_prep'],['lotteryTicketTemplateCard','ticket_view']]){const block=document.getElementById(id);if(block)block.classList.toggle('lottery-role-hidden',!token||mustChange||!can(perm))}
 const cloud=document.getElementById('cloudSyncCard');if(cloud)cloud.classList.toggle('lottery-role-hidden',!token||mustChange||!can('device_sync'));
 for(const id of ['prizeForm','clearEdit']){const el=document.getElementById(id);if(el)el.classList.toggle('lottery-role-hidden',!can('prizes_edit'))}
 for(const id of ['ticketForm']){const el=document.getElementById(id);if(el)el.classList.toggle('lottery-role-hidden',!can('ticket_edit'))}
 // Prize list is rendered by app.js, so hide its action buttons for read-only accounts.
 document.documentElement.classList.toggle('lottery-prizes-readonly',!token||mustChange||!can('prizes_edit'));
 const prizeDescription=document.getElementById('prizePageDescription');
 if(prizeDescription)prizeDescription.textContent=can('prizes_edit')?'可新增、修改、刪除測試獎項。權重與數量供抽獎邏輯規劃；此版本不會真正扣除庫存。':'可查看目前測試獎項及數量；此帳號沒有新增、修改或刪除獎項的權限。';

 const visible=tabs.filter(x=>!x.classList.contains('lottery-role-hidden'));
 if(visible.length&&!visible.some(x=>x.classList.contains('active')))visible[0].click();
 // If all navigation destinations are denied, show an explanation rather than a blank page.
 const noAccess=!!token&&!mustChange&&visible.length===0;
 emptyNotice.hidden=!noAccess;
 if(noAccess){for(const panel of panels)panel.classList.remove('active')}

}

function setAuth(data){token=data?.token||'';role=data?.role||'';currentName=data?.username||'';mustChange=!!data?.mustChange;permissions=Array.isArray(data?.permissions)?data.permissions:[];
 key.value=token&&!mustChange&&can('device_sync')?token:'';key.hidden=true;
 gate.hidden=!!token&&!mustChange;bar.hidden=!token||mustChange;who.textContent=currentName;
 loginForm.hidden=mustChange;changeForm.hidden=!mustChange;showRole();
}
async function api(path,method='GET',body,override){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
 try{const res=await fetch(BASE+path,{method,headers:{...((override||token)?{'Authorization':'Bearer '+(override||token)}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:ctl.signal});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||'HTTP '+res.status);return data}finally{clearTimeout(timer)}
}
async function loadAccounts(){try{const data=await api('/auth/accounts');const list=Array.isArray(data.accounts)?data.accounts:[];username.replaceChildren();for(const name of list){const opt=document.createElement('option');opt.value=name;opt.textContent=name;username.append(opt)}if(!list.length)throw Error('尚無帳號')}catch(e){username.replaceChildren();const opt=document.createElement('option');opt.value='Yuan';opt.textContent='Yuan';username.append(opt);msg.textContent='帳號清單暫時無法取得；仍可使用 Yuan 登入。'}}
remember.addEventListener('change',()=>{pw.autocomplete=remember.checked?'current-password':'off';msg.textContent=remember.checked?'可使用手機密碼管理填入；仍須按「登入」。':''});
loginForm.addEventListener('submit',async e=>{e.preventDefault();loginBtn.disabled=true;msg.textContent='驗證中…';try{
 const data=await api('/auth/login','POST',{username:username.value,password:pw.value});
 let resolvedRole=data.role;if(!resolvedRole){const verified=await api('/auth/me','GET',undefined,data.token);if(verified.ok&&verified.username==='Yuan'&&data.username==='Yuan')resolvedRole='Admin'}
 if(!['Admin','User'].includes(resolvedRole))throw Error('伺服器未提供有效帳號權限');
 pw.value='';setAuth({...data,role:resolvedRole});msg.textContent='';if(can('accounts_view')&&!mustChange)await refreshUsers();
 }catch(err){msg.textContent='登入失敗：'+err.message}finally{loginBtn.disabled=false}});
async function signOut(){const old=token;setAuth(null);pw.value='';changeForm.reset();if(old)try{await api('/auth/logout','POST',undefined,old)}catch(_){}await loadAccounts()}
logout.addEventListener('click',signOut);gate.querySelector('#lotteryChangeCancel').addEventListener('click',signOut);
changeForm.addEventListener('submit',async e=>{e.preventDefault();const old=gate.querySelector('#lotteryOldPass').value,p1=gate.querySelector('#lotteryChangePass').value,p2=gate.querySelector('#lotteryChangeConfirm').value,notice=gate.querySelector('#lotteryChangeMsg');
 if(p1!==p2){notice.textContent='兩次新密碼不一致';return}if(p1.length<8||p1.length>12){notice.textContent='新密碼必須為 8～12 位';return}
 const button=gate.querySelector('#lotteryChangeButton');button.disabled=true;try{await api('/auth/change-password','POST',{currentPassword:old,newPassword:p1});notice.textContent='密碼修改完成，請重新登入';await signOut();msg.textContent='密碼修改完成，請使用新密碼登入。'}catch(err){notice.textContent='修改失敗：'+err.message}finally{button.disabled=false}
});
key.addEventListener('input',()=>{key.value=token&&!mustChange&&can('device_sync')?token:''});
const main=document.querySelector('main');
const createPanel=document.createElement('section');createPanel.id='createAccount';createPanel.className='panel';
const managePanel=document.createElement('section');managePanel.id='manageAccount';managePanel.className='panel';
main.append(createPanel,managePanel);
const createTab=document.createElement('button');createTab.type='button';createTab.dataset.tab='createAccount';createTab.textContent='建立帳號';
const manageTab=document.createElement('button');manageTab.type='button';manageTab.dataset.tab='manageAccount';manageTab.textContent='帳號管理';
nav.append(createTab,manageTab);tabs.push(createTab,manageTab);panels.push(createPanel,managePanel);
createPanel.innerHTML=`<h1>建立帳號</h1><form id="lotteryCreateForm" class="card">
<label>登入帳號（3～24 位英數字、底線或連字號）<input id="lotteryCreateUser" maxlength="24" autocomplete="off" required></label>
<label>姓名（僅管理員可見）<input id="lotteryCreateName" maxlength="40" autocomplete="off"></label>
<label>帳號身分<select id="lotteryCreateRole"><option value="User">User 核銷人員</option><option value="Admin">Admin 管理員</option></select></label>
<label>4 位數臨時密碼</label><div class="lottery-passrow"><input id="lotteryCreatePass" type="password" minlength="4" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" autocomplete="new-password" required><button type="button" class="lottery-eye" aria-label="顯示密碼">👁️</button></div>
<button class="primary" type="submit">建立帳號</button><p id="lotteryCreateMsg" role="status"></p></form>`;
managePanel.innerHTML=`<h1>帳號管理</h1><div class="card"><label>選擇現有人員<select id="lotteryManageSelect"><option value="">請先選擇人員</option></select></label><p id="lotteryManageInfo" class="muted"></p></div>
<form id="lotteryManageForm" class="card"><h2>人員資料及狀態</h2><label>姓名（僅管理員可見）<input id="lotteryManageName" maxlength="40"></label>
<label>管理操作<select id="lotteryManageAction"><option value="name">修改姓名</option><option value="password">重設臨時密碼</option><option value="disable">停用帳號</option><option value="enable">啟用帳號</option><option value="delete">永久刪除人員</option></select></label>
<div id="lotteryManagePasswordRow" hidden><label>新的 4 位數臨時密碼</label><div class="lottery-passrow"><input id="lotteryManagePass" type="password" minlength="4" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" autocomplete="new-password"><button type="button" class="lottery-eye" aria-label="顯示密碼">👁️</button></div></div>
<button class="primary" type="submit">執行管理操作</button><p id="lotteryManageMsg" role="status"></p></form>
<form id="lotteryPermissionForm" class="card"><h2>個別功能權限</h2><p class="muted">未勾選的功能完全隱藏。權限由這裡獨立設定，不在建立帳號時設定。</p>
<fieldset id="lotteryManagePerms"><legend>允許使用的功能</legend></fieldset><button type="submit" class="primary">儲存個別權限</button><p id="lotteryPermMsg" role="status"></p></form>`;
const createForm=createPanel.querySelector('#lotteryCreateForm'),manageForm=managePanel.querySelector('#lotteryManageForm'),permissionForm=managePanel.querySelector('#lotteryPermissionForm');
const createMsg=createPanel.querySelector('#lotteryCreateMsg'),manageMsg=managePanel.querySelector('#lotteryManageMsg'),permMsg=managePanel.querySelector('#lotteryPermMsg');
const manageSelect=managePanel.querySelector('#lotteryManageSelect'),manageAction=managePanel.querySelector('#lotteryManageAction'),managePassRow=managePanel.querySelector('#lotteryManagePasswordRow'),permBox=managePanel.querySelector('#lotteryManagePerms');
for(const [id,label] of ALL_PERMS){const row=document.createElement('label');row.style.display='block';row.style.fontWeight='400';const check=document.createElement('input');check.type='checkbox';check.value=id;check.style.width='auto';check.style.display='inline-block';check.style.marginRight='8px';row.append(check,document.createTextNode(label));permBox.append(row)}
bindEyes(createPanel);bindEyes(managePanel);
let cachedAccounts=[];
const selectedPerms=()=>Array.from(permBox.querySelectorAll('input:checked:not(:disabled)'),x=>x.value);
const fillPerms=p=>{for(const el of permBox.querySelectorAll('input'))el.checked=p.includes(el.value)};
const selectedAccount=()=>cachedAccounts.find(a=>a.username===manageSelect.value);
function showSelectedAccount(){
 const a=selectedAccount();managePanel.querySelector('#lotteryManageInfo').textContent=a?(a.role+' · '+(a.disabled?'已停用':a.mustChange?'待修改初始密碼':'已啟用')):'請選擇現有人員';
 managePanel.querySelector('#lotteryManageName').value=a?.fullName||'';fillPerms(a?.permissions||[]);
 for(const el of permBox.querySelectorAll('input')){const allowed=!a||a.role==='Admin'||USER_PERMS.includes(el.value);el.closest('label').hidden=!allowed;el.disabled=!allowed;if(!allowed)el.checked=false}
 const locked=!a||a.username==='Yuan';
 manageForm.querySelector('button[type=submit]').disabled=locked||!can('accounts_manage');
 permissionForm.querySelector('button[type=submit]').disabled=locked||!can('permissions_manage');
 manageForm.classList.toggle('lottery-role-hidden',!can('accounts_manage'));
 permissionForm.classList.toggle('lottery-role-hidden',!can('permissions_manage'));
}
manageSelect.addEventListener('change',showSelectedAccount);
function showManageAction(){managePassRow.hidden=manageAction.value!=='password'}
manageAction.addEventListener('change',showManageAction);showManageAction();
async function refreshUsers(){
 if(!can('accounts_view')||mustChange)return;
 try{const data=await api('/admin/accounts');cachedAccounts=Array.isArray(data.accounts)?data.accounts:[];
 const selected=manageSelect.value;manageSelect.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='請選擇現有人員';manageSelect.append(placeholder);
 for(const a of cachedAccounts){const opt=document.createElement('option');opt.value=a.username;opt.textContent=(a.fullName?a.fullName+' · ':'')+a.username;manageSelect.append(opt)}
 manageSelect.value=cachedAccounts.some(a=>a.username===selected)?selected:'';showSelectedAccount();manageMsg.textContent='';
 }catch(e){manageMsg.textContent='無法載入人員：'+e.message}
}
function activateAccountTab(panel,tab){for(const p of panels)p.classList.toggle('active',p===panel);for(const t of tabs)t.classList.toggle('active',t===tab);tab.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'})}
createTab.addEventListener('click',()=>{if(!createTab.classList.contains('lottery-role-hidden'))activateAccountTab(createPanel,createTab)});
manageTab.addEventListener('click',()=>{if(!manageTab.classList.contains('lottery-role-hidden')){activateAccountTab(managePanel,manageTab);refreshUsers()}});
for(const t of tabs.filter(t=>t!==createTab&&t!==manageTab))t.addEventListener('click',()=>{createPanel.classList.remove('active');managePanel.classList.remove('active');createTab.classList.remove('active');manageTab.classList.remove('active')});
createForm.addEventListener('submit',async e=>{
 e.preventDefault();if(!can('accounts_manage')||mustChange)return;
 const username=createPanel.querySelector('#lotteryCreateUser').value.trim(),fullName=createPanel.querySelector('#lotteryCreateName').value.trim(),role=createPanel.querySelector('#lotteryCreateRole').value,password=createPanel.querySelector('#lotteryCreatePass').value;
 if(!/^[0-9]{4}$/.test(password)){createMsg.textContent='臨時密碼必須為 4 位數字';return}
 const button=createForm.querySelector('button[type=submit]');button.disabled=true;
 try{await api('/admin/accounts','POST',{action:'create',username,fullName,role,password,permissions:role==='Admin'?['dashboard','prizes_view','prizes_edit','ticket_view','ticket_edit','redeem','redeem_history','accounts_view','accounts_manage','permissions_manage']:['redeem']});createMsg.textContent='帳號建立完成，可到帳號管理調整權限';createForm.reset();await loadAccounts();if(can('accounts_view'))await refreshUsers()}catch(err){createMsg.textContent='建立失敗：'+err.message}finally{button.disabled=false}
});
manageForm.addEventListener('submit',async e=>{
 e.preventDefault();const a=selectedAccount();if(!a||a.username==='Yuan'||!can('accounts_manage'))return;
 const action=manageAction.value,body={action,username:a.username};if(action==='name')body.fullName=managePanel.querySelector('#lotteryManageName').value.trim();
 if(action==='password'){body.password=managePanel.querySelector('#lotteryManagePass').value;if(!/^[0-9]{4}$/.test(body.password)){manageMsg.textContent='請輸入 4 位數臨時密碼';return}}
 if(action==='delete'&&!confirm('確定永久刪除 '+a.username+'？此操作無法復原。'))return;
 if(['disable','password'].includes(action)&&!confirm('確定變更 '+a.username+'？'))return;
 const button=manageForm.querySelector('button[type=submit]');button.disabled=true;
 try{await api('/admin/accounts','POST',body);manageMsg.textContent='操作完成';managePanel.querySelector('#lotteryManagePass').value='';await refreshUsers();await loadAccounts()}catch(err){manageMsg.textContent='操作失敗：'+err.message}finally{button.disabled=false}
});
permissionForm.addEventListener('submit',async e=>{
 e.preventDefault();const a=selectedAccount();if(!a||a.username==='Yuan'||!can('permissions_manage'))return;
 const button=permissionForm.querySelector('button[type=submit]');button.disabled=true;
 try{await api('/admin/accounts','POST',{action:'permissions',username:a.username,permissions:selectedPerms()});permMsg.textContent='個別權限已儲存';await refreshUsers()}catch(err){permMsg.textContent='儲存失敗：'+err.message}finally{button.disabled=false}
});
setAuth(null);loadAccounts();
})();
