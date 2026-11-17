# Token Launch Radar — Comparables Radar: 198 Tokenless Protocols Priced

A token launch radar for make.fun's `token-radar-01` bounty. It reads a sealed
DefiLlama snapshot, finds every protocol that records no token yet, prices each
one with a comparables model derived from the snapshot's own figures, ranks
them into a board, gives each a concrete farm plan, and renders the result as a
static dashboard. Model version: **radar-4**.

The board's implied value is this entry's own claim about what a launch would
be worth if the protocol's record stayed as it is. It is not a prediction that
a token will be issued, and it is not a make.fun claim.

## Run it

Node 22, standard library only, no network, deterministic — the same snapshot
in, the same bytes out, on every run.

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to>/snapshot.json
```

Outputs in `out/`: `board.json` (the ranked board), `data.js` (the dashboard's
dataset), `dashboard/` and `screenshots/` (copied from this repository), and
`dossier.json` (built by `vendor/makefun-board.ts`, byte-compared by the
scorer). The program validates its own board before writing and exits non-zero
rather than hand in a board the gate would refuse.

## What the board holds

- **758 protocols scanned** (every protocol in the snapshot at $5M TVL or more).
- **198 ranked rows**: all **40 of the house watchlist** (the floor — covered in
  full) plus **158 early finds** below the $50M watchlist floor.
- **Board implied total ≈ $4.49B.** Top of the board: Steakhouse Financial,
  Sentora Curator, Gauntlet.
- The 400+ protocols whose token already trades are never ranked; the largest
  30 are shown separately as the comparables evidence.

## Who is pre-token, and who is ranked

A protocol **records no token** when its record carries no market cap, no
CoinGecko id and no symbol. The wording is deliberate: the record is what can
be seen, so the board never claims a protocol *has* no token.

A pre-token protocol is rankable only if it is not a wrapped, staked or
bridged product of a token that already trades (WBTC is Bitcoin on Ethereum;
an exchange's staked ETH is ETH in a staking product — neither is a launch
still to come). The screen drops categories `Bridge`, `Canonical Bridge`,
`Liquid Staking`, `Liquid Restaking`, `Restaked BTC` and `CEX`, names
carrying a whole word *wrapped*, *staked* or *staking*, names ending in a
version marker (a pool of another protocol), and names beginning with an
exchange's name. Watchlist members are included unconditionally.

## The value model

One function prices every row; no name is special-cased anywhere.

```
implied = max(1, round(TVL x multiple x growth multiplier x maturity multiplier))
```

**Comparables.** Every protocol whose token trades, with a market cap above
zero and a TVL above zero, contributes its market-cap/TVL ratio, winsorised
to **[0.01, 10]** so one mania cannot price a category. That gives 128
comparables and a global median of **0.2138x**. Sentinel market caps are not
evidence: the snapshot records 0 for some trading protocols and −1 for one;
both are excluded by the "above zero" rule.

**Multiple.** For a category with at least 4 trading peers, the multiple
starts from the category's median ratio and is **shrunk toward the global
median** with the peer count as its weight:

```
multiple = (n x category median + 4 x global median) / (n + 4)
```

Fifteen peers keep most of their own price; four peers borrow half of theirs
from the whole market, because four ratios are a hint, not a measurement.
Categories thinner than 4 peers do not price themselves — but they are not
sent straight to the global pool. DefiLlama splits one line of business
across sibling labels, so the model pools them into **families** (Risk
Curators with Onchain Capital Allocator; Derivatives, Options, Options Vault
and Interest Rate Derivatives; and six more, all fixed in the model and
listed on the dashboard's Comparables tab). A thin category is priced by its
family when the family holds at least 3 peers, the family median shrunk
harder toward the global median — `(n x family median + 8 x global) / (n + 8)`
— because a family's evidence is broader and blunter than a category's own.
Only a category with no family evidence falls back to the global median
outright. 161 rows are priced on category or family evidence (75 of them by
a family pool); 37 on the global pool.

**Spread and confidence.** Each category publishes the middle half of its
peers' ratios (25th–75th percentile). Each row is stamped with the confidence
its price earned: **high** — at least 8 peers and a middle half no wider than
the median itself; **medium** — a category or family price on fewer or
disagreeing peers; **low** — the global median, because neither the category
nor its family could speak. The stamp changes no number; it tells the reader
how far to trust the one printed. Board outcome: 16 high, 145 medium, 37
low — the board's largest rows sit in categories too thin to price
themselves (a zero-peer category cannot price itself), so the family tier
prices them and stamps them medium, and the dashboard says so on their face.

**Growth.** The 7-day TVL change, clamped to **[−50%, +100%]**, scaled by
0.6 into a multiplier floored at 0.5: a hot week is worth something, not
everything.

**Maturity.** `0.70 + 0.50 x sqrt(min(age_days, 1460) / 1460)` on days since
DefiLlama first tracked the protocol (unknown age counts as 365 days). A
protocol that has run for years with no token has a proven product and users
who stayed anyway; the square root makes the credit saturate at four years.

Every row's detail view shows its own decomposition — TVL, category median,
the shrinkage arithmetic, the peer spread, both multipliers — so any figure
on the board can be re-derived from the snapshot by hand.

## Farm plans

Seven steps per protocol, generated from its own record, never hand-written
per name: the category sets the two core actions (14 playbooks — lending:
supply plus a borrow/re-supply loop; DEX: swap, provide, stake the receipt;
CDP: collateralise and mint under 50% of the liquidation limit; derivatives:
a hedged margin position and steady weekly volume; curators: curated-vault
deposits; RWA: mint and hold across a distribution cycle; and so on), the
first chain sets gas costs (Ethereum ≈ $8 an action, rollups under $1,
Solana cents, BSC ≈ $0.30), TVL sets the position size ($50–$300), and age
sets the holding window (21–60 days). Every step names its cost and its time.
A plan assumes a points or allocation program may one day read the wallet's
history; none is promised, and the plan says so.

## Data hygiene

The snapshot is validated before it is priced: a duplicated protocol slug, a
negative TVL, a malformed first-tracked date, a duplicated watchlist slug, or
a watchlist slug the protocol list does not carry stops the run with an error
rather than silently pricing a corrupted board. After pricing, a self-check
refuses a board with a duplicated slug, a missing watchlist member, ranks
other than exactly 1..N, implied values rising with rank, a multiple outside
the winsorised band, a category price claimed on too few peers, an inverted
spread, or any farm step outside 3–12 steps of 20–600 characters.

## The dashboard

`dashboard/` is three files (index.html, app.css, app.js; ~37 KB of source,
inside the dossier's 65,536-byte text cap, so the judge reads every line) and
renders with no network from the `data.js` beside it:

- **Board** — headline stats (including the share of rows priced on category
  evidence), the model formula strip with live category-multiple chips,
  search, category and chain filters, an All / Watchlist / Early-finds
  segment control, and a sortable table (rank, TVL, 7-day change, age,
  multiple, confidence, implied value) with implied-value bars and
  WATCHLIST / EARLY / confidence badges.
- **Detail** — per protocol: stat grid, the full valuation decomposition
  including the shrinkage and the peer spread, a confidence note in plain
  words, the 7-step farm plan with cost/time chips, and the protocol's
  record with the derivative-screen note.
- **Comparables** — per-category medians, spreads, peer counts and the board
  multiple each category actually prices at, plus the top-30 already-trading
  protocols with their own ratios, kept visibly separate from the board.
- **Method** — the whole method in prose: the pre-token definition, the
  screen, the model, shrinkage, spread and confidence, farm-plan generation,
  data hygiene, and the caveats.

Deep links via the location hash (`#cat=Lending`, `#seg=watchlist`,
`#p=<slug>`, `#tab=comps`) drive the screenshots, which are real renders of
the generated page.

## Layout

| Path | What it is |
| --- | --- |
| `main.ts` | The program: parse, price, validate, write outputs, build the dossier. |
| `lib/model.ts` | The comparables model, the derivative screen, the farm-plan generator, snapshot validation, the board self-check. |
| `vendor/makefun-board.ts` | The kit's dossier library, copied unchanged. |
| `dashboard/` | The page: board, detail, comparables, method. |
| `screenshots/` | Three renders of the generated dashboard. |
| `LICENSE` | MIT. |

## Caveats

Implied value is not a forecast and not a tip. It says: if this protocol
issued a token today and the market priced it the way it prices its trading
peers, the launch would be worth about this. Whether it ever issues one, and
what the market would actually pay, are questions the snapshot does not
answer and this entry does not pretend to.
