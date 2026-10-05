/** Public engine API. Pure TypeScript: no Firebase, DOM, Date.now() or Math.random(). */
export * from './types';
export { PARAMS, byPace, type Params, type ByPace } from './params';
export { mulberry32, hash32, seedFor, streamRng, randInt, pick, type Rng, type Stream } from './rng';
export { createGame, resolveRound, sanitizeDecision, isFinalRound } from './resolve';
export { validateCard, allowedCards, cardCost } from './cards';
export { emptyPactPrivate, nextPactName, breaches, auditWindow, fineFor } from './pacts';
export {
  BANK,
  MORATORIUM_HEADLINE,
  headline,
  fill,
  trustBand,
  pactFormedHeadline,
  pactJoinedHeadline,
  pactLeftHeadline,
  disclosureHeadline,
} from './headlines';
export { runCounterfactual, attribution, compareIndustry, type CounterfactualResult, type AttributionRow } from './counterfactual';
export { botDecision } from './policies';
export { exposureLabel, exposureOf, estimatedCost, dataLine } from './data';
export {
  buildResults,
  dataLinesOf,
  pactQuarters,
  PACT_QUARTER,
  type PactQuarterCode,
  type FinalResults,
  type FirmFinal,
  type PactFinal,
  type CounterfactualSummary,
} from './results';
