import './TestRunHistoryFilters.css'

const filters = [
  { value: 'all', label: 'All runs' },
  { value: 'verified', label: 'Verified' },
  { value: 'partially_verified', label: 'Partially verified' },
  { value: 'not_verified', label: 'Not verified' },
  { value: 'new_findings', label: 'Runs with new findings' }
]

function TestRunHistoryFilters({ filter, setFilter }) {
  return (
    <div className="history-filter-controls">
      <div className="history-filter-bar" role="toolbar" aria-label="Filter test runs">
        <span className="filter-label">Filter:</span>
        <div className="filter-buttons">
          {filters.map(({ value, label }) => (
            <button
              type="button"
              data-filter={value}
              className={`filter-btn ${filter === value ? 'active' : ''}`}
              onClick={() => setFilter(value)}
              key={value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <select
        className="history-filter-select"
        aria-label="Filter test runs select"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      >
        {filters.map(({ value, label }) => (
          <option value={value} key={value}>{label}</option>
        ))}
      </select>
    </div>
  )
}

export default TestRunHistoryFilters
