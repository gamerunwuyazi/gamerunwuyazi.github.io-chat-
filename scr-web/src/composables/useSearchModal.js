import { ref, nextTick } from 'vue';

export function useSearchModal() {
  const showSearchModal = ref(false);
  const searchKeyword = ref('');
  const searchResults = ref([]);
  const isSearching = ref(false);
  const hasSearched = ref(false);
  const searchInputRef = ref(null);

  function openSearchModal() {
    showSearchModal.value = true;
    nextTick(() => {
      if (searchInputRef.value) {
        searchInputRef.value.focus();
      }
    });
  }

  function closeSearchModal() {
    showSearchModal.value = false;
    searchKeyword.value = '';
    searchResults.value = [];
    hasSearched.value = false;
  }

  return {
    showSearchModal,
    searchKeyword,
    searchResults,
    isSearching,
    hasSearched,
    searchInputRef,
    openSearchModal,
    closeSearchModal
  };
}