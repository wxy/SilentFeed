#!/usr/bin/env python3
"""
删除 db.ts 中已拆分到模块的重复函数定义

保留的函数（统计相关，未拆分）：
- getAnalysisStats
- getAIAnalysisStats  
- getRecommendationStats
- getStorageStats
- getRecommendationFunnel
- getRSSArticleCount

需要删除的函数（已拆分到模块）：
- saveUserProfile, getUserProfile, deleteUserProfile (db-profile.ts)
- saveInterestSnapshot, getInterestHistory, getPrimaryTopicChanges, getTopicHistory, cleanOldSnapshots (db-snapshots.ts)
- updateFeedStats, updateAllFeedStats (db-feeds.ts)
- markAsRead, dismissRecommendations, getUnreadRecommendations, getUnrecommendedArticleCount, resetRecommendationData (db-recommendations.ts)
"""

import re
from pathlib import Path

# 需要删除的函数列表
FUNCTIONS_TO_REMOVE = [
    'saveUserProfile',
    'getUserProfile', 
    'deleteUserProfile',
    'saveInterestSnapshot',
    'getInterestHistory',
    'getPrimaryTopicChanges',
    'getTopicHistory',
    'cleanOldSnapshots',
    'updateFeedStats',
    'updateAllFeedStats',
    'markAsRead',
    'dismissRecommendations',
    'getUnreadRecommendations',
    'getUnrecommendedArticleCount',
    'resetRecommendationData',
]

def find_function_boundaries(lines, func_name):
    """查找函数的起始和结束行号（包含JSDoc注释）"""
    start_idx = None
    end_idx = None
    brace_count = 0
    in_function = False
    
    # 查找函数定义行
    for i, line in enumerate(lines):
        if re.match(rf'^export async function {func_name}\s*\(', line):
            # 向前查找JSDoc注释的开始
            start_idx = i
            for j in range(i - 1, -1, -1):
                if lines[j].strip().startswith('/**'):
                    start_idx = j
                    break
                elif lines[j].strip() and not lines[j].strip().startswith('*'):
                    break
            
            # 查找函数结束（匹配大括号）
            in_function = True
            for k in range(i, len(lines)):
                line_content = lines[k]
                brace_count += line_content.count('{') - line_content.count('}')
                
                if in_function and brace_count == 0 and '{' in lines[i]:
                    end_idx = k
                    break
            
            break
    
    return start_idx, end_idx

def main():
    db_file = Path('src/storage/db.ts')
    
    if not db_file.exists():
        print(f"❌ 文件不存在: {db_file}")
        return
    
    # 读取文件内容
    with open(db_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # 记录需要删除的行范围
    ranges_to_remove = []
    
    for func_name in FUNCTIONS_TO_REMOVE:
        start, end = find_function_boundaries(lines, func_name)
        if start is not None and end is not None:
            ranges_to_remove.append((start, end, func_name))
            print(f"✅ 找到函数 {func_name}: 行 {start + 1} - {end + 1}")
        else:
            print(f"⚠️  未找到函数: {func_name}")
    
    # 按行号倒序排序（从后往前删除，避免行号变化）
    ranges_to_remove.sort(reverse=True)
    
    # 删除函数
    for start, end, func_name in ranges_to_remove:
        # 保留一个空行（避免函数之间紧贴）
        del lines[start:end + 1]
        print(f"🗑️  删除函数 {func_name}: 行 {start + 1} - {end + 1}")
    
    # 写回文件
    with open(db_file, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    
    print(f"\n✅ 完成！删除了 {len(ranges_to_remove)} 个重复函数")
    print(f"📝 原始行数: {len(lines) + sum(end - start + 1 for start, end, _ in ranges_to_remove)}")
    print(f"📝 新行数: {len(lines)}")

if __name__ == '__main__':
    main()
