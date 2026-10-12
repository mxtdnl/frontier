/** Shared by `npm run guide:pdf` and tests/ui/guide.test.ts (Session 19 Part E). */

/** Expected page count of the facilitator guide PDF. */
export const GUIDE_PAGES = { min: 25, max: 45 } as const;

/** The PDF must stay under 10 MB. */
export const GUIDE_MAX_BYTES = 10_000_000;

/** Number of page objects in a PDF (`/Type /Page`, not `/Pages`). */
export function pdfPageCount(pdf: Uint8Array): number {
  const text = Buffer.from(pdf).toString('latin1');
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}
