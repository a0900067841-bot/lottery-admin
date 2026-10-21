'use strict';
// Load AFTER app.js. Login session is a bearer token, not a stored password/API secret.
(()=>{
const BASE='https://yijia-lottery-api.a0900067841.workers.dev';
const STORAGE_KEY='lottery_admin_session_v0111';
const LEGACY_KEY='lottery_cloud_admin_key_session_v0110';
const cloudKey=document.getElementById('cloudAdminKey');
const cloudCard=document.getElementById('cloudSyncCard');
if(!cloudKey||!cloudCard){console.error('Login UI: expected original admin elements');return}
const style=document.createElement('style');
style.textContent=`#lotteryAuthBar[hidden]{display:none!important}#lotteryAuthGate{position:fixed;inset:0;z-index:9999;background:#f4f7fb;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto}#lotteryAuthGate .authbox{width:min(100%,390px);background:white;border-radius:18px;padding:25px;box-shadow:0 10px 40px #0002;color:#17223b}#lotteryAuthGate label{display:block;margin:15px 0 6px}#lotteryAuthGate input{width:100%;box-sizing:border-box;padding:12px;font-size:16px}#lotteryAuthGate button{margin-top:16px;width:100%;padding:12px;background:#155eef;color:white;border:0;border-radius:10px;font-size:16px}#lotteryAuthGate p{font-size:14px;line-height:1.6}#lotteryAuthBar{display:flex;gap:10px;align-items:center;justify-content:flex-end;margin:8px 12px}#lotteryAuthBar button{padding:6px 12px}`;
document.head.append(style);
const gate=document.createElement('div');gate.id='lotteryAuthGate';
gate.innerHTML='<form class="authbox" id="lotteryLoginForm"><h2>電子抽獎機｜管理員登入</h2><p>登入後七天內可在此裝置保持登入。</p><label for="lotteryUsername">帳號</label><input id="lotteryUsername" value="Yuan" autocomplete="username" required><label for="lotteryPassword">密碼</label><input id="lotteryPassword" type="password" autocomplete="current-password" required><button id="lotteryLoginButton" type="submit">登入</button><p id="lotteryLoginMessage" role="status"></p></form>';
document.body.append(gate);
const bar=document.createElement('div');bar.id='lotteryAuthBar';bar.hidden=true;
const who=document.createElement('span');who.textContent='管理員：Yuan';
const logout=document.createElement('button');logout.type='button';logout.textContent='登出';bar.append(who,logout);
const nav=document.querySelector('nav');if(nav)nav.before(bar);else document.body.prepend(bar);
const msg=gate.querySelector('#lotteryLoginMessage');
const btn=gate.querySelector('#lotteryLoginButton');
let token='';
try{token=localStorage.getItem(STORAGE_KEY)||'';sessionStorage.removeItem(LEGACY_KEY)}catch(_){ }
function setAuth(value){
 token=value||'';
 // Original app.js cloudRequest reads the existing key field. Feed it the temporary session token.
 cloudKey.value=token;
 cloudKey.type='password';
 cloudKey.closest('label').hidden=true;
 gate.hidden=!!token;gate.style.display=token?'none':'flex';bar.hidden=!token;
 if(token){try{localStorage.setItem(STORAGE_KEY,token)}catch(_){}}
 else{try{localStorage.removeItem(STORAGE_KEY);sessionStorage.removeItem(LEGACY_KEY)}catch(_){}}
}
async function api(path,method='GET',body,authToken=token){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
 try{
  const res=await fetch(BASE+path,{method,headers:{...(authToken?{'Authorization':'Bearer '+authToken}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:ctl.signal});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error||`HTTP ${res.status}`);
  return data;
 }finally{clearTimeout(timer)}
}
gate.querySelector('#lotteryLoginForm').addEventListener('submit',async e=>{
 e.preventDefault();btn.disabled=true;msg.textContent='正在驗證登入…';
 try{
  const result=await api('/auth/login','POST',{username:gate.querySelector('#lotteryUsername').value.trim(),password:gate.querySelector('#lotteryPassword').value},'');
  gate.querySelector('#lotteryPassword').value='';setAuth(result.token);msg.textContent='';
 }catch(err){msg.textContent='登入失敗：'+err.message}
 finally{btn.disabled=false}
});
logout.addEventListener('click',async()=>{
 const old=token;setAuth('');
 try{await api('/auth/logout','POST',undefined,old)}catch(_){/* Local logout still succeeds */}
});
// Do not allow the old manually entered API key to remain in the field.
cloudKey.addEventListener('input',()=>{if(token)cloudKey.value=token});
setAuth('');
if(token){const candidate=token;msg.textContent='正在確認登入狀態…';
 api('/auth/me','GET',undefined,candidate).then(()=>{setAuth(candidate);msg.textContent=''}).catch(()=>{setAuth('');msg.textContent='登入已過期，請重新登入。'});
}
})();
