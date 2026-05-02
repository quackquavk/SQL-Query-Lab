// Execution Plan Viewer - Parse XML Showplan and render as visual flowchart.
// Uses D3.js + dagre for layout, color-coded by cost severity.

let _hooks = {};
let _currentPlan = null;
let _operators = [];

// Fetch execution plan XML from backend
export async function fetchExecutionPlan(query) {
  const res = await fetch('/api/execution-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.xml;
}

// Parse XML Showplan into operator tree and extract missing indexes
export function parseShowplanXml(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  const operators = [];
  const missingIndexes = [];

  const missingIndexGroups = doc.querySelectorAll('MissingIndexGroup');
  missingIndexGroups.forEach(group => {
    const index = group.querySelector('MissingIndex');
    if (!index) return;

    const table = index.getAttribute('Object') || index.getAttribute('Table') || '';
    const impact = parseFloat(group.getAttribute('Impact') || '0');
    const columns = [];
    index.querySelectorAll('Column').forEach(col => {
      const name = col.getAttribute('Name');
      if (name) columns.push(name);
    });

    if (columns.length > 0) {
      const parts = table.split('.');
      const schema = parts.length > 2 ? parts[1] : 'dbo';
      const db = parts.length > 3 ? parts[0] : runtime?.cursor?.currentDbName || 'master';
      const tbl = parts[parts.length - 1];
      const indexName = `IX_${tbl.replace(/[^a-zA-Z0-9]/g, '_')}_${columns.slice(0, 2).join('_')}`;

      missingIndexes.push({
        name: indexName,
        table: tbl,
        schema,
        database: db,
        columns,
        impact,
        createStatement: `CREATE INDEX [${indexName}] ON [${db}].[${schema}].[${tbl}] ([${columns.map(c => `[${c}]`).join(', ')}]);`
      });
    }
  });

  function parseRelOp(element, parentId = null) {
    const nodeId = element.getAttribute('NodeId');
    const physicalOp = element.getAttribute('PhysicalOp') || '';
    const logicalOp = element.getAttribute('LogicalOp') || '';
    const estimateRows = parseFloat(element.getAttribute('EstimateRows') || '0');
    const totalSubtreeCost = parseFloat(element.getAttribute('TotalSubtreeCost') || '0');
    const estimatedIO = parseFloat(element.getAttribute('EstimatedIOCost') || '0');
    const estimatedCPU = parseFloat(element.getAttribute('EstimatedCPUCost') || '0');

    // Parse RunTimeInformation for actual vs estimated
    let actualRows = estimateRows;
    const runTimeInfo = element.querySelector('RunTimeInformation');
    if (runTimeInfo) {
      const actualRowsAttr = runTimeInfo.getAttribute('ActualRows');
      if (actualRowsAttr) actualRows = parseInt(actualRowsAttr);
    }

    const op = {
      nodeId,
      physicalOp,
      logicalOp,
      estimateRows,
      actualRows,
      totalSubtreeCost,
      estimatedIO,
      estimatedCPU,
      parentId,
      children: []
    };

    operators.push(op);

    // Recurse into child elements (RelOp, StreamAggregate, Sort, etc.)
    const childSelectors = 'RelOp, StreamAggregate, Sort, HashMatch, NestedLoops, Merge, IndexScan, TableScan, ClusteredIndexScan, ClusteredIndexSeek';
    element.querySelectorAll(childSelectors).forEach(child => {
      parseRelOp(child, nodeId);
    });

    return op;
  }

  // Find the first RelOp and parse recursively
  const relOp = doc.querySelector('RelOp');
  if (relOp) {
    parseRelOp(relOp);
  }

  return { operators, missingIndexes };
}

// Build parent-child relationships
function buildOperatorTree(operators) {
  const opMap = new Map();
  operators.forEach(op => opMap.set(op.nodeId, op));

  operators.forEach(op => {
    if (op.parentId && opMap.has(op.parentId)) {
      opMap.get(op.parentId).children.push(op);
    }
  });

  return operators;
}

// Compute cost percentages for each operator
export function computeCostPercentages(operators) {
  if (operators.length === 0) return operators;

  // Find root (operator with no parent)
  const root = operators.find(op => !op.parentId);
  const totalCost = root ? root.totalSubtreeCost : 1;

  operators.forEach(op => {
    op.costPercent = totalCost > 0 ? (op.totalSubtreeCost / totalCost) * 100 : 0;

    // Classify cost severity
    if (op.costPercent < 30) {
      op.costLevel = 'low';
    } else if (op.costPercent < 70) {
      op.costLevel = 'medium';
    } else {
      op.costLevel = 'high';
    }
  });

  return operators;
}

// Initialize execution plan viewer with parsed operators
export function initExecPlanViewer(svgElement, data) {
  const d3 = window.d3;
  const dagre = window.dagre;

  if (!d3 || !dagre) {
    console.error('D3 or dagre not loaded');
    return;
  }

  // Support both old format (operators array) and new format ({ operators, missingIndexes })
  let operators, missingIndexes;
  if (Array.isArray(data)) {
    operators = data;
    missingIndexes = [];
  } else {
    operators = data.operators || data;
    missingIndexes = data.missingIndexes || [];
  }

  _currentPlan = svgElement;
  _operators = operators;

  // Clear previous content
  d3.select(svgElement).selectAll('*').remove();

  // Create SVG group for pan/zoom
  const svg = d3.select(svgElement);
  svg.append('g').attr('class', 'exec-plan-content');

  // Build operator tree to find root
  const opTree = buildOperatorTree(operators);
  const rootOp = operators.find(op => !op.parentId);

  if (!rootOp) {
    console.warn('No root operator found in execution plan');
    return;
  }

  // Create dagre graph
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  // Add all operators as nodes
  operators.forEach(op => {
    const height = 70; // Fixed height per operator
    g.setNode(op.nodeId, { width: 160, height });
  });

  // Add edges (parent-child relationships)
  operators.forEach(op => {
    if (op.parentId) {
      g.setEdge(op.parentId, op.nodeId);
    }
  });

  // Compute layout
  dagre.layout(g);

  // Render operators as nodes
  const content = svg.select('.exec-plan-content');

  operators.forEach(op => {
    const node = g.node(op.nodeId);
    if (!node) return;

    const nodeGroup = content.append('g')
      .attr('class', `exec-plan-operator cost-${op.costLevel || 'low'}`)
      .attr('data-node-id', op.nodeId)
      .attr('transform', `translate(${node.x - 80},${node.y - 35})`);

    // Background rect
    nodeGroup.append('rect')
      .attr('width', 160)
      .attr('height', 70)
      .attr('rx', 6)
      .attr('class', 'exec-plan-node-bg');

    // Cost stripe on left
    nodeGroup.append('rect')
      .attr('width', 4)
      .attr('height', 70)
      .attr('rx', 2)
      .attr('class', `exec-plan-cost-stripe cost-${op.costLevel || 'low'}`);

    // Operator name
    nodeGroup.append('text')
      .attr('x', 12)
      .attr('y', 22)
      .attr('class', 'exec-plan-op-name')
      .text(op.physicalOp || op.logicalOp);

    // Estimated rows
    nodeGroup.append('text')
      .attr('x', 12)
      .attr('y', 38)
      .attr('class', 'exec-plan-rows')
      .text(`Est: ${formatNumber(op.estimateRows)} rows`);

    // Actual rows
    nodeGroup.append('text')
      .attr('x', 12)
      .attr('y', 52)
      .attr('class', 'exec-plan-rows-actual')
      .text(`Act: ${formatNumber(op.actualRows)} rows`);

    // Cost percent
    nodeGroup.append('text')
      .attr('x', 12)
      .attr('y', 66)
      .attr('class', 'exec-plan-cost')
      .text(`${op.costPercent.toFixed(1)}% cost`);

    // Tooltip on hover
    nodeGroup.on('mouseenter', (event) => {
      showOperatorTooltip(event, op);
    });

    nodeGroup.on('mouseleave', () => {
      hideOperatorTooltip();
    });
  });

  // Render edges
  operators.forEach(op => {
    if (!op.parentId) return;
    const edge = g.edge(op.parentId, op.nodeId);
    if (!edge || !edge.points) return;

    const points = edge.points;
    let pathStr = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      pathStr += ` L ${points[i].x} ${points[i].y}`;
    }

    content.append('path')
      .attr('class', 'exec-plan-edge')
      .attr('d', pathStr)
      .attr('marker-end', 'url(#exec-plan-arrow)');
  });

  // Render missing index callouts if any
  if (missingIndexes && missingIndexes.length > 0) {
    const execPlanPanel = document.getElementById('execPlanPanel');
    if (execPlanPanel) {
      renderMissingIndexBadges(execPlanPanel, missingIndexes);
    }
  }

  // Add arrow marker definition
  const defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'exec-plan-arrow')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 8)
    .attr('refY', 5)
    .attr('markerWidth', 5)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('class', 'exec-plan-arrow');
}

