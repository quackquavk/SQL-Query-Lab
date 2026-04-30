// Chart Renderer - D3.js-based bar, line, and pie charts for query results.

let _chartContainer = null;
let _currentChart = null;

export function initChart(containerElement) {
  _chartContainer = containerElement;
}

export function destroyChart() {
  if (_currentChart) {
    _currentChart.remove();
    _currentChart = null;
  }
}

export function setChartData(data) {
  _currentData = data;
}

export function renderBarChart(data, xCol, yCol) {
  const d3 = window.d3;
  if (!d3 || !data || !data.rows || data.rows.length === 0) return;

  destroyChart();

  const container = document.getElementById('chartContainer');
  if (!container) return;

  const width = container.clientWidth || 600;
  const height = 220;
  const margin = { top: 20, right: 30, bottom: 50, left: 50 };

  const svg = d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', height)
    .attr('class', 'chart-svg');

  _currentChart = svg;

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const xValues = data.rows.map(r => String(r[xCol] || ''));
  const yValues = data.rows.map(r => parseFloat(r[yCol]) || 0);

  const x = d3.scaleBand()
    .domain(xValues)
    .range([0, innerWidth])
    .padding(0.2);

  const y = d3.scaleLinear()
    .domain([0, d3.max(yValues) * 1.1])
    .range([innerHeight, 0]);

  g.selectAll('.chart-bar')
    .data(data.rows)
    .enter().append('rect')
    .attr('class', 'chart-bar')
    .attr('x', d => x(String(d[xCol])))
    .attr('y', d => y(parseFloat(d[yCol]) || 0))
    .attr('width', x.bandwidth())
    .attr('height', d => innerHeight - y(parseFloat(d[yCol]) || 0))
    .attr('fill', '#e8a030')
    .attr('rx', 3)
    .on('mouseenter', function(event, d) {
      d3.select(this).attr('fill', '#c08020');
      showChartTooltip(event, `${xCol}: ${d[xCol]}\n${yCol}: ${d[yCol]}`);
    })
    .on('mouseleave', function() {
      d3.select(this).attr('fill', '#e8a030');
      hideChartTooltip();
    });

  g.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('class', 'chart-axis-label')
    .style('text-anchor', 'end')
    .attr('dx', '-0.5em')
    .attr('dy', '0.15em')
    .attr('transform', 'rotate(-25)');

  g.append('g')
    .call(d3.axisLeft(y).ticks(5))
    .selectAll('text')
    .attr('class', 'chart-axis-label');

  g.append('text')
    .attr('x', innerWidth / 2)
    .attr('y', innerHeight + 45)
    .attr('text-anchor', 'middle')
    .attr('class', 'chart-axis-title')
    .text(xCol);

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerHeight / 2)
    .attr('y', -35)
    .attr('text-anchor', 'middle')
    .attr('class', 'chart-axis-title')
    .text(yCol);
}

export function renderLineChart(data, xCol, yCol) {
  const d3 = window.d3;
  if (!d3 || !data || !data.rows || data.rows.length === 0) return;

  destroyChart();

  const container = document.getElementById('chartContainer');
  if (!container) return;

  const width = container.clientWidth || 600;
  const height = 220;
  const margin = { top: 20, right: 30, bottom: 50, left: 50 };

  const svg = d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', height)
    .attr('class', 'chart-svg');

  _currentChart = svg;

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const xValues = data.rows.map((r, i) => i);
  const yValues = data.rows.map(r => parseFloat(r[yCol]) || 0);

  const x = d3.scaleLinear()
    .domain([0, data.rows.length - 1])
    .range([0, innerWidth]);

  const y = d3.scaleLinear()
    .domain([0, d3.max(yValues) * 1.1])
    .range([innerHeight, 0]);

  const line = d3.line()
    .x((d, i) => x(i))
    .y(d => y(d))
    .curve(d3.curveMonotoneX);

  g.append('path')
    .datum(yValues)
    .attr('class', 'chart-line')
    .attr('d', line)
    .attr('fill', 'none')
    .attr('stroke', '#e8a030')
    .attr('stroke-width', 2);

  g.selectAll('.chart-dot')
    .data(data.rows)
    .enter().append('circle')
    .attr('class', 'chart-dot')
    .attr('cx', (d, i) => x(i))
    .attr('cy', d => y(parseFloat(d[yCol]) || 0))
    .attr('r', 4)
    .attr('fill', '#e8a030')
    .attr('stroke', '#fff')
    .attr('stroke-width', 1.5)
    .on('mouseenter', function(event, d) {
      d3.select(this).attr('r', 6);
      showChartTooltip(event, `${xCol}: ${d[xCol]}\n${yCol}: ${d[yCol]}`);
    })
    .on('mouseleave', function() {
      d3.select(this).attr('r', 4);
      hideChartTooltip();
    });

  g.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(Math.min(data.rows.length, 10)))
    .selectAll('text')
    .attr('class', 'chart-axis-label');

  g.append('g')
    .call(d3.axisLeft(y).ticks(5))
    .selectAll('text')
    .attr('class', 'chart-axis-label');

  g.append('text')
    .attr('x', innerWidth / 2)
    .attr('y', innerHeight + 45)
    .attr('text-anchor', 'middle')
    .attr('class', 'chart-axis-title')
    .text(xCol);

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerHeight / 2)
    .attr('y', -35)
    .attr('text-anchor', 'middle')
    .attr('class', 'chart-axis-title')
    .text(yCol);
}

