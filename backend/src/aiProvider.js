import Groq from 'groq-sdk'
import { prepareAiAnalysisInput } from './aiFailureAnalyzer.js'

const SYSTEM_PROMPT = `You are Klyro's automated failure analysis assistant.
Your task is to analyze browser test findings and provide concise explanations of likely root causes and actionable remediation suggestions.

Rules:
1. Base your explanation strictly on the provided findings and evidence.
2. Do not invent new browser events, URLs, or errors not present in the input.
3. Provide concrete, actionable remediation suggestions for developers.
4. Never claim that a suggested fix has been applied or verified.
5. You must respond with valid JSON matching this schema:
{
  "explanation": "A concise explanation of the likely cause of the observed failures.",
  "remediations": [
    {
      "summary": "Short title of the recommended action.",
      "suggestion": "Concrete steps to resolve or investigate the issue."
    }
  ]
}`

export const analyzeWithGroq = async (testRunOrFindings, options = {}) => {
  const preparedInput = prepareAiAnalysisInput(testRunOrFindings, options.metadata || {})
  const model = options.model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

  if (preparedInput.findings.length === 0) {
    return {
      status: 'clean',
      model,
      explanation: 'No failure findings detected. The website loaded and completed all checks without errors.',
      remediations: [],
      target: preparedInput.target
    }
  }

  const apiKey = options.apiKey || process.env.GROQ_API_KEY
  if (!options.client && (!apiKey || typeof apiKey !== 'string' || !apiKey.trim())) {
    const error = new Error('Groq API key is not configured. Please set GROQ_API_KEY in the environment.')
    error.code = 'MISSING_API_KEY'
    error.status = 503
    throw error
  }

  const client = options.client || new Groq({ apiKey })

  let completion
  try {
    completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Analyze the following browser test failure findings and provide root cause explanations and remediation suggestions:\n\n${JSON.stringify(preparedInput, null, 2)}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    })
  } catch (err) {
    const status = err.status || (err.message && err.message.includes('429') ? 429 : 502)
    const error = new Error(err.message || 'Groq provider error occurred.')
    error.status = status
    if (status === 429 || (err.message && err.message.toLowerCase().includes('rate limit'))) {
      error.code = 'RATE_LIMIT'
    } else if (status === 401 || (err.message && err.message.toLowerCase().includes('api key'))) {
      error.code = 'AUTH_ERROR'
    } else {
      error.code = 'PROVIDER_ERROR'
    }
    throw error
  }

  const content = completion?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    const error = new Error('Groq provider returned an empty or invalid response.')
    error.code = 'MALFORMED_RESPONSE'
    error.status = 502
    throw error
  }

  let parsed
  try {
    parsed = JSON.parse(content)
  } catch {
    const error = new Error('Failed to parse Groq response as JSON.')
    error.code = 'MALFORMED_RESPONSE'
    error.status = 502
    throw error
  }

  if (!parsed || typeof parsed !== 'object') {
    const error = new Error('Groq response is not a valid JSON object.')
    error.code = 'MALFORMED_RESPONSE'
    error.status = 502
    throw error
  }

  if (typeof parsed.explanation !== 'string' || !parsed.explanation.trim()) {
    const error = new Error('Groq response missing required "explanation" string.')
    error.code = 'MALFORMED_RESPONSE'
    error.status = 502
    throw error
  }

  const rawRemediations = Array.isArray(parsed.remediations) ? parsed.remediations : []
  const remediations = rawRemediations.map((item, index) => {
    if (typeof item === 'string') {
      return {
        id: index + 1,
        summary: `Action item ${index + 1}`,
        suggestion: item.trim()
      }
    }
    return {
      id: index + 1,
      summary: typeof item.summary === 'string' && item.summary.trim() ? item.summary.trim() : `Action item ${index + 1}`,
      suggestion: typeof item.suggestion === 'string' && item.suggestion.trim() ? item.suggestion.trim() : ''
    }
  })

  return {
    status: 'analyzed',
    model,
    explanation: parsed.explanation.trim(),
    remediations,
    target: preparedInput.target,
    findingsCount: preparedInput.findings.length,
    analyzedAt: new Date().toISOString()
  }
}

export default analyzeWithGroq
