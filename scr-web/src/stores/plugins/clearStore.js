import { toRaw, isRef, isReactive } from 'vue';

const initialStateMap = new Map();

function deepClone(value) {
  if (value === null || value === undefined) {
    return value;
  }
  
  if (typeof value !== 'object') {
    return value;
  }
  
  if (Array.isArray(value)) {
    return value.map(item => deepClone(item));
  }
  
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  
  if (value instanceof Map) {
    const newMap = new Map();
    value.forEach((v, k) => {
      newMap.set(deepClone(k), deepClone(v));
    });
    return newMap;
  }
  
  if (value instanceof Set) {
    const newSet = new Set();
    value.forEach(item => {
      newSet.add(deepClone(item));
    });
    return newSet;
  }
  
  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags);
  }
  
  if (typeof value === 'object') {
    const result = {};
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        result[key] = deepClone(value[key]);
      }
    }
    return result;
  }
  
  return value;
}

function clearStore(store) {
  const initialState = initialStateMap.get(store.$id);
  if (!initialState) {
    console.warn(`Store ${store.$id} 没有记录初始状态`);
    return;
  }
  
  for (const key in initialState) {
    if (Object.prototype.hasOwnProperty.call(store, key)) {
      const stateValue = store[key];
      const initial = initialState[key];
      
      if (isRef(stateValue)) {
        stateValue.value = deepClone(initial);
      } else if (isReactive(stateValue)) {
        const raw = toRaw(stateValue);
        const initialRaw = toRaw(initial);
        
        if (Array.isArray(raw)) {
          raw.length = 0;
          raw.push(...deepClone(initialRaw));
        } else if (raw instanceof Map) {
          raw.clear();
          initialRaw.forEach((v, k) => {
            raw.set(deepClone(k), deepClone(v));
          });
        } else if (raw instanceof Set) {
          raw.clear();
          initialRaw.forEach(item => {
            raw.add(deepClone(item));
          });
        } else if (typeof raw === 'object' && raw !== null) {
          Object.keys(raw).forEach(k => delete raw[k]);
          Object.assign(raw, deepClone(initialRaw));
        }
      }
    }
  }
}

export function createClearStorePlugin() {
  return ({ store }) => {
    const state = {};
    const storeKeys = Object.keys(store);
    
    for (const key of storeKeys) {
      if (key.startsWith('$') || key.startsWith('_')) {
        continue;
      }
      
      const value = store[key];
      if (isRef(value)) {
        state[key] = deepClone(toRaw(value.value));
      } else if (isReactive(value)) {
        state[key] = deepClone(toRaw(value));
      }
    }
    
    initialStateMap.set(store.$id, state);
    
    store.$clear = () => {
      clearStore(store);
    };
    
    store.$reset = () => {
      clearStore(store);
    };
    
    store.$resetToInitial = () => {
      clearStore(store);
    };
  };
}

export function resetAllStores(pinia) {
  const stores = pinia._s;
  stores.forEach((store, id) => {
    if (store.$clear) {
      store.$clear();
    }
  });
}

export function clearSpecificStore(store) {
  if (store.$clear) {
    store.$clear();
  }
}
