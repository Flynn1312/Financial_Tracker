<script setup>
import { ref, computed, reactive, watch, onMounted } from 'vue'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const today = new Date()
today.setHours(0, 0, 0, 0)

const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgoISO = (n) => {
  const d = new Date(today)
  d.setDate(d.getDate() - n)
  return toISO(d)
}
const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
const lastMonthDay = (day) =>
  toISO(new Date(lastMonthStart.getFullYear(), lastMonthStart.getMonth(), day))

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
const tab = ref('overview') // 'overview' | 'spending' | 'invest'

// ---------------------------------------------------------------------------
// Data loaded from the Express API
// ---------------------------------------------------------------------------
// Temporary test user. In production, get the user ID from your auth session
// on the server (req.user.id), rather than trusting a query-string ID.
const userId = 2

const income = ref(0)
const subscriptions = ref([])
const outgoings = ref([])
const goals = ref([])
const categories = ref([])
const transactions = ref([])
const loading = ref(true)
const loadError = ref('')

const categoryIcons = {
  food: '🍔', 'food & drink': '🍔', groceries: '🛒', travel: '🚆', transport: '🚆',
  shopping: '🛍️', fun: '🎬', entertainment: '🎬', bills: '🧾', other: '📦',
}

const dbDateToISO = (value) => {
  if (!value) return ''
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  return String(value).slice(0, 10)
}

const categoryId = (value) => String(value ?? 'other').trim().toLowerCase()

async function loadOverviewData() {
  loading.value = true
  loadError.value = ''

  try {
    const response = await fetch(`http://localhost:3000/api/overview?userId=${userId}`)
    if (!response.ok) throw new Error(`Could not load dashboard data (HTTP ${response.status}).`)

    const result = await response.json()
    const data = result.overview
    if (!data) throw new Error('The server response did not contain overview data.')

    income.value = (data.income ?? []).reduce(
      (total, item) => total + Number(item.income || 0), 0
    )

    subscriptions.value = (data.subscriptions ?? []).map((item) => {
      const cost = Number(item.sub_cost || 0)
      let monthlyAmount = cost
      if (item.sub_frequency === 'weekly') monthlyAmount = cost * 52 / 12
      else if (item.sub_frequency === 'yearly') monthlyAmount = cost / 12

      return {
        id: item.id,
        name: item.sub_name,
        amount: monthlyAmount,
        rawCost: cost,
        frequency: item.sub_frequency || 'monthly',
        renewalDate: dbDateToISO(item.renewal_date),
        type: item.sub_type || 'Other',
        day: dbDateToISO(item.renewal_date)
          ? Number(dbDateToISO(item.renewal_date).slice(8, 10))
          : '',
      }
    })

    outgoings.value = (data.outgoings ?? []).map((item) => {
      const cost = Number(item.cost || 0)
      return {
        id: item.id,
        name: item.outgoing_name,
        amount: item.frequency === 'yearly' ? cost / 12 : cost,
        rawCost: cost,
        frequency: item.frequency || 'monthly',
        renewalDate: dbDateToISO(item.renewal_date),
      }
    })

    goals.value = (data.goals ?? []).map((goal) => ({
      id: goal.id,
      name: goal.goal_name,
      icon: '🎯',
      date: dbDateToISO(goal.goal_date),
      targetAmount: Number(goal.amount || 0),
      initialSaved: Number(goal.amount_saved || 0),
      open: false,
      draft: { label: '', cost: '' },
      saveDraft: '',
      contributions: [],
      items: (data.goalProgress ?? [])
        .filter((item) => Number(item.goalid) === Number(goal.id))
        .map((item) => ({
          id: item.id,
          label: item.goal_item,
          cost: Number(item.item_cost || 0),
          done: Boolean(Number(item.item_purchased)),
          link: item.link,
        })),
    }))

    // Use the budget for the month currently displayed. If there is no exact
    // match, use the most recent budget row for that category.
    const spendingGoalRows = data.spendingGoals ?? []
    const wantedMonth = monthKeyOf(viewMonth.value)
    const budgetsByCategory = new Map()
    for (const row of spendingGoalRows) {
      const key = categoryId(row.category)
      const rowMonth = dbDateToISO(row.budget_month).slice(0, 7)
      const existing = budgetsByCategory.get(key)
      if (!existing || rowMonth === wantedMonth ||
          (existing.month !== wantedMonth && rowMonth > existing.month)) {
        budgetsByCategory.set(key, { month: rowMonth, budget: Number(row.budget || 0), name: row.category })
      }
    }

    // Include transaction categories too, even if a budget has not been set.
    for (const row of (data.spendingTransactions ?? [])) {
      const key = categoryId(row.category)
      if (!budgetsByCategory.has(key)) {
        budgetsByCategory.set(key, { month: '', budget: 0, name: row.category })
      }
    }

    categories.value = Array.from(budgetsByCategory.entries()).map(([id, item]) => ({
      id,
      name: item.name,
      icon: categoryIcons[id] || '📦',
      budget: item.budget,
    }))

    transactions.value = (data.spendingTransactions ?? []).map((item) => ({
      id: item.id,
      description: item.name,
      amount: Number(item.spent || 0),
      category: categoryId(item.category),
      date: dbDateToISO(item.transaction_date),
    }))

    if (categories.value.length && !categories.value.some((category) => category.id === newTx.category)) {
      newTx.category = categories.value[0].id
    }
  } catch (error) {
    console.error('Dashboard loading error:', error)
    loadError.value = error.message || 'Something went wrong while loading the dashboard.'
  } finally {
    loading.value = false
  }
}

// ---------------------------------------------------------------------------
// Income, subscriptions and outgoing bills (persisted through the API)
// ---------------------------------------------------------------------------
const incomeEditing = ref(false)
const incomeDraft = ref('')
const savingChanges = ref(false)
const actionError = ref('')

const newSubscription = reactive({
  name: '', cost: '', renewalDate: toISO(new Date()), type: 'Entertainment', frequency: 'monthly',
})
const newOutgoing = reactive({
  name: '', cost: '', renewalDate: toISO(new Date()), frequency: 'monthly',
})

async function apiRequest(path, options = {}) {
  const response = await fetch(`http://localhost:3000/api/overview${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || `Request failed (HTTP ${response.status}).`)
  return payload
}


async function saveIncome() {
  const amount = Number(incomeDraft.value)

  if (!Number.isFinite(amount) || amount < 0) {
    actionError.value = 'Enter a valid income amount.'
    return
  }

  savingChanges.value = true
  actionError.value = ''

  try {
    await apiRequest(`/income?userId=${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ income: amount }),
    })

    await loadOverviewData()
    incomeEditing.value = false
  } catch (error) {
    actionError.value = error.message
  } finally {
    savingChanges.value = false
  }
}


