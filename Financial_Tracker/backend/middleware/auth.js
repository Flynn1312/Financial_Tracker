import jwt from 'jsonwebtoken'

const secret = process.env.JWT_SECRET

// Fail loudly at startup instead of silently accepting unsigned tokens.
if (!secret || secret.length < 32) {
  throw new Error('JWT_SECRET is missing or too short (use at least 32 characters).')
}

// Creates the signed token returned at login.
export function signToken(user) {
  return jwt.sign({ id: user.id, access: user.access }, secret, { expiresIn: '8h' })
}

// Reads "Authorization: Bearer <token>", verifies it and sets req.user.
// The user id comes from the signed token, never from the request body or query.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (!token) return res.status(401).json({ message: 'Please log in.' })

  try {
    const payload = jwt.verify(token, secret)
    req.user = { id: Number(payload.id), access: payload.access }
    next()
  } catch {
    return res.status(401).json({ message: 'Your session has expired. Please log in again.' })
  }
}

// Only lets through users whose access level is in the list.
export function requireAccess(...levels) {
  return (req, res, next) => {
    if (!req.user || !levels.includes(req.user.access)) {
      return res.status(403).json({ message: 'You do not have access to this.' })
    }
    next()
  }
}