export function useContextMenuKeyboard() {
  function setupKeyboard(contextMenu, hideContextMenu) {
    function handler(e) {
      if (e.key === 'Escape') {
        hideContextMenu();
        return;
      }
      const items = contextMenu.querySelectorAll('.context-menu-item');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const current = contextMenu.querySelector('.context-menu-item.focused');
        const idx = current ? Array.from(items).indexOf(current) : -1;
        if (idx >= 0) items[idx].classList.remove('focused');
        const next = e.key === 'ArrowDown'
          ? (idx + 1) % items.length
          : (idx - 1 + items.length) % items.length;
        items[next].classList.add('focused');
      }
      if (e.key === 'Enter') {
        const focused = contextMenu.querySelector('.context-menu-item.focused');
        if (focused) focused.click();
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }

  return { setupKeyboard };
}