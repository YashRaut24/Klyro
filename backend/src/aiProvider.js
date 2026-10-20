import Groq from 'groq-sdk'
import { prepareAiAnalysisInput } from './aiFailureAnalyzer.js'

const SYSTEM_PROMPT = `You are Klyro's automated failure analysis assistant.
Your task is to analyze browser test findings and provide concise explanations of likely root causes, actionable remediation suggestions, and two distinct remediation approaches: a Quick Fix and a Structural Fix.

Rules:
1. Base your explanation and fixes strictly on the provided findings and evidence.
2. Do not invent new browser events, URLs, repository files, or errors not present in the input.
3. If the available evidence is insufficient to specify exact code or project files, explicitly state that in "suggestedChange" rather than guessing or inventing source files.
4. Provide two distinct remediation approaches:
   - "quickFix": A minimal, conservative change intended to address the immediate problem.
   - "structuralFix": A broader architectural, systemic, or configuration improvement intended to address the underlying root cause.
5. Each approach must include:
   - "title": A concise, descriptive title.
   - "explanation": Why and how this approach resolves the issue.
   - "suggestedChange": Suggested code or configuration snippet when supported by evidence. If evidence is insufficient, state: "Insufficient evidence to provide exact code changes without inspecting source files."
   - "tradeOffs": Trade-offs, risks, migration effort, or limitations of this approach.
6. Never claim that a suggested fix has been applied or verified.
7. You must respond with valid JSON matching this schema:
{
  "explanation": "A concise explanation of the likely cause of the observed failures.",
  "remediations": [
    {
      "summary": "Short title of the recommended action.",
      "suggestion": "Concrete steps to resolve or investigate the issue."
    }
  ],
  "dualApproach": {
    "quickFix": {
      "title": "Short title of the quick fix",
      "explanation": "Minimal, conservative change to address the immediate problem.",
      "suggestedChange": "Concrete code snippet or statement of insufficient evidence.",
      "tradeOffs": "Trade-offs or limitations of this immediate fix."
    },
    "structuralFix": {
      "title": "Short title of the structural fix",
      "explanation": "Broader architectural or configuration improvement addressing the root cause.",
      "suggestedChange": "Architectural or configuration change or statement of insufficient evidence.",
      "tradeOffs": "Trade-offs or considerations of this structural fix."
    }
  }
}`

export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b'

export const analyzeWithGroq = async (testRunOrFindings, options = {}) => {
  const preparedInput = prepareAiAnalysisInput(testRunOrFindings, options.metadata || {})
  const model = options.model || process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL

  if (preparedInput.findings.length === 0) {
    return {
      status: 'clean',
      model,
      explanation: 'No failure findings detected. The website loaded and completed all checks without errors.',
      remediations: [],
      dualApproach: null,
      approaches: null,
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
          content: `Analyze the following browser test failure findings and provide root cause explanations, remediations, and dual-approach quick and structural fixes:\n\n${JSON.stringify(preparedInput, null, 2)}`
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

  const rawDualApproach = parsed.dualApproach || parsed.approaches
  if (!rawDualApproach || typeof rawDualApproach !== 'object') {
    const error = new Error('Groq response missing required "dualApproach" object.')
    error.code = 'MALFORMED_RESPONSE'
    error.status = 502
    throw error
  }

  if (!rawDualApproach.quickFix || typeof rawDualApproach.quickFix !== 'object') {
    const error = new Error('Groq response missing required "quickFix" approach.')
    error.code = 'MALFORMED_RESPONSE'
    error.status = 502
    throw error
  }

  if (!rawDualApproach.structuralFix || typeof rawDualApproach.structuralFix !== 'object') {
    const error = new Error('Groq response missing required "structuralFix" approach.')
    error.code = 'MALFORMED_RESPONSE'
    error.status = 502
    throw error
  }

  const validateApproach = (approach, name) => {
    if (typeof approach.title !== 'string' || !approach.title.trim()) {
      const error = new Error(`Groq response missing required "title" in "${name}".`)
      error.code = 'MALFORMED_RESPONSE'
      error.status = 502
      throw error
    }
    if (typeof approach.explanation !== 'string' || !approach.explanation.trim()) {
      const error = new Error(`Groq response missing required "explanation" in "${name}".`)
      error.code = 'MALFORMED_RESPONSE'
      error.status = 502
      throw error
    }
  }

  validateApproach(rawDualApproach.quickFix, 'quickFix')
  validateApproach(rawDualApproach.structuralFix, 'structuralFix')

  const normalizeApproach = (raw) => {
    const suggestedChange = typeof raw.suggestedChange === 'string' && raw.suggestedChange.trim()
      ? raw.suggestedChange.trim()
      : (typeof raw.codeChange === 'string' && raw.codeChange.trim()
        ? raw.codeChange.trim()
        : 'Insufficient evidence to provide exact code changes without inspecting source files.')

    const tradeOffs = typeof raw.tradeOffs === 'string' && raw.tradeOffs.trim()
      ? raw.tradeOffs.trim()
      : (typeof raw.tradeoffs === 'string' && raw.tradeoffs.trim() ? raw.tradeoffs.trim() : '')

    return {
      title: raw.title.trim(),
      explanation: raw.explanation.trim(),
      suggestedChange,
      tradeOffs
    }
  }

  const dualApproach = {
    quickFix: normalizeApproach(rawDualApproach.quickFix),
    structuralFix: normalizeApproach(rawDualApproach.structuralFix)
  }

  return {
    status: 'analyzed',
    model,
    explanation: parsed.explanation.trim(),
    remediations,
    dualApproach,
    approaches: dualApproach,
    target: preparedInput.target,
    findingsCount: preparedInput.findings.length,
    analyzedAt: new Date().toISOString()
  }
}

export default analyzeWithGroq
