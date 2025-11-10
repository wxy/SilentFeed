import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Mock i18n with actual translations
const translations = require('../../public/locales/en/translation.json')

// Helper to get nested value from object using dot notation
function getNestedValue(obj: any, path: string): string {
  return path.split('.').reduce((current, key) => current?.[key], obj) || path
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      // Get translation from actual English translation file
      let result = getNestedValue(translations, key)
      
      // Interpolate values if provided
      if (options && typeof options === 'object') {
        Object.entries(options).forEach(([k, v]) => {
          result = result.replace(`{{${k}}}`, String(v))
        })
      }
      
      return result
    },
    i18n: {
      language: 'en',
      changeLanguage: vi.fn()
    }
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn()
  }
}))

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
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  tabs: {
    query: () => Promise.resolve([]),
    sendMessage: () => Promise.resolve(),
  },
} as any;

// Mock IndexedDB for Dexie.js testing
import 'fake-indexeddb/auto';
