'use strict';
// v0.1.12: shared login UI. Only the existing Yuan account is active until backend roles are deployed.
// This site never stores passwords. Browser password managers are optional.
(()=>{
const BASE='https://yijia-lottery-api.a0900067841.workers.dev';
const OLD_TOKEN_KEY='lottery_admin_session_v0111';
const LEGACY_KEY='lottery_cloud_admin_key_session_v0110';
const cloudKey=document.getElementById('cloudAdminKey');
const cloudCard=document.getElementById('cloudSyncCard');
if(!cloudKey||!cloudCard){console.error('Login UI: missing cloud elements');return}
try{localStorage.removeItem(OLD_TOKEN_KEY);sessionStorage.removeItem(LEGACY_KEY)}catch(_){}
const style=document.createElement('style');
style.textContent=`#lotteryAuthBar[hidden],#lotteryAuthGate[hidden]{display:none!important}#lotteryAuthGate{position:fixed;inset:0;z-index:9999;background:#f4f7fb;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto}#lotteryAuthGate .authbox{width:min(100%,390px);background:white;border-radius:18px;padding:25px;box-shadow:0 10px 40px #0002;color:#17223b}#lotteryAuthGate label{display:block;margin:15px 0 6px}#lotteryAuthGate select,#lotteryAuthGate input[type=password],#lotteryAuthGate input[type=text]{width:100%;box-sizing:border-box;padding:12px;font-size:16px}#lotteryAuthGate .password-row{display:flex;gap:8px;align-items:center}#lotteryAuthGate .password-row input{flex:1;min-width:0}#lotteryAuthGate .eye{width:48px;flex:none;background:#fff;color:#17223b;border:1px solid #cbd5e1;margin:7px 0 0;padding:12px 0}#lotteryAuthGate .remember{display:flex;align-items:center;gap:8px;font-weight:400;margin:15px 0}#lotteryAuthGate .remember input{width:auto;margin:0}#lotteryAuthGate .submit{margin-top:12px;width:100%;padding:12px;background:#155eef;color:white;border:0;border-radius:10px;font-size:16px}#lotteryAuthGate p{font-size:14px;line-height:1.6}#lotteryAuthBar{display:flex;gap:10px;align-items:center;justify-content:flex-end;margin:8px 12px}#lotteryAuthBar button{padding:6px 12px}`;
document.head.append(style);
const gate=document.createElement('div');gate.id='lotteryAuthGate';
gate.innerHTML='<form class="authbox" id="lotteryLoginForm"><h2>電子抽獎機｜帳號登入</h2><p>每次重新開啟網站都需要登入。</p><label for="lotteryUsername">帳號</label><select id="lotteryUsername" autocomplete="username" required><option value="Yuan">Yuan</option></select><label for="lotteryPassword">密碼</label><div class="password-row"><input id="lotteryPassword" type="password" autocomplete="off" required><button type="button" class="eye" id="lotteryTogglePassword" aria-label="顯示密碼" aria-pressed="false">👁️</button></div><label class="remember"><input id="lotteryRemember" type="checkbox">記住密碼（使用瀏覽器密碼管理）</label><button class="submit" id="lotteryLoginButton" type="submit">登入</button><p id="lotteryLoginMessage" role="status"></p></form>';
document.body.append(gate);
const bar=document.createElement('div');bar.id='lotteryAuthBar';bar.hidden=true;
const who=document.createElement('span');who.textContent='Yuan';
const logout=document.createElement('button');logout.type='button';logout.textContent='登出';bar.append(who,logout);
const nav=document.querySelector('nav');if(nav)nav.before(bar);else document.body.prepend(bar);
const msg=gate.querySelector('#lotteryLoginMessage');
const btn=gate.querySelector('#lotteryLoginButton');
const pw=gate.querySelector('#lotteryPassword');
const remember=gate.querySelector('#lotteryRemember');
const toggle=gate.querySelector('#lotteryTogglePassword');
let token='';
let submitting=false;
function setAuth(value){
 token=value||'';
 cloudKey.value=token;
 cloudKey.type='password';
 cloudKey.closest('label').hidden=true;
 gate.hidden=!!token;bar.hidden=!token;
}
function clearAuth(){const previous=token;setAuth('');pw.value='';return previous}
async function api(path,method='GET',body,authToken=token){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
 try{
  const res=await fetch(BASE+path,{method,headers:{...(authToken?{'Authorization':'Bearer '+authToken}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:ctl.signal});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error||`HTTP ${res.status}`);
  return data;
 }finally{clearTimeout(timer)}
}
toggle.addEventListener('click',()=>{
 const show=pw.type==='password';pw.type=show?'text':'password';
 toggle.setAttribute('aria-label',show?'隱藏密碼':'顯示密碼');
 toggle.setAttribute('aria-pressed',String(show));
});
remember.addEventListener('change',()=>{
 pw.autocomplete=remember.checked?'current-password':'off';
 msg.textContent=remember.checked?'可使用 iPhone「密碼」或瀏覽器自動填入；網站不儲存明文密碼。':'';
});
gate.querySelector('#lotteryLoginForm').addEventListener('submit',async e=>{
 e.preventDefault();if(submitting)return;submitting=true;btn.disabled=true;msg.textContent='正在驗證登入…';
 try{
  const result=await api('/auth/login','POST',{username:gate.querySelector('#lotteryUsername').value,password:pw.value},'');
  pw.value='';setAuth(result.token);msg.textContent='';
 }catch(err){msg.textContent='登入失敗：'+err.message}
 finally{submitting=false;btn.disabled=false}
});
logout.addEventListener('click',async()=>{
 const previous=clearAuth();
 if(previous)try{await api('/auth/logout','POST',undefined,previous)}catch(_){}
});
cloudKey.addEventListener('input',()=>{cloudKey.value=token});
setAuth('');
// Never persist login token: each full page load requires authentication.
// Existing backend still has 7-day token TTL; use logout to revoke it immediately.
})();
