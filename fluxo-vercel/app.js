import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SB_URL = 'https://wfymycazfuiotndjpqxv.supabase.co';
const SB_KEY = 'sb_publishable_4z7uDnJkM-jPEh83HzwmbQ_E-LatR_7';
const sb = createClient(SB_URL, SB_KEY);

const app = document.querySelector('#app');
let user = null;
let cur = new Date(); cur.setDate(1);
let activeSection = 'dashboard';
let editingTxId = null;
let editingFixedId = null;
let editingPlannedId = null;
let editingCardPurchaseId = null;
let refreshing = false;
let lastRefreshAt = 0;

let data = {
  tx: [], fixed: [], vaCredit: 0, vaUses: [], goals: [],
  reservePlans: [], reserveEntries: [], cards: [], cardPurchases: [], plannedBills: []
};

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const fmtMoney = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const toISODate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const firstOfMonth = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
const parseLocalDate = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
const addMonths = (date, n) => { const d = new Date(date.getFullYear(), date.getMonth()+n, 1); return d; };
const clamp = (n,min,max)=>Math.min(max,Math.max(min,n));

async function boot(){
  const {data:{session}} = await sb.auth.getSession();
  user = session?.user || null;
  if(user) await showApp(); else showAuth();

  sb.auth.onAuthStateChange(async (_e,s)=>{
    user=s?.user||null;
    if(user) await showApp(); else showAuth();
  });

  document.addEventListener('visibilitychange', async ()=>{
    if(document.visibilityState==='visible' && user) await smartRefresh();
  });
  window.addEventListener('focus', async ()=>{ if(user) await smartRefresh(); });
}

async function smartRefresh(){
  if(refreshing || Date.now()-lastRefreshAt < 1200) return;
  await refresh(false);
}

function showAuth(){
  app.innerHTML = `
  <div class="auth">
    <div class="auth-hero">
      <div class="brand">fluxo<i>.</i></div>
      <div class="auth-copy"><h1>Seu dinheiro, mais claro.</h1><p>Organize salário, contas, cartões, metas e vale-alimentação sem misturar o que tem finalidades diferentes.</p></div>
      <small>Controle financeiro pessoal</small>
    </div>
    <div class="auth-card-wrap"><div class="auth-card">
      <h2>Bem-vinda ao Fluxo</h2><div class="muted">Entre para acessar suas finanças.</div>
      <div class="tabs"><button id="tabLogin" class="active">Entrar</button><button id="tabSign">Criar conta</button></div>
      <div class="field"><label>E-mail</label><input id="email" type="email" autocomplete="email" placeholder="exemplo@email.com"></div>
      <div class="field"><label>Senha</label><input id="pass" type="password" autocomplete="current-password" placeholder="mínimo de 6 caracteres"></div>
      <button id="authBtn" class="primary wide">Entrar</button><button id="forgot" class="ghost wide">Esqueci minha senha</button><div id="msg" class="msg"></div>
    </div></div>
  </div>`;
  let mode='login';
  tabLogin.onclick=()=>{mode='login';tabLogin.classList.add('active');tabSign.classList.remove('active');authBtn.textContent='Entrar'};
  tabSign.onclick=()=>{mode='signup';tabSign.classList.add('active');tabLogin.classList.remove('active');authBtn.textContent='Criar conta'};
  authBtn.onclick=async()=>{
    setMsg(''); const e=email.value.trim(),p=pass.value;
    if(!e||p.length<6) return setMsg('Informe um e-mail válido e uma senha com pelo menos 6 caracteres.','err');
    authBtn.disabled=true;
    const r=mode==='login'?await sb.auth.signInWithPassword({email:e,password:p}):await sb.auth.signUp({email:e,password:p,options:{emailRedirectTo:location.origin}});
    authBtn.disabled=false;
    if(r.error) return setMsg(r.error.message,'err');
    if(mode==='signup'&&!r.data.session) setMsg('Conta criada. Confira seu e-mail para confirmar o cadastro.','ok');
  };
  forgot.onclick=async()=>{
    const e=email.value.trim(); if(!e)return setMsg('Digite seu e-mail primeiro.','err');
    const r=await sb.auth.resetPasswordForEmail(e,{redirectTo:location.origin});
    setMsg(r.error?r.error.message:'Enviamos um e-mail de recuperação.','ok');
  };
}

function setMsg(t,type){const el=document.querySelector('#msg');if(!el)return;el.className='msg'+(t?' show '+type:'');el.textContent=t||''}

async function showApp(){
  renderShell();
  await refresh(false);
}

function renderShell(){
  app.innerHTML = `
  <div class="app">
    <aside class="side" id="side">
      <div class="side-head"><div class="brand">fluxo<i>.</i></div><button class="mobile-close" id="closeMenu">×</button></div>
      <nav class="nav">
        ${navBtn('dashboard','⌂','Dashboard')}
        ${navBtn('lancamentos','↕','Lançamentos')}
        ${navBtn('contas','◷','Contas fixas')}
        ${navBtn('cartoes','▣','Cartões')}
        ${navBtn('avulsas','◎','Contas parceladas')}
        ${navBtn('vale','◉','Vale alimentação')}
        ${navBtn('metas','◇','Metas')}
      </nav>
      <div class="side-bottom"><div class="userbox"><div>${esc(user.email)}</div><button class="logout" id="logout">Sair</button></div></div>
    </aside>
    <div class="mobile-overlay" id="overlay"></div>
    <main class="main">
      <div class="mobile-top"><button class="menu-btn" id="menuBtn">☰</button><div class="brand mini">fluxo<i>.</i></div></div>
      ${dashboardSection()}
      ${transactionsSection()}
      ${fixedSection()}
      ${cardsSection()}
      ${plannedSection()}
      ${vaSection()}
      ${goalsSection()}
    </main>
  </div>
  ${modals()}`;

  bindShellEvents();
  setActiveSection(activeSection);
}

function navBtn(id,ico,label){return `<button data-s="${id}"><span class="ico">${ico}</span><span>${label}</span></button>`}

