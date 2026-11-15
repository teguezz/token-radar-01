// Token Radar's model (radar-2): a sealed DefiLlama snapshot in, a ranked board of pre-token
// protocols out. Every number on the board is derived from the snapshot's own figures; no protocol
// name is ever special-cased.
//
// THE VALUATION IS A COMPARABLES MODEL, not a flat guess. The snapshot carries 400+ protocols whose
// token already trades, each with a market cap and a TVL: the market has already priced a dollar of
// TVL in every category. For each category with at least MIN_CATEGORY_COMPS such protocols, the
// board's base multiple is the MEDIAN market-cap/TVL ratio of that category's trading protocols,
// winsorised to [RATIO_FLOOR, RATIO_CAP] so one mania cannot set the price of a whole category.
// Categories too thin to price fall back to the global median over every trading protocol. A
// pre-token protocol's base value is then its own TVL times the multiple of the company it keeps:
//
//   base      = tvl_usd x category_multiple          (the market's revealed price of its TVL)
//   growth    = clamp(change_7d, -50, +100) percent  (a hot week is worth something, not everything)
//   growthMult   = max(0.5, 1 + growth/100 x 0.6)
//   maturity  = 0.70 + 0.50 x sqrt(min(age_days, 1460) / 1460)
//               (a protocol that has run for years with no token has a proven product and a
//                community that stayed anyway; the square root makes the credit saturate)
//   implied   = max(1, round(base x growthMult x maturityMult))
//
// WHO MAY BE RANKED. A protocol is pre-token when its record carries no token: no market cap, no
// CoinGecko id, no symbol (the board says "records no token", never "has none": the record is what
// we can see). A pre-token protocol is rankable when it is not a wrapped, staked or bridged product
// of a token that already trades: its category is not Bridge, Canonical Bridge, Liquid Staking,
// Liquid Restaking, Restaked BTC or CEX, its name carries no whole word wrapped, staked or staking,
// does not end in a version marker (a pool of another protocol) and does not begin with an
// exchange's name. WBTC is Bitcoin on Ethereum and Binance staked ETH is ETH in a staking product;
// neither is a launch still to come. The snapshot's watchlist is the floor: every one of its slugs
// is on the board, and the board adds every other rankable protocol the snapshot carries, because
// the early finds below the floor are the radar's whole point.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants: stated on the dashboard's Method page, used by every row alike. */
export interface ModelConstants {
  ratio_floor: number;
  ratio_cap: number;
  min_category_comps: number;
  growth_weight: number;
  growth_floor_pct: number;
  growth_cap_pct: number;
  growth_min_mult: number;
  maturity_base: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  ratio_floor: 0.01,
  ratio_cap: 10,
  min_category_comps: 4,
  growth_weight: 0.6,
  growth_floor_pct: -50,
  growth_cap_pct: 100,
  growth_min_mult: 0.5,
  maturity_base: 0.7,
  maturity_range: 0.5,
  maturity_days: 1460,
  unknown_age_days: 365,
};

/** The model's version label, named on the dashboard. */
export const MODEL_VERSION = 'radar-2';

/** How many already-trading protocols the dashboard's comparables view lists, by market cap. */
export const LIVE_ROWS = 30;

/** One category's comparables: how the market prices a TVL dollar there, from the snapshot itself. */
export interface CompStat {
  category: string;
  median_ratio: number;
  comps: number;
}

/** The comparables table: per-category medians plus the global fallback. */
export interface Comps {
  global_median: number;
  global_comps: number;
  by_category: Map<string, CompStat>;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    multiple_basis: 'category' | 'global';
    comps: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one board row: the row, its farm plan, and its place on the watchlist. */
export interface RadarRow extends BoardRow {
  farm_plan: FarmStep[];
}

/** An already-trading protocol: the market's own value, kept apart from the ranked board. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** Everything the dashboard renders: the board, the comparables, the live set, the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  protocols_scanned: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  comps_global: { median_ratio: number; comps: number };
  comps: CompStat[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when a date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Categories that are a product of another protocol's token, never a launch of their own. */
const DERIVATIVE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A name ending in a release marker is a pool of another protocol, not the protocol itself. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whole words that mark a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Names that begin with an exchange's name are that exchange's product, not a new launch. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol may be ranked: pre-token, and not a wrapped, staked or bridged derivative. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && DERIVATIVE_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name) || WRAPPED_WORD.test(p.name) || EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The median of a non-empty list, computed on a sorted copy so the input order never matters. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The comparables: every protocol whose token trades and whose record carries both a market cap
 * and a TVL contributes its market-cap/TVL ratio, winsorised, to its category and to the global
 * pool. This table is the model's only notion of what a TVL dollar is worth, and it comes from the
 * snapshot alone.
 */
