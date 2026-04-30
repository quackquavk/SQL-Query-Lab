import mssql from 'mssql';

const pools = new Map();

function buildConfig(server, authType, credentials) {
  const config = {
    server: server,
    authentication: {
      type: 'default'
    },
    options: {
      encrypt: true,
      trustServerCertificate: false,
      port: 1433
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };

  if (credentials?.database) {
    config.database = credentials.database;
  }

  switch (authType) {
    case 'sql':
      config.authentication = {
        type: 'sql',
        options: {
          userName: credentials.username || '',
          password: credentials.password || ''
        }
      };
      break;
    case 'windows':
      config.authentication = {
        type: 'ntlm',
        options: {
          domain: credentials?.domain || ''
        }
      };
      break;
    case 'entra':
      config.authentication = {
        type: 'azure-active-directory-service-principal',
        options: {
          tenantId: credentials?.tenantId || '',
          clientId: credentials?.clientId || '',
          clientSecret: credentials?.clientSecret || ''
        }
      };
      break;
  }

  return config;
}

async function getPool(userId, server, authType, credentials) {
  const key = `${userId}:${server}`;

  if (pools.has(key)) {
    return pools.get(key);
  }

  const config = buildConfig(server, authType, credentials);
  const pool = new mssql.ConnectionPool(config);

  pool.on('error', (err) => {
    console.error('Pool error:', err.message);
    pools.delete(key);
  });

  try {
    await pool.connect();
    pools.set(key, pool);
    return pool;
  } catch (err) {
    throw new Error(`Connection failed: ${err.message}`);
  }
}

async function testConnection(connConfig) {
  const config = buildConfig(connConfig.server, connConfig.authType, connConfig.credentials);
  const pool = new mssql.ConnectionPool(config);

  try {
    await pool.connect();
    const result = await pool.query('SELECT @@VERSION as version');
    const version = result.recordset[0].version;
    pool.close();
    return { serverVersion: version };
  } catch (err) {
    pool.close?.();
    const message = err.message || 'Connection failed';
    const code = err.code || 'CONNECTION_FAILED';
    return { success: false, error: message, code };
  }
}

async function executeQuery(pool, sql, params = []) {
  const request = pool.request();

  for (const param of params) {
    request.input(param.name, param.type, param.value);
  }

  return request.query(sql);
}

async function closePool(userId, server) {
  const key = `${userId}:${server}`;
  if (pools.has(key)) {
    await pools.get(key).close();
    pools.delete(key);
  }
}

async function closeAllPools() {
  for (const [key, pool] of pools) {
    await pool.close();
  }
  pools.clear();
}

export { getPool, buildConfig, testConnection, executeQuery, closePool, closeAllPools };