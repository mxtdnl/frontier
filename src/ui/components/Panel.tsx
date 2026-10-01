import type { ReactNode } from 'react';

interface Props {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  style?: React.CSSProperties;
}

export function Panel({ title, right, children, className = '', bodyClassName = '', style }: Props) {
  return (
    <section className={`panel ${className}`} style={style} aria-label={title}>
      <div className="panel-title">
        <span>{title}</span>
        {right ? <span>{right}</span> : null}
      </div>
      <div className={`panel-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}
