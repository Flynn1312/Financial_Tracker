import bcrypt from 'bcrypt';
import User from '../models/userModel.js';
import { signToken } from '../middleware/auth.js';

export const register = async (req, res) => {
  try {
    const { username, password } = req.body

    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      !username.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: 'Username and password are required.'
      })
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters.'
      })
    }

    const cleanUsername = username.trim()

    const existingUsers = await User.findByUsername(cleanUsername)
    if (existingUsers) {
      return res.status(409).json({
        message: 'Username is already registered.'
      })
    }

    // Never store plain passwords (unencrypted)
    const hashedPassword = await bcrypt.hash(password, 12)

    // Public sign-ups are always basic. Promote people in the database.
    await User.create(cleanUsername, hashedPassword, 'basic')

    return res.status(201).json({
      success: true,
      message: 'Registration successful!'
    })
  } catch (error) {
    console.error('Registration error:', error.message)
    return res.status(500).json({
      message: 'Something went wrong. Please try again.'
    })
  }
}

export const login = async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({
        message: 'Username and password are required.'
      })
    }

    const user = await User.findByUsername(username)
    if (!user) {
      return res.status(401).json({
        message: 'Invalid username or password.'
      })
    }

    const passwordMatches = await bcrypt.compare(password, user.password)
    if (!passwordMatches) {
      return res.status(401).json({
        message: 'Invalid username or password.'
      })
    }

    res.json({
      success: true,
      message: 'Login successful!',
      token: signToken(user),
      user: {
        id: user.id,
        username: user.username,
        access: user.access
      }
    })
  } catch (error) {
    console.error('Login error:', error.message)
    res.status(500).json({
      message: 'Something went wrong. Please try again.'
    })
  }
}