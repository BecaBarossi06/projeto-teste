'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0))
const today = () => new Date().toISOString().slice(0, 10)

export default function Home() {
  const [session, setSession] = useState(null)
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('dashboard')
  const [transactions, setTransactions] = useState([])
  const [fixedBills, setFixedBills] = useState([])
  const [vaUses, setVaUses] = useState([])
  const [goals, setGoals] = useState([])
  const [vaCredit, setVaCredit] = useState(0)
  const [form, setForm] = useState({ description:'', amount:'', type:'expense', category:'Alimentação', date:today() })
  const [fixed, setFixed] = useState({ name:'', amount:'', due_day:'' })
  const [va, setVa] = useState({ description:'', amount:'', date:today() })
  const [goal, setGoal] = useState({ name:'', target:'', saved:'0' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, current) => setSession(current))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session?.user) loadData()
  }, [session])

  async function loadData() {
    const [tx, fb, vu, gs, vc] = await Promise.all([
      supabase.from('transactions').select('*').order('transaction_date', { ascending: false }),
      supabase.from('fixed_bills').select('*').order('due_day'),
      supabase.from('va_uses').select('*').order('use_date', { ascending: false }),
      supabase.from('goals').select('*').order('created_at', { ascending: false }),
      supabase.from('va_settings').select('*').maybeSingle()
    ])
    setTransactions(tx.data || [])
    setFixedBills(fb.data || [])
    setVaUses(vu.data || [])
    setGoals(gs.data || [])
    setVaCredit(Number(vc.data?.monthly_credit || 0))
  }

  async function authenticate(e) {
    e.preventDefault()
    setMessage('')
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
    if (result.error) setMessage(result.error.message)
    else if (mode === 'signup' && !result.data.session) setMessage('Conta criada. Confirme seu e-mail e depois faça login.')
  }

  async function addTransaction(e) {
    e.preventDefault()
    await supabase.from('transactions').insert({
      user_id: session.user.id,
      description: form.description,
      amount: Number(form.amount),
      type: form.type,
      category: form.category,
      transaction_date: form.date
    })
    setForm({ description:'', amount:'', type:'expense', category:'Alimentação', date:today() })
    loadData()
  }

  async function addFixed(e) {
    e.preventDefault()
    await supabase.from('fixed_bills').insert({ user_id: session.user.id, name: fixed.name, amount: Number(fixed.amount), due_day: Number(fixed.due_day) })
    setFixed({ name:'', amount:'', due_day:'' })
    loadData()
  }

  async function addVA(e) {
    e.preventDefault()
    await supabase.from('va_uses').insert({ user_id: session.user.id, description: va.description, amount: Number(va.amount), use_date: va.date })
    setVa({ description:'', amount:'', date:today() })
    loadData()
  }

  async function saveVACredit(e) {
    e.preventDefault()
    await supabase.from('va_settings').upsert({ user_id: session.user.id, monthly_credit: Number(vaCredit), updated_at: new Date().toISOString() })
    loadData()
  }

  async function addGoal(e) {
    e.preventDefault()
    await supabase.from('goals').insert({ user_id: session.user.id, name: goal.name, target: Number(goal.target), saved: Number(goal.saved || 0) })
    setGoal({ name:'', target:'', saved:'0' })
    loadData()
  }

  async function remove(table, id) {
    await supabase.from(table).delete().eq('id', id)
    loadData()
  }

  const month = new Date().toISOString().slice(0, 7)
  const monthTx = useMemo(() => transactions.filter(t => t.transaction_date?.startsWith(month)), [transactions, month])
  const income = monthTx.filter(t => t.type === 'income').reduce((s,t) => s + Number(t.amount), 0)
  const expense = monthTx.filter(t => t.type === 'expense').reduce((s,t) => s + Number(t.amount), 0)
  const vaUsed = vaUses.filter(v => v.use_date?.startsWith(month)).reduce((s,v) => s + Number(v.amount), 0)
  const vaBalance = Math.max(0, Number(vaCredit) - vaUsed)

  if (loading) return <div className="center">Carregando…</div>

  if (!session) {
    return <main className="authPage">
      <section className="authHero">
        <div className="logo">fluxo<span>.</span></div>
        <div><h1>Seu dinheiro, mais claro.</h1><p>Controle gastos, contas fixas, metas e vale-alimentação sem misturar tudo.</p></div>
        <small>Controle financeiro pessoal</small>
      </section>
      <section className="authArea">
        <form className="authCard" onSubmit={authenticate}>
          <h2>{mode === 'login' ? 'Entrar no Fluxo' : 'Criar sua conta'}</h2>
          <p>Acesse seu controle financeiro.</p>
          <div className="segmented"><button type="button" className={mode==='login'?'active':''} onClick={()=>setMode('login')}>Entrar</button><button type="button" className={mode==='signup'?'active':''} onClick={()=>setMode('signup')}>Criar conta</button></div>
          <label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
          <label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength="6" required /></label>
          <button className="primary">{mode==='login'?'Entrar':'Criar conta'}</button>
          {message && <div className="message">{message}</div>}
        </form>
      </section>
    </main>
  }

  return <div className="shell">
    <aside>
      <div className="logo">fluxo<span>.</span></div>
      <nav>{[['dashboard','⌂','Dashboard'],['lancamentos','↕','Lançamentos'],['contas','◷','Contas fixas'],['vale','◉','Vale alimentação'],['metas','◇','Metas']].map(([k,i,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}><b>{i}</b>{l}</button>)}</nav>
      <div className="account"><small>{session.user.email}</small><button onClick={()=>supabase.auth.signOut()}>Sair</button></div>
    </aside>
    <main className="content">
      {tab==='dashboard' && <><header><div><h1>Visão geral</h1><p>Seu mês financeiro em um só lugar.</p></div></header><div className="cards"><Metric label="Saldo do mês" value={money(income-expense)} cls="purple"/><Metric label="Entradas" value={money(income)} cls="green"/><Metric label="Gastos" value={money(expense)} cls="red"/><Metric label="Vale alimentação" value={money(vaBalance)} cls="va"/></div><div className="two"><Panel title="Últimos lançamentos">{monthTx.slice(0,6).map(t=><Row key={t.id} title={t.description} sub={`${t.category} • ${t.transaction_date}`} value={`${t.type==='income'?'+':'-'} ${money(t.amount)}`} cls={t.type==='income'?'green':'red'}/>)}</Panel><Panel title="Contas fixas">{fixedBills.slice(0,6).map(f=><Row key={f.id} title={f.name} sub={`Vence dia ${f.due_day}`} value={money(f.amount)} cls="red"/>)}</Panel></div></>}
      {tab==='lancamentos' && <Section title="Lançamentos" subtitle="Cadastre entradas e gastos."><form className="formCard" onSubmit={addTransaction}><input placeholder="Descrição" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} required/><input type="number" step="0.01" placeholder="Valor" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} required/><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="expense">Gasto</option><option value="income">Entrada</option></select><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{['Alimentação','Moradia','Transporte','Lazer','Saúde','Estudos','Compras','Outros'].map(c=><option key={c}>{c}</option>)}</select><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/><button className="primary">Salvar</button></form><List data={transactions} render={t=><Row key={t.id} title={t.description} sub={`${t.category} • ${t.transaction_date}`} value={`${t.type==='income'?'+':'-'} ${money(t.amount)}`} cls={t.type==='income'?'green':'red'} action={()=>remove('transactions',t.id)}/>} /></Section>}
      {tab==='contas' && <Section title="Contas fixas" subtitle="Compromissos que se repetem todos os meses."><form className="formCard" onSubmit={addFixed}><input placeholder="Nome da conta" value={fixed.name} onChange={e=>setFixed({...fixed,name:e.target.value})} required/><input type="number" step="0.01" placeholder="Valor" value={fixed.amount} onChange={e=>setFixed({...fixed,amount:e.target.value})} required/><input type="number" min="1" max="31" placeholder="Dia do vencimento" value={fixed.due_day} onChange={e=>setFixed({...fixed,due_day:e.target.value})} required/><button className="primary">Salvar</button></form><List data={fixedBills} render={f=><Row key={f.id} title={f.name} sub={`Vence dia ${f.due_day}`} value={money(f.amount)} cls="red" action={()=>remove('fixed_bills',f.id)}/>} /></Section>}
      {tab==='vale' && <Section title="Vale alimentação" subtitle="Seu benefício fica separado do saldo pessoal."><div className="cards"><Metric label="Crédito mensal" value={money(vaCredit)} cls="green"/><Metric label="Utilizado" value={money(vaUsed)} cls="red"/><Metric label="Disponível" value={money(vaBalance)} cls="va"/></div><div className="two"><form className="formCard" onSubmit={saveVACredit}><h3>Crédito mensal</h3><input type="number" step="0.01" value={vaCredit} onChange={e=>setVaCredit(e.target.value)}/><button className="primary">Atualizar crédito</button></form><form className="formCard" onSubmit={addVA}><h3>Registrar uso</h3><input placeholder="Estabelecimento" value={va.description} onChange={e=>setVa({...va,description:e.target.value})} required/><input type="number" step="0.01" placeholder="Valor" value={va.amount} onChange={e=>setVa({...va,amount:e.target.value})} required/><input type="date" value={va.date} onChange={e=>setVa({...va,date:e.target.value})}/><button className="primary">Registrar</button></form></div><List data={vaUses} render={v=><Row key={v.id} title={v.description} sub={v.use_date} value={`- ${money(v.amount)}`} cls="red" action={()=>remove('va_uses',v.id)}/>} /></Section>}
      {tab==='metas' && <Section title="Metas financeiras" subtitle="Acompanhe seus objetivos."><form className="formCard" onSubmit={addGoal}><input placeholder="Nome da meta" value={goal.name} onChange={e=>setGoal({...goal,name:e.target.value})} required/><input type="number" step="0.01" placeholder="Valor alvo" value={goal.target} onChange={e=>setGoal({...goal,target:e.target.value})} required/><input type="number" step="0.01" placeholder="Já guardado" value={goal.saved} onChange={e=>setGoal({...goal,saved:e.target.value})}/><button className="primary">Salvar</button></form><div className="goalGrid">{goals.map(g=>{const p=Math.min(100,Math.round(Number(g.saved)/Number(g.target)*100)||0);return <article className="goal" key={g.id}><h3>{g.name}</h3><strong>{money(g.saved)}</strong><small>de {money(g.target)}</small><div className="progress"><span style={{width:`${p}%`}}/></div><footer>{p}% concluído <button onClick={()=>remove('goals',g.id)}>Excluir</button></footer></article>})}</div></Section>}
    </main>
  </div>
}

function Metric({label,value,cls=''}){return <article className={`metric ${cls}`}><small>{label}</small><strong>{value}</strong></article>}
function Panel({title,children}){return <section className="panel"><h3>{title}</h3>{children?.length?children:<div className="empty">Nenhum registro.</div>}</section>}
function Row({title,sub,value,cls,action}){return <div className="row"><div><strong>{title}</strong><small>{sub}</small></div><div className="rowRight"><b className={cls}>{value}</b>{action&&<button onClick={action}>Excluir</button>}</div></div>}
function Section({title,subtitle,children}){return <><header><div><h1>{title}</h1><p>{subtitle}</p></div></header>{children}</>}
function List({data,render}){return <section className="panel list">{data.length?data.map(render):<div className="empty">Nenhum registro.</div>}</section>}
