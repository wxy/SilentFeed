#!/bin/bash
# 简化的 PR 创建脚本
# 收集信息供 Claude skill 分析

set -e

# 颜色定义
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  🤫 Silent Feed - PR 信息收集器${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 检查是否有未提交的更改
if [[ -n $(git status -s) ]]; then
  echo -e "${RED}❌ 有未提交的更改，请先提交${NC}"
  git status -s
  exit 1
fi

# 获取当前分支
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [[ "$CURRENT_BRANCH" == "master" || "$CURRENT_BRANCH" == "main" ]]; then
  echo -e "${RED}❌ 不能从 master 分支创建 PR${NC}"
  exit 1
fi

echo -e "${GREEN}✓ 当前分支:${NC} $CURRENT_BRANCH"
echo ""

# 收集提交信息
echo -e "${CYAN}📊 提交列表:${NC}"
git log origin/master..HEAD --oneline
echo ""

# 收集变更统计
echo -e "${CYAN}📝 变更统计:${NC}"
git diff --stat origin/master..HEAD
echo ""

# 提示用户
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}提示：${NC}现在请向 Claude 说："
echo -e "${GREEN}  \"请帮我创建 PR\"${NC}"
echo ""
echo -e "Claude 会分析以上信息，生成详细的 PR 描述，并帮你创建。"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