export function buildComps(snapshot: Snapshot, model: ModelConstants = MODEL): Comps {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = Math.min(model.ratio_cap, Math.max(model.ratio_floor, p.mcap_usd / p.tvl_usd));
    all.push(ratio);
    if (p.category !== null) {
      const list = byCategory.get(p.category);
      if (list === undefined) byCategory.set(p.category, [ratio]);
      else list.push(ratio);
    }
  }
  const stats = new Map<string, CompStat>();
  for (const [category, ratios] of byCategory) {
    stats.set(category, { category, median_ratio: round4(median(ratios)), comps: ratios.length });
  }
  return {
    global_median: all.length > 0 ? round4(median(all)) : 0.2,
    global_comps: all.length,
    by_category: stats,
  };
}

/** The multiple one protocol is priced with: its category's median when the category has enough trading peers, else the global median. */
export function multipleFor(category: string | null, comps: Comps, model: ModelConstants = MODEL): { multiple: number; basis: 'category' | 'global'; comps: number } {
  if (category !== null) {
    const stat = comps.by_category.get(category);
    if (stat !== undefined && stat.comps >= model.min_category_comps) {
      return { multiple: stat.median_ratio, basis: 'category', comps: stat.comps };
    }
  }
  return { multiple: comps.global_median, basis: 'global', comps: comps.global_comps };
}

/** The full decomposition of one protocol's implied value under the model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  comps: Comps,
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; basis: 'category' | 'global'; comps: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, basis, comps: n } = multipleFor(protocol.category, comps, model);
  const growthPct = Math.min(model.growth_cap_pct, Math.max(model.growth_floor_pct, finite(protocol.change_7d, 0)));
  const growthMult = Math.max(model.growth_min_mult, 1 + (growthPct / 100) * model.growth_weight);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_base + model.maturity_range * Math.sqrt(Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, multiple, basis, comps: n, growthPct, growthMult, maturityMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const byValueThenSlug = (a: { implied: number; slug: string }, b: { implied: number; slug: string }): number =>
  b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = buildComps(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug is on the board, whatever the screen would say.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol in the snapshot, at any size. The
  // snapshot starts at $5M of TVL, so this is a screen of hundreds, not thousands, and a radar
  // that drops a rankable protocol is a radar with a blind spot.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, comps, model);
    return { p, ...v };
  });
  scored.sort((a, b) => byValueThenSlug({ implied: a.implied, slug: a.p.slug }, { implied: b.implied, slug: b.p.slug }));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    on_watchlist: watchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      multiple: s.multiple,
      multiple_basis: s.basis,
      comps: s.comps,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one action on a chain costs in gas: mainnets are dear, rollups and Solana are not. */
function gasFor(chain: string): { perAction: string; weekly: string } {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return { perAction: 'about $8 of ETH gas at a quiet time', weekly: 'about $8 of gas a week' };
  if (c === 'solana') return { perAction: 'a few cents of SOL in fees', weekly: 'under $1 of fees a week' };
  if (c === 'bsc' || c === 'binance') return { perAction: 'about $0.30 of BNB gas', weekly: 'about $1 of gas a week' };
  if (['arbitrum', 'base', 'optimism', 'zksync era', 'linea', 'scroll', 'mantle', 'blast', 'mode', 'taiko', 'starknet'].includes(c)) {
    return { perAction: 'under $1 of gas on the rollup', weekly: 'about $1 of gas a week' };
  }
  return { perAction: 'a few dollars of gas', weekly: 'about $3 of gas a week' };
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 250_000_000) return 120;
  if (p.tvl_usd >= 50_000_000) return 80;
  return 50;
}