// Setup pan/zoom
export function setupZoom(svgElement) {
  const d3 = window.d3;
  if (!d3) return;

  const svg = d3.select(svgElement);

  const zoom = d3.zoom()
    .scaleExtent([0.25, 4])
    .on('zoom', (event) => {
      svg.select('.exec-plan-content').attr('transform', event.transform);
    });

  svg.call(zoom);
}

// Format large numbers
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// Show operator tooltip
let _tooltip = null;

function showOperatorTooltip(event, operator) {
  if (!_tooltip) {
    _tooltip = document.createElement('div');
    _tooltip.className = 'exec-plan-tooltip';
    document.body.appendChild(_tooltip);
  }

  _tooltip.innerHTML = `
    <div class="exec-plan-tooltip-title">${operator.physicalOp || operator.logicalOp}</div>
    <div class="exec-plan-tooltip-row"><span>Logical:</span> ${operator.logicalOp}</div>
    <div class="exec-plan-tooltip-row"><span>Est. Rows:</span> ${formatNumber(operator.estimateRows)}</div>
    <div class="exec-plan-tooltip-row"><span>Act. Rows:</span> ${formatNumber(operator.actualRows)}</div>
    <div class="exec-plan-tooltip-row"><span>I/O Cost:</span> ${operator.estimatedIO.toFixed(4)}</div>
    <div class="exec-plan-tooltip-row"><span>CPU Cost:</span> ${operator.estimatedCPU.toFixed(4)}</div>
    <div class="exec-plan-tooltip-row"><span>Subtree:</span> ${operator.totalSubtreeCost.toFixed(6)}</div>
    <div class="exec-plan-tooltip-row"><span>Cost %:</span> ${operator.costPercent?.toFixed(2)}%</div>
  `;

  _tooltip.style.display = 'block';
  _tooltip.style.left = (event.pageX + 15) + 'px';
  _tooltip.style.top = (event.pageY + 15) + 'px';
}

