import localForage from 'localforage';

const localForageConfig = localForage.createInstance({
  name: 'boxim_chat',
  storeName: 'chat_data',
  driver: [
    localForage.INDEXEDDB,
    localForage.LOCALSTORAGE,
    localForage.WEBSQL
  ]
});

export default localForageConfig;