/** How long to hold, from the protocol's age: a younger protocol gets a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  if (age < 730) return 30;
  return 21;
}

/** The category's two core actions: the position to open, and the second action that makes it count. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { open: string; deepen: string } {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend')) return {
    open: `Supply $${capital} of USDC to ${n} on ${chain} as the base position.`,
    deepen: `Borrow about 30% against the position and re-supply it once, then repay in the same session so the health factor stays above 2.`,
  };
  if (c.includes('cdp')) return {
    open: `Deposit $${capital} of collateral into a ${n} vault on ${chain} and mint its stablecoin at under 50% of the liquidation limit.`,
    deepen: `Hold the minted stablecoin in the wallet or supply it back to the protocol's own stability pool, and top the vault up once.`,
  };
  if (c.includes('dex') || c.includes('amm')) return {
    open: `Swap about $${Math.max(25, Math.floor(capital / 2))} through ${n}'s main pair on ${chain}, then add $${capital} of liquidity to that pair.`,
    deepen: `Stake the liquidity receipt in the protocol's own farm or gauge if it offers one, and make one more swap each week.`,
  };
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options')) return {
    open: `Deposit $${capital} of USDC as margin on ${n} and open one small hedged position, long and short the same asset in equal size.`,
    deepen: `Trade a little every week toward steady volume rather than one burst, and keep the hedge balanced as prices move.`,
  };
  if (c.includes('curator') || c.includes('allocator')) return {
    open: `Deposit $${capital} into a ${n} curated vault on ${chain} and keep the vault shares in the farming wallet.`,
    deepen: `Split a second, smaller deposit into a different vault under the same curator so the activity is not one transaction.`,
  };
  if (c.includes('yield') || c.includes('basis')) return {
    open: `Deposit $${capital} into ${n}'s main vault on ${chain} and keep the yield-bearing shares.`,
    deepen: `Claim and re-deposit the yield once, so the wallet shows both an earning and a compounding action.`,
  };
  if (c.includes('rwa')) return {
    open: `Mint $${capital} of ${n}'s yield asset on ${chain}; complete the protocol's own onboarding first if it asks for it.`,
    deepen: `Hold the asset across a full distribution cycle and claim the payout from the protocol's own page.`,
  };
  if (c.includes('staking') || c.includes('restak')) return {
    open: `Stake $${capital} of the chain's asset through ${n} on ${chain} and keep the staking receipt in the wallet.`,
    deepen: `Restake or delegate a second, smaller amount from the same wallet a week later, so the record shows a returning staker.`,
  };
  if (c.includes('bridge')) return {
    open: `Bridge $${capital} of USDC to ${chain} through ${n} and use the bridged funds in one app on the far side.`,
    deepen: `Bridge a smaller amount back a week later; a round trip counts on most bridge points programs.`,
  };
  if (c.includes('prediction')) return {
    open: `Fund $${capital} and take one position in a liquid market on ${n}, sized so a total loss is acceptable.`,
    deepen: `Settle the position when the market resolves and take one more in a different market the following week.`,
  };
  if (c.includes('privacy')) return {
    open: `Deposit $${capital} into ${n} on ${chain} and make one shielded transfer to your own second address.`,
    deepen: `Withdraw to a fresh address after a few days rather than at once; round amounts and instant exits are what sybil screens flag.`,
  };
  if (c.includes('insurance')) return {
    open: `Buy $${capital} of cover from ${n} on ${chain} for a position you actually hold, and keep the policy to expiry.`,
    deepen: `Renew the cover once when it lapses, so the wallet shows a returning policyholder rather than a single click.`,
  };
  if (c.includes('index')) return {
    open: `Mint $${capital} of ${n}'s index token on ${chain} and hold it in the farming wallet.`,
    deepen: `Add a smaller second mint after the next rebalance, so the record spans two index compositions.`,
  };
  if (c.includes('launchpad') || c.includes('ido')) return {
    open: `Register the wallet on ${n} and stake or hold the $${capital} it asks for ahead of its next sale on ${chain}.`,
    deepen: `Take part in one sale at a size you can afford to lose, and keep the allocation record in the farm log.`,
  };
  return {
    open: `Deposit $${capital} of USDC into ${n} on ${chain} and keep the position open.`,
    deepen: `Repeat a smaller version of the same action a week later, so the wallet reads as a user and not a drive-by.`,
  };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, chains, TVL, age) and never from a hand-written list of names.
 * The plan assumes a points or allocation program may one day read the wallet's history; it says
 * so, and it never promises one exists.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const { open, deepen } = actionsFor(p, capital, chain);
  const multi = p.chains.length > 1 ? ` It also runs on ${p.chains[1]}, so the same wallet can repeat the position there later.` : '';
  return [
    {
      text: `Set up a fresh wallet for ${p.name} alone, fund it from an exchange rather than from your main wallet, and keep its seed phrase offline.${multi}`,
      cost: 'under $3 to fund and make the first transaction',
      time: '10 minutes',
    },
    {
      text: open,
      cost: `$${capital} of capital and ${gas.perAction}`,
      time: '15 minutes to set up',
    },
    {
      text: deepen,
      cost: `about $${Math.max(10, Math.floor(capital / 4))} more capital at most, and ${gas.perAction}`,
      time: '10 minutes',
    },
    {
      text: `Repeat one qualifying action every week (a deposit, a swap, a vote or a claim) so the wallet builds a streak instead of a single spike.`,
      cost: gas.weekly,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days, across at least two weekly snapshots of the protocol's own accounting.`,
      cost: `the $${capital} stays in the position and carries its smart-contract risk`,
      time: `${hold} days`,
    },
    {
      text: `Open the protocol's own points, rewards or governance page and connect this wallet; if a program exists, this is where it will read the history you built.`,
      cost: 'nothing to check, and never pay anyone to claim on your behalf',
      time: '5 minutes',
    },
    {
      text: `Keep a farm log: the wallet, the dates, the amounts and the transaction hashes, so you can prove the history, repeat the position or unwind it in the right order.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The already-trading protocols, by market cap: the company the board's multiples come from. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = buildComps(snapshot, model);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const bySlugIndex = bySlug(snapshot.protocols);
  const rows: RadarRow[] = board.map((r) => ({
    ...r,
    farm_plan: farmSteps(bySlugIndex.get(r.slug)!, r.age_days),
  }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    protocols_scanned: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watchlist.has(r.slug)).length,
    live_size: live.length,
    comps_global: { median_ratio: comps.global_median, comps: comps.global_comps },
    comps: [...comps.by_category.values()].sort((a, b) => b.comps - a.comps || (a.category < b.category ? -1 : 1)),
    rows,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
