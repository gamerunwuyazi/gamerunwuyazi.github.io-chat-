// 当元素内容纵向溢出（出现滚动条）时，添加 has-scroll 类，使文字与滚动条留出间距
function update(el) {
  const hasScroll = el.scrollHeight > el.clientHeight;
  el.classList.toggle('has-scroll', hasScroll);
}

export default {
  mounted(el) {
    update(el);
    el.__scrollPaddingRO = new ResizeObserver(() => update(el));
    el.__scrollPaddingRO.observe(el);
  },
  updated(el) {
    update(el);
  },
  unmounted(el) {
    if (el.__scrollPaddingRO) {
      el.__scrollPaddingRO.disconnect();
      delete el.__scrollPaddingRO;
    }
  }
};
