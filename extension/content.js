// Content script for PeekAI extension

class PeekAI {
  constructor() {
    this.selectedText = '';
    this.selectionRange = null;
    this.floatingButton = null;
    this.modal = null;
    this.settings = {};
    this.isModalOpen = false;
    this.apiBaseUrl = 'https://your-encore-app.com'; // Replace with your actual API URL
    
    this.init();
  }

  async init() {
    // Load settings
    await this.loadSettings();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Load modal HTML
    await this.loadModal();
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
    // Text selection listener with debouncing
    let selectionTimeout;
    const handleSelection = (e) => {
      clearTimeout(selectionTimeout);
      selectionTimeout = setTimeout(() => this.handleTextSelection(e), 100);
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('keyup', handleSelection);
    
    // Hide floating button when clicking elsewhere
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.peekai-floating-button') && !e.target.closest('.peekai-modal')) {
        this.hideFloatingButton();
      }
    });

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "showModal") {
        this.showModal(request.selectedText);
      } else if (request.action === "triggerFromShortcut") {
        this.handleShortcutTrigger();
      }
    });

    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isModalOpen) {
        this.hideModal();
      }
    });

    // Handle page navigation
    window.addEventListener('beforeunload', () => {
      this.hideModal();
      this.hideFloatingButton();
    });
  }

  handleTextSelection(e) {
    if (this.settings.stealthMode) return;

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    // Improved text selection validation
    if (selectedText.length > 5 && selectedText.length < 2000 && !this.isModalOpen) {
      this.selectedText = selectedText;
      if (selection.rangeCount > 0) {
        this.selectionRange = selection.getRangeAt(0);
        this.showFloatingButton();
      }
    } else {
      this.hideFloatingButton();
    }
  }

  handleShortcutTrigger() {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText.length > 0) {
      this.selectedText = selectedText;
      if (selection.rangeCount > 0) {
        this.selectionRange = selection.getRangeAt(0);
      }
      this.showModal(selectedText);
    } else if (this.settings.stealthMode) {
      this.showStealthPrompt();
    } else {
      this.showModal('');
    }
  }

  showFloatingButton() {
    this.hideFloatingButton(); // Remove existing button

    if (!this.selectionRange) return;

    const rect = this.selectionRange.getBoundingClientRect();
    
    // Check if selection is visible
    if (rect.width === 0 || rect.height === 0) return;
    
    this.floatingButton = document.createElement('div');
    this.floatingButton.className = 'peekai-floating-button';
    this.floatingButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <circle cx="12" cy="17" r="1"/>
      </svg>
    `;

    // Position the button with better positioning logic
    const buttonX = Math.min(rect.right + 10, window.innerWidth - 50);
    const buttonY = Math.max(rect.top + window.scrollY - 5, window.scrollY + 10);

    this.floatingButton.style.position = 'absolute';
    this.floatingButton.style.left = `${buttonX}px`;
    this.floatingButton.style.top = `${buttonY}px`;
    this.floatingButton.style.zIndex = '10000';

    // Add click handler
    this.floatingButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showModal(this.selectedText);
    });

    document.body.appendChild(this.floatingButton);

    // Auto-hide after 8 seconds
    setTimeout(() => {
      this.hideFloatingButton();
    }, 8000);
  }

  hideFloatingButton() {
    if (this.floatingButton) {
      this.floatingButton.remove();
      this.floatingButton = null;
    }
  }

  async loadModal() {
    const modalUrl = chrome.runtime.getURL('modal.html');
    try {
      const response = await fetch(modalUrl);
      const modalHTML = await response.text();
      
      // Create modal container
      const modalContainer = document.createElement('div');
      modalContainer.id = 'peekai-modal-container';
      modalContainer.innerHTML = modalHTML;
      modalContainer.style.display = 'none';
      
      document.body.appendChild(modalContainer);
      this.modal = modalContainer;
      
      // Set up modal event listeners
      this.setupModalEventListeners();
    } catch (error) {
      console.error('Failed to load PeekAI modal:', error);
    }
  }

  setupModalEventListeners() {
    if (!this.modal) return;

    const modal = this.modal.querySelector('.peekai-modal');
    const closeBtn = this.modal.querySelector('.peekai-close');
    const minimizeBtn = this.modal.querySelector('.peekai-minimize');
    const askBtn = this.modal.querySelector('.peekai-ask-btn');
    const questionInput = this.modal.querySelector('.peekai-question-input');
    const followUpInput = this.modal.querySelector('.peekai-followup-input');
    const followUpBtn = this.modal.querySelector('.peekai-followup-btn');

    // Close modal
    closeBtn?.addEventListener('click', () => this.hideModal());

    // Click outside to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hideModal();
      }
    });

    // Minimize modal
    minimizeBtn?.addEventListener('click', () => this.minimizeModal());

    // Ask question
    askBtn?.addEventListener('click', () => this.askQuestion());
    questionInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.askQuestion();
      }
    });

    // Follow-up question
    followUpBtn?.addEventListener('click', () => this.askFollowUp());
    followUpInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.askFollowUp();
      }
    });

    // Make modal draggable
    this.makeDraggable(modal);
  }

  showModal(selectedText = '') {
    if (!this.modal) return;

    this.isModalOpen = true;
    this.modal.style.display = 'block';
    
    const questionInput = this.modal.querySelector('.peekai-question-input');
    const answerSection = this.modal.querySelector('.peekai-answer-section');
    
    if (questionInput) {
      questionInput.value = selectedText || this.selectedText;
      questionInput.focus();
      questionInput.select();
    }

    // Hide answer section initially
    if (answerSection) {
      answerSection.style.display = 'none';
    }

    // Position modal near selection or center of screen
    this.positionModal();
    
    // Hide floating button
    this.hideFloatingButton();

    // Apply theme
    this.applyTheme();
  }

  hideModal() {
    if (!this.modal) return;

    this.isModalOpen = false;
    this.modal.style.display = 'none';
    
    // Clear content
    const answerContent = this.modal.querySelector('.peekai-answer-content');
    const followUpSection = this.modal.querySelector('.peekai-followup-section');
    const answerSection = this.modal.querySelector('.peekai-answer-section');
    
    if (answerContent) {
      answerContent.innerHTML = '';
    }
    if (followUpSection) {
      followUpSection.style.display = 'none';
    }
    if (answerSection) {
      answerSection.style.display = 'none';
    }
  }

  minimizeModal() {
    const modal = this.modal.querySelector('.peekai-modal');
    if (modal) {
      modal.classList.toggle('minimized');
    }
  }

  positionModal() {
    const modal = this.modal.querySelector('.peekai-modal');
    if (!modal) return;

    // Reset transform
    modal.style.transform = '';
    modal.style.left = '';
    modal.style.top = '';

    if (this.selectionRange) {
      const rect = this.selectionRange.getBoundingClientRect();
      const modalWidth = 500;
      const modalHeight = 400;
      
      let left = Math.min(rect.left, window.innerWidth - modalWidth - 20);
      let top = Math.min(rect.bottom + 10, window.innerHeight - modalHeight - 20);
      
      // Ensure modal stays within viewport
      left = Math.max(10, left);
      top = Math.max(10, top);
      
      modal.style.position = 'fixed';
      modal.style.left = `${left}px`;
      modal.style.top = `${top}px`;
    } else {
      // Center on screen
      modal.style.position = 'fixed';
      modal.style.left = '50%';
      modal.style.top = '50%';
      modal.style.transform = 'translate(-50%, -50%)';
    }
  }

  makeDraggable(element) {
    const header = element.querySelector('.peekai-modal-header');
    if (!header) return;

    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
      if (e.target.closest('.peekai-modal-controls')) return;
      
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;
      isDragging = true;
      header.style.cursor = 'grabbing';
    }

    function drag(e) {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        xOffset = currentX;
        yOffset = currentY;

        element.style.transform = `translate(${currentX}px, ${currentY}px)`;
      }
    }

    function dragEnd() {
      initialX = currentX;
      initialY = currentY;
      isDragging = false;
      header.style.cursor = 'move';
    }
  }

  async askQuestion() {
    const questionInput = this.modal.querySelector('.peekai-question-input');
    const answerContent = this.modal.querySelector('.peekai-answer-content');
    const answerSection = this.modal.querySelector('.peekai-answer-section');
    const askBtn = this.modal.querySelector('.peekai-ask-btn');
    
    if (!questionInput || !answerContent || !answerSection) return;

    const question = questionInput.value.trim();
    if (!question) {
      this.showError('Please enter a question.');
      return;
    }

    // Check authentication
    if (!this.settings.authToken) {
      this.showError('Please sign in to use PeekAI.');
      return;
    }

    // Show loading state
    askBtn.disabled = true;
    askBtn.textContent = 'Asking...';
    answerSection.style.display = 'block';
    answerContent.innerHTML = '<div class="peekai-loading">Thinking...</div>';

    try {
      // Get page context
      const context = this.getPageContext();
      
      // Make API request
      const response = await this.makeAPIRequest('/ai/ask', {
        question,
        context,
        stream: false
      });

      if (response.ok) {
        const data = await response.json();
        this.displayAnswer(data.answer);
        
        // Track usage
        chrome.runtime.sendMessage({ action: "trackUsage" });
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API error: ${response.status}`);
      }
    } catch (error) {
      console.error('PeekAI error:', error);
      this.showError(this.getErrorMessage(error));
    } finally {
      askBtn.disabled = false;
      askBtn.textContent = 'Ask';
    }
  }

  async askFollowUp() {
    const followUpInput = this.modal.querySelector('.peekai-followup-input');
    const answerContent = this.modal.querySelector('.peekai-answer-content');
    
    if (!followUpInput || !answerContent) return;

    const question = followUpInput.value.trim();
    if (!question) return;

    // Add follow-up question to display
    const followUpDiv = document.createElement('div');
    followUpDiv.className = 'peekai-followup-question';
    followUpDiv.textContent = `Follow-up: ${question}`;
    answerContent.appendChild(followUpDiv);

    // Clear input
    followUpInput.value = '';

    // Show loading
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'peekai-loading';
    loadingDiv.textContent = 'Thinking...';
    answerContent.appendChild(loadingDiv);

    try {
      const context = this.getPageContext();
      const response = await this.makeAPIRequest('/ai/ask', {
        question,
        context,
        stream: false
      });

      if (response.ok) {
        const data = await response.json();
        loadingDiv.remove();
        
        const answerDiv = document.createElement('div');
        answerDiv.className = 'peekai-followup-answer';
        answerDiv.innerHTML = this.formatAnswer(data.answer);
        answerContent.appendChild(answerDiv);
        
        // Scroll to bottom
        answerContent.scrollTop = answerContent.scrollHeight;
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API error: ${response.status}`);
      }
    } catch (error) {
      console.error('PeekAI follow-up error:', error);
      loadingDiv.textContent = this.getErrorMessage(error);
      loadingDiv.className = 'peekai-error';
    }
  }

  displayAnswer(answer) {
    const answerContent = this.modal.querySelector('.peekai-answer-content');
    if (!answerContent) return;

    answerContent.innerHTML = `
      <div class="peekai-answer">
        ${this.formatAnswer(answer)}
      </div>
    `;

    // Show follow-up input
    const followUpSection = this.modal.querySelector('.peekai-followup-section');
    if (followUpSection) {
      followUpSection.style.display = 'block';
    }
  }

  showError(message) {
    const answerContent = this.modal.querySelector('.peekai-answer-content');
    const answerSection = this.modal.querySelector('.peekai-answer-section');
    
    if (answerContent && answerSection) {
      answerSection.style.display = 'block';
      answerContent.innerHTML = `<div class="peekai-error">${message}</div>`;
    }
  }

  getErrorMessage(error) {
    if (error.message.includes('daily query limit exceeded')) {
      return 'You\'ve reached your daily query limit. Please upgrade your plan or try again tomorrow.';
    } else if (error.message.includes('unauthenticated')) {
      return 'Please sign in to use PeekAI.';
    } else if (error.message.includes('network')) {
      return 'Network error. Please check your connection and try again.';
    } else {
      return 'Sorry, I couldn\'t get an answer right now. Please try again.';
    }
  }

  formatAnswer(answer) {
    // Enhanced markdown formatting
    return answer
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }

  getPageContext() {
    return {
      pageTitle: document.title,
      pageUrl: window.location.href,
      pageDomain: window.location.hostname,
      selectedText: this.selectedText,
      surroundingText: this.getSurroundingText()
    };
  }

  getSurroundingText() {
    if (!this.selectionRange) return '';

    try {
      const container = this.selectionRange.commonAncestorContainer;
      const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
      
      return element.textContent.slice(0, 500);
    } catch (error) {
      return '';
    }
  }

  async makeAPIRequest(endpoint, data) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.settings.authToken) {
      headers['Authorization'] = `Bearer ${this.settings.authToken}`;
    }

    return fetch(`${this.apiBaseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
  }

  applyTheme() {
    const modal = this.modal.querySelector('.peekai-modal');
    if (!modal) return;

    modal.setAttribute('data-theme', this.settings.theme);
  }

  showStealthPrompt() {
    // Create a subtle tooltip-like prompt
    const prompt = document.createElement('div');
    prompt.className = 'peekai-stealth-prompt';
    prompt.textContent = 'Select text and press Ctrl+Shift+Q to ask PeekAI';
    
    prompt.style.position = 'fixed';
    prompt.style.top = '20px';
    prompt.style.right = '20px';
    prompt.style.zIndex = '10001';
    
    document.body.appendChild(prompt);
    
    setTimeout(() => {
      prompt.remove();
    }, 3000);
  }
}

// Initialize PeekAI when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PeekAI());
} else {
  new PeekAI();
}
