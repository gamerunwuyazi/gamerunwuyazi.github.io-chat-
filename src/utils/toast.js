// 小提示功能

// 创建toast容器
function createToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.right = '20px';
    container.style.zIndex = '9999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'flex-end';
    container.style.gap = '10px';
    document.body.appendChild(container);
  }
  return container;
}

// 显示小提示
function showToast(message, type = 'info', duration = 3000) {
  const container = createToastContainer();
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.padding = '10px 15px';
  toast.style.borderRadius = '4px';
  toast.style.color = 'white';
  toast.style.fontSize = '14px';
  toast.style.fontWeight = '500';
  toast.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
  toast.style.transition = 'all 0.3s ease';
  toast.style.transform = 'translateX(100%)';
  toast.style.opacity = '0';
  
  // 设置不同类型的背景色
  switch (type) {
    case 'success':
      toast.style.backgroundColor = '#52c41a';
      break;
    case 'error':
      toast.style.backgroundColor = '#f5222d';
      break;
    case 'warning':
      toast.style.backgroundColor = '#faad14';
      break;
    default:
      toast.style.backgroundColor = '#1890ff';
  }
  
  toast.textContent = message;
  container.appendChild(toast);
  
  // 显示动画
  setTimeout(() => {
    toast.style.transform = 'translateX(0)';
    toast.style.opacity = '1';
  }, 10);
  
  // 自动消失
  setTimeout(() => {
    toast.style.transform = 'translateX(100%)';
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentNode === container) {
        container.removeChild(toast);
      }
    }, 300);
  }, duration);
  
  return toast;
}

// 导出
const toast = {
  success: (message, duration) => showToast(message, 'success', duration),
  error: (message, duration) => showToast(message, 'error', duration),
  warning: (message, duration) => showToast(message, 'warning', duration),
  info: (message, duration) => showToast(message, 'info', duration)
};

export default toast;