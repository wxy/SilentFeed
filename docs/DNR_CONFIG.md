# DNR (Declarative Net Request) 配置说明

## 概述

SilentFeed 使用 Chrome 的 Declarative Net Request API 来修改本地 Ollama 请求的 headers，解决 CORS 问题。

## 文件结构

```
public/
  └── dnr-rules.json          # DNR 规则定义
scripts/
  └── post-build-dnr.sh       # 构建后处理脚本
package.json                  # 包含 declarativeNetRequestWithHostAccess 权限
```

## DNR 规则

文件：`public/dnr-rules.json`

规则内容：
- 移除本地 Ollama 请求的 `origin` 和 `referer` headers
- 仅对 `http://localhost:11434/*` 和 `http://127.0.0.1:11434/*` 生效
- 解决浏览器扩展调用本地 API 的 CORS 限制

## 构建流程

### 开发模式 (npm run dev)

```bash
npm run dev
# → plasmo dev
# → Plasmo 自动构建到 build/chrome-mv3-dev/
# → (首次运行后) 刷新浏览器扩展即可
```

### 生产构建 (npm run build)

```bash
npm run build
# 1. plasmo build → 生成 build/chrome-mv3-prod/
# 2. copy-locales.sh → 复制语言文件
# 3. post-build-dnr.sh → 注入 DNR 配置和规则文件
```

## post-build-dnr.sh 工作原理

1. **等待构建完成**：脚本在 `plasmo build` 之后执行，此时 manifest.json 已生成
2. **注入 DNR 配置**：使用 `jq` 修改 manifest.json，添加 `declarative_net_request` 字段
3. **复制规则文件**：将 `public/dnr-rules.json` 复制到构建目录
4. **幂等性检查**：开发构建会检查是否已注入，避免重复

## 为什么不静态配置？

**尝试过的方案**：
- ❌ 在 `package.json` 的 `manifest` 字段中配置 DNR
  - Plasmo 会验证 `dnr-rules.json` 文件路径
  - 无法正确解析 `public/` 目录下的文件
  - 构建时报错：`Failed to resolve 'dnr-rules.json'`

**当前方案优势**：
- ✅ 简单可靠：构建完成后一次性注入
- ✅ 无竞态条件：不需要等待或监听文件变化
- ✅ 易于维护：单一职责的后处理脚本
- ✅ 幂等性：多次执行不会破坏配置

## 常见问题

### Q: 为什么删除了 watch-dnr.sh？
A: `plasmo dev` 会自动 watch 文件变化并重新构建，不需要额外的文件监听。首次启动后，后续修改会自动应用。

### Q: dev 和 build 会冲突吗？
A: 不会。它们操作不同的构建目录：
- dev → `build/chrome-mv3-dev/`
- build → `build/chrome-mv3-prod/`

### Q: 如何验证 DNR 配置是否成功？
A: 检查构建目录：
```bash
# 查看 manifest.json 中的 DNR 配置
jq '.declarative_net_request' build/chrome-mv3-prod/manifest.json

# 确认规则文件已复制
ls -lh build/chrome-mv3-prod/dnr-rules.json
```

### Q: 能否修改 DNR 规则？
A: 可以。修改 `public/dnr-rules.json`，然后：
- 开发模式：刷新扩展即可
- 生产模式：重新运行 `npm run build`

## 相关文档

- [Chrome DNR API 文档](https://developer.chrome.com/docs/extensions/reference/declarativeNetRequest/)
- [Plasmo 框架文档](https://docs.plasmo.com/)
- 项目权限配置：`docs/PERMISSIONS.md`