function dashboardSection(){return `
<section id="dashboard" class="section">
  <div class="top"><div class="title"><h1>Visão geral</h1><p>Seu mês financeiro em um só lugar.</p></div><div class="month"><button class="ghost" id="prev">‹</button><b id="ml"></b><button class="ghost" id="next">›</button></div></div>
  <div class="grid metrics-grid">
    <div class="card metric"><div class="label">Saldo do mês</div><div id="saldo" class="value purple"></div><div class="small">Entradas − saídas</div></div>
    <div class="card metric"><div class="label">Entradas</div><div id="tin" class="value positive"></div><div class="small">Recebimentos</div></div>
    <div class="card metric"><div class="label">Gastos</div><div id="tout" class="value negative"></div><div class="small">Despesas registradas</div></div>
    <div class="card metric va"><div class="label">Vale alimentação</div><div id="vas" class="value"></div><div id="vap" class="small"></div></div>
  </div>
  <div class="row calendar-row"><div class="card"><div class="card-head"><h3>Calendário financeiro</h3><span class="small">contas e parcelas previstas</span></div><div id="calendar"></div></div><div class="card"><h3>Próximos pagamentos</h3><div id="up"></div></div></div>
  <div class="row"><div class="card"><h3>Gastos por categoria</h3><div id="bars" class="bars"></div></div><div class="card"><h3>Reserva quinzenal</h3><div id="reserveSummary"></div></div></div>
  <div class="row equal"><div class="card"><h3>Últimos lançamentos</h3><div id="recent"></div></div><div class="card"><h3>Faturas futuras</h3><div id="futureInvoices"></div></div></div>
</section>`}

function transactionsSection(){return `
<section id="lancamentos" class="section"><div class="top"><div class="title"><h1>Lançamentos</h1><p>Entradas e despesas do dia a dia.</p></div><button class="primary" onclick="openTxModal()">+ Novo lançamento</button></div><div class="card table-card" id="txTable"></div></section>`}

function fixedSection(){return `
<section id="contas" class="section"><div class="top"><div class="title"><h1>Contas fixas</h1><p>Vencimentos e reservas quinzenais no mesmo lugar.</p></div><button class="primary" onclick="openFixedModal()">+ Nova conta</button></div><div class="notice"><b>Reserva quinzenal integrada:</b> ative na conta que você paga no fim/início do mês. O Fluxo mostra quanto já foi separado e quanto ainda falta.</div><div id="fixedTable" class="fixed-account-list"></div></section>`}

function cardsSection(){return `
<section id="cartoes" class="section"><div class="top"><div class="title"><h1>Cartões de crédito</h1><p>Veja parcelas atuais e o que já está comprometido nas próximas faturas.</p></div><div class="top-actions"><button class="ghost" onclick="openModal('mCard')">+ Cartão</button><button class="primary" onclick="openCardPurchaseModal()">+ Compra parcelada</button></div></div><div id="cardsOverview" class="grid card-grid"></div><div class="card table-card gap-top" id="cardPurchases"></div></section>`}

function plannedSection(){return `
<section id="avulsas" class="section"><div class="top"><div class="title"><h1>Contas parceladas</h1><p>Para compromissos que não são fatura nem conta fixa.</p></div><button class="primary" onclick="openPlannedModal()">+ Nova conta parcelada</button></div><div class="notice">Exemplo: casa de fim de ano de R$ 530 dividida mentalmente em 3 pagamentos.</div><div id="plannedList" class="grid card-grid"></div></section>`}

function vaSection(){return `
<section id="vale" class="section"><div class="top"><div class="title"><h1>Vale alimentação</h1><p>Controle separado do dinheiro destinado à alimentação.</p></div><div class="top-actions"><button class="ghost" id="creditBtn">Configurar crédito</button><button class="primary" onclick="openModal('mVA')">+ Registrar uso</button></div></div><div class="grid metrics-grid"><div class="card metric va"><div class="label">Saldo disponível</div><div id="vpage" class="value"></div><div class="small">para alimentação</div></div><div class="card metric"><div class="label">Crédito mensal</div><div id="vrec" class="value positive"></div></div><div class="card metric"><div class="label">Usado</div><div id="vused" class="value negative"></div></div><div class="card metric"><div class="label">Utilização</div><div id="vpct" class="value purple"></div></div></div><div class="row"><div class="card"><h3>Utilização do benefício</h3><div class="progress"><div id="vbar"></div></div><div id="vtext" class="small"></div></div><div class="card"><h3>Últimos usos</h3><div id="vlist"></div></div></div></section>`}

function goalsSection(){return `
<section id="metas" class="section"><div class="top"><div class="title"><h1>Metas financeiras</h1><p>Acompanhe seus objetivos.</p></div><button class="primary" onclick="openModal('mGoal')">+ Nova meta</button></div><div id="goals" class="grid card-grid"></div></section>`}