async function createSubscription() {
  const cost = Number(newSubscription.cost)
  if (!newSubscription.name.trim() || !(cost > 0) || !newSubscription.renewalDate) {
    actionError.value = 'Enter a subscription name, positive cost and renewal date.'
    return
  }
  savingChanges.value = true
  actionError.value = ''
  try {
    await apiRequest('/subscriptions', {
      method: 'POST', body: JSON.stringify({
        userId, name: newSubscription.name.trim(), cost,
        renewalDate: newSubscription.renewalDate,
        type: newSubscription.type, frequency: newSubscription.frequency,
      }),
    })
    Object.assign(newSubscription, { name: '', cost: '', renewalDate: toISO(new Date()), type: 'Entertainment', frequency: 'monthly' })
    await loadOverviewData()
  } catch (error) {
    actionError.value = error.message
  } finally {
    savingChanges.value = false
  }
}

async function deleteSubscription(id) {
  if (!window.confirm('Delete this subscription?')) return
  savingChanges.value = true
  actionError.value = ''
  try {
    await apiRequest(`/subscriptions/${id}?userId=${userId}`, { method: 'DELETE' })
    await loadOverviewData()
  } catch (error) {
    actionError.value = error.message
  } finally {
    savingChanges.value = false
  }
}

async function createOutgoing() {
  const cost = Number(newOutgoing.cost)
  if (!newOutgoing.name.trim() || !(cost > 0) || !newOutgoing.renewalDate) {
    actionError.value = 'Enter a bill name, positive cost and due date.'
    return
  }
  savingChanges.value = true
  actionError.value = ''
  try {
    await apiRequest('/outgoings', {
      method: 'POST', body: JSON.stringify({
        userId, name: newOutgoing.name.trim(), cost,
        renewalDate: newOutgoing.renewalDate, frequency: newOutgoing.frequency,
      }),
    })
    Object.assign(newOutgoing, { name: '', cost: '', renewalDate: toISO(new Date()), frequency: 'monthly' })
    await loadOverviewData()
  } catch (error) {
    actionError.value = error.message
  } finally {
    savingChanges.value = false
  }
}

async function deleteOutgoing(id) {
  if (!window.confirm('Delete this outgoing bill?')) return
  savingChanges.value = true
  actionError.value = ''
  try {
    await apiRequest(`/outgoings/${id}?userId=${userId}`, { method: 'DELETE' })
    await loadOverviewData()
  } catch (error) {
    actionError.value = error.message
  } finally {
    savingChanges.value = false
  }
}

onMounted(loadOverviewData)

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------
const sum = (list) => list.reduce((total, item) => total + Number(item.amount), 0)

const totalSubscriptions = computed(() => sum(subscriptions.value))
const totalOutgoings = computed(() => sum(outgoings.value))
const available = computed(() => income.value - totalSubscriptions.value - totalOutgoings.value)
const leftover = computed(() => Math.max(0, available.value))

const pct = (part) =>
  income.value > 0 ? Math.min(100, Math.max(0, (part / income.value) * 100)) : 0

const subsPct = computed(() => pct(totalSubscriptions.value))
const outPct = computed(() => pct(totalOutgoings.value))
const availablePct = computed(() => pct(Math.max(0, available.value)))

// ---------------------------------------------------------------------------
// Goals, checklists and savings
// ---------------------------------------------------------------------------
const upcomingGoals = computed(() =>
  goals.value
    .map((g) => {
      const itemTotal = g.items.reduce((t, i) => t + Number(i.cost), 0)
      const target = itemTotal > 0 ? itemTotal : Number(g.targetAmount || 0)
      const bought = g.items.filter((i) => i.done).reduce((t, i) => t + Number(i.cost), 0)
      const setAside = Number(g.initialSaved || 0) +
        g.contributions.reduce((t, c) => t + Number(c.amount), 0)
      const covered = Math.max(bought, setAside)
      const remaining = Math.max(0, target - covered)
      const due = new Date(g.date)
      const daysLeft = Math.ceil((due - today) / 86400000)
      const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30))
      const boughtPct = target > 0 ? Math.min(100, (bought / target) * 100) : 0
      const extraPct =
        target > 0 ? Math.min(100 - boughtPct, (Math.max(0, setAside - bought) / target) * 100) : 0
      return {
        goal: g,
        target,
        bought,
        setAside,
        covered,
        remaining,
        due,
        daysLeft,
        boughtPct,
        extraPct,
        progress: boughtPct + extraPct,
        perMonth: remaining / monthsLeft,
      }
    })
    .filter((g) => g.daysLeft >= 0)
    .sort((a, b) => a.due - b.due)
)

const monthlyGoalTotal = computed(() =>
  upcomingGoals.value.reduce((total, g) => total + g.perMonth, 0)
)
const afterGoals = computed(() => available.value - monthlyGoalTotal.value)

async function addItem(goal) {
  const cost = Number(goal.draft.cost)
  const label = goal.draft.label.trim()
  if (!label || !(cost > 0)) return
  savingChanges.value = true
  actionError.value = ''
  try {
    await apiRequest(`/goals/${goal.id}/items`, {
      method: 'POST',
      body: JSON.stringify({ userId, label, cost }),
    })
    goal.draft.label = ''
    goal.draft.cost = ''
    await loadOverviewData()
  } catch (error) {
    actionError.value = error.message
  } finally {
    savingChanges.value = false
  }
}

async function removeItem(goal, itemId) {
  savingChanges.value = true
  actionError.value = ''
  try {
    await apiRequest(`/goals/${goal.id}/items/${itemId}?userId=${userId}`, { method: 'DELETE' })
    await loadOverviewData()
  } catch (error) {
    actionError.value = error.message
  } finally {
    savingChanges.value = false
  }
}

