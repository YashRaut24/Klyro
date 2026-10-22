import mongoose from 'mongoose'

const pageErrorSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true
    },
    name: {
      type: String,
      default: 'Error'
    }
  },
  {
    _id: false
  }
)

const consoleErrorSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true
    },
    location: {
      url: {
        type: String,
        default: null
      },
      lineNumber: {
        type: Number,
        default: null
      },
      columnNumber: {
        type: Number,
        default: null
      },
      line: {
        type: Number,
        default: null
      },
      column: {
        type: Number,
        default: null
      }
    }
  },
  {
    _id: false
  }
)

const failedRequestSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true
    },
    method: {
      type: String,
      default: null
    },
    failure: {
      type: String,
      default: null
    }
  },
  {
    _id: false
  }
)

const httpErrorSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true
    },
    status: {
      type: Number,
      default: null
    },
    statusText: {
      type: String,
      default: null
    }
  },
  {
    _id: false
  }
)

const findingSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true
    },
    severity: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    evidence: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  {
    _id: false
  }
)

const testRunSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true
    },
    finalUrl: {
      type: String,
      default: null
    },
    title: {
      type: String,
      default: null
    },
    status: {
      type: Number,
      default: null
    },
    pageErrors: {
      type: [pageErrorSchema],
      default: []
    },
    consoleErrors: {
      type: [consoleErrorSchema],
      default: []
    },
    failedRequests: {
      type: [failedRequestSchema],
      default: []
    },
    httpErrors: {
      type: [httpErrorSchema],
      default: []
    },
    findings: {
      type: [findingSchema],
      default: []
    },
    aiAnalysis: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    verificationReport: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    baselineRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestRun',
      default: null
    },
    screenshot: {
      type: String,
      default: null
    },
    screenshotError: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
)

const TestRun = mongoose.model('TestRun', testRunSchema)

export { TestRun }
export default TestRun