function modals(){return `
<div class="modal" id="mTx"><div class="modalbox"><h2 id="txModalTitle">Novo lançamento</h2><div class="form">
  <div class="field full"><label>Descrição</label><input id="td" placeholder="Ex.: Supermercado, salário, gasolina"></div>
  <div class="field"><label>Valor</label><input id="tv" type="number" step=".01" placeholder="Ex.: 125,90"></div>
  <div class="field"><label>Tipo</label><select id="tt"><option value="expense">Gasto</option><option value="income">Entrada</option></select></div>
  <div class="field"><label>Categoria</label><select id="tc"><option>Alimentação</option><option>Moradia</option><option>Transporte</option><option>Lazer</option><option>Saúde</option><option>Estudos</option><option>Compras</option><option>Beleza</option><option>Outros</option></select></div>
  <div class="field hidden" id="tcOtherWrap"><label>Outra categoria</label><input id="tcOther" placeholder="Ex.: Presente, pet, viagem"></div>
  <div class="field"><label>Data</label><input id="tdate" type="date"></div>
</div><div class="actions"><button class="ghost" onclick="closeModal('mTx')">Cancelar</button><button class="primary" onclick="saveTx()">Salvar</button></div></div></div>

<div class="modal" id="mFixed"><div class="modalbox"><h2 id="fixedModalTitle">Nova conta fixa</h2><div class="form">
  <div class="field full"><label>Nome</label><input id="fd" placeholder="Ex.: Internet, academia, diarista"></div>
  <div class="field"><label>Valor</label><input id="fv" type="number" step=".01" placeholder="Ex.: 100,00"></div>
  <div class="field"><label>Mês específico (opcional)</label><select id="fmonth"><option value="">Todos os meses</option>${MONTHS.map((m,i)=>`<option value="${i+1}">${m}</option>`).join('')}</select></div>
  <div class="field"><label>Regra de vencimento</label><select id="frule"><option value="calendar_day">Dia fixo do mês</option><option value="business_day_number">Nº do dia útil</option><option value="last_business_day">Último dia útil</option></select></div>
  <div class="field" id="fdayWrap"><label>Dia do mês</label><input id="fday" type="number" min="1" max="31" placeholder="Ex.: 10"></div>
  <div class="field hidden" id="fbdayWrap"><label>Qual dia útil?</label><input id="fbday" type="number" min="1" max="23" placeholder="Ex.: 1, 5 ou 15"></div>
  <div class="field full reserve-toggle-box"><label class="check-row"><input id="freserve" type="checkbox"><span><b>Fazer reserva quinzenal para esta conta</b><small>Ex.: separar metade no pagamento do dia 15 e completar no fim do mês.</small></span></label></div>
  <div class="field hidden" id="fsplitWrap"><label>% separado no 1º recebimento</label><input id="fsplit" type="number" min="0" max="100" value="50" placeholder="Ex.: 50"><small>O restante será reservado no 2º recebimento.</small></div>
</div><div class="actions"><button class="ghost" onclick="closeModal('mFixed')">Cancelar</button><button class="primary" onclick="saveFixed()">Salvar</button></div></div></div>

<div class="modal" id="mReserve"><div class="modalbox"><h2>Nova reserva quinzenal</h2><div class="form">
  <div class="field full"><label>Conta / objetivo</label><input id="rn" placeholder="Ex.: Diarista"></div>
  <div class="field"><label>Valor total do mês</label><input id="ra" type="number" step=".01" placeholder="Ex.: 100,00"></div>
  <div class="field"><label>% para o primeiro recebimento</label><input id="rp" type="number" min="0" max="100" value="50" placeholder="Ex.: 50"></div>
</div><div class="actions"><button class="ghost" onclick="closeModal('mReserve')">Cancelar</button><button class="primary" onclick="addReserve()">Criar reserva</button></div></div></div>

<div class="modal" id="mCard"><div class="modalbox"><h2>Novo cartão</h2><div class="form">
  <div class="field full"><label>Nome do cartão</label><input id="cn" placeholder="Ex.: Nubank, Inter, Itaú"></div>
  <div class="field"><label>Limite</label><input id="cl" type="number" step=".01" placeholder="Ex.: 3000,00"></div>
  <div class="field"><label>Dia do fechamento</label><input id="cc" type="number" min="1" max="31" placeholder="Ex.: 20"></div>
  <div class="field"><label>Dia do vencimento</label><input id="cd" type="number" min="1" max="31" placeholder="Ex.: 28"></div>
</div><div class="actions"><button class="ghost" onclick="closeModal('mCard')">Cancelar</button><button class="primary" onclick="addCard()">Salvar</button></div></div></div>

<div class="modal" id="mCardPurchase"><div class="modalbox"><h2 id="cardPurchaseTitle">Nova compra parcelada</h2><div class="form">
  <div class="field"><label>Cartão</label><select id="pcard"></select></div>
  <div class="field"><label>Compra</label><input id="pd" placeholder="Ex.: Celular, passagem, curso"></div>
  <div class="field"><label>Valor total</label><input id="pt" type="number" step=".01" placeholder="Ex.: 1200,00"></div>
  <div class="field"><label>Nº de parcelas</label><input id="pi" type="number" min="1" max="60" value="1" placeholder="Ex.: 3"></div>
  <div class="field"><label>Parcelas já pagas</label><input id="pp" type="number" min="0" value="0" placeholder="Ex.: 1"></div>
  <div class="field"><label>Data da compra</label><input id="pdate" type="date"></div>
  <div class="field"><label>Primeira fatura</label><input id="pfirst" type="month"></div>
  <div class="field"><label>Categoria</label><input id="pcat" placeholder="Ex.: Compras, viagem"></div>
</div><div class="actions"><button class="ghost" onclick="closeModal('mCardPurchase')">Cancelar</button><button class="primary" onclick="saveCardPurchase()">Salvar</button></div></div></div>

<div class="modal" id="mPlanned"><div class="modalbox"><h2 id="plannedModalTitle">Nova conta parcelada</h2><div class="form">
  <div class="field full"><label>Nome</label><input id="pln" placeholder="Ex.: Casa de fim de ano"></div>
  <div class="field"><label>Valor total</label><input id="pla" type="number" step=".01" placeholder="Ex.: 530,00"></div>
  <div class="field"><label>Nº de parcelas</label><input id="pli" type="number" min="1" max="60" value="3" placeholder="Ex.: 3"></div>
  <div class="field"><label>Parcelas já pagas</label><input id="plp" type="number" min="0" value="0" placeholder="Ex.: 0"></div>
  <div class="field"><label>Primeiro mês</label><input id="plm" type="month"></div>
  <div class="field"><label>Vencimento</label><select id="plrule"><option value="calendar_day">Dia fixo</option><option value="business_day_number">Nº do dia útil</option><option value="last_business_day">Último dia útil</option></select></div>
  <div class="field" id="pldayWrap"><label>Dia</label><input id="plday" type="number" min="1" max="31" placeholder="Ex.: 30"></div>
  <div class="field hidden" id="plbdayWrap"><label>Qual dia útil?</label><input id="plbday" type="number" min="1" max="23" placeholder="Ex.: 15"></div>
  <div class="field full"><label>Observação (opcional)</label><input id="plnotes" placeholder="Ex.: dividir com fulano"></div>
</div><div class="actions"><button class="ghost" onclick="closeModal('mPlanned')">Cancelar</button><button class="primary" onclick="savePlanned()">Salvar</button></div></div></div>

<div class="modal" id="mVA"><div class="modalbox"><h2>Registrar uso do vale</h2><div class="form"><div class="field full"><label>Estabelecimento</label><input id="vd" placeholder="Ex.: Mercado, restaurante"></div><div class="field"><label>Valor</label><input id="vv" type="number" step=".01" placeholder="Ex.: 45,90"></div><div class="field"><label>Data</label><input id="vdate" type="date"></div></div><div class="actions"><button class="ghost" onclick="closeModal('mVA')">Cancelar</button><button class="primary" onclick="addVA()">Registrar</button></div></div></div>

<div class="modal" id="mGoal"><div class="modalbox"><h2>Nova meta</h2><div class="form"><div class="field full"><label>Nome</label><input id="gn" placeholder="Ex.: Entrada da casa"></div><div class="field"><label>Valor alvo</label><input id="gt" type="number" step=".01" placeholder="Ex.: 30000,00"></div><div class="field"><label>Já guardado</label><input id="gs" type="number" step=".01" placeholder="Ex.: 5000,00"></div></div><div class="actions"><button class="ghost" onclick="closeModal('mGoal')">Cancelar</button><button class="primary" onclick="addGoal()">Salvar</button></div></div></div>`}

