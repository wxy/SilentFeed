#!/usr/bin/env python3
"""
批量迁移 console 调用到 logger 的工具
"""

import re
import sys
from pathlib import Path

def migrate_file(file_path: Path, tag: str) -> tuple[int, int]:
    """
    迁移单个文件
    
    Returns:
        (替换数量, 剩余console数量)
    """
    content = file_path.read_text()
    original_console_count = content.count('console.')
    
    # 1. 添加 logger 导入（如果还没有）
    if 'import { logger }' not in content:
        # 找到第一个 import 语句后插入
        import_pattern = r'(import\s+.*\n)'
        first_import = re.search(import_pattern, content)
        
        logger_import = f"""import {{ logger }} from '../../utils/logger'

// 创建带标签的 logger
const {tag.lower()}Logger = logger.withTag('{tag}')

"""
        
        if first_import:
            content = content[:first_import.end()] + logger_import + content[first_import.end():]
        else:
            # 在文件开头插入（跳过注释）
            lines = content.split('\n')
            insert_pos = 0
            for i, line in enumerate(lines):
                if not line.strip().startswith('*') and not line.strip().startswith('//') and line.strip():
                    insert_pos = i
                    break
            lines.insert(insert_pos, logger_import)
            content = '\n'.join(lines)
    
    # 2. 替换 console 调用
    logger_name = f"{tag.lower()}Logger"
    
    # 替换模式：console.log('[Tag] -> tagLogger.info('
    patterns = [
        (rf"console\.log\('\[{tag}\]", f"{logger_name}.info('"),
        (rf'console\.log\("\[{tag}\]', f'{logger_name}.info("'),
        (rf"console\.log\(`\[{tag}\]", f"{logger_name}.info(`"),
        (rf"console\.info\('\[{tag}\]", f"{logger_name}.info('"),
        (rf'console\.info\("\[{tag}\]', f'{logger_name}.info("'),
        (rf"console\.info\(`\[{tag}\]", f"{logger_name}.info(`"),
        (rf"console\.warn\('\[{tag}\]", f"{logger_name}.warn('"),
        (rf'console\.warn\("\[{tag}\]', f'{logger_name}.warn("'),
        (rf"console\.warn\(`\[{tag}\]", f"{logger_name}.warn(`"),
        (rf"console\.error\('\[{tag}\]", f"{logger_name}.error('"),
        (rf'console\.error\("\[{tag}\]', f'{logger_name}.error("'),
        (rf"console\.error\(`\[{tag}\]", f"{logger_name}.error(`"),
    ]
    
    for pattern, replacement in patterns:
        content = re.sub(pattern, replacement, content)
    
    # 写回文件
    file_path.write_text(content)
    
    new_console_count = content.count('console.')
    replaced = original_console_count - new_console_count
    
    return replaced, new_console_count

def main():
    if len(sys.argv) < 3:
        print("用法: python3 migrate_logger.py <文件路径> <模块标签>")
        print("示例: python3 migrate_logger.py src/core/ai/AICapabilityManager.ts AICapabilityManager")
        sys.exit(1)
    
    file_path = Path(sys.argv[1])
    tag = sys.argv[2]
    
    if not file_path.exists():
        print(f"❌ 错误: 文件不存在 {file_path}")
        sys.exit(1)
    
    print(f"🔧 迁移文件: {file_path}")
    print(f"📝 模块标签: {tag}")
    
    replaced, remaining = migrate_file(file_path, tag)
    
    print(f"✅ 完成替换: {replaced} 处")
    print(f"   剩余 console 调用: {remaining} 处")
    
    if remaining > 0:
        print("\n⚠️  剩余的 console 调用需要手动处理")

if __name__ == '__main__':
    main()
