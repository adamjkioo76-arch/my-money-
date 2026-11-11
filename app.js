// =========================================================
// MY MONEY 4.0 — Main Application Engine
// =========================================================
const sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const state = {
  user: null,
  profile: null,
  settings: null,
  categories: [],
  currentPage: 'dashboard',
  authMode: 'login',
  charts: {},
};

const CURRENCIES = { EGP:'ج.م', USD:'$', EUR:'€', SAR:'ر.س', AED:'د.إ', KWD:'د.ك' };

// ================= UTILS =================
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];

function fmt(amount, currency) {
  const cur = currency || state.settings?.base_currency || 'EGP';
  const num = Number(amount || 0);
  return `${num.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2})} ${CURRENCIES[cur] || cur}`;
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ar-EG', { year:'numeric', month:'short', day:'numeric' });
}

function today() { return new Date().toISOString().split('T')[0]; }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; }

function toast(msg, type='success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showLoading(show) {
  $('#loading-screen').classList.toggle('hidden', !show);
}

function hideBalances() { return state.settings?.hide_balances; }
function maskValue(v) { return hideBalances() ? '******' : v; }

// ================= MODALS =================
function openModal(title, contentHtml, footerHtml) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">${contentHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    </div>`;
}
function closeModal() { $('#modal-root').innerHTML = ''; }

function confirmDialog(message, onConfirm, isDanger = true) {
  openModal('تأكيد العملية',
    `<p style="line-height:1.7; font-weight:600;">${message}</p>`,
    `<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
     <button class="btn ${isDanger ? 'btn-danger' : 'btn-primary'}" id="confirm-yes">تأكيد</button>`
  );
  $('#confirm-yes').onclick = () => { closeModal(); onConfirm(); };
}

// ================= AUTHENTICATION =================
function togglePassword() {
  const p = $('#auth-password');
  p.type = p.type === 'password' ? 'text' : 'password';
}

function toggleAuthMode(e) {
  e.preventDefault();
  state.authMode = state.authMode === 'login' ? 'signup' : 'login';
  const isLogin = state.authMode === 'login';
  $('#auth-title').textContent = isLogin ? 'تسجيل الدخول' : 'إنشاء حساب';
  $('#auth-sub').textContent = isLogin ? 'مرحباً بك مجدداً 👋' : 'خطوات بسيطة ونبدأ 🚀';
  $('#name-field').style.display = isLogin ? 'none' : 'block';
  $('#auth-submit').textContent = isLogin ? 'تسجيل الدخول' : 'إنشاء الحساب';
  $('#auth-switch-text').textContent = isLogin ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟';
  $('#auth-switch-link').textContent = isLogin ? 'إنشاء حساب جديد' : 'تسجيل الدخول';
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const name = $('#auth-name').value.trim();

  if (state.authMode === 'signup' && !name) return toast('الاسم مطلوب', 'error');
  if (password.length < 6) return toast('كلمة المرور 6 أحرف على الأقل', 'error');

  showLoading(true);
  try {
    if (state.authMode === 'signup') {
      const { error } = await sb.auth.signUp({
        email, password,
        options: { data: { full_name: name } }
      });
      if (error) throw error;
      toast('تم إنشاء الحساب بنجاح ✅', 'success');
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function oauthLogin(provider) {
  const { error } = await sb.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin }
  });
  if (error) toast(error.message, 'error');
}

async function signOut() {
  await sb.auth.signOut();
  state.user = null; state.profile = null; state.settings = null;
  showAuth();
}

async function showForgotPassword(e) {
  e.preventDefault();
  openModal('استعادة كلمة المرور',
    `<p class="muted mb-4">أدخل بريدك وسنرسل لك رابط إعادة التعيين</p>
     <div class="form-group"><input type="email" id="reset-email" placeholder="you@example.com" class="input"></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
     <button class="btn btn-primary" id="reset-btn">إرسال</button>`
  );
  $('#reset-btn').onclick = async () => {
    const email = $('#reset-email').value.trim();
    if (!email) return toast('أدخل البريد', 'error');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    closeModal();
    if (error) toast(error.message, 'error');
    else toast('تم إرسال رابط الاستعادة إلى بريدك ✅', 'success');
  };
}

// ================= BOOTSTRAP & AUTOMATION =================
async function bootstrap() {
  showLoading(true);
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) await loadUser(session.user);
    else showAuth();
  } catch (e) {
    console.error(e);
    showAuth();
  } finally {
    showLoading(false);
  }
}

