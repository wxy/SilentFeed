# Phase 8 - AI Provider 诊断指南

## 问题现象

配置了 DeepSeek API Key，但日志显示：
```
[AICapabilityManager] No provider supports profile generation, using basic keyword summary
```

说明 DeepSeek Provider 未通过 `isAvailable()` 检查，降级到了 Fallback。

---

## 诊断步骤

### 1. 检查 AI 配置

在**浏览器控制台**运行以下代码：

```javascript
// 检查 AI 配置
chrome.storage.local.get('ai_config', (result) => {
  const config = result.ai_config;
  console.log('🔍 AI Config:', {
    provider: config?.provider,
    model: config?.model,
    apiKeyLength: config?.apiKey?.length,
    apiKeyPreview: config?.apiKey ? config.apiKey.substring(0, 10) + '...' : 'null'
  });
});
```

**期望输出**：
```javascript
{
  provider: "deepseek",
  model: "deepseek-chat",
  apiKeyLength: 48,  // ⚠️ 必须 >= 20
  apiKeyPreview: "sk-xxxxxxxx..."
}
```

---

### 2. 查看详细日志

刷新页面后，在控制台查找以下日志：

#### ✅ 成功场景
```
[DeepSeek] ✅ DeepSeek Provider is available
[AICapabilityManager] Checking if DeepSeek supports profile generation...
[AICapabilityManager] DeepSeek availability: true
[AICapabilityManager] Generating user profile with: DeepSeek
```

#### ❌ 失败场景 1 - API Key 无效
```
[DeepSeek] Invalid API Key (length: 15, required: >= 20)
[AICapabilityManager] DeepSeek availability: false
[AICapabilityManager] Primary provider DeepSeek not available, using fallback
```

#### ❌ 失败场景 2 - 网络离线
```
[DeepSeek] No network connection
[AICapabilityManager] DeepSeek availability: false
```

#### ❌ 失败场景 3 - 不支持方法
```
[AICapabilityManager] Primary provider does not support generateUserProfile method
```

---

## 常见问题修复

### 问题 1: API Key 长度不足

**症状**：`Invalid API Key (length: X, required: >= 20)`

**原因**：
- API Key 可能被截断
- 配置时复制错误
- 加密/解密失败

**解决方案**：
1. 打开 Options 页面
2. 重新输入完整的 DeepSeek API Key（通常 48+ 字符）
3. 保存配置
4. 刷新页面验证

---

### 问题 2: API Key 为空

**症状**：`apiKeyLength: 0` 或 `null`

**原因**：
- 配置未保存成功
- Storage 读取失败

**解决方案**：
1. 检查浏览器权限（是否允许扩展使用 Storage）
2. 清除扩展数据并重新配置：
   ```javascript
   chrome.storage.local.clear(() => {
     console.log('Storage cleared');
   });
   ```
3. 重新配置 AI

---

### 问题 3: 网络离线

**症状**：`No network connection`

**原因**：
- `navigator.onLine === false`
- 代理/VPN 问题

**解决方案**：
1. 检查网络连接
2. 测试网络：
   ```javascript
   console.log('Online:', navigator.onLine);
   ```

---

### 问题 4: 加密密钥问题

**症状**：
```
[AIConfig] Failed to decrypt API key, using as-is
```

**原因**：
- 加密时使用的密钥与解密时不一致
- 存储的数据格式错误

**解决方案**：
1. 清除旧配置
2. 重新保存 API Key（会使用新的加密密钥）

---

## 验证修复

运行以下完整检查：

```javascript
// 完整诊断脚本
async function diagnoseAI() {
  // 1. 检查配置
  const config = await new Promise(resolve => {
    chrome.storage.local.get('ai_config', result => resolve(result.ai_config));
  });
  
  console.log('📋 AI Configuration:');
  console.log('  Provider:', config?.provider);
  console.log('  Model:', config?.model);
  console.log('  API Key Length:', config?.apiKey?.length);
  console.log('  API Key Valid:', config?.apiKey?.length >= 20 ? '✅' : '❌');
  
  // 2. 检查网络
  console.log('\n🌐 Network Status:');
  console.log('  Online:', navigator.onLine ? '✅' : '❌');
  
  // 3. 触发测试
  console.log('\n🧪 Triggering test...');
  console.log('请执行「不想读」操作，然后查看日志');
}

diagnoseAI();
```

---

## 预期行为

### 正确流程
```
用户点击「不想读」
  ↓
[SemanticProfile] 检测到拒绝行为，立即触发全量更新
  ↓
[AICapabilityManager] Checking if DeepSeek supports profile generation...
  ↓
[DeepSeek] ✅ DeepSeek Provider is available
  ↓
[AICapabilityManager] Generating user profile with: DeepSeek
  ↓
[DeepSeek] API 调用成功
  ↓
[SemanticProfile] ✅ AI 画像生成成功 {provider: 'deepseek', ...}
```

### 降级流程（预期行为）
```
[DeepSeek] Invalid API Key (length: 15, required: >= 20)
  ↓
[AICapabilityManager] Using fallback provider for profile generation
  ↓
[SemanticProfile] ✅ AI 画像生成成功 {provider: 'keyword', ...}
```

---

## 联系支持

如果以上步骤无法解决问题，请提供：
1. 完整的控制台日志（从点击「不想读」开始）
2. AI 配置信息（隐藏 API Key）
3. 浏览器版本和操作系统
