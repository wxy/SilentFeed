import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Load translations dynamically without Node.js cache
const translationsPath = path.resolve(__dirname, '../../public/locales/en/translation.json');
const translationsContent = fs.readFileSync(translationsPath, 'utf-8');
const translations = JSON.parse(translationsContent);

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
// 使用 Map 模拟实际的存储行为
const mockStorage = new Map<string, any>();

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
      get: (keys?: string | string[] | null) => {
        if (!keys) {
          // 返回所有存储
          return Promise.resolve(Object.fromEntries(mockStorage.entries()));
        }
        if (typeof keys === 'string') {
          // 单个键
          const value = mockStorage.get(keys);
          return Promise.resolve(value !== undefined ? { [keys]: value } : {});
        }
        // 多个键
        const result: Record<string, any> = {};
        keys.forEach((key: string) => {
          const value = mockStorage.get(key);
          if (value !== undefined) {
            result[key] = value;
          }
        });
        return Promise.resolve(result);
      },
      set: (items: Record<string, any>) => {
        Object.entries(items).forEach(([key, value]) => {
          mockStorage.set(key, value);
        });
        return Promise.resolve();
      },
      remove: (keys: string | string[]) => {
        const keysArray = typeof keys === 'string' ? [keys] : keys;
        keysArray.forEach((key: string) => mockStorage.delete(key));
        return Promise.resolve();
      },
      clear: () => {
        mockStorage.clear();
        return Promise.resolve();
      },
    },
    sync: {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    },
    session: {
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

// Mock AIUsageTracker to prevent circular dependency issues in tests
vi.mock('../core/ai/AIUsageTracker', () => ({
  AIUsageTracker: {
    recordUsage: vi.fn().mockResolvedValue(undefined),
    correctUsage: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue({
      period: { start: 0, end: Date.now() },
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      tokens: { input: 0, output: 0, total: 0 },
      cost: { input: 0, output: 0, total: 0 },
      byCurrency: {
        CNY: { input: 0, output: 0, total: 0 },
        USD: { input: 0, output: 0, total: 0 },
        FREE: { input: 0, output: 0, total: 0 }
      },
      byProvider: {},
      byPurpose: {},
      avgLatency: 0
    }),
    getRecentRecords: vi.fn().mockResolvedValue([]),
    getTotalCost: vi.fn().mockResolvedValue(0),
    cleanOldRecords: vi.fn().mockResolvedValue(0),
    exportToCSV: vi.fn().mockResolvedValue('')
  }
}));

