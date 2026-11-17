// Token Launch Radar (radar-4): a static dashboard over window.RADAR, the dataset main.ts writes
// beside this page from the sealed snapshot. No network: every figure on screen is in data.js,
// every farm plan is the one board.json carries, and the detail view shows the model's own
// decomposition for the row, so what the page says and what the board says cannot drift apart.
(function () {
  'use strict';

  var D = window.RADAR;
  if (!D) return;
  var app = document.getElementById('app');
  var detailRoot = document.getElementById('detail');
  var M = D.model;

  var state = { tab: 'board', q: '', category: 'all', chain: 'all', seg: 'all', sort: 'implied', dir: -1 };

  /* ---------- formatting ---------- */
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.round(days) + 'd';
  }
  function fmtMult(n) { return n === null || n === undefined ? 'n/a' : n.toFixed(3) + 'x'; }

  /* ---------- tiny DOM helper ---------- */
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string' || typeof child === 'number') node.appendChild(document.createTextNode(String(child)));
      else node.appendChild(child);
    }
    return node;
  }

  /* ---------- header ---------- */
  function statBox(k, v) {
    return el('div', { 'class': 'stat' }, el('div', { 'class': 'k', text: k }), el('div', { 'class': 'v' }, v));
  }
  function header() {
    var totalImplied = D.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var onCategory = D.rows.filter(function (r) { return r.model.multiple_basis === 'category'; }).length;
    var wrap = el('header', null,
      el('p', { 'class': 'eyebrow', text: 'Token launch radar · model ' + D.model_version }),
      el('h1', null, 'Pre-token protocols, ', el('span', { 'class': 'thin', text: 'priced by the company they keep' })),
      el('p', { 'class': 'sub' },
        'Every protocol in the sealed DefiLlama snapshot that records no token, screened for wrapped and staked ' +
        'derivatives, and priced by what the market already pays for a TVL dollar in its category. ' +
        'Snapshot as of ', el('b', { text: D.as_of }), '. Implied value is a claim about worth at these figures, never a prediction that a token comes.'),
      el('div', { 'class': 'stats' },
        statBox('Protocols scanned', String(D.protocols_scanned)),
        statBox('Watchlist covered', el('span', null, el('em', { text: D.watchlist_size + ' / ' + D.watchlist_size }))),
        statBox('Board rows', String(D.board_size)),
        statBox('Early finds below floor', String(D.early_size)),
        statBox('Priced on category or family evidence', Math.round((onCategory / D.board_size) * 100) + '%'),
        statBox('Board implied total', fmtUsd(totalImplied)))
    );
    var topComps = D.comps.filter(function (c) { return c.comps >= M.min_category_comps; }).slice(0, 6);
    var strip = el('div', { 'class': 'model-strip' },
      el('div', { 'class': 'formula' },
        'implied = TVL x ', el('b', { text: 'category multiple' }), ' x ', el('b', { text: 'growth' }), ' x ', el('b', { text: 'maturity' })),
      el('div', { 'class': 'note', text:
        'The multiple starts from the median market-cap / TVL of the category\u2019s trading protocols in this snapshot, ' +
        'then shrinks toward the global median (' + D.comps_global.median_ratio.toFixed(3) + 'x over ' + D.comps_global.comps +
        ' protocols) with the peer count as its weight, so a thin category borrows the market\u2019s price instead of trusting four ratios. ' +
        'Where a category is too thin to price itself, its family of sibling categories prices it instead, on at least ' +
        M.family_min_comps + ' pooled peers shrunk harder toward the global median; only a category with no family evidence ' +
        'falls back to the global median outright. Every row carries the confidence its evidence earns. ' +
        'Growth reads the 7-day TVL change; maturity credits years run with no token. Full method on the Method tab.' }),
      el('div', { 'class': 'chips' }, topComps.map(function (c) {
        return el('span', { 'class': 'chip' }, c.category + ' ', el('b', { text: c.median_ratio.toFixed(3) + 'x' }), ' · ' + c.comps + ' peers');
      }))
    );
    return el('div', null, wrap, strip);
  }

  /* ---------- tabs ---------- */
  function tabs() {
    var defs = [['board', 'Board'], ['comps', 'Comparables'], ['method', 'Method']];
    return el('nav', { 'class': 'tabs' }, defs.map(function (d) {
      return el('button', {
        'class': 'tab', 'aria-selected': state.tab === d[0] ? 'true' : 'false',
        onclick: function () { state.tab = d[0]; render(); },
      }, d[1]);
    }));
  }

  /* ---------- board ---------- */
  function categories() {
    var seen = {};
    D.rows.forEach(function (r) { if (r.category) seen[r.category] = 1; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var seen = {};
    D.rows.forEach(function (r) { r.chains.forEach(function (c) { seen[c] = 1; }); });
    return Object.keys(seen).sort();
  }
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (state.seg === 'watchlist' && !r.on_watchlist) return false;
      if (state.seg === 'early' && r.on_watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort, dir = state.dir;
    var val = {
      implied: function (r) { return r.implied_value_usd; },
      tvl: function (r) { return r.tvl_usd; },
      growth: function (r) { return r.change_7d === null ? -1e9 : r.change_7d; },
      age: function (r) { return r.age_days === null ? -1 : r.age_days; },
      mult: function (r) { return r.model.multiple; },
      conf: function (r) { return { high: 3, medium: 2, low: 1 }[r.model.confidence]; },
      rank: function (r) { return r.rank; },
    }[key];
    rows.sort(function (a, b) { return dir * (val(a) - val(b)) || (a.slug < b.slug ? -1 : 1); });
    return rows;
  }
  function sortHead(label, key, cls) {
    return el('th', {
      'class': cls || '',
      onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'rank' ? 1 : -1; }
        render();
      },
    }, label + (state.sort === key ? (state.dir === -1 ? ' \u25bc' : ' \u25b2') : ''));
  }
  function boardView() {
    var rows = visibleRows();
    var maxImplied = D.rows.length ? D.rows[0].implied_value_usd : 1;
    var toolbar = el('div', { 'class': 'toolbar' },
      el('input', {
        type: 'search', placeholder: 'Search name, slug, category', value: state.q,
        oninput: function (e) { state.q = e.target.value; refreshTable(); },
      }),
      el('label', null, 'Category'),
      el('select', {
        onchange: function (e) { state.category = e.target.value; render(); },
      }, [el('option', { value: 'all' }, 'All categories')].concat(categories().map(function (c) {
        var o = el('option', { value: c }, c);
        if (state.category === c) o.setAttribute('selected', 'selected');
        return o;
      }))),
      el('label', null, 'Chain'),
      el('select', {
        onchange: function (e) { state.chain = e.target.value; render(); },
      }, [el('option', { value: 'all' }, 'All chains')].concat(chains().map(function (c) {
        var o = el('option', { value: c }, c);
        if (state.chain === c) o.setAttribute('selected', 'selected');
        return o;
      }))),
      el('span', { 'class': 'seg' },
        el('button', { 'aria-pressed': state.seg === 'all' ? 'true' : 'false', onclick: function () { state.seg = 'all'; render(); } }, 'All'),
        el('button', { 'aria-pressed': state.seg === 'watchlist' ? 'true' : 'false', onclick: function () { state.seg = 'watchlist'; render(); } }, 'Watchlist'),
        el('button', { 'aria-pressed': state.seg === 'early' ? 'true' : 'false', onclick: function () { state.seg = 'early'; render(); } }, 'Early finds')),
      el('span', { 'class': 'count', id: 'rowcount' }, '')
    );
    var table = el('table', null,
      el('thead', null, el('tr', null,
        sortHead('#', 'rank'), sortHead('Protocol', 'rank', 'l'), el('th', { 'class': 'l' }, 'Category'),
        el('th', { 'class': 'l' }, 'Chains'), sortHead('TVL', 'tvl'), sortHead('7d', 'growth'),
        sortHead('Age', 'age'), sortHead('Multiple', 'mult'), sortHead('Conf.', 'conf'), sortHead('Implied value', 'implied'))),
      el('tbody', { id: 'boardbody' })
    );
    var view = el('div', null, toolbar, table);
    view._refresh = function () { fillBody(rows, maxImplied); };
    return view;
  }
  function fillBody(rows, maxImplied) {
    var body = document.getElementById('boardbody');
    var count = document.getElementById('rowcount');
    if (!body) return;
    if (count) count.textContent = rows.length + ' of ' + D.board_size + ' protocols';
    body.textContent = '';
    rows.forEach(function (r) {
      var badge = r.on_watchlist
        ? el('span', { 'class': 'badge wl', text: 'WATCHLIST' })
        : el('span', { 'class': 'badge early', text: 'EARLY' });
      var pct = Math.max(1.5, (r.implied_value_usd / maxImplied) * 100);
      body.appendChild(el('tr', { onclick: function () { openDetail(r.slug); } },
        el('td', { 'class': 'rank', text: String(r.rank) }),
        el('td', { 'class': 'name l' }, r.name, badge, el('span', { 'class': 'slug', text: r.slug })),
        el('td', { 'class': 'cat l', text: r.category || 'Uncategorised' }),
        el('td', { 'class': 'chains l', text: r.chains.length ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') : 'n/a' }),
        el('td', { text: fmtUsd(r.tvl_usd) }),
        el('td', { 'class': r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { text: fmtAge(r.age_days) }),
        el('td', { text: fmtMult(r.model.multiple) }),
        el('td', null, el('span', { 'class': 'badge conf-' + r.model.confidence, text: r.model.confidence.toUpperCase() })),
        el('td', { 'class': 'imp' }, fmtUsd(r.implied_value_usd), barSpan(pct))
      ));
    });
  }
  function barSpan(pct) {
    var s = el('span', { 'class': 'bar' });
    var i = el('i', null);
    i.style.width = pct + '%';
    s.appendChild(i);
    return s;
  }
  function refreshTable() {
    var rows = visibleRows();
    fillBody(rows, D.rows.length ? D.rows[0].implied_value_usd : 1);
  }

  /* ---------- detail ---------- */
  function openDetail(slug) {
    var r = null;
    D.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    var m = r.model;
    var decompRow = function (what, num, cls) {
      return el('div', { 'class': 'row' + (cls ? ' ' + cls : '') },
        el('span', { 'class': 'what', text: what }), el('span', { 'class': 'num', text: num }));
    };
    var sheet = el('div', { 'class': 'sheet' },
      el('button', { 'class': 'close', onclick: closeDetail }, 'Close \u00d7'),
      el('p', { 'class': 'eyebrow', text: 'Rank #' + r.rank + ' of ' + D.board_size + (r.on_watchlist ? ' · on the house watchlist' : ' · early find below the floor') }),
      el('h2', { text: r.name }),
      el('div', { 'class': 'meta', text: r.slug + ' · ' + (r.category || 'Uncategorised') + ' · records no token in the snapshot of ' + D.as_of }),
      el('div', { 'class': 'grid' },
        cellOf('Implied value', fmtUsd(r.implied_value_usd)),
        cellOf('TVL', fmtUsd(r.tvl_usd)),
        cellOf('TVL change, 7d', fmtPct(r.change_7d)),
        cellOf('Running since', r.listed_at || 'unknown'),
        cellOf('Age with no token', fmtAge(r.age_days)),
        cellOf('Multiple applied', fmtMult(m.multiple)),
        cellOf('Price confidence', m.confidence.toUpperCase()),
        cellOf('Chains', String(r.chains.length)),
        cellOf('Implied / TVL', fmtMult(r.implied_value_usd / r.tvl_usd))),
      el('h3', { 'class': 'sec', text: 'How the model prices it' }),
      el('div', { 'class': 'decomp' },
        decompRow('TVL in the snapshot', fmtUsd(r.tvl_usd)),
        m.multiple_basis === 'category' && m.pricing_pool === r.category
          ? decompRow('category median (market-cap / TVL of ' + m.comps + ' trading ' + (r.category || '') + ' protocols)', fmtMult(m.category_median))
          : m.multiple_basis === 'category'
            ? decompRow('family median (market-cap / TVL of ' + m.comps + ' trading protocols in the ' + m.pricing_pool + ' family; ' + (r.category || 'this category') + ' itself is too thin)', fmtMult(m.category_median))
            : decompRow('category median', 'too thin to use'),
        m.multiple_basis === 'category' && m.pricing_pool === r.category
          ? decompRow('x multiple (median shrunk toward the global ' + D.comps_global.median_ratio.toFixed(3) + 'x: (' + m.comps + ' x median + ' + M.shrink_weight + ' x global) / ' + (m.comps + M.shrink_weight) + ')', fmtMult(m.multiple))
          : m.multiple_basis === 'category'
            ? decompRow('x multiple (family median shrunk harder toward the global ' + D.comps_global.median_ratio.toFixed(3) + 'x: (' + m.comps + ' x median + ' + M.family_shrink_weight + ' x global) / ' + (m.comps + M.family_shrink_weight) + ')', fmtMult(m.multiple))
            : decompRow('x multiple (global median: neither this category nor its family has enough trading peers to price it)', fmtMult(m.multiple)),
        decompRow('peer spread (middle half of the ratios behind the price)', m.spread_p25.toFixed(3) + 'x \u2013 ' + m.spread_p75.toFixed(3) + 'x'),
        decompRow('x growth (7d change ' + fmtPct(m.growth_pct) + ', clamped)', m.growth_multiplier.toFixed(3) + 'x'),
        decompRow('x maturity (' + fmtAge(r.age_days) + ' run with no token)', m.maturity_multiplier.toFixed(3) + 'x'),
        decompRow('Implied value if it launched at these figures', fmtUsd(r.implied_value_usd), 'total')),
      el('p', { 'class': 'facts' },
        'Confidence ', el('b', { text: m.confidence.toUpperCase() }), ': ', confidenceNote(r)),
      el('h3', { 'class': 'sec', text: 'Farm plan: ' + r.farm_plan.length + ' steps' }),
      el('ol', { 'class': 'plan' }, r.farm_plan.map(function (s) {
        return el('li', null,
          el('span', { 'class': 'txt', text: s.text }),
          el('span', { 'class': 'ct' },
            el('span', null, el('b', { text: 'Cost ' }), s.cost),
            el('span', null, el('b', { text: 'Time ' }), s.time)));
      })),
      el('h3', { 'class': 'sec', text: 'The record' }),
      el('p', { 'class': 'facts' },
        'Chains: ', el('b', { text: r.chains.join(', ') || 'none named' }), '. ',
        'DefiLlama began tracking it on ', el('b', { text: r.listed_at || 'an unrecorded date' }), '; its page there is defillama.com/protocol/' + r.slug + '. ',
        'Its record carries no market cap, no CoinGecko id and no symbol, and it passed the derivative screen: not a wrapped, staked or bridged product of a token that already trades. ',
        'The plan assumes a points or allocation program may one day read wallet history; none is promised, and every step is worth doing only at a size whose loss is acceptable.')
    );
    detailRoot.textContent = '';
    detailRoot.appendChild(sheet);
    detailRoot.hidden = false;
    detailRoot.scrollTop = 0;
  }
  function confidenceNote(r) {
    var m = r.model;
    var where = m.pricing_pool === null ? '' : (m.pricing_pool === r.category
      ? 'in its own category'
      : 'in the ' + m.pricing_pool + ' family pool (its own category is too thin to price it)');
    if (m.confidence === 'high') return 'priced by ' + m.comps + ' trading peers ' + where + ', and the middle half of their ratios spans no more than the median itself: many peers, in rough agreement.';
    if (m.confidence === 'medium') return 'priced by ' + m.comps + ' trading peers ' + where + ', but they are few or they disagree: the multiple is shrunk toward the global median to allow for it.';
    return 'neither its category nor its family has enough trading peers to price it, so the price is the global median over ' + D.comps_global.comps + ' trading protocols: the market\u2019s average, not this line of business\u2019s own price.';
  }
  function cellOf(k, v) {
    return el('div', { 'class': 'cell' }, el('div', { 'class': 'k', text: k }), el('div', { 'class': 'v', text: v }));
  }
  function closeDetail() { detailRoot.hidden = true; detailRoot.textContent = ''; }
  detailRoot.addEventListener('click', function (e) { if (e.target === detailRoot) closeDetail(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

  /* ---------- comparables ---------- */
  function compsView() {
    var usable = D.comps.filter(function (c) { return c.comps >= 1; });
    var maxRatio = Math.max.apply(null, usable.map(function (c) { return c.median_ratio; }).concat([0.001]));
    var compTable = el('table', { 'class': 'plain' },
      el('thead', null, el('tr', null,
        el('th', { 'class': 'l' }, 'Category'), el('th', null, 'Median mcap / TVL'), el('th', null, 'Spread p25\u2013p75'),
        el('th', null, 'Trading peers'), el('th', null, 'Board multiple'), el('th', { 'class': 'l' }, 'Used for'))),
      el('tbody', null, usable.map(function (c) {
        var w = c.family ? M.family_shrink_weight : M.shrink_weight;
        var used = c.comps >= (c.family ? M.family_min_comps : M.min_category_comps);
        var boardMult = used
          ? (c.comps * c.median_ratio + w * D.comps_global.median_ratio) / (c.comps + w)
          : D.comps_global.median_ratio;
        var usedFor;
        if (c.family) {
          usedFor = used ? 'Family pool: prices its thin categories' : 'Family pool too thin: not used';
        } else if (used) {
          usedFor = 'This category\u2019s rows';
        } else {
          var famName = D.category_family[c.category];
          var famStat = famName ? D.comps.filter(function (x) { return x.family && x.category === famName; })[0] : null;
          if (famStat && famStat.comps >= M.family_min_comps) {
            boardMult = (famStat.comps * famStat.median_ratio + M.family_shrink_weight * D.comps_global.median_ratio) / (famStat.comps + M.family_shrink_weight);
            usedFor = 'Too thin alone: priced by the ' + famName + ' family pool';
          } else {
            usedFor = 'Too thin: global median instead';
          }
        }
        return el('tr', null,
          el('td', { 'class': 'l', text: c.family ? c.category + ' (family pool)' : c.category }),
          el('td', null, c.median_ratio.toFixed(3) + 'x', barSpan(Math.max(2, (c.median_ratio / maxRatio) * 100))),
          el('td', { text: c.p25_ratio.toFixed(3) + 'x \u2013 ' + c.p75_ratio.toFixed(3) + 'x' }),
          el('td', { text: String(c.comps) }),
          el('td', { text: boardMult.toFixed(3) + 'x' }),
          el('td', { 'class': 'l', text: usedFor }));
      })));
    var liveTable = el('table', { 'class': 'plain' },
      el('thead', null, el('tr', null,
        el('th', { 'class': 'l' }, 'Protocol'), el('th', { 'class': 'l' }, 'Category'),
        el('th', null, 'TVL'), el('th', null, 'Market cap'), el('th', null, 'Mcap / TVL'))),
      el('tbody', null, D.live.map(function (p) {
        return el('tr', null,
          el('td', { 'class': 'l', text: p.name }),
          el('td', { 'class': 'l', text: p.category || 'Uncategorised' }),
          el('td', { text: fmtUsd(p.tvl_usd) }),
          el('td', { text: fmtUsd(p.mcap_usd) }),
          el('td', { text: p.ratio === null ? 'n/a' : p.ratio.toFixed(3) + 'x' }));
      })));
    return el('div', null,
      el('div', { 'class': 'prose' },
        el('h2', { text: 'The comparables: where the multiples come from' }),
        el('p', null,
          'The board invents no prices. Each multiple below starts from the median market-cap-to-TVL ratio of the protocols ' +
          'in that category whose token already trades in this snapshot, winsorised to [0.01x, 10x] so one outlier ' +
          'cannot price a category. The spread column is the middle half of that category\u2019s ratios: where it is wide, ' +
          'the peers disagree and the price deserves less trust. The board multiple is what rows are actually priced at: ' +
          'the median shrunk toward the global median with the peer count as its weight, (n x median + ' + M.shrink_weight +
          ' x global) / (n + ' + M.shrink_weight + '). Between a category and the global pool sit the family pools, marked ' +
          'as such below: DefiLlama labels that name one line of business (Risk Curators with Onchain Capital Allocator, ' +
          'the derivatives and options labels together, and so on) pooled into a single evidence pool. A category with ' +
          'fewer than ' + M.min_category_comps + ' trading peers is priced by its family when the family holds at least ' +
          M.family_min_comps + ' peers, the family median shrunk toward the global median with the heavier weight ' +
          M.family_shrink_weight + ', because a family\u2019s evidence is broader and blunter than a category\u2019s own. ' +
          'The rest fall back to the global median of ' + D.comps_global.median_ratio.toFixed(3) + 'x over ' + D.comps_global.comps +
          ' protocols (its own middle half: ' + D.comps_global.p25_ratio.toFixed(3) + 'x \u2013 ' + D.comps_global.p75_ratio.toFixed(3) + 'x).')),
      compTable,
      el('div', { 'class': 'prose' }, el('h3', { text: 'Already trading: kept off the board, shown for scale' })),
      liveTable);
  }

  /* ---------- method ---------- */
  function methodView() {
    var p = function () {
      var node = el('p', null);
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        node.appendChild(typeof a === 'string' ? document.createTextNode(a) : a);
      }
      return node;
    };
    var b = function (t) { return el('b', { text: t }); };
    var code = function (t) { return el('code', { text: t }); };
    return el('div', { 'class': 'prose' },
      el('h2', { text: 'Method: how this radar reads the snapshot' }),
      p('The snapshot is DefiLlama\u2019s protocol list frozen on ', b(D.as_of), ': ', b(String(D.protocols_scanned)),
        ' protocols at $5M of TVL or more, each with a category, chains, a TVL, a 7-day TVL change, a first-tracked date, ' +
        'and, where a token trades, a market cap, a CoinGecko id and a symbol. Everything on this page is computed from ' +
        'those ten fields and nothing else.'),
      el('h3', { text: '1. Who is pre-token' }),
      p('A protocol ', b('records no token'), ' when its record carries no market cap, no CoinGecko id and no symbol. ' +
        'The wording matters: the record is what we can see, so the board says a protocol records no token, never that it has none.'),
      el('h3', { text: '2. The derivative screen' }),
      p('A wrapped, staked or bridged product of a token that already trades is not a launch still to come: WBTC is Bitcoin ' +
        'on Ethereum, and an exchange\u2019s staked ETH is ETH in a staking product. The board therefore drops pre-token protocols ' +
        'whose category is ', code('Bridge'), ', ', code('Canonical Bridge'), ', ', code('Liquid Staking'), ', ', code('Liquid Restaking'),
        ', ', code('Restaked BTC'), ' or ', code('CEX'), ', whose name carries the whole word wrapped, staked or staking, ends in a version ' +
        'marker (a pool of another protocol), or begins with an exchange\u2019s name. The house watchlist of ' + D.watchlist_size +
        ' is the floor: all of it is on the board, and the board adds every other protocol that passes the screen, ' +
        D.early_size + ' early finds below the $' + (D.floor_usd / 1e6) + 'M floor included.'),
      el('h3', { text: '3. The value model' }),
      el('p', { 'class': 'formula', text: 'implied = TVL x category multiple x growth multiplier x maturity multiplier' }),
      p(b('Category multiple.'), ' The median market-cap / TVL of the category\u2019s trading protocols in this snapshot ' +
        '(see Comparables), winsorised to [0.01x, 10x] so no single mania prices a category, then shrunk toward the ' +
        'global median with the peer count as its weight: (n x category median + ' + M.shrink_weight + ' x global median) / ' +
        '(n + ' + M.shrink_weight + '). Fifteen peers keep most of their own price; four peers borrow half of theirs from ' +
        'the whole market, because four ratios are a hint, not a measurement. A category with fewer than ' +
        M.min_category_comps + ' peers does not price itself: it is priced by its family, the pooled ratios of the sibling ' +
        'labels that name the same line of business, when that pool holds at least ' + M.family_min_comps + ' peers \u2014 shrunk ' +
        'harder toward the global median, with weight ' + M.family_shrink_weight + ', because the evidence is broader and ' +
        'blunter. Only a category with no family evidence takes the global median outright. This is the ' +
        'market\u2019s own revealed price of a TVL dollar in that line of business, discounted by how much evidence stands behind it.'),
      p(b('Spread and confidence.'), ' Every category also publishes the middle half of its peers\u2019 ratios (the 25th to ' +
        '75th percentile). Each row is stamped with the confidence its price earned: ', b('high'), ' when at least ' +
        M.confidence_high_comps + ' peers price it and their middle half spans no more than the median itself; ', b('medium'),
        ' when a category or a family prices it on fewer or disagreeing peers; ', b('low'), ' when the price is the global median because ' +
        'neither its category nor its family could speak. The stamp changes no number: it tells the reader how far to trust the one printed.'),
      p(b('Growth.'), ' The 7-day TVL change, clamped to [\u221250%, +100%], moves the value by up to \u00d760% of itself: ' +
        'a protocol gathering TVL is worth more than the same TVL standing still, and a collapsing one less, but one week never rewrites the price.'),
      p(b('Maturity.'), ' A multiplier from 0.70x to 1.20x on the square root of the protocol\u2019s age, saturating at four years. ' +
        'A protocol that has run for years with no token has a proven product and users who stayed without being paid; ' +
        'the square root makes the credit saturate so age alone cannot carry a row.'),
      p('No name is special-cased anywhere: one function prices every row, and each row\u2019s detail view shows its own ' +
        'decomposition, so any figure on the board can be re-derived from the snapshot by hand.'),
      el('h3', { text: '4. Farm plans' }),
      p('Each plan is generated from the protocol\u2019s own record: its category sets the core actions (supply and borrow for ' +
        'lending, swap and provide for a DEX, margin and hedge for derivatives, deposit and hold for a vault), its first chain ' +
        'sets the gas costs, its TVL sets a sane position size, and its age sets the holding window. Every step names its cost ' +
        'and its time. A plan assumes a points or allocation program may one day read the wallet\u2019s history; it never promises one exists.'),
      el('h3', { text: '5. Data hygiene' }),
      p('The snapshot is validated before it is priced: a duplicated protocol slug, a negative TVL, a malformed ' +
        'first-tracked date, or a watchlist slug the protocol list does not carry stops the run with an error rather ' +
        'than silently pricing a corrupted board. Sentinel market caps are not evidence: the snapshot records a market ' +
        'cap of 0 for some trading protocols and \u22121 for one, and a comparable must carry a market cap above zero and ' +
        'a TVL above zero before its ratio enters any pool. The program is deterministic: the same snapshot in, the ' +
        'same board out, byte for byte, on every run.'),
      el('h3', { text: '6. What this is not' }),
      p('Implied value is not a forecast and not a tip. It says: if this protocol issued a token today and the market priced ' +
        'it the way it prices its trading peers, the launch would be worth about this. Whether it ever issues one, and what ' +
        'the market would actually pay, are questions the snapshot does not answer and this page does not pretend to.')
    );
  }

  /* ---------- render ---------- */
  function render() {
    app.textContent = '';
    app.appendChild(header());
    app.appendChild(tabs());
    var view = state.tab === 'board' ? boardView() : state.tab === 'comps' ? compsView() : methodView();
    app.appendChild(view);
    app.appendChild(el('p', { 'class': 'foot', text:
      'Token Launch Radar · model ' + D.model_version + ' · data: ' + D.source + ' · ' +
      D.board_size + ' pre-token protocols ranked, ' + D.live_size + ' trading protocols shown as comparables. ' +
      'Implied values are this board\u2019s claims, derived from the snapshot alone.' }));
    app.setAttribute('aria-busy', 'false');
    if (view._refresh) view._refresh();
  }

  /* ---------- hash presets (deep links the screenshots use) ---------- */
  function applyHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      var k = kv[0], v = decodeURIComponent(kv[1] || '');
      if (k === 'tab' && (v === 'board' || v === 'comps' || v === 'method')) state.tab = v;
      if (k === 'cat') state.category = v;
      if (k === 'chain') state.chain = v;
      if (k === 'seg' && (v === 'all' || v === 'watchlist' || v === 'early')) state.seg = v;
      if (k === 'q') state.q = v;
    });
  }
  applyHash();
  render();
  var openSlug = null;
  location.hash.replace(/^#/, '').split('&').forEach(function (pair) {
    var kv = pair.split('=');
    if (kv[0] === 'p') openSlug = decodeURIComponent(kv[1] || '');
  });
  if (openSlug) openDetail(openSlug);
})();
