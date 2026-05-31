export function useMessageHighlight() {
  let currentHighlightEl = null;
  let currentTimer = null;
  let savedScrollContainer = null;
  let savedScrollTop = 0;
  let returnButtonEl = null;

  function removeReturnButton() {
    if (returnButtonEl && returnButtonEl.parentNode) {
      returnButtonEl.parentNode.removeChild(returnButtonEl);
      returnButtonEl = null;
    }
  }

  function createReturnButton(onClick) {
    removeReturnButton();
    const btn = document.createElement('div');
    btn.className = 'return-position-btn';
    btn.textContent = '返回原位置';
    btn.addEventListener('click', () => {
      onClick();
      removeReturnButton();
    });
    btn.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(76, 175, 80, 0.9);
      color: white;
      padding: 8px 20px;
      border-radius: 20px;
      font-size: 13px;
      cursor: pointer;
      z-index: 9999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      transition: opacity 0.3s;
      white-space: nowrap;
    `;
    document.body.appendChild(btn);
    returnButtonEl = btn;
  }

  function saveScrollState() {
    const containers = document.querySelectorAll('.message-container, [class*="message-container"], .chat-messages');
    if (containers.length > 0) {
      savedScrollContainer = containers[0];
      savedScrollTop = savedScrollContainer.scrollTop;
    } else {
      savedScrollContainer = document.scrollingElement || document.documentElement;
      savedScrollTop = savedScrollContainer.scrollTop;
    }
  }

  function restoreScrollState() {
    if (savedScrollContainer) {
      savedScrollContainer.scrollTo({ top: savedScrollTop, behavior: 'smooth' });
    }
  }

  function clearHighlight() {
    if (currentTimer) {
      clearTimeout(currentTimer);
      currentTimer = null;
    }
    document.querySelectorAll('.msg-bubble.active').forEach(el => {
      el.classList.remove('active');
      el.style.backgroundColor = '';
    });
    currentHighlightEl = null;
  }

  function highlightMessage(messageEl) {
    if (!messageEl) return;

    clearHighlight();

    const bubble = messageEl.querySelector(':scope > .msg-body > .msg-bubble') || messageEl;
    bubble.style.backgroundColor = 'rgba(76, 175, 80, 0.6)';
    bubble.classList.add('active');
    currentHighlightEl = bubble;

    currentTimer = setTimeout(() => {
      if (currentHighlightEl) {
        currentHighlightEl.style.backgroundColor = '';
      }
      currentTimer = setTimeout(() => {
        if (currentHighlightEl) {
          currentHighlightEl.classList.remove('active');
          currentHighlightEl = null;
        }
      }, 500);
    }, 3000);
  }

  function scrollAndHighlight(messageEl) {
    if (!messageEl) return;

    saveScrollState();

    messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      highlightMessage(messageEl);
      createReturnButton(() => {
        removeReturnButton();
        clearHighlight();
        restoreScrollState();
      });
    }, 500);
  }

  function destroy() {
    clearHighlight();
    removeReturnButton();
  }

  return {
    clearHighlight,
    highlightMessage,
    scrollAndHighlight,
    destroy,
  };
}