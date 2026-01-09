import { defineConfig } from 'vitest/config'
import dotenv from 'dotenv'
import react from '@vitejs/plugin-react'
import path from 'path'

// 加载 .env 文件中的环境变量
dotenv.config()

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'dist/',
        '.plasmo/',
        '**/*.json',
        '**/*.css',
        'src/i18n/index.ts',
        'src/contents/plasmo.ts',
        'src/debug/**',
        'src/core/*/index.ts',
      ],
      thresholds: {
        lines: 69,
        functions: 70,
        branches: 58,
        statements: 69,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~': path.resolve(__dirname, './'),
    },
  },
})
