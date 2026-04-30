// Query Builder Canvas - Visual SELECT query building with drag-and-drop.

let _hooks = {};
let _svg = null;
let _schema = null;
let _canvasState = { tables: [], selectedColumns: {}, joins: [], whereConditions: [] };

export function setQueryBuilderHooks({ onQueryGenerated, onCanvasClear }) {
  _hooks.onQueryGenerated = onQueryGenerated;
  _hooks.onCanvasClear = onCanvasClear;
}

export function initQueryBuilder(svgElement, schema) {
  _svg = svgElement;
  _schema = schema;

  const d3 = window.d3;
  const dagre = window.dagre;

  if (!d3 || !dagre) {
    console.error('D3 or dagre not loaded');
    return;
  }

  d3.select(svgElement).selectAll('*').remove();

  const svg = d3.select(svgElement);
  svg.append('g').attr('class', 'query-builder-content');

  setupZoom(svgElement);
  renderCanvas();
}

export function addTableToCanvas(tableName) {
  if (_canvasState.tables.find(t => t.name === tableName)) return;

  const tableInfo = _schema.tables.find(t => t.name === tableName);
  if (!tableInfo) return;

  _canvasState.tables.push({ name: tableName, columns: tableInfo.columns });
  _canvasState.selectedColumns[tableName] = [];

  detectJoins();
  renderCanvas();
}

export function removeTableFromCanvas(tableName) {
  _canvasState.tables = _canvasState.tables.filter(t => t.name !== tableName);
  delete _canvasState.selectedColumns[tableName];
  _canvasState.joins = _canvasState.joins.filter(j => j.from.table !== tableName && j.to.table !== tableName);
  renderCanvas();
}

export function addColumnToSelection(tableName, columnName, zone) {
  if (!_canvasState.selectedColumns[tableName]) {
    _canvasState.selectedColumns[tableName] = [];
  }

  const cols = _canvasState.selectedColumns[tableName];
  if (!cols.find(c => c.column === columnName && c.zone === zone)) {
    cols.push({ column: columnName, zone });
  }

  if (zone === 'join') {
    detectJoins();
  }

  renderCanvas();
}

export function removeColumnFromSelection(tableName, columnName) {
  if (!_canvasState.selectedColumns[tableName]) return;

  _canvasState.selectedColumns[tableName] = _canvasState.selectedColumns[tableName]
    .filter(c => c.column !== columnName);

  _canvasState.joins = _canvasState.joins.filter(j =>
    !(j.from.table === tableName && j.from.column === columnName) &&
    !(j.to.table === tableName && j.to.column === columnName)
  );

  renderCanvas();
}

export function detectJoins() {
  _canvasState.joins = [];

  for (let i = 0; i < _canvasState.tables.length; i++) {
    for (let j = i + 1; j < _canvasState.tables.length; j++) {
      const table1 = _canvasState.tables[i];
      const table2 = _canvasState.tables[j];

      for (const rel of _schema.relationships || []) {
        if ((rel.from.table === table1.name && rel.to.table === table2.name) ||
            (rel.from.table === table2.name && rel.to.table === table1.name)) {
          const join = rel.from.table === table1.name ? rel : { from: rel.to, to: rel.from };
          _canvasState.joins.push({
            from: { table: join.from.table, column: join.from.column },
            to: { table: join.to.table, column: join.to.column }
          });
        }
      }
    }
  }
}

export function addWhereCondition(condition) {
  _canvasState.whereConditions.push(condition);
  renderCanvas();
}

export function removeWhereCondition(index) {
  _canvasState.whereConditions.splice(index, 1);
  renderCanvas();
}

export function clearCanvas() {
  _canvasState = { tables: [], selectedColumns: {}, joins: [], whereConditions: [] };
  if (_hooks.onCanvasClear) _hooks.onCanvasClear();
  renderCanvas();
}

export function generateSelectSql() {
  const errors = [];

  if (_canvasState.tables.length === 0) {
    errors.push('No tables selected');
    return { sql: '', errors };
  }

  const selectCols = [];
  for (const [tableName, cols] of Object.entries(_canvasState.selectedColumns)) {
    for (const col of cols) {
      if (col.zone === 'select') {
        selectCols.push(`${tableName}.${col.column}`);
      }
    }
  }

  let selectClause = selectCols.length > 0 ? selectCols.join(', ') : '*';

  const fromTable = _canvasState.tables[0].name;
  let fromClause = fromTable;

  const joinClauses = [];
  for (const join of _canvasState.joins) {
    const rel = _schema.relationships?.find(r =>
      (r.from.table === join.from.table && r.from.column === join.from.column &&
       r.to.table === join.to.table && r.to.column === join.to.column) ||
      (r.from.table === join.to.table && r.from.column === join.to.column &&
       r.to.table === join.from.table && r.to.column === join.from.column)
    );
    if (rel) {
      joinClauses.push(`JOIN ${join.to.table} ON ${join.from.table}.${join.from.column} = ${join.to.table}.${join.to.column}`);
    }
  }

  const whereClauses = [];
  for (const cond of _canvasState.whereConditions) {
    whereClauses.push(`${cond.table}.${cond.column} ${cond.operator} ${cond.value}`);
  }

  let sql = `SELECT ${selectClause}\nFROM ${fromClause}`;
  if (joinClauses.length > 0) {
    sql += '\n' + joinClauses.join('\n');
  }
  if (whereClauses.length > 0) {
    sql += '\nWHERE ' + whereClauses.join(' AND ');
  }

  if (_hooks.onQueryGenerated) {
    _hooks.onQueryGenerated(sql);
  }

  return { sql, errors };
}