async function setItemPurchased(goal, item, purchased) {
  savingChanges.value = true
  actionError.value = ''
  try {
    await apiRequest(`/goals/${goal.id}/items/${item.id}/purchased?userId=${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ purchased }),
    })
    item.done = purchased
    await loadOverviewData()
  } catch (error) {
    actionError.value = error.message
    await loadOverviewData()
  } finally {
    savingChanges.value = false
  }
}

async function addSavings(goal) {
  const amount = Number(goal.saveDraft)
  if (!(amount > 0)) return
  savingChanges.value = true
  actionError.value = ''
  try {
    await apiRequest(`/goals/${goal.id}/savings`, {
      method: 'POST',
      body: JSON.stringify({ userId, amount }),
    })
    goal.saveDraft = ''
    await loadOverviewData()
  } catch (error) {
    actionError.value = error.message
  } finally {
    savingChanges.value = false
  }
}

const newGoal = reactive({ name: '', date: '' })
async function addGoal() {
  if (!newGoal.name.trim() || !newGoal.date) return
  savingChanges.value = true
  actionError.value = ''
  try {
    await apiRequest('/goals', {
      method: 'POST',
      body: JSON.stringify({ userId, name: newGoal.name.trim(), date: newGoal.date }),
    })
    newGoal.name = ''
    newGoal.date = ''
    await loadOverviewData()
  } catch (error) {
    actionError.value = error.message
  } finally {
    savingChanges.value = false
  }
}

async function deleteGoal(goal) {
  if (!window.confirm(`Delete the goal "${goal.name}" and all its checklist items?`)) return
  savingChanges.value = true
  actionError.value = ''
  try {
    await apiRequest(`/goals/${goal.id}?userId=${userId}`, { method: 'DELETE' })
    await loadOverviewData()
  } catch (error) {
    actionError.value = error.message
  } finally {
    savingChanges.value = false
  }
}

// ---------------------------------------------------------------------------
// Spending: transactions vs category budgets for a chosen month
// ---------------------------------------------------------------------------
const viewMonth = ref(new Date(lastMonthStart)) // starts on last month

const monthKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const monthKey = computed(() => monthKeyOf(viewMonth.value))
const lastMonthKey = monthKeyOf(lastMonthStart)
const isLastMonth = computed(() => monthKey.value === lastMonthKey)
const monthLabel = computed(() =>
  viewMonth.value.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
)
const monthStartISO = computed(() => `${monthKey.value}-01`)
const monthEndISO = computed(() =>
  toISO(new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth() + 1, 0))
)
const canGoNext = computed(
  () =>
    viewMonth.value.getFullYear() * 12 + viewMonth.value.getMonth() <
    today.getFullYear() * 12 + today.getMonth()
)

function shiftMonth(delta) {
  viewMonth.value = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth() + delta, 1)
}

const monthTransactions = computed(() =>
  transactions.value
    .filter((t) => t.date.slice(0, 7) === monthKey.value)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
)

const categoryStats = computed(() =>
  categories.value.map((c) => {
    const spent = monthTransactions.value
      .filter((t) => t.category === c.id)
      .reduce((total, t) => total + Number(t.amount), 0)
    const budget = Number(c.budget) || 0
    const ratio = budget > 0 ? spent / budget : spent > 0 ? Infinity : 0
    const status = ratio > 1 ? 'over' : ratio >= 0.85 ? 'near' : 'ok'
    return {
      cat: c,
      spent,
      budget,
      diff: budget - spent,
      status,
      width: Math.min(100, ratio * 100),
    }
  })
)

const totalSpent = computed(() => categoryStats.value.reduce((t, s) => t + s.spent, 0))
const totalBudget = computed(() => categoryStats.value.reduce((t, s) => t + s.budget, 0))
const overCategories = computed(() => categoryStats.value.filter((s) => s.status === 'over'))
const overTotal = computed(() => overCategories.value.reduce((t, s) => t + (s.spent - s.budget), 0))
const totalWidth = computed(() =>
  totalBudget.value > 0 ? Math.min(100, (totalSpent.value / totalBudget.value) * 100) : 0
)

const categoryFilter = ref('all')
const shownTransactions = computed(() =>
  categoryFilter.value === 'all'
    ? monthTransactions.value
    : monthTransactions.value.filter((t) => t.category === categoryFilter.value)
)
const categoryById = (id) => categories.value.find((c) => c.id === id) || {
  id: 'other', name: 'Other', icon: '📦', budget: 0,
}

const newTx = reactive({
  description: '',
  amount: '',
  category: categories.value[0]?.id || 'other',
  date: monthStartISO.value,
})
watch(monthKey, () => {
  newTx.date = monthStartISO.value
})

function addTransaction() {
  const amount = Number(newTx.amount)
  if (!newTx.description.trim() || !(amount > 0) || !newTx.date) return
  const nextId = transactions.value.reduce((m, t) => Math.max(m, t.id), 0) + 1
  transactions.value.push({
    id: nextId,
    description: newTx.description.trim(),
    amount,
    category: newTx.category,
    date: newTx.date,
  })
  newTx.description = ''
  newTx.amount = ''
}

function removeTransaction(id) {
  transactions.value = transactions.value.filter((t) => t.id !== id)
}

// ---------------------------------------------------------------------------
// Invest the rest: how to split leftover money
// rate = assumed annual growth %, saved = counts towards projections
// ---------------------------------------------------------------------------
const buckets = ref([
  { id: 'emergency', name: 'Emergency fund', pct: 20, rate: 4, saved: true, color: '#0ea5e9',
    tip: 'Aim for 3-6 months of essentials in an easy-access account.' },
  { id: 'invest', name: 'Investments', pct: 20, rate: 7, saved: true, color: '#8b5cf6',
    tip: 'Stocks & shares ISA or low-cost index funds. Value can go down as well as up.' },
  { id: 'pension', name: 'Pension top-up', pct: 10, rate: 6, saved: true, color: '#f59e0b',
    tip: 'Long-term. Tax relief can boost what you put in.' },
  { id: 'goals', name: 'Goals fund', pct: 30, rate: 3, saved: true, color: '#22c55e',
    tip: 'Short-term pot for concerts, trips and other plans.' },
  { id: 'spend', name: 'Guilt-free spending', pct: 20, rate: 0, saved: false, color: '#94a3b8',
    tip: 'Money to enjoy. Not included in the projections.' },
])

const presets = {
  Cautious: { emergency: 40, invest: 10, pension: 10, goals: 30, spend: 10 },
  Balanced: { emergency: 20, invest: 20, pension: 10, goals: 30, spend: 20 },
  Growth: { emergency: 10, invest: 35, pension: 15, goals: 25, spend: 15 },
}
const activePreset = ref('Balanced')

function applyPreset(name) {
  activePreset.value = name
  buckets.value.forEach((b) => (b.pct = presets[name][b.id]))
}

const totalPct = computed(() => buckets.value.reduce((t, b) => t + Number(b.pct || 0), 0))
const monthlyFor = (b) => (leftover.value * Number(b.pct || 0)) / 100
const goalsFundMonthly = computed(() => {
  const goalsBucket = buckets.value.find((b) => b.id === 'goals')
  return goalsBucket ? monthlyFor(goalsBucket) : 0
})

// Monthly compounding, contributions at the end of each month
function futureValue(monthly, annualRate, months) {
  const r = annualRate / 100 / 12
  if (r === 0) return monthly * months
  return monthly * ((Math.pow(1 + r, months) - 1) / r)
}

const savedBuckets = computed(() => buckets.value.filter((b) => b.saved))
const monthlySaved = computed(() => savedBuckets.value.reduce((t, b) => t + monthlyFor(b), 0))

const valueAt = (months) =>
  savedBuckets.value.reduce((t, b) => t + futureValue(monthlyFor(b), Number(b.rate || 0), months), 0)
const contributedAt = (months) => monthlySaved.value * months

const horizons = [
  { label: '6 months', months: 6 },
  { label: '1 year', months: 12 },
  { label: '5 years', months: 60 },
  { label: '10 years', months: 120 },
]
const selectedMonths = ref(60)

const horizonCards = computed(() =>
  horizons.map((h) => {
    const value = valueAt(h.months)
    const contributed = contributedAt(h.months)
    return { ...h, value, contributed, growth: value - contributed }
  })
)

const selectedLabel = computed(() => horizons.find((h) => h.months === selectedMonths.value)?.label)

const bucketBreakdown = computed(() =>
  savedBuckets.value.map((b) => ({
    ...b,
    monthly: monthlyFor(b),
    value: futureValue(monthlyFor(b), Number(b.rate || 0), selectedMonths.value),
  }))
)

// ---------------------------------------------------------------------------
// Chart (plain SVG, no libraries)
// ---------------------------------------------------------------------------
const W = 600
const H = 260
const pad = { l: 58, r: 16, t: 16, b: 32 }

const maxVal = computed(() => Math.max(1, valueAt(selectedMonths.value)))
const toX = (m) => pad.l + (m / selectedMonths.value) * (W - pad.l - pad.r)
const toY = (v) => pad.t + (1 - v / maxVal.value) * (H - pad.t - pad.b)

const series = computed(() => {
  const out = []
  for (let m = 0; m <= selectedMonths.value; m++) {
    out.push({ m, value: valueAt(m), contrib: contributedAt(m) })
  }
  return out
})

const valuePath = computed(() => 'M' + series.value.map((p) => `${toX(p.m)},${toY(p.value)}`).join(' L'))
const contribPath = computed(() => 'M' + series.value.map((p) => `${toX(p.m)},${toY(p.contrib)}`).join(' L'))
const areaPath = computed(
  () => `${valuePath.value} L${toX(selectedMonths.value)},${toY(0)} L${toX(0)},${toY(0)} Z`
)

const compact = new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', notation: 'compact', maximumFractionDigits: 1,
})
const yTicks = computed(() =>
  [0, 0.5, 1].map((f) => ({ y: toY(maxVal.value * f), label: compact.format(maxVal.value * f) }))
)
const axisLabel = (m) => {
  if (m === 0) return 'Now'
  if (m < 12) return `${m} mo`
  return `${+(m / 12).toFixed(1)} yr`
}
const xTicks = computed(() =>
  [0, 0.5, 1].map((f) => {
    const m = Math.round(selectedMonths.value * f)
    return { x: toX(m), label: axisLabel(m) }
  })
)

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const money = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(v)
const money0 = (v) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(v)
const formatDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const formatShort = (iso) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const daysLabel = (d) => {
  if (d === 0) return 'Today'
  if (d === 1) return '1 day left'
  if (d < 60) return `${d} days left`
  return `${Math.round(d / 30)} months left`
}
const statusLabel = (s) =>
  s.status === 'over'
    ? `Over by ${money(s.spent - s.budget)}`
    : s.status === 'near'
      ? 'Near limit'
      : `${money(s.diff)} left`
</script>

<template>
  <main class="dashboard ">
    <p v-if="loading" class="card load-message">Loading your dashboard data…</p>
    <section v-else-if="loadError" class="card load-message" role="alert">
      <p>{{ loadError }}</p>
      <button class="btn" type="button" @click="loadOverviewData">Try again</button>
    </section>
    <header class="top">
        
  <div class="top-copy">
    <h1>Dashboard</h1>
    <p class="subtitle">Your month at a glance</p>
    <nav class="tabs" role="tablist">
    <button role="tab" :aria-selected="tab === 'overview'"
            :class="{ active: tab === 'overview' }"
            @click="tab = 'overview'">Overview</button>

    <button role="tab" :aria-selected="tab === 'spending'"
            :class="{ active: tab === 'spending' }"
            @click="tab = 'spending'">Spending</button>

    <button role="tab" :aria-selected="tab === 'invest'"
            :class="{ active: tab === 'invest' }"
            @click="tab = 'invest'">Invest</button>
  </nav>
  </div>

</header>


    <template v-if="!loading && !loadError">
    <!-- Available budget -->
    <section class="card hero" :class="{ negative: available < 0 }">
      <p class="label">Available after subscriptions &amp; outgoings</p>
      <p class="hero-amount">{{ money(available) }}</p>
      <p class="hero-note" v-if="available >= 0">of {{ money(income) }} monthly income</p>
      <p class="hero-note" v-else>You're over budget this month</p>

      <div class="bar" role="img" aria-label="Income breakdown">
        <span class="seg subs" :style="{ width: subsPct + '%' }"></span>
        <span class="seg out" :style="{ width: outPct + '%' }"></span>
        <span class="seg avail" :style="{ width: availablePct + '%' }"></span>
      </div>

      <ul class="legend">
        <li><i class="dot subs"></i>Subscriptions</li>
        <li><i class="dot out"></i>Outgoings</li>
        <li><i class="dot avail"></i>Available</li>
      </ul>
    </section>

    <!-- ===================== OVERVIEW ===================== -->
    <template v-if="tab === 'overview'">
      <section class="stats">
        <div class="card stat">
          <div class="manage-heading">
            <p class="label">Monthly income</p>
            <button class="link-btn" type="button" @click="incomeEditing = !incomeEditing; incomeDraft = String(income)">
              {{ incomeEditing ? 'Cancel' : 'Change' }}
            </button>
          </div>
          <p class="stat-amount">{{ money(income) }}</p>
          <form v-if="incomeEditing" class="manage-form" @submit.prevent="saveIncome">
            <input v-model="incomeDraft" type="number" min="0" step="0.01" aria-label="Monthly income" placeholder="Monthly income, £" />
            <button class="btn" type="submit" :disabled="savingChanges">Save</button>
          </form>
        </div>
        <div class="card stat">
          <p class="label">Subscriptions</p>
          <p class="stat-amount">{{ money(totalSubscriptions) }}</p>
        </div>
        <div class="card stat">
          <p class="label">Outgoings</p>
          <p class="stat-amount">{{ money(totalOutgoings) }}</p>
        </div>
      </section>

      <div class="columns">
        <!-- Upcoming goals -->
        <section class="card">
          <h2>Upcoming goals</h2>

          <p v-if="!upcomingGoals.length" class="empty">No upcoming goals yet.</p>

          <ul class="goal-list">
            <li v-for="g in upcomingGoals" :key="g.goal.id" class="goal">
              <div class="goal-head">
                <span class="goal-icon" aria-hidden="true">{{ g.goal.icon }}</span>
                <div class="goal-title">
                  <strong>{{ g.goal.name }}</strong>
                  <small>{{ formatDate(g.due) }} · {{ daysLabel(g.daysLeft) }}</small>
                </div>
                <span class="goal-target">{{ money(g.target) }}</span>
                <button class="delete-btn" type="button" :disabled="savingChanges" @click="deleteGoal(g.goal)">Delete goal</button>
              </div>

              <div class="progress" role="progressbar"
                   :aria-valuenow="Math.round(g.progress)" aria-valuemin="0" aria-valuemax="100">
                <span class="bought" :style="{ width: g.boughtPct + '%' }"></span>
                <span class="set-aside" :style="{ width: g.extraPct + '%' }"></span>
              </div>

              <p class="goal-foot">
                {{ money(g.covered) }} covered ·
                <strong>{{ money(g.perMonth) }}/month</strong> to stay on track
              </p>
              <p class="goal-sub" v-if="g.setAside > 0 || g.bought > 0">
                {{ money(g.setAside) }} set aside · {{ money(g.bought) }} bought
              </p>

              <form class="save-row" @submit.prevent="addSavings(g.goal)">
                <input v-model="g.goal.saveDraft" type="number" min="0" step="0.01"
                       placeholder="Amount saved, £" :aria-label="`Add savings to ${g.goal.name}`" />
                <button type="submit" class="btn">Add savings</button>
              </form>

              <button class="link-btn" @click="g.goal.open = !g.goal.open" :aria-expanded="g.goal.open">
                {{ g.goal.open ? 'Hide breakdown' : 'Show breakdown' }}
                ({{ g.goal.items.filter((i) => i.done).length }}/{{ g.goal.items.length }} bought)
              </button>

              <div v-if="g.goal.open" class="checklist">
                <ul>
                  <li v-for="item in g.goal.items" :key="item.id" :class="{ done: item.done }">
                    <label>
                      <input type="checkbox" :checked="item.done" :disabled="savingChanges" @change="setItemPurchased(g.goal, item, $event.target.checked)" />
                      <span class="item-label">{{ item.label }}</span>
                    </label>
                    <span class="item-cost">{{ money(item.cost) }}</span>
                    <button class="icon-btn" @click="removeItem(g.goal, item.id)"
                            :aria-label="`Remove ${item.label}`">✕</button>
                  </li>
                </ul>
                <p v-if="!g.goal.items.length" class="empty">Add the costs that make up this goal.</p>

                <form class="add-row" @submit.prevent="addItem(g.goal)">
                  <input v-model="g.goal.draft.label" placeholder="e.g. Merch" aria-label="Item name" />
                  <input v-model="g.goal.draft.cost" type="number" min="0" step="0.01"
                         placeholder="£" aria-label="Cost" />
                  <button type="submit" class="btn">Add</button>
                </form>

                <h3 class="sub-head">Total saved</h3>
                <p class="empty">{{ money(g.goal.initialSaved) }} saved towards this goal.</p>
                <p class="hint">
                  Ticked items count as bought. Money you set aside counts too, and is treated as paying
                  for ticked items first, so nothing is counted twice.
                </p>
              </div>
            </li>
          </ul>

          <p v-if="upcomingGoals.length" class="goal-summary" :class="{ warn: afterGoals < 0 }">
            Saving for all goals needs {{ money(monthlyGoalTotal) }}/month, leaving
            <strong>{{ money(afterGoals) }}</strong> spare.
          </p>

          <form class="add-row new-goal" @submit.prevent="addGoal">
            <input v-model="newGoal.name" placeholder="New goal, e.g. Festival" aria-label="Goal name" />
            <input v-model="newGoal.date" type="date" aria-label="Goal date" />
            <button type="submit" class="btn">Add goal</button>
          </form>
        </section>

        <!-- Subscriptions and outgoings -->
        <section class="card">
          <p v-if="actionError" class="action-error" role="alert">{{ actionError }}</p>
          <h2>Subscriptions</h2>
          <ul class="rows">
            <li v-for="sub in subscriptions" :key="sub.id">
              <span>{{ sub.name }}<small>{{ sub.frequency }} · Day {{ sub.day }}</small></span>
              <span class="row-actions"><strong>{{ money(sub.amount) }}</strong>
                <button class="delete-btn" type="button" :disabled="savingChanges" @click="deleteSubscription(sub.id)" :aria-label="`Delete ${sub.name}`">Delete</button>
              </span>
            </li>
          </ul>
          <p v-if="!subscriptions.length" class="empty">No subscriptions yet.</p>
          <form class="manage-form stacked" @submit.prevent="createSubscription">
            <h3>Add subscription</h3>
            <input v-model="newSubscription.name" placeholder="Subscription name" aria-label="Subscription name" />
            <input v-model="newSubscription.cost" type="number" min="0.01" step="0.01" placeholder="Cost, £" aria-label="Subscription cost" />
            <label>Renewal date <input v-model="newSubscription.renewalDate" type="date" aria-label="Renewal date" /></label>
            <select v-model="newSubscription.frequency" aria-label="Subscription frequency">
              <option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
            </select>
            <input v-model="newSubscription.type" placeholder="Type (e.g. Entertainment)" aria-label="Subscription type" />
            <button class="btn" type="submit" :disabled="savingChanges">Add subscription</button>
          </form>

          <h2 class="spaced">Outgoings</h2>
          <ul class="rows">
            <li v-for="item in outgoings" :key="item.id">
              <span>{{ item.name }}<small>{{ item.frequency }}<template v-if="item.renewalDate"> · {{ formatShort(item.renewalDate) }}</template></small></span>
              <span class="row-actions"><strong>{{ money(item.amount) }}</strong>
                <button class="delete-btn" type="button" :disabled="savingChanges" @click="deleteOutgoing(item.id)" :aria-label="`Delete ${item.name}`">Delete</button>
              </span>
            </li>
          </ul>
          <p v-if="!outgoings.length" class="empty">No outgoing bills yet.</p>
          <form class="manage-form stacked" @submit.prevent="createOutgoing">
            <h3>Add outgoing</h3>
            <input v-model="newOutgoing.name" placeholder="Bill name (e.g. Rent)" aria-label="Outgoing name" />
            <input v-model="newOutgoing.cost" type="number" min="0.01" step="0.01" placeholder="Cost, £" aria-label="Outgoing cost" />
            <label>Due date <input v-model="newOutgoing.renewalDate" type="date" aria-label="Outgoing due date" /></label>
            <select v-model="newOutgoing.frequency" aria-label="Outgoing frequency">
              <option value="monthly">Monthly</option><option value="yearly">Yearly</option>
            </select>
            <button class="btn" type="submit" :disabled="savingChanges">Add outgoing</button>
          </form>
        </section>
      </div>
    </template>

    <!-- ===================== SPENDING ===================== -->
    <template v-else-if="tab === 'spending'">
      <section class="card month-card">
        <div class="month-nav">
          <button class="nav-btn" @click="shiftMonth(-1)" aria-label="Previous month">‹</button>
          <div class="month-title">
            <strong>{{ monthLabel }}</strong>
            <span v-if="isLastMonth" class="pill">Last month</span>
          </div>
          <button class="nav-btn" :disabled="!canGoNext" @click="shiftMonth(1)" aria-label="Next month">›</button>
        </div>

        <p class="spent-line">
          <strong>{{ money(totalSpent) }}</strong> spent of {{ money(totalBudget) }} budgeted
        </p>
        <div class="progress big">
          <span :class="totalSpent > totalBudget ? 'fill over' : 'fill ok'" :style="{ width: totalWidth + '%' }"></span>
        </div>

        <p v-if="!monthTransactions.length" class="empty">No transactions for this month yet.</p>
        <p v-else-if="overCategories.length" class="goal-summary warn">
          You went over budget in <strong>{{ overCategories.length }}
          {{ overCategories.length === 1 ? 'area' : 'areas' }}</strong>
          ({{ overCategories.map((s) => s.cat.name).join(', ') }}), by
          <strong>{{ money(overTotal) }}</strong> in total.
        </p>
        <p v-else class="goal-summary">Every area stayed within budget. Nice work.</p>
      </section>

      <div class="columns">
        <!-- Categories -->
        <section class="card">
          <h2>By category</h2>
          <ul class="cats">
            <li v-for="s in categoryStats" :key="s.cat.id" class="cat">
              <div class="cat-head">
                <span class="cat-icon" aria-hidden="true">{{ s.cat.icon }}</span>
                <div class="cat-title">
                  <strong>{{ s.cat.name }}</strong>
                  <small>{{ money(s.spent) }} of {{ money(s.budget) }}</small>
                </div>
                <span class="status" :class="s.status">{{ statusLabel(s) }}</span>
              </div>
              <div class="progress">
                <span class="fill" :class="s.status" :style="{ width: s.width + '%' }"></span>
              </div>
              <label class="budget-edit">
                Monthly budget £
                <input type="number" min="0" step="5" v-model.number="s.cat.budget" />
              </label>
            </li>
          </ul>
        </section>

        <!-- Transactions -->
        <section class="card">
          <h2>Transactions</h2>

          <div class="chips">
            <button class="chip" :class="{ active: categoryFilter === 'all' }"
                    @click="categoryFilter = 'all'">All</button>
            <button v-for="c in categories" :key="c.id" class="chip"
                    :class="{ active: categoryFilter === c.id }" @click="categoryFilter = c.id">
              {{ c.icon }} {{ c.name }}
            </button>
          </div>

          <div class="tx-scroll">
            <ul class="tx-list">
              <li v-for="t in shownTransactions" :key="t.id">
                <span class="cat-icon small" aria-hidden="true">{{ categoryById(t.category).icon }}</span>
                <span class="tx-main">
                  <strong>{{ t.description }}</strong>
                  <small>{{ formatShort(t.date) }} · {{ categoryById(t.category).name }}</small>
                </span>
                <span class="tx-amount">{{ money(t.amount) }}</span>
                <button class="icon-btn" @click="removeTransaction(t.id)"
                        :aria-label="`Remove ${t.description}`">✕</button>
              </li>
            </ul>
            <p v-if="!shownTransactions.length" class="empty">No transactions to show.</p>
          </div>

          <form class="tx-form" @submit.prevent="addTransaction">
            <input v-model="newTx.description" placeholder="What was it?" aria-label="Description" />
            <input v-model="newTx.amount" type="number" min="0" step="0.01" placeholder="£" aria-label="Amount" />
            <select v-model="newTx.category" aria-label="Category">
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <input v-model="newTx.date" type="date" :min="monthStartISO" :max="monthEndISO" aria-label="Date" />
            <button type="submit" class="btn">Add transaction</button>
          </form>
        </section>
      </div>
    </template>

    <!-- ===================== INVEST THE REST ===================== -->
    <template v-else>
      <div class="columns invest">
        <!-- Allocation -->
        <section class="card">
          <h2>Where should the rest go?</h2>
          <p class="intro" v-if="leftover > 0">
            You have <strong>{{ money(leftover) }}</strong> left each month. Here's a suggested split.
          </p>
          <p v-else class="warn-box">
            There's nothing left over this month, so there's nothing to allocate yet.
          </p>

          <div class="chips">
            <button
              v-for="(_, name) in presets" :key="name"
              class="chip" :class="{ active: activePreset === name }"
              @click="applyPreset(name)"
            >{{ name }}</button>
          </div>

          <ul class="buckets">
            <li v-for="b in buckets" :key="b.id" class="bucket">
              <div class="bucket-head">
                <i class="dot" :style="{ background: b.color }"></i>
                <strong>{{ b.name }}</strong>
                <span class="bucket-amt">{{ money(monthlyFor(b)) }}/mo</span>
              </div>
              <div class="bucket-controls">
                <input
                  type="range" min="0" max="100" step="5"
                  v-model.number="b.pct"
                  :style="{ accentColor: b.color }"
                  :aria-label="`${b.name} percentage`"
                  @input="activePreset = ''"
                />
                <span class="pct">{{ b.pct }}%</span>
              </div>
              <small class="tip">{{ b.tip }}</small>
              <label v-if="b.saved" class="rate">
                Assumed growth
                <input type="number" min="0" max="20" step="0.5" v-model.number="b.rate" />
                %/yr
              </label>
            </li>
          </ul>

          <p class="total" :class="{ warn: totalPct !== 100 }">
            Total: {{ totalPct }}%
            <span v-if="totalPct !== 100">
              ({{ totalPct > 100 ? `${totalPct - 100}% over` : `${100 - totalPct}% unallocated` }})
            </span>
          </p>

          <p class="goal-summary" :class="{ warn: monthlyGoalTotal > goalsFundMonthly }">
            Your goals need about <strong>{{ money(monthlyGoalTotal) }}/month</strong>; the goals
            fund puts in <strong>{{ money(goalsFundMonthly) }}/month</strong>.
          </p>
        </section>

        <!-- Projections -->
        <section class="card">
          <h2>How it could grow</h2>

          <div class="horizons">
            <button
              v-for="h in horizonCards" :key="h.months"
              class="horizon" :class="{ active: selectedMonths === h.months }"
              @click="selectedMonths = h.months"
            >
              <span class="label">{{ h.label }}</span>
              <strong>{{ money0(h.value) }}</strong>
              <small>{{ money0(h.contributed) }} in · <em>+{{ money0(h.growth) }}</em></small>
            </button>
          </div>

          <div class="chart-wrap">
            <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="`Projected savings over ${selectedLabel}`">
              <g v-for="t in yTicks" :key="t.y">
                <line :x1="pad.l" :x2="W - pad.r" :y1="t.y" :y2="t.y" class="grid" />
                <text :x="pad.l - 8" :y="t.y + 4" text-anchor="end" class="axis">{{ t.label }}</text>
              </g>
              <text
                v-for="t in xTicks" :key="t.label + t.x"
                :x="t.x" :y="H - 8" class="axis"
                :text-anchor="t.x === xTicks[0].x ? 'start' : t.x === xTicks[2].x ? 'end' : 'middle'"
              >{{ t.label }}</text>
              <path :d="areaPath" class="area" />
              <path :d="contribPath" class="line-contrib" />
              <path :d="valuePath" class="line-value" />
            </svg>
            <ul class="chart-legend">
              <li><i class="swatch"></i>Projected value</li>
              <li><i class="swatch dashed"></i>Just what you put in</li>
            </ul>
          </div>

          <ul class="rows">
            <li v-for="b in bucketBreakdown" :key="b.id">
              <span class="row-name">
                <i class="dot" :style="{ background: b.color }"></i>{{ b.name }}
                <small>{{ money(b.monthly) }}/mo at {{ b.rate }}%</small>
              </span>
              <strong>{{ money0(b.value) }}</strong>
            </li>
          </ul>

          <p class="disclaimer">
            Estimates only, using the growth rates you set and no allowance for inflation, fees or tax.
            Returns aren't guaranteed and investments can fall in value. This isn't financial advice.
          </p>
        </section>
      </div>
    </template>
    </template>
  </main>
</template>

<style scoped>
.dashboard {
  --bg: #347e4f;
  --card: #ffffff;
  --text: #111827;
  --muted: #6b7280;
  --border: #e5e7eb;
  --blue: #2563eb;
  --green: #157338;
  --orange: #f59e0b;
  --red: #dc2626;

  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  box-sizing: border-box;
}

.dashboard *,
.dashboard *::before,
.dashboard *::after {
  box-sizing: border-box;
}

.top,
.hero,
.tabs,
.stats,
.month-card,
.columns {
  max-width: 1500px;
  margin-left: auto;
  margin-right: auto;
}

.hero {
    max-width: 1500px;
  margin-left: auto;
  margin-right: auto;
  border: 3px solid var(--border);
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 16px;
  background: var(--card);
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
}

.top-copy {
  flex-shrink: 0;
}

.top h1 {
  margin: 0;
  font-size: 1.6rem;
}

.subtitle {
  margin: 4px 0 0;
  color: var(--muted);
}

.tabs {
  display: flex;
  gap: 6px;
  height: 80px;
  width: 560px;
  max-width: 55%;
  margin: 0 0 0 auto;
  padding: 5px;
  border-radius: 8px;
}

.card {
  background: var(--card);
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
}

/* Keep loading/error panels aligned with the dashboard content. */
.load-message {
  width: calc(100% - 32px);
  max-width: 1500px;
  margin: 0 auto 16px;
}
.load-message .btn {
  width: 100%;
}

.label {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
}
.empty {
  color: var(--muted);
}
h2 {
  margin: 0 0 12px;
  font-size: 1.1rem;
}
h2.spaced {
  margin-top: 24px;
}
.sub-head {
  margin: 16px 0 4px;
  font-size: 0.85rem;
  color: var(--muted);
  font-weight: 600;
}

/* Hero */
.hero {
  margin-bottom: 16px;
  background: linear-gradient(135deg, #198544, #60dc9b);
  color: #fff;
}
.hero .label,
.hero .hero-note {
  color: rgba(255, 255, 255, 0.85);
}
.hero.negative {
  background: linear-gradient(135deg, #b91c1c, #ef4444);
}
.hero-amount {
  margin: 6px 0 2px;
  font-size: clamp(2rem, 8vw, 3rem);
  font-weight: 700;
  line-height: 1.1;
}
.hero-note {
  margin: 0 0 16px;
  font-size: 0.9rem;
}

.bar {
  display: flex;
  height: 12px;
  border: 3px solid #0a0a0a;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.25);
}
.seg.subs { background: #153315; }
.seg.out { background: #337b3f; }
.seg.avail { background: #7bf97b; }

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.8rem;
}
.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 6px;
  border: 1px solid #000000;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot.subs { background: #153315; }
.dot.out { background: #337b3f; }
.dot.avail { background: #7bf97b; }

/* Tabs */
.tabs button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  padding: 10px 1px;
  border: none;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.tabs button.active {
  background: var(--card);
  color: var(--text);
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
}

.hide-sm {
  display: none;
}

/* Stats */
.stats {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-bottom: 16px;
}
.stat-amount {
  margin: 4px 0 0;
  font-size: 1.4rem;
  font-weight: 600;
}

/* Columns */
.columns {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

/* Progress bars */
.progress {
  display: flex;
  height: 10px;
  margin: 10px 0 6px;
  border-radius: 999px;
  background: var(--border);
  overflow: hidden;
}
.progress.big {
  height: 14px;
}
.progress span {
  display: block;
  height: 100%;
  transition: width 0.3s;
}
.progress .bought,
.progress .fill.ok {
  background: var(--green);
}
.progress .set-aside {
  background: #6de0b4;
}
.progress .fill {
  border-radius: 999px;
}
.progress .fill.near {
  background: var(--orange);
}
.progress .fill.over {
  background: var(--red);
}
.goal .progress .bought {
  background: var(--green);
}

/* Goals */
.goal-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 24px;
}
.goal-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.goal-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 12px;
  background: #eff6ff;
  font-size: 1.3rem;
}
.goal-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.goal-title small,
.rows small {
  color: var(--muted);
}
.goal-target {
  font-weight: 600;
}
.goal-foot {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
}
.goal-sub {
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: var(--muted);
}
.save-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.save-row input {
  flex: 1;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  font: inherit;
}
.link-btn {
  margin-top: 10px;
  padding: 0;
  border: none;
  background: none;
  color: var(--green);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.goal-summary {
  margin: 18px 0 0;
  padding: 12px;
  border-radius: 12px;
  background: #f0fdf4;
  color: #166534;
  font-size: 0.9rem;
}
.goal-summary.warn {
  background: #fef2f2;
  color: #991b1b;
}

/* Checklist */
.checklist {
  margin-top: 10px;
  padding: 12px;
  border-radius: 12px;
  background: #f9fafb;
}
.checklist ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.checklist li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.checklist li label {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.checklist input[type='checkbox'] {
  width: 20px;
  height: 20px;
  accent-color: var(--green);
}
.checklist li.done .item-label {
  text-decoration: line-through;
  color: var(--muted);
}
.item-cost {
  font-weight: 600;
}
.contrib-list li {
  justify-content: space-between;
}
.contrib-list li span {
  flex: 1;
  color: var(--muted);
}
.hint {
  margin: 12px 0 0;
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--muted);
}
.icon-btn {
  padding: 4px 6px;
  border: none;
  background: none;
  color: var(--muted);
  font-size: 0.85rem;
  cursor: pointer;
}
.icon-btn:hover {
  color: var(--red);
}

.add-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.add-row input {
  flex: 1 1 120px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  font: inherit;
}
.add-row input[type='number'] {
  flex: 0 1 90px;
}
.btn {
  padding: 10px 16px;
  border: none;
  border-radius: 10px;
  background: var(--green);
  color: #fff;
  font: inherit;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.new-goal {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}


.manage-heading, .row-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.manage-heading .label { margin: 0; }
.manage-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
.manage-form.stacked { display: grid; grid-template-columns: 1fr 1fr; padding: 12px 0 18px; border-bottom: 1px solid var(--border); }
.manage-form.stacked h3 { grid-column: 1 / -1; margin: 0; font-size: .95rem; }
.manage-form input, .manage-form select { min-width: 0; width: 100%; padding: 9px; border: 1px solid var(--border); border-radius: 9px; background: #fff; font: inherit; }
.manage-form label { display: flex; flex-direction: column; gap: 4px; color: var(--muted); font-size: .8rem; }
.manage-form .btn { grid-column: 1 / -1; }
.delete-btn { border: 1px solid #fecaca; color: #b91c1c; background: #fff; border-radius: 7px; padding: 5px 8px; cursor: pointer; font: inherit; font-size: .8rem; }
.delete-btn:disabled, .btn:disabled { opacity: .55; cursor: wait; }
.action-error { padding: 9px; color: #991b1b; background: #fee2e2; border-radius: 8px; }
@media (max-width: 560px) { .manage-form.stacked { grid-template-columns: 1fr; } }

/* Lists */
.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
.rows li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.rows li:last-child {
  border-bottom: none;
}
.rows li > span:first-child {
  display: flex;
  flex-direction: column;
}
.rows .row-name {
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 0 4px;
}
.row-name small {
  margin-left: 6px;
}

/* Spending tab */
.month-card {
  margin-bottom: 16px;
}
.month-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.month-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.1rem;
}
.pill {
  padding: 2px 10px;
  border-radius: 999px;
  background: #eff6ff;
  color: var(--green);
  font-size: 0.75rem;
  font-weight: 600;
}
.nav-btn {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
}
.nav-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.spent-line {
  margin: 0;
}

.cats {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 22px;
}
.cat-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.cat-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 12px;
  background: #f1f5f9;
  font-size: 1.3rem;
}
.cat-icon.small {
  width: 34px;
  height: 34px;
  font-size: 1.05rem;
}
.cat-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.cat-title small,
.tx-main small {
  color: var(--muted);
}
.status {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.status.ok {
  background: #f0fdf4;
  color: #166534;
}
.status.near {
  background: #fffbeb;
  color: #92400e;
}
.status.over {
  background: #fef2f2;
  color: #991b1b;
}
.budget-edit {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--muted);
}
.budget-edit input {
  width: 80px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font: inherit;
}

.tx-scroll {
  max-height: 420px;
  overflow-y: auto;
}
.tx-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.tx-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.tx-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.tx-amount {
  font-weight: 600;
}
.tx-form {
  display: grid;
  grid-template-columns: 1fr 100px;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.tx-form input,
.tx-form select {
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  font: inherit;
}
.tx-form .btn {
  grid-column: 1 / -1;
}

/* Invest tab */
.intro {
  margin: 0 0 12px;
  color: var(--muted);
}
.warn-box {
  padding: 10px 12px;
  border-radius: 10px;
  background: #fef2f2;
  color: #991b1b;
  font-size: 0.9rem;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}
.chip {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: #fff;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.chip.active {
  background: var(--green);
  border-color: var(--green);
  color: #fff;
}

.buckets {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 18px;
}
.bucket-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bucket-head .dot {
  margin-right: 0;
}
.bucket-amt {
  margin-left: auto;
  font-weight: 600;
}
.bucket-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 6px 0 2px;
}
.bucket-controls input[type='range'] {
  flex: 1;
  min-width: 0;
}
.pct {
  width: 3rem;
  text-align: right;
  font-weight: 600;
}
.tip {
  display: block;
  color: var(--muted);
}
.rate {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 0.8rem;
  color: var(--muted);
}
.rate input {
  width: 64px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font: inherit;
}
.total {
  margin: 18px 0 0;
  font-weight: 600;
  color: var(--green);
}
.total.warn {
  color: var(--red);
}

.horizons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
}
.horizon {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px;
  border: 2px solid var(--border);
  border-radius: 12px;
  background: #fff;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.horizon strong {
  font-size: 1.15rem;
}
.horizon small {
  color: var(--muted);
  font-size: 0.75rem;
}
.horizon em {
  color: var(--green);
  font-style: normal;
  font-weight: 600;
}
.horizon.active {
  border-color: var(--green);
  background: #f0fdf4;
}

.chart-wrap svg {
  display: block;
  width: 100%;
  height: auto;
}
.grid { stroke: var(--border); stroke-width: 1; }
.axis { fill: var(--muted); font-size: 11px; }
.area { fill: rgba(37, 99, 235, 0.12); }
.line-value { fill: none; stroke: var(--green); stroke-width: 2.5; stroke-linejoin: round; }
.line-contrib { fill: none; stroke: var(--muted); stroke-width: 2; stroke-dasharray: 5 4; }
.chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin: 8px 0 16px;
  padding: 0;
  list-style: none;
  font-size: 0.8rem;
  color: var(--muted);
}
.swatch {
  display: inline-block;
  width: 22px;
  height: 0;
  margin-right: 6px;
  vertical-align: middle;
  border-top: 3px solid var(--green);
}
.swatch.dashed {
  border-top: 2px dashed var(--muted);
}
.disclaimer {
  margin: 14px 0 0;
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--muted);
}

/* Small phones keep tabs compact; wider screens show the Premium pill */
@media (min-width: 600px) {
  .hide-sm {
    display: inline;
  }
  .pro {
    display: inline;
  }
  .pro-icon {
    display: none;
  }
}

/* Tablet and desktop */
@media (min-width: 768px) {
  .dashboard {
    padding: 32px;
  }
  .stats {
    grid-template-columns: repeat(3, 1fr);
  }
  .columns {
    grid-template-columns: 3fr 2fr;
    align-items: start;
  }
  .columns.invest {
    grid-template-columns: 2fr 3fr;
  }
  .card {
    padding: 24px;
  }
  .tabs {
    max-width: 560px;
    margin-left: max(0px, calc((100% - 1100px) / 2));
    margin-right: auto;
  }
  .horizons {
    grid-template-columns: repeat(4, 1fr);
  }
  .tx-form {
    grid-template-columns: 1fr 100px;
  }
}
@media (max-width: 767px) {
  .top {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .tabs {
    width: 100%;
    max-width: 100%;
    margin: 0;
  }
}
</style>