import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft, ArrowUpRight, BarChart3, CalendarDays, Check, ChevronDown, CircleHelp,
  CreditCard, Download, GripVertical, LayoutDashboard, ListFilter, Menu, MoreHorizontal,
  Pencil, Plus, Repeat2, Search, Settings2, SlidersHorizontal, Sparkles, Tag, Trash2,
  TrendingDown, Wallet, X, AlertTriangle, Utensils, House, CarFront, ShoppingBag,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip,
  XAxis, YAxis, BarChart, Bar, PieChart, Pie, Cell, LabelList,
} from 'recharts';
import {
  getGetAnalyticsQueryKey, getGetCategoriesQueryKey, getGetExpensesQueryKey,
  useCreateCategory, useCreateExpense, useDeleteExpense, useExportExpensesCsv,
  useGetAnalytics, useGetCategories, useGetExpenses, useUpdateCategory, useUpdateExpense,
} from '@workspace/api-client-react';
import type { Category, CategoryInput, Expense, ExpenseInput, GetAnalyticsParams, GetExpensesParams } from '@workspace/api-client-react';

type ModalKind = 'expense' | 'category' | null;
type Period = 'This month' | 'Last month' | 'Last 30 days' | 'This year' | 'All time' | 'Custom range';
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value || 0);
const compactMoney = (value: number) => value >= 10_000_000
  ? `₹${(value / 10_000_000).toFixed(1)}Cr`
  : value >= 100_000
    ? `₹${(value / 100_000).toFixed(1)}L`
    : value >= 1_000
      ? `₹${(value / 1_000).toFixed(1)}k`
      : money(value);
const dateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const iconFor = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('food') || n.includes('dining') || n.includes('restaurant')) return Utensils;
  if (n.includes('home') || n.includes('rent')) return House;
  if (n.includes('transport') || n.includes('car') || n.includes('travel')) return CarFront;
  if (n.includes('shop')) return ShoppingBag;
  return Tag;
};
const defaultOrder = ['overview', 'spend', 'budget', 'transactions'];

function usePeriod(period: Period, customStart: string, customEnd: string) {
  return useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    if (period === 'Last month') {
      start.setMonth(start.getMonth() - 1);
      end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0);
    } else if (period === 'Last 30 days') {
      start.setTime(now.getTime());
      start.setDate(start.getDate() - 29);
      end.setTime(now.getTime());
    } else if (period === 'This year') {
      start.setMonth(0, 1);
      end.setTime(now.getTime());
    } else if (period === 'All time') {
      return {};
    } else if (period === 'Custom range') {
      return { startDate: customStart, endDate: customEnd };
    }
    return { startDate: dateInput(start), endDate: dateInput(end) };
  }, [period, customStart, customEnd]);
}

