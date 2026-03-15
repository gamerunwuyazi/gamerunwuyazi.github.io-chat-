// 通用模态框工具 - 替代 alert 和 confirm

let modalContainer = null;
let resolvePromise = null;

function createModalContainer() {
  if (!modalContainer) {
    modalContainer = document.createElement('div');
    modalContainer.id = 'custom-modal-container';
    document.body.appendChild(modalContainer);
  }
  return modalContainer;
}

function createModal(options) {
  const container = createModalContainer();
  
  const {
    title = '提示',
    message = '',
    type = 'info',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = false,
    showInput = false,
    inputPlaceholder = '',
    inputValue = ''
  } = options;

  const overlay = document.createElement('div');
  overlay.className = 'custom-modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.2s ease;
  `;

  const modal = document.createElement('div');
  modal.className = 'custom-modal';
  modal.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    min-width: 320px;
    max-width: 480px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    animation: slideIn 0.2s ease;
  `;

  let iconHtml = '';
  let iconColor = '#1890ff';
  
  switch (type) {
    case 'success':
      iconColor = '#52c41a';
      iconHtml = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
      break;
    case 'error':
      iconColor = '#f5222d';
      iconHtml = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
      break;
    case 'warning':
      iconColor = '#faad14';
      iconHtml = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
      break;
    default:
      iconHtml = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  }

  modal.innerHTML = `
    <div style="text-align: center; margin-bottom: 16px;">
      ${iconHtml}
    </div>
    <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #333; text-align: center;">${title}</h3>
    <div style="color: #666; font-size: 14px; line-height: 1.6; text-align: center; white-space: pre-wrap; word-break: break-word;">${message}</div>
    ${showInput ? `<input type="text" class="modal-input" placeholder="${inputPlaceholder}" value="${inputValue}" style="width: 100%; padding: 10px 12px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 14px; margin-top: 16px; box-sizing: border-box; outline: none; transition: border-color 0.3s;">` : ''}
    <div style="display: flex; gap: 12px; margin-top: 24px; justify-content: center;">
      ${showCancel ? `<button class="modal-cancel-btn" style="flex: 1; padding: 10px 20px; border: 1px solid #d9d9d9; border-radius: 6px; background: white; color: #666; font-size: 14px; cursor: pointer; transition: all 0.3s;">${cancelText}</button>` : ''}
      <button class="modal-confirm-btn" style="flex: 1; padding: 10px 20px; border: none; border-radius: 6px; background: ${iconColor}; color: white; font-size: 14px; cursor: pointer; transition: all 0.3s;">${confirmText}</button>
    </div>
  `;

  overlay.appendChild(modal);
  container.appendChild(overlay);

  const confirmBtn = modal.querySelector('.modal-confirm-btn');
  const cancelBtn = modal.querySelector('.modal-cancel-btn');
  const inputEl = modal.querySelector('.modal-input');

  if (inputEl) {
    inputEl.focus();
    inputEl.addEventListener('focus', () => {
      inputEl.style.borderColor = iconColor;
    });
    inputEl.addEventListener('blur', () => {
      inputEl.style.borderColor = '#d9d9d9';
    });
  }

  function closeModal(result) {
    overlay.style.animation = 'fadeOut 0.2s ease';
    modal.style.animation = 'slideOut 0.2s ease';
    setTimeout(() => {
      if (overlay.parentNode === container) {
        container.removeChild(overlay);
      }
    }, 200);
    if (resolvePromise) {
      resolvePromise(result);
      resolvePromise = null;
    }
  }

  confirmBtn.addEventListener('click', () => {
    const result = showInput ? { confirmed: true, value: inputEl ? inputEl.value : '' } : true;
    closeModal(result);
  });

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      closeModal(showInput ? { confirmed: false, value: '' } : false);
    });
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal(showInput ? { confirmed: false, value: '' } : false);
    }
  });

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const result = showInput ? { confirmed: true, value: inputEl ? inputEl.value : '' } : true;
      closeModal(result);
      document.removeEventListener('keydown', handleKeyDown);
    } else if (e.key === 'Escape') {
      closeModal(showInput ? { confirmed: false, value: '' } : false);
      document.removeEventListener('keydown', handleKeyDown);
    }
  };
  document.addEventListener('keydown', handleKeyDown);

  return new Promise((resolve) => {
    resolvePromise = resolve;
  });
}

const modal = {
  alert(message, title = '提示', type = 'info') {
    return createModal({
      title,
      message,
      type,
      showCancel: false
    });
  },

  success(message, title = '成功') {
    return this.alert(message, title, 'success');
  },

  error(message, title = '错误') {
    return this.alert(message, title, 'error');
  },

  warning(message, title = '警告') {
    return this.alert(message, title, 'warning');
  },

  info(message, title = '提示') {
    return this.alert(message, title, 'info');
  },

  confirm(message, title = '确认', type = 'warning') {
    return createModal({
      title,
      message,
      type,
      showCancel: true,
      confirmText: '确定',
      cancelText: '取消'
    });
  },

  prompt(message, title = '输入', placeholder = '', defaultValue = '') {
    return createModal({
      title,
      message,
      type: 'info',
      showCancel: true,
      showInput: true,
      inputPlaceholder: placeholder,
      inputValue: defaultValue,
      confirmText: '确定',
      cancelText: '取消'
    });
  }
};

const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  @keyframes slideIn {
    from { transform: translateY(-20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateY(0); opacity: 1; }
    to { transform: translateY(-20px); opacity: 0; }
  }
  .custom-modal-overlay button:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }
  .custom-modal-overlay button:active {
    transform: translateY(0);
  }
`;
document.head.appendChild(style);

export default modal;
