# DNR (Declarative Net Request) 配置说明

## 概述

SilentFeed 使用 Chrome 的 Declarative Net Request API 来修改本地 Ollama 请求的 headers，解决 CORS 问题。

## 文件结构

```
dnr-rules.json                  # DNR 规则定义（源文件）
.plasmo/
  └── dnr-rules.json            # 构建时复制（Plasmo 会自动打包）
package.json                    # manifest 配置
scripts/
  └── pre-build-dnr.sh          # 构建前准备脚本
```

## DNR 规则

文件：`dnr-rules.json`

规则内容：
- 移除本地 Ollama 请求的 `origin` 和 `referer` headers
- 针对 `http://localhost:11434/*` 和 `http://127.0.0.1:11434/*`
- 解决浏览器扩展调用本地 API 的 CORS 限制

## 构建流程

### 开发模式 (npm run dev)

```bash
npm run dev
# 1. pre-build-dnr.sh → 复制 dnr-rules.json 到 .plasmo/
# 2. plasmo dev → Plasmo 读取 package.json 的 manifest 配置
#                 自动打包 dnr-rules.json 并添加 hash
#                 生成带 DNR 配置的 manifest.json
```

### 生产构建 (npm run build)

```bash
npm run build
# 1. pre-build-dnr.sh → 复制 dnr-rules.json 到 .plasmo/
# 2. plasmo build → 同 dev 流程，Plasmo 自动处理
# 3. copy-locales.sh → 复制语言文件
```

## Plasmo 的 DNR 处理机制

### 关键发现

1. **manifest 配置**：在 `package.json` 中配置 `declarative_net_request`
2. **文件位置**：DNR 规则文件必须在 `.plasmo/` 目录中，Plasmo 才能在构建时找到
3. **自动打包**：Plasmo 会：
   - 读取 `.plasmo/dnr-rules.json`
   - 添加内容 hash（如 `dnr-rules.b9c784a5.json`）
   - 更新 manifest 中的 `path` 字段
   - 复制到构建目录

### package.json 配置

```json
{
  "manifest": {
    "declarative_net_request": {
      "rule_resources": [
        {
          "id": "ollama-cors-fix",
          "enabled": true,
          "path": "dnr-rules.json"  // Plasmo 会自动添加 hash
        }
      ]
    }
  }
}
```

### 构建产物

生产构建后的 manifest.json：
```json
{
  "declarative_net_request": {
    "rule_resources": [
      {
        "id": "ollama-cors-fix",
        "enabled": true,
        "path": "dnr-rules.b9c784a5.json"  // ← 自动添加 hash
      }
    ]
  }
}
```

## 为什么使用 .plasmo 目录？

**尝试过的方案**：
- ❌ 直接在项目根目录：Plasmo 找不到文件
- ❌ `public/` 目录：Plasmo 构建时不会验证
- ❌ `static/` 目录：Plasmo 不支持此路径
- ❌ 构建后注入：破坏 Plasmo 的热重载机制
- ✅ **`.plasmo/` 目录**：Plasmo 的标准资源目录

**为什么需要 pre-build-dnr.sh**：
- `.plasmo/` 是 Plasmo 的临时构建目录，会被清理
- 源文件保存在根目录 `dnr-rules.json`
- 每次构建前复制到 `.plasmo/`，确保 Plasmo 能找到

## 优势

✅ **完全静态**：Plasmo 在构建时处理，无运行时注入  
✅ **自动 Hash**：支持浏览器缓存控制  
✅ **流程一致**：dev 和 build 使用相同机制  
✅ **热重载友好**：不会触发 Chrome 扩展热重载错误  
✅ **简单可靠**：符合 Plasmo 的设计理念

## 常见问题

### Q: 为什么不直接把 dnr-rules.json 放在 .plasmo 目录？
A: `.plasmo` 是 Plasmo 的构建缓存目录，内容会被自动管理和清理。源文件应该保存在项目根目录，由脚本复制到 `.plasmo`。

### Q: 能否修改 DNR 规则？
A: 可以。修改 `dnr-rules.json`，然后：
- 开发模式：重启 `npm run dev`
- 生产模式：重新运行 `npm run build`

### Q: hash 是如何生成的？
A: Plasmo 根据文件内容自动计算 hash。文件内容不变，hash 不变。这有助于浏览器缓存。

### Q: 如何验证 DNR 配置是否成功？
A: 检查构建目录：
```bash
# 查看 manifest.json 中的 DNR 配置
jq '.declarative_net_request' build/chrome-mv3-prod/manifest.json

# 确认规则文件已打包（带 hash）
ls -lh build/chrome-mv3-prod/dnr-rules.*.json
```

## 相关文档

- [Chrome DNR API 文档](https://developer.chrome.com/docs/extensions/reference/declarativeNetRequest/)
- [Plasmo 框架文档](https://docs.plasmo.com/)
- 项目权限配置：`docs/PERMISSIONS.md`
