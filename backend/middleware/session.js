const sessions = new Map();

async function validateSession(sessionId) {
  return sessions.get(sessionId);
}

async function createSession(userId, data = {}) {
  const sessionId = Math.random().toString(36).substring(2);
  sessions.set(sessionId, { userId, ...data, createdAt: new Date().toISOString() });
  return sessionId;
}

async function deleteSession(sessionId) {
  sessions.delete(sessionId);
}

export { validateSession, createSession, deleteSession };