'use strict';
// v0.1.18 - account names, Admin/User, temporary passwords, forced changes, password visibility.
(()=>{
const BASE='https://yijia-lottery-api.a0900067841.workers.dev';
const key=document.getElementById('cloudAdminKey');
if(!key){console.error('Missing cloudAdminKey');return}
const legacy=key.closest('label');if(legacy)legacy.replaceWith(key);
key.type='hidden';key.hidden=true;key.setAttribute('aria-hidden','true');
try{localStorage.removeItem('lottery_admin_session_v0111');sessionStorage.removeItem('lottery_cloud_admin_key_session_v0110')}catch(_){}
const css=document.createElement('style');css.textContent=`
#lotteryAuthGate[hidden],#lotteryAuthBar[hidden],.lottery-role-hidden{display:none!important}
#lotteryAuthGate{position:fixed;inset:0;z-index:9999;background:#f4f7fb;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto}
#lotteryAuthGate form{width:min(100%,390px);background:white;border-radius:18px;padding:25px;box-shadow:0 10px 40px #0002;color:#17223b}
#lotteryAuthGate label{display:block;margin:15px 0 6px}#lotteryAuthGate input,#lotteryAuthGate select{width:100%;padding:12px;font-size:16px;box-sizing:border-box}
.lottery-passrow{display:flex;align-items:center;gap:8px}.lottery-passrow input{flex:1;min-width:0}.lottery-eye{flex:none;width:52px;min-height:42px}
#lotteryAuthGate .remember{display:flex;gap:8px;align-items:center;font-weight:400}#lotteryAuthGate .remember input{width:auto;margin:0}
#lotteryAuthGate .submit{width:100%;background:#155eef;color:#fff;border:0;margin-top:12px;padding:12px;border-radius:8px}
#lotteryAuthGate p{font-size:14px;line-height:1.6}#lotteryAuthBar{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin:10px 15px}
#lotteryAccountCard input,#lotteryAccountCard select{width:100%;max-width:450px}#lotteryAccountCard .lottery-passrow{max-width:450px}
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
const style=document.createElement('style');style.textContent='#lotteryAuthGate form[hidden]{display:none!important}';document.head.append(style);
const bar=document.createElement('div');bar.id='lotteryAuthBar';bar.hidden=true;
const who=document.createElement('span'),logout=document.createElement('button');logout.textContent='登出';logout.type='button';bar.append(who,logout);
const nav=document.querySelector('nav');if(nav)nav.before(bar);else document.body.prepend(bar);
const username=gate.querySelector('#lotteryUsername'),pw=gate.querySelector('#lotteryPassword'),remember=gate.querySelector('#lotteryRemember'),msg=gate.querySelector('#lotteryLoginMessage'),loginBtn=gate.querySelector('#lotteryLoginButton');
let token='',role='',currentName='',mustChange=false;
const panels=Array.from(document.querySelectorAll('.panel')),tabs=Array.from(document.querySelectorAll('nav button'));
function bindEyes(root){for(const row of root.querySelectorAll('.lottery-passrow')){const input=row.querySelector('input'),btn=row.querySelector('button');btn.addEventListener('click',()=>{input.type=input.type==='password'?'text':'password';btn.setAttribute('aria-label',input.type==='password'?'顯示密碼':'隱藏密碼');btn.textContent=input.type==='password'?'👁️':'🙈'})}}
bindEyes(gate);
function showRole(r){
 for(const tab of tabs)tab.classList.toggle('lottery-role-hidden',r!=='Admin'&&tab.dataset.tab!=='redeem');
 for(const panel of panels)panel.classList.toggle('lottery-role-hidden',r!=='Admin'&&panel.id!=='redeem');
 if(r!=='Admin')tabs.find(x=>x.dataset.tab==='redeem')?.click();
 else if(!document.querySelector('nav button.active:not(.lottery-role-hidden)'))tabs.find(x=>x.dataset.tab==='dashboard')?.click();
}
function setAuth(data){token=data?.token||'';role=data?.role||'';currentName=data?.username||'';mustChange=!!data?.mustChange;
 key.value=role==='Admin'&&!mustChange?token:'';key.hidden=true;
 gate.hidden=!!token&&!mustChange;bar.hidden=!token||mustChange;who.textContent=currentName;
 loginForm.hidden=mustChange;changeForm.hidden=!mustChange;showRole(mustChange?'':role);
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
 pw.value='';setAuth({...data,role:resolvedRole});msg.textContent='';if(role==='Admin'&&!mustChange)await refreshUsers();
 }catch(err){msg.textContent='登入失敗：'+err.message}finally{loginBtn.disabled=false}});
async function signOut(){const old=token;setAuth(null);pw.value='';changeForm.reset();if(old)try{await api('/auth/logout','POST',undefined,old)}catch(_){}await loadAccounts()}
logout.addEventListener('click',signOut);gate.querySelector('#lotteryChangeCancel').addEventListener('click',signOut);
changeForm.addEventListener('submit',async e=>{e.preventDefault();const old=gate.querySelector('#lotteryOldPass').value,p1=gate.querySelector('#lotteryChangePass').value,p2=gate.querySelector('#lotteryChangeConfirm').value,notice=gate.querySelector('#lotteryChangeMsg');
 if(p1!==p2){notice.textContent='兩次新密碼不一致';return}if(p1.length<8||p1.length>12){notice.textContent='新密碼必須為 8～12 位';return}
 const button=gate.querySelector('#lotteryChangeButton');button.disabled=true;try{await api('/auth/change-password','POST',{currentPassword:old,newPassword:p1});notice.textContent='密碼修改完成，請重新登入';await signOut();msg.textContent='密碼修改完成，請使用新密碼登入。'}catch(err){notice.textContent='修改失敗：'+err.message}finally{button.disabled=false}
});
key.addEventListener('input',()=>{key.value=role==='Admin'&&!mustChange?token:''});
const dash=document.querySelector('#dashboard'),card=document.createElement('div');card.className='card';card.id='lotteryAccountCard';
card.innerHTML=`<h2>帳號管理（Admin）</h2><p class="muted">新增 Admin／User，使用 4 位數臨時密碼；首次登入必須改成 8～12 位正式密碼。姓名僅供管理員辨識。</p>
<div id="lotteryAccountList">登入後載入</div><form id="lotteryAccountForm">
<label>登入帳號（3～24 位英數字、底線或連字號）<input id="lotteryNewUser" maxlength="24" autocomplete="off" required></label>
<label>姓名（僅管理員可見）<input id="lotteryFullName" maxlength="40" autocomplete="off"></label>
<label>帳號權限<select id="lotteryNewRole"><option value="User">User 核銷人員</option><option value="Admin">Admin 管理員</option></select></label>
<label>4 位數臨時密碼</label><div class="lottery-passrow"><input id="lotteryNewPass" type="password" minlength="4" maxlength="4" inputmode="numeric" autocomplete="new-password"><button type="button" class="lottery-eye" aria-label="顯示密碼">👁️</button></div>
<label>操作<select id="lotteryAccountAction"><option value="create">建立帳號</option><option value="password">重設臨時密碼</option><option value="name">修改姓名</option><option value="disable">停用帳號</option><option value="enable">啟用帳號</option></select></label>
<button type="submit" class="primary" id="lotteryAccountSave">執行</button><p id="lotteryAccountMsg" role="status"></p></form>`;
if(dash)dash.append(card);bindEyes(card);
const accountList=card.querySelector('#lotteryAccountList'),accountMsg=card.querySelector('#lotteryAccountMsg');
async function refreshUsers(){if(role!=='Admin'||mustChange)return;try{const data=await api('/admin/accounts');accountList.replaceChildren();for(const a of data.accounts){const p=document.createElement('p');p.textContent=(a.fullName?a.fullName+' · ':'')+a.username+' · '+(a.role==='Admin'?'管理員':'User')+' · '+(a.disabled?'已停用':a.mustChange?'待修改初始密碼':'已啟用');accountList.append(p)}accountMsg.textContent=''}catch(e){accountMsg.textContent='帳號管理 API 尚未啟用：'+e.message}}
card.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();if(role!=='Admin'||mustChange)return;
 const action=card.querySelector('#lotteryAccountAction').value,name=card.querySelector('#lotteryNewUser').value.trim(),password=card.querySelector('#lotteryNewPass').value,fullName=card.querySelector('#lotteryFullName').value.trim(),newRole=card.querySelector('#lotteryNewRole').value;
 const body={action,username:name};if(['create','password'].includes(action))body.password=password;if(['create','name'].includes(action))body.fullName=fullName;if(action==='create')body.role=newRole;
 if(['disable','password'].includes(action)&&!confirm('確定要變更 '+name+' 的帳號狀態／密碼？'))return;
 const button=card.querySelector('#lotteryAccountSave');button.disabled=true;
 try{await api('/admin/accounts','POST',body);accountMsg.textContent='操作完成';card.querySelector('#lotteryNewPass').value='';await refreshUsers();await loadAccounts()}catch(err){accountMsg.textContent='操作失敗：'+err.message}finally{button.disabled=false}
});
setAuth(null);loadAccounts();
})();
