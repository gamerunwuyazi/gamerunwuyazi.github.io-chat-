export function useMessageHighlight() {
  let currentHighlightEl = null;
  let currentTimer = null;

  function clearHighlight() {
    if (currentTimer) {
      clearTimeout(currentTimer);
      currentTimer = null;
    }
    document.querySelectorAll('.msg-bubble.active, .system-message-text.active').forEach(el => {
      el.classList.remove('active');
      el.style.backgroundColor = '';
    });
    currentHighlightEl = null;
  }

  function highlightMessage(messageEl) {
    if (!messageEl) return;

    clearHighlight();

    let bubble;
    if (messageEl.classList.contains('system-message-wrapper')) {
      bubble = messageEl.querySelector('.system-message-text') || messageEl;
    } else {
      bubble = messageEl.querySelector(':scope > .msg-body > .msg-bubble') || messageEl;
    }
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

    messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      highlightMessage(messageEl);
    }, 500);
  }

  function destroy() {
    clearHighlight();
  }

  return {
    clearHighlight,
    highlightMessage,
    scrollAndHighlight,
    destroy,
  };
}