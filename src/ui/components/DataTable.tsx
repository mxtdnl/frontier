import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  /** Header content when it is not plain text (e.g. a glyph); `label` still names the column. */
  head?: ReactNode;
  /** Column width in ch. Zero takes the remaining width. */
  w: number;
  align?: 'l' | 'r';
  render: (row: T, index: number) => ReactNode;
  className?: string;
}

interface Props<T> {
  columns: ReadonlyArray<Column<T>>;
  rows: ReadonlyArray<T>;
  rowKey: (row: T) => string;
  /** Row belongs to the viewer's own firm. */
  isOwn?: (row: T) => boolean;
  /** Previous row index, for the reveal swap. */
  prevIndex?: (row: T) => number | undefined;
  /** Extra class for a row, e.g. the last pinned row of a paged board. */
  rowClass?: (row: T) => string | undefined;
  tall?: boolean;
  caption: string;
}

/** Fixed ch columns, right-aligned numerics. */
export function DataTable<T>({ columns, rows, rowKey, isOwn, prevIndex, rowClass, tall, caption }: Props<T>) {
  return (
    <table className={`tbl${tall ? ' tall' : ''}`}>
      <caption className="sr-only">{caption}</caption>
      <colgroup>
        {columns.map((c) => (
          <col key={c.key} style={c.w > 0 ? { width: `${c.w}ch` } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} scope="col" className={c.align === 'r' ? 'num' : ''}>
              {c.head ?? c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={rowKey(row)}
            data-row-key={rowKey(row)}
            data-prev-index={prevIndex?.(row)}
            className={[isOwn?.(row) ? 'own' : '', rowClass?.(row) ?? ''].filter(Boolean).join(' ') || undefined}
            aria-current={isOwn?.(row) ? 'true' : undefined}
          >
            {columns.map((c) => (
              <td key={c.key} className={`${c.align === 'r' ? 'num' : ''} ${c.className ?? ''}`}>
                {c.render(row, i)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
