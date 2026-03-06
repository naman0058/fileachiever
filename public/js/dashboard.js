// public/js/dashboard.js

let drillChart = null;
let currentContext = 'overall-watchtime';
let currentRange = 'daily'; // 'daily' | 'monthly'
let currentDimension = 'overall'; // 'overall' | 'url' | 'promoter'

function qs(x, root=document){ return root.querySelector(x); }
function qsa(x, root=document){ return Array.from(root.querySelectorAll(x)); }

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' }});
  if (!res.ok) throw new Error(`Failed: ${res.status} ${url}`);
  return res.json();
}

function buildQuery(extra={}) {
  const p = new URLSearchParams();
  const s = extra.start ?? window.__FA_FILTERS__?.start;
  const e = extra.end ?? window.__FA_FILTERS__?.end;
  if (s) p.set('start', s);
  if (e) p.set('end', e);
  const q = p.toString();
  return q ? `?${q}` : '';
}

// generic dual-axis chart
function renderComboChart(ctx, labels, watchHrs, views, y1Title='Watch Time (hrs)', yTitle='Views (≥60s)') {
  if (drillChart) drillChart.destroy();
  drillChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { type: 'line', label: y1Title, data: watchHrs, yAxisID: 'y1', tension: 0.35, pointRadius: 0 },
        { type: 'bar',  label: yTitle,   data: views,    yAxisID: 'y' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y:  { beginAtZero: true, title: { display: true, text: yTitle   }},
        y1: { beginAtZero: true, position: 'right', title: { display: true, text: y1Title }}
      }
    }
  });
}

function renderStacked(ctx, labels, datasets, yTitle) {
  if (drillChart) drillChart.destroy();
  drillChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, title: { display: true, text: yTitle } }
      }
    }
  });
}

function setHighlights(listEl, items) {
  listEl.innerHTML = '';
  items.forEach(({label, value}) => {
    const li = document.createElement('li');
    li.className = 'flex justify-between';
    li.innerHTML = `<span class="text-zinc-500">${label}</span><span class="font-medium">${value}</span>`;
    listEl.appendChild(li);
  });
}

