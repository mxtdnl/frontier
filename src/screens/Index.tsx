const LINKS: ReadonlyArray<[string, string, string]> = [
  ['#/new', 'NEW', 'Facilitator sign-in and new session'],
  ['#/play/demo?state=open', 'PLAY', 'Participant control centre (static preview)'],
  ['#/results/demo?panel=1', 'RESULTS', 'Results sequence'],
  ['#/kit', 'KIT', 'Component kit'],
];

export function Index() {
  return (
    <div className="page stack">
      <h1 className="signal">FRONTIER</h1>
      <p className="dim">Select a view. The projector board and the console open from the new-session page after sign-in.</p>
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
