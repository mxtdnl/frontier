export function PresenceDot({ online, label }: { online: boolean; label?: string }) {
  return (
    <span
      className={`presence${online ? ' on' : ''}`}
      role="img"
      title={`${label ? label + ' ' : ''}${online ? 'online' : 'offline'}`}
      aria-label={`${label ? label + ' ' : ''}${online ? 'online' : 'offline'}`}
    />
  );
}
