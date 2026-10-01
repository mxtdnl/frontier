/** Banned-term rules from spec §15.2 and §15.3. Shared by lint-copy and its tests. */

export interface Violation {
  line: number;
  term: string;
  rule: 'banned' | 'non-telegraphing' | 'emoji';
}

/** Spec §15.2: banned everywhere. */
const BANNED: ReadonlyArray<RegExp> = [
  /\bunlock\w*/i,
  /\bempower\w*/i,
  /\bseamless\w*/i,
  /\brevolutionary\b/i,
  /\bharness\w*/i,
  /\belevate\w*/i,
  /\bsupercharge\w*/i,
  /\bgame-changer\b/i,
  /\bdive in\b/i,
  /\bjourney\b/i,
  /\bwelcome to the future\b/i,
  /\bin today['’]s fast-paced\b/i,
  /\blet['’]s\b/i,
  /\bawesome\b/i,
  /\bgreat job\b/i,
  /\boops\b/i,
  /\bnot just\b[^.\n]{1,60}\bbut\b/i,
];

/** Spec §15.3: banned in participant and projector UI outside the results screen. */
const NON_TELEGRAPHING: ReadonlyArray<RegExp> = [
  /\bcommons\b/i,
  /\btragedy\b/i,
  /\bsustainab\w*/i,
  /\bcooperat\w*/i,
  /\bcollective\w*/i,
  /\bshared resource\b/i,
  /\btipping point\b/i,
  /\bthreshold\b/i,
  /\bcollapse\b/i,
  /\bgames?\b/i,
  /\bplayers?\b/i,
  /\bscores?\b/i,
  /\bwins?\b/i,
  /\blevels?\b/i,
];

/** The single permitted use of "collapse" (spec §15.3). */
export const MORATORIUM_HEADLINE = 'OFS imposes moratorium on frontier deployments; markets collapse';

const EMOJI = /\p{Extended_Pictographic}/u;

export function findViolations(text: string, opts: { allowNonTelegraphing: boolean }): Violation[] {
  const out: Violation[] = [];
  const cleaned = text.split(MORATORIUM_HEADLINE).join(' '.repeat(MORATORIUM_HEADLINE.length));
  cleaned.split('\n').forEach((lineText, i) => {
    for (const re of BANNED) {
      const m = re.exec(lineText);
      if (m) out.push({ line: i + 1, term: m[0], rule: 'banned' });
    }
    if (!opts.allowNonTelegraphing) {
      for (const re of NON_TELEGRAPHING) {
        const m = re.exec(lineText);
        if (m) out.push({ line: i + 1, term: m[0], rule: 'non-telegraphing' });
      }
    }
    const e = EMOJI.exec(lineText);
    if (e) out.push({ line: i + 1, term: e[0], rule: 'emoji' });
  });
  return out;
}