export function renderPieChart(data, xCol, yCol) {
  const d3 = window.d3;
  if (!d3 || !data || !data.rows || data.rows.length === 0) return;

  destroyChart();

  const container = document.getElementById('chartContainer');
  if (!container) return;

  const width = container.clientWidth || 600;
  const height = 220;
  const radius = Math.min(width, height) / 2 - 30;

  const svg = d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', height)
    .attr('class', 'chart-svg');

  _currentChart = svg;

  const g = svg.append('g')
    .attr('transform', `translate(${width / 2},${height / 2})`);

  const pie = d3.pie()
    .value(d => parseFloat(d[yCol]) || 0)
    .sort(null);

  const arc = d3.arc()
    .innerRadius(0)
    .outerRadius(radius);

  const labelArc = d3.arc()
    .innerRadius(radius * 0.6)
    .outerRadius(radius * 0.6);

  const colors = d3.schemeCategory10;

  const slices = g.selectAll('.chart-slice')
    .data(pie(data.rows))
    .enter().append('g')
    .attr('class', 'chart-slice');

  slices.append('path')
    .attr('d', arc)
    .attr('fill', (d, i) => colors[i % colors.length])
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)
    .on('mouseenter', function(event, d) {
      d3.select(this).attr('opacity', 0.8);
      showChartTooltip(event, `${d.data[xCol]}: ${d.data[yCol]}`);
    })
    .on('mouseleave', function() {
      d3.select(this).attr('opacity', 1);
      hideChartTooltip();
    });

  slices.append('text')
    .attr('transform', d => `translate(${labelArc.centroid(d)})`)
    .attr('text-anchor', 'middle')
    .attr('class', 'chart-slice-label')
    .text(d => d.data[xCol]);
}

let _tooltip = null;

function showChartTooltip(event, text) {
  if (!_tooltip) {
    _tooltip = document.createElement('div');
    _tooltip.className = 'chart-tooltip';
    document.body.appendChild(_tooltip);
  }

  _tooltip.textContent = text;
  _tooltip.style.display = 'block';
  _tooltip.style.left = (event.pageX + 10) + 'px';
  _tooltip.style.top = (event.pageY + 10) + 'px';
}

function hideChartTooltip() {
  if (_tooltip) {
    _tooltip.style.display = 'none';
  }
}

export function updateChartColumnOptions(columns) {
  const xSelect = document.getElementById('chartXCol');
  const ySelect = document.getElementById('chartYCol');

  if (xSelect) {
    xSelect.innerHTML = columns.map(c => `<option value="${c}">${c}</option>`).join('');
  }
  if (ySelect) {
    ySelect.innerHTML = columns.map(c => `<option value="${c}">${c}</option>`).join('');
  }
}

export function getChartConfig() {
  const type = document.getElementById('chartTypeSelect')?.value || 'bar';
  const xCol = document.getElementById('chartXCol')?.value;
  const yCol = document.getElementById('chartYCol')?.value;
  return { type, xCol, yCol };
}