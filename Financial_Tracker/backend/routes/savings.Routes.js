// Express routes for savings accounts.
//
// Mount it in your server file, passing in your existing mysql2/promise pool:
//   import savingsRoutes from './savings.routes.js'
//   app.use('/api/savings', savingsRoutes(pool))
//
// Like the dashboard, this trusts userId from the request for now. In production,
// take the id from your auth session instead (req.user.id).

import express from 'express'

export default function savingsRoutes(db) {
  const router = express.Router()

  const getUserId = (req) => Number(req.query.userId ?? req.body?.userId)
  const badRequest = (res, message) => res.status(400).json({ message })
  const isMoney = (n) => Number.isFinite(n) && n >= 0

  // List accounts
  router.get('/', async (req, res) => {
    const userId = getUserId(req)
    if (!userId) return badRequest(res, 'userId is required.')
    try {
      const [rows] = await db.query(
        `SELECT id, account_name, interest_rate, saved, saving_goal
           FROM savings_accounts WHERE user_id = ? ORDER BY created_at, id`,
        [userId]
      )
      res.json({ savings: rows })
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'Could not load savings accounts.' })
    }
  })

  // Create account
  router.post('/', async (req, res) => {
    const userId = getUserId(req)
    const name = String(req.body.name ?? '').trim()
    const interestRate = Number(req.body.interestRate ?? 0)
    const saved = Number(req.body.saved ?? 0)
    const goal = Number(req.body.goal ?? 0)

    if (!userId) return badRequest(res, 'userId is required.')
    if (!name) return badRequest(res, 'Account name is required.')
    if (![interestRate, saved, goal].every(isMoney)) {
      return badRequest(res, 'Interest rate, saved and goal must be zero or more.')
    }

    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()
      const [result] = await conn.query(
        `INSERT INTO savings_accounts (user_id, account_name, interest_rate, saved, saving_goal)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, name.slice(0, 100), interestRate, saved, goal]
      )
      // Record any starting balance so the history adds up to the saved amount.
      if (saved > 0) {
        await conn.query(
          `INSERT INTO savings_transactions (account_id, user_id, amount, reason)
           VALUES (?, ?, ?, 'Opening balance')`,
          [result.insertId, userId, saved]
        )
      }
      await conn.commit()
      res.status(201).json({ id: result.insertId })
    } catch (error) {
      await conn.rollback().catch(() => {})
      console.error(error)
      res.status(500).json({ message: 'Could not create the savings account.' })
    } finally {
      conn.release()
    }
  })

  // Add (positive delta) or remove (negative delta) money. Balance never drops below 0.
  router.patch('/:id/balance', async (req, res) => {
    const userId = getUserId(req)
    const delta = Number(req.body.delta)
    if (!userId) return badRequest(res, 'userId is required.')
    if (!Number.isFinite(delta) || delta === 0) return badRequest(res, 'Enter a valid amount.')

    const reason = String(req.body.reason ?? '').trim().slice(0, 255)
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()

      // Lock the row so the balance and the history entry stay consistent.
      const [rows] = await conn.query(
        'SELECT saved FROM savings_accounts WHERE id = ? AND user_id = ? FOR UPDATE',
        [req.params.id, userId]
      )
      if (!rows.length) {
        await conn.rollback()
        return res.status(404).json({ message: 'Account not found.' })
      }

      const current = Number(rows[0].saved)
      if (delta < 0 && -delta > current) {
        await conn.rollback()
        return badRequest(res, 'You cannot remove more than the saved balance.')
      }

      await conn.query('UPDATE savings_accounts SET saved = saved + ? WHERE id = ?', [delta, req.params.id])
      await conn.query(
        `INSERT INTO savings_transactions (account_id, user_id, amount, reason)
         VALUES (?, ?, ?, ?)`,
        [req.params.id, userId, delta, reason]
      )

      await conn.commit()
      res.json({ ok: true })
    } catch (error) {
      await conn.rollback().catch(() => {})
      console.error(error)
      res.status(500).json({ message: 'Could not update the balance.' })
    } finally {
      conn.release()
    }
  })

  // Deposit / withdrawal history for one account, newest first
  router.get('/:id/history', async (req, res) => {
    const userId = getUserId(req)
    if (!userId) return badRequest(res, 'userId is required.')
    try {
      const [rows] = await db.query(
        `SELECT id, amount, reason, created_at
           FROM savings_transactions
          WHERE account_id = ? AND user_id = ?
          ORDER BY created_at DESC, id DESC`,
        [req.params.id, userId]
      )
      res.json({ history: rows })
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'Could not load the history.' })
    }
  })

  // Delete account
  router.delete('/:id', async (req, res) => {
    const userId = getUserId(req)
    if (!userId) return badRequest(res, 'userId is required.')
    try {
      const [result] = await db.query(
        'DELETE FROM savings_accounts WHERE id = ? AND user_id = ?',
        [req.params.id, userId]
      )
      if (!result.affectedRows) return res.status(404).json({ message: 'Account not found.' })
      res.json({ ok: true })
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'Could not delete the account.' })
    }
  })

  return router
}