function renderCanvas() {
  if (!_svg) return;

  const d3 = window.d3;
  const svg = d3.select(_svg);
  const content = svg.select('.query-builder-content');
  content.selectAll('*').remove();

  if (_canvasState.tables.length === 0) {
    content.append('text')
      .attr('class', 'query-empty-text')
      .attr('x', 250)
      .attr('y', 200)
      .attr('text-anchor', 'middle')
      .text('Drag tables from Object Explorer to start building');
    return;
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  _canvasState.tables.forEach(table => {
    const colCount = table.columns.length;
    const height = 40 + (colCount * 28) + 15;
    g.setNode(table.name, { width: 200, height: Math.max(height, 100) });
  });

  _canvasState.joins.forEach((join, i) => {
    g.setEdge(join.from.table, join.to.table, { id: `join-${i}` });
  });

  dagre.layout(g);

  _canvasState.tables.forEach(table => {
    const node = g.node(table.name);
    if (!node) return;

    const nodeGroup = content.append('g')
      .attr('class', 'query-node')
      .attr('data-table', table.name)
      .attr('transform', `translate(${node.x - 100},${node.y - node.height / 2})`);

    nodeGroup.append('rect')
      .attr('width', 200)
      .attr('height', node.height)
      .attr('rx', 6)
      .attr('class', 'query-node-bg');

    nodeGroup.append('rect')
      .attr('width', 200)
      .attr('height', 40)
      .attr('rx', 6)
      .attr('class', 'query-node-header');

    nodeGroup.append('text')
      .attr('x', 100)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .attr('class', 'query-node-title')
      .text(table.name);

    nodeGroup.append('text')
      .attr('x', 185)
      .attr('y', 25)
      .attr('text-anchor', 'end')
      .attr('class', 'query-node-remove')
      .text('×')
      .on('click', () => removeTableFromCanvas(table.name));

    table.columns.forEach((col, i) => {
      const y = 40 + (i * 28) + 18;
      const isSelected = _canvasState.selectedColumns[table.name]?.some(c => c.column === col.name && c.zone === 'select');

      nodeGroup.append('rect')
        .attr('x', 5)
        .attr('y', y - 12)
        .attr('width', 190)
        .attr('height', 24)
        .attr('rx', 3)
        .attr('class', `query-node-column-row ${isSelected ? 'selected' : ''}`)
        .on('click', () => {
          if (isSelected) {
            removeColumnFromSelection(table.name, col.name);
          } else {
            addColumnToSelection(table.name, col.name, 'select');
          }
        });

      if (col.isPK) {
        nodeGroup.append('rect')
          .attr('x', 10)
          .attr('y', y - 5)
          .attr('width', 5)
          .attr('height', 5)
          .attr('rx', 1)
          .attr('class', 'query-pk-badge');
      }

      nodeGroup.append('text')
        .attr('x', 20)
        .attr('y', y)
        .attr('class', 'query-col-name')
        .text(col.name);

      nodeGroup.append('text')
        .attr('x', 190)
        .attr('y', y)
        .attr('text-anchor', 'end')
        .attr('class', 'query-col-type')
        .text(col.type);
    });
  });

  _canvasState.joins.forEach((join, i) => {
    const edge = g.edge(join.from.table, join.to.table);
    if (!edge || !edge.points) return;

    const points = edge.points;
    let pathStr = `M ${points[0].x} ${points[0].y}`;
    for (let j = 1; j < points.length; j++) {
      pathStr += ` L ${points[j].x} ${points[j].y}`;
    }

    content.append('path')
      .attr('class', 'query-join-line')
      .attr('d', pathStr)
      .attr('marker-end', 'url(#query-join-arrow)');
  });

  const defs = svg.select('defs');
  if (defs.empty()) {
    const newDefs = svg.append('defs');
    newDefs.append('marker')
      .attr('id', 'query-join-arrow')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 8)
      .attr('refY', 5)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('class', 'query-join-arrow');
  }
}

function setupZoom(svgElement) {
  const d3 = window.d3;
  if (!d3) return;

  const svg = d3.select(svgElement);

  const zoom = d3.zoom()
    .scaleExtent([0.25, 4])
    .on('zoom', (event) => {
      svg.select('.query-builder-content').attr('transform', event.transform);
    });

  svg.call(zoom);
  svg.style('cursor', 'grab');
}

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

export function getCanvasState() {
  return _canvasState;
}