async function loadDrill({ range, context, dimension, start, end }) {
  const ctx = qs('#drillChart').getContext('2d');
  const highlights = qs('#drillHighlights');

  // Title
  const titleMap = {
    'overall-watchtime': 'Overall Watch Time',
    'overall-views': 'Overall Views',
    'unique-viewers': 'Unique Viewers',
    'avg-watchtime': 'Average Watch Time'
  };
  qs('#drill-title').textContent = `${titleMap[context] || 'Details'} — ${range[0].toUpperCase()+range.slice(1)}`;

  // Build the right endpoint(s)
  const q = buildQuery({ start, end });

  if (dimension === 'overall') {
    const url = range === 'daily' ? '/affiliate/api/overall/daily' : '/affiliate/api/overall/monthly';
    const data = await fetchJSON(`${url}${q}`);
    const labels = data.map(r => (range === 'daily' ? r.day : r.month));
    const watchHrs = data.map(r => Number(r.watch_seconds || 0) / 3600);
    const views = data.map(r => Number(r.views || 0));
    renderComboChart(ctx, labels, watchHrs, views);

    // Highlights
    const totalWatchHrs = watchHrs.reduce((a,b)=>a+b,0).toFixed(2);
    const totalViews = views.reduce((a,b)=>a+b,0).toLocaleString();
    const uniques = new Set(data.flatMap(()=>[])); // not available per row; show overall from page
    setHighlights(highlights, [
      {label: 'Watch Time (hrs)', value: totalWatchHrs},
      {label: 'Views (≥60s)', value: totalViews},
      {label: 'Unique Viewers*', value: (window.__FA_UNIQUES__ || '—')}
    ]);

  } else if (dimension === 'url') {
    // by URL stacked watch-time
    const urlEndpoint = range === 'daily' ? '/affiliate/api/url/daily' : '/affiliate/api/url/monthly';
    const rows = await fetchJSON(`${urlEndpoint}${q}`);
    const keyField = (dimension === 'url') ? (range === 'daily' ? 'day' : 'month') : '';
    const timeField = (range === 'daily') ? 'day' : 'month';

    const groups = {};
    const allLabelsSet = new Set();
    rows.forEach(r => {
      const key = r.original_url;
      const label = r[timeField];
      if (!groups[key]) groups[key] = {};
      groups[key][label] = (groups[key][label] || 0) + (Number(r.watch_seconds) / 3600);
      allLabelsSet.add(label);
    });

    const labels = Array.from(allLabelsSet).sort();
    const totals = Object.entries(groups).map(([k,v]) => [k, Object.values(v).reduce((a,b)=>a+b,0)]);
    totals.sort((a,b)=>b[1]-a[1]);
    const top = totals.slice(0,8).map(x=>x[0]);

    const datasets = top.map(name => ({
      label: name,
      data: labels.map(l => groups[name]?.[l] || 0),
      stack: 'watch'
    }));

    renderStacked(ctx, labels, datasets, 'Watch Time (hrs)');

    const totalWatch = totals.reduce((a, [,hrs])=>a+hrs,0).toFixed(2);
    setHighlights(highlights, [
      { label: 'URLs (top 8 shown)', value: top.length },
      { label: 'Total Watch (hrs)', value: totalWatch }
    ]);

  } else if (dimension === 'promoter') {
    // by promoter stacked watch-time
    const proEndpoint = range === 'daily' ? '/affiliate/api/promoter/daily' : '/affiliate/api/promoter/monthly';
    const rows = await fetchJSON(`${proEndpoint}${q}`);
    const timeField = (range === 'daily') ? 'day' : 'month';

    const groups = {};
    const allLabelsSet = new Set();
    rows.forEach(r => {
      const key = r.promoter_name || `#${r.promoter_id}`;
      const label = r[timeField];
      if (!groups[key]) groups[key] = {};
      groups[key][label] = (groups[key][label] || 0) + (Number(r.watch_seconds)/3600);
      allLabelsSet.add(label);
    });

    const labels = Array.from(allLabelsSet).sort();
    const totals = Object.entries(groups).map(([k,v]) => [k, Object.values(v).reduce((a,b)=>a+b,0)]);
    totals.sort((a,b)=>b[1]-a[1]);
    const top = totals.slice(0,8).map(x=>x[0]);

    const datasets = top.map(name => ({
      label: name,
      data: labels.map(l => groups[name]?.[l] || 0),
      stack: 'watch'
    }));

    renderStacked(ctx, labels, datasets, 'Watch Time (hrs)');

    const totalWatch = totals.reduce((a, [,hrs])=>a+hrs,0).toFixed(2);
    setHighlights(highlights, [
      { label: 'Promoters (top 8 shown)', value: top.length },
      { label: 'Total Watch (hrs)', value: totalWatch }
    ]);
  }
}

/** Modal wiring */
function openModal(modal) {
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}
function closeModal(modal) {
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  if (drillChart) { drillChart.destroy(); drillChart = null; }
}

document.addEventListener('DOMContentLoaded', () => {
  // open from KPI cards
  qsa('[data-open-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-open-modal');
      currentContext = btn.getAttribute('data-context') || 'overall-watchtime';
      const modal = qs(`#${modalId}`);
      // default selection
      currentRange = 'daily';
      currentDimension = 'overall';
      // set active tab
      qsa('.tabBtn', modal).forEach(b => b.classList.toggle('active', b.dataset.range === currentRange));
      // set filters defaults
      const form = qs('#drillFilters', modal);
      form.dimension.value = 'overall';
      form.start.value = window.__FA_FILTERS__?.start || '';
      form.end.value = window.__FA_FILTERS__?.end || '';
      openModal(modal);
      loadDrill({ range: currentRange, context: currentContext, dimension: currentDimension, start: form.start.value, end: form.end.value });
    });
  });

  // close modal
  qsa('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => closeModal(qs('#drillModal')));
  });

  // tabs
  qsa('.tabBtn').forEach(tab => {
    tab.addEventListener('click', () => {
      currentRange = tab.dataset.range;
      qsa('.tabBtn').forEach(b => b.classList.toggle('active', b === tab));
      const form = qs('#drillFilters');
      loadDrill({ range: currentRange, context: currentContext, dimension: form.dimension.value, start: form.start.value, end: form.end.value });
    });
  });

  // filters
  qs('#drillFilters').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    currentDimension = form.dimension.value;
    loadDrill({ range: currentRange, context: currentContext, dimension: currentDimension, start: form.start.value, end: form.end.value });
  });
});