async function loadUser(user) {
  state.user = user;
  const [profRes, setRes, catRes] = await Promise.all([
    sb.from('profiles').select('*').eq('id', user.id).single(),
    sb.from('user_settings').select('*').eq('user_id', user.id).single(),
    sb.from('categories').select('*').or(`user_id.eq.${user.id},user_id.is.null`),
  ]);
  state.profile = profRes.data;
  state.settings = setRes.data;
  state.categories = catRes.data || [];

  if (state.settings?.theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

  // تنفيذ الفحص الآلي لتحويل المدخرات بعد 30 يوماً
  await checkAndExecuteSalaryCycleAutomation();

  if (!state.settings?.onboarding_completed) {
    showOnboarding();
  } else {
    showApp();
  }
}

function showAuth() {
  $('#auth-view').classList.remove('hidden');
  $('#onboarding-view').classList.add('hidden');
  $('#app-view').classList.add('hidden');
}
function showOnboarding() {
  $('#auth-view').classList.add('hidden');
  $('#onboarding-view').classList.remove('hidden');
  $('#app-view').classList.add('hidden');
}
function showApp() {
  $('#auth-view').classList.add('hidden');
  $('#onboarding-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  updateGreeting();
  updatePrivacyIcon();
  lucide.createIcons();
  navigate('dashboard');
}

// ================= AUTOMATED SALARY SAVINGS CYCLE (30 DAYS) =================
async function checkAndExecuteSalaryCycleAutomation() {
  if (!state.user) return;
  const nowStr = today();

  // الحصول على أحدث سجل راتب لم يتم تحويل متبقيه إلى المدخرات
  const { data: activeSalary } = await sb.from('salaries')
    .select('*')
    .eq('user_id', state.user.id)
    .eq('savings_transferred', false)
    .order('payment_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activeSalary) return;

  const paymentDate = new Date(activeSalary.payment_date);
  const cycleEndDate = activeSalary.cycle_end_date 
    ? new Date(activeSalary.cycle_end_date)
    : new Date(paymentDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  const todayDate = new Date();

  // 1. التنبيه قبل نهاية الدورة
  const diffDays = Math.ceil((cycleEndDate - todayDate) / (1000 * 60 * 60 * 24));
  if (diffDays > 0 && diffDays <= 3) {
    createSystemNotification('اقتراب موعد تحويل المدخرات ⏳', `متبقي ${diffDays} أيام على انتهاء دورة الراتب وتحويل المبلغ المتبقي للمدخرات.`);
  }

  // 2. انتهاء 30 يوماً والتحويل التلقائي
  if (todayDate >= cycleEndDate) {
    // حساب المصروفات خلال فترة الـ 30 يوماً
    const { data: cycleExpenses } = await sb.from('transactions')
      .select('amount')
      .eq('user_id', state.user.id)
      .gte('transaction_date', activeSalary.payment_date)
      .lte('transaction_date', cycleEndDate.toISOString().split('T')[0]);

    const spent = (cycleExpenses || []).reduce((sum, item) => sum + Number(item.amount), 0);
    const remainingToSave = Math.max(0, Number(activeSalary.amount) - spent);

    if (remainingToSave > 0) {
      // إيجاد أو إنشاء هدف ادخاري افتراضي ("مدخرات تحويل الراتب")
      let goalId = null;
      const { data: defaultGoal } = await sb.from('savings_goals')
        .select('id')
        .eq('user_id', state.user.id)
        .eq('name', 'مدخرات تحويل الراتب تلقائياً')
        .maybeSingle();

      if (defaultGoal) {
        goalId = defaultGoal.id;
      } else {
        const { data: newGoal } = await sb.from('savings_goals').insert({
          user_id: state.user.id,
          name: 'مدخرات تحويل الراتب تلقائياً',
          target_amount: 100000,
          currency: state.settings?.base_currency || 'EGP'
        }).select().single();
        if (newGoal) goalId = newGoal.id;
      }

      if (goalId) {
        // إضافة المساهمة
        await sb.from('savings_contributions').insert({
          user_id: state.user.id,
          goal_id: goalId,
          amount: remainingToSave,
          note: `تحويل تلقائي لمتبقي راتب دورة ${fmtDate(activeSalary.payment_date)}`,
          contribution_date: nowStr
        });

        // سجل عمليات التحويل
        await sb.from('salary_savings_transfers').insert({
          user_id: state.user.id,
          salary_id: activeSalary.id,
          amount: remainingToSave,
          transfer_date: nowStr
        });
      }
    }

    // تحديث حالة الراتب لمنع تكرار التحويل
    await sb.from('salaries').update({
      savings_transferred: true,
      remaining_transferred_amount: remainingToSave
    }).eq('id', activeSalary.id);

    createSystemNotification('تم تحويل المدخرات تلقائياً 🎉', `تم تحويل متبقي الراتب (${fmt(remainingToSave)}) تلقائياً إلى حساب المدخرات بعد مرور 30 يوماً.`);
  }
}

async function createSystemNotification(title, message) {
  if (!state.user) return;
  await sb.from('notifications').insert({
    user_id: state.user.id, title, message
  });
}

// ================= ONBOARDING =================
function onboardingNext(step) {
  [1,2,3].forEach(i => {
    $(`#onboarding-step-${i}`).classList.toggle('hidden', i !== step);
    $(`.onboarding-progress .dot[data-step="${i}"]`).classList.toggle('active', i <= step);
  });
  if (step === 3) {
    const cur = $('#onboarding-currency').value;
    $('#onboarding-salary-currency').textContent = CURRENCIES[cur] || cur;
  }
}

async function finishOnboarding(skip = false) {
  const currency = $('#onboarding-currency').value;
  const salaryAmount = parseFloat($('#onboarding-salary').value);

  showLoading(true);
  try {
    await sb.from('user_settings').update({
      base_currency: currency,
      onboarding_completed: true,
    }).eq('user_id', state.user.id);
    state.settings.base_currency = currency;
    state.settings.onboarding_completed = true;

    if (!skip && salaryAmount > 0) {
      const payDate = today();
      const cycleEnd = new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await sb.from('salaries').insert({
        user_id: state.user.id,
        amount: salaryAmount,
        currency,
        payment_date: payDate,
        salary_month: monthStart(),
        cycle_end_date: cycleEnd,
        savings_transferred: false
      });
      createSystemNotification('تسجيل الراتب 💵', `تم تسجيل راتبك الشهري بقيمة ${fmt(salaryAmount, currency)}.`);
    }
    showApp();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ================= PRIVACY, THEME & SETTINGS =================
async function toggleTheme() {
  const cur = state.settings?.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', cur);
  state.settings.theme = cur;
  await sb.from('user_settings').update({ theme: cur }).eq('user_id', state.user.id);
  renderCurrentPage();
}

async function toggleHideBalances() {
  const currentVal = !!state.settings?.hide_balances;
  const newVal = !currentVal;
  state.settings.hide_balances = newVal;
  
  await sb.from('user_settings').update({ hide_balances: newVal }).eq('user_id', state.user.id);
  updatePrivacyIcon();
  renderCurrentPage();
}

function updatePrivacyIcon() {
  const isHidden = !!state.settings?.hide_balances;
  const btn = $('#privacy-btn');
  if (btn) {
    btn.innerHTML = `<i data-lucide="${isHidden ? 'eye-off' : 'eye'}"></i>`;
    lucide.createIcons();
  }
}

function toggleSidebar() { $('#sidebar').classList.toggle('open'); }

function updateGreeting() {
  const name = state.profile?.full_name || 'صديقي';
  $('#greeting').textContent = `مرحباً ${name} 👋`;
  $('#current-date').textContent = new Date().toLocaleDateString('ar-EG', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// ================= ROUTER =================
function navigate(page) {
  if (page === 'add') { openAddTransactionModal(); return; }
  state.currentPage = page;
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  $$('.bottom-nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  if (window.innerWidth < 900) $('#sidebar').classList.remove('open');
  renderCurrentPage();
}

function renderCurrentPage() {
  const renderer = PAGES[state.currentPage];
  if (renderer) renderer();
  lucide.createIcons();
}

// ================= PAGES =================
const PAGES = {};

// ============ DASHBOARD ============
PAGES.dashboard = async function() {
  $('#page-content').innerHTML = '<p class="muted">جاري تحميل لوحة التحكم...</p>';
  try {
    const userId = state.user.id;
    const month = monthStart();

    const [salaries, income, txs, budgets, goals, debts, activeSalRes] = await Promise.all([
      sb.from('salaries').select('*').eq('user_id', userId).gte('salary_month', month),
      sb.from('income').select('*').eq('user_id', userId).gte('income_date', month),
      sb.from('transactions').select('*').eq('user_id', userId).gte('transaction_date', month),
      sb.from('budgets').select('*').eq('user_id', userId).eq('month', month),
      sb.from('savings_goals').select('*').eq('user_id', userId),
      sb.from('debts').select('*').eq('user_id', userId).eq('status', 'active'),
      sb.from('salaries').select('*').eq('user_id', userId).order('payment_date', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const activeSalary = activeSalRes.data;
    const salaryAmt = activeSalary ? Number(activeSalary.amount) : 0;
    
    // حساب الأيام المتبقية في الدورة المالِية (30 يوماً)
    let daysRemaining = 0;
    if (activeSalary) {
      const pDate = new Date(activeSalary.payment_date);
      const endDate = activeSalary.cycle_end_date ? new Date(activeSalary.cycle_end_date) : new Date(pDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      daysRemaining = Math.max(0, Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)));
    }

    const totalIncomeAdd = (income.data || []).reduce((s, x) => s + Number(x.amount), 0);
    const totalIncome = totalIncomeAdd + salaryAmt;
    const totalExpenses = (txs.data || []).reduce((s, x) => s + Number(x.amount), 0);
    const totalBudget = (budgets.data || []).reduce((s, x) => s + Number(x.amount), 0);
    const totalSavings = (goals.data || []).reduce((s, x) => s + Number(x.current_amount), 0);
    const balance = totalIncome - totalExpenses;
    const remainingSalary = Math.max(0, salaryAmt - totalExpenses);

    $('#page-content').innerHTML = `
      <div class="grid-cards">
        ${card('إجمالي الرصيد المتاح', maskValue(fmt(balance)), 'wallet', '#2563eb')}
        ${card('الراتب الشهري', maskValue(salaryAmt > 0 ? fmt(salaryAmt) : 'غير محدد'), 'coins', '#10b981')}
        ${card('متبقي الراتب الحالي', maskValue(fmt(remainingSalary)), 'pie-chart', '#06b6d4')}
        ${card('مصروفات الشهر', maskValue(fmt(totalExpenses)), 'trending-down', '#ef4444')}
        ${card('إجمالي المدخرات', maskValue(fmt(totalSavings)), 'target', '#8b5cf6')}
        ${card('أيام دورة الراتب', activeSalary ? `${daysRemaining} يوم متبقي` : 'لا توجد دورة نشطة', 'calendar', '#f59e0b')}
      </div>

      <div class="grid-charts">
        <div class="card">
          <div class="card-title">الدخل مقابل المصاريف</div>
          <div class="chart-container"><canvas id="chart-ie"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title">توزيع المصاريف حسب التصنيف</div>
          <div class="chart-container"><canvas id="chart-cat"></canvas></div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="flex-between mb-4">
          <h3 class="card-title">آخر المعاملات المالية</h3>
          <button class="btn btn-primary btn-sm" onclick="openAddTransactionModal()">+ إضافة معاملة</button>
        </div>
        ${renderTransactionsList((txs.data || []).slice(0, 5))}
      </div>
    `;

    renderIEChart(totalIncome, totalExpenses);
    renderCategoryChart(txs.data || []);
    lucide.createIcons();
  } catch (e) {
    console.error(e);
    $('#page-content').innerHTML = `<p class="muted">خطأ في التحميل: ${e.message}</p>`;
  }
};

function card(title, value, icon, color) {
  return `<div class="card">
    <div class="flex-between mb-4">
      <span class="card-title">${title}</span>
      <div class="list-icon" style="background:${color}20;color:${color};width:36px;height:36px">
        <i data-lucide="${icon}" style="width:18px;height:18px"></i>
      </div>
    </div>
    <div class="card-value">${value}</div>
  </div>`;
}

function renderTransactionsList(txs) {
  if (!txs.length) return emptyState('لا توجد معاملات بعد', 'ابدأ بإضافة أول معاملة في تطبيقك');
  return txs.map(tx => {
    const cat = state.categories.find(c => c.id === tx.category_id);
    return `<div class="list-item">
      <div class="list-icon" style="background:${(cat?.color||'#64748b')}20;color:${cat?.color||'#64748b'}">
        <i data-lucide="${cat?.icon || 'tag'}" style="width:20px;height:20px"></i>
      </div>
      <div class="list-info">
        <div class="list-title">${tx.description || cat?.name_ar || 'معاملة'}</div>
        <div class="list-sub">${fmtDate(tx.transaction_date)} · ${cat?.name_ar || ''}</div>
      </div>
      <div class="list-amount expense">-${maskValue(fmt(tx.amount))}</div>
    </div>`;
  }).join('');
}

function emptyState(title, sub) {
  return `<div class="empty-state">
    <div class="empty-state-icon">📭</div>
    <h3>${title}</h3>
    <p>${sub}</p>
  </div>`;
}

// ============ CHARTS ============
function renderIEChart(income, expenses) {
  const ctx = $('#chart-ie'); if (!ctx) return;
  if (state.charts.ie) state.charts.ie.destroy();
  state.charts.ie = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['الدخل', 'المصاريف'],
      datasets: [{
        data: [income, expenses],
        backgroundColor: ['#10b981', '#ef4444'],
        borderRadius: 8,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: '#e5e8ef' } }, x: { grid: { display: false } } }
    }
  });
}

function renderCategoryChart(txs) {
  const ctx = $('#chart-cat'); if (!ctx) return;
  if (state.charts.cat) state.charts.cat.destroy();
  const grouped = {};
  txs.forEach(t => {
    const k = t.category_id || 'other';
    grouped[k] = (grouped[k] || 0) + Number(t.amount);
  });
  const labels = [], data = [], colors = [];
  Object.entries(grouped).forEach(([cid, amt]) => {
    const cat = state.categories.find(c => c.id === cid);
    labels.push(cat?.name_ar || 'أخرى');
    data.push(amt);
    colors.push(cat?.color || '#64748b');
  });
  if (!labels.length) {
    ctx.parentElement.innerHTML = '<div class="empty-state"><p>لا توجد بيانات للعرض</p></div>';
    return;
  }
  state.charts.cat = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { family: 'Cairo' } } } }
    }
  });
}

// ============ TRANSACTIONS ============
PAGES.transactions = async function() {
  $('#page-content').innerHTML = `<div class="page-header"><h1>المعاملات المالية</h1>
    <button class="btn btn-primary" onclick="openAddTransactionModal()">+ إضافة معاملة</button></div>
    <div id="tx-list"><p class="muted">جاري التحميل...</p></div>`;
  const { data } = await sb.from('transactions').select('*').eq('user_id', state.user.id).order('transaction_date', { ascending: false }).limit(100);
  $('#tx-list').innerHTML = renderTransactionsList(data || []);
  lucide.createIcons();
};

function openAddTransactionModal() {
  const catOptions = state.categories.map(c => `<option value="${c.id}">${c.name_ar}</option>`).join('');
  openModal('إضافة معاملة جديدة',
    `<div class="form-group"><label>المبلغ</label><input type="number" id="tx-amount" class="input" placeholder="0" min="0" step="0.01" required></div>
     <div class="form-group"><label>التصنيف</label><select id="tx-category" class="input">${catOptions}</select></div>
     <div class="form-group"><label>الوصف</label><input type="text" id="tx-desc" class="input" placeholder="مثال: شراء طعام، فاتورة..."></div>
     <div class="form-group"><label>طريقة الدفع</label>
       <select id="tx-payment" class="input">
         <option value="cash">نقدي</option><option value="card">بطاقة بنكية</option>
         <option value="bank_transfer">تحويل بنكي</option><option value="wallet">محفظة إلكترونية</option>
         <option value="other">أخرى</option>
       </select>
     </div>
     <div class="form-group"><label>التاريخ</label><input type="date" id="tx-date" class="input" value="${today()}"></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
     <button class="btn btn-primary" id="tx-save">حفظ المعاملة</button>`
  );
  $('#tx-save').onclick = saveTransaction;
  setTimeout(() => $('#tx-amount').focus(), 100);
}

async function saveTransaction() {
  const amount = parseFloat($('#tx-amount').value);
  if (!amount || amount <= 0) return toast('أدخل مبلغاً صحيحاً', 'error');
  const data = {
    user_id: state.user.id,
    amount,
    currency: state.settings.base_currency,
    category_id: $('#tx-category').value || null,
    description: $('#tx-desc').value.trim() || null,
    payment_method: $('#tx-payment').value,
    transaction_date: $('#tx-date').value,
  };
  const { error } = await sb.from('transactions').insert(data);
  if (error) return toast(error.message, 'error');
  
  await createSystemNotification('تسجيل مصروف 💸', `تم تسجيل مصروف جديد بقيمة ${fmt(amount)}.`);
  closeModal();
  toast('تم حفظ المعاملة ✅');
  renderCurrentPage();
}

// ============ INCOME & SALARY SYSTEM ============
PAGES.income = async function() {
  $('#page-content').innerHTML = `<div class="page-header"><h1>نظام الراتب الشهري والدخل</h1></div>
    <div class="grid-cards">
      <div class="card">
        <div class="card-title">الراتب الشهري (الدورة النشطة)</div>
        <div class="card-value" id="sal-val">—</div>
        <div class="muted text-sm mt-4" id="sal-cycle-info"></div>
        <button class="btn btn-ghost btn-sm mt-4" onclick="openSalaryModal()">إدخال / تعديل الراتب</button>
      </div>
      <div class="card">
        <div class="card-title">إجمالي الدخل الإضافي هذا الشهر</div>
        <div class="card-value" id="inc-val">—</div>
        <button class="btn btn-primary btn-sm mt-4" onclick="openIncomeModal()">+ إضافة دخل إضافي</button>
      </div>
    </div>
    <div class="card mb-4">
      <h3 class="card-title mb-4">سجل مصادر الدخل الإضافي</h3>
      <div id="income-list"><p class="muted">جاري التحميل...</p></div>
    </div>`;

  const [salRes, incRes] = await Promise.all([
    sb.from('salaries').select('*').eq('user_id', state.user.id).order('payment_date', { ascending: false }).limit(1).maybeSingle(),
    sb.from('income').select('*').eq('user_id', state.user.id).order('income_date', { ascending: false }).limit(50),
  ]);

  const activeSal = salRes.data;
  if (activeSal) {
    $('#sal-val').textContent = maskValue(fmt(activeSal.amount));
    const pDate = new Date(activeSal.payment_date);
    const endDate = activeSal.cycle_end_date ? new Date(activeSal.cycle_end_date) : new Date(pDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const days = Math.max(0, Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)));
    $('#sal-cycle-info').textContent = `استلام: ${fmtDate(activeSal.payment_date)} | متبقي على تحويل المدخرات: ${days} يوم`;
  } else {
    $('#sal-val').textContent = 'لم يتم إدخال راتب';
    $('#sal-cycle-info').textContent = 'يرجى إدخال راتبك الشهري لبدء الدورة المالية (30 يوماً)';
  }

  const incTotal = (incRes.data || []).reduce((s, x) => s + Number(x.amount), 0);
  $('#inc-val').textContent = maskValue(fmt(incTotal));

  $('#income-list').innerHTML = !incRes.data?.length ? emptyState('لا يوجد دخل إضافي مسجل', '') :
    incRes.data.map(x => `<div class="list-item">
      <div class="list-icon" style="background:#10b98120;color:#10b981"><i data-lucide="plus" style="width:20px;height:20px"></i></div>
      <div class="list-info"><div class="list-title">${x.description || x.source}</div><div class="list-sub">${fmtDate(x.income_date)}</div></div>
      <div class="list-amount income">+${maskValue(fmt(x.amount))}</div>
    </div>`).join('');
  lucide.createIcons();
};