function Dashboard() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>('This month');
  const [customStart, setCustomStart] = useState(() => dateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(() => dateInput(new Date()));
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [modal, setModal] = useState<ModalKind>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [dragging, setDragging] = useState('');
  const [order, setOrder] = useState<string[]>(() => {
    try { const saved = localStorage.getItem('ledger-widget-order'); return saved ? JSON.parse(saved) as string[] : defaultOrder; } catch { return defaultOrder; }
  });
  const range = usePeriod(period, customStart, customEnd);
  const filters = useMemo(() => ({
    ...range,
    ...(categoryFilter ? { categoryId: Number(categoryFilter) } : {}),
    ...(paymentFilter ? { paymentMethod: paymentFilter } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  }), [range, categoryFilter, paymentFilter, search]);
  const analyticsParams: GetAnalyticsParams = useMemo(() => ({
    ...range,
    ...(categoryFilter ? { categoryId: Number(categoryFilter) } : {}),
    ...(paymentFilter ? { paymentMethod: paymentFilter } : {}),
  }), [range, categoryFilter, paymentFilter]);
  const { data: expenses, isLoading: expensesLoading, isError: expensesError, refetch: refetchExpenses } = useGetExpenses(filters);
  const { data: analytics, isLoading: analyticsLoading, isError: analyticsError, refetch: refetchAnalytics } = useGetAnalytics(analyticsParams);
  const { data: categories, isLoading: categoriesLoading } = useGetCategories();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const exportCsv = useExportExpensesCsv(filters, { query: { enabled: false, queryKey: ['/api/export.csv', filters] } });
  const loading = expensesLoading || analyticsLoading || categoriesLoading;
  const paymentMethods = useMemo(() => [...new Set((expenses || []).map((expense) => expense.paymentMethod).filter(Boolean))].sort(), [expenses]);

  const invalidateData = () => {
    void queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetAnalyticsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetCategoriesQueryKey() });
  };
  const openNewExpense = () => { setEditingExpense(null); setModal('expense'); };
  const openEditExpense = (expense: Expense) => { setEditingExpense(expense); setModal('expense'); };
  const openCategory = (category?: Category) => { setEditingCategory(category || null); setModal('category'); };
  const closeModal = () => setModal(null);
  const submitExpense = (data: ExpenseInput) => {
    const onSuccess = () => { invalidateData(); closeModal(); };
    if (editingExpense) updateExpense.mutate({ id: editingExpense.id, data }, { onSuccess });
    else createExpense.mutate({ data }, { onSuccess });
  };
  const removeExpense = (expense: Expense) => {
    if (window.confirm(`Delete “${expense.description || expense.categoryName}” for ${money(expense.amount)}?`)) {
      deleteExpense.mutate({ id: expense.id }, { onSuccess: invalidateData });
    }
  };
  const submitCategory = (data: CategoryInput) => {
    const onSuccess = () => { invalidateData(); closeModal(); };
    if (editingCategory) updateCategory.mutate({ id: editingCategory.id, data }, { onSuccess });
    else createCategory.mutate({ data }, { onSuccess });
  };
  const downloadCsv = async () => {
    try {
      const result = await exportCsv.refetch();
      if (!result.data) return;
      const blob = new Blob([result.data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ledger-${dateInput(new Date())}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch { /* query error is visible through export button feedback */ }
  };
  const changeOrder = (target: string) => {
    if (!dragging || dragging === target) return;
    const next = [...order];
    const from = next.indexOf(dragging);
    const to = next.indexOf(target);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, dragging);
    setOrder(next);
    localStorage.setItem('ledger-widget-order', JSON.stringify(next));
    setDragging('');
  };

  const widgets: Record<string, ReactNode> = {
    overview: <Overview analytics={analytics} loading={loading} />,
    spend: <SpendPanel analytics={analytics} loading={loading} />,
    budget: <BudgetPanel analytics={analytics} categories={categories || []} loading={loading} onManage={() => openCategory()} onEdit={openCategory} />,
    transactions: <Transactions expenses={expenses || []} loading={loading} error={expensesError} onRetry={() => void refetchExpenses()} onAdd={openNewExpense} onEdit={openEditExpense} onDelete={removeExpense} deleting={deleteExpense.isPending} />,
  };
  const top = <header className="topbar sticky top-0 z-20 flex items-center justify-between px-8 mobile-pad">
    <div className="flex items-center gap-3">
      <button className="icon-button md:hidden" aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={18} /></button>
      <div className="flex items-center gap-2 text-xs text-[#8995a3]"><span>Workspace</span><span className="text-[#4f5c69]">/</span><span className="text-[#d9e0e7]">Overview</span></div>
    </div>
    <div className="flex items-center gap-3">
      <span className="hidden text-[11px] text-[#7e8997] sm:block">Synced just now</span>
      <button onClick={downloadCsv} disabled={exportCsv.isFetching} className="btn btn-secondary !py-2" data-testid="button-export-csv"><Download size={15} /> <span className="hide-mobile">{exportCsv.isFetching ? 'Preparing…' : 'Export CSV'}</span></button>
      <button onClick={openNewExpense} className="btn btn-primary !py-2" data-testid="button-add-expense"><Plus size={16} /> Add expense</button>
    </div>
  </header>;

  return <div className="app-shell flex">
    <aside className="sidebar fixed inset-y-0 left-0 z-30 flex flex-col px-4 py-5">
      <div className="mb-9 flex items-center gap-3 px-2">
        <div className="brand-mark flex h-9 w-9 items-center justify-center rounded-xl text-[#102019]"><Wallet size={19} strokeWidth={2.5} /></div>
        <div><div className="font-[Manrope] text-[15px] font-extrabold tracking-[-.04em] text-[#edf3f5]">pocket</div><div className="mt-0.5 text-[10px] font-semibold tracking-[.16em] text-[#788593]">PERSONAL FINANCE</div></div>
      </div>
      <div className="mb-2 px-3 section-label">Workspace</div>
      <nav className="space-y-1">
        <button className="nav-item active w-full" data-testid="nav-overview"><LayoutDashboard size={17} /> Overview</button>
        <button className="nav-item w-full" onClick={() => document.getElementById('transactions')?.scrollIntoView({ behavior: 'smooth' })} data-testid="nav-transactions"><CreditCard size={17} /> Transactions</button>
        <button className="nav-item w-full" onClick={() => document.getElementById('budget')?.scrollIntoView({ behavior: 'smooth' })} data-testid="nav-budgets"><BarChart3 size={17} /> Budgets</button>
      </nav>
      <div className="mb-3 mt-8 flex items-center justify-between px-3"><span className="section-label">Your categories</span><button onClick={() => openCategory()} className="icon-button !h-6 !w-6" aria-label="Add category" data-testid="button-sidebar-add-category"><Plus size={15} /></button></div>
      <div className="space-y-0.5">
        {(categories || []).slice(0, 7).map((category) => {
          const Icon = iconFor(category.name);
          return <button key={category.id} onClick={() => setCategoryFilter(categoryFilter === String(category.id) ? '' : String(category.id))} className={`nav-item w-full ${categoryFilter === String(category.id) ? 'active' : ''}`} data-testid={`filter-category-${category.id}`}><span className="flex h-5 w-5 items-center justify-center rounded-md" style={{ color: category.color, background: `${category.color}1c` }}><Icon size={13} /></span><span className="truncate">{category.name}</span></button>;
        })}
        {!categories?.length && !categoriesLoading && <div className="px-3 py-2 text-xs text-[#778391]">Add your first category</div>}
      </div>
      <div className="mt-auto">
        <div className="panel-soft mb-4 rounded-xl p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#d9e2e9]"><Sparkles size={14} className="text-[#53c994]" /> A clearer picture</div>
          <p className="mb-3 mt-2 text-[11px] leading-relaxed text-[#8793a0]">Keep your spending visible. Small check-ins make a difference.</p>
          <button onClick={() => setPeriod('This month')} className="text-[11px] font-semibold text-[#63d2a1] hover:text-[#91e5bd]">Review this month <ArrowUpRight size={12} className="ml-1 inline" /></button>
        </div>
        <button className="nav-item w-full" onClick={() => openCategory()} data-testid="button-settings"><Settings2 size={17} /> Manage categories</button>
        <div className="mt-4 flex items-center gap-3 border-t border-[#29303a] px-2 pt-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#3a4854] bg-[#26323b] text-[11px] font-bold text-[#a5e4c3]">JD</div>
          <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-[#dfe6eb]">Jamie’s space</div><div className="text-[10px] text-[#7c8996]">Personal workspace</div></div>
          <MoreHorizontal size={17} className="text-[#7e8a96]" />
        </div>
      </div>
    </aside>
    <main className="main-area ml-[238px] min-h-[100dvh] flex-1 max-[1050px]:ml-[205px] max-[800px]:ml-0">
      {top}
      <div className="mx-auto max-w-[1500px] px-8 pb-12 pt-8 mobile-pad">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><div className="mb-2 flex items-center gap-2 text-xs text-[#86929f]"><CalendarDays size={14} /> {range.startDate ? `${fmtDate(range.startDate)} – ${fmtDate(range.endDate || range.startDate)}` : 'All recorded activity'}</div><h1 className="font-[Manrope] text-[28px] font-bold tracking-[-.045em] text-[#f1f4f6] sm:text-[32px]">Your money, in focus.</h1><p className="mt-1.5 text-sm text-[#929eaa]">A thoughtful look at where it’s going.</p></div>
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[#2c3440] bg-[#191e26] p-1" role="group" aria-label="Date range">
            {(['This month', 'Last month', 'Last 30 days', 'This year', 'All time', 'Custom range'] as Period[]).map((option) => <button key={option} onClick={() => setPeriod(option)} className={`rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors ${period === option ? 'bg-[#303a45] text-[#eaf1f4]' : 'text-[#8793a0] hover:text-[#d8e0e6]'}`} data-testid={`filter-period-${option.toLowerCase().replaceAll(' ', '-')}`}>{option === 'Custom range' ? 'Custom' : option}</button>)}
            {period === 'Custom range' && <div className="flex items-center gap-1 px-1">
              <input aria-label="Start date" type="date" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} className="w-[122px] rounded-md border border-[#36414d] bg-[#202630] px-2 py-1.5 text-[10px] text-[#c5cfd8]" data-testid="input-custom-start-date" />
              <span className="text-[10px] text-[#73808d]">to</span>
              <input aria-label="End date" type="date" value={customEnd} min={customStart} onChange={(event) => setCustomEnd(event.target.value)} className="w-[122px] rounded-md border border-[#36414d] bg-[#202630] px-2 py-1.5 text-[10px] text-[#c5cfd8]" data-testid="input-custom-end-date" />
            </div>}
          </div>
        </div>
        <div className="filter-row mb-5 flex items-center gap-2.5">
          <label className="search-box control flex min-w-[220px] flex-1 items-center gap-2.5 px-3 py-2.5"><Search size={16} className="shrink-0 text-[#7f8b99]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transactions…" className="w-full bg-transparent text-[13px] outline-none" data-testid="input-search-expenses" /><kbd className="hidden rounded border border-[#343d48] px-1.5 py-0.5 text-[10px] text-[#727e8b] sm:block">/</kbd></label>
          <label className="control flex items-center gap-2 px-3 py-2.5"><ListFilter size={15} className="text-[#8793a0]" /><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="max-w-[145px] bg-transparent text-[12px] outline-none" data-testid="select-category-filter"><option value="">All categories</option>{(categories || []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><ChevronDown size={13} className="text-[#768391]" /></label>
          <label className="control flex items-center gap-2 px-3 py-2.5"><CreditCard size={14} className="text-[#8793a0]" /><select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="max-w-[135px] bg-transparent text-[12px] outline-none" data-testid="select-payment-filter"><option value="">Any payment</option>{paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select><ChevronDown size={13} className="text-[#768391]" /></label>
          {(search || categoryFilter || paymentFilter) && <button onClick={() => { setSearch(''); setCategoryFilter(''); setPaymentFilter(''); }} className="btn btn-quiet !px-2" data-testid="button-clear-filters"><X size={14} /> Clear</button>}
          <button onClick={() => openCategory()} className="btn btn-secondary ml-auto max-[540px]:ml-0" data-testid="button-manage-budgets"><SlidersHorizontal size={14} /><span className="hide-mobile"> Budgets</span></button>
        </div>
        {analyticsError && <div className="mb-5 flex items-center justify-between rounded-xl border border-[#78404b] bg-[#3a2229] px-4 py-3 text-sm text-[#f0b4be]" role="alert"><span>We couldn’t load your insights right now.</span><button onClick={() => void refetchAnalytics()} className="font-semibold underline" data-testid="button-retry-analytics">Try again</button></div>}
        <div className="space-y-4">
          {order.map((id) => <div key={id} className={`widget ${dragging === id ? 'dragging' : ''}`} draggable onDragStart={() => setDragging(id)} onDragEnd={() => setDragging('')} onDragOver={(event) => event.preventDefault()} onDrop={() => changeOrder(id)} data-testid={`widget-${id}`}>
            {widgets[id]}
          </div>)}
        </div>
        <footer className="mt-8 flex items-center justify-between border-t border-[#272f39] pt-4 text-[10px] text-[#697582]"><span>PRIVATE BY DESIGN · YOUR FINANCES, YOUR PACE</span><span className="flex items-center gap-1"><CircleHelp size={12} /> Drag widgets to reorder</span></footer>
      </div>
    </main>
    {modal === 'expense' && <ExpenseModal categories={categories || []} expense={editingExpense} busy={createExpense.isPending || updateExpense.isPending} onClose={closeModal} onSubmit={submitExpense} />}
    {modal === 'category' && <CategoryModal category={editingCategory} busy={createCategory.isPending || updateCategory.isPending} onClose={closeModal} onSubmit={submitCategory} />}
  </div>;
}

function WidgetTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="mb-4 flex items-center justify-between"><div><div className="section-label">{eyebrow}</div><h2 className="mt-1 font-[Manrope] text-[15px] font-bold tracking-[-.02em] text-[#e9eef2]">{title}</h2></div><GripVertical size={16} className="cursor-grab text-[#5f6b78]" /></div>;
}

function Overview({ analytics, loading }: { analytics?: import('@workspace/api-client-react').Analytics; loading: boolean }) {
  if (loading && !analytics) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[0,1,2,3,4].map((x) => <div key={x} className="panel h-[130px] rounded-2xl p-5"><div className="skeleton mb-5 h-3 w-24 rounded" /><div className="skeleton h-8 w-32 rounded" /></div>)}</div>;
  const budget = analytics?.categories.reduce((sum, category) => sum + category.budget, 0) || 0;
  const budgetSpend = analytics?.categories.reduce((sum, category) => sum + category.amount, 0) || 0;
  const budgetUsed = budget > 0 ? (budgetSpend / budget) * 100 : 0;
  const budgetRemaining = budgetSpend > budget ? `Over ${money(budgetSpend - budget)}` : `${Math.round(100 - budgetUsed)}% left`;
  const stats = [
    { label: 'Total spent', value: money(analytics?.total || 0), caption: `${analytics?.count || 0} transactions in period`, icon: Wallet, tone: 'green' },
    { label: 'Daily average', value: money(analytics?.averageDaily || 0), caption: 'Across selected dates', icon: TrendingDown, tone: 'blue' },
    { label: 'Average transaction', value: money(analytics?.average || 0), caption: `Median ${money(analytics?.median || 0)}`, icon: ArrowDownLeft, tone: 'gold' },
    { label: 'Recurring spend', value: money(analytics?.recurringTotal || 0), caption: `${analytics?.total ? Math.round(analytics.recurringTotal / analytics.total * 100) : 0}% of your spending`, icon: Repeat2, tone: 'violet' },
    { label: 'Budget health', value: budget ? budgetRemaining : 'No limits', caption: budget ? `${Math.round(budgetUsed)}% of category budgets used` : 'Set category limits to track progress', icon: SlidersHorizontal, tone: budgetUsed > 100 ? 'rose' : 'green', progress: budget ? Math.min(100, budgetUsed) : undefined },
  ];
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {stats.map(({ label, value, caption, icon: Icon, tone, progress }) => <div key={label} className="panel relative overflow-hidden rounded-2xl p-5">
        <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: tone === 'green' ? '#58d29b' : tone === 'blue' ? '#6bc6db' : tone === 'gold' ? '#e2bc68' : tone === 'rose' ? '#ed8997' : '#b9a0e3', background: tone === 'green' ? 'rgba(72,189,139,.11)' : tone === 'blue' ? 'rgba(107,198,219,.1)' : tone === 'gold' ? 'rgba(226,188,104,.1)' : tone === 'rose' ? 'rgba(237,137,151,.1)' : 'rgba(185,160,227,.1)' }}><Icon size={16} /></div>
        <div className="section-label">{label}</div><div className="kpi-value mt-3 text-[27px] font-bold text-[#f0f3f5]">{value}</div><div className="mt-2 text-[10px] text-[#83909d]">{caption}</div>
        {progress !== undefined && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#2b3440]"><div className={`h-full rounded-full ${budgetUsed > 100 ? 'bg-[#d96a7b]' : budgetUsed >= 80 ? 'bg-[#e7b65e]' : 'bg-[#51c992]'}`} style={{ width: `${progress}%` }} /></div>}
      </div>)}
    </div>
    <details className="panel group rounded-2xl">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
        <span><span className="section-label">Statistical insights</span><span className="ml-3 text-[11px] text-[#8794a1]">A deeper look at your spending distribution</span></span>
        <ChevronDown size={15} className="shrink-0 text-[#83909d] transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-3 border-t border-[#2a323d] px-5 py-4 sm:grid-cols-2 xl:grid-cols-4">
        <Insight label="Highest transaction" value={money(analytics?.maximum || 0)} />
        <Insight label="Smallest transaction" value={money(analytics?.minimum || 0)} />
        <Insight label="Standard deviation" value={money(analytics?.standardDeviation || 0)} />
        <Insight label="75th percentile" value={money(analytics?.percentile75 || 0)} caption="Three quarters of transactions are at or below this amount" />
        <Insight label="Top spending category" value={analytics?.topCategory || '—'} />
        <Insight label="Recurring" value={money(analytics?.recurringTotal || 0)} />
        <Insight label="Non-recurring" value={money(analytics?.nonRecurringTotal || 0)} />
      </div>
    </details>
  </div>;
}

function Insight({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return <div className="rounded-xl border border-[#2d3742] bg-[#1b222b] px-4 py-3"><div className="section-label">{label}</div><div className="mt-2 truncate text-sm font-semibold text-[#e5ebef]">{value}</div>{caption && <div className="mt-1 text-[10px] leading-relaxed text-[#82909d]">{caption}</div>}</div>;
}

function SpendPanel({ analytics, loading }: { analytics?: import('@workspace/api-client-react').Analytics; loading: boolean }) {
  const monthly = analytics?.monthly || [];
  const daily = analytics?.daily || [];
  const categorySpend = analytics?.categories.filter((category) => category.amount > 0) || [];
  return <div className="chart-grid">
    <section className="panel min-w-0 rounded-2xl p-5">
      <WidgetTitle eyebrow="Spending trend" title="Month by month" />
      <div className="h-[230px] w-full">
        {loading && !analytics ? <div className="skeleton h-full rounded-xl" /> : monthly.length ? <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthly} margin={{ top: 18, right: 8, left: -17, bottom: 0 }}>
            <defs><linearGradient id="mintBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7be2b0" /><stop offset="100%" stopColor="#2a966a" /></linearGradient></defs>
            <CartesianGrid stroke="#2c3440" vertical={false} strokeDasharray="3 5" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#83909e', fontSize: 10 }} tickFormatter={(v: string) => v.length > 7 ? v.slice(0, 3) : v} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: '#83909e', fontSize: 10 }} tickFormatter={compactMoney} />
            <Tooltip content={<ChartTip />} />
            <Bar dataKey="amount" fill="url(#mintBar)" radius={[5, 5, 1, 1]} maxBarSize={44}>
              <LabelList dataKey="amount" position="top" formatter={(value: number) => money(value)} fill="#a9ddc4" fontSize={9} />
            </Bar>
          </BarChart>
        </ResponsiveContainer> : <EmptyChart label="No monthly spending to chart yet" />}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[10px] text-[#81909c]"><span className="h-2 w-2 rounded-full bg-[#55ce98]" /> Spending total <span className="ml-auto flex items-center gap-1 text-[#69d5a4]"><ArrowUpRight size={12} /> A clearer rhythm</span></div>
    </section>
    <section className="panel min-w-0 rounded-2xl p-5">
      <WidgetTitle eyebrow="Daily detail" title="Recent activity" />
      <div className="h-[230px] w-full">
        {loading && !analytics ? <div className="skeleton h-full rounded-xl" /> : daily.length ? <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={daily.slice(-14)} margin={{ top: 12, right: 3, left: -22, bottom: 0 }}>
            <defs><linearGradient id="dailyFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#68bed0" stopOpacity={0.3} /><stop offset="95%" stopColor="#68bed0" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke="#2c3440" vertical={false} strokeDasharray="3 5" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#83909e', fontSize: 9 }} tickFormatter={(v: string) => new Date(`${v.slice(0,10)}T12:00:00`).toLocaleDateString('en-US',{day:'numeric'})} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: '#83909e', fontSize: 10 }} tickFormatter={money} />
            <Tooltip content={<ChartTip />} />
            <Area type="monotone" dataKey="amount" stroke="#68bed0" strokeWidth={2.5} fill="url(#dailyFill)" activeDot={{ r: 4, fill: '#b5eff7', stroke: '#203139', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer> : <EmptyChart label="Daily activity will show here" />}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-[#84909c]"><span>Last {Math.min(daily.length, 14)} days with data</span><span className="mono text-[#a8b6c2]">{money(analytics?.averageDaily || 0)} avg / day</span></div>
    </section>
    <section className="panel min-w-0 rounded-2xl p-5">
      <WidgetTitle eyebrow="Category mix" title="Where it goes" />
      <div className="h-[185px] w-full">
        {loading && !analytics ? <div className="skeleton h-full rounded-xl" /> : categorySpend.length ? <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTip />} />
            <Pie data={categorySpend} dataKey="amount" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3} stroke="#1d242d" strokeWidth={3}>
              {categorySpend.map((category) => <Cell key={category.categoryId} fill={category.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer> : <EmptyChart label="Category mix will appear here" />}
      </div>
      <div className="mt-2 space-y-2">
        {categorySpend.slice(0, 4).map((category) => <div key={category.categoryId} className="flex items-center justify-between gap-2 text-[10px]"><span className="flex min-w-0 items-center gap-2 text-[#9daab6]"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} /><span className="truncate">{category.name}</span></span><span className="mono text-[#d3dbe1]">{money(category.amount)}</span></div>)}
      </div>
    </section>
  </div>;
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { value: number; dataKey: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-lg border border-[#3a4653] bg-[#1b222c] px-3 py-2 shadow-xl"><div className="mb-1 text-[10px] text-[#92a0ad]">{label}</div><div className="mono text-xs font-semibold text-[#69d5a4]">{money(payload[0].value)}</div></div>;
}
function EmptyChart({ label }: { label: string }) { return <div className="flex h-full flex-col items-center justify-center gap-2 text-[#788592]"><BarChart3 size={22} strokeWidth={1.4} /><span className="text-xs">{label}</span></div>; }

function BudgetPanel({ analytics, categories, loading, onManage, onEdit }: { analytics?: import('@workspace/api-client-react').Analytics; categories: Category[]; loading: boolean; onManage: () => void; onEdit: (category: Category) => void }) {
  const data = analytics?.categories || [];
  const over = data.filter((category) => category.budget > 0 && category.amount > category.budget);
  const nearLimit = data.filter((category) => category.budget > 0 && category.amount >= category.budget * 0.8 && category.amount <= category.budget);
  return <section id="budget" className="panel rounded-2xl p-5">
    <div className="mb-4 flex items-start justify-between"><div><div className="section-label">Category budgets</div><h2 className="mt-1 font-[Manrope] text-[15px] font-bold text-[#e9eef2]">Stay in your comfort zone</h2><p className="mt-1 text-[11px] text-[#85919e]">Your spending against each monthly limit.</p></div><button onClick={onManage} className="btn btn-secondary !px-3 !py-2 text-[11px]" data-testid="button-edit-budgets"><Settings2 size={13} /> Manage</button></div>
     {over.length > 0 && <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#703c46] bg-[#3b2229] px-3 py-2 text-[11px] text-[#f2b2bc]"><AlertTriangle size={14} /> {over.length} {over.length === 1 ? 'category is' : 'categories are'} over budget</div>}
     {over.length === 0 && nearLimit.length > 0 && <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#725d39] bg-[#382f20] px-3 py-2 text-[11px] text-[#e8c27a]"><AlertTriangle size={14} /> {nearLimit.length} {nearLimit.length === 1 ? 'category is' : 'categories are'} nearing the monthly limit</div>}
    {loading && !analytics ? <div className="space-y-4">{[0,1,2].map((x) => <div key={x} className="skeleton h-12 rounded-lg" />)}</div> : data.length ? <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
      {data.map((category) => {
         const exceeded = category.budget > 0 && category.amount > category.budget;
         const nearing = category.budget > 0 && category.amount >= category.budget * 0.8 && !exceeded;
        const pct = category.budget > 0 ? Math.min(100, Math.round(category.amount / category.budget * 100)) : 0;
        const localCategory = categories.find((item) => item.id === category.categoryId);
        return <button key={category.categoryId} onClick={() => localCategory && onEdit(localCategory)} className="text-left" data-testid={`budget-category-${category.categoryId}`}>
          <div className="mb-2 flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[#cfd7de]"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} /><span className="truncate">{category.name}</span></span><span className={`mono whitespace-nowrap text-[10px] ${exceeded ? 'text-[#ed8997]' : 'text-[#a0acb7]'}`}>{money(category.amount)} <span className="text-[#677481]">/ {category.budget ? money(category.budget) : 'No limit'}</span></span></div>
           <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%`, background: exceeded ? '#d96a7b' : nearing ? '#e7b65e' : category.color || '#51c992' }} /></div>
           <div className={`mt-1 text-right text-[9px] ${exceeded ? 'text-[#ed8997]' : nearing ? 'text-[#e8c27a]' : 'text-[#788491]'}`}>{category.budget ? `${Math.round(category.amount / category.budget * 100)}% used` : 'Set a monthly limit'}</div>
        </button>;
      })}
    </div> : <div className="rounded-xl border border-dashed border-[#36404c] py-8 text-center"><div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#24342e] text-[#66d4a2]"><Tag size={16} /></div><div className="text-xs font-semibold text-[#d4dde4]">Build your first budget</div><div className="mb-3 mt-1 text-[11px] text-[#81909c]">Add categories and set gentle spending limits.</div><button onClick={onManage} className="btn btn-secondary !py-1.5 text-[11px]" data-testid="button-add-budget-category"><Plus size={13} /> Add category</button></div>}
  </section>;
}

function Transactions({ expenses, loading, error, onRetry, onAdd, onEdit, onDelete, deleting }: { expenses: Expense[]; loading: boolean; error: boolean; onRetry: () => void; onAdd: () => void; onEdit: (expense: Expense) => void; onDelete: (expense: Expense) => void; deleting: boolean }) {
  return <section id="transactions" className="panel overflow-hidden rounded-2xl">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2a323d] px-5 py-4"><div><div className="section-label">Ledger</div><h2 className="mt-1 font-[Manrope] text-[15px] font-bold text-[#e9eef2]">Recent transactions</h2></div><div className="flex items-center gap-3"><span className="rounded-md border border-[#333d49] bg-[#202731] px-2 py-1 text-[10px] font-semibold text-[#98a5b1]">{expenses.length} records</span><button onClick={onAdd} className="btn btn-secondary !px-3 !py-2 text-[11px]" data-testid="button-add-transaction"><Plus size={13} /> Add</button></div></div>
    {loading ? <div className="space-y-1 p-5">{[0,1,2,3,4].map((x) => <div key={x} className="skeleton h-[57px] rounded-lg" />)}</div> : error ? <div className="px-5 py-12 text-center"><div className="mb-2 text-sm font-semibold text-[#e2e8ed]">Transactions didn’t come through</div><p className="mb-3 text-xs text-[#8995a2]">Your records are safe. Try loading them again.</p><button className="btn btn-secondary !py-2 text-xs" onClick={onRetry} data-testid="button-retry-transactions">Retry</button></div> : expenses.length === 0 ? <div className="px-5 py-14 text-center"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#35434a] bg-[#21332d] text-[#66d3a0]"><Wallet size={20} /></div><div className="text-sm font-semibold text-[#e1e8ed]">Nothing to see here. Yet.</div><p className="mb-4 mt-1 text-xs text-[#85919e]">Add an expense to start seeing your spending clearly.</p><button onClick={onAdd} className="btn btn-primary !py-2 text-xs" data-testid="button-empty-add-expense"><Plus size={14} /> Add your first expense</button></div> : <div className="custom-scroll overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-left">
        <thead><tr className="text-[10px] uppercase tracking-[.08em] text-[#778390]"><th className="px-5 py-3 font-semibold">Description</th><th className="px-4 py-3 font-semibold">Category</th><th className="px-4 py-3 font-semibold">Date</th><th className="px-4 py-3 font-semibold">Payment</th><th className="px-5 py-3 text-right font-semibold">Amount</th><th className="w-16 px-3 py-3"></th></tr></thead>
        <tbody>{expenses.map((expense) => {
          const Icon = iconFor(expense.categoryName);
          return <tr key={expense.id} className="table-row border-t border-[#272f39]" data-testid={`row-expense-${expense.id}`}>
            <td className="px-5 py-3"><div className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ color: expense.categoryColor, background: `${expense.categoryColor}1c` }}><Icon size={15} /></span><div className="min-w-0"><div className="max-w-[220px] truncate text-xs font-semibold text-[#dfe6eb]">{expense.description || expense.categoryName}</div><div className="mt-0.5 flex items-center gap-1 text-[10px] text-[#778492]">{expense.recurring && <><Repeat2 size={10} /> Recurring</>}</div></div></div></td>
            <td className="px-4 py-3"><span className="rounded-md border border-[#353e49] bg-[#202630] px-2 py-1 text-[10px] text-[#aeb9c4]">{expense.categoryName}</span></td>
            <td className="px-4 py-3 text-[11px] text-[#9ca8b4]">{fmtDate(expense.date)}</td><td className="px-4 py-3 text-[11px] text-[#9ca8b4]">{expense.paymentMethod}</td>
            <td className="mono px-5 py-3 text-right text-xs font-semibold text-[#e2e8ed]">{money(expense.amount)}</td>
            <td className="px-3 py-3"><div className="flex items-center justify-end gap-0.5"><button className="icon-button !h-7 !w-7" onClick={() => onEdit(expense)} aria-label={`Edit ${expense.description || expense.categoryName}`} data-testid={`button-edit-expense-${expense.id}`}><Pencil size={13} /></button><button className="icon-button !h-7 !w-7 hover:!text-[#ed8997]" disabled={deleting} onClick={() => onDelete(expense)} aria-label={`Delete ${expense.description || expense.categoryName}`} data-testid={`button-delete-expense-${expense.id}`}><Trash2 size={13} /></button></div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </section>;
}

function ExpenseModal({ categories, expense, busy, onClose, onSubmit }: { categories: Category[]; expense: Expense | null; busy: boolean; onClose: () => void; onSubmit: (data: ExpenseInput) => void }) {
  const [date, setDate] = useState(expense?.date.slice(0, 10) || dateInput(new Date()));
  const [categoryId, setCategoryId] = useState(String(expense?.categoryId || categories[0]?.id || ''));
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [description, setDescription] = useState(expense?.description || '');
  const [paymentMethod, setPaymentMethod] = useState(expense?.paymentMethod || 'Credit card');
  const [recurring, setRecurring] = useState(expense?.recurring || false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!categoryId || Number(amount) <= 0) return;
    onSubmit({ date, categoryId: Number(categoryId), amount: Number(amount), description: description.trim() || null, paymentMethod, recurring });
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card p-6" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title">
    <div className="mb-5 flex items-start justify-between"><div><div className="section-label">{expense ? 'Edit record' : 'New record'}</div><h2 id="expense-modal-title" className="mt-1 font-[Manrope] text-xl font-bold tracking-[-.04em] text-[#eff3f5]">{expense ? 'Update expense' : 'Add an expense'}</h2><p className="mt-1 text-xs text-[#8996a2]">A little detail goes a long way.</p></div><button onClick={onClose} className="icon-button" aria-label="Close" data-testid="button-close-expense-modal"><X size={18} /></button></div>
    {categories.length === 0 ? <div className="rounded-xl border border-[#69404a] bg-[#3a2228] p-4 text-xs leading-relaxed text-[#e9b5bd]">Create a category before adding an expense. Close this panel and choose <strong>Manage categories</strong>.</div> : <form onSubmit={submit} className="space-y-4">
      <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[#aab5c0]">Description</span><input className="control w-full px-3 py-2.5 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was it for?" maxLength={255} data-testid="input-expense-description" /></label>
      <div className="grid grid-cols-2 gap-3"><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[#aab5c0]">Amount</span><div className="control flex items-center px-3"><span className="text-sm text-[#798693]">₹</span><input className="w-full bg-transparent px-2 py-2.5 text-sm outline-none" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" data-testid="input-expense-amount" /></div></label><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[#aab5c0]">Date</span><input className="control w-full px-3 py-2.5 text-sm" type="date" required value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-expense-date" /></label></div>
      <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[#aab5c0]">Category</span><select className="control w-full px-3 py-2.5 text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} data-testid="select-expense-category">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[#aab5c0]">Payment method</span><select className="control w-full px-3 py-2.5 text-sm" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} data-testid="select-expense-payment">{['Credit card', 'Debit card', 'Cash', 'Bank transfer', 'Digital wallet', 'Other'].map((method) => <option key={method} value={method}>{method}</option>)}</select></label>
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#303a45] bg-[#171d25] px-3 py-3"><input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="accent-[#48bd8b]" data-testid="checkbox-expense-recurring" /><span className="flex-1"><span className="block text-xs font-semibold text-[#cbd5dd]">Recurring expense</span><span className="mt-0.5 block text-[10px] text-[#7f8c98]">Mark bills and subscriptions</span></span><Repeat2 size={16} className="text-[#82909d]" /></label>
      <div className="flex justify-end gap-2 border-t border-[#303741] pt-4"><button type="button" onClick={onClose} className="btn btn-secondary" data-testid="button-cancel-expense">Cancel</button><button type="submit" disabled={busy || !categoryId} className="btn btn-primary min-w-[130px]" data-testid="button-save-expense">{busy ? 'Saving…' : <><Check size={15} /> {expense ? 'Save changes' : 'Add expense'}</>}</button></div>
    </form>}
  </section></div>;
}

function CategoryModal({ category, busy, onClose, onSubmit }: { category: Category | null; busy: boolean; onClose: () => void; onSubmit: (data: CategoryInput) => void }) {
  const palette = ['#57c892', '#61bcd0', '#e5b95f', '#c08ee4', '#e17d91', '#82a9e8', '#e39567'];
  const [name, setName] = useState(category?.name || '');
  const [budget, setBudget] = useState(category ? String(category.budgetLimit) : '');
  const [color, setColor] = useState(category?.color || palette[0]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim()) onSubmit({ name: name.trim(), budgetLimit: Number(budget) || 0, color }); };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card p-6" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
    <div className="mb-5 flex items-start justify-between"><div><div className="section-label">Budget settings</div><h2 id="category-modal-title" className="mt-1 font-[Manrope] text-xl font-bold tracking-[-.04em] text-[#eff3f5]">{category ? 'Tune this category' : 'Create a category'}</h2><p className="mt-1 text-xs text-[#8996a2]">Give your spending a useful home.</p></div><button onClick={onClose} className="icon-button" aria-label="Close" data-testid="button-close-category-modal"><X size={18} /></button></div>
    <form onSubmit={submit} className="space-y-4">
      <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[#aab5c0]">Category name</span><input className="control w-full px-3 py-2.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="e.g. Wellbeing" data-testid="input-category-name" /></label>
      <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[#aab5c0]">Monthly budget limit</span><div className="control flex items-center px-3"><span className="text-sm text-[#798693]">₹</span><input className="w-full bg-transparent px-2 py-2.5 text-sm outline-none" type="number" min="0" step="1" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="No limit" data-testid="input-category-budget" /></div><span className="mt-1 block text-[10px] text-[#768390]">Enter 0 to track spending without a limit.</span></label>
      <div><span className="mb-2 block text-[11px] font-semibold text-[#aab5c0]">Color label</span><div className="flex gap-2">{palette.map((tone) => <button type="button" key={tone} onClick={() => setColor(tone)} className="flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform hover:scale-110" style={{ background: tone, borderColor: color === tone ? '#edf4f5' : 'transparent' }} aria-label={`Choose ${tone} color`} data-testid={`button-category-color-${tone.slice(1)}`}>{color === tone && <Check size={14} className="text-[#142019]" />}</button>)}</div></div>
      <div className="flex justify-end gap-2 border-t border-[#303741] pt-4"><button type="button" onClick={onClose} className="btn btn-secondary" data-testid="button-cancel-category">Cancel</button><button type="submit" disabled={busy} className="btn btn-primary min-w-[130px]" data-testid="button-save-category">{busy ? 'Saving…' : <><Check size={15} /> {category ? 'Save budget' : 'Create category'}</>}</button></div>
    </form>
  </section></div>;
}

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, refetchOnWindowFocus: false } } });
function App() {
  return <QueryClientProvider client={queryClient}><Dashboard /></QueryClientProvider>;
}

export default App;
