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
const defaultData = {salary:0,payday:1,savingsOpeningBalance:0,transactions:[],budgets:[],goals:[],debts:[],theme:'dark'};
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
 if($('#currentSavingsBalance'))$('#currentSavingsBalance').innerHTML=money(st.balance)+' <small>ج.م</small>';
 if($('#savingsDeposits'))$('#savingsDeposits').textContent=money(st.deposits+Number(data.savingsOpeningBalance||0))+' ج.م';
 if($('#savingsWithdrawals'))$('#savingsWithdrawals').textContent=money(st.withdrawals)+' ج.م';
}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2400);}
function monthTx(){return data.transactions.filter(t=>t.date?.slice(0,7)===monthKey(today));}
function sums(list=monthTx()){return list.reduce((a,t)=>{if(t.type==='income')a.income+=t.amount;else if(t.type==='expense')a.expense+=t.amount;else if(t.type==='saving')a.saving+=t.amount;else if(t.type==='saving_withdrawal')a.savingWithdrawal+=t.amount;return a;},{income:0,expense:0,saving:0,savingWithdrawal:0});}
function available(){const s=sums();return data.salary+s.income-s.expense-s.saving+s.savingWithdrawal;}
function fmtDate(v){if(!v)return '';return new Date(v+'T12:00:00').toLocaleDateString('ar-EG',{day:'numeric',month:'short',year:'numeric'});}
function getDaysLeft(){let p=Math.max(1,Math.min(31,Number(data.payday)||1));let next=new Date(today.getFullYear(),today.getMonth(),p);if(next<=today)next=new Date(today.getFullYear(),today.getMonth()+1,p);return Math.max(1,Math.ceil((next-today)/86400000));}
function renderDashboard(){
 const s=sums(), avail=available(), inc=data.salary+s.income, spentPct=inc>0?(s.expense/inc*100):0;
 $('#availableBalance').textContent=balanceHidden?'••••••':money(avail);$('#totalIncome').textContent=money(inc)+' ج.م';$('#totalExpenses').textContent=money(s.expense)+' ج.م';$('#totalSavings').textContent=money(savingsTotals().balance)+' ج.م';
 $('#salaryValue').textContent=money(data.salary)+' ج.م';$('#dailyAverage').textContent=money(s.expense/Math.max(1,today.getDate()))+' ج.م';$('#dailyAllowance').textContent='الحد اليومي: '+money(Math.max(0,avail)/getDaysLeft())+' ج.م';
 $('#spentPercent').textContent=Math.round(spentPct)+'%';$('#spentProgress').style.width=Math.min(100,spentPct)+'%';
 $('#debtValue').textContent=money(data.debts.filter(d=>d.type==='owe').reduce((a,d)=>a+d.amount,0))+' ج.م';
 $('#todayLabel').textContent=today.toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'});
 const recent=[...data.transactions].sort((a,b)=>b.date.localeCompare(a.date)||b.created-b.created).slice(0,5);
 $('#recentTransactions').innerHTML=recent.length?recent.map(txHTML).join(''):'<div class="empty-state">لا توجد عمليات بعد. أضف أول عملية مالية لتبدأ المتابعة.</div>';
 const expenses=monthTx().filter(t=>t.type==='expense');const byCat={};expenses.forEach(t=>byCat[t.category]=(byCat[t.category]||0)+t.amount);
 const top=Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0];
 $('#smartTip').textContent=top?`أعلى تصنيف إنفاق لديك هذا الشهر هو ${top[0]}. راجع مشترياتك فيه لتجد فرصة للتوفير.`:'ابدأ بتسجيل مصروفاتك اليومية لتحصل على صورة أوضح عن أموالك.';
 renderCharts();
}
function txHTML(t){let positive=['income','saving_withdrawal'].includes(t.type), sign=positive?'+':'−', cls=positive?'positive':'negative', icon=t.type==='income'?'↗':(t.type==='saving'?'♧':(t.type==='saving_withdrawal'?'↘':(ICONS[t.category]||'✦')));return `<div class="transaction-item"><div class="tx-icon">${icon}</div><div class="tx-info"><b>${esc(t.title)}</b><small>${esc(t.category||'عام')} · ${fmtDate(t.date)}</small></div><div class="tx-amount ${cls}">${sign}${money(t.amount)} ج.م</div><div class="tx-actions"><button class="tiny-btn" data-edit="${t.id}">تعديل</button><button class="tiny-btn" data-delete="${t.id}">حذف</button></div></div>`;}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderTransactions(){let q=$('#searchTransactions').value.trim().toLowerCase(),type=$('#typeFilter').value,month=$('#monthFilter').value;let list=[...data.transactions].filter(t=>(type==='all'||t.type===type)&&(month==='all'||t.date.slice(0,7)===monthKey(today))&&(`${t.title} ${t.category} ${t.amount}`.toLowerCase().includes(q))).sort((a,b)=>b.date.localeCompare(a.date)||b.created-a.created);$('#allTransactions').innerHTML=list.length?list.map(txHTML).join(''):'<div class="empty-state">لا توجد عمليات تطابق البحث.</div>';}
function renderBudgets(){const list=data.budgets;$('#budgetList').innerHTML=list.length?list.map(b=>{let used=monthTx().filter(t=>t.type==='expense'&&t.category===b.category).reduce((a,t)=>a+t.amount,0),p=used/b.amount*100;return `<article class="budget-card glass"><div class="budget-top"><b>${ICONS[b.category]||'✦'} ${esc(b.category)}</b><button class="tiny-btn" data-budget-delete="${b.id}">حذف</button></div><p>ميزانيتك الشهرية لهذا التصنيف</p><div class="budget-numbers"><b>${money(used)} ج.م</b><span>من ${money(b.amount)} ج.م</span></div><div class="budget-progress"><span style="width:${Math.min(100,p)}%;background:${p>100?'#ff7887':''}"></span></div><p>${p>100?'تجاوزت الميزانية بنسبة '+Math.round(p-100)+'%':'استهلكت '+Math.round(p)+'% من الميزانية'}</p></article>`}).join(''):'<div class="panel glass empty-state">لم تضف ميزانيات بعد. أنشئ ميزانية لتتحكم في إنفاقك.</div>';}
function renderGoals(){renderSavingsBalance();$('#savingsList').innerHTML=data.goals.length?data.goals.map(g=>{let p=Math.min(100,g.current/g.target*100);return `<article class="goal-card glass"><div class="goal-top"><b>♧ ${esc(g.name)}</b><button class="tiny-btn" data-goal-add="${g.id}">＋ إضافة مبلغ</button></div><p>هدفك المالي القادم</p><strong>${money(g.current)} <small style="color:var(--muted)">من ${money(g.target)} ج.م</small></strong><div class="goal-progress"><span style="width:${p}%"></span></div><div class="goal-meta"><span>${Math.round(p)}% مكتمل</span><span>متبقي ${money(Math.max(0,g.target-g.current))} ج.م</span></div><button class="text-action" data-goal-delete="${g.id}">حذف الهدف</button></article>`}).join(''):'<div class="panel glass empty-state">لا توجد أهداف ادخار حتى الآن. ما الشيء الذي تريد توفير المال من أجله؟</div>';}
function renderDebts(){let owe=data.debts.filter(d=>d.type==='owe').reduce((a,d)=>a+d.amount,0),owed=data.debts.filter(d=>d.type==='owed').reduce((a,d)=>a+d.amount,0);$('#owedByMe').textContent=money(owe)+' ج.م';$('#owedToMe').textContent=money(owed)+' ج.م';$('#debtList').innerHTML=data.debts.length?data.debts.map(d=>`<article class="debt-card"><div class="debt-top"><b>${esc(d.person)}</b><button class="tiny-btn" data-debt-delete="${d.id}">حذف</button></div><p>${d.type==='owe'?'دين عليك':'مبلغ لك عند شخص'} ${d.due?'· الاستحقاق '+fmtDate(d.due):''}</p><div class="debt-amount ${d.type==='owe'?'negative':'positive'}">${money(d.amount)} ج.م</div><p>${d.type==='owe'?'التزام مالي مسجل':'مبلغ مستحق لك'}</p></article>`).join(''):'<div class="panel glass empty-state">لا توجد ديون مسجلة. ممتاز!</div>';}
function renderReports(){let s=sums(),inc=data.salary+s.income,by={};monthTx().filter(t=>t.type==='expense').forEach(t=>by[t.category]=(by[t.category]||0)+t.amount);$('#reportIncome').textContent=money(inc)+' ج.م';$('#reportExpense').textContent=money(s.expense)+' ج.م';$('#reportNet').textContent=money(available())+' ج.م';$('#topCategory').textContent=Object.entries(by).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';}
function chartDefaults(){return {responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#10192b',titleColor:'#fff',bodyColor:'#dce8f0',padding:10,displayColors:true}},scales:{x:{grid:{display:false},ticks:{color:'#8e9ab4',font:{family:'Cairo',size:10}}},y:{grid:{color:'rgba(140,160,190,.12)'},ticks:{color:'#8e9ab4',font:{family:'Cairo',size:9}}}}};}
function renderCharts(){if(!window.Chart)return;const week=[];for(let i=6;i>=0;i--){let d=new Date(today);d.setDate(today.getDate()-i);let key=dateISO(d),val=data.transactions.filter(t=>t.type==='expense'&&t.date===key).reduce((a,t)=>a+t.amount,0);week.push({label:d.toLocaleDateString('ar-EG',{weekday:'short'}),value:val});}
 if(weeklyChart)weeklyChart.destroy();weeklyChart=new Chart($('#weeklyChart'),{type:'line',data:{labels:week.map(x=>x.label),datasets:[{data:week.map(x=>x.value),borderColor:'#62e6b1',backgroundColor:'rgba(98,230,177,.12)',fill:true,tension:.4,pointRadius:3,pointBackgroundColor:'#62e6b1'}]},options:chartDefaults()});
 let cats={};monthTx().filter(t=>t.type==='expense').forEach(t=>cats[t.category]=(cats[t.category]||0)+t.amount);let entries=Object.entries(cats);
 if(categoryChart)categoryChart.destroy();categoryChart=new Chart($('#categoryChart'),{type:'doughnut',data:{labels:entries.map(e=>e[0]),datasets:[{data:entries.map(e=>e[1]),backgroundColor:entries.map((e,i)=>COLORS[i%COLORS.length]),borderColor:'transparent',hoverOffset:5}]},options:{responsive:true,maintainAspectRatio:false,cutout:'72%',plugins:{legend:{display:false}}}});
 $('#categoryLegend').innerHTML=entries.slice(0,5).map((e,i)=>`<span class="legend-item"><i class="legend-dot" style="background:${COLORS[i%COLORS.length]}"></i>${esc(e[0])}</span>`).join('');
 let months=[];for(let i=5;i>=0;i--){let d=new Date(today.getFullYear(),today.getMonth()-i,1),key=monthKey(d),ts=data.transactions.filter(t=>t.date.startsWith(key));months.push({label:d.toLocaleDateString('ar-EG',{month:'short'}),income:(key===monthKey(today)?data.salary:0)+ts.filter(t=>t.type==='income').reduce((a,t)=>a+t.amount,0),expense:ts.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amount,0)});}
 if(monthlyChart)monthlyChart.destroy();monthlyChart=new Chart($('#monthlyChart'),{type:'bar',data:{labels:months.map(m=>m.label),datasets:[{label:'الدخل',data:months.map(m=>m.income),backgroundColor:'#62e6b1',borderRadius:6},{label:'المصروفات',data:months.map(m=>m.expense),backgroundColor:'#71a7ff',borderRadius:6}]},options:{...chartDefaults(),plugins:{...chartDefaults().plugins,legend:{display:true,labels:{color:'#9aa8ba',font:{family:'Cairo'}}}}}});
}
function renderCalendar(){let y=calendarDate.getFullYear(),m=calendarDate.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate();$('#calendarMonth').textContent=calendarDate.toLocaleDateString('ar-EG',{month:'long',year:'numeric'});let labels=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];let html=labels.map(x=>`<div class="calendar-cell head">${x}</div>`).join('');for(let i=0;i<first;i++)html+='<div></div>';for(let day=1;day<=days;day++){let d=dateISO(new Date(y,m,day)),has=data.transactions.some(t=>t.date===d);html+=`<button class="calendar-cell ${d===selectedCalendarDate?'selected':''} ${has?'has-data':''}" data-day="${d}">${day}</button>`;}$('#calendarGrid').innerHTML=html;let list=data.transactions.filter(t=>t.date===selectedCalendarDate);$('#selectedDayDetails').innerHTML=`<b>${fmtDate(selectedCalendarDate)}</b><div style="margin-top:8px">${list.length?list.map(t=>`${esc(t.title)}: ${t.type==='income'?'+':'−'}${money(t.amount)} ج.م`).join('<br>'):'لا توجد عمليات مسجلة في هذا اليوم.'}</div>`;}
function refresh(){renderDashboard();renderTransactions();renderBudgets();renderGoals();renderDebts();renderReports();if($('#page-calendar').classList.contains('active'))renderCalendar();}
function showPage(name){if(name==='settings'){openModal('settingsModal');return;}$$('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+name));$$('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===name));let names={dashboard:'الرئيسية',transactions:'العمليات المالية',budgets:'الميزانيات',savings:'المدخرات',debts:'الديون',reports:'التقارير',calendar:'التقويم المالي'};$('#pageTitle').textContent=names[name]||'الرئيسية';if(name==='calendar')renderCalendar();if(name==='reports')renderReports();window.scrollTo({top:0,behavior:'smooth'});}
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
 fillCategories();$('#txDate').value=dateISO(today);document.body.classList.toggle('light',data.theme==='light');
 $$('[data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
 $('#mobileAdd').onclick=()=>openTransaction();$('#quickExpense').onclick=()=>openTransaction();$('#addTransactionBtn').onclick=()=>openTransaction();$('#addTransactionBtn2').onclick=()=>openTransaction();
 $('#closeModal').onclick=closeModals;$$('.close-generic').forEach(b=>b.onclick=closeModals);$$('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModals()}));
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
 $('#salaryForm').onsubmit=e=>{e.preventDefault();data.salary=Number($('#salaryInput').value)||0;data.payday=Math.max(1,Math.min(31,Number($('#paydayInput').value)||1));save();closeModals();refresh();toast('تم حفظ الراتب');};
 $('#salaryInput').value=data.salary;$('#paydayInput').value=data.payday;
 $('#addBudgetBtn').onclick=()=>openModal('budgetModal');$('#budgetForm').onsubmit=e=>{e.preventDefault();let category=$('#budgetCategory').value,amount=Number($('#budgetAmount').value);if(amount<=0)return;let old=data.budgets.find(b=>b.category===category);if(old)old.amount=amount;else data.budgets.push({id:uid(),category,amount});save();closeModals();refresh();toast('تم حفظ الميزانية');};
 $('#addGoalBtn').onclick=()=>openModal('goalModal');
 $('#depositSavingsBtn').onclick=()=>{openTransaction();setType('saving');$('#txTitle').value='إيداع في المدخرات';$('#txCategory').value='أخرى';};
 $('#withdrawSavingsBtn').onclick=()=>{openTransaction();setType('saving_withdrawal');$('#txTitle').value='سحب من المدخرات';$('#txCategory').value='أخرى';};$('#goalForm').onsubmit=e=>{e.preventDefault();let target=Number($('#goalTarget').value),current=Number($('#goalCurrent').value)||0;if(target<=0||current<0)return;data.goals.push({id:uid(),name:$('#goalName').value.trim(),target,current});save();closeModals();refresh();toast('تم إنشاء هدف الادخار');};
 $('#addDebtBtn').onclick=()=>openModal('debtModal');$('#debtForm').onsubmit=e=>{e.preventDefault();let amount=Number($('#debtAmount').value);if(amount<=0)return;data.debts.push({id:uid(),type:$('#debtType').value,person:$('#debtPerson').value.trim(),amount,due:$('#debtDue').value});save();closeModals();refresh();toast('تم تسجيل الدين');};
 $('#searchTransactions').oninput=renderTransactions;$('#typeFilter').onchange=renderTransactions;$('#monthFilter').onchange=renderTransactions;
 document.addEventListener('click',e=>{let b=e.target.closest('[data-edit]');if(b){let t=data.transactions.find(x=>x.id===b.dataset.edit);if(t)openTransaction(t);}let d=e.target.closest('[data-delete]');if(d)deleteTransaction(d.dataset.delete);
 let bd=e.target.closest('[data-budget-delete]');if(bd){data.budgets=data.budgets.filter(x=>x.id!==bd.dataset.budgetDelete);save();refresh();toast('تم حذف الميزانية');}
 let gd=e.target.closest('[data-goal-delete]');if(gd){data.goals=data.goals.filter(x=>x.id!==gd.dataset.goalDelete);save();refresh();}
 let ga=e.target.closest('[data-goal-add]');if(ga){let g=data.goals.find(x=>x.id===ga.dataset.goalAdd),v=Number(prompt('كم تريد إضافته إلى الهدف؟'));if(g&&v>0){g.current+=v;save();refresh();toast('تم تحديث المدخرات');}}
 let dd=e.target.closest('[data-debt-delete]');if(dd&&confirm('حذف سجل الدين؟')){data.debts=data.debts.filter(x=>x.id!==dd.dataset.debtDelete);save();refresh();}
 let pg=e.target.closest('[data-open]');if(pg){$('#salaryInput').value=data.salary;$('#paydayInput').value=data.payday;openModal(pg.dataset.open);}
 let day=e.target.closest('[data-day]');if(day){selectedCalendarDate=day.dataset.day;renderCalendar();}
 });
 $('#prevMonth').onclick=()=>{calendarDate.setMonth(calendarDate.getMonth()-1);renderCalendar()};$('#nextMonth').onclick=()=>{calendarDate.setMonth(calendarDate.getMonth()+1);renderCalendar()};
 $('#toggleBalance').onclick=()=>{balanceHidden=!balanceHidden;renderDashboard()};
 function toggleTheme(){data.theme=data.theme==='light'?'dark':'light';document.body.classList.toggle('light',data.theme==='light');save();}
 $('#themeToggle').onclick=toggleTheme;$('#settingsTheme').onclick=()=>{toggleTheme();toast('تم تغيير المظهر')};
 $('#settingsBtn').onclick=()=>openModal('settingsModal');$('#backupBtn').onclick=exportJSON;$('#exportBackup').onclick=exportJSON;$('#exportCsvBtn').onclick=exportCSV;
 $('#importBackup').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let imported=JSON.parse(await f.text());if(!Array.isArray(imported.transactions)||typeof imported.salary!=='number')throw Error();data={...defaultData,...imported};save();closeModals();refresh();toast('تم استيراد النسخة الاحتياطية');}catch{toast('ملف النسخة الاحتياطية غير صالح')}e.target.value='';};
 $('#resetData').onclick=()=>{if(confirm('تحذير: سيتم حذف جميع بياناتك نهائيًا من هذا المتصفح. هل أنت متأكد؟')){data={...defaultData};save();closeModals();refresh();toast('تمت إعادة ضبط التطبيق')}};
 $('#exportCsvBtn').onclick=exportCSV;
 $$('[data-open]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.open==='salaryModal'){ $('#salaryInput').value=data.salary;$('#paydayInput').value=data.payday;openModal('salaryModal');}}));
 refresh();
}

