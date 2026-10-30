import './PerformanceMetricsPanel.css'

function formatMetricMs(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return `${value} ms`
  }
  return 'Not available'
}

function formatMetricBytes(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return `${value} B`
  }
  return 'Not available'
}

function PerformanceMetricsPanel({ metrics }) {
  const metricValues = [
    {
      id: 'navigation-duration',
      label: 'Navigation duration',
      value: formatMetricMs(metrics?.navigationDurationMs)
    },
    {
      id: 'dom-content-loaded',
      label: 'DOM Content Loaded',
      value: formatMetricMs(metrics?.domContentLoadedDurationMs)
    },
    {
      id: 'first-contentful-paint',
      label: 'First Contentful Paint (FCP)',
      value: formatMetricMs(metrics?.firstContentfulPaintMs)
    },
    {
      id: 'largest-contentful-paint',
      label: 'Largest Contentful Paint (LCP)',
      value: formatMetricMs(metrics?.largestContentfulPaintMs)
    },
    {
      id: 'total-transferred-bytes',
      label: 'Total transferred bytes',
      value: formatMetricBytes(metrics?.totalTransferredBytes)
    }
  ]

  return (
    <div className="perf-metrics-container" aria-label="Performance Metrics">
      <div className="perf-metrics-grid">
        {metricValues.map(({ id, label, value }) => (
          <div className="perf-metric-card" data-metric={id} key={id}>
            <span className="perf-metric-label">{label}</span>
            <span className={`perf-metric-value ${value === 'Not available' ? 'value-unavailable' : ''}`}>
              {value}
            </span>
          </div>
        ))}
      </div>
      {metrics?.transferredBytesDescription && (
        <p className="perf-metrics-description">{metrics.transferredBytesDescription}</p>
      )}
    </div>
  )
}

export default PerformanceMetricsPanel