function bindShellEvents(){
  document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>setActiveSection(b.dataset.s));
  logout.onclick=()=>sb.auth.signOut();
  prev.onclick=()=>{cur.setMonth(cur.getMonth()-1);renderAll()};
  next.onclick=()=>{cur.setMonth(cur.getMonth()+1);renderAll()};
  creditBtn.onclick=setCredit;
  menuBtn.onclick=openMenu; closeMenu.onclick=closeMobileMenu; overlay.onclick=closeMobileMenu;
  tc.onchange=()=>tcOtherWrap.classList.toggle('hidden',tc.value!=='Outros');
  frule.onchange=toggleFixedRuleFields;
  freserve.onchange=toggleFixedReserveFields;
  plrule.onchange=togglePlannedRuleFields;
}

function setActiveSection(id){
  activeSection=id;
  document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.s===id));
  document.querySelectorAll('.section').forEach(x=>x.classList.toggle('active',x.id===id));
  closeMobileMenu();
}
function openMenu(){side.classList.add('open');overlay.classList.add('show')}
function closeMobileMenu(){side?.classList.remove('open');overlay?.classList.remove('show')}

async function loadAll(){
  const results = await Promise.all([
    sb.from('transactions').select('*').order('transaction_date',{ascending:false}),
    sb.from('fixed_bills').select('*').order('created_at',{ascending:false}),
    sb.from('va_settings').select('*').maybeSingle(),
    sb.from('va_uses').select('*').order('use_date',{ascending:false}),
    sb.from('goals').select('*').order('created_at',{ascending:false}),
    sb.from('salary_reserve_plans').select('*').order('created_at',{ascending:false}),
    sb.from('salary_reserve_entries').select('*').order('reference_month',{ascending:false}),
    sb.from('credit_cards').select('*').order('created_at',{ascending:false}),
    sb.from('credit_card_purchases').select('*').order('purchase_date',{ascending:false}),
    sb.from('planned_bills').select('*').order('created_at',{ascending:false})
  ]);
  const errors=results.filter(r=>r.error).map(r=>r.error.message);
  if(errors.length) console.error('Fluxo load errors',errors);
  data={
    tx:results[0].data||[], fixed:results[1].data||[], vaCredit:Number(results[2].data?.monthly_credit||0), vaUses:results[3].data||[], goals:results[4].data||[],
    reservePlans:results[5].data||[], reserveEntries:results[6].data||[], cards:results[7].data||[], cardPurchases:results[8].data||[], plannedBills:results[9].data||[]
  };
}

async function refresh(showSpinner=true){
  if(refreshing) return;
  refreshing=true;
  if(showSpinner) document.body.classList.add('is-refreshing');
  try{ await loadAll(); lastRefreshAt=Date.now(); renderAll(); }
  finally{ refreshing=false; document.body.classList.remove('is-refreshing'); }
}

function renderAll(){
  if(!user) return;
  ml.textContent=`${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`;
  const key=monthKey(cur);
  const monthTx=data.tx.filter(x=>x.transaction_date?.slice(0,7)===key);
  const inc=monthTx.filter(x=>x.type==='income').reduce((s,x)=>s+Number(x.amount),0);
  const out=monthTx.filter(x=>x.type==='expense').reduce((s,x)=>s+Number(x.amount),0);
  const vu=data.vaUses.filter(x=>x.use_date?.slice(0,7)===key);
  const used=vu.reduce((s,x)=>s+Number(x.amount),0), bal=Math.max(0,data.vaCredit-used), pct=data.vaCredit?Math.min(100,used/data.vaCredit*100):0;
  saldo.textContent=fmtMoney(inc-out); tin.textContent=fmtMoney(inc); tout.textContent=fmtMoney(out); vas.textContent=fmtMoney(bal); vap.textContent=data.vaCredit?`${Math.round(pct)}% utilizado`:'configure seu crédito';
  renderBars(monthTx); renderUpcoming(); renderRecent(monthTx); renderCalendar(); renderReserveSummary(); renderFutureInvoices(); renderTables(); renderCards(); renderPlanned(); renderVA(vu,used,bal,pct); renderGoals();
}

function renderBars(monthTx){
  let c={}; monthTx.filter(x=>x.type==='expense').forEach(x=>c[x.category]=(c[x.category]||0)+Number(x.amount));
  const z=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,8),max=Math.max(...z.map(x=>x[1]),1);
  bars.innerHTML=z.length?z.map(x=>`<div class="barcol"><div class="bar" style="--h:${Math.max(8,x[1]/max*145)}px"></div><span>${esc(x[0])}</span><b>${fmtMoney(x[1])}</b></div>`).join(''):'<div class="empty fill">Nenhum gasto neste mês.</div>';
}

function resolveDueDate(rule,calendarDay,businessDayNumber,year,month){
  if(rule==='last_business_day'){
    let d=new Date(year,month+1,0); while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()-1); return d;
  }
  if(rule==='business_day_number'){
    const target=Number(businessDayNumber||1); let count=0; for(let day=1;day<=31;day++){ const d=new Date(year,month,day); if(d.getMonth()!==month)break; if(d.getDay()!==0&&d.getDay()!==6){count++; if(count===target)return d;} } return new Date(year,month,1);
  }
  const last=new Date(year,month+1,0).getDate(); return new Date(year,month,Math.min(Number(calendarDay||1),last));
}

function dueLabel(item){
  if(item.due_rule==='last_business_day') return 'Último dia útil';
  if(item.due_rule==='business_day_number') return `${item.business_day_number}º dia útil`;
  return `Dia ${item.due_day}`;
}

function monthMatchesFixed(x){return !x.due_month || Number(x.due_month)===cur.getMonth()+1}

function getScheduledItemsForMonth(){
  const y=cur.getFullYear(),m=cur.getMonth(); let items=[];
  data.fixed.filter(monthMatchesFixed).forEach(x=>items.push({date:resolveDueDate(x.due_rule,x.due_day,x.business_day_number,y,m),name:x.name,amount:Number(x.amount),kind:'Conta fixa'}));
  data.cardPurchases.forEach(p=>{
    const start=parseLocalDate(p.first_installment_month); const diff=(y-start.getFullYear())*12+(m-start.getMonth());
    if(diff>=0 && diff<Number(p.installments)){
      const card=data.cards.find(c=>c.id===p.card_id); const d=resolveDueDate('calendar_day',card?.due_day||1,null,y,m);
      items.push({date:d,name:`${p.description} (${diff+1}/${p.installments})`,amount:Number(p.total_amount)/Number(p.installments),kind:'Cartão'});
    }
  });
  data.plannedBills.forEach(p=>{
    const start=parseLocalDate(p.first_due_month); const diff=(y-start.getFullYear())*12+(m-start.getMonth());
    if(diff>=0 && diff<Number(p.installments)){
      items.push({date:resolveDueDate(p.due_rule,p.due_day,p.business_day_number,y,m),name:`${p.name} (${diff+1}/${p.installments})`,amount:Number(p.total_amount)/Number(p.installments),kind:'Conta parcelada'});
    }
  });
  return items.sort((a,b)=>a.date-b.date);
}

