// PeekAI Popup Script

class PeekAIPopup {
  constructor() {
    this.currentTab = 'dashboard';
    this.settings = {};
    this.user = null;
    this.apiBaseUrl = 'https://your-encore-app.com'; // Replace with your actual API URL
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.setupNavigation();
    this.loadDashboard();
    this.applyTheme();
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getSettings" }, (response) => {
        this.settings = {
          theme: 'light',
          stealthMode: false,
          language: 'en',
          authToken: null,
          userTier: 'free',
          ...response
        };
        resolve();
      });
    });
  }

  setupEventListeners() {
    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
      this.toggleTheme();
    });

    // Settings button
    document.getElementById('settings-btn').addEventListener('click', () => {
      this.showSettings();
    });

    // Quick actions
    document.getElementById('quick-ask-btn').addEventListener('click', () => {
      this.triggerQuickAsk();
    });

    document.getElementById('stealth-toggle').addEventListener('click', () => {
      this.toggleStealthMode();
    });

    // History actions
    document.getElementById('export-history').addEventListener('click', () => {
      this.exportHistory();
    });

    document.getElementById('clear-history').addEventListener('click', () => {
      this.clearHistory();
    });

    // Auth actions
    document.getElementById('login-btn').addEventListener('click', () => {
      this.handleLogin();
    });

    document.getElementById('google-login-btn').addEventListener('click', () => {
      this.handleGoogleLogin();
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      this.handleLogout();
    });

    document.getElementById('show-signup').addEventListener('click', () => {
      this.toggleAuthMode();
    });

    // Upgrade buttons
    document.querySelectorAll('.upgrade-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const plan = e.target.getAttribute('data-plan');
        this.handleUpgrade(plan);
      });
    });

    // Manage subscription
    document.getElementById('manage-subscription').addEventListener('click', () => {
      this.manageSubscription();
    });
  }

  setupNavigation() {
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');
        this.switchTab(tabName);
      });
    });
  }

  switchTab(tabName) {
    // Update nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');

    this.currentTab = tabName;

    // Load tab-specific content
    switch (tabName) {
      case 'dashboard':
        this.loadDashboard();
        break;
      case 'history':
        this.loadHistory();
        break;
      case 'account':
        this.loadAccount();
        break;
    }
  }

  async loadDashboard() {
    try {
      if (this.settings.authToken) {
        // Load usage stats
        const stats = await this.makeAPIRequest('/user/profile/usage');
        if (stats) {
          document.getElementById('daily-usage').textContent = stats.dailyUsage;
          document.getElementById('daily-limit').textContent = stats.dailyLimit;
          document.getElementById('current-tier').textContent = this.formatTier(stats.tier);
        }

        // Show/hide upgrade section based on tier
        const upgradeSection = document.getElementById('upgrade-section');
        if (stats && stats.tier === 'premium') {
          upgradeSection.style.display = 'none';
        } else {
          upgradeSection.style.display = 'block';
        }
      } else {
        // Show default values for unauthenticated users
        document.getElementById('daily-usage').textContent = '0';
        document.getElementById('daily-limit').textContent = '10';
        document.getElementById('current-tier').textContent = 'Free';
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    }
  }

  async loadHistory() {
    try {
      const historyList = document.getElementById('history-list');
      
      if (!this.settings.authToken) {
        historyList.innerHTML = `
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <circle cx="12" cy="17" r="1"/>
            </svg>
            <p>Sign in to view history</p>
            <p class="empty-subtitle">Your query history will appear here after signing in</p>
          </div>
        `;
        return;
      }

      const response = await this.makeAPIRequest('/history/recent');
      
      if (response && response.queries && response.queries.length > 0) {
        historyList.innerHTML = response.queries.map(query => `
          <div class="history-item" data-id="${query.id}">
            <div class="history-question">${this.escapeHtml(query.question)}</div>
            <div class="history-meta">
              <span>${query.pageDomain || 'Unknown'}</span>
              <span>${this.formatDate(query.createdAt)}</span>
            </div>
          </div>
        `).join('');

        // Add click handlers
        historyList.querySelectorAll('.history-item').forEach(item => {
          item.addEventListener('click', () => {
            const queryId = item.getAttribute('data-id');
            this.showQueryDetails(queryId);
          });
        });
      } else {
        historyList.innerHTML = `
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <circle cx="12" cy="17" r="1"/>
            </svg>
            <p>No queries yet</p>
            <p class="empty-subtitle">Start asking questions to see your history here</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('Failed to load history:', error);
      const historyList = document.getElementById('history-list');
      historyList.innerHTML = `
        <div class="empty-state">
          <p>Failed to load history</p>
          <p class="empty-subtitle">Please try again later</p>
        </div>
      `;
    }
  }

  loadAccount() {
    if (this.settings.authToken) {
      document.getElementById('auth-section').style.display = 'none';
      document.getElementById('profile-section').style.display = 'block';
      this.loadProfile();
    } else {
      document.getElementById('auth-section').style.display = 'block';
      document.getElementById('profile-section').style.display = 'none';
    }
  }

  async loadProfile() {
    try {
      const profile = await this.makeAPIRequest('/user/profile');
      if (profile) {
        document.getElementById('profile-name').textContent = profile.email.split('@')[0];
        document.getElementById('profile-email').textContent = profile.email;
        document.getElementById('profile-tier').textContent = `${this.formatTier(profile.tier)} Plan`;
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  }

  toggleTheme() {
    const newTheme = this.settings.theme === 'light' ? 'dark' : 'light';
    this.settings.theme = newTheme;
    this.saveSettings();
    this.applyTheme();
  }

  applyTheme() {
    if (this.settings.theme === 'dark') {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }

  toggleStealthMode() {
    this.settings.stealthMode = !this.settings.stealthMode;
    this.saveSettings();
    
    const btn = document.getElementById('stealth-toggle');
    const icon = btn.querySelector('svg');
    
    if (this.settings.stealthMode) {
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
        Stealth Mode: ON
      `;
    } else {
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        Stealth Mode: OFF
      `;
    }
  }

  async triggerQuickAsk() {
    try {
      // Get current active tab and send message to content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tab.id, { action: "triggerFromShortcut" });
      window.close();
    } catch (error) {
      console.error('Failed to trigger quick ask:', error);
    }
  }

  async exportHistory() {
    if (!this.settings.authToken) {
      alert('Please sign in to export your history.');
      return;
    }

    try {
      const response = await this.makeAPIRequest('/history/export', {
        format: 'markdown'
      });

      if (response && response.downloadUrl) {
        // Create download link
        const link = document.createElement('a');
        link.href = response.downloadUrl;
        link.download = response.filename;
        link.click();
      }
    } catch (error) {
      console.error('Failed to export history:', error);
      alert('Failed to export history. Please try again.');
    }
  }

  async clearHistory() {
    if (!this.settings.authToken) {
      alert('Please sign in to clear your history.');
      return;
    }

    if (confirm('Are you sure you want to clear all your query history? This action cannot be undone.')) {
      try {
        await this.makeAPIRequest('/history', null, 'DELETE');
        this.loadHistory(); // Reload history
        alert('History cleared successfully.');
      } catch (error) {
        console.error('Failed to clear history:', error);
        alert('Failed to clear history. Please try again.');
      }
    }
  }

  toggleAuthMode() {
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-btn');
    const showSignupBtn = document.getElementById('show-signup');
    
    if (loginBtn.textContent === 'Sign In') {
      loginBtn.textContent = 'Sign Up';
      showSignupBtn.innerHTML = 'Already have an account? <button class="link-btn">Sign in</button>';
      document.querySelector('.auth-form h3').textContent = 'Create PeekAI Account';
      document.querySelector('.auth-subtitle').textContent = 'Join thousands of users getting instant AI answers';
    } else {
      loginBtn.textContent = 'Sign In';
      showSignupBtn.innerHTML = 'Don\'t have an account? <button class="link-btn">Sign up</button>';
      document.querySelector('.auth-form h3').textContent = 'Sign In to PeekAI';
      document.querySelector('.auth-subtitle').textContent = 'Access your history and premium features';
    }
  }

  async handleLogin() {
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;
    const loginBtn = document.getElementById('login-btn');

    if (!email || !password) {
      alert('Please enter both email and password.');
      return;
    }

    const isSignUp = loginBtn.textContent === 'Sign Up';
    const originalText = loginBtn.textContent;
    
    try {
      loginBtn.disabled = true;
      loginBtn.textContent = isSignUp ? 'Creating Account...' : 'Signing In...';

      const endpoint = isSignUp ? '/auth/signup' : '/auth/signin';
      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        const data = await response.json();
        this.settings.authToken = data.session.access_token;
        this.settings.userTier = 'free';
        this.saveSettings();
        this.loadAccount();
        this.loadDashboard();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || `${isSignUp ? 'Sign up' : 'Sign in'} failed`);
      }
    } catch (error) {
      console.error(`${isSignUp ? 'Sign up' : 'Sign in'} failed:`, error);
      alert(error.message || `${isSignUp ? 'Sign up' : 'Sign in'} failed. Please try again.`);
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = originalText;
    }
  }

  async handleGoogleLogin() {
    try {
      const redirectUrl = chrome.runtime.getURL('popup.html');
      const response = await fetch(`${this.apiBaseUrl}/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ redirectUrl })
      });

      if (response.ok) {
        const data = await response.json();
        // Open Google auth in new tab
        chrome.tabs.create({ url: data.url });
        window.close();
      } else {
        throw new Error('Failed to get Google auth URL');
      }
    } catch (error) {
      console.error('Google login failed:', error);
      alert('Google login failed. Please try again.');
    }
  }

  handleLogout() {
    if (confirm('Are you sure you want to sign out?')) {
      this.settings.authToken = null;
      this.settings.userTier = 'free';
      this.saveSettings();
      this.loadAccount();
      this.loadDashboard();
    }
  }

  async handleUpgrade(plan) {
    if (!this.settings.authToken) {
      alert('Please sign in to upgrade your plan.');
      return;
    }

    try {
      const priceIds = {
        'student_pro': 'price_student_pro',
        'premium': 'price_premium'
      };

      const response = await this.makeAPIRequest('/billing/checkout', {
        priceId: priceIds[plan],
        successUrl: chrome.runtime.getURL('popup.html?success=true'),
        cancelUrl: chrome.runtime.getURL('popup.html?canceled=true')
      });

      if (response && response.url) {
        chrome.tabs.create({ url: response.url });
        window.close();
      } else {
        throw new Error('Failed to create checkout session');
      }
    } catch (error) {
      console.error('Upgrade failed:', error);
      alert('Upgrade failed. Please try again.');
    }
  }

  async manageSubscription() {
    if (!this.settings.authToken) {
      alert('Please sign in to manage your subscription.');
      return;
    }

    try {
      const response = await this.makeAPIRequest('/billing/portal', {
        returnUrl: chrome.runtime.getURL('popup.html')
      });

      if (response && response.url) {
        chrome.tabs.create({ url: response.url });
        window.close();
      } else {
        throw new Error('Failed to create portal session');
      }
    } catch (error) {
      console.error('Failed to open customer portal:', error);
      alert('Failed to open subscription management. Please try again.');
    }
  }

  showSettings() {
    // Create a simple settings modal
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    `;

    modal.innerHTML = `
      <div style="background: white; padding: 20px; border-radius: 8px; max-width: 300px; width: 90%;">
        <h3>Settings</h3>
        <div style="margin: 16px 0;">
          <label>
            <input type="checkbox" ${this.settings.stealthMode ? 'checked' : ''}> Stealth Mode
          </label>
        </div>
        <div style="margin: 16px 0;">
          <label>
            Theme: 
            <select>
              <option value="light" ${this.settings.theme === 'light' ? 'selected' : ''}>Light</option>
              <option value="dark" ${this.settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
            </select>
          </label>
        </div>
        <div style="text-align: right; margin-top: 20px;">
          <button id="close-settings" style="padding: 8px 16px; margin-left: 8px;">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#close-settings').addEventListener('click', () => {
      modal.remove();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  showQueryDetails(queryId) {
    // In a real implementation, you'd show query details in a modal
    alert(`Query details for ID ${queryId} - Feature coming soon!`);
  }

  async makeAPIRequest(endpoint, data = null, method = 'GET') {
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (this.settings.authToken) {
      options.headers['Authorization'] = `Bearer ${this.settings.authToken}`;
    }

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, options);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      return null;
    }
  }

  saveSettings() {
    chrome.runtime.sendMessage({
      action: "saveSettings",
      settings: this.settings
    });
  }

  formatTier(tier) {
    switch (tier) {
      case 'student_pro':
        return 'Student Pro';
      case 'premium':
        return 'Premium';
      default:
        return 'Free';
    }
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PeekAIPopup();
});
