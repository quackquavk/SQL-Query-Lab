// Auth modal: handles login/register forms, wires to runtime.cursor.loggedInUser

const API_BASE = (typeof window !== 'undefined' && window.API_BASE) || '/api';

// Module state
let _mode = 'login'; // 'login' | 'register'

function _getEl(id) {
  return document.getElementById(id);
}

function _showError(msg) {
  const el = _getEl('auth-error');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function _clearError() {
  const el = _getEl('auth-error');
  if (el) {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

function _setTitle(title) {
  const el = _getEl('auth-modal-title');
  if (el) el.textContent = title;
}

function _setToggle(isRegister) {
  _mode = isRegister ? 'register' : 'login';
  const label = _getEl('auth-toggle-label');
  const btn = _getEl('auth-toggle-btn');
  if (label) label.textContent = isRegister ? 'Already have an account?' : "Don't have an account?";
  if (btn) btn.textContent = isRegister ? 'Sign In' : 'Register';
  _setTitle(isRegister ? 'Register' : 'Sign In');
}

function _clearInputs() {
  const u = _getEl('auth-username');
  const p = _getEl('auth-password');
  if (u) u.value = '';
  if (p) p.value = '';
}

export function showAuthModal() {
  const modal = _getEl('auth-modal');
  if (!modal) return;
  _clearError();
  _clearInputs();
  _setToggle(false);
  modal.classList.add('open');
  _getEl('auth-username')?.focus();
}

export function hideAuthModal() {
  const modal = _getEl('auth-modal');
  if (modal) modal.classList.remove('open');
  _clearError();
}

export function isAuthModalOpen() {
  const modal = _getEl('auth-modal');
  return modal?.classList.contains('open') || false;
}

// Wire the modal close button
export function initAuthModal() {
  const closeBtn = _getEl('auth-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideAuthModal);
  }

  // Close on backdrop click
  const modal = _getEl('auth-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hideAuthModal();
    });
  }

  // Toggle login/register
  _getEl('auth-toggle-btn')?.addEventListener('click', () => {
    _setToggle(_mode === 'login');
  });

  // Submit on Enter in password field
  _getEl('auth-password')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _getEl('auth-submit')?.click();
  });

  // Submit button
  _getEl('auth-submit')?.addEventListener('click', _handleSubmit);

  // Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isAuthModalOpen()) hideAuthModal();
  });
}

async function _handleSubmit() {
  const username = _getEl('auth-username')?.value.trim();
  const password = _getEl('auth-password')?.value;

  if (!username || !password) {
    _showError('Username and password are required.');
    return;
  }

  const endpoint = _mode === 'register' ? '/auth/register' : '/auth/login';
  const submitBtn = _getEl('auth-submit');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = _mode === 'register' ? 'Registering…' : 'Signing in…';
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      _showError(data.error || 'Request failed. Please try again.');
      return;
    }

    // Success — set user in runtime
    if (typeof window.__runtime !== 'undefined' && window.__runtime.cursor) {
      window.__runtime.cursor.loggedInUser = { id: data.id, username: data.username };
    }

    // Notify app that user is logged in
    window.dispatchEvent(new CustomEvent('auth:logged-in', { detail: data }));

    console.log(`[auth] ${_mode === 'register' ? 'Registered' : 'Logged in'}: ${data.username}`);
    hideAuthModal();
    _clearInputs();
  } catch (err) {
    _showError('Network error. Please try again.');
    console.error('[auth] Submit error:', err.message);
  } finally {
    const btn = _getEl('auth-submit');
    if (btn) {
      btn.disabled = false;
      btn.textContent = _mode === 'register' ? 'Register' : 'Sign In';
    }
  }
}

// Logout function — can be called externally
export async function logout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
  } catch (err) {
    console.warn('[auth] Logout request failed:', err.message);
  }

  // Always clear local state
  if (typeof window.__runtime !== 'undefined' && window.__runtime.cursor) {
    window.__runtime.cursor.loggedInUser = null;
  }
  window.dispatchEvent(new CustomEvent('auth:logged-out'));
  console.log('[auth] Logged out');
}