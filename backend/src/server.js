import express from 'express'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { runBrowser } from './browserRunner.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/klyro'

app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Klyro backend is running'
  })
})

app.post('/api/browser/run', async (req, res) => {
  const { url } = req.body || {}

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      error: 'A valid URL string is required'
    })
  }

  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return res.status(400).json({
        error: 'Only HTTP and HTTPS URLs are supported'
      })
    }
  } catch {
    return res.status(400).json({
      error: 'Malformed URL provided'
    })
  }

  try {
    const result = await runBrowser(url)
    return res.json(result)
  } catch (error) {
    const message = error.message ? error.message.split('\n')[0] : 'Failed to navigate to website'
    return res.status(502).json({
      error: message
    })
  }
})

const startServer = async () => {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log(`Connected to MongoDB at ${MONGODB_URI}`)
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error.message)
    process.exit(1)
  }
}

startServer()
