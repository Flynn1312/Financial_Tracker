import pool from '../config/db.js';

async function getOverviewData(userId) {
  const [subscriptions] = await pool.execute('SELECT * FROM subscriptions WHERE userid = ?', [userId]);
  const [income] = await pool.execute('SELECT * FROM income WHERE userid = ?', [userId]);
  const [goals] = await pool.execute('SELECT * FROM goals WHERE userid = ?', [userId]);
  const [goalProgress] = await pool.execute('SELECT * FROM goal_progress WHERE userid = ?', [userId]);
  const [outgoings] = await pool.execute('SELECT * FROM outgoings WHERE userid = ?', [userId]);
  const [spendingGoals] = await pool.execute('SELECT * FROM spending_goals WHERE userid = ?', [userId]);
  const [spendingTransactions] = await pool.execute('SELECT * FROM spending_transactions WHERE userid = ?', [userId]);
  return { subscriptions, income, goals, goalProgress, outgoings, spendingGoals, spendingTransactions };
}

async function setIncome(userId, amount) {
  const [rows] = await pool.execute('SELECT id FROM income WHERE userid = ? LIMIT 1', [userId]);
  if (rows.length) await pool.execute('UPDATE income SET income = ? WHERE userid = ?', [amount, userId]);
  else await pool.execute('INSERT INTO income (userid, income) VALUES (?, ?)', [userId, amount]);
}

async function createSubscription(userId, s) {
  const [r] = await pool.execute(
    `INSERT INTO subscriptions (userid, sub_name, sub_cost, renewal_date, sub_type, sub_frequency)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, s.sub_name, s.sub_cost, s.renewal_date, s.sub_type, s.sub_frequency]
  );
  return r.insertId;
}
async function deleteSubscription(userId, id) {
  const [r] = await pool.execute('DELETE FROM subscriptions WHERE id = ? AND userid = ?', [id, userId]);
  return r.affectedRows;
}
async function createOutgoing(userId, o) {
  const [r] = await pool.execute(
    `INSERT INTO outgoings (userid, outgoing_name, cost, renewal_date, frequency)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, o.outgoing_name, o.cost, o.renewal_date, o.frequency]
  );
  return r.insertId;
}
async function deleteOutgoing(userId, id) {
  const [r] = await pool.execute('DELETE FROM outgoings WHERE id = ? AND userid = ?', [id, userId]);
  return r.affectedRows;
}

async function recalculateGoal(userId, goalId, connection = pool) {
  const [rows] = await connection.execute(
    `SELECT COALESCE(SUM(item_cost), 0) AS target
     FROM goal_progress WHERE userid = ? AND goalid = ?`, [userId, goalId]
  );
  const target = Number(rows[0]?.target || 0);
  await connection.execute(
    `UPDATE goals SET amount = ?, amount_left = GREATEST(? - amount_saved, 0)
     WHERE id = ? AND userid = ?`, [target, target, goalId, userId]
  );
}

async function createGoal(userId, name, date) {
  const [r] = await pool.execute(
    `INSERT INTO goals (userid, goal_name, goal_type, amount, amount_saved, amount_left, goal_date)
     VALUES (?, ?, 'General', 0, 0, 0, ?)`, [userId, name, date]
  );
  return r.insertId;
}

async function deleteGoal(userId, goalId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM goal_progress WHERE userid = ? AND goalid = ?', [userId, goalId]);
    const [r] = await connection.execute('DELETE FROM goals WHERE id = ? AND userid = ?', [goalId, userId]);
    await connection.commit();
    return r.affectedRows;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createGoalItem(userId, goalId, label, cost) {
  const [owned] = await pool.execute('SELECT id FROM goals WHERE id = ? AND userid = ?', [goalId, userId]);
  if (!owned.length) return 0;
  const [r] = await pool.execute(
    `INSERT INTO goal_progress (userid, goalid, goal_item, item_cost, item_purchased, link)
     VALUES (?, ?, ?, ?, 0, '')`, [userId, goalId, label, cost]
  );
  await recalculateGoal(userId, goalId);
  return r.insertId;
}

async function deleteGoalItem(userId, goalId, itemId) {
  const [r] = await pool.execute(
    'DELETE FROM goal_progress WHERE id = ? AND goalid = ? AND userid = ?', [itemId, goalId, userId]
  );
  if (r.affectedRows) await recalculateGoal(userId, goalId);
  return r.affectedRows;
}

async function updateGoalItemPurchased(userId, goalId, itemId, purchased) {
  const [r] = await pool.execute(
    'UPDATE goal_progress SET item_purchased = ? WHERE id = ? AND goalid = ? AND userid = ?',
    [purchased ? 1 : 0, itemId, goalId, userId]
  );
  return r.affectedRows;
}

async function addGoalSavings(userId, goalId, amount) {
  const [r] = await pool.execute(
    `UPDATE goals SET amount_saved = amount_saved + ?,
       amount_left = GREATEST(amount - (amount_saved + ?), 0)
     WHERE id = ? AND userid = ?`, [amount, amount, goalId, userId]
  );
  return r.affectedRows;
}

export {
  getOverviewData, setIncome, createSubscription, deleteSubscription,
  createOutgoing, deleteOutgoing, createGoal, deleteGoal, createGoalItem,
  deleteGoalItem, updateGoalItemPurchased, addGoalSavings
};
