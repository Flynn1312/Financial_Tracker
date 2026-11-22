// Usage (run inside the backend folder, where bcrypt is installed):
//   node hash.js 'TheirPassword'
// Prints a bcrypt hash (12 rounds) to paste into the users table.
// Use SINGLE quotes in PowerShell so any $ characters in the password are kept.
// Don't commit this file.

import bcrypt from 'bcrypt'

const password = process.argv[2]

if (!password) {
  console.error("Usage: node hash.js 'pass1234'")
  process.exit(1)
}

console.log(await bcrypt.hash(password, 12))