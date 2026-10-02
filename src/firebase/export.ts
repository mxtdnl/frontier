/**
 * Facilitator export (spec §8.4, §14.2): the full game history as JSON and every DATA line
 * as text. Reads hidden nodes (`engine`, `pactsPrivate`), so import it only from `#/control`.
 */
import type { Database } from 'firebase/database';
import { dataLinesOf } from '../engine';
import * as api from './api';
import { engineStateOf, type DecisionNode, type EngineNode, type FirmNode, type MetaNode, type PublicNode, type ResultsNode } from './schema';

export interface ExportParts {
  gameId: string;
  meta: MetaNode;
  public: PublicNode;
  firms: Record<string, FirmNode>;
  engine: EngineNode;
  /** round → firmId → decision as written by the participants. */
  decisions: Record<string, Record<string, DecisionNode>>;
  results: ResultsNode | null;
}

export interface GameExport {
  format: 'frontier-export';
  version: 1;
  gameId: string;
  code: string;
  title: string;
  exportedAt: string;
  meta: MetaNode;
  public: PublicNode;
  firms: Record<string, FirmNode>;
  /** Hidden values: seed, τ, end round. The file is for the facilitator only. */
  engine: { seed: number; tau: number; endMode: EngineNode['endMode']; endRound: number | null; params: EngineNode['params'] };
  /** Pacts with their private violation records. */
  pacts: ReturnType<typeof engineStateOf>['pacts'];
  pactsPrivate: ReturnType<typeof engineStateOf>['pactsPrivate'];
  /** One record per resolved quarter: trust, headlines, audits, disclosure, per-firm outcomes. */
  history: ReturnType<typeof engineStateOf>['history'];
  decisions: ExportParts['decisions'];
  results: ResultsNode | null;
}

export function assembleExport(parts: ExportParts, exportedAt: string): GameExport {
  const state = engineStateOf(parts.engine);
  return {
    format: 'frontier-export',
    version: 1,
    gameId: parts.gameId,
    code: parts.meta.code,
    title: parts.meta.title,
    exportedAt,
    meta: parts.meta,
    public: parts.public,
    firms: parts.firms,
    engine: { seed: state.seed, tau: state.tau, endMode: state.endMode, endRound: state.endRound, params: parts.engine.params },
    pacts: state.pacts,
    pactsPrivate: state.pactsPrivate,
    history: state.history,
    decisions: parts.decisions,
    results: parts.results,
  };
}

/** One DATA line per firm per resolved quarter (§8.4), one per text line. */
export function dataText(engine: EngineNode): string {
  const lines = dataLinesOf(engineStateOf(engine));
  return lines.length ? `${lines.join('\n')}\n` : '';
}

/** Reads everything the export needs, once. */
export async function readExportParts(db: Database, g: string): Promise<ExportParts> {
  const [meta, pub, firms, engine, results] = await Promise.all([
    api.readMeta(db, g),
    api.readPublic(db, g),
    api.readFirms(db, g),
    api.readEngine(db, g),
    api.readResults(db, g).catch(() => null),
  ]);
  if (!meta || !pub || !engine) throw new Error('Session data is missing.');
  const decisions: ExportParts['decisions'] = {};
  const rounds = Array.from({ length: engine.round }, (_, i) => i + 1);
  const all = await Promise.all(rounds.map((r) => api.readDecisions(db, g, r)));
  rounds.forEach((r, i) => {
    const d = all[i];
    if (d && Object.keys(d).length) decisions[String(r)] = d;
  });
  return { gameId: g, meta, public: pub, firms, engine, decisions, results };
}

/** Starts a browser download of `content` as `filename`. */
export function download(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
