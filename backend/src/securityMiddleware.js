export const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.removeHeader('X-Powered-By')
  next()
}

export const handleServerError = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error)
  }

  console.error('Unhandled server error')

  const statusCode = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500

  return res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : 'Request could not be processed'
  })
}
