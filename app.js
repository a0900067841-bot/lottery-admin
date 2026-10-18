'use strict';
// v0.1.0 is a local-only UI prototype. Never use browser storage as a real prize ledger.
const KEY='lottery_ui_v010';
const defaults={prizes:[{name:'購物金 10 元',type:'購物金',weight:5},{name:'指定商品一份',type:'商品',weight:3}],ticket:{store:'示範門市',days:7,usage:'請持實體紙本正本獎券至原店兌換。',rules:['僅限原發行門市兌換','須出示實體紙本正本','照片、截圖及影本不受理','每張獎券限兌換一次','逾期不得兌換','獎券不得折換現金','退貨應繳回相關獎品','退換貨不得再次抽獎','其他事項依門市公告辦理'].join('\n'),warning:'本畫面為測試預覽，非有效獎券。'}};
let state;
try{const v=JSON.parse(localStorage.getItem(KEY));state=v&&Array.isArray(v.prizes)&&v.ticket? v:structuredClone(defaults)}catch{state=structuredClone(defaults)}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function el(id){return document.getElementById(id)}
function txt(tag,value,className){const n=document.createElement(tag);n.textContent=value;if(className)n.className=className;return n}
function renderPrizes(){el('prizeCount').textContent=state.prizes.length;const root=el('prizeList');root.replaceChildren();state.prizes.forEach((p,i)=>{const card=txt('div','','card prize-row'),info=document.createElement('div');info.append(txt('strong',p.name),txt('p',`${p.type} · 權重 ${p.weight}`));const actions=document.createElement('div');const edit=txt('button','編輯'),del=txt('button','刪除');edit.onclick=()=>{el('editIndex').value=i;el('prizeName').value=p.name;el('prizeType').value=p.type;el('prizeWeight').value=p.weight;window.scrollTo({top:0,behavior:'smooth'})};del.onclick=()=>{if(confirm(`刪除「${p.name}」？`)){state.prizes.splice(i,1);save();renderPrizes()}};actions.append(edit,del);card.append(info,actions);root.append(card)})}
function clearForm(){el('prizeForm').reset();el('editIndex').value=''}
el('prizeForm').addEventListener('submit',e=>{e.preventDefault();const p={name:el('prizeName').value.trim(),type:el('prizeType').value,weight:Number(el('prizeWeight').value)};if(!p.name||!Number.isInteger(p.weight)||p.weight<1)return;const i=el('editIndex').value;if(i==='')state.prizes.push(p);else state.prizes[Number(i)]=p;save();clearForm();renderPrizes()});el('clearEdit').onclick=clearForm;
function loadTicket(){const t=state.ticket;el('storeName').value=t.store;el('validDays').value=t.days;el('usage').value=t.usage;el('rules').value=t.rules;el('warning').value=t.warning;renderTicket()}
function renderTicket(){const t=state.ticket,r=el('receipt');r.replaceChildren();r.append(txt('h2',t.store||'示範門市'),txt('strong','中獎獎券｜版面示意'),document.createElement('hr'),txt('p','獎項：購物金／商品（示意）'),txt('p','兌換編號：DEMO-NOT-VALID'),txt('p',`有效期限：開立後 ${t.days} 天（示意）`),txt('div','QR CODE 佔位｜不可核銷','qr'),document.createElement('hr'),txt('div',t.usage,'rules'),document.createElement('hr'),txt('div',t.rules.split('\n').map((x,i)=>`${i+1}. ${x}`).join('\n'),'rules'),document.createElement('hr'),txt('div',t.warning,'rules'))}
el('ticketForm').addEventListener('submit',e=>{e.preventDefault();state.ticket={store:el('storeName').value.trim(),days:Number(el('validDays').value),usage:el('usage').value,rules:el('rules').value,warning:el('warning').value};save();renderTicket();alert('模板已儲存在這台裝置的瀏覽器中（非雲端）')});
el('checkCode').onclick=()=>{const code=el('redeemCode').value.trim();el('redeemResult').textContent=code?'展示版尚未連接伺服器，無法驗證或核銷此編號。':'請先輸入兌換編號。'};
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===b.dataset.tab))});
renderPrizes();loadTicket();
