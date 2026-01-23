#!/usr/bin/env python3
"""
简化 AI 策略提示词，删除无效参数
"""
import json

# 读取 JSON 文件
with open('src/core/ai/prompts/templates/zh-CN.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# 新的简化提示词
new_prompt = """# 系统状态

## 供给侧
- 活跃订阅源：{{activeFeeds}} 个
- 日均新文章：{{dailyNewArticles}} 篇
- 原料池（未分析）：{{rawPoolSize}} 篇
- 候选池（高分文章）：{{candidatePoolSize}} 篇
- 低分文章：{{analyzedNotQualifiedSize}} 篇

## 需求侧
- 日均阅读：{{dailyReadCount}} 篇
- 平均阅读速度：{{avgReadSpeed}} 篇/天
- 拒绝率：{{dismissRate}}%
- 喜欢率：{{likeRate}}%
- 推荐池当前大小：{{recommendationPoolSize}} 篇
- 推荐池容量：{{recommendationPoolCapacity}} 篇

## 系统资源
- 今日 AI Tokens 使用：{{aiTokensUsedToday}} / {{aiTokensBudgetDaily}}
- 今日成本：${{aiCostToday}}
- 今日已分析：{{analyzedArticlesToday}} 篇
- 今日已推荐：{{recommendedArticlesToday}} 篇

## 历史数据（7天）
- 总阅读数：{{last7DaysReadCount}} 篇
- 总推荐数：{{last7DaysRecommendedCount}} 篇
- 总分析数：{{last7DaysAnalyzedCount}} 篇

## 用户画像
- 引导完成：{{onboardingComplete}}
- 页面访问数：{{pageVisitCount}}
- 画像置信度：{{profileConfidence}}

---

# 决策规则

## 1. 消费速度判定

- **慢速**（< 2 篇/天）：cooldownMinutes = 120-180
- **中速**（2-5 篇/天）：cooldownMinutes = 60-120
- **快速**（5-10 篇/天）：cooldownMinutes = 40-60
- **超快**（> 10 篇/天）：cooldownMinutes = 30-45

## 2. 推荐策略

- **目标池大小**：targetPoolSize = min(avgReadSpeed × 1.5, 10)，范围 [3, 10]
- **补充阈值**：refillThreshold = ceil(targetPoolSize / 3)，范围 [1, 5]
- **每日上限**：dailyLimit = ceil(avgReadSpeed × 3)，范围 [5, 30]

## 3. 候选池管理

### 准入阈值（entryThreshold）

**含义**：AI 评分高于此值的文章才能进入候选池，范围 [0.5, 0.9]

**决策逻辑**：

计算质量指数：qualityIndex = (likeRate × 2 + (100 - dismissRate)) / 3

- qualityIndex < 40：entryThreshold = 0.50-0.60（放宽标准，增加供给）
- qualityIndex 40-55：entryThreshold = 0.60-0.70（标准门槛）
- qualityIndex 55-70：entryThreshold = 0.70-0.80（适度提高）
- qualityIndex > 70：entryThreshold = 0.80-0.90（高标准，确保质量）

**供给压力调整**：
- 如果 candidatePoolSize < (avgReadSpeed × 2) 且 qualityIndex < 60：降低阈值 0.1（加速补充）
- 如果 candidatePoolSize > (avgReadSpeed × 7)：提高阈值 0.1（择优筛选）

### 过期时间（expiryHours）

**含义**：候选池文章超过此时间自动淘汰，范围 [24, 336]

**决策逻辑**：
- 候选池充足（> avgReadSpeed × 5）：expiryHours = 168（7天，标准淘汰）
- 候选池不足（< avgReadSpeed × 3）：expiryHours = 336（14天，延长保留）
- 候选池适中：expiryHours = 168-240（根据具体情况）

## 4. 策略元数据

- **有效期**：validHours = 24（默认），如果系统稳定（拒绝率 < 15% 且候选池充足），延长至 48
- **复审时间**：nextReviewHours = validHours / 2
- **版本号**："v1.0"

---

# 输出格式

请严格按照以下 JSON 格式输出（不要包含 markdown 代码块标记）：

{
  "recommendation": {
    "targetPoolSize": <number>,
    "refillThreshold": <number>,
    "dailyLimit": <number>,
    "cooldownMinutes": <number>
  },
  "candidatePool": {
    "expiryHours": <number>,
    "entryThreshold": <number>
  },
  "meta": {
    "validHours": <number>,
    "generatedAt": {{timestamp}},
    "version": "v1.0",
    "nextReviewHours": <number>
  }
}

请根据上述规则和当前系统状态，生成合理的策略参数。"""

# 更新提示词
data['strategyDecision']['user'] = new_prompt

# 保存
with open('src/core/ai/prompts/templates/zh-CN.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"✅ 提示词已简化")
print(f"新提示词长度: {len(new_prompt)} 字符")
