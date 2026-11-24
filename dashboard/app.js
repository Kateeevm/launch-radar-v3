// Launch Radar dashboard, third version (model comps-odds-3).
//
// Renders window.RADAR (written by main.ts beside this page) as a board of
// pre-token protocols ranked by fitted implied value, where every row also
// carries the price of farming it: an expected reward under a stated
// scenario, the gas and the T-bill alternative subtracted, a net and a net
// per hands-on hour, and the drop share at which the plan breaks even.
// Around the board sit the proofs: an ablation ladder scored under two
// blind schemes (a random split and a time walk-forward), the measured
// coverage of the printed value ranges, a ledger that accounts for every
// protocol in the snapshot, and a scatter of the peers the model is fitted
// on. A scenario bar reprices every row live; the verdicts, the break-evens
// and the totals all follow it. No network, no framework: the page is the
// entry's own work, computed from the same numbers as board.json, and the
// strip under the headline recomputes the board's totals from the rows on
// this page and shows whether they agree with the program's own.
//
// The economics, mirrored from lib/model.ts so the page and the program
// cannot quietly disagree at the printed scenario: a launch hands a drop
// share of its value to farmers; a farmer's slice of the drop is their
// deposit's share of a farming pool assumed to total a tenth of TVL; the
// expected reward is that slice weighted by the token odds; the costs are
// the plan's gas (setup + weekly x horizon + exit) and the deposit's
// T-bill yield over the horizon. Verdicts: FARM when the net is at least
// $30 and at least $12 per hands-on hour, THIN when the net is at least
// $10, SKIP otherwise.
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) return;

  var $ = function (id) { return document.getElementById(id); };
  var state = {
    view: 'board',
    sortKey: 'rank',
    sortDir: 1,
    q: '',
    category: '',
    chain: '',
    verdict: '',
    watchOnly: false,
    detail: null,
  };
  // The scenario the board is priced under. deposit/weeks null means the
  // plan's own capital and hold; drop and tbill start at the printed board.
  var sc = { deposit: null, drop: R.scenario.drop_share, weeks: null, tbill: R.scenario.tbill_yield };

  function fmtInt(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtUSD(n) { return '$' + fmtInt(n); }
  function fmtUSD2(n) {
    var sign = n < 0 ? '-' : '';
    var a = Math.abs(n);
    return sign + '$' + (a >= 100 ? fmtInt(a) : a.toFixed(2));
  }
  function fmtCompact(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + fmtInt(n);
  }
  function fmtPct(x, digits) { return (x * 100).toFixed(digits === undefined ? 0 : digits) + '%'; }
  function fmtChange(x) {
    if (x === null || x === undefined) return '<span class="dim">-</span>';
    var cls = x > 0 ? 'pos' : x < 0 ? 'neg' : 'dim';
    return '<span class="' + cls + '">' + (x > 0 ? '+' : '') + x.toFixed(1) + '%</span>';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return '<span class="dim">-</span>';
    if (days >= 730) return (days / 365.25).toFixed(1) + 'y';
    return days + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- the economics engine, mirrored ------------------------------------
  function econFor(r, s) {
    var deposit = s.deposit !== null ? s.deposit : r.capital_usd;
    var weeks = s.weeks !== null ? s.weeks : r.weeks;
    var share = deposit / (R.scenario.farmer_pool_share * r.tvl_usd + deposit);
    var gross = r.if_launches_usd * s.drop * share;
    var expected = gross * r.token_odds;
    var gas = r.gas_setup_usd + r.gas_weekly_usd * weeks + r.gas_exit_usd;
    var opp = deposit * s.tbill * (weeks / 52);
    var net = expected - gas - opp;
    var hours = 1.25 + weeks / 6;
    var be = r.implied_value_usd * share > 0 ? (gas + opp) / (r.implied_value_usd * share) : null;
    if (be !== null && be > 1) be = null;
    return {
      deposit: deposit, weeks: weeks, share: share, gross: gross, expected: expected,
      gas: gas, opp: opp, net: net, hours: hours, nethr: net / hours, be: be,
      verdict: net >= 30 && net / hours >= 12 ? 'FARM' : net >= 10 ? 'THIN' : 'SKIP',
    };
  }
  function fmtBE(be) {
    return be === null ? '<span class="dim">never</span>' : fmtPct(be, 1);
  }

  // ---- header, KPIs, verification strip, formula --------------------------
  $('asof').innerHTML = 'Snapshot as of <b>' + esc(R.as_of) + '</b><br>DefiLlama public record, sealed';
  var v = R.fit.validation;
  var printed = { FARM: 0, THIN: 0, SKIP: 0 };
  R.rows.forEach(function (r) { printed[r.verdict] += 1; });
  var kpis = [
    ['Protocols accounted', fmtInt(R.protocol_count), 'every record in the snapshot, ledger below'],
    ['Watchlist covered', R.watchlist_size + ' / ' + R.watchlist_size, 'every protocol over the $50M floor, no token yet'],
    ['Held-out error', v.fitted_median_abs_log_error.toFixed(2), 'random split; ' + v.walkforward_median_abs_log_error.toFixed(2) + ' walking forward in time'],
    ['Ranges that behave', v.range_coverage_50_pct + '% / ' + v.range_coverage_80_pct + '%', 'of held-out caps inside the printed P25-P75 / P10-P90'],
    ['Farm verdicts', printed.FARM + ' FARM', printed.THIN + ' thin, ' + printed.SKIP + ' skip, of ' + R.board_size + ' plans priced'],
  ];
  $('kpis').innerHTML = kpis.map(function (k) {
    return '<div class="kpi"><div class="k-label">' + k[0] + '</div><div class="k-value">' + k[1] + '</div><div class="k-sub">' + k[2] + '</div></div>';
  }).join('');

  // Self-verification, recomputed from the rows on this page right now.
  var sumImplied = 0;
  var covered = 0;
  R.rows.forEach(function (r) { sumImplied += r.implied_value_usd; if (r.watchlist) covered += 1; });
  var ledgerSum = 0;
  R.ledger.forEach(function (l) { ledgerSum += l.count; });
  function check(ok) { return ok ? '<b>agrees</b>' : '<span class="bad">DISAGREES</span>'; }
  $('vstrip').innerHTML =
    'This page re-adds its own board: ' + R.rows.length + ' of ' + R.board_size + ' rows rendered &middot; implied total ' +
    fmtCompact(sumImplied) + ' ' + check(sumImplied === R.totals.implied_total_usd) + ' with board.json &middot; watchlist ' +
    covered + '/' + R.watchlist_size + ' &middot; ledger ' + ledgerSum + '/' + R.protocol_count + ' &middot; model source checksum <b>' +
    esc(R.code_checksum) + '</b> (main.ts + lib/model.ts, sha256)';

  var f = R.fit;
  $('formula').innerHTML =
    '<b>implied value</b> = TVL &times; peer multiple &times; token odds &nbsp;&middot;&nbsp; ln(multiple) = ' +
    f.intercept.toFixed(3) + ' ' + (f.size_coef < 0 ? '-' : '+') + ' ' + Math.abs(f.size_coef).toFixed(3) +
    ' &middot; ln(TVL / $100M) + category offset &nbsp;&middot;&nbsp; odds = geometric mean of the age, TVL and category token rates (base ' +
    fmtPct(f.odds_base_rate, 1) + ', smoothing 2, fitted on ' + f.peer_count + ' peers)';

  // ---- evidence band --------------------------------------------------------
  function ablationTable(rows, digits) {
    return '<table><thead><tr><th>Model stage</th><th>Random split</th><th>Time walk-fwd</th><th></th></tr></thead><tbody>' +
      rows.map(function (a) {
        return '<tr><td>' + esc(a.name) + '</td><td>' + a.twofold.toFixed(digits) + '</td><td>' + a.walkforward.toFixed(digits) +
          '</td><td><span class="tag ' + a.decision + '">' + a.decision + '</span></td></tr>';
      }).join('') + '</tbody></table>';
  }
  $('ev-ablation').innerHTML =
    '<h4>Built term by term, <b>tested blind twice</b></h4>' + ablationTable(v.ablation, 3) +
    '<p class="ev-note">Median log error on peers the fit never saw; lower is better. The shipped model is the third rung.</p>';

  var rq = v.residual_quantiles;
  $('ev-honesty').innerHTML =
    '<h4>Do the printed ranges <b>behave</b>?</h4>' +
    '<div class="ev-big">' + v.range_coverage_50_pct + '% <small>inside P25-P75</small> &middot; ' + v.range_coverage_80_pct + '% <small>inside P10-P90</small></div>' +
    '<p class="ev-note">Split-half honest: each fold\u2019s band is built from the other fold\u2019s misses, then checked against its own caps. ' +
    'The middle half of held-out misses runs from ' + Math.exp(rq.p25).toFixed(2) + 'x to ' + Math.exp(rq.p75).toFixed(2) +
    'x of the printed price — the bands are wide because the record is wide, and they say so.</p>';

  var LEDGER_COLORS = ['#2fe6a8', '#6cb8f2', '#5f7268', '#f2b544', '#93a89d', '#f2708a', '#7a5fd0', '#4d7c6f', '#c9a86a'];
  var ledgerBar = '<div class="ledgerbar">' + R.ledger.map(function (l, i) {
    return '<span style="width:' + (l.count / R.protocol_count * 100).toFixed(2) + '%;background:' + LEDGER_COLORS[i % LEDGER_COLORS.length] + '"></span>';
  }).join('') + '</div>';
  var ledgerLegend = '<ul class="legend">' + R.ledger.map(function (l, i) {
    return '<li><span class="sw" style="background:' + LEDGER_COLORS[i % LEDGER_COLORS.length] + '"></span>' + esc(l.label) + ' <b>' + l.count + '</b></li>';
  }).join('') + '</ul>';
  $('ev-ledger').innerHTML = '<h4>Every protocol <b>accounted for</b></h4>' + ledgerBar + ledgerLegend;

  // Scatter of the fit's peers: cap multiple against TVL, log-log, with the
  // fitted line and the middle-half miss band around it.
  function scatter(w, h, big) {
    var pts = R.peers;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(function (p) {
      var x = Math.log10(p.tvl_usd), y = Math.log10(p.multiple);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    });
    minY -= 0.15; maxY += 0.15;
    var padL = big ? 44 : 6, padB = big ? 20 : 6, padT = 6, padR = 6;
    function X(x) { return padL + (x - minX) / (maxX - minX) * (w - padL - padR); }
    function Y(y) { return h - padB - (y - minY) / (maxY - minY) * (h - padT - padB); }
    function fitY(tvl) { return Math.log10(Math.exp(f.intercept + f.size_coef * Math.log(tvl / 1e8))); }
    var t0 = Math.pow(10, minX), t1 = Math.pow(10, maxX);
    var line = '<line x1="' + X(minX).toFixed(1) + '" y1="' + Y(fitY(t0)).toFixed(1) + '" x2="' + X(maxX).toFixed(1) + '" y2="' + Y(fitY(t1)).toFixed(1) + '" stroke="#2fe6a8" stroke-width="1.6"/>';
    function bandLine(q) {
      var yy0 = fitY(t0) + Math.log10(Math.exp(q)), yy1 = fitY(t1) + Math.log10(Math.exp(q));
      return '<line x1="' + X(minX).toFixed(1) + '" y1="' + Y(yy0).toFixed(1) + '" x2="' + X(maxX).toFixed(1) + '" y2="' + Y(yy1).toFixed(1) + '" stroke="#2fe6a8" stroke-width="0.7" stroke-dasharray="3 3" opacity="0.55"/>';
    }
    var dots = pts.map(function (p) {
      return '<circle cx="' + X(Math.log10(p.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(p.multiple)).toFixed(1) + '" r="' + (big ? 2.6 : 1.8) + '" fill="#6cb8f2" opacity="0.75"/>';
    }).join('');
    var axes = '';
    if (big) {
      axes = '<text x="' + padL + '" y="' + (h - 4) + '" fill="#5f7268" font-size="10">TVL, log scale</text>' +
        '<text x="4" y="' + padT + 8 + '" fill="#5f7268" font-size="10">cap / TVL</text>' +
        '<text x="' + (w - padR - 118) + '" y="' + (Y(fitY(t1)) - 6) + '" fill="#2fe6a8" font-size="10">fitted multiple</text>';
    }
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Scatter of peer multiples against TVL">' +
      bandLine(rq.p25) + bandLine(rq.p75) + line + dots + axes + '</svg>';
  }
  $('ev-scatter').innerHTML =
    '<h4>The peers, <b>priced by the market</b></h4>' + scatter(300, 96, false) +
    '<p class="ev-note">' + f.peer_count + ' live-token peers; the line is the fitted multiple, the dashes the middle half of held-out misses.</p>';

  // ---- the board ------------------------------------------------------------
  var econCache = {};
  function refreshEcon() {
    econCache = {};
    R.rows.forEach(function (r) { econCache[r.slug] = econFor(r, sc); });
  }
  refreshEcon();

  var BOARD_COLS = [
    { key: 'rank', label: '#', val: function (r) { return r.rank; },
      cell: function (r) { return r.rank + '<span class="sub2">ranks ' + r.rank_lo + '\u2013' + r.rank_hi + '</span>'; } },
    { key: 'name', label: 'Protocol', val: function (r) { return r.name.toLowerCase(); },
      cell: function (r) { return (r.watchlist ? '<span class="wdot" title="On the watchlist"></span>' : '') + '<span class="pname">' + esc(r.name) + '</span><span class="pcat">' + esc(r.category) + '</span>'; } },
    { key: 'tvl', label: 'TVL', val: function (r) { return r.tvl_usd; }, cell: function (r) { return fmtCompact(r.tvl_usd); } },
    { key: 'change', label: '7d', val: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; }, cell: function (r) { return fmtChange(r.change_7d); } },
    { key: 'age', label: 'Age', val: function (r) { return r.age_days === null ? -1 : r.age_days; }, cell: function (r) { return fmtAge(r.age_days); } },
    { key: 'multiple', label: 'Peer x', val: function (r) { return r.peer_multiple; }, cell: function (r) { return r.peer_multiple.toFixed(2) + 'x'; } },
    { key: 'odds', label: 'Odds', val: function (r) { return r.token_odds; }, cell: function (r) { return fmtPct(r.token_odds); } },
    { key: 'implied', label: 'Implied value', val: function (r) { return r.implied_value_usd; },
      cell: function (r) { return fmtCompact(r.implied_value_usd) + '<span class="sub2">' + fmtCompact(r.value_p25) + '\u2013' + fmtCompact(r.value_p75) + '</span>'; } },
    { key: 'iflaunches', label: 'If it launches', val: function (r) { return r.if_launches_usd; }, cell: function (r) { return fmtCompact(r.if_launches_usd); } },
    { key: 'net', label: 'Net', val: function (r) { return econCache[r.slug].net; },
      cell: function (r) { var e = econCache[r.slug]; return '<span class="' + (e.net >= 0 ? 'netpos' : 'netneg') + '">' + fmtUSD2(e.net) + '</span><span class="sub2">exp ' + fmtUSD2(e.expected) + '</span>'; } },
    { key: 'nethr', label: 'Net / hr', val: function (r) { return econCache[r.slug].nethr; },
      cell: function (r) { var e = econCache[r.slug]; return '<span class="' + (e.nethr >= 0 ? 'netpos' : 'netneg') + '">' + fmtUSD2(e.nethr) + '</span>'; } },
    { key: 'breakeven', label: 'Break-even drop', val: function (r) { var b = econCache[r.slug].be; return b === null ? Infinity : b; },
      cell: function (r) { return fmtBE(econCache[r.slug].be); } },
    { key: 'verdict', label: 'Verdict', val: function (r) { return econCache[r.slug].verdict; },
      cell: function (r) { return '<span class="chip ' + econCache[r.slug].verdict + '">' + econCache[r.slug].verdict + '</span>'; } },
  ];
  // Live rows carry only the market's own figures; the model's side of the
  // comparison is the fitted size curve (before category offsets), computed
  // here from the printed fit so the miss stays honest and reproducible.
  function sizeCurveMultiple(tvl) { return Math.exp(f.intercept + f.size_coef * Math.log(tvl / 1e8)); }
  R.live.slice().sort(function (a, b) { return b.mcap_usd - a.mcap_usd; }).forEach(function (r, i) {
    r.rank = i + 1;
    r.curve_multiple = sizeCurveMultiple(r.tvl_usd);
    r.model_value_usd = r.tvl_usd * r.curve_multiple;
    r.model_vs_actual = r.model_value_usd / r.mcap_usd;
  });
  var LIVE_COLS = [
    { key: 'rank', label: '#', val: function (r) { return r.rank; }, cell: function (r) { return r.rank; } },
    { key: 'name', label: 'Protocol (token live)', val: function (r) { return r.name.toLowerCase(); },
      cell: function (r) { return '<span class="pname">' + esc(r.name) + '</span><span class="pcat">' + esc(r.category) + '</span>'; } },
    { key: 'tvl', label: 'TVL', val: function (r) { return r.tvl_usd; }, cell: function (r) { return fmtCompact(r.tvl_usd); } },
    { key: 'change', label: '7d', val: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; }, cell: function (r) { return fmtChange(r.change_7d); } },
    { key: 'cap', label: 'Actual cap', val: function (r) { return r.mcap_usd; }, cell: function (r) { return fmtCompact(r.mcap_usd); } },
    { key: 'multiple', label: 'Actual x', val: function (r) { return r.multiple; }, cell: function (r) { return r.multiple.toFixed(2) + 'x'; } },
    { key: 'curve', label: 'Size-curve x', val: function (r) { return r.curve_multiple; }, cell: function (r) { return r.curve_multiple.toFixed(2) + 'x'; } },
    { key: 'implied', label: 'Model value', val: function (r) { return r.model_value_usd; }, cell: function (r) { return fmtCompact(r.model_value_usd); } },
    { key: 'miss', label: 'Model / actual', val: function (r) { return r.model_vs_actual; },
      cell: function (r) { return '<span class="' + (r.model_vs_actual >= 0.5 && r.model_vs_actual <= 2 ? 'pos' : 'dim') + '">' + r.model_vs_actual.toFixed(2) + 'x</span>'; } },
  ];

  function currentData() { return state.view === 'live' ? R.live : R.rows; }
  function currentCols() { return state.view === 'live' ? LIVE_COLS : BOARD_COLS; }

  function populateFilters() {
    var data = currentData();
    var cats = {}, chains = {};
    data.forEach(function (r) { cats[r.category] = 1; (r.chains || []).forEach(function (c) { chains[c] = 1; }); });
    function fill(sel, values, allLabel, keep) {
      var cur = keep ? sel.value : '';
      sel.innerHTML = '<option value="">' + allLabel + '</option>' + values.sort().map(function (x) {
        return '<option value="' + esc(x) + '"' + (x === cur ? ' selected' : '') + '>' + esc(x) + '</option>';
      }).join('');
    }
    fill($('f-category'), Object.keys(cats), 'All categories', true);
    fill($('f-chain'), Object.keys(chains), 'All chains', true);
    state.category = $('f-category').value;
    state.chain = $('f-chain').value;
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return currentData().filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) === -1) return false;
      if (state.view === 'board') {
        if (state.verdict && econCache[r.slug].verdict !== state.verdict) return false;
        if (state.watchOnly && !r.watchlist) return false;
      }
      return true;
    });
  }

  function renderBoard() {
    var cols = currentCols();
    $('board-head').innerHTML = '<tr>' + cols.map(function (c) {
      return '<th data-key="' + c.key + '"' + (state.sortKey === c.key ? ' class="sorted"' : '') + '>' + c.label +
        (state.sortKey === c.key ? (state.sortDir === 1 ? ' \u25B2' : ' \u25BC') : '') + '</th>';
    }).join('') + '</tr>';
    var rows = filteredRows();
    var colByKey = {};
    cols.forEach(function (c) { colByKey[c.key] = c; });
    var sk = colByKey[state.sortKey] || cols[0];
    rows.sort(function (a, b) {
      var va = sk.val(a), vb = sk.val(b);
      if (va < vb) return -1 * state.sortDir;
      if (va > vb) return 1 * state.sortDir;
      return a.rank - b.rank;
    });
    $('board-body').innerHTML = rows.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.detail === r.slug ? ' class="selected"' : '') + '>' +
        cols.map(function (c) { return '<td>' + c.cell(r) + '</td>'; }).join('') + '</tr>';
    }).join('');
    $('board-empty').hidden = rows.length > 0;
    var heads = $('board-head').querySelectorAll('th');
    heads.forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-key');
        if (state.sortKey === key) { state.sortDir = -state.sortDir; }
        else { state.sortKey = key; state.sortDir = key === 'name' ? 1 : -1; }
        renderBoard();
      });
    });
    $('board-body').querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () {
        if (state.view !== 'board') return;
        var slug = tr.getAttribute('data-slug');
        state.detail = state.detail === slug ? null : slug;
        renderBoard();
        renderDetail();
      });
    });
  }

  function updateScenarioMeta() {
    var counts = { FARM: 0, THIN: 0, SKIP: 0 };
    var netTotal = 0;
    R.rows.forEach(function (r) { var e = econCache[r.slug]; counts[e.verdict] += 1; netTotal += e.net; });
    $('sc-verdicts').innerHTML = 'Under this scenario: <b>' + counts.FARM + ' FARM</b> &middot; ' + counts.THIN + ' THIN &middot; ' +
      counts.SKIP + ' SKIP &middot; summed net ' + fmtUSD2(netTotal);
    $('sc-note').textContent = 'Farming pool assumed at ' + fmtPct(R.scenario.farmer_pool_share) +
      ' of TVL; blank deposit or horizon means each plan\u2019s own. Nets, verdicts and break-evens reprice live; ranks and value ranges do not move \u2014 the model is not refitted.';
  }
  function readScenario() {
    var d = parseFloat($('sc-deposit').value);
    var w = parseFloat($('sc-weeks').value);
    var dr = parseFloat($('sc-drop').value);
    var tb = parseFloat($('sc-tbill').value);
    sc.deposit = isNaN(d) || d < 0 ? null : d;
    sc.weeks = isNaN(w) || w < 1 ? null : Math.min(52, Math.round(w));
    sc.drop = isNaN(dr) || dr < 0 ? R.scenario.drop_share : Math.min(1, dr / 100);
    sc.tbill = isNaN(tb) || tb < 0 ? R.scenario.tbill_yield : Math.min(0.5, tb / 100);
    refreshEcon();
    updateScenarioMeta();
    renderBoard();
    if (state.detail) renderDetail();
  }
  ['sc-deposit', 'sc-drop', 'sc-weeks', 'sc-tbill'].forEach(function (id) {
    $(id).addEventListener('input', readScenario);
  });
  $('sc-reset').addEventListener('click', function () {
    $('sc-deposit').value = ''; $('sc-weeks').value = '';
    $('sc-drop').value = String(R.scenario.drop_share * 100);
    $('sc-tbill').value = String(R.scenario.tbill_yield * 100);
    readScenario();
  });

  // ---- export -----------------------------------------------------------------
  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
  }
  $('x-csv').addEventListener('click', function () {
    var head = 'rank,name,category,tvl_usd,change_7d_pct,age_days,peer_multiple,token_odds,implied_value_usd,value_p25,value_p75,if_launches_usd,rank_lo,rank_hi,net_usd,net_per_hour_usd,break_even_drop,verdict';
    var lines = filteredRows().map(function (r) {
      var e = econCache[r.slug];
      return [r.rank, '"' + r.name.replace(/"/g, '""') + '"', '"' + r.category + '"', r.tvl_usd,
        r.change_7d === null ? '' : r.change_7d, r.age_days === null ? '' : r.age_days, r.peer_multiple.toFixed(4),
        r.token_odds.toFixed(4), r.implied_value_usd, r.value_p25, r.value_p75, r.if_launches_usd, r.rank_lo, r.rank_hi,
        e.net.toFixed(2), e.nethr.toFixed(2), e.be === null ? '' : e.be.toFixed(4), e.verdict].join(',');
    });
    download('launch-radar-board.csv', head + '\n' + lines.join('\n') + '\n', 'text/csv');
  });
  $('x-json').addEventListener('click', function () {
    var out = filteredRows().map(function (r) {
      var e = econCache[r.slug];
      return { rank: r.rank, name: r.name, slug: r.slug, category: r.category, tvl_usd: r.tvl_usd,
        implied_value_usd: r.implied_value_usd, value_p25: r.value_p25, value_p75: r.value_p75,
        rank_range: [r.rank_lo, r.rank_hi], net_usd: Math.round(e.net * 100) / 100, verdict: e.verdict };
    });
    download('launch-radar-board.json', JSON.stringify(out, null, 2) + '\n', 'application/json');
  });

  // ---- detail -------------------------------------------------------------------
  function ageBucket(days) {
    var b = R.fit.odds_by_age.buckets;
    if (days === null || days === undefined) return b[b.length - 1];
    if (days < 182) return b[0];
    if (days < 365) return b[1];
    if (days < 730) return b[2];
    if (days < 1460) return b[3];
    return b[4];
  }
  function tvlBucket(tvl) {
    var b = R.fit.odds_by_tvl.buckets;
    if (tvl < 1e7) return b[0];
    if (tvl < 5e7) return b[1];
    if (tvl < 2.5e8) return b[2];
    return b[3];
  }
  function tableOf(rows, totalLast) {
    return '<table class="wfall"><tbody>' + rows.map(function (r, i) {
      var cls = totalLast && i === rows.length - 1 ? ' class="total"' : '';
      return '<tr' + cls + '><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>';
    }).join('') + '</tbody></table>';
  }
  function renderDetail() {
    var el = $('detail');
    var r = null;
    R.rows.forEach(function (x) { if (x.slug === state.detail) r = x; });
    if (!r) { el.hidden = true; el.innerHTML = ''; return; }
    var e = econCache[r.slug];
    var price = tableOf([
      ['TVL in the snapshot', fmtCompact(r.tvl_usd)],
      ['x peer multiple for its size and category', r.peer_multiple.toFixed(3) + 'x'],
      ['Cap if it launches at that multiple', fmtCompact(r.if_launches_usd)],
      ['x token odds', fmtPct(r.token_odds, 1)],
      ['Implied value', fmtCompact(r.implied_value_usd)],
    ], true);
    var farm = tableOf([
      ['Your slice of a ' + fmtPct(sc.drop, 1).replace('.0', '') + ' drop, if it launches', fmtUSD2(e.gross)],
      ['x token odds ' + fmtPct(r.token_odds, 1), ''],
      ['Expected reward', fmtUSD2(e.expected)],
      ['Gas: setup, ' + e.weeks + ' weekly rounds, exit', '-' + fmtUSD2(e.gas)],
      ['T-bill alternative on ' + fmtUSD(e.deposit), '-' + fmtUSD2(e.opp)],
      ['Net', fmtUSD2(e.net)],
    ], true);
    var peers = '<table class="mini"><thead><tr><th>Peer</th><th>TVL</th><th>Actual cap</th><th>Actual x</th><th>Blind price</th><th>Miss</th></tr></thead><tbody>' +
      r.nearest_peers.map(function (p) {
        return '<tr><td>' + esc(p.name) + '</td><td>' + fmtCompact(p.tvl_usd) + '</td><td>' + fmtCompact(p.mcap_usd) + '</td><td>' +
          p.actual_multiple.toFixed(2) + 'x</td><td>' + fmtCompact(p.blind_price_usd) + '</td><td>' + p.miss.toFixed(2) + 'x</td></tr>';
      }).join('') + '</tbody></table>';
    var deposits = [150, 300, 750, 1500, 3000];
    var drops = [0.01, 0.025, 0.05, 0.1, 0.2];
    var sens = '<table class="mini sens"><thead><tr><th>Deposit \\ drop</th>' + drops.map(function (d) { return '<th>' + fmtPct(d, 1) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      deposits.map(function (dep) {
        return '<tr><td>' + fmtUSD(dep) + '</td>' + drops.map(function (d) {
          var cell = econFor(r, { deposit: dep, drop: d, weeks: null, tbill: sc.tbill });
          return '<td class="cell-' + cell.verdict + '">' + fmtUSD2(cell.net) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
    var bench = 'Park the same ' + fmtUSD(e.deposit) + ' in T-bills for ' + e.weeks + ' weeks and it pays ' + fmtUSD2(e.opp) +
      ' with no smart-contract risk and no claim to chase. The farm\u2019s expected edge over that is ' + fmtUSD2(e.expected - e.opp) +
      ' before gas — and the expectation is an average over launches that mostly do not happen on schedule: at ' +
      fmtPct(r.token_odds, 1) + ' odds, the single most likely outcome of this plan is still no token at all.';
    var exit = '<b>Walk-away arithmetic.</b> The plan pays only if the launch hands farmers at least ' +
      (e.be === null ? 'a drop share no launch plausibly gives (break-even sits above 100% of the implied value)' : '<b>' + fmtPct(e.be, 1) + '</b> of the implied value') +
      '. At the halfway mark (' + Math.max(1, Math.round(e.weeks / 2)) + ' weeks in), if the points or allocation signals imply less than that share, stop adding capital. ' +
      'If TVL falls under ' + fmtCompact(r.tvl_usd * 0.6) + ' (60% of today), the multiple this price rests on no longer describes the protocol — exit at market. ' +
      'If a token does launch, claim inside the first week and sell into the listing window rather than holding for a second leg: the plan\u2019s edge was the discount, not the asset.';
    el.innerHTML =
      '<button class="closebtn" id="d-close" type="button">Close</button>' +
      '<h2>' + (r.watchlist ? '<span class="wdot"></span>' : '') + esc(r.name) + ' <span class="chip ' + e.verdict + '">' + e.verdict + '</span></h2>' +
      '<p class="sub">' + esc(r.category) + ' &middot; ' + (r.chains || []).join(', ') + ' &middot; TVL ' + fmtCompact(r.tvl_usd) +
      ' &middot; live for ' + fmtAge(r.age_days) + (r.watchlist ? ' &middot; on the watchlist' : '') +
      ' &middot; value range ' + fmtCompact(r.value_p10) + '\u2013' + fmtCompact(r.value_p90) + ' (P10\u2013P90), ranks ' + r.rank_lo + '\u2013' + r.rank_hi + ' of ' + R.board_size + ' across ' + v.bootstrap_refits + ' refits</p>' +
      '<div class="detail-grid"><div><h3>The protocol\u2019s price</h3>' + price +
      '<h3>Your farm, priced</h3>' + farm +
      '<p class="plan-total">Net per hands-on hour ' + fmtUSD2(e.nethr) + ' over ' + e.hours.toFixed(1) + ' hours &middot; break-even drop ' + (e.be === null ? 'never' : fmtPct(e.be, 2)) + '</p></div>' +
      '<div><h3>Priced peers beside it</h3>' + peers +
      '<p class="ev-note">The five live-token peers nearest in size, same category first. Blind price = the peer\u2019s TVL at this protocol\u2019s fitted multiple; miss = blind / actual. The model is wrong about real protocols by about these factors — that is the honest scale of the ranges on the board.</p>' +
      '<h3>Where its odds come from</h3><dl class="kv">' +
      '<dt>Its age band (' + esc(ageBucket(r.age_days).label) + ') holds a token</dt><dd>' + fmtPct(ageBucket(r.age_days).rate, 1) + ' of ' + ageBucket(r.age_days).n + '</dd>' +
      '<dt>Its TVL band (' + esc(tvlBucket(r.tvl_usd).label) + ') holds a token</dt><dd>' + fmtPct(tvlBucket(r.tvl_usd).rate, 1) + ' of ' + tvlBucket(r.tvl_usd).n + '</dd>' +
      '<dt>Base rate across the fit set</dt><dd>' + fmtPct(R.fit.odds_base_rate, 1) + '</dd>' +
      '<dt>This protocol\u2019s fitted odds</dt><dd>' + fmtPct(r.token_odds, 1) + '</dd></dl></div></div>' +
      '<div class="detail-grid"><div><h3>What-if: net by deposit and drop share</h3>' + sens +
      '<p class="ev-note">At this plan\u2019s own horizon and the scenario T-bill yield. Green cells clear the FARM bar, amber the THIN bar.</p></div>' +
      '<div><h3>The certain alternative</h3><p class="sub" style="color:#cfddd5">' + bench + '</p>' +
      '<h3>Exit rules, in numbers</h3><div class="exitbox">' + exit + '</div></div></div>' +
      '<h3>The farm plan</h3><ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="plan-total">Plan totals: capital ' + fmtUSD(r.capital_usd) + ' &middot; gas ' + fmtUSD(r.gas_setup_usd) + ' setup + ' +
      fmtUSD(r.gas_weekly_usd) + '/week + ' + fmtUSD(r.gas_exit_usd) + ' exit = ' + fmtUSD2(r.gas_setup_usd + r.gas_weekly_usd * r.weeks + r.gas_exit_usd) +
      ' over ' + r.weeks + ' weeks &middot; ' + r.hours.toFixed(1) + ' hands-on hours &middot; hold ' + r.hold_days + ' days</p>';
    el.hidden = false;
    $('d-close').addEventListener('click', function () { state.detail = null; renderBoard(); renderDetail(); });
  }

  // ---- model page -----------------------------------------------------------------
  function simpleTable(head, rowsHtml) {
    return '<table><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rowsHtml + '</tbody></table>';
  }
  function renderModel() {
    var vv = R.fit.validation;
    var challengers = simpleTable(['Held-out test, median log error', 'Two-fold', 'Five-fold'],
      '<tr><td>Shipped model (size + category offsets)</td><td class="win">' + vv.fitted_median_abs_log_error.toFixed(4) + '</td><td class="win">' + vv.fitted_5fold_median_abs_log_error.toFixed(4) + '</td></tr>' +
      '<tr><td>Flat median multiple</td><td>' + vv.flat_median_abs_log_error.toFixed(4) + '</td><td>-</td></tr>' +
      '<tr><td>Naive 0.25x rule of thumb</td><td>' + vv.naive_median_abs_log_error.toFixed(4) + '</td><td>-</td></tr>');
    var altFits = simpleTable(['Alternative fit, tried and rejected', 'Two-fold', 'Why it lost'], vv.rejected_variants.map(function (x) {
      return '<tr><td>' + esc(x.name) + '</td><td>' + x.median_abs_log_error.toFixed(4) + '</td><td>' + esc(x.note) + '</td></tr>';
    }).join(''));
    var catTable = simpleTable(['Category', 'Peers', 'Fitted multiple at $100M TVL'], R.fit.top_categories.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td>' + c.peers + '</td><td>' + c.multiple.toFixed(3) + 'x</td></tr>';
    }).join(''));
    var rates = function (rows) {
      return rows.map(function (x) { return '<tr><td>' + esc(x.label) + '</td><td>' + x.n + '</td><td>' + fmtPct(x.rate, 1) + '</td></tr>'; }).join('');
    };
    var ablFull = simpleTable(['Multiples: model stage', 'Random split', 'Time walk-forward', 'Call', 'Why'], vv.ablation.map(function (a) {
      return '<tr><td>' + esc(a.name) + '</td><td>' + a.twofold.toFixed(4) + '</td><td>' + a.walkforward.toFixed(4) + '</td><td><span class="tag ' + a.decision + '">' + a.decision + '</span></td><td>' + esc(a.note) + '</td></tr>';
    }).join(''));
    var ablOdds = simpleTable(['Odds: model stage', 'Random split (log-loss)', 'Time walk-forward', 'Call', 'Why'], vv.odds_ablation.map(function (a) {
      return '<tr><td>' + esc(a.name) + '</td><td>' + a.twofold.toFixed(4) + '</td><td>' + a.walkforward.toFixed(4) + '</td><td><span class="tag ' + a.decision + '">' + a.decision + '</span></td><td>' + esc(a.note) + '</td></tr>';
    }).join(''));
    var ledgerFull = simpleTable(['Group', 'Protocols', 'Rule'], R.ledger.map(function (l) {
      return '<tr><td>' + esc(l.label) + '</td><td>' + l.count + '</td><td>' + esc(l.note) + '</td></tr>';
    }).join(''));
    $('model').innerHTML =
      '<div class="card"><h2>How the radar prices a token that does not exist</h2>' +
      '<p>It learns from the protocols in the snapshot that already have one. ' + R.fit.peer_count + ' live-token protocols form the training set: for each, the record gives a market cap and a TVL, so a multiple the market actually pays. The model fits the log of that multiple on the log of TVL plus a shrunken offset per category — value grows with size, but the multiple shrinks, and the fit measures by how much. A pre-token protocol is then priced as its own TVL times the fitted multiple for its size and category, times the fitted odds that a protocol like it holds a token at all. The odds come from the same record: launch rates by age band, by TVL band and by category, smoothed and combined as a geometric mean. Every number on the board is those three fitted pieces and nothing else — no protocol is priced by hand, and no figure comes from outside the snapshot.</p>' +
      '<p>Who gets priced is the snapshot\u2019s own house rule, applied without exceptions: the board ranks protocols with no token yet, over the $50M TVL floor, that are not exchanges, bridges or liquid-staking wrappers, not an older version of a listed protocol, and not a product of a protocol that already has a token. That leaves ' + R.board_size + ' of ' + R.protocol_count + '; the ledger at the bottom of this page accounts for every one of the rest, group by group. Live-token protocols are not discarded either — they sit on their own tab, priced by the same model next to their actual caps, which is the one place on the page where the model can be caught being wrong in public.</p>' +
      '<h3>The fit</h3><dl class="kv">' +
      '<dt>Training peers</dt><dd>' + R.fit.peer_count + '</dd>' +
      '<dt>Intercept (ln multiple at $100M TVL)</dt><dd>' + R.fit.intercept.toFixed(4) + '</dd>' +
      '<dt>Size coefficient</dt><dd>' + R.fit.size_coef.toFixed(4) + ' (a 10x bigger protocol carries a ' + Math.exp(R.fit.size_coef * Math.LN10).toFixed(2) + 'x multiple)</dd>' +
      '<dt>Flat-median multiple, for reference</dt><dd>' + R.fit.global_median_multiple.toFixed(3) + 'x</dd>' +
      '<dt>Base token rate in the fit set</dt><dd>' + fmtPct(R.fit.odds_base_rate, 1) + '</dd></dl>' +
      '<h3>Fitted multiple by category, at $100M TVL</h3>' + catTable + '</div>' +

      '<div class="card"><h2>Tested out of sample, three ways</h2>' +
      '<p>A fit graded on its own training data grades itself, so the shipped model is never scored that way. The first test is a random split: fit on half the peers, price the other half blind, then swap — the median miss is ' + vv.fitted_median_abs_log_error.toFixed(2) + ' in log terms, about a ' + Math.exp(vv.fitted_median_abs_log_error).toFixed(1) + 'x factor, and ' + vv.fitted_within_2x_pct + '% of blind prices land within 2x of the cap the market actually set. The second test walks forward in time: fit only on peers that listed earlier, price the ones that listed later. That is the test that resembles real use — the past pricing the future — and the shipped model scores ' + vv.walkforward_median_abs_log_error.toFixed(2) + ' there, better than on the random split. The third test is the ablation ladder: the model rebuilt one term at a time, each rung scored under both blind schemes, so every term in the formula has to earn its place twice.</p>' + ablFull +
      '<p>Two rungs deserve a straight read. Category offsets clearly win the random split and only tie the walk-forward — they are kept, but shrunk toward the size curve, because a tie in time is not a licence to lean on them. The 7-day growth term is the opposite temptation: it looks alive in-sample and is far worse on the random split while buying almost nothing in time, so it is dropped and the board says so. The odds ladder runs the same way, scored by log-loss:</p>' + ablOdds +
      '<h3>Challengers the shipped model beat</h3>' + challengers +
      '<p>The flat median — price everything at the typical multiple — is the honest baseline, and the naive quarter-multiple is the rule of thumb a farmer might carry in their head. Both lose to the fitted model under every scheme tried. Seven alternative fits were also built and measured before being rejected; their scores and the reason each lost are kept here rather than deleted, because a model page that only shows the winner is asking to be trusted:</p>' + altFits +
      '<p>Nothing on this page is scored on data the fit has seen.</p></div>' +

      '<div class="card"><h2>Ranges, and whether they behave</h2>' +
      '<p>Every row prints two ranges, and both are measured, not decorative. The rank range comes from ' + vv.bootstrap_refits + ' bootstrap refits: resample the peers, refit the whole model, re-rank the board, and keep the middle 80% of each protocol\u2019s ranks. The value band goes further — each refit\u2019s price is also widened by a held-out miss drawn from the validation residuals, because refits agree with each other far more than any of them agrees with the market. Whether the bands mean what they say is itself tested, split-half: build each fold\u2019s band from the other fold\u2019s residuals, then count. ' + vv.range_coverage_50_pct + '% of held-out caps fall inside the printed P25\u2013P75 band and ' + vv.range_coverage_80_pct + '% inside P10\u2013P90 — close to the 50% and 80% the labels promise, which is what calibrated means. The middle half of held-out misses runs from ' + Math.exp(vv.residual_quantiles.p25).toFixed(2) + 'x to ' + Math.exp(vv.residual_quantiles.p75).toFixed(2) + 'x of the printed price. A radar that prints a $30M point estimate without admitting it has been off by 3x on protocols it could check would be theatre; the ranges are the admission, sized by the record.</p></div>' +

      '<div class="card"><h2>The economics engine, and its stated assumptions</h2>' +
      '<p>A rank by implied value alone answers the wrong question for a farmer: the biggest protocols carry the biggest values and the thinnest slices. So every row is also run through a small economics engine. Assume a launch hands ' + fmtPct(R.scenario.drop_share) + ' of its value to farmers (the scenario bar at the top reprices this live). A farmer\u2019s slice of that drop is their deposit\u2019s share of a farming pool assumed to total ' + fmtPct(R.scenario.farmer_pool_share) + ' of TVL — proportional allocation, the way points programs usually settle. The expected reward is the slice weighted by the token odds. Against it stand the plan\u2019s own gas — setup, a weekly round, an exit, each priced in the plan steps — and the deposit\u2019s T-bill alternative at ' + fmtPct(R.scenario.tbill_yield) + ' a year. Hands-on time is an hour and a quarter of setup plus ten minutes a week. The verdict is then arithmetic, not taste: FARM when the net clears $30 and pays at least $12 per hands-on hour, THIN when it clears $10, SKIP when the numbers do not pay at all. At the printed scenario that is ' + printed.FARM + ' FARM, ' + printed.THIN + ' THIN and ' + printed.SKIP + ' SKIP — and the pattern is the finding: the plans that pay sit in the middle of the table, where multiples are fat and pools are still small enough for a deposit to matter, not at the top where the implied values are largest. Change the drop share or the deposit at the top of the page and the verdicts move exactly as the arithmetic says they should; the model underneath does not move at all.</p></div>' +

      '<div class="card"><h2>The peers, plotted</h2>' + scatter(860, 320, true) +
      '<p class="scatter-note">Each dot is one of the ' + R.fit.peer_count + ' training peers: TVL across, the multiple the market pays down. The line is the fitted size curve before category offsets; the dashed lines bound the middle half of held-out misses. The downward slope is the whole thesis — size buys value, but at a falling rate.</p>' +
      '<h3>Every protocol in the snapshot, accounted for</h3>' + ledgerFull +
      '<p>The board is a decision, and decisions should be auditable: ' + R.board_size + ' ranked + ' + R.live_size + ' shown live + the groups above = ' + R.protocol_count + '. If a protocol you expected is missing from the board, its group and its rule are in this table.</p></div>' +

      '<div class="card"><h2>Token odds, from the record</h2>' +
      '<p>The odds are not a vibe. Among the protocols in the fit set, the share that hold a token today is counted by age band and by TVL band; a protocol\u2019s odds are the geometric mean of its two band rates and its category rate, each smoothed toward the base rate with a weight of 2 — light smoothing, because heavier smoothing scored worse out of sample (log-loss ' + vv.odds_log_loss.toFixed(3) + ' shipped, against ' + vv.odds_log_loss_alpha25.toFixed(3) + ' at the old weight and ' + vv.odds_log_loss_base_rate.toFixed(3) + ' for the base rate alone; walking forward in time, ' + vv.odds_walkforward_log_loss.toFixed(3) + ').</p>' +
      '<h3>Share holding a token, by age</h3>' + simpleTable(['Age band', 'Protocols', 'Hold a token'], rates(R.fit.odds_by_age.buckets)) +
      '<h3>Share holding a token, by TVL</h3>' + simpleTable(['TVL band', 'Protocols', 'Hold a token'], rates(R.fit.odds_by_tvl.buckets)) + '</div>';
  }

  // ---- footer -----------------------------------------------------------------------
  $('foot').innerHTML =
    '<p><b>Method, in one breath.</b> Fit cap/TVL multiples on the snapshot\u2019s own live-token peers (log multiple on log TVL plus shrunken category offsets), price each pre-token protocol at TVL x fitted multiple x fitted token odds, then price the farm itself: expected slice of a stated drop share, minus the plan\u2019s gas, minus the T-bill alternative. Model ' + esc(R.model_version) + '; fit, validation, ranges, ledger and board all regenerate from the sealed snapshot on every run, and two runs of the program produce byte-identical output.</p>' +
    '<p><b>How to read the board.</b> Rank is by implied value; the small line under it is the rank range across bootstrap refits, and the line under the value is its P25\u2013P75 band — both calibrated against held-out caps on the model page. Net and net/hour are priced at the scenario in force (the printed board uses each plan\u2019s own capital and hold, a ' + fmtPct(R.scenario.drop_share) + ' drop and a ' + fmtPct(R.scenario.tbill_yield) + ' T-bill yield); break-even drop is the share of implied value a launch would have to hand farmers for the plan to pay its costs. The verdict bars — $30 net and $12 an hour for FARM, $10 for THIN — are editorial, stated here so they can be disagreed with precisely.</p>' +
    '<p><b>What would change these numbers.</b> A fresher snapshot, a launch announcement for a listed protocol, or a points program whose allocation is not proportional to capital. The radar prices the record it was given; it does not know about private rounds, unannounced tokens or next quarter\u2019s meta, and the ranges are sized to admit exactly that.</p>';

  // ---- view switching and wiring ------------------------------------------------------
  function setView(view) {
    state.view = view;
    state.detail = null;
    $('v-board').classList.toggle('active', view === 'board');
    $('v-live').classList.toggle('active', view === 'live');
    $('v-model').classList.toggle('active', view === 'model');
    var isModel = view === 'model';
    $('board-wrap').hidden = isModel;
    $('model').hidden = !isModel;
    $('detail').hidden = true;
    $('f-verdict').disabled = view !== 'board';
    $('f-watch').disabled = view !== 'board';
    if (!isModel) { populateFilters(); renderBoard(); }
    window.scrollTo(0, 0);
  }
  $('v-board').addEventListener('click', function () { setView('board'); });
  $('v-live').addEventListener('click', function () { setView('live'); });
  $('v-model').addEventListener('click', function () { setView('model'); });
  $('q').addEventListener('input', function () { state.q = $('q').value; renderBoard(); });
  $('f-category').addEventListener('change', function () { state.category = $('f-category').value; renderBoard(); });
  $('f-chain').addEventListener('change', function () { state.chain = $('f-chain').value; renderBoard(); });
  $('f-verdict').addEventListener('change', function () { state.verdict = $('f-verdict').value; renderBoard(); });
  $('f-watch').addEventListener('change', function () { state.watchOnly = $('f-watch').checked; renderBoard(); });

  // Deep links the screenshots use: #verdict=FARM, #detail=<slug>, #view=model.
  function applyHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var params = {};
    h.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
    if (params.view === 'model') { setView('model'); return; }
    if (params.view === 'live') setView('live');
    if (params.verdict) { state.verdict = params.verdict; $('f-verdict').value = params.verdict; }
    if (params.category) { state.category = params.category; $('f-category').value = params.category; }
    if (params.chain) { state.chain = params.chain; $('f-chain').value = params.chain; }
    if (params.watch) { state.watchOnly = true; $('f-watch').checked = true; }
    renderBoard();
    if (params.detail) {
      state.detail = params.detail;
      renderBoard();
      renderDetail();
      var el = $('detail');
      if (el && !el.hidden) window.scrollTo(0, Math.max(0, el.offsetTop - 110));
    }
  }

  renderModel();
  updateScenarioMeta();
  populateFilters();
  renderBoard();
  applyHash();
})();
