import pool from '../config/db.js'

async function create(username, hashedPassword, access) {
  await pool.execute(
    `INSERT INTO users (username, password, access)
     VALUES (?, ?, ?)`,
    [username, hashedPassword, access]
  )
}

async function findByUsername(username) {
  const [rows] = await pool.execute(
    'SELECT id, username, password, access FROM users WHERE username = ?',
    [username]
  )
  return rows[0]
}

async function getAll() {
  const [rows] = await pool.execute(
    `SELECT id, username, access
     FROM users
     ORDER BY id`
  )
  return rows
}

async function update(id, username, access) {
  const [result] = await pool.query(
    'UPDATE users SET username = ?, access = ? WHERE id = ?',
    [username, access, id]
  )
  return result.affectedRows
}

async function remove(id) {
  const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id])
  return result.affectedRows
}

export default { findByUsername, create, getAll, update, remove }