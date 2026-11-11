const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const CATEGORIES = ['طعام وشراب','مواصلات','تسوق','فواتير','إنترنت واتصالات','صحة وأدوية','ترفيه','ملابس','المنزل','مصروفات شخصية','تعليم','أخرى'];
const ICONS = {'طعام وشراب':'🍽️','مواصلات':'🚕','تسوق':'🛍️','فواتير':'🧾','إنترنت واتصالات':'📱','صحة وأدوية':'💊','ترفيه':'🎮','ملابس':'👕','المنزل':'🏠','مصروفات شخصية':'👤','تعليم':'📚','أخرى':'✦','راتب':'💼','دخل إضافي':'↗','ادخار':'♧'};
const COLORS = ['#62e6b1','#71a7ff','#b99aff','#ffb86b','#ff7887','#54d5df','#e9d36e','#a5b4fc','#f49ac2','#9de0a2','#c6a0ff','#9aa8ba'];
const today = new Date();
const dateISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const money = n => new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(Number(n)||0);
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const defaultData = {salary:0,payday:1,savingsOpeningBalance:0,currency:'EGP',onboardingCompleted:false,transactions:[],budgets:[],goals:[],debts:[],bills:[],theme:'dark'};
const CURRENCY_LABELS = {EGP:'ج.م',USD:'$',EUR:'€',SAR:'ر.س',AED:'د.إ',GBP:'£'};
const currencyLabel = () => CURRENCY_LABELS[data.currency] || data.currency || 'ج.م';
const moneyText = value => `${money(value)} ${currencyLabel()}`;
function normalizeData(){
 for(const key of ['transactions','budgets','goals','debts','bills'])if(!Array.isArray(data[key]))data[key]=[];
 data.salary=Number(data.salary)||0;data.payday=Math.max(1,Math.min(31,Number(data.payday)||1));
 if(!CURRENCY_LABELS[data.currency])data.currency='EGP';
 if(typeof data.onboardingCompleted!=='boolean')data.onboardingCompleted=false;
}
let data;
try { data = {...defaultData,...JSON.parse(localStorage.getItem('myMoneyData')||'{}')}; } catch { data={...defaultData}; }
let supabaseClient=null, currentUser=null, cloudReady=false, authMode='login', loadingCloud=false;
const SUPABASE_URL = window.MY_MONEY_CONFIG?.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.MY_MONEY_CONFIG?.SUPABASE_ANON_KEY || '';
let weeklyChart, categoryChart, monthlyChart, calendarDate=new Date(today.getFullYear(),today.getMonth(),1), selectedCalendarDate=dateISO(today), balanceHidden=false;
function save(){
 localStorage.setItem('myMoneyData',JSON.stringify(data));
 if(supabaseClient && currentUser && cloudReady && !loadingCloud){
   supabaseClient.from('user_finance_data').upsert({user_id:currentUser.id,data,updated_at:new Date().toISOString()},{onConflict:'user_id'})
    .then(({error})=>{if(error){console.error(error);toast('تعذر مزامنة البيانات السحابية؛ ستظل محفوظة على هذا الجهاز');}});
 }
}
function savingsTotals(){
 const all=data.transactions||[];
 const deposits=all.filter(t=>t.type==='saving').reduce((a,t)=>a+Number(t.amount||0),0);
 const withdrawals=all.filter(t=>t.type==='saving_withdrawal').reduce((a,t)=>a+Number(t.amount||0),0);
 return {deposits,withdrawals,balance:Number(data.savingsOpeningBalance||0)+deposits-withdrawals};
}
function renderSavingsBalance(){
 const st=savingsTotals();
 if($('#currentSavingsBalance'))$('#currentSavingsBalance').innerHTML=money(st.balance)+' <small>'+currencyLabel()+'</small>';
 if($('#savingsDeposits'))$('#savingsDeposits').textContent=money(st.deposits+Number(data.savingsOpeningBalance||0))+' '+currencyLabel();
 if($('#savingsWithdrawals'))$('#savingsWithdrawals').textContent=money(st.withdrawals)+' '+currencyLabel();
}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2400);}
function monthTx(){data.transactions=Array.isArray(data.transactions)?data.transactions:[];return data.transactions.filter(t=>t.date?.slice(0,7)===monthKey(today));}
function sums(list=monthTx()){return list.reduce((a,t)=>{if(t.type==='income')a.income+=t.amount;else if(t.type==='expense')a.expense+=t.amount;else if(t.type==='saving')a.saving+=t.amount;else if(t.type==='saving_withdrawal')a.savingWithdrawal+=t.amount;return a;},{income:0,expense:0,saving:0,savingWithdrawal:0});}
function available(){const s=sums();return data.salary+s.income-s.expense-s.saving+s.savingWithdrawal;}
function fmtDate(v){if(!v)return '';return new Date(v+'T12:00:00').toLocaleDateString('ar-EG',{day:'numeric',month:'short',year:'numeric'});}
function getDaysLeft(){let p=Math.max(1,Math.min(31,Number(data.payday)||1));let next=new Date(today.getFullYear(),today.getMonth(),p);if(next<=today)next=new Date(today.getFullYear(),today.getMonth()+1,p);return Math.max(1,Math.ceil((next-today)/86400000));}
function renderDashboard(){
 const s=sums(), avail=available(), inc=data.salary+s.income, spentPct=inc>0?(s.expense/inc*100):0;
 $('#availableBalance').textContent=balanceHidden?'••••••':money(avail);$('#totalIncome').textContent=money(inc)+' '+currencyLabel();$('#totalExpenses').textContent=money(s.expense)+' '+currencyLabel();$('#totalSavings').textContent=money(savingsTotals().balance)+' '+currencyLabel();
 $('#salaryValue').textContent=money(data.salary)+' '+currencyLabel();$('#dailyAverage').textContent=money(s.expense/Math.max(1,today.getDate()))+' '+currencyLabel();$('#dailyAllowance').textContent='الحد اليومي: '+money(Math.max(0,avail)/getDaysLeft())+' '+currencyLabel();
 $('#spentPercent').textContent=Math.round(spentPct)+'%';$('#spentProgress').style.width=Math.min(100,spentPct)+'%';
 $('#debtValue').textContent=money(data.debts.filter(d=>d.type==='owe').reduce((a,d)=>a+d.amount,0))+' '+currencyLabel();
 $('#todayLabel').textContent=today.toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'});
 const recent=[...data.transactions].sort((a,b)=>b.date.localeCompare(a.date)||b.created-b.created).slice(0,5);
 $('#recentTransactions').innerHTML=recent.length?recent.map(txHTML).join(''):'<div class="empty-state">لا توجد عمليات بعد. أضف أول عملية مالية لتبدأ المتابعة.</div>';
 const expenses=monthTx().filter(t=>t.type==='expense');const byCat={};expenses.forEach(t=>byCat[t.category]=(byCat[t.category]||0)+t.amount);
 const top=Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0];
 $('#smartTip').textContent=top?`أعلى تصنيف إنفاق لديك هذا الشهر هو ${top[0]}. راجع مشترياتك فيه لتجد فرصة للتوفير.`:'ابدأ بتسجيل مصروفاتك اليومية لتحصل على صورة أوضح عن أموالك.';
 renderCharts();
}
function txHTML(t){let positive=['income','saving_withdrawal'].includes(t.type), sign=positive?'+':'−', cls=positive?'positive':'negative', icon=t.type==='income'?'↗':(t.type==='saving'?'♧':(t.type==='saving_withdrawal'?'↘':(ICONS[t.category]||'✦')));return `<div class="transaction-item"><div class="tx-icon">${icon}</div><div class="tx-info"><b>${esc(t.title)}</b><small>${esc(t.category||'عام')} · ${fmtDate(t.date)}</small></div><div class="tx-amount ${cls}">${sign}${money(t.amount)} ${currencyLabel()}</div><div class="tx-actions"><button class="tiny-btn" data-edit="${t.id}">تعديل</button><button class="tiny-btn" data-delete="${t.id}">حذف</button></div></div>`;}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderTransactions(){let q=$('#searchTransactions').value.trim().toLowerCase(),type=$('#typeFilter').value,month=$('#monthFilter').value;let list=[...data.transactions].filter(t=>(type==='all'||t.type===type)&&(month==='all'||(month==='current'?t.date?.slice(0,7)===monthKey(today):t.date?.slice(0,7)===month))&&(`${t.title} ${t.category} ${t.amount}`.toLowerCase().includes(q))).sort((a,b)=>b.date.localeCompare(a.date)||b.created-a.created);$('#allTransactions').innerHTML=list.length?list.map(txHTML).join(''):'<div class="empty-state">لا توجد عمليات تطابق البحث.</div>';}
function renderBudgets(){const list=data.budgets;$('#budgetList').innerHTML=list.length?list.map(b=>{let used=monthTx().filter(t=>t.type==='expense'&&t.category===b.category).reduce((a,t)=>a+t.amount,0),p=used/b.amount*100;return `<article class="budget-card glass"><div class="budget-top"><b>${ICONS[b.category]||'✦'} ${esc(b.category)}</b><button class="tiny-btn" data-budget-delete="${b.id}">حذف</button></div><p>ميزانيتك الشهرية لهذا التصنيف</p><div class="budget-numbers"><b>${money(used)} ${currencyLabel()}</b><span>من ${money(b.amount)} ${currencyLabel()}</span></div><div class="budget-progress"><span style="width:${Math.min(100,p)}%;background:${p>100?'#ff7887':''}"></span></div><p>${p>100?'تجاوزت الميزانية بنسبة '+Math.round(p-100)+'%':'استهلكت '+Math.round(p)+'% من الميزانية'}</p></article>`}).join(''):'<div class="panel glass empty-state">لم تضف ميزانيات بعد. أنشئ ميزانية لتتحكم في إنفاقك.</div>';}
function renderGoals(){renderSavingsBalance();$('#savingsList').innerHTML=data.goals.length?data.goals.map(g=>{let p=Math.min(100,g.current/g.target*100);return `<article class="goal-card glass"><div class="goal-top"><b>♧ ${esc(g.name)}</b><button class="tiny-btn" data-goal-add="${g.id}">＋ إضافة مبلغ</button></div><p>هدفك المالي القادم</p><strong>${money(g.current)} <small style="color:var(--muted)">من ${money(g.target)} ${currencyLabel()}</small></strong><div class="goal-progress"><span style="width:${p}%"></span></div><div class="goal-meta"><span>${Math.round(p)}% مكتمل</span><span>متبقي ${money(Math.max(0,g.target-g.current))} ${currencyLabel()}</span></div><button class="text-action" data-goal-delete="${g.id}">حذف الهدف</button></article>`}).join(''):'<div class="panel glass empty-state">لا توجد أهداف ادخار حتى الآن. ما الشيء الذي تريد توفير المال من أجله؟</div>';}
function renderDebts(){let owe=data.debts.filter(d=>d.type==='owe').reduce((a,d)=>a+d.amount,0),owed=data.debts.filter(d=>d.type==='owed').reduce((a,d)=>a+d.amount,0);$('#owedByMe').textContent=money(owe)+' '+currencyLabel();$('#owedToMe').textContent=money(owed)+' '+currencyLabel();$('#debtList').innerHTML=data.debts.length?data.debts.map(d=>`<article class="debt-card"><div class="debt-top"><b>${esc(d.person)}</b><button class="tiny-btn" data-debt-delete="${d.id}">حذف</button></div><p>${d.type==='owe'?'دين عليك':'مبلغ لك عند شخص'} ${d.due?'· الاستحقاق '+fmtDate(d.due):''}</p><div class="debt-amount ${d.type==='owe'?'negative':'positive'}">${money(d.amount)} ${currencyLabel()}</div><p>${d.type==='owe'?'التزام مالي مسجل':'مبلغ مستحق لك'}</p></article>`).join(''):'<div class="panel glass empty-state">لا توجد ديون مسجلة. ممتاز!</div>';}
function renderReports(){let s=sums(),inc=data.salary+s.income,by={};monthTx().filter(t=>t.type==='expense').forEach(t=>by[t.category]=(by[t.category]||0)+t.amount);$('#reportIncome').textContent=money(inc)+' '+currencyLabel();$('#reportExpense').textContent=money(s.expense)+' '+currencyLabel();$('#reportNet').textContent=money(available())+' '+currencyLabel();$('#topCategory').textContent=Object.entries(by).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';}
function chartDefaults(){return {responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#10192b',titleColor:'#fff',bodyColor:'#dce8f0',padding:10,displayColors:true}},scales:{x:{grid:{display:false},ticks:{color:'#8e9ab4',font:{family:'Cairo',size:10}}},y:{grid:{color:'rgba(140,160,190,.12)'},ticks:{color:'#8e9ab4',font:{family:'Cairo',size:9}}}}};}
function renderCharts(){if(!window.Chart)return;const week=[];for(let i=6;i>=0;i--){let d=new Date(today);d.setDate(today.getDate()-i);let key=dateISO(d),val=data.transactions.filter(t=>t.type==='expense'&&t.date===key).reduce((a,t)=>a+t.amount,0);week.push({label:d.toLocaleDateString('ar-EG',{weekday:'short'}),value:val});}
 if(weeklyChart)weeklyChart.destroy();weeklyChart=new Chart($('#weeklyChart'),{type:'line',data:{labels:week.map(x=>x.label),datasets:[{data:week.map(x=>x.value),borderColor:'#62e6b1',backgroundColor:'rgba(98,230,177,.12)',fill:true,tension:.4,pointRadius:3,pointBackgroundColor:'#62e6b1'}]},options:chartDefaults()});
 let cats={};monthTx().filter(t=>t.type==='expense').forEach(t=>cats[t.category]=(cats[t.category]||0)+t.amount);let entries=Object.entries(cats);
 if(categoryChart)categoryChart.destroy();categoryChart=new Chart($('#categoryChart'),{type:'doughnut',data:{labels:entries.map(e=>e[0]),datasets:[{data:entries.map(e=>e[1]),backgroundColor:entries.map((e,i)=>COLORS[i%COLORS.length]),borderColor:'transparent',hoverOffset:5}]},options:{responsive:true,maintainAspectRatio:false,cutout:'72%',plugins:{legend:{display:false}}}});
 $('#categoryLegend').innerHTML=entries.slice(0,5).map((e,i)=>`<span class="legend-item"><i class="legend-dot" style="background:${COLORS[i%COLORS.length]}"></i>${esc(e[0])}</span>`).join('');
 let months=[];for(let i=5;i>=0;i--){let d=new Date(today.getFullYear(),today.getMonth()-i,1),key=monthKey(d),ts=data.transactions.filter(t=>t.date.startsWith(key));months.push({label:d.toLocaleDateString('ar-EG',{month:'short'}),income:(key===monthKey(today)?data.salary:0)+ts.filter(t=>t.type==='income').reduce((a,t)=>a+t.amount,0),expense:ts.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amount,0)});}
 if(monthlyChart)monthlyChart.destroy();monthlyChart=new Chart($('#monthlyChart'),{type:'bar',data:{labels:months.map(m=>m.label),datasets:[{label:'الدخل',data:months.map(m=>m.income),backgroundColor:'#62e6b1',borderRadius:6},{label:'المصروفات',data:months.map(m=>m.expense),backgroundColor:'#71a7ff',borderRadius:6}]},options:{...chartDefaults(),plugins:{...chartDefaults().plugins,legend:{display:true,labels:{color:'#9aa8ba',font:{family:'Cairo'}}}}}});
}
function renderCalendar(){let y=calendarDate.getFullYear(),m=calendarDate.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate();$('#calendarMonth').textContent=calendarDate.toLocaleDateString('ar-EG',{month:'long',year:'numeric'});let labels=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];let html=labels.map(x=>`<div class="calendar-cell head">${x}</div>`).join('');for(let i=0;i<first;i++)html+='<div></div>';for(let day=1;day<=days;day++){let d=dateISO(new Date(y,m,day)),has=data.transactions.some(t=>t.date===d);html+=`<button class="calendar-cell ${d===selectedCalendarDate?'selected':''} ${has?'has-data':''}" data-day="${d}">${day}</button>`;}$('#calendarGrid').innerHTML=html;let list=data.transactions.filter(t=>t.date===selectedCalendarDate);$('#selectedDayDetails').innerHTML=`<b>${fmtDate(selectedCalendarDate)}</b><div style="margin-top:8px">${list.length?list.map(t=>`${esc(t.title)}: ${t.type==='income'?'+':'−'}${money(t.amount)} ${currencyLabel()}`).join('<br>'):'لا توجد عمليات مسجلة في هذا اليوم.'}</div>`;}
function nextBillDate(date,frequency){const d=new Date((date||dateISO(today))+'T12:00:00');if(frequency==='weekly'){d.setDate(d.getDate()+7);return dateISO(d);}const day=d.getDate();d.setDate(1);if(frequency==='yearly')d.setFullYear(d.getFullYear()+1);else d.setMonth(d.getMonth()+1);const lastDay=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,lastDay));return dateISO(d);}
function renderBills(){const host=$('#billsList');if(!host)return;host.innerHTML=data.bills.length?[...data.bills].sort((a,b)=>(a.dueDate||'').localeCompare(b.dueDate||'')).map(b=>`<article class="bill-card glass"><div class="bill-main"><span class="bill-icon">🧾</span><div><b>${esc(b.name)}</b><small>${esc(b.category||'فواتير')} · الاستحقاق ${fmtDate(b.dueDate)}</small></div></div><strong>${moneyText(b.amount)}</strong><div class="bill-actions"><button class="primary-btn" data-bill-paid="${b.id}">تسجيل السداد</button><button class="tiny-btn" data-bill-delete="${b.id}">حذف</button></div></article>`).join(''):'<div class="panel glass empty-state">لا توجد فواتير متكررة. أضف أول فاتورة لتتبع مواعيدها.</div>';}
function payBill(id){const bill=data.bills.find(x=>x.id===id);if(!bill)return;if(!confirm(`تسجيل سداد فاتورة ${bill.name} بمبلغ ${moneyText(bill.amount)}؟`))return;data.transactions.push({id:uid(),type:'expense',amount:Number(bill.amount),title:bill.name,category:bill.category||'فواتير',date:dateISO(today),note:'سداد فاتورة متكررة',created:Date.now()});bill.dueDate=nextBillDate(bill.dueDate,bill.frequency);save();refresh();toast('تم تسجيل السداد وتحديث موعد الفاتورة');}
function refresh(){data.transactions=Array.isArray(data.transactions)?data.transactions:[];data.bills=Array.isArray(data.bills)?data.bills:[];document.querySelectorAll('[data-currency-label]').forEach(el=>el.textContent=currencyLabel());renderDashboard();renderTransactions();renderBudgets();renderGoals();renderDebts();renderReports();renderBills();if($('#page-calendar').classList.contains('active'))renderCalendar();}
function showPage(name){if(name==='settings'){openModal('settingsModal');return;}$$('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+name));$$('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===name));let names={dashboard:'الرئيسية',transactions:'العمليات المالية',budgets:'الميزانيات',savings:'المدخرات',debts:'الديون',reports:'التقارير',calendar:'التقويم المالي',bills:'الفواتير المتكررة'};$('#pageTitle').textContent=names[name]||'الرئيسية';if(name==='calendar')renderCalendar();if(name==='reports')renderReports();window.scrollTo({top:0,behavior:'smooth'});}
function openModal(id){$('#'+id).classList.add('show');}
function closeModals(){$$('.modal-backdrop').forEach(m=>m.classList.remove('show'));}
function fillCategories(){let opts=CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('');$('#txCategory').innerHTML=opts;$('#budgetCategory').innerHTML=opts;}
function openTransaction(t=null){$('#transactionForm').reset();$('#editId').value=t?.id||'';$('#modalTitle').textContent=t?'تعديل العملية':'إضافة عملية مالية';$('#txAmount').value=t?.amount||'';$('#txTitle').value=t?.title||'';$('#txDate').value=t?.date||dateISO(today);$('#txNote').value=t?.note||'';$('#txCategory').value=t?.category||CATEGORIES[0];setType(t?.type||'expense');openModal('modalBackdrop');}
function setType(type){$('#transactionType').value=type;$$('#transactionTypes button').forEach(b=>b.classList.toggle('selected',b.dataset.type===type));}
function deleteTransaction(id){if(!confirm('هل تريد حذف هذه العملية؟'))return;data.transactions=data.transactions.filter(t=>t.id!==id);save();refresh();toast('تم حذف العملية');}
function exportJSON(){let blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});downloadBlob(blob,'my-money-backup-'+dateISO(today)+'.json');}
function downloadBlob(blob,name){let a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);}
function exportCSV(){let rows=[['النوع','الاسم','التصنيف','المبلغ','التاريخ','ملاحظات'],...data.transactions.map(t=>[t.type,t.title,t.category,t.amount,t.date,t.note||''])];let csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),'my-money-transactions.csv');}
function setup(){
 normalizeData();
 fillCategories();$('#txDate').value=dateISO(today);document.body.classList.toggle('light',data.theme==='light');
 $$('[data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
 $('#mobileAdd').onclick=()=>openTransaction();$('#quickExpense').onclick=()=>openTransaction();$('#addTransactionBtn').onclick=()=>openTransaction();$('#addTransactionBtn2').onclick=()=>openTransaction();
 $('#closeModal').onclick=closeModals;$$('.close-generic').forEach(b=>b.onclick=closeModals);$$('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m&&!['firstSetupModal','passwordResetModal'].includes(m.id))closeModals()}));
 $$('#transactionTypes button').forEach(b=>b.onclick=()=>setType(b.dataset.type));
 $('#transactionForm').onsubmit=e=>{e.preventDefault();let amount=Number($('#txAmount').value);if(!(amount>0))return toast('أدخل مبلغاً صحيحاً');let id=$('#editId').value;let t={id:id||uid(),type:$('#transactionType').value,amount,title:$('#txTitle').value.trim(),category:$('#txCategory').value,date:$('#txDate').value,note:$('#txNote').value.trim(),created:Date.now()};if(!t.title||!t.date)return toast('أكمل البيانات المطلوبة');
 if(t.type==='saving_withdrawal'){
   const current=savingsTotals().balance;
   const old=data.transactions.find(x=>x.id===id);
   const availableToWithdraw=current+(old?.type==='saving_withdrawal'?old.amount:0);
   if(amount>availableToWithdraw)return toast('المبلغ أكبر من مدخراتك الحالية');
 }
 if(id){
   let i=data.transactions.findIndex(x=>x.id===id);
   if(i>=0){
     const old=data.transactions[i];
     if(old.type==='saving' && t.type!=='saving' && savingsTotals().balance-old.amount<0)return toast('لا يمكن تعديل الإيداع لأن ذلك سيجعل رصيد المدخرات سالباً');
     data.transactions[i]=t;
   }
 }else data.transactions.push(t);save();closeModals();refresh();toast(id?'تم تحديث العملية':'تم حفظ العملية بنجاح');};
 $('#salaryForm').onsubmit=e=>{e.preventDefault();data.salary=Number($('#salaryInput').value)||0;data.onboardingCompleted=true;data.payday=Math.max(1,Math.min(31,Number($('#paydayInput').value)||1));save();closeModals();refresh();toast('تم حفظ الراتب');};
 $('#firstSetupForm').onsubmit=e=>{e.preventDefault();data.salary=Math.max(0,Number($('#setupSalary').value)||0);data.payday=Math.max(1,Math.min(31,Number($('#setupPayday').value)||1));data.currency=$('#setupCurrency').value;data.onboardingCompleted=true;save();closeModals();refresh();toast('تم إعداد محفظتك بنجاح');};
 $('#salaryInput').value=data.salary;$('#paydayInput').value=data.payday;if($('#settingsCurrency'))$('#settingsCurrency').value=data.currency||'EGP';
 $('#addBudgetBtn').onclick=()=>openModal('budgetModal');$('#budgetForm').onsubmit=e=>{e.preventDefault();let category=$('#budgetCategory').value,amount=Number($('#budgetAmount').value);if(amount<=0)return;let old=data.budgets.find(b=>b.category===category);if(old)old.amount=amount;else data.budgets.push({id:uid(),category,amount});save();closeModals();refresh();toast('تم حفظ الميزانية');};
 $('#addGoalBtn').onclick=()=>openModal('goalModal');
 $('#depositSavingsBtn').onclick=()=>{openTransaction();setType('saving');$('#txTitle').value='إيداع في المدخرات';$('#txCategory').value='أخرى';};
 $('#withdrawSavingsBtn').onclick=()=>{openTransaction();setType('saving_withdrawal');$('#txTitle').value='سحب من المدخرات';$('#txCategory').value='أخرى';};$('#goalForm').onsubmit=e=>{e.preventDefault();let target=Number($('#goalTarget').value),current=Number($('#goalCurrent').value)||0;if(target<=0||current<0)return;data.goals.push({id:uid(),name:$('#goalName').value.trim(),target,current});save();closeModals();refresh();toast('تم إنشاء هدف الادخار');};
 $('#addDebtBtn').onclick=()=>openModal('debtModal');$('#debtForm').onsubmit=e=>{e.preventDefault();let amount=Number($('#debtAmount').value);if(amount<=0)return;data.debts.push({id:uid(),type:$('#debtType').value,person:$('#debtPerson').value.trim(),amount,due:$('#debtDue').value});save();closeModals();refresh();toast('تم تسجيل الدين');};
 $('#addBillBtn').onclick=()=>openModal('billModal');$('#billForm').onsubmit=e=>{e.preventDefault();const amount=Number($('#billAmount').value);if(!(amount>0))return toast('أدخل مبلغاً صحيحاً');data.bills.push({id:uid(),name:$('#billName').value.trim(),amount,category:$('#billCategory').value||'فواتير',dueDate:$('#billDueDate').value||dateISO(today),frequency:$('#billFrequency').value});save();$('#billForm').reset();closeModals();refresh();toast('تمت إضافة الفاتورة المتكررة');};
 $('#searchTransactions').oninput=renderTransactions;$('#typeFilter').onchange=renderTransactions;$('#monthFilter').onchange=renderTransactions;
 document.addEventListener('click',e=>{let b=e.target.closest('[data-edit]');if(b){let t=data.transactions.find(x=>x.id===b.dataset.edit);if(t)openTransaction(t);}let d=e.target.closest('[data-delete]');if(d)deleteTransaction(d.dataset.delete);
 let bd=e.target.closest('[data-budget-delete]');if(bd){data.budgets=data.budgets.filter(x=>x.id!==bd.dataset.budgetDelete);save();refresh();toast('تم حذف الميزانية');}
 let gd=e.target.closest('[data-goal-delete]');if(gd){data.goals=data.goals.filter(x=>x.id!==gd.dataset.goalDelete);save();refresh();}
 let ga=e.target.closest('[data-goal-add]');if(ga){let g=data.goals.find(x=>x.id===ga.dataset.goalAdd),v=Number(prompt('كم تريد إضافته إلى الهدف؟'));if(g&&v>0){g.current+=v;save();refresh();toast('تم تحديث المدخرات');}}
 let dd=e.target.closest('[data-debt-delete]');if(dd&&confirm('حذف سجل الدين؟')){data.debts=data.debts.filter(x=>x.id!==dd.dataset.debtDelete);save();refresh();}
 let bp=e.target.closest('[data-bill-paid]');if(bp)payBill(bp.dataset.billPaid);let bx=e.target.closest('[data-bill-delete]');if(bx&&confirm('حذف هذه الفاتورة المتكررة؟')){data.bills=data.bills.filter(x=>x.id!==bx.dataset.billDelete);save();refresh();}
 let pg=e.target.closest('[data-open]');if(pg){$('#salaryInput').value=data.salary;$('#paydayInput').value=data.payday;if($('#settingsCurrency'))$('#settingsCurrency').value=data.currency||'EGP';openModal(pg.dataset.open);}
 let day=e.target.closest('[data-day]');if(day){selectedCalendarDate=day.dataset.day;renderCalendar();}
 });
 $('#prevMonth').onclick=()=>{calendarDate.setMonth(calendarDate.getMonth()-1);renderCalendar()};$('#nextMonth').onclick=()=>{calendarDate.setMonth(calendarDate.getMonth()+1);renderCalendar()};
 $('#toggleBalance').onclick=()=>{balanceHidden=!balanceHidden;renderDashboard()};
 function toggleTheme(){data.theme=data.theme==='light'?'dark':'light';document.body.classList.toggle('light',data.theme==='light');save();}
 $('#themeToggle').onclick=toggleTheme;$('#settingsTheme').onclick=()=>{toggleTheme();toast('تم تغيير المظهر')};
 $('#settingsCurrency').onchange=()=>{data.currency=$('#settingsCurrency').value;save();refresh();toast('تم تحديث العملة المعروضة')};
 $('#settingsBtn').onclick=()=>openModal('settingsModal');$('#backupBtn').onclick=exportJSON;$('#exportBackup').onclick=exportJSON;$('#exportCsvBtn').onclick=exportCSV;
 $('#importBackup').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let imported=JSON.parse(await f.text());if(!Array.isArray(imported.transactions)||typeof imported.salary!=='number')throw Error();data={...defaultData,...imported};normalizeData();save();closeModals();refresh();toast('تم استيراد النسخة الاحتياطية');}catch{toast('ملف النسخة الاحتياطية غير صالح')}e.target.value='';};
 $('#resetData').onclick=()=>{if(confirm('تحذير: سيتم حذف جميع بياناتك نهائيًا من هذا المتصفح والحساب السحابي. هل أنت متأكد؟')){data={...defaultData};save();closeModals();refresh();$('#setupSalary').value='';$('#setupPayday').value=1;$('#setupCurrency').value='EGP';openModal('firstSetupModal');toast('أعد إعداد محفظتك من فضلك')}};
 $('#exportCsvBtn').onclick=exportCSV;
 $$('[data-open]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.open==='salaryModal'){ $('#salaryInput').value=data.salary;$('#paydayInput').value=data.payday;if($('#settingsCurrency'))$('#settingsCurrency').value=data.currency||'EGP';openModal('salaryModal');}}));
 refresh();
}

async function initCloudAuth(){
 const screen=$('#authScreen');
 const authMessage=$('#authMessage');
 const authSubmit=$('#authSubmit');
 const accountStatus=$('#accountStatus');
 const showAuth=(msg='')=>{
   screen.classList.add('show');
   authMessage.textContent=msg||'بياناتك المالية خاصة بحسابك ولا يراها مستخدم آخر.';
   authMessage.className='auth-message';
 };
 const hideAuth=()=>screen.classList.remove('show');
 const setAuthMessage=(msg,type='')=>{
   authMessage.textContent=msg;
   authMessage.className='auth-message'+(type?' '+type:'');
 };
 const setSubmit=(disabled,label)=>{
   authSubmit.disabled=disabled;
   authSubmit.textContent=label;
 };

 // تأكد من صحة إعدادات Supabase قبل إنشاء الاتصال.
 let validUrl=false;
 try{
   const parsed=new URL(SUPABASE_URL);
   validUrl=parsed.protocol==='https:' && parsed.hostname.endsWith('.supabase.co') && (parsed.pathname==='/' || parsed.pathname==='');
 }catch(_){ validUrl=false; }

 if(!window.supabase || !validUrl || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('YOUR_')){
   showAuth('إعدادات Supabase غير مكتملة أو رابط المشروع غير صحيح. راجع ملف config.js.');
   setSubmit(true,'أكمل إعداد Supabase أولاً');
   accountStatus.textContent='قاعدة البيانات غير مهيأة — راجع config.js';
   return;
 }

 try{
   supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
 }catch(error){
   console.error('Supabase initialization error:',error);
   showAuth('تعذر تهيئة الاتصال بـ Supabase. راجع رابط المشروع والمفتاح.');
   setSubmit(true,'تعذر الاتصال');
   return;
 }

 $('#googleLogin').onclick=()=>oauthLogin('google');$('#facebookLogin').onclick=()=>oauthLogin('facebook');
 $('#forgotPassword').onclick=async()=>{const email=$('#authEmail').value.trim();if(!email){setAuthMessage('اكتب بريدك الإلكتروني أولاً ثم اضغط نسيت كلمة المرور.','error');$('#authEmail').focus();return;}setSubmit(true,'جارٍ الإرسال...');try{const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:window.location.href.split('#')[0]});if(error)throw error;setAuthMessage('أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.','success');}catch(error){setAuthMessage(error.message||'تعذر إرسال رابط الاستعادة.','error');}finally{setSubmit(false,authMode==='login'?'تسجيل الدخول':'إنشاء الحساب');}};
 $('#authSwitch').onclick=()=>{
   authMode=authMode==='login'?'signup':'login';
   $('#authHeading').textContent=authMode==='login'?'مرحباً بعودتك':'إنشاء حساب جديد';
   $('#authSubtitle').textContent=authMode==='login'?'سجّل الدخول للوصول إلى بياناتك من أي جهاز.':'أنشئ حساباً لحفظ بياناتك ومزامنتها بين أجهزتك.';
   authSubmit.textContent=authMode==='login'?'تسجيل الدخول':'إنشاء الحساب';
   $('#authSwitch').textContent=authMode==='login'?'ليس لديك حساب؟ أنشئ حساباً جديداً':'لديك حساب بالفعل؟ سجّل الدخول';
   $('#authPassword').autocomplete=authMode==='login'?'current-password':'new-password';
   setAuthMessage('بياناتك المالية خاصة بحسابك ولا يراها مستخدم آخر.');
 };

 async function oauthLogin(provider){setSubmit(true,'جارٍ فتح '+(provider==='google'?'Google':'Facebook')+'...');try{const {error}=await supabaseClient.auth.signInWithOAuth({provider,options:{redirectTo:window.location.href.split('#')[0]}});if(error)throw error;}catch(error){setAuthMessage(error.message||'تعذر بدء تسجيل الدخول الاجتماعي. تحقق من إعدادات المزود في Supabase.','error');setSubmit(false,authMode==='login'?'تسجيل الدخول':'إنشاء الحساب');}}

 async function loadUserData(user){
   if(!user || loadingCloud)return;
   currentUser=user;
   cloudReady=false;
   loadingCloud=true;
   accountStatus.textContent='الحساب السحابي: '+(user.email||'متصل');if($('#profileEmail'))$('#profileEmail').textContent=user.email||'حسابك الشخصي';
   try{
     const {data:row,error}=await supabaseClient
       .from('user_finance_data')
       .select('data')
       .eq('user_id',user.id)
       .maybeSingle();
     if(error)throw error;

     if(row && row.data && typeof row.data==='object'){
       data={...defaultData,...row.data};
     }else{
       // أول تسجيل: احتفظ ببيانات الجهاز وارفعها إلى حساب المستخدم.
       let localData={};
       try{localData=JSON.parse(localStorage.getItem('myMoneyData')||'{}')||{};}catch(_){localData={};}
       data={...defaultData,...localData};
       const {error:upsertError}=await supabaseClient
         .from('user_finance_data')
         .upsert({user_id:user.id,data,updated_at:new Date().toISOString()},{onConflict:'user_id'});
       if(upsertError)throw upsertError;
     }

     normalizeData();
     localStorage.setItem('myMoneyData',JSON.stringify(data));
     cloudReady=true;
     hideAuth();
     refresh();
     if(data.onboardingCompleted!==true){if(data.salary>0||data.transactions.length>0){data.onboardingCompleted=true;save();}else{ $('#setupSalary').value=data.salary||'';$('#setupPayday').value=data.payday||1;$('#setupCurrency').value=data.currency||'EGP';openModal('firstSetupModal');}}
     toast('تمت مزامنة بياناتك السحابية');
   }catch(error){
     console.error('Cloud data error:',error);
     cloudReady=false;
     showAuth('تعذر تحميل بياناتك السحابية: '+(error.message||'خطأ غير معروف')+' — راجع الجدول وسياسات RLS في Supabase.');
   }finally{
     loadingCloud=false;
   }
 }

 $('#authForm').onsubmit=async e=>{
   e.preventDefault();
   const email=$('#authEmail').value.trim();
   const password=$('#authPassword').value;
   if(!email || !password){setAuthMessage('أدخل البريد الإلكتروني وكلمة المرور.','error');return;}
   if(password.length<6){setAuthMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل.','error');return;}

   setSubmit(true,'جارٍ الاتصال...');
   setAuthMessage('');
   try{
     let result;
     if(authMode==='login'){
       result=await supabaseClient.auth.signInWithPassword({email,password});
     }else{
       result=await supabaseClient.auth.signUp({
         email,
         password,
         options:{emailRedirectTo:window.location.href.split('#')[0]}
       });
     }
     if(result.error)throw result.error;

     if(authMode==='signup' && !result.data.session){
       setAuthMessage('تم إرسال رسالة تأكيد إلى بريدك الإلكتروني. افتح الرسالة وأكّد الحساب، ثم ارجع وسجّل الدخول.','success');
     }else if(result.data.session){
       setAuthMessage('تم الاتصال بنجاح، جارٍ تحميل بياناتك...','success');
       await loadUserData(result.data.user);
     }else{
       setAuthMessage('تم تنفيذ الطلب. إذا لم يتم تسجيل الدخول، تحقق من بريدك الإلكتروني.','success');
     }
   }catch(error){
     console.error('Authentication error:',error);
     setAuthMessage(error.message||'حدث خطأ أثناء الاتصال. حاول مرة أخرى.','error');
   }finally{
     setSubmit(false,authMode==='login'?'تسجيل الدخول':'إنشاء الحساب');
   }
 };

 // لا ننفذ عمليات قاعدة البيانات داخل callback الخاص بتغيير حالة المصادقة.
 supabaseClient.auth.onAuthStateChange((event,session)=>{
   if(event==='PASSWORD_RECOVERY'){openModal('passwordResetModal');}
   if(session?.user && ['SIGNED_IN','TOKEN_REFRESHED','INITIAL_SESSION','USER_UPDATED'].includes(event)){
     Promise.resolve().then(()=>loadUserData(session.user));
   }else if(event==='SIGNED_OUT'){
     currentUser=null;
     cloudReady=false;
     accountStatus.textContent='غير مسجل الدخول';if($('#profileEmail'))$('#profileEmail').textContent='مساحة مالية شخصية';
     showAuth();
   }
 });

 try{
   const {data:{session},error}=await supabaseClient.auth.getSession();
   if(error)throw error;
   if(session?.user){await loadUserData(session.user);}
   else{
     currentUser=null;
     cloudReady=false;
     accountStatus.textContent='غير مسجل الدخول';if($('#profileEmail'))$('#profileEmail').textContent='مساحة مالية شخصية';
     showAuth();
   }
 }catch(error){
   console.error('Session error:',error);
   showAuth('تعذر التحقق من جلسة الدخول: '+(error.message||'حاول تحديث الصفحة.'));
 }

 $('#passwordResetForm').onsubmit=async e=>{e.preventDefault();const password=$('#newPassword').value;if(password.length<8){toast('استخدم كلمة مرور من 8 أحرف على الأقل');return;}try{const {error}=await supabaseClient.auth.updateUser({password});if(error)throw error;closeModals();toast('تم تحديث كلمة المرور');}catch(error){toast(error.message||'تعذر تحديث كلمة المرور');}};
 $('#signOutBtn').onclick=async()=>{
   if(!confirm('هل تريد تسجيل الخروج من حسابك؟'))return;
   try{
     const {error}=await supabaseClient.auth.signOut();
     if(error)throw error;
     closeModals();
     toast('تم تسجيل الخروج');
   }catch(error){
     console.error('Sign out error:',error);
     toast('تعذر تسجيل الخروج: '+(error.message||'حاول مرة أخرى'));
   }
 };
}

setup();
initCloudAuth();
