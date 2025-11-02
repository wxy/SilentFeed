import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// 每个测试后自动清理
afterEach(() => {
  cleanup();
});

// Mock Chrome API for extension testing
global.chrome = {
  runtime: {
    id: 'test-extension-id',
    getManifest: () => ({ version: '1.0.0' }),
    getURL: (path: string) => `chrome-extension://test-id/${path}`,
    onMessage: {
      addListener: () => {},
      removeListener: () => {},
    },
    sendMessage: () => Promise.resolve(),
  },
  storage: {
    local: {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    },
    sync: {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    },
  },
  tabs: {
    query: () => Promise.resolve([]),
    sendMessage: () => Promise.resolve(),
  },
} as any;

// Mock IndexedDB for Dexie.js testing
import 'fake-indexeddb/auto';
