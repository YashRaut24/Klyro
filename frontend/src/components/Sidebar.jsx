import './Sidebar.css'

const navigationItems = [
  { href: '#run-test', label: 'New test', index: '01' },
  { href: '#history', label: 'Run history', index: '02' },
  { href: '#schedules', label: 'Schedules', index: '03' },
  { href: '#alerts', label: 'Regression alerts', index: '04' }
]

function Sidebar() {
  return (
    <aside className="sidebar">
      <a className="sidebar-brand" href="#main-content" aria-label="Klyro dashboard">
        <span className="sidebar-brand-mark" aria-hidden="true">K</span>
        <span className="sidebar-brand-name">KLYRO</span>
      </a>
      <div className="sidebar-caption">QUALITY WORKSPACE</div>
      <nav className="sidebar-navigation" aria-label="Dashboard sections">
        {navigationItems.map((item) => (
          <a className="sidebar-link" href={item.href} key={item.href}>
            <span className="sidebar-link-index" aria-hidden="true">{item.index}</span>
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-footer-rule" aria-hidden="true" />
        <span>Browser intelligence</span>
        <span>Continuous quality</span>
      </div>
    </aside>
  )
}

export default Sidebar