async function initCloudAuth(){
 const screen=$('#authScreen');
 const showAuth=(msg='')=>{screen.classList.add('show');$('#authMessage').textContent=msg||'بياناتك المالية خاصة بحسابك ولا يراها مستخدم آخر.';$('#authMessage').className='auth-message';};
 const hideAuth=()=>screen.classList.remove('show');
 if(!window.supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes('YOUR_') || SUPABASE_ANON_KEY.includes('YOUR_')){
   showAuth('أضف رابط Supabase ومفتاح anon داخل ملف config.js ثم أعد تحميل الصفحة.');
   $('#authSubmit').disabled=true;
   $('#authSubmit').textContent='أكمل إعداد Supabase أولاً';
   $('#accountStatus').textContent='قاعدة البيانات غير مهيأة — راجع config.js';
   return;
 }
 supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
 $('#authSwitch').onclick=()=>{
   authMode=authMode==='login'?'signup':'login';
   $('#authHeading').textContent=authMode==='login'?'مرحباً بعودتك':'إنشاء حساب جديد';
   $('#authSubtitle').textContent=authMode==='login'?'سجّل الدخول للوصول إلى بياناتك من أي جهاز.':'أنشئ حساباً لحفظ بياناتك ومزامنتها بين أجهزتك.';
   $('#authSubmit').textContent=authMode==='login'?'تسجيل الدخول':'إنشاء الحساب';
   $('#authSwitch').textContent=authMode==='login'?'ليس لديك حساب؟ أنشئ حساباً جديداً':'لديك حساب بالفعل؟ سجّل الدخول';
   $('#authPassword').autocomplete=authMode==='login'?'current-password':'new-password';
 };
 $('#authForm').onsubmit=async e=>{
   e.preventDefault();const email=$('#authEmail').value.trim(),password=$('#authPassword').value;
   $('#authSubmit').disabled=true;$('#authSubmit').textContent='جارٍ الاتصال...';
   let result=authMode==='login'?await supabaseClient.auth.signInWithPassword({email,password}):await supabaseClient.auth.signUp({email,password});
   $('#authSubmit').disabled=false;$('#authSubmit').textContent=authMode==='login'?'تسجيل الدخول':'إنشاء الحساب';
   if(result.error){$('#authMessage').textContent=result.error.message;$('#authMessage').className='auth-message error';}
   else if(authMode==='signup'&&!result.data.session){$('#authMessage').textContent='تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتأكيده، ثم سجّل الدخول.';$('#authMessage').className='auth-message success';}
   else $('#authMessage').textContent='تم بنجاح، جارٍ تحميل بياناتك...';
 };
 supabaseClient.auth.onAuthStateChange(async(_event,session)=>{
   if(session?.user){
     currentUser=session.user;cloudReady=false;loadingCloud=true;
     $('#accountStatus').textContent='الحساب السحابي: '+currentUser.email;
     const {data:row,error}=await supabaseClient.from('user_finance_data').select('data').eq('user_id',currentUser.id).maybeSingle();
     if(error){console.error(error);$('#authMessage').textContent='تعذر قراءة قاعدة البيانات: '+error.message;$('#authMessage').className='auth-message error';showAuth('تأكد من تنفيذ SQL وسياسات الحماية في Supabase.');loadingCloud=false;return;}
     if(row?.data){data={...defaultData,...row.data};}
     else {
       // أول دخول: ارفع بيانات هذا المتصفح إلى حساب المستخدم إن وجدت.
       data={...defaultData,...JSON.parse(localStorage.getItem('myMoneyData')||'{}')};
       const {error:upErr}=await supabaseClient.from('user_finance_data').upsert({user_id:currentUser.id,data,updated_at:new Date().toISOString()},{onConflict:'user_id'});
       if(upErr){console.error(upErr);showAuth('تعذر إنشاء سجل بياناتك. راجع SQL وسياسات RLS.');loadingCloud=false;return;}
     }
     localStorage.setItem('myMoneyData',JSON.stringify(data));loadingCloud=false;cloudReady=true;
     hideAuth();refresh();toast('تمت مزامنة بياناتك السحابية');
   }else{
     currentUser=null;cloudReady=false;$('#accountStatus').textContent='غير مسجل الدخول';showAuth();
   }
 });
 const {data:{session}}=await supabaseClient.auth.getSession();
 if(session?.user){
   // onAuthStateChange handles initial session; avoid duplicate loading
 }else showAuth();
 $('#signOutBtn').onclick=async()=>{if(confirm('هل تريد تسجيل الخروج من حسابك؟')){await supabaseClient.auth.signOut();closeModals();}};
}

setup();
initCloudAuth();
