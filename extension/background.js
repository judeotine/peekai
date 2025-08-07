// Background script for PeekAI extension

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "peekai-ask",
    title: "Ask PeekAI",
    contexts: ["selection"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "peekai-ask" && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      action: "showModal",
      selectedText: info.selectionText
    }).catch(error => {
      console.error('Failed to send message to content script:', error);
    });
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "trigger-peekai") {
    chrome.tabs.sendMessage(tab.id, {
      action: "triggerFromShortcut"
    }).catch(error => {
      console.error('Failed to send message to content script:', error);
    });
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getSettings") {
    chrome.storage.sync.get([
      'theme',
      'stealthMode',
      'language',
      'authToken',
      'userTier'
    ], (result) => {
      sendResponse(result);
    });
    return true;
  }
  
  if (request.action === "saveSettings") {
    chrome.storage.sync.set(request.settings, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === "trackUsage") {
    // Track usage analytics
    chrome.storage.local.get(['usageStats'], (result) => {
      const stats = result.usageStats || { 
        daily: 0, 
        total: 0, 
        lastReset: new Date().toDateString() 
      };
      
      // Reset daily count if it's a new day
      const today = new Date().toDateString();
      if (stats.lastReset !== today) {
        stats.daily = 0;
        stats.lastReset = today;
      }
      
      stats.daily++;
      stats.total++;
      
      chrome.storage.local.set({ usageStats: stats });
    });
  }

  if (request.action === "getUsageStats") {
    chrome.storage.local.get(['usageStats'], (result) => {
      const stats = result.usageStats || { 
        daily: 0, 
        total: 0, 
        lastReset: new Date().toDateString() 
      };
      sendResponse(stats);
    });
    return true;
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // This will open the popup, handled by manifest
});

// Handle tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    // Ensure content script is injected
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }).catch(error => {
      // Ignore errors for pages where we can't inject scripts
    });
  }
});

// Handle installation and updates
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default settings
    chrome.storage.sync.set({
      theme: 'light',
      stealthMode: false,
      language: 'en'
    });
    
    // Open welcome page
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup.html')
    });
  }
});
