'use strict';
// v0.1.2 is a local-only UI prototype. Never use browser storage as a real prize ledger.
const KEY='lottery_ui_v010'; // Reuse previous browser data; missing quantities default to 0
const defaults={prizes:[{name:'購物金 10 元',type:'購物金',weight:5,quantity:10,issued:0},{name:'指定商品一份',type:'商品',weight:3,quantity:10,issued:0}],ticket:{store:'示範門市',days:7,usage:'限店使用',rules:['僅限原店兌換','購物金不可買菸','本券限兌換一次','本券不得折換現金','退貨應繳回所有獎品','退換貨不得再次抽獎'].join('\n'),warning:'逾期無法使用\n須出示實體紙本\n照片、影印無效'}};
let state;
try{const v=JSON.parse(localStorage.getItem(KEY));state=v&&Array.isArray(v.prizes)&&v.ticket? v:structuredClone(defaults)}catch{state=structuredClone(defaults)}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function el(id){return document.getElementById(id)}
function txt(tag,value,className){const n=document.createElement(tag);n.textContent=value;if(className)n.className=className;return n}
function renderPrizes(){el('prizeCount').textContent=state.prizes.length;const root=el('prizeList');root.replaceChildren();state.prizes.forEach((p,i)=>{const card=txt('div','','card prize-row'),info=document.createElement('div');info.append(txt('strong',p.name),txt('p',`${p.type} · 權重 ${p.weight} · 總數 ${p.quantity??0} · 已抽出 ${p.issued??0} · 剩餘 ${Math.max(0,(p.quantity??0)-(p.issued??0))}`));const actions=document.createElement('div');const edit=txt('button','編輯'),del=txt('button','刪除');edit.onclick=()=>{el('editIndex').value=i;el('prizeName').value=p.name;el('prizeType').value=p.type;el('prizeWeight').value=p.weight;el('prizeQuantity').value=p.quantity??0;window.scrollTo({top:0,behavior:'smooth'})};del.onclick=()=>{if(confirm(`刪除「${p.name}」？`)){state.prizes.splice(i,1);save();renderPrizes()}};actions.append(edit,del);card.append(info,actions);root.append(card)})}
function clearForm(){el('prizeForm').reset();el('editIndex').value=''}
el('prizeForm').addEventListener('submit',e=>{e.preventDefault();const p={name:el('prizeName').value.trim(),type:el('prizeType').value,weight:Number(el('prizeWeight').value),quantity:Number(el('prizeQuantity').value)};if(!p.name||!Number.isInteger(p.weight)||p.weight<1||!Number.isSafeInteger(p.quantity)||p.quantity<0)return;const i=el('editIndex').value;if(i!==''){p.issued=state.prizes[Number(i)].issued??0;if(p.quantity<p.issued){alert('總數量不能小於已抽出數量');return}}else p.issued=0;if(i==='')state.prizes.push(p);else state.prizes[Number(i)]=p;save();clearForm();renderPrizes()});el('clearEdit').onclick=clearForm;
function loadTicket(){const t=state.ticket;el('storeName').value=t.store;el('validDays').value=t.days;el('usage').value=t.usage;el('rules').value=t.rules;el('warning').value=t.warning;renderTicket()}
function renderTicket(){
  const t=state.ticket,r=el('receipt');
  r.replaceChildren();
  const now=new Date();
  const pad=n=>String(n).padStart(2,'0');
  const fmt=d=>`${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`;
  const expiry=new Date(now.getFullYear(),now.getMonth(),now.getDate()+Math.max(1,Number(t.days)||1));
  const heading=(label)=>txt('strong',label,'receipt-heading');
  r.append(
    txt('h2',t.store||'示範門市'),
    txt('strong','電子抽獎活動獎券'),
    document.createElement('hr'),
    txt('p','獎項：購物金 10 元（示意）'),
    txt('p',`列印日期：${fmt(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`),
    txt('div','QR Code 示意圖｜非有效核銷碼','qr'),
    txt('p','活動序號：DEMO-NOT-VALID'),
    txt('p',`序號有效期限：${fmt(expiry)}`),
    document.createElement('hr'),
    heading('活動說明'),
    txt('div',t.usage||'','rules'),
    document.createElement('hr'),
    heading('使用規則'),
    txt('div',t.rules.split('\\n').filter(x=>x.trim()).map((x,i)=>`${i+1}. ${x}`).join('\\n'),'rules'),
    document.createElement('hr'),
    heading('注意事項'),
    txt('div',t.warning||'','rules'),
    document.createElement('hr'),
    txt('p','本畫面為測試預覽，非有效獎券。','preview-warning')
  );
}

el('ticketForm').addEventListener('submit',e=>{e.preventDefault();state.ticket={store:el('storeName').value.trim(),days:Number(el('validDays').value),usage:el('usage').value,rules:el('rules').value,warning:el('warning').value};save();renderTicket();alert('模板已儲存在這台裝置的瀏覽器中（非雲端）')});
el('checkCode').onclick=()=>{const code=el('redeemCode').value.trim();el('redeemResult').textContent=code?'展示版尚未連接伺服器，無法驗證或核銷此編號。':'請先輸入活動序號。'};
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===b.dataset.tab))});
renderPrizes();loadTicket();