function renderUpcoming(){
  const items=getScheduledItemsForMonth().filter(x=>x.date>=new Date(cur.getFullYear(),cur.getMonth(),1)).slice(0,7);
  up.innerHTML=items.length?items.map(x=>`<div class="item"><div class="left"><div class="avatar">◷</div><div><b>${esc(x.name)}</b><div class="sub">${String(x.date.getDate()).padStart(2,'0')}/${String(x.date.getMonth()+1).padStart(2,'0')} · ${x.kind}</div></div></div><b class="negative">${fmtMoney(x.amount)}</b></div>`).join(''):'<div class="empty">Nada previsto neste mês.</div>';
}

function renderRecent(monthTx){recent.innerHTML=monthTx.length?monthTx.slice(0,6).map(x=>`<div class="item"><div class="left"><div class="avatar">${x.type==='income'?'↑':'↓'}</div><div><b>${esc(x.description)}</b><div class="sub">${esc(x.category)} · ${x.transaction_date.split('-').reverse().join('/')}</div></div></div><b class="${x.type==='income'?'positive':'negative'}">${x.type==='income'?'+':'-'} ${fmtMoney(x.amount)}</b></div>`).join(''):'<div class="empty">Nenhum lançamento.</div>'}

function renderCalendar(){
  const y=cur.getFullYear(),m=cur.getMonth(),first=new Date(y,m,1),lastDay=new Date(y,m+1,0).getDate();
  const start=(first.getDay()+6)%7; const events=getScheduledItemsForMonth();
  let html='<div class="weekdays">'+['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d=>`<span>${d}</span>`).join('')+'</div><div class="calendar-grid">';
  for(let i=0;i<start;i++) html+='<div class="cal-cell muted-cell"></div>';
  for(let day=1;day<=lastDay;day++){
    const d=new Date(y,m,day); const es=events.filter(e=>e.date.getDate()===day);
    html+=`<div class="cal-cell ${es.length?'has-event':''}"><div class="cal-day">${day}</div>${es.slice(0,2).map(e=>`<div class="cal-event" title="${esc(e.name)}">${esc(e.name)}</div>`).join('')}${es.length>2?`<div class="cal-more">+${es.length-2}</div>`:''}</div>`;
  }
  html+='</div>'; calendar.innerHTML=html;
}

function renderTables(){
  txTable.innerHTML=data.tx.length?`<div class="table-wrap"><table class="table"><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Valor</th><th>Ações</th></tr>${data.tx.map(x=>`<tr><td data-label="Descrição"><b>${esc(x.description)}</b></td><td data-label="Categoria"><span class="tag">${esc(x.category)}</span></td><td data-label="Data">${x.transaction_date.split('-').reverse().join('/')}</td><td data-label="Valor" class="${x.type==='income'?'positive':'negative'}">${x.type==='income'?'+':'-'} ${fmtMoney(x.amount)}</td><td data-label="Ações"><div class="btn-row"><button class="ghost" onclick="editTx(${x.id})">Editar</button><button class="danger-btn" onclick="delRow('transactions',${x.id})">Excluir</button></div></td></tr>`).join('')}</table></div>`:'<div class="empty">Nenhum lançamento.</div>';
  const reserveKey=firstOfMonth(cur);
  fixedTable.innerHTML=data.fixed.length?data.fixed.map(x=>{
    const plan=data.reservePlans.find(p=>Number(p.fixed_bill_id)===Number(x.id));
    const entry=plan?data.reserveEntries.find(e=>Number(e.plan_id)===Number(plan.id)&&e.reference_month===reserveKey):null;
    const saved=Number(entry?.first_saved||0)+Number(entry?.second_saved||0);
    const remaining=Math.max(0,Number(x.amount)-saved);
    const pct=Number(x.amount)?clamp(saved/Number(x.amount)*100,0,100):0;
    const firstTarget=plan?Number(x.amount)*Number(plan.first_split_percent)/100:0;
    const secondTarget=plan?Number(x.amount)-firstTarget:0;
    return `<div class="card fixed-account-card"><div class="fixed-main"><div><div class="label">CONTA FIXA</div><h3>${esc(x.name)}</h3><div class="sub">${dueLabel(x)}${x.due_month?` · somente em ${MONTHS[x.due_month-1]}`:''}</div></div><div class="fixed-amount"><span>Valor da conta</span><b>${fmtMoney(x.amount)}</b></div></div>${plan?`<div class="reserve-status"><div class="reserve-numbers"><div><span>Já reservado</span><b class="positive">${fmtMoney(saved)}</b></div><div><span>Ainda falta</span><b class="${remaining>0?'negative':'positive'}">${fmtMoney(remaining)}</b></div></div><div class="progress"><div style="width:${pct}%;background:var(--p)"></div></div><div class="reserve-splits"><button class="reserve-part" onclick="setReservePart(${plan.id},'first',${firstTarget})"><span>1º recebimento</span><b>${fmtMoney(Number(entry?.first_saved||0))} <small>de ${fmtMoney(firstTarget)}</small></b></button><button class="reserve-part" onclick="setReservePart(${plan.id},'second',${secondTarget})"><span>2º recebimento</span><b>${fmtMoney(Number(entry?.second_saved||0))} <small>de ${fmtMoney(secondTarget)}</small></b></button></div></div>`:`<div class="no-reserve"><span>Sem reserva quinzenal</span><button class="ghost" onclick="editFixed(${x.id})">Ativar reserva</button></div>`}<div class="fixed-actions"><button class="ghost" onclick="editFixed(${x.id})">Editar</button><button class="danger-btn" onclick="delRow('fixed_bills',${x.id})">Excluir</button></div></div>`;
  }).join(''):'<div class="card"><div class="empty">Nenhuma conta fixa.</div></div>';
}

function renderReserveSummary(){
  const plans=data.reservePlans.filter(p=>p.fixed_bill_id);
  if(!plans.length){reserveSummary.innerHTML='<div class="empty">Ative a reserva quinzenal em uma conta fixa.</div>';return;}
  const key=firstOfMonth(cur);
  reserveSummary.innerHTML=plans.slice(0,5).map(p=>{
    const bill=data.fixed.find(b=>Number(b.id)===Number(p.fixed_bill_id));
    const target=Number(bill?.amount||p.monthly_amount||0);
    const e=data.reserveEntries.find(x=>x.plan_id===p.id&&x.reference_month===key); const saved=Number(e?.first_saved||0)+Number(e?.second_saved||0), pct=target?clamp(saved/target*100,0,100):0;
    return `<div class="mini-plan"><div><b>${esc(bill?.name||p.name)}</b><div class="sub">${fmtMoney(saved)} reservado · faltam ${fmtMoney(Math.max(0,target-saved))}</div></div><div class="mini-progress"><span style="width:${pct}%"></span></div></div>`;
  }).join('');
}

function renderReserveList(){
  const key=firstOfMonth(cur);
  reserveList.innerHTML=data.reservePlans.length?data.reservePlans.map(p=>{
    const e=data.reserveEntries.find(x=>x.plan_id===p.id&&x.reference_month===key); const firstTarget=Number(p.monthly_amount)*Number(p.first_split_percent)/100, secondTarget=Number(p.monthly_amount)-firstTarget;
    const f=Number(e?.first_saved||0),s=Number(e?.second_saved||0),saved=f+s,pct=clamp(saved/Number(p.monthly_amount)*100,0,100);
    return `<div class="card reserve-card"><div class="card-head"><div><div class="label">RESERVA DO MÊS</div><h3>${esc(p.name)}</h3></div><button class="danger-btn" onclick="delReserve(${p.id})">Excluir</button></div><div class="value small-value">${fmtMoney(saved)} <span class="small">de ${fmtMoney(p.monthly_amount)}</span></div><div class="progress"><div style="width:${pct}%;background:var(--p)"></div></div><div class="split-grid"><div><span>1º recebimento</span><b>${fmtMoney(firstTarget)}</b><small>guardado: ${fmtMoney(f)}</small><button class="ghost wide" onclick="setReservePart(${p.id},'first',${firstTarget})">Marcar / ajustar</button></div><div><span>2º recebimento</span><b>${fmtMoney(secondTarget)}</b><small>guardado: ${fmtMoney(s)}</small><button class="ghost wide" onclick="setReservePart(${p.id},'second',${secondTarget})">Marcar / ajustar</button></div></div></div>`;
  }).join(''):'<div class="card fill"><div class="empty">Nenhuma reserva criada.</div></div>';
}

function renderCards(){
  cardsOverview.innerHTML=data.cards.length?data.cards.map(c=>{
    const current=getInvoiceTotal(c.id,cur); const next=getInvoiceTotal(c.id,addMonths(cur,1));
    return `<div class="card"><div class="label">CARTÃO</div><h3>${esc(c.name)}</h3><div class="value small-value">${fmtMoney(current)}</div><div class="small">fatura prevista de ${MONTHS[cur.getMonth()]}</div><div class="item compact"><span>Próximo mês</span><b>${fmtMoney(next)}</b></div><div class="item compact"><span>Limite</span><b>${fmtMoney(c.limit_amount)}</b></div></div>`;
  }).join(''):'<div class="card fill"><div class="empty">Cadastre seu primeiro cartão.</div></div>';
  cardPurchases.innerHTML=data.cardPurchases.length?`<div class="table-wrap"><table class="table"><tr><th>Compra</th><th>Cartão</th><th>Parcela</th><th>Já pagas</th><th>Faltam</th><th>Ações</th></tr>${data.cardPurchases.map(p=>{const c=data.cards.find(x=>x.id===p.card_id);return`<tr><td data-label="Compra"><b>${esc(p.description)}</b><div class="sub">${fmtMoney(Number(p.total_amount)/Number(p.installments))} por mês</div></td><td data-label="Cartão">${esc(c?.name||'Cartão')}</td><td data-label="Parcelas">${p.installments}x</td><td data-label="Pagas">${p.paid_installments}</td><td data-label="Faltam"><b>${Math.max(0,p.installments-p.paid_installments)}</b></td><td data-label="Ações"><div class="btn-row"><button class="ghost" onclick="editCardPurchase(${p.id})">Editar</button><button class="danger-btn" onclick="delRow('credit_card_purchases',${p.id})">Excluir</button></div></td></tr>`}).join('')}</table></div>`:'<div class="empty">Nenhuma compra parcelada.</div>';
}

function getInvoiceTotal(cardId,monthDate){
  const y=monthDate.getFullYear(),m=monthDate.getMonth(); return data.cardPurchases.filter(p=>p.card_id===cardId).reduce((sum,p)=>{const start=parseLocalDate(p.first_installment_month),diff=(y-start.getFullYear())*12+(m-start.getMonth());return sum+(diff>=0&&diff<Number(p.installments)?Number(p.total_amount)/Number(p.installments):0)},0);
}

function renderFutureInvoices(){
  if(!data.cardPurchases.length){futureInvoices.innerHTML='<div class="empty">Nenhuma parcela futura.</div>';return;}
  let rows=[]; for(let i=0;i<4;i++){const d=addMonths(cur,i),total=data.cards.reduce((s,c)=>s+getInvoiceTotal(c.id,d),0);rows.push({d,total});}
  futureInvoices.innerHTML=rows.map(r=>`<div class="item"><div><b>${MONTHS[r.d.getMonth()]}</b><div class="sub">parcelas já comprometidas</div></div><b class="negative">${fmtMoney(r.total)}</b></div>`).join('');
}

function renderPlanned(){
  plannedList.innerHTML=data.plannedBills.length?data.plannedBills.map(p=>{const inst=Number(p.total_amount)/Number(p.installments),left=Math.max(0,Number(p.installments)-Number(p.paid_installments));return`<div class="card"><div class="card-head"><div><div class="label">CONTA PARCELADA</div><h3>${esc(p.name)}</h3></div><span class="tag">${p.paid_installments}/${p.installments} pagas</span></div><div class="value small-value">${fmtMoney(inst)} <span class="small">por parcela</span></div><div class="item compact"><span>Valor total</span><b>${fmtMoney(p.total_amount)}</b></div><div class="item compact"><span>Faltam</span><b>${left} parcelas</b></div><div class="item compact"><span>Vencimento</span><b>${dueLabel(p)}</b></div><div class="btn-row gap-top"><button class="ghost" onclick="editPlanned(${p.id})">Editar</button><button class="primary" onclick="advancePlanned(${p.id})">+ 1 paga</button><button class="danger-btn" onclick="delRow('planned_bills',${p.id})">Excluir</button></div></div>`}).join(''):'<div class="card fill"><div class="empty">Nenhuma conta parcelada.</div></div>';
}

function renderVA(vu,used,bal,pct){vpage.textContent=fmtMoney(bal);vrec.textContent=fmtMoney(data.vaCredit);vused.textContent=fmtMoney(used);vpct.textContent=Math.round(pct)+'%';vbar.style.width=pct+'%';vtext.textContent=`${fmtMoney(used)} usados de ${fmtMoney(data.vaCredit)}.`;vlist.innerHTML=vu.length?vu.slice(0,6).map(x=>`<div class="item"><div class="left"><div class="avatar">🍽</div><div><b>${esc(x.description)}</b><div class="sub">${x.use_date.split('-').reverse().join('/')}</div></div></div><b class="negative">- ${fmtMoney(x.amount)}</b></div>`).join(''):'<div class="empty">Nenhum uso registrado.</div>'}

function renderGoals(){goals.innerHTML=data.goals.length?data.goals.map(x=>{let p=Math.min(100,Number(x.saved)/Number(x.target)*100);return`<div class="card"><div class="label">META</div><h3>${esc(x.name)}</h3><div class="value small-value">${fmtMoney(x.saved)} <span class="small">de ${fmtMoney(x.target)}</span></div><div class="progress gap-top"><div style="width:${p}%;background:var(--p)"></div></div><div class="small">${Math.round(p)}% concluído</div><button class="danger-btn gap-top" onclick="delRow('goals',${x.id})">Excluir</button></div>`}).join(''):'<div class="card fill"><div class="empty">Crie sua primeira meta.</div></div>'}

window.openModal=id=>{document.querySelector('#'+id).classList.add('show'); if(id==='mVA')vdate.value=toISODate(new Date());};
window.closeModal=id=>document.querySelector('#'+id).classList.remove('show');

window.openTxModal=()=>{editingTxId=null;txModalTitle.textContent='Novo lançamento';td.value='';tv.value='';tt.value='expense';tc.value='Alimentação';tcOtherWrap.classList.add('hidden');tcOther.value='';tdate.value=toISODate(new Date());openModal('mTx')};
window.editTx=id=>{const x=data.tx.find(x=>x.id===id);if(!x)return;editingTxId=id;txModalTitle.textContent='Editar lançamento';td.value=x.description;tv.value=x.amount;tt.value=x.type;const known=[...tc.options].map(o=>o.value);if(known.includes(x.category)){tc.value=x.category;tcOtherWrap.classList.add('hidden');tcOther.value=''}else{tc.value='Outros';tcOtherWrap.classList.remove('hidden');tcOther.value=x.category}tdate.value=x.transaction_date;openModal('mTx')};
window.saveTx=async()=>{const category=tc.value==='Outros'?(tcOther.value.trim()||'Outros'):tc.value;if(!td.value.trim()||!+tv.value||!tdate.value)return alert('Preencha descrição, valor e data.');const payload={user_id:user.id,description:td.value.trim(),amount:+tv.value,type:tt.value,category,transaction_date:tdate.value};const r=editingTxId?await sb.from('transactions').update(payload).eq('id',editingTxId):await sb.from('transactions').insert(payload);if(r.error)return alert(r.error.message);closeModal('mTx');await refresh()};

function toggleFixedRuleFields(){fdayWrap.classList.toggle('hidden',frule.value!=='calendar_day');fbdayWrap.classList.toggle('hidden',frule.value!=='business_day_number')}
function toggleFixedReserveFields(){fsplitWrap.classList.toggle('hidden',!freserve.checked)}
window.openFixedModal=()=>{editingFixedId=null;fixedModalTitle.textContent='Nova conta fixa';fd.value='';fv.value='';fmonth.value='';frule.value='calendar_day';fday.value='';fbday.value='';freserve.checked=false;fsplit.value=50;toggleFixedRuleFields();toggleFixedReserveFields();openModal('mFixed')};
window.editFixed=id=>{const x=data.fixed.find(x=>x.id===id);if(!x)return;const plan=data.reservePlans.find(p=>Number(p.fixed_bill_id)===Number(id));editingFixedId=id;fixedModalTitle.textContent='Editar conta fixa';fd.value=x.name;fv.value=x.amount;fmonth.value=x.due_month||'';frule.value=x.due_rule||'calendar_day';fday.value=x.due_day||'';fbday.value=x.business_day_number||'';freserve.checked=!!plan;fsplit.value=plan?.first_split_percent??50;toggleFixedRuleFields();toggleFixedReserveFields();openModal('mFixed')};
window.saveFixed=async()=>{if(!fd.value.trim()||!+fv.value)return alert('Preencha nome e valor.');if(frule.value==='calendar_day'&&!+fday.value)return alert('Informe o dia do mês.');if(frule.value==='business_day_number'&&!+fbday.value)return alert('Informe o número do dia útil.');const payload={user_id:user.id,name:fd.value.trim(),amount:+fv.value,due_month:fmonth.value?+fmonth.value:null,due_rule:frule.value,due_day:frule.value==='calendar_day'?+fday.value:null,business_day_number:frule.value==='business_day_number'?+fbday.value:null};let billId=editingFixedId;let r;if(editingFixedId){r=await sb.from('fixed_bills').update(payload).eq('id',editingFixedId)}else{r=await sb.from('fixed_bills').insert(payload).select('id').single();billId=r.data?.id}if(r.error)return alert(r.error.message);const existing=data.reservePlans.find(p=>Number(p.fixed_bill_id)===Number(billId));if(freserve.checked){const reservePayload={user_id:user.id,fixed_bill_id:billId,name:payload.name,monthly_amount:payload.amount,first_split_percent:clamp(+fsplit.value||50,0,100),active:true};const rr=existing?await sb.from('salary_reserve_plans').update(reservePayload).eq('id',existing.id):await sb.from('salary_reserve_plans').insert(reservePayload);if(rr.error)return alert('A conta foi salva, mas houve erro ao configurar a reserva: '+rr.error.message)}else if(existing){const rr=await sb.from('salary_reserve_plans').delete().eq('id',existing.id);if(rr.error)return alert('A conta foi salva, mas não foi possível remover a reserva: '+rr.error.message)}closeModal('mFixed');await refresh()};

window.addReserve=async()=>{if(!rn.value.trim()||!+ra.value)return alert('Preencha nome e valor.');const r=await sb.from('salary_reserve_plans').insert({user_id:user.id,name:rn.value.trim(),monthly_amount:+ra.value,first_split_percent:clamp(+rp.value||50,0,100),active:true});if(r.error)return alert(r.error.message);closeModal('mReserve');rn.value='';ra.value='';rp.value=50;await refresh()};
window.setReservePart=async(planId,part,target)=>{const key=firstOfMonth(cur);const current=data.reserveEntries.find(x=>x.plan_id===planId&&x.reference_month===key);const raw=prompt(`Quanto você já guardou neste recebimento?`,String(part==='first'?current?.first_saved??target:current?.second_saved??target));if(raw===null||isNaN(+raw)||+raw<0)return;const payload={user_id:user.id,plan_id:planId,reference_month:key,first_saved:part==='first'?+raw:Number(current?.first_saved||0),second_saved:part==='second'?+raw:Number(current?.second_saved||0),updated_at:new Date().toISOString()};let r=current?await sb.from('salary_reserve_entries').update(payload).eq('id',current.id):await sb.from('salary_reserve_entries').insert(payload);if(r.error)return alert(r.error.message);await refresh()};
window.delReserve=async id=>{if(!confirm('Excluir esta reserva?'))return;await sb.from('salary_reserve_plans').delete().eq('id',id);await refresh()};

window.addCard=async()=>{if(!cn.value.trim())return alert('Informe o nome do cartão.');const r=await sb.from('credit_cards').insert({user_id:user.id,name:cn.value.trim(),limit_amount:+cl.value||0,closing_day:+cc.value||null,due_day:+cd.value||null});if(r.error)return alert(r.error.message);closeModal('mCard');cn.value='';cl.value='';cc.value='';cd.value='';await refresh()};
window.openCardPurchaseModal=()=>{if(!data.cards.length)return alert('Cadastre um cartão primeiro.');editingCardPurchaseId=null;cardPurchaseTitle.textContent='Nova compra parcelada';pcard.innerHTML=data.cards.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');pd.value='';pt.value='';pi.value=1;pp.value=0;pdate.value=toISODate(new Date());pfirst.value=monthKey(new Date());pcat.value='Compras';openModal('mCardPurchase')};
window.editCardPurchase=id=>{const p=data.cardPurchases.find(x=>x.id===id);if(!p)return;editingCardPurchaseId=id;cardPurchaseTitle.textContent='Editar compra parcelada';pcard.innerHTML=data.cards.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');pcard.value=p.card_id;pd.value=p.description;pt.value=p.total_amount;pi.value=p.installments;pp.value=p.paid_installments;pdate.value=p.purchase_date;pfirst.value=p.first_installment_month.slice(0,7);pcat.value=p.category||'';openModal('mCardPurchase')};
window.saveCardPurchase=async()=>{if(!pcard.value||!pd.value.trim()||!+pt.value||!+pi.value||!pfirst.value)return alert('Preencha cartão, compra, valor, parcelas e primeira fatura.');const payload={user_id:user.id,card_id:+pcard.value,description:pd.value.trim(),category:pcat.value.trim()||'Outros',total_amount:+pt.value,installments:+pi.value,paid_installments:clamp(+pp.value||0,0,+pi.value),purchase_date:pdate.value||toISODate(new Date()),first_installment_month:pfirst.value+'-01'};const r=editingCardPurchaseId?await sb.from('credit_card_purchases').update(payload).eq('id',editingCardPurchaseId):await sb.from('credit_card_purchases').insert(payload);if(r.error)return alert(r.error.message);closeModal('mCardPurchase');await refresh()};

function togglePlannedRuleFields(){pldayWrap.classList.toggle('hidden',plrule.value!=='calendar_day');plbdayWrap.classList.toggle('hidden',plrule.value!=='business_day_number')}
window.openPlannedModal=()=>{editingPlannedId=null;plannedModalTitle.textContent='Nova conta parcelada';pln.value='';pla.value='';pli.value=3;plp.value=0;plm.value=monthKey(new Date());plrule.value='calendar_day';plday.value='';plbday.value='';plnotes.value='';togglePlannedRuleFields();openModal('mPlanned')};
window.editPlanned=id=>{const p=data.plannedBills.find(x=>x.id===id);if(!p)return;editingPlannedId=id;plannedModalTitle.textContent='Editar conta parcelada';pln.value=p.name;pla.value=p.total_amount;pli.value=p.installments;plp.value=p.paid_installments;plm.value=p.first_due_month.slice(0,7);plrule.value=p.due_rule;plday.value=p.due_day||'';plbday.value=p.business_day_number||'';plnotes.value=p.notes||'';togglePlannedRuleFields();openModal('mPlanned')};
window.savePlanned=async()=>{if(!pln.value.trim()||!+pla.value||!+pli.value||!plm.value)return alert('Preencha nome, valor, parcelas e primeiro mês.');if(plrule.value==='calendar_day'&&!+plday.value)return alert('Informe o dia do vencimento.');if(plrule.value==='business_day_number'&&!+plbday.value)return alert('Informe o número do dia útil.');const payload={user_id:user.id,name:pln.value.trim(),total_amount:+pla.value,installments:+pli.value,paid_installments:clamp(+plp.value||0,0,+pli.value),first_due_month:plm.value+'-01',due_rule:plrule.value,due_day:plrule.value==='calendar_day'?+plday.value:null,business_day_number:plrule.value==='business_day_number'?+plbday.value:null,notes:plnotes.value.trim()||null};const r=editingPlannedId?await sb.from('planned_bills').update(payload).eq('id',editingPlannedId):await sb.from('planned_bills').insert(payload);if(r.error)return alert(r.error.message);closeModal('mPlanned');await refresh()};
window.advancePlanned=async id=>{const p=data.plannedBills.find(x=>x.id===id);if(!p)return;const next=Math.min(Number(p.installments),Number(p.paid_installments)+1);const r=await sb.from('planned_bills').update({paid_installments:next}).eq('id',id);if(r.error)return alert(r.error.message);await refresh()};

window.addVA=async()=>{if(!vd.value.trim()||!+vv.value||!vdate.value)return alert('Preencha estabelecimento, valor e data.');const r=await sb.from('va_uses').insert({user_id:user.id,description:vd.value.trim(),amount:+vv.value,use_date:vdate.value});if(r.error)return alert(r.error.message);closeModal('mVA');vd.value='';vv.value='';await refresh()};
window.addGoal=async()=>{if(!gn.value.trim()||!+gt.value)return alert('Preencha nome e valor alvo.');const r=await sb.from('goals').insert({user_id:user.id,name:gn.value.trim(),target:+gt.value,saved:+gs.value||0});if(r.error)return alert(r.error.message);closeModal('mGoal');gn.value='';gt.value='';gs.value='';await refresh()};
window.delRow=async(t,id)=>{if(confirm('Excluir este item?')){const r=await sb.from(t).delete().eq('id',id);if(r.error)return alert(r.error.message);await refresh()}};
async function setCredit(){let v=prompt('Quanto você recebe por mês no vale alimentação?',data.vaCredit||'');if(v===null||isNaN(+v)||+v<0)return;let r=await sb.from('va_settings').upsert({user_id:user.id,monthly_credit:+v,updated_at:new Date().toISOString()});if(r.error)return alert(r.error.message);await refresh()}

boot();
