chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'getResponse') {
    if (chrome.storage) {
      chrome.storage.sync.get(['response'], function (result) {
        sendResponse({ response: result.response });
      });
    } else {
      sendResponse({ response: '' });
    }
    return true;
  } else if (request.action === 'setResponse') {
    if (chrome.storage) {
      chrome.storage.sync.set({ response: request.responseText });
    }
  } else if (request.action === 'clearResponse') {
    if (chrome.storage) {
      chrome.storage.sync.remove('response');
    }
  }
});