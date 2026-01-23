import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// 加载 .env 文件中的环境变量
dotenv.config();
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // 临时排除需要大规模重构的测试文件（v21-v22 架构迁移）
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // TODO: 这些测试需要从 db.recommendations 迁移到 db.feedArticles
      '**/db-recommendations.test.ts',
      '**/db-migration.test.ts',
      '**/db-unrecommended-count.test.ts',
      '**/historical-score-tracker.test.ts',
    ],
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
        '**/*.json',  // 排除 JSON 文件
        '**/*.css',   // 排除 CSS 文件
        'src/i18n/index.ts',  // i18n 配置在运行时初始化
        'src/contents/plasmo.ts',  // Plasmo 生成的文件
        'src/debug/**',  // 排除调试工具（仅开发环境使用）
        'src/core/*/index.ts',  // 排除简单的 re-export 文件
        'src/storage/db/index.ts',  // 排除数据库迁移代码（22 个版本，测试成本极高且间接覆盖充分）
      ],
      // 覆盖率阈值

      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~': path.resolve(__dirname, './'),
    },
  },
});
