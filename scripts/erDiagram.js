// ER Diagram rendering with D3.js + dagre.
// SVG-based interactive diagram with pan/zoom, table node selection.

let _hooks = {};
let _svg = null;
let _currentSchema = null;
let _selectedTable = null;

export function setErDiagramHooks({ onTableSelect, onTableEdit }) {
  _hooks.onTableSelect = onTableSelect;
  _hooks.onTableEdit = onTableEdit;
}

// Fetch schema from backend API
// Requires connectionId to forward auth headers for live SQL Server connections
export async function fetchErSchema(connectionId, database) {
  const conn = runtime.connections?.[connectionId];
  const headers = {
    'X-User-Id': 'browser-user',
    'X-Server': conn?.server || '',
    'X-Auth-Type': conn?.authType || 'default',
    'X-Credentials': JSON.stringify(conn?.credentials || {})
  };
  const res = await fetch(`/api/schema/${encodeURIComponent(database)}`, { headers });
  if (!res.ok) throw new Error(`Schema fetch failed: ${res.status}`);
  return res.json();
}

// Initialize ER diagram with schema data
export function initErDiagram(svgElement, schema) {
  _svg = svgElement;
  _currentSchema = schema;

  const d3 = window.d3;
  const dagre = window.dagre;

  if (!d3 || !dagre) {
    console.error('D3 or dagre not loaded');
    return;
  }

  // Clear previous content
  d3.select(svgElement).selectAll('*').remove();

  // Create SVG group for pan/zoom
  const svg = d3.select(svgElement);
  svg.append('g').attr('class', 'er-diagram-content');

  // Create dagre graph
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes (tables)
  schema.tables.forEach(table => {
    const colCount = table.columns.length;
    const height = 40 + (colCount * 24) + 10; // header + columns + padding
    g.setNode(table.name, { width: 180, height: Math.max(height, 80) });
  });

  // Add edges (FK relationships)
  schema.relationships.forEach(rel => {
    g.setEdge(rel.from.table, rel.to.table);
  });

  // Compute layout
  dagre.layout(g);

  // Render nodes
  const content = svg.select('.er-diagram-content');

  schema.tables.forEach(table => {
    const node = g.node(table.name);
    if (!node) return;

    const nodeGroup = content.append('g')
      .attr('class', 'er-node')
      .attr('data-table', table.name)
      .attr('transform', `translate(${node.x - 90},${node.y - node.height / 2})`);

    // Background rect
    nodeGroup.append('rect')
      .attr('width', 180)
      .attr('height', node.height)
      .attr('rx', 6)
      .attr('class', 'er-node-bg');

    // Table name header
    nodeGroup.append('rect')
      .attr('width', 180)
      .attr('height', 40)
      .attr('rx', 6)
      .attr('class', 'er-node-header');

    nodeGroup.append('text')
      .attr('x', 90)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .attr('class', 'er-node-title')
      .text(table.name);

    // Column rows
    table.columns.forEach((col, i) => {
      const y = 40 + (i * 24) + 16;

      // PK badge
      if (col.isPK) {
        nodeGroup.append('rect')
          .attr('x', 8)
          .attr('y', y - 8)
          .attr('width', 6)
          .attr('height', 6)
          .attr('rx', 1)
          .attr('class', 'er-pk-badge');
      }

      // Column name
      nodeGroup.append('text')
        .attr('x', 20)
        .attr('y', y)
        .attr('class', 'er-col-name')
        .text(col.name);

      // Data type
      nodeGroup.append('text')
        .attr('x', 170)
        .attr('y', y)
        .attr('text-anchor', 'end')
        .attr('class', 'er-col-type')
        .text(col.type);

      // FK indicator
      if (col.isFK) {
        nodeGroup.append('circle')
          .attr('cx', 8)
          .attr('cy', y)
          .attr('r', 3)
          .attr('class', 'er-fk-dot');
      }
    });

    // Click handler - select table
    nodeGroup.on('click', () => {
      selectTable(table.name);
    });

    // Double-click handler - open table designer
    nodeGroup.on('dblclick', () => {
      openTableDesigner(table.name);
    });
  });

  // Render edges (FK relationships)
  schema.relationships.forEach(rel => {
    const edge = g.edge(rel.from.table, rel.to.table);
    if (!edge || !edge.points) return;

    const points = edge.points;
    let pathStr = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      pathStr += ` L ${points[i].x} ${points[i].y}`;
    }

    content.append('path')
      .attr('class', 'er-fk-line')
      .attr('d', pathStr)
      .attr('marker-end', 'url(#er-arrow)');
  });

  // Add arrow marker definition
  const defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'er-arrow')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 8)
    .attr('refY', 5)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('class', 'er-fk-arrow');

  setupZoom(svgElement);
}

// Setup pan/zoom on the SVG element
export function setupZoom(svgElement) {
  const d3 = window.d3;
  if (!d3) return;

  const svg = d3.select(svgElement);

  const zoom = d3.zoom()
    .scaleExtent([0.25, 4])
    .on('zoom', (event) => {
      svg.select('.er-diagram-content').attr('transform', event.transform);
    });

  svg.call(zoom);
  svg.style('cursor', 'grab');

  svg.on('mousedown', () => {
    svg.style('cursor', 'grabbing');
  });

  svg.on('mouseup', () => {
    svg.style('cursor', 'grab');
  });
}

// Select a table and notify hooks
export function selectTable(tableName) {
  _selectedTable = tableName;

  // Update visual selection
  if (_svg) {
    const d3 = window.d3;
    d3.select(_svg).selectAll('.er-node').classed('er-node-selected', false);
    d3.select(_svg).select(`.er-node[data-table="${tableName}"]`).classed('er-node-selected', true);
  }

  // Update runtime cursor
  if (typeof runtime !== 'undefined' && runtime.cursor) {
    runtime.cursor.erDiagram = runtime.cursor.erDiagram || {};
    runtime.cursor.erDiagram.selectedTable = tableName;
  }

  // Call hook
  if (_hooks.onTableSelect) {
    _hooks.onTableSelect(tableName);
  }
}

// Open table designer for a table
export function openTableDesigner(tableName) {
  if (_hooks.onTableEdit) {
    _hooks.onTableEdit(tableName);
  }
}

// Zoom controls
export function zoomIn(svgElement) {
  const d3 = window.d3;
  if (!d3) return;
  const svg = d3.select(svgElement);
  svg.transition().duration(300).call(d3.zoom().scaleBy, 1.3);
}

export function zoomOut(svgElement) {
  const d3 = window.d3;
  if (!d3) return;
  const svg = d3.select(svgElement);
  svg.transition().duration(300).call(d3.zoom().scaleBy, 0.7);
}

export function zoomReset(svgElement) {
  const d3 = window.d3;
  if (!d3) return;
  const svg = d3.select(svgElement);
  svg.transition().duration(300).call(d3.zoom().transform, d3.zoomIdentity);
}