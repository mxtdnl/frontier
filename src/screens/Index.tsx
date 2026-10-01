const LINKS: ReadonlyArray<[string, string, string]> = [
  ['#/screen/demo?state=open', 'SCREEN', 'Projector board'],
  ['#/play/demo?state=open', 'PLAY', 'Participant control centre'],
  ['#/control/demo', 'CONTROL', 'Facilitator console'],
  ['#/new', 'NEW', 'New session setup'],
  ['#/results/demo?panel=1', 'RESULTS', 'Results sequence'],
  ['#/kit', 'KIT', 'Component kit'],
];

export function Index() {
  return (
    <div className="page stack">
      <h1 className="signal">FRONTIER</h1>
      <p className="dim">Static build. No database connection. Select a view.</p>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: '0.5lh' }}>
        {LINKS.map(([href, k, text]) => (
          <li key={k} className="row" style={{ minHeight: '44px', alignItems: 'center' }}>
            <a href={href} style={{ width: '10ch' }}>{k}</a>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
