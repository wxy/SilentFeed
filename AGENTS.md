

<skills_system priority="1">

## Available Skills

<!-- SKILLS_TABLE_START -->
<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:
- Invoke: Bash("openskills read <skill-name>")
- The skill content will load with detailed instructions on how to complete the task
- Base directory provided in output for resolving bundled resources (references/, scripts/, assets/)

Usage notes:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
- Each skill invocation is stateless
</usage>

<available_skills>

<skill>
<name>algorithmic-art</name>
<description>Creating algorithmic art using p5.js with seeded randomness and interactive parameter exploration. Use this when users request creating art using code, generative art, algorithmic art, flow fields, or particle systems. Create original algorithmic art rather than copying existing artists' work to avoid copyright violations.</description>
<location>project</location>
</skill>

<skill>
<name>brand-guidelines</name>
<description>Applies Anthropic's official brand colors and typography to any sort of artifact that may benefit from having Anthropic's look-and-feel. Use it when brand colors or style guidelines, visual formatting, or company design standards apply.</description>
<location>project</location>
</skill>

<skill>
<name>canvas-design</name>
<description>Create beautiful visual art in .png and .pdf documents using design philosophy. You should use this skill when the user asks to create a poster, piece of art, design, or other static piece. Create original visual designs, never copying existing artists' work to avoid copyright violations.</description>
<location>project</location>
</skill>

<skill>
<name>doc-coauthoring</name>
<description>Guide users through a structured workflow for co-authoring documentation. Use when user wants to write documentation, proposals, technical specs, decision docs, or similar structured content. This workflow helps users efficiently transfer context, refine content through iteration, and verify the doc works for readers. Trigger when user mentions writing docs, creating proposals, drafting specs, or similar documentation tasks.</description>
<location>project</location>
</skill>

<skill>
<name>docx</name>
<description>"Comprehensive document creation, editing, and analysis with support for tracked changes, comments, formatting preservation, and text extraction. When Claude needs to work with professional documents (.docx files) for: (1) Creating new documents, (2) Modifying or editing content, (3) Working with tracked changes, (4) Adding comments, or any other document tasks"</description>
<location>project</location>
</skill>

<skill>
<name>frontend-design</name>
<description>Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics.</description>
<location>project</location>
</skill>

<skill>
<name>internal-comms</name>
<description>A set of resources to help me write all kinds of internal communications, using the formats that my company likes to use. Claude should use this skill whenever asked to write some sort of internal communications (status reports, leadership updates, 3P updates, company newsletters, FAQs, incident reports, project updates, etc.).</description>
<location>project</location>
</skill>

<skill>
<name>mcp-builder</name>
<description>Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. Use when building MCP servers to integrate external APIs or services, whether in Python (FastMCP) or Node/TypeScript (MCP SDK).</description>
<location>project</location>
</skill>

<skill>
<name>pdf</name>
<description>Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms. When Claude needs to fill in a PDF form or programmatically process, generate, or analyze PDF documents at scale.</description>
<location>project</location>
</skill>

<skill>
<name>pptx</name>
<description>"Presentation creation, editing, and analysis. When Claude needs to work with presentations (.pptx files) for: (1) Creating new presentations, (2) Modifying or editing content, (3) Working with layouts, (4) Adding comments or speaker notes, or any other presentation tasks"</description>
<location>project</location>
</skill>

<skill>
<name>skill-creator</name>
<description>Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations.</description>
<location>project</location>
</skill>

<skill>
<name>slack-gif-creator</name>
<description>Knowledge and utilities for creating animated GIFs optimized for Slack. Provides constraints, validation tools, and animation concepts. Use when users request animated GIFs for Slack like "make me a GIF of X doing Y for Slack."</description>
<location>project</location>
</skill>

<skill>
<name>template</name>
<description>Replace with description of the skill and when Claude should use it.</description>
<location>project</location>
</skill>

<skill>
<name>theme-factory</name>
<description>Toolkit for styling artifacts with a theme. These artifacts can be slides, docs, reportings, HTML landing pages, etc. There are 10 pre-set themes with colors/fonts that you can apply to any artifact that has been creating, or can generate a new theme on-the-fly.</description>
<location>project</location>
</skill>

<skill>
<name>web-artifacts-builder</name>
<description>Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using modern frontend web technologies (React, Tailwind CSS, shadcn/ui). Use for complex artifacts requiring state management, routing, or shadcn/ui components - not for simple single-file HTML/JSX artifacts.</description>
<location>project</location>
</skill>

<skill>
<name>webapp-testing</name>
<description>Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior, capturing browser screenshots, and viewing browser logs.</description>
<location>project</location>
</skill>