function openSalaryModal() {
  openModal('إدخال الراتب الشهري',
    `<div class="form-group"><label>قيمة الراتب</label><input type="number" id="sal-amount" class="input" min="0" step="0.01" placeholder="أدخل راتبك يدوياً"></div>
     <div class="form-group"><label>تاريخ استلام الراتب</label><input type="date" id="sal-paydate" class="input" value="${today()}"></div>
     <div class="form-group"><label>ملاحظات</label><input type="text" id="sal-notes" class="input" placeholder="اختياري"></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
     <button class="btn btn-primary" id="sal-save">حفظ الراتب وبدء الدورة</button>`
  );
  $('#sal-save').onclick = async () => {
    const amt = parseFloat($('#sal-amount').value);
    const pDate = $('#sal-paydate').value;
    if (!amt || !pDate) return toast('يرجى إدخال كافة البيانات المطلوب', 'error');

    // حساب تاريخ انتهاء الدورة المالية (بعد 30 يوماً)
    const cycleEnd = new Date(new Date(pDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { error } = await sb.from('salaries').insert({
      user_id: state.user.id,
      amount: amt,
      currency: state.settings.base_currency,
      payment_date: pDate,
      salary_month: pDate.slice(0, 7) + '-01',
      cycle_end_date: cycleEnd,
      savings_transferred: false,
      notes: $('#sal-notes').value.trim() || null
    });

    if (error) return toast(error.message, 'error');
    await createSystemNotification('بدء دورة راتب جديدة 🚀', `تم إدخال راتب جديد بقيمة ${fmt(amt)} وبدء دورة 30 يوماً.`);
    closeModal();
    toast('تم حفظ الراتب وبدء الدورة المالية ✅');
    renderCurrentPage();
  };
}

function openIncomeModal() {
  openModal('إضافة دخل إضافي',
    `<div class="form-group"><label>المبلغ</label><input type="number" id="inc-amount" class="input" min="0" step="0.01" required></div>
     <div class="form-group"><label>المصدر</label>
       <select id="inc-source" class="input">
         <option value="bonus">مكافأة</option><option value="freelance">عمل حر</option>
         <option value="business">عمل تجاري</option><option value="gift">هدية</option>
         <option value="investment">استثمار</option><option value="other">أخرى</option>
       </select>
     </div>
     <div class="form-group"><label>الوصف</label><input type="text" id="inc-desc" class="input"></div>
     <div class="form-group"><label>التاريخ</label><input type="date" id="inc-date" class="input" value="${today()}"></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
     <button class="btn btn-primary" id="inc-save">حفظ الدخل</button>`
  );
  $('#inc-save').onclick = async () => {
    const amt = parseFloat($('#inc-amount').value);
    if (!amt) return toast('أدخل المبلغ', 'error');
    const { error } = await sb.from('income').insert({
      user_id: state.user.id, amount: amt, currency: state.settings.base_currency,
      source: $('#inc-source').value, description: $('#inc-desc').value.trim() || null,
      income_date: $('#inc-date').value,
    });
    if (error) return toast(error.message, 'error');
    await createSystemNotification('دخل جديد 💰', `تم إضافة دخل جديد بقيمة ${fmt(amt)}.`);
    closeModal(); toast('تم الحفظ ✅'); renderCurrentPage();
  };
}

// ============ SAVINGS MANAGEMENT ============
PAGES.savings = async function() {
  $('#page-content').innerHTML = `<div class="page-header"><h1>إدارة المدخرات والتحويل التلقائي</h1>
    <button class="btn btn-primary" onclick="openGoalModal()">+ هدف ادخاري جديد</button></div>
    <div id="savings-summary" class="grid-cards mb-4"></div>
    <div class="card mb-4"><h3 class="card-title mb-4">أهداف الادخار</h3><div id="goals-list"><p class="muted">جاري التحميل...</p></div></div>
    <div class="card"><h3 class="card-title mb-4">سجل عمليات التحويل والإيداع للمدخرات</h3><div id="savings-history-list"><p class="muted">جاري التحميل...</p></div></div>`;

  const [goalsRes, contribsRes, transfersRes] = await Promise.all([
    sb.from('savings_goals').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false }),
    sb.from('savings_contributions').select('*').eq('user_id', state.user.id).order('contribution_date', { ascending: false }),
    sb.from('salary_savings_transfers').select('*').eq('user_id', state.user.id).order('transfer_date', { ascending: false })
  ]);

  const goals = goalsRes.data || [];
  const contribs = contribsRes.data || [];
  const transfers = transfersRes.data || [];

  const totalSaved = goals.reduce((s, g) => s + Number(g.current_amount), 0);
  const autoTransferredTotal = transfers.reduce((s, t) => s + Number(t.amount), 0);
  const manualContribTotal = Math.max(0, totalSaved - autoTransferredTotal);

  $('#savings-summary').innerHTML = `
    ${card('إجمالي المدخرات', maskValue(fmt(totalSaved)), 'target', '#8b5cf6')}
    ${card('المدخرات المحولة تلقائياً', maskValue(fmt(autoTransferredTotal)), 'sparkles', '#10b981')}
    ${card('الإيداعات اليدوية', maskValue(fmt(manualContribTotal)), 'hand-coins', '#2563eb')}
  `;

  if (!goals.length) {
    $('#goals-list').innerHTML = emptyState('لا توجد أهداف ادخار بعد', 'قم بإنشاء أول هدف ادخاري لك');
  } else {
    $('#goals-list').innerHTML = goals.map(g => {
      const pct = Math.min(100, (g.current_amount / g.target_amount) * 100);
      return `<div class="card mb-4">
        <div class="flex-between mb-4">
          <div><strong>${g.name}</strong><div class="muted text-sm">${maskValue(fmt(g.current_amount))} / ${fmt(g.target_amount)}</div></div>
          <div style="color:${g.color};font-weight:800">${pct.toFixed(0)}%</div>
        </div>
        <div class="progress"><div class="progress-bar success" style="width:${pct}%"></div></div>
        <div class="flex gap-2 mt-4">
          <button class="btn btn-primary btn-sm" onclick="addToGoal('${g.id}')">+ إيداع</button>
          <button class="btn btn-ghost btn-sm" onclick="withdrawFromGoal('${g.id}', ${g.current_amount})">- سحب</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteGoal('${g.id}')">🗑</button>
        </div>
      </div>`;
    }).join('');
  }

  // سجل العمليات
  if (!contribs.length) {
    $('#savings-history-list').innerHTML = emptyState('لا توجد سجلات بعد', '');
  } else {
    $('#savings-history-list').innerHTML = contribs.map(c => `<div class="list-item">
      <div class="list-icon" style="background:${c.amount < 0 ? '#ef444420' : '#10b98120'};color:${c.amount < 0 ? '#ef4444' : '#10b981'}">
        <i data-lucide="${c.amount < 0 ? 'arrow-up-right' : 'arrow-down-left'}"></i>
      </div>
      <div class="list-info">
        <div class="list-title">${c.note || (c.amount < 0 ? 'عملية سحب' : 'إيداع في المدخرات')}</div>
        <div class="list-sub">${fmtDate(c.contribution_date)}</div>
      </div>
      <div class="list-amount ${c.amount < 0 ? 'expense' : 'income'}">${c.amount < 0 ? '' : '+'}${maskValue(fmt(c.amount))}</div>
    </div>`).join('');
  }

  lucide.createIcons();
};

