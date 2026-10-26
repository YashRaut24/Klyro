import mongoose from 'mongoose'

const scheduledTestSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (v) => {
          if (!v || typeof v !== 'string') return false
          try {
            const parsed = new URL(v.trim())
            return parsed.protocol === 'http:' || parsed.protocol === 'https:'
          } catch {
            return false
          }
        },
        message: 'Invalid URL: must be a valid HTTP or HTTPS URL'
      }
    },
    intervalMinutes: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (v) => typeof v === 'number' && Number.isFinite(v) && v >= 1,
        message: 'Invalid interval: must be a positive number of at least 1 minute'
      }
    },
    enabled: {
      type: Boolean,
      default: true
    },
    jobId: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
)

scheduledTestSchema.index({ url: 1 }, { unique: true })

scheduledTestSchema.set('toJSON', { virtuals: true })
scheduledTestSchema.set('toObject', { virtuals: true })

const ScheduledTest = mongoose.model('ScheduledTest', scheduledTestSchema)

export { ScheduledTest }
export default ScheduledTest