<skill>
<name>xlsx</name>
<description>"Comprehensive spreadsheet creation, editing, and analysis with support for formulas, formatting, data analysis, and visualization. When Claude needs to work with spreadsheets (.xlsx, .xlsm, .csv, .tsv, etc) for: (1) Creating new spreadsheets with formulas and formatting, (2) Reading or analyzing data, (3) Modify existing spreadsheets while preserving formulas, (4) Data analysis and visualization in spreadsheets, or (5) Recalculating formulas"</description>
<location>project</location>
</skill>

</available_skills>
<!-- SKILLS_TABLE_END -->

<!-- PROJECT_SKILLS_START -->
<!-- 项目自定义技能现在从远程 GitHub 仓库集成: https://github.com/wxy/copilot-evolution-skills -->
<!-- 可进化技能已移至独立项目，通过远程脚本进行管理 -->

<project_skills>
<skill>
<name>_change-summary</name>
<description>自动汇总当前分支相对主分支的提交摘要，用于 PR/说明对齐。</description>
<file>.copilot/skills/skills/_change-summary/SKILL.md</file>
</skill>

<skill>
<name>_code-health-check</name>
<description>代码健康检查技能。在代码提交前进行全面的质量检查，包括 VSCode 错误面板、TypeScript 编译、Linting、测试覆盖率等。确保代码质量，防止隐蔽的故障。</description>
<file>.copilot/skills/skills/_code-health-check/SKILL.md</file>
</skill>

<skill>
<name>_context-ack</name>
<description>在每次回复中使用固定前缀并列出本次实际参考的指令/文件，便于校验是否遵循上下文与规则。</description>
<file>.copilot/skills/skills/_context-ack/SKILL.md</file>
</skill>

<skill>
<name>_evolution-core</name>
<description>进化能力元技能。用于识别可进化场景（重复错误、用户反馈、复杂工作流），并将经验沉淀为可复用技能或指令更新。</description>
<file>.copilot/skills/skills/_evolution-core/SKILL.md</file>
</skill>

<skill>
<name>_file-output-guard</name>
<description>创建/输出文件的安全约束。禁止 HERE 文档创建文件；大文件输出需分段写入同一文件，避免会话超限。</description>
<file>.copilot/skills/skills/_file-output-guard/SKILL.md</file>
</skill>

<skill>
<name>_git-commit</name>
<description>Git 提交最佳实践。提供规范化提交流程、说明文件模板、Conventional Commits 格式指导。用于确保提交信息清晰、一致、便于追踪。</description>
<file>.copilot/skills/skills/_git-commit/SKILL.md</file>
</skill>

<skill>
<name>_instruction-guard</name>
<description>强制在每次回复前读取项目指令文件，避免遗漏规范。与 _context-ack 配合，仅负责“读取约束”，不负责输出格式。</description>
<file>.copilot/skills/skills/_instruction-guard/SKILL.md</file>
</skill>

<skill>
<name>_pr-creator</name>
<description>PR 创建与版本控制流程技能。智能分析提交、生成 PR、管理版本号。支持多语言模板、自动检测版本策略。</description>
<file>.copilot/skills/skills/_pr-creator/SKILL.md</file>
</skill>

<skill>
<name>_release-process</name>
<description>完整的发布流程技能。包括发布分支创建、测试检查、文档更新（多语言）、截图验证、Chrome Store 物料准备、PR 创建（使用 _pr-creator 技能）、用户手工合并、GitHub Release 创建、构建压缩包等全链路工作。采用分支隔离策略，确保 master 分支稳定。</description>
<file>.copilot/skills/skills/_release-process/SKILL.md</file>
</skill>

<skill>
<name>_session-safety</name>
<description>会话输出安全控制。防止超长输出导致失败，必要时分段写入文件。</description>
<file>.copilot/skills/skills/_session-safety/SKILL.md</file>
</skill>

<skill>
<name>_skills-manager</name>
<description>用于管理 copilot-evolution-skills 技能库的更新、贡献和维护。当用户请求"更新技能"、"贡献技能"或"检查技能版本"时使用。</description>
<file>.copilot/skills/skills/_skills-manager/SKILL.md</file>
</skill>

<skill>
<name>_traceability-check</name>
<description>校验“说明内容 ↔ 实际变更文件”的一致性，避免描述遗漏或偏差。</description>
<file>.copilot/skills/skills/_traceability-check/SKILL.md</file>
</skill>

<skill>
<name>_typescript-type-safety</name>
<description>TypeScript Mock 数据创建与类型错误预防。用于修复与预防测试中的类型错误与 mock 构造缺陷。</description>
<file>.copilot/skills/skills/_typescript-type-safety/SKILL.md</file>
</skill>

</project_skills>

<!-- PROJECT_SKILLS_END -->

</skills_system>