function openGoalModal() {
  openModal('هدف ادخاري جديد',
    `<div class="form-group"><label>الاسم</label><input type="text" id="g-name" class="input" placeholder="مثال: شراء سيارة، صندوق طوارئ"></div>
     <div class="form-group"><label>المبلغ المستهدف</label><input type="number" id="g-target" class="input" min="0" step="0.01"></div>
     <div class="form-group"><label>تاريخ مستهدف</label><input type="date" id="g-date" class="input"></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
     <button class="btn btn-primary" id="g-save">حفظ</button>`
  );
  $('#g-save').onclick = async () => {
    const name = $('#g-name').value.trim();
    const tgt = parseFloat($('#g-target').value);
    if (!name || !tgt) return toast('املأ البيانات', 'error');
    const { error } = await sb.from('savings_goals').insert({
      user_id: state.user.id, name, target_amount: tgt,
      currency: state.settings.base_currency,
      target_date: $('#g-date').value || null,
    });
    if (error) return toast(error.message, 'error');
    closeModal(); renderCurrentPage();
  };
}

function addToGoal(goalId) {
  openModal('إيداع مبلغ في الهدف',
    `<div class="form-group"><label>المبلغ</label><input type="number" id="ct-amt" class="input" min="0" step="0.01"></div>
     <div class="form-group"><label>ملاحظة</label><input type="text" id="ct-note" class="input" placeholder="إيداع يدويا"></div>
     <div class="form-group"><label>التاريخ</label><input type="date" id="ct-date" class="input" value="${today()}"></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
     <button class="btn btn-primary" id="ct-save">تأكيد الإيداع</button>`
  );
  $('#ct-save').onclick = async () => {
    const amt = parseFloat($('#ct-amt').value);
    if (!amt || amt <= 0) return toast('أدخل مبلغاً صحيحاً', 'error');
    const { error } = await sb.from('savings_contributions').insert({
      user_id: state.user.id, goal_id: goalId, amount: amt, note: $('#ct-note').value.trim() || 'إيداع يدوي', contribution_date: $('#ct-date').value,
    });
    if (error) return toast(error.message, 'error');
    closeModal(); renderCurrentPage(); toast('تم الإيداع بنجاح ✅');
  };
}

