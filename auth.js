'use strict';
// v0.1.13 - shared login, Admin/User role separation; no stored plaintext password.
(()=>{
const BASE='https://yijia-lottery-api.a0900067841.workers.dev';
const key=document.getElementById('cloudAdminKey');
if(!key){console.error('Missing cloudAdminKey');return}
try{localStorage.removeItem('lottery_admin_session_v0111');sessionStorage.removeItem('lottery_cloud_admin_key_session_v0110')}catch(_){}
const css=document.createElement('style');css.textContent=`
#lotteryAuthGate[hidden],#lotteryAuthBar[hidden],.lottery-role-hidden{display:none!important}
#lotteryAuthGate{position:fixed;inset:0;z-index:9999;background:#f4f7fb;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto}
#lotteryAuthGate form{width:min(100%,390px);background:white;border-radius:18px;padding:25px;box-shadow:0 10px 40px #0002;color:#17223b}
#lotteryAuthGate label{display:block;margin:15px 0 6px}#lotteryAuthGate input,#lotteryAuthGate select{width:100%;padding:12px;font-size:16px;box-sizing:border-box}
#lotteryAuthGate .passrow{display:flex;align-items:center;gap:8px}#lotteryAuthGate .passrow input{flex:1;min-width:0}
#lotteryAuthGate .eye{width:50px;padding:12px 0;flex:none;margin-top:7px}#lotteryAuthGate .remember{display:flex;gap:8px;align-items:center;font-weight:400}#lotteryAuthGate .remember input{width:auto;margin:0}
#lotteryAuthGate .submit{width:100%;background:#155eef;color:#fff;border:0;margin-top:12px}#lotteryAuthGate p{font-size:14px;line-height:1.6}
#lotteryAuthBar{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin:10px 15px}
#lotteryAccountCard input,#lotteryAccountCard select{width:100%;max-width:450px}
`;document.head.append(css);
const gate=document.createElement('div');gate.id='lotteryAuthGate';gate.innerHTML=`<form id="lotteryLoginForm"><h2>電子抽獎機｜帳號登入</h2><p>每次開啟網站都需要登入。</p><label for="lotteryUsername">帳號</label><select id="lotteryUsername" autocomplete="username" required><option value="">載入帳號中…</option></select><label for="lotteryPassword">密碼</label><div class="passrow"><input id="lotteryPassword" type="password" autocomplete="off" required><button type="button" id="lotteryEye" class="eye" aria-label="顯示密碼">👁️</button></div><label class="remember"><input type="checkbox" id="lotteryRemember">記住密碼（使用手機／瀏覽器密碼管理）</label><button type="submit" class="submit" id="lotteryLoginButton">登入</button><p id="lotteryLoginMessage" role="status"></p></form>`;document.body.append(gate);
const bar=document.createElement('div');bar.id='lotteryAuthBar';bar.hidden=true;
const who=document.createElement('span');const logout=document.createElement('button');logout.textContent='登出';logout.type='button';bar.append(who,logout);
const nav=document.querySelector('nav');if(nav)nav.before(bar);else document.body.prepend(bar);
const username=gate.querySelector('#lotteryUsername'),pw=gate.querySelector('#lotteryPassword'),remember=gate.querySelector('#lotteryRemember'),eye=gate.querySelector('#lotteryEye'),msg=gate.querySelector('#lotteryLoginMessage'),loginBtn=gate.querySelector('#lotteryLoginButton');
let token='',role='',currentName='';
const panels=Array.from(document.querySelectorAll('.panel'));const tabs=Array.from(document.querySelectorAll('nav button'));
function showRole(r){
 for(const tab of tabs)tab.classList.toggle('lottery-role-hidden',r==='User'&&tab.dataset.tab!=='redeem');
 for(const panel of panels)panel.classList.toggle('lottery-role-hidden',r==='User'&&panel.id!=='redeem');
 if(r==='User')tabs.find(x=>x.dataset.tab==='redeem')?.click();
 else if(!document.querySelector('nav button.active:not(.lottery-role-hidden)'))tabs.find(x=>x.dataset.tab==='dashboard')?.click();
}
function setAuth(data){token=data?.token||'';role=data?.role||'';currentName=data?.username||'';key.value=role==='Admin'?token:'';key.closest('label').hidden=true;gate.hidden=!!token;bar.hidden=!token;who.textContent=currentName;showRole(role)}
async function api(path,method='GET',body,override){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
 try{const res=await fetch(BASE+path,{method,headers:{...(override||token?{'Authorization':'Bearer '+(override||token)}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:ctl.signal});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||'HTTP '+res.status);return data}finally{clearTimeout(timer)}
}
async function loadAccounts(){try{const data=await api('/auth/accounts');const list=Array.isArray(data.accounts)?data.accounts:[];username.replaceChildren();for(const name of list){const opt=document.createElement('option');opt.value=name;opt.textContent=name;username.append(opt)}if(!list.length)throw Error('尚無帳號')}catch(e){username.replaceChildren();const opt=document.createElement('option');opt.value='Yuan';opt.textContent='Yuan';username.append(opt);msg.textContent='帳號清單暫時無法取得；仍可使用 Yuan 登入。'}}
eye.addEventListener('click',()=>{pw.type=pw.type==='password'?'text':'password';eye.setAttribute('aria-label',pw.type==='password'?'顯示密碼':'隱藏密碼')});
remember.addEventListener('change',()=>{pw.autocomplete=remember.checked?'current-password':'off';msg.textContent=remember.checked?'可使用手機密碼管理填入；仍須按「登入」。':''});
gate.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();loginBtn.disabled=true;msg.textContent='驗證中…';try{const data=await api('/auth/login','POST',{username:username.value,password:pw.value});pw.value='';setAuth(data);if(role==='Admin')await refreshUsers()}catch(err){msg.textContent='登入失敗：'+err.message}finally{loginBtn.disabled=false}});
logout.addEventListener('click',async()=>{const old=token;setAuth(null);pw.value='';if(old)try{await api('/auth/logout','POST',undefined,old)}catch(_){}await loadAccounts()});
key.addEventListener('input',()=>{key.value=role==='Admin'?token:''});
// Account administration is injected into dashboard; no changes to app.js required.
const dash=document.querySelector('#dashboard');const card=document.createElement('div');card.className='card';card.id='lotteryAccountCard';
card.innerHTML=`<h2>帳號管理（Admin）</h2><p class="muted">建立 User 帳號、重設密碼、啟用或停用。帳號權限由雲端驗證。</p><div id="lotteryAccountList">登入後載入</div><form id="lotteryAccountForm"><label>帳號名稱（3–24 位英數字、底線或連字號）<input id="lotteryNewUser" maxlength="24" autocomplete="off" required></label><label>密碼（至少 12 個字元）<input id="lotteryNewPass" type="password" minlength="12" maxlength="128" autocomplete="new-password"></label><label>操作<select id="lotteryAccountAction"><option value="create">建立 User</option><option value="password">重設密碼</option><option value="disable">停用帳號</option><option value="enable">啟用帳號</option></select></label><button type="submit" class="primary" id="lotteryAccountSave">執行</button><p id="lotteryAccountMsg" role="status"></p></form>`;
if(dash)dash.append(card);
const accountList=card.querySelector('#lotteryAccountList'),accountMsg=card.querySelector('#lotteryAccountMsg');
async function refreshUsers(){if(role!=='Admin')return;try{const data=await api('/admin/accounts');accountList.replaceChildren();for(const a of data.accounts){const p=document.createElement('p');p.textContent=a.username+' · '+(a.role==='Admin'?'管理員':a.disabled?'已停用':'User 已啟用');accountList.append(p)}}catch(e){accountMsg.textContent='讀取帳號失敗：'+e.message}}
card.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();if(role!=='Admin')return;const action=card.querySelector('#lotteryAccountAction').value,name=card.querySelector('#lotteryNewUser').value.trim(),password=card.querySelector('#lotteryNewPass').value;const body={action,username:name};if(['create','password'].includes(action))body.password=password;if(['disable','password'].includes(action)&&!confirm('確定要變更 '+name+' 的帳號狀態／密碼？'))return;const button=card.querySelector('#lotteryAccountSave');button.disabled=true;try{await api('/admin/accounts','POST',body);accountMsg.textContent='操作完成';card.querySelector('#lotteryNewPass').value='';await refreshUsers();await loadAccounts()}catch(err){accountMsg.textContent='操作失敗：'+err.message}finally{button.disabled=false}});
setAuth(null);loadAccounts();
})();
