import { ref } from 'vue';

export function useSearchNavigation() {
  const currentSearchIndex = ref(0);

  function navigateToNextSearchResult(searchResults, scrollToMessage) {
    if (searchResults.length <= 1) return;
    currentSearchIndex.value = (currentSearchIndex.value + 1) % searchResults.length;
    scrollToMessage(searchResults[currentSearchIndex.value]);
  }

  function navigateToPrevSearchResult(searchResults, scrollToMessage) {
    if (searchResults.length <= 1) return;
    currentSearchIndex.value = (currentSearchIndex.value - 1 + searchResults.length) % searchResults.length;
    scrollToMessage(searchResults[currentSearchIndex.value]);
  }

  return { currentSearchIndex, navigateToNextSearchResult, navigateToPrevSearchResult };
}