function withdrawFromGoal(goalId, currentAmt) {
  openModal('سحب مبلغ من المدخرات',
    `<div class="form-group"><label>المبلغ المراد سحبه</label><input type="number" id="wt-amt" class="input" min="0" max="${currentAmt}" step="0.01"></div>
     <div class="form-group"><label>سبب السحب</label><input type="text" id="wt-note" class="input" placeholder="سحب للطوارئ"></div>
     <div class="form-group"><label>التاريخ</label><input type="date" id="wt-date" class="input" value="${today()}"></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
     <button class="btn btn-danger" id="wt-save">تأكيد السحب</button>`
  );
  $('#wt-save').onclick = async () => {
    const amt = parseFloat($('#wt-amt').value);
    if (!amt || amt <= 0 || amt > currentAmt) return toast('المبلغ غير متاح', 'error');
    const { error } = await sb.from('savings_contributions').insert({
      user_id: state.user.id, goal_id: goalId, amount: -amt, note: $('#wt-note').value.trim() || 'سحب من المدخرات', contribution_date: $('#wt-date').value,
    });
    if (error) return toast(error.message, 'error');
    closeModal(); renderCurrentPage(); toast('تم عملية السحب بنجاح ⚠️');
  };
}

async function deleteGoal(id) {
  confirmDialog('هل أنت متأكد من حذف هذا الهدف الادخاري وسجلاته؟', async () => {
    await sb.from('savings_goals').delete().eq('id', id);
    renderCurrentPage();
  });
}

