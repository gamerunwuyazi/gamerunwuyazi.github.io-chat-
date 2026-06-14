<template>
  <Teleport to="body" v-if="modelValue">
    <div class="search-modal-overlay" @click.self="handleClose">
      <div class="search-modal" :style="modalStyle">
        <div class="search-modal-header">
          <h3>查找消息</h3>
          <button class="close-btn" @click="handleClose">×</button>
        </div>
        <div class="search-modal-body">
          <div class="search-input-container">
            <input
              v-model="searchKeyword"
              type="text"
              placeholder="输入搜索内容..."
              @keyup.enter="handleSearch"
              ref="searchInputRef"
            />
            <button class="search-btn" @click="handleSearch" :disabled="isSearching || !searchKeyword.trim()">
              {{ isSearching ? '搜索中...' : '搜索' }}
            </button>
          </div>
          <div v-if="searchResults.length > 0" class="search-results">
            <div class="search-results-count">
              找到 {{ searchResults.length }} 条消息
              <span class="search-nav-btns">
                <button class="search-nav-btn" @click="emit('navigatePrev')" :disabled="searchResults.length <= 1">▲</button>
                <button class="search-nav-btn" @click="emit('navigateNext')" :disabled="searchResults.length <= 1">▼</button>
              </span>
            </div>
            <div class="search-results-list" ref="resultsListRef">
              <slot name="results" :results="searchResults" :onClick="handleScrollToMessage" />
            </div>
          </div>
          <div v-else-if="searchKeyword && hasSearched && !isSearching" class="no-results">
            未找到匹配的消息
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';

const props = defineProps({
  modelValue: Boolean,
  searchResults: { type: Array, default: () => [] },
  isSearching: Boolean,
  hasSearched: Boolean
});

const emit = defineEmits(['update:modelValue', 'search', 'navigatePrev', 'navigateNext', 'scrollToMessage']);

const searchKeyword = ref('');
const searchInputRef = ref(null);
const resultsListRef = ref(null);
const modalWidth = ref(null);

const modalStyle = computed(() => {
  if (modalWidth.value) {
    return { maxWidth: modalWidth.value + 'px' };
  }
  return {};
});

watch(() => props.searchResults, async () => {
  if (props.searchResults.length === 0) {
    modalWidth.value = null;
    return;
  }
  await nextTick();
  await nextTick();
  if (resultsListRef.value) {
    const children = resultsListRef.value.children;
    let maxWidth = 500;
    for (const child of children) {
      const w = child.scrollWidth;
      if (w > maxWidth) maxWidth = w;
    }
    modalWidth.value = maxWidth + 10;
  }
});

function handleSearch() {
  emit('search', searchKeyword.value);
}

function handleClose() {
  searchKeyword.value = '';
  emit('update:modelValue', false);
}

function handleScrollToMessage(msg) {
  emit('scrollToMessage', msg);
}

watch(() => props.modelValue, (val) => {
  if (val) {
    nextTick(() => {
      if (searchInputRef.value) {
        searchInputRef.value.focus();
      }
    });
  } else {
    searchKeyword.value = '';
  }
});

defineExpose({ searchKeyword, searchInputRef });
</script>