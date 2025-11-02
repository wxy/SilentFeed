# FeedAIMuter - Chrome Extension Project

## Project Overview
FeedAIMuter is an AI-powered RSS reader browser extension that intelligently recommends content based on user browsing behavior, muting the information noise.

**Name Origin**: Feed + AI + Muter
- **Feed**: RSS 订阅源
- **AI**: 人工智能推荐
- **Muter**: 静音器，过滤噪音

## Technology Stack
- **Framework**: Plasmo (Chrome Extension MV3)
- **Language**: TypeScript
- **UI**: React 18 + Tailwind CSS
- **State Management**: Zustand
- **Storage**: Dexie.js (IndexedDB)
- **AI Integration**: User-provided APIs (OpenAI, Anthropic, DeepSeek)

## Core Features (MVP)
- 浏览历史收集（隐私保护）
- 用户兴趣画像构建（本地处理）
- RSS 自动发现和订阅
- AI 智能推荐（用户 API / Chrome AI）
- 静默通知（克制的提醒机制）
- 1000 页面冷启动倒计数

## Development Guidelines
- Use TypeScript for all code
- Follow React best practices
- Implement privacy-first data handling
- Support automatic light/dark theme adaptation
- Keep UI minimal and unobtrusive
- Document all public APIs
