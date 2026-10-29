export const createRateLimiter = ({ limit, windowMs }) => {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError('Rate limit must be a positive integer')
  }
  if (!Number.isInteger(windowMs) || windowMs < 1) {
    throw new TypeError('Rate limit window must be a positive integer')
  }

  const clients = new Map()

  return (req, res, next) => {
    if (req.method === 'OPTIONS') {
      return next()
    }

    const now = Date.now()
    const clientAddress = req.socket.remoteAddress || 'unknown'
    let client = clients.get(clientAddress)

    if (!client || now >= client.resetAt) {
      for (const [address, entry] of clients) {
        if (now >= entry.resetAt) {
          clients.delete(address)
        }
      }
      client = { count: 0, resetAt: now + windowMs }
      clients.set(clientAddress, client)
    }

    if (client.count >= limit) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((client.resetAt - now) / 1000)))
      return res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED'
      })
    }

    client.count++
    next()
  }
}
