(function () {
  'use strict';

  var payloadEl = document.getElementById('faAnalyticsPayload');
  if (!payloadEl || typeof Chart === 'undefined') return;

  var data;
  try {
    data = JSON.parse(payloadEl.textContent || '{}');
  } catch (e) {
    return;
  }

  var fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--fa-font').trim() || 'system-ui, sans-serif';
  var muted = '#64748b';
  var grid = '#e2e8f0';

  Chart.defaults.font.family = fontFamily;
  Chart.defaults.font.size = 11;
  Chart.defaults.color = muted;
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.padding = 12;
  Chart.defaults.plugins.tooltip.titleFont = { size: 12, weight: '600' };
  Chart.defaults.plugins.tooltip.bodyFont = { size: 11 };
  Chart.defaults.scale.grid.color = grid;
  Chart.defaults.scale.border.display = false;

  function baseOptions(extra) {
    var opts = {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { beginAtZero: true, ticks: { maxTicksLimit: 6 } },
        x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
      },
    };
    if (extra) Object.keys(extra).forEach(function (k) { opts[k] = extra[k]; });
    return opts;
  }

  var fin = data.financialSeries || [];
  if (fin.length && document.getElementById('chartFinancial')) {
    new Chart(document.getElementById('chartFinancial'), {
      type: 'line',
      data: {
        labels: fin.map(function (r) { return r.month; }),
        datasets: [
          { label: 'Revenue (INR)', data: fin.map(function (r) { return r.revenue; }), borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.08)', fill: true, tension: 0.25 },
          { label: 'Gross profit (INR)', data: fin.map(function (r) { return r.gross_profit; }), borderColor: '#059669', tension: 0.25 },
        ],
      },
      options: baseOptions(),
    });
  }

  if (fin.length && document.getElementById('chartConversion')) {
    new Chart(document.getElementById('chartConversion'), {
      type: 'bar',
      data: {
        labels: fin.map(function (r) { return r.month; }),
        datasets: [
          { label: 'Created', data: fin.map(function (r) { return r.leads_count; }), backgroundColor: '#94a3b8' },
          { label: 'Completed', data: fin.map(function (r) { return r.completed_count; }), backgroundColor: '#2563eb' },
        ],
      },
      options: baseOptions(),
    });
  }

  if (fin.length && document.getElementById('chartAgentCost')) {
    new Chart(document.getElementById('chartAgentCost'), {
      type: 'bar',
      data: {
        labels: fin.map(function (r) { return r.month; }),
        datasets: [{ label: 'Agent cost (INR)', data: fin.map(function (r) { return r.agent_cost; }), backgroundColor: '#7c3aed' }],
      },
      options: baseOptions(),
    });
  }

  var delivery = data.deliveryTrend || [];
  if (delivery.length && document.getElementById('chartDeliveryTrend')) {
    new Chart(document.getElementById('chartDeliveryTrend'), {
      type: 'bar',
      data: {
        labels: delivery.map(function (d) { return d.day; }),
        datasets: [
          { label: 'Due (open)', data: delivery.map(function (d) { return d.due_total; }), backgroundColor: '#2563eb' },
          { label: 'Done on day', data: delivery.map(function (d) { return d.done; }), backgroundColor: '#059669' },
        ],
      },
      options: baseOptions(),
    });
  }

  var overdue = data.overdueTrend || [];
  if (overdue.length && document.getElementById('chartOverdue')) {
    new Chart(document.getElementById('chartOverdue'), {
      type: 'line',
      data: {
        labels: overdue.map(function (d) { return d.day; }),
        datasets: [{ label: 'Overdue backlog', data: overdue.map(function (d) { return d.overdue_backlog; }), borderColor: '#dc2626', tension: 0.2, fill: false }],
      },
      options: baseOptions(),
    });
  }

  var completions = data.completionTrend || [];
  if (completions.length && document.getElementById('chartCompletions')) {
    var hasCompletion = completions.some(function (d) { return d.completed > 0; });
    if (hasCompletion) {
      new Chart(document.getElementById('chartCompletions'), {
        type: 'bar',
        data: {
          labels: completions.map(function (d) { return d.day; }),
          datasets: [{ label: 'Completed', data: completions.map(function (d) { return d.completed; }), backgroundColor: '#059669' }],
        },
        options: baseOptions(),
      });
    } else {
      document.getElementById('chartCompletions').replaceWith(
        (function () {
          var p = document.createElement('p');
          p.className = 'fa-text-sm text-muted';
          p.textContent = 'No completions recorded in the trend window.';
          return p;
        })()
      );
    }
  }

  var workload = data.agentWorkload || [];
  if (workload.length && document.getElementById('chartWorkload')) {
    new Chart(document.getElementById('chartWorkload'), {
      type: 'bar',
      data: {
        labels: workload.map(function (w) { return w.agent_name; }),
        datasets: [
          { label: 'Active', data: workload.map(function (w) { return w.active_tasks; }), backgroundColor: '#2563eb' },
          { label: 'Overdue', data: workload.map(function (w) { return w.overdue; }), backgroundColor: '#dc2626' },
        ],
      },
      options: baseOptions({ indexAxis: 'y' }),
    });
  }

  var status = data.statusDistribution || [];
  if (status.length && document.getElementById('chartStatus')) {
    new Chart(document.getElementById('chartStatus'), {
      type: 'doughnut',
      data: {
        labels: status.map(function (s) { return s.status; }),
        datasets: [{ data: status.map(function (s) { return s.count; }), backgroundColor: ['#2563eb', '#059669', '#d97706', '#dc2626', '#64748b', '#7c3aed'] }],
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
    });
  }

  var monthly = data.monthlyStatus || [];
  if (monthly.length && document.getElementById('chartMonthlyStatus')) {
    var bucketSet = {};
    monthly.forEach(function (m) {
      Object.keys(m.buckets || {}).forEach(function (b) { bucketSet[b] = true; });
    });
    var buckets = Object.keys(bucketSet).sort();
    var palette = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#64748b', '#0ea5e9', '#84cc16'];
    var datasets = buckets.map(function (b, i) {
      return {
        label: b.replace(/_/g, ' '),
        data: monthly.map(function (m) { return (m.buckets && m.buckets[b]) || 0; }),
        backgroundColor: palette[i % palette.length],
      };
    });
    var hasMonthly = datasets.some(function (ds) { return ds.data.some(function (v) { return v > 0; }); });
    if (hasMonthly) {
      new Chart(document.getElementById('chartMonthlyStatus'), {
        type: 'bar',
        data: {
          labels: monthly.map(function (m) { return 'M' + m.month; }),
          datasets: datasets,
        },
        options: baseOptions({ scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }),
      });
    } else {
      document.getElementById('chartMonthlyStatus').replaceWith(
        (function () {
          var p = document.createElement('p');
          p.className = 'fa-text-sm text-muted';
          p.textContent = 'No YTD intake to chart.';
          return p;
        })()
      );
    }
  }
})();
