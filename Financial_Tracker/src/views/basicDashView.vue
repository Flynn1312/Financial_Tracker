<script setup>
import { ref, computed } from 'vue'

// ---------------------------------------------------------------------------
// Sample data. Replace with your API calls (see onMounted example below).
// ---------------------------------------------------------------------------
const income = ref(2400)

const subscriptions = ref([
  { id: 1, name: 'Spotify', amount: 11.99, day: 3 },
  { id: 2, name: 'Netflix', amount: 10.99, day: 12 },
  { id: 3, name: 'Gym', amount: 24.99, day: 1 },
  { id: 4, name: 'Phone plan', amount: 18.0, day: 20 },
])

const outgoings = ref([
  { id: 1, name: 'Rent', amount: 750 },
  { id: 2, name: 'Utilities', amount: 95 },
  { id: 3, name: 'Groceries', amount: 280 },
  { id: 4, name: 'Transport', amount: 120 },
])

const goals = ref([
  { id: 1, name: 'Concert tickets', icon: '🎤', target: 180, saved: 95, date: '2026-12-20' },
  { id: 2, name: 'Weekend away', icon: '🧳', target: 400, saved: 120, date: '2027-02-14' },
  { id: 3, name: 'New headphones', icon: '🎧', target: 250, saved: 40, date: '2027-04-01' },
])

/*
// Example: load real data from your backend instead
import { onMounted } from 'vue'
onMounted(async () => {
  const res = await fetch('http://localhost:3000/api/dashboard')
  const data = await res.json()
  income.value = data.income
  subscriptions.value = data.subscriptions
  outgoings.value = data.outgoings
  goals.value = data.goals
})
*/

// ---------------------------------------------------------------------------
// Calculations
// ---------------------------------------------------------------------------
const sum = (list) => list.reduce((total, item) => total + Number(item.amount), 0)

const totalSubscriptions = computed(() => sum(subscriptions.value))
const totalOutgoings = computed(() => sum(outgoings.value))
const totalCommitted = computed(() => totalSubscriptions.value + totalOutgoings.value)
const available = computed(() => income.value - totalCommitted.value)

const pct = (part) =>
  income.value > 0 ? Math.min(100, Math.max(0, (part / income.value) * 100)) : 0

const subsPct = computed(() => pct(totalSubscriptions.value))
const outPct = computed(() => pct(totalOutgoings.value))
const availablePct = computed(() => pct(Math.max(0, available.value)))

const today = new Date()
today.setHours(0, 0, 0, 0)

const upcomingGoals = computed(() =>
  goals.value
    .map((g) => {
      const due = new Date(g.date)
      const msPerDay = 1000 * 60 * 60 * 24
      const daysLeft = Math.ceil((due - today) / msPerDay)
      const remaining = Math.max(0, g.target - g.saved)
      const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30))
      return {
        ...g,
        due,
        daysLeft,
        remaining,
        progress: Math.min(100, (g.saved / g.target) * 100),
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

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const money = (value) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value)

const formatDate = (date) =>
  date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const daysLabel = (days) => {
  if (days === 0) return 'Today'
  if (days === 1) return '1 day left'
  if (days < 60) return `${days} days left`
  return `${Math.round(days / 30)} months left`
}
</script>

<template>
  <main class="dashboard">
    <header class="top">
      <h1>Dashboard</h1>
      <p class="subtitle">Your month at a glance</p>
    </header>

    <!-- Available budget -->
    <section class="card hero" :class="{ negative: available < 0 }">
      <p class="label">Available after subscriptions &amp; outgoings</p>
      <p class="hero-amount">{{ money(available) }}</p>
      <p class="hero-note" v-if="available >= 0">
        of {{ money(income) }} monthly income
      </p>
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

    <!-- Summary stats -->
    <section class="stats">
      <div class="card stat">
        <p class="label">Income</p>
        <p class="stat-amount">{{ money(income) }}</p>
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
          <li v-for="goal in upcomingGoals" :key="goal.id" class="goal">
            <div class="goal-head">
              <span class="goal-icon" aria-hidden="true">{{ goal.icon }}</span>
              <div class="goal-title">
                <strong>{{ goal.name }}</strong>
                <small>{{ formatDate(goal.due) }} · {{ daysLabel(goal.daysLeft) }}</small>
              </div>
              <span class="goal-target">{{ money(goal.target) }}</span>
            </div>

            <div class="progress" role="progressbar"
                 :aria-valuenow="Math.round(goal.progress)" aria-valuemin="0" aria-valuemax="100">
              <span :style="{ width: goal.progress + '%' }"></span>
            </div>

            <p class="goal-foot">
              {{ money(goal.saved) }} saved ·
              <strong>{{ money(goal.perMonth) }}/month</strong> to stay on track
            </p>
          </li>
        </ul>

        <p v-if="upcomingGoals.length" class="goal-summary" :class="{ warn: afterGoals < 0 }">
          Saving for all goals needs {{ money(monthlyGoalTotal) }}/month, leaving
          <strong>{{ money(afterGoals) }}</strong> spare.
        </p>
      </section>

      <!-- Subscriptions and outgoings -->
      <section class="card">
        <h2>Subscriptions</h2>
        <ul class="rows">
          <li v-for="sub in subscriptions" :key="sub.id">
            <span>{{ sub.name }}<small>Day {{ sub.day }}</small></span>
            <span>{{ money(sub.amount) }}</span>
          </li>
        </ul>

        <h2 class="spaced">Outgoings</h2>
        <ul class="rows">
          <li v-for="item in outgoings" :key="item.id">
            <span>{{ item.name }}</span>
            <span>{{ money(item.amount) }}</span>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>

<style scoped>
.dashboard {
  --bg: #f3f5fa;
  --card: #ffffff;
  --text: #111827;
  --muted: #6b7280;
  --border: #e5e7eb;
  --blue: #2563eb;
  --green: #16a34a;
  --orange: #f59e0b;
  --red: #dc2626;

  min-height: 100vh;
  padding: 16px;
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

.top {
  max-width: 1100px;
  margin: 0 auto 16px;
}
.top h1 {
  margin: 0;
  font-size: 1.6rem;
}
.subtitle {
  margin: 4px 0 0;
  color: var(--muted);
}

.card {
  background: var(--card);
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
}

.top,
.hero,
.stats,
.columns {
  max-width: 1100px;
  margin-left: auto;
  margin-right: auto;
}

.label {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
}

/* Hero */
.hero {
  margin-bottom: 16px;
  background: linear-gradient(135deg, #1d4ed8, #3b82f6);
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
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.25);
}
.seg.subs { background: #fbbf24; }
.seg.out { background: #f87171; }
.seg.avail { background: #4ade80; }

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
  border-radius: 50%;
}
.dot.subs { background: #fbbf24; }
.dot.out { background: #f87171; }
.dot.avail { background: #4ade80; }

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
h2 {
  margin: 0 0 12px;
  font-size: 1.1rem;
}
h2.spaced {
  margin-top: 24px;
}

/* Goals */
.goal-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 18px;
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
.progress {
  height: 10px;
  margin: 10px 0 6px;
  border-radius: 999px;
  background: var(--border);
  overflow: hidden;
}
.progress span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--blue);
}
.goal-foot {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
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
.empty {
  color: var(--muted);
}

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
.rows li span:first-child {
  display: flex;
  flex-direction: column;
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
  .card {
    padding: 24px;
  }
}
</style>