function hideOperatorTooltip() {
  if (_tooltip) {
    _tooltip.style.display = 'none';
  }
}

// Render missing index badges in the execution plan panel
function renderMissingIndexBadges(panel, missingIndexes) {
  const existing = panel.querySelector('.missing-index-list');
  if (existing) existing.remove();

  const list = document.createElement('div');
  list.className = 'missing-index-list';
  list.innerHTML = `<h4 style="margin:12px 12px 4px;font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px">Missing Indexes (${missingIndexes.length})</h4>`;

  missingIndexes.forEach((idx, i) => {
    const item = document.createElement('div');
    item.className = 'missing-index-item';
    item.innerHTML = `
      <div class="missing-index-header">
        <span class="missing-index-badge-small">IX</span>
        <span class="missing-index-name">${idx.name || 'Index' + (i + 1)}</span>
        <span class="missing-index-impact">${idx.impact.toFixed(0)}% impact</span>
      </div>
      <div class="missing-index-table">${idx.table || 'Table'}</div>
      <div class="missing-index-columns">${idx.columns?.slice(0, 4).join(', ')}${idx.columns?.length > 4 ? '...' : ''}</div>
      <button class="missing-index-copy-btn" data-statement="${escapeHtml(idx.createStatement || '')}">Copy CREATE INDEX</button>
    `;

    item.querySelector('.missing-index-copy-btn')?.addEventListener('click', (e) => {
      const stmt = e.target.dataset.statement;
      if (stmt) {
        navigator.clipboard.writeText(stmt).then(() => {
        console.info('Copied CREATE INDEX statement to clipboard');
      });
      }
    });

    list.appendChild(item);
  });

  panel.appendChild(list);
}

let _missingIndexTooltip = null;

function showMissingIndexTooltip(event, indexInfo) {
  if (!_missingIndexTooltip) {
    _missingIndexTooltip = document.createElement('div');
    _missingIndexTooltip.className = 'exec-plan-tooltip missing-index-tooltip';
    document.body.appendChild(_missingIndexTooltip);
  }

  _missingIndexTooltip.innerHTML = `
    <div class="missing-index-title">Missing Index</div>
    <div class="missing-index-impact">Impact: ${indexInfo.impact}%</div>
    <div class="missing-index-table">Table: ${indexInfo.table}</div>
    <div class="missing-index-columns">Columns: ${(indexInfo.columns || []).join(', ')}</div>
    <div class="missing-index-sql">${indexInfo.createStatement || ''}</div>
  `;

  _missingIndexTooltip.style.display = 'block';
  _missingIndexTooltip.style.left = (event.pageX + 15) + 'px';
  _missingIndexTooltip.style.top = (event.pageY + 15) + 'px';
}

function hideMissingIndexTooltip() {
  if (_missingIndexTooltip) {
    _missingIndexTooltip.style.display = 'none';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Zoom controls
export function zoomIn(svgElement) {
  const d3 = window.d3;
  if (!d3) return;
  d3.select(svgElement).transition().duration(300).call(d3.zoom().scaleBy, 1.3);
}

export function zoomOut(svgElement) {
  const d3 = window.d3;
  if (!d3) return;
  d3.select(svgElement).transition().duration(300).call(d3.zoom().scaleBy, 0.7);
}

export function zoomReset(svgElement) {
  const d3 = window.d3;
  if (!d3) return;
  d3.select(svgElement).transition().duration(300).call(d3.zoom().transform, d3.zoomIdentity);
}

// Set cost filter
export function setCostFilter(threshold) {
  if (!_currentPlan) return;
  const d3 = window.d3;

  d3.select(_currentPlan).selectAll('.exec-plan-operator').each(function() {
    const nodeId = d3.select(this).attr('data-node-id');
    const op = _operators.find(o => o.nodeId === nodeId);
    if (op && op.costPercent < threshold) {
      d3.select(this).style('opacity', 0.2);
    } else {
      d3.select(this).style('opacity', 1);
    }
  });
}

// Set hooks
export function setExecPlanHooks({ onPlanLoad, onOperatorClick }) {
  _hooks.onPlanLoad = onPlanLoad;
  _hooks.onOperatorClick = onOperatorClick;
}