// ============ BUDGETS ============
PAGES.budgets = async function() {
  $('#page-content').innerHTML = `<div class="page-header"><h1>الميزانيات الشهرية</h1>
    <button class="btn btn-primary" onclick="openBudgetModal()">+ إضافة ميزانية</button></div>
    <div id="budget-list"><p class="muted">جاري التحميل...</p></div>`;
  const month = monthStart();
  const [budgets, txs] = await Promise.all([
    sb.from('budgets').select('*').eq('user_id', state.user.id).eq('month', month),
    sb.from('transactions').select('*').eq('user_id', state.user.id).gte('transaction_date', month),
  ]);
  const grouped = {};
  (txs.data || []).forEach(t => { grouped[t.category_id] = (grouped[t.category_id] || 0) + Number(t.amount); });
  const list = $('#budget-list');
  if (!budgets.data?.length) { list.innerHTML = emptyState('لا توجد ميزانيات هذا الشهر', 'أضف ميزانية لكل تصنيف'); return; }
  list.innerHTML = budgets.data.map(b => {
    const cat = state.categories.find(c => c.id === b.category_id);
    const spent = grouped[b.category_id] || 0;
    const pct = Math.min(100, (spent / b.amount) * 100);
    const cls = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : '';

    if (pct >= 100) {
      createSystemNotification('تجاوز الميزانية ⚠️', `لقد تجاوزت ميزانية ${cat?.name_ar || 'التصنيف'}.`);
    }

    return `<div class="card mb-4">
      <div class="flex-between mb-4">
        <div><strong>${cat?.name_ar || 'ميزانية عامة'}</strong></div>
        <div class="muted">${maskValue(fmt(spent))} / ${fmt(b.amount)}</div>
      </div>
      <div class="progress"><div class="progress-bar ${cls}" style="width:${pct}%"></div></div>
      <div class="flex-between mt-4">
        <span class="muted text-sm">متبقي: ${maskValue(fmt(Math.max(0, b.amount - spent)))}</span>
        <button class="btn btn-ghost btn-sm" onclick="deleteBudget('${b.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
};

function openBudgetModal() {
  const catOptions = state.categories.map(c => `<option value="${c.id}">${c.name_ar}</option>`).join('');
  openModal('إضافة ميزانية تصنيف',
    `<div class="form-group"><label>التصنيف</label><select id="b-cat" class="input">${catOptions}</select></div>
     <div class="form-group"><label>المبلغ</label><input type="number" id="b-amount" class="input" min="0" step="0.01"></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
     <button class="btn btn-primary" id="b-save">حفظ</button>`
  );
  $('#b-save').onclick = async () => {
    const amt = parseFloat($('#b-amount').value);
    if (!amt) return toast('أدخل مبلغاً', 'error');
    const { error } = await sb.from('budgets').upsert({
      user_id: state.user.id, month: monthStart(),
      category_id: $('#b-cat').value, amount: amt, currency: state.settings.base_currency,
    }, { onConflict: 'user_id,month,category_id' });
    if (error) return toast(error.message, 'error');
    closeModal(); renderCurrentPage();
  };
}

async function deleteBudget(id) {
  confirmDialog('حذف هذه الميزانية؟', async () => {
    await sb.from('budgets').delete().eq('id', id);
    renderCurrentPage();
  });
}

// ============ DEBTS ============
PAGES.debts = async function() {
  $('#page-content').innerHTML = `<div class="page-header"><h1>الديون والمستحقات</h1>
    <button class="btn btn-primary" onclick="openDebtModal()">+ إضافة دين</button></div>
    <div id="debt-list"><p class="muted">جاري التحميل...</p></div>`;
  const { data } = await sb.from('debts').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false });
  if (!data?.length) { $('#debt-list').innerHTML = emptyState('لا توجد ديون', ''); return; }
  $('#debt-list').innerHTML = data.map(d => {
    const rem = Number(d.amount) - Number(d.paid_amount);
    return `<div class="list-item">
      <div class="list-icon" style="background:${d.direction === 'owed_to_me' ? '#10b98120' : '#ef444420'};color:${d.direction === 'owed_to_me' ? '#10b981' : '#ef4444'}">
        <i data-lucide="${d.direction === 'owed_to_me' ? 'arrow-down-left' : 'arrow-up-right'}"></i>
      </div>
      <div class="list-info">
        <div class="list-title">${d.person_name}</div>
        <div class="list-sub">${d.direction === 'owed_to_me' ? 'مستحق لي' : 'مستحق عليّ'} · ${fmt(d.paid_amount)} / ${fmt(d.amount)}</div>
      </div>
      <div class="list-amount ${d.direction === 'owed_to_me' ? 'income' : 'expense'}">${maskValue(fmt(rem))}</div>
      <div class="list-actions">
        <button class="btn btn-ghost btn-sm" onclick="recordDebtPayment('${d.id}')">+ دفع</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteDebt('${d.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
  lucide.createIcons();
};

function openDebtModal() {
  openModal('إضافة دين',
    `<div class="form-group"><label>النوع</label>
       <select id="d-dir" class="input">
         <option value="i_owe">مستحق عليّ (أنا مدين)</option>
         <option value="owed_to_me">مستحق لي (شخص مدين لي)</option>
       </select></div>
     <div class="form-group"><label>الاسم</label><input type="text" id="d-name" class="input"></div>
     <div class="form-group"><label>المبلغ الإجمالي</label><input type="number" id="d-amount" class="input" min="0" step="0.01"></div>
     <div class="form-group"><label>تاريخ الاستحقاق</label><input type="date" id="d-due" class="input"></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
     <button class="btn btn-primary" id="d-save">حفظ</button>`
  );
  $('#d-save').onclick = async () => {
    const name = $('#d-name').value.trim();
    const amt = parseFloat($('#d-amount').value);
    if (!name || !amt) return toast('املأ البيانات', 'error');
    const { error } = await sb.from('debts').insert({
      user_id: state.user.id, direction: $('#d-dir').value,
      person_name: name, amount: amt,
      currency: state.settings.base_currency,
      due_date: $('#d-due').value || null,
    });
    if (error) return toast(error.message, 'error');
    closeModal(); renderCurrentPage();
  };
}

function recordDebtPayment(debtId) {
  openModal('تسجيل دفع',
    `<div class="form-group"><label>المبلغ</label><input type="number" id="dp-amt" class="input" min="0" step="0.01"></div>
     <div class="form-group"><label>التاريخ</label><input type="date" id="dp-date" class="input" value="${today()}"></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
     <button class="btn btn-primary" id="dp-save">حفظ</button>`
  );
  $('#dp-save').onclick = async () => {
    const amt = parseFloat($('#dp-amt').value);
    if (!amt) return toast('أدخل المبلغ', 'error');
    const { error } = await sb.from('debt_payments').insert({
      user_id: state.user.id, debt_id: debtId, amount: amt,
      payment_date: $('#dp-date').value,
    });
    if (error) return toast(error.message, 'error');
    const { data: debt } = await sb.from('debts').select('paid_amount').eq('id', debtId).single();
    await sb.from('debts').update({ paid_amount: Number(debt.paid_amount) + amt }).eq('id', debtId);
    closeModal(); renderCurrentPage(); toast('تم تسجيل الدفع ✅');
  };
}

async function deleteDebt(id) {
  confirmDialog('حذف هذا الدين؟', async () => {
    await sb.from('debts').delete().eq('id', id);
    renderCurrentPage();
  });
}

// ============ RECURRING BILLS ============
PAGES.bills = async function() {
  $('#page-content').innerHTML = `<div class="page-header"><h1>الفواتير المتكررة</h1>
    <button class="btn btn-primary" onclick="openBillModal()">+ إضافة فاتورة</button></div>
    <div id="bills-list"><p class="muted">جاري التحميل...</p></div>`;
  const { data } = await sb.from('recurring_transactions').select('*').eq('user_id', state.user.id).order('next_due_date');
  if (!data?.length) { $('#bills-list').innerHTML = emptyState('لا توجد فواتير متكررة', 'أضف اشتراكاتك وفواتيرك'); return; }
  $('#bills-list').innerHTML = data.map(b => `<div class="list-item">
    <div class="list-icon"><i data-lucide="calendar"></i></div>
    <div class="list-info">
      <div class="list-title">${b.description}</div>
      <div class="list-sub">كل ${b.recurrence} · التالي: ${fmtDate(b.next_due_date)}</div>
    </div>
    <div class="list-amount ${b.type === 'income' ? 'income' : 'expense'}">${maskValue(fmt(b.amount))}</div>
    <div class="list-actions"><button class="btn btn-ghost btn-sm" onclick="deleteBill('${b.id}')">🗑</button></div>
  </div>`).join('');
  lucide.createIcons();
};

function openBillModal() {
  openModal('فاتورة متكررة',
    `<div class="form-group"><label>النوع</label><select id="bl-type" class="input"><option value="expense">مصروف</option><option value="income">دخل</option></select></div>
     <div class="form-group"><label>الوصف</label><input type="text" id="bl-desc" class="input" placeholder="نتفلكس، كهرباء..."></div>
     <div class="form-group"><label>المبلغ</label><input type="number" id="bl-amount" class="input" min="0" step="0.01"></div>
     <div class="form-group"><label>التكرار</label>
       <select id="bl-rec" class="input">
         <option value="monthly">شهري</option><option value="weekly">أسبوعي</option>
         <option value="yearly">سنوي</option><option value="daily">يومي</option>
       </select></div>
     <div class="form-group"><label>تاريخ البداية</label><input type="date" id="bl-start" class="input" value="${today()}"></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
     <button class="btn btn-primary" id="bl-save">حفظ</button>`
  );
  $('#bl-save').onclick = async () => {
    const amt = parseFloat($('#bl-amount').value);
    const desc = $('#bl-desc').value.trim();
    if (!amt || !desc) return toast('املأ البيانات', 'error');
    const start = $('#bl-start').value;
    const { error } = await sb.from('recurring_transactions').insert({
      user_id: state.user.id, type: $('#bl-type').value,
      description: desc, amount: amt, currency: state.settings.base_currency,
      recurrence: $('#bl-rec').value, start_date: start, next_due_date: start,
    });
    if (error) return toast(error.message, 'error');
    closeModal(); renderCurrentPage();
  };
}

async function deleteBill(id) {
  confirmDialog('حذف هذه الفاتورة؟', async () => {
    await sb.from('recurring_transactions').delete().eq('id', id);
    renderCurrentPage();
  });
}

// ============ REPORTS ============
PAGES.reports = async function() {
  $('#page-content').innerHTML = `<div class="page-header"><h1>التقارير المالية</h1></div>
    <div class="card"><p class="muted">جاري التحميل...</p></div>`;
  const [txs, inc, sal] = await Promise.all([
    sb.from('transactions').select('*').eq('user_id', state.user.id).order('transaction_date', { ascending: false }).limit(500),
    sb.from('income').select('*').eq('user_id', state.user.id).limit(500),
    sb.from('salaries').select('*').eq('user_id', state.user.id).limit(100),
  ]);
  const totalInc = (inc.data || []).reduce((s, x) => s + Number(x.amount), 0) + (sal.data || []).reduce((s, x) => s + Number(x.amount), 0);
  const totalExp = (txs.data || []).reduce((s, x) => s + Number(x.amount), 0);
  $('#page-content').innerHTML = `
    <div class="grid-cards mb-4">
      ${card('إجمالي الدخل', maskValue(fmt(totalInc)), 'trending-up', '#10b981')}
      ${card('إجمالي المصاريف', maskValue(fmt(totalExp)), 'trending-down', '#ef4444')}
      ${card('صافي التوفير', maskValue(fmt(totalInc - totalExp)), 'wallet', '#2563eb')}
    </div>
    <div class="card">
      <div class="card-title">كل المعاملات</div>
      <button class="btn btn-ghost btn-sm mb-4" onclick="exportCSV()">تصدير CSV</button>
      <div id="report-txs">${renderTransactionsList((txs.data || []).slice(0, 20))}</div>
    </div>`;
  lucide.createIcons();
  window._reportTxs = txs.data || [];
};

function exportCSV() {
  const rows = [['Date', 'Description', 'Category', 'Amount', 'Payment']];
  (window._reportTxs || []).forEach(t => {
    const cat = state.categories.find(c => c.id === t.category_id);
    rows.push([t.transaction_date, t.description || '', cat?.name_ar || '', t.amount, t.payment_method]);
  });
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `my-money-transactions-${today()}.csv`;
  a.click();
}

// ============ SETTINGS & RESET SYSTEM ============
PAGES.settings = function() {
  $('#page-content').innerHTML = `<div class="page-header"><h1>الإعدادات والخيارات</h1></div>
    <div class="card mb-4">
      <div class="card-title">الحساب الشخصي</div>
      <p class="mt-4"><strong>${state.profile?.full_name}</strong></p>
      <p class="muted">${state.profile?.email}</p>
    </div>
    <div class="card mb-4">
      <div class="card-title mb-4">العملة الأساسية</div>
      <select class="input" id="set-currency" onchange="changeCurrency(this.value)">
        ${Object.keys(CURRENCIES).map(c => `<option value="${c}" ${state.settings.base_currency===c?'selected':''}>${c}</option>`).join('')}
      </select>
    </div>
    <div class="card mb-4">
      <div class="card-title 
