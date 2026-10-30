import './TopBar.css'

function TopBar() {
  return (
    <header className="top-bar">
      <div className="top-bar-context">
        <span className="top-bar-overline">KLYRO / WORKSPACE</span>
        <span className="top-bar-title">Website quality</span>
      </div>
      <a className="top-bar-action" href="#run-test">Run a test <span aria-hidden="true">↗</span></a>
    </header>
  )
}

export default TopBar
