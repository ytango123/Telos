import json
import logging
import re
import httpx
from openai import AsyncOpenAI
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


def _clean_title_text(raw: str) -> str:
    """Normalize model output into a concise plain title."""
    if not raw:
        return ""

    title = raw.strip().strip("\"'""''`")
    # Keep only first line and remove common prefixes.
    title = title.splitlines()[0].strip()
    for prefix in ["标题：", "标题:", "主题：", "主题:", "Title:", "TITLE:"]:
        if title.startswith(prefix):
            title = title[len(prefix):].strip()

    # Remove markdown bullets / numbering prefixes if present.
    title = re.sub(r"^[-*#\d\.\)\s]+", "", title).strip()
    # Collapse whitespace.
    title = re.sub(r"\s+", " ", title).strip()
    # Trim trailing punctuation.
    title = re.sub(r"[，。！？：；,.!?;:]+$", "", title).strip()
    return title


# Rich formatting guide for AI-generated content
RICH_FORMATTING_GUIDE = """
## 格式指南

撰写内容时，灵活运用以下格式增强阅读体验：

### 1. 彩色高亮 - 标记重点内容
使用 `==颜色:文字==` 语法来高亮关键内容，不同颜色有不同含义：

- ==yellow:黄色高亮== 用于一般重点概念（默认，可简写为 ==重点==）
- ==red:红色高亮== 用于警告、易错点、需要特别注意的内容
- ==green:绿色高亮== 用于最佳实践、推荐做法、正确示例
- ==blue:蓝色高亮== 用于定义、术语解释
- ==purple:紫色高亮== 用于核心概念、关键原理

示例：
- 这是一个 ==重要概念== （黄色，默认）
- ==red:注意：这是常见错误==
- ==green:推荐使用这种方式==
- ==blue:闭包== 是指...
- ==purple:这是核心原理==

### 2. 其他格式
- **粗体** 强调关键术语
- `行内代码` 标记技术术语、函数名、命令
- 代码块展示代码示例（标注语言）
- 使用 `files` 代码块展示项目结构（如目录树）
- 表格对比结构化信息
- 列表展示步骤或要点
- > 引用用于名言或定义
- 合理插入配图（Markdown 图片语法），帮助理解流程或结构

### 3. Mermaid 图表（高度推荐）
当解释**流程 / 架构 / 时序 / 状态转换 / 层级关系**时，应使用 Mermaid 图替代纯文字描述：

```mermaid
flowchart TD
    A[用户输入] --> B{校验}
    B -->|通过| C[处理]
    B -->|失败| D[提示]
```

支持的图类型：`flowchart`、`sequenceDiagram`、`classDiagram`、`stateDiagram-v2`、`erDiagram`、`gantt`、`mindmap`、`timeline`。

Mermaid 使用规则：
- 用 ```` ```mermaid ```` 代码块包裹，**这是唯一允许在代码块内放置非代码内容的例外**
- 节点 id 用 PascalCase 或下划线，**不要在 id 中含空格**（错：`User Service`，对：`UserService` 或 `user_service`）
- 节点 label 含括号/冒号/逗号时用双引号包起来：`A["Process (main)"]`
- 不要使用保留字作为节点 id（`end`、`subgraph`、`graph`）
- **不要写任何 style/classDef/click 语句**——主题颜色由渲染器自动注入，写死颜色会在暗色模式下出问题
- 每章节最多 1-2 张图，只在结构化信息真的复杂时才用

### 使用原则
- 高亮要精准，每段 1-3 处为宜，不要泛滥
- 颜色选择要有意义，与内容语义匹配
- 保持内容流畅，格式是辅助而非主体
"""


class AIService:
    def __init__(self):
        timeout = httpx.Timeout(
            settings.deepseek_http_timeout,
            connect=60.0,
        )
        self.client = AsyncOpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
            timeout=timeout,
        )
        self.model = settings.deepseek_model

    async def summarize_title(self, description: str) -> str:
        """Generate a concise topic title from user's detailed description."""
        prompt = f"""请基于以下学习需求生成一个标题，尽量将长度限制在 6-28 个字符内：

{description[:1000]}

精确概括用户需求。
只返回标题文字，不要解释。"""

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "你是一个标题生成助手，仅返回一个标题。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=50,
            )
            raw_title = response.choices[0].message.content or ""
            title = _clean_title_text(raw_title)
            logger.info("[AI] summarize_title raw=%r cleaned=%r", raw_title, title)
            if title:
                return title
        except Exception as e:
            logger.exception("[AI] summarize_title failed: %s", e)

        # Only allow two visible states: placeholder or valid AI summary.
        fallback = "新任务"
        logger.info("[AI] summarize_title fallback=%r", fallback)
        return fallback

    async def generate_outline(
        self,
        title: str,
        description: str,
        target: str,
        target_depth: str,
        context: Optional[str] = None,
    ) -> dict:
        """Generate course outline based on block information"""
        
        depth_instructions = {
            "standard": "创建均衡全面的课程，包含 5-7 个章节。全面覆盖主题，同时保持易于理解。包含示例和解释。",
            "deep_dive": "创建深入的课程，包含 8-12 个章节。深入探索主题，包括高级概念、详细解释和技术深度。",
        }
        
        depth_instruction = depth_instructions.get(target_depth, depth_instructions["standard"])
        
        context_section = ""
        if context:
            context_section = f"""
## 参考资料
以下是用户上传材料中的相关内容，请参考这些内容来设计课程结构：
{context[:2000]}
"""
        
        prompt = f"""你是一位专业的课程设计师。请根据以下学习需求创建一个结构化的课程大纲。

## 学习需求
**主题：** {title}
**详细描述：** {description}
**学习目标：** {target if target else '全面理解该主题'}
{context_section}

## 深度要求
{depth_instruction}

## 输出格式
返回一个 JSON 对象，结构如下：
{{
    "title": "课程标题（简洁有吸引力）",
    "description": "课程简介（2-3 句话）",
    "chapters": [
        {{
            "title": "章节标题",
            "outline": "该章节涵盖的内容（2-3 句话描述）"
        }}
    ]
}}

要求：
- 课程标题要具体且有吸引力
- 每个章节要有清晰的学习目标
- 章节按逻辑学习顺序排列
- 难度深度符合要求

只返回有效的 JSON，不要包含 markdown 格式。"""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "你是专业的教育内容设计师。始终返回有效的 JSON。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            response_format={"type": "json_object"},
        )
        
        content = response.choices[0].message.content
        return json.loads(content)
    
    async def generate_chapter(
        self,
        course_title: str,
        chapter_title: str,
        chapter_outline: str,
        target: str,
        target_depth: str,
        context: Optional[str] = None,
        media_catalog_prompt: Optional[str] = None,
    ) -> str:
        """Generate detailed chapter content in Markdown format with rich formatting"""
        
        length_instructions = {
            "standard": "撰写全面的章节（800-1200 字）。包含清晰的解释、实用示例和必要的背景知识。",
            "deep_dive": "撰写深入的章节（1200-1800 字）。包含详细解释、多个示例、代码片段（如适用）和技术深度分析。",
        }
        
        length_instruction = length_instructions.get(target_depth, length_instructions["standard"])
        
        context_section = ""
        if context:
            context_section = f"""
## 参考资料
以下是用户材料中的相关内容，请参考：
{context}

在解释相关概念时，可以适当引用这些内容。
"""

        media_section = ""
        if media_catalog_prompt:
            media_section = f"""
## 可用多媒体素材（引用规则严格）
{media_catalog_prompt}

引用方式（必须使用这些占位符，禁止直接写 URL）：
- 图片：`![[img-1]]` 系统会替换为真实图片
- 视频：`::video[vid-1]` 系统会替换为视频播放器

使用约束：
- 本章最多插入 2-3 张图片、1 个视频；只选与正在讲解的概念最相关的
- 在合适位置自然嵌入（如：图示某概念时插图、引出讲解时附视频）
- 占位符必须独占一行，不要与文字混排
- 不要重复引用同一个 id
- 如果没有合适的，宁可不插入
"""

        prompt = f"""你是一位专业的教育内容创作者，正在为在线学习平台撰写课程内容。

## 课程信息
**课程：** {course_title}
**章节：** {chapter_title}
**章节大纲：** {chapter_outline}
**学习目标：** {target if target else '全面理解该主题'}
{context_section}
{media_section}

## 内容长度要求
{length_instruction}

{RICH_FORMATTING_GUIDE}

## 写作指南

### 结构要求
1. 以简短的引言开始，说明本章将学习什么（1-2 段）
2. 使用清晰的标题和子标题（## 和 ###）组织内容
3. 概念从简单到复杂递进讲解
4. 每个重要概念后提供具体示例
5. 以关键要点总结结束

### 内容质量
- 解释要通俗易懂，避免过于学术化的语言
- 多用类比和实际场景帮助理解
- 代码示例要有注释说明
- 适当使用表格对比相似概念
- 每个概念讲解完整，不留半截

### 格式使用
- 重要概念首次出现时用 **粗体** 标注
- 技术术语、代码、命令用 `行内代码` 格式
- 使用彩色高亮标记重点：
  - ==核心概念== 一般重点用黄色（默认）
  - ==red:警告或易错点== 用红色
  - ==green:推荐做法== 用绿色
  - ==purple:核心原理== 用紫色
- 代码块（```...```）内必须是纯代码，禁止任何 HTML 标签（如 `<mark ...>`）和高亮语法（如 `==...==`）
- 绝对不要在代码示例里插入 `<mark class=...>`、`<span ...>` 等富文本标签

## 输出格式
用 Markdown 格式撰写章节内容。不要包含章节标题作为 H1（会单独添加）。
直接开始写内容，不要有"好的"、"以下是内容"等开场白。

开始撰写："""

        response = await self._chapter_completion(prompt)
        return response

    async def _chapter_completion(self, prompt: str) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": """你是一位优秀的教育内容创作者，擅长将复杂概念讲解得通俗易懂。

你的写作风格：
- 清晰、专业但不枯燥
- 善于用类比和实例解释抽象概念
- 逻辑清晰，层层递进
- 适度使用 Markdown 格式增强可读性
- 重点突出但不过度，保持内容流畅
- 代码块必须是可直接复制运行的纯代码，禁止插入任何 HTML 标签或高亮标记

用 Markdown 格式输出。支持彩色高亮语法：
- ==文字== 黄色高亮（默认重点）
- ==red:文字== 红色高亮（警告/易错）
- ==green:文字== 绿色高亮（推荐/正确）
- ==purple:文字== 紫色高亮（核心原理）"""
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
        )

        return response.choices[0].message.content

    # ------------------------------------------------------------------
    # Multi-agent additions
    # ------------------------------------------------------------------

    async def plan_retrieval(
        self,
        *,
        title: str,
        description: str,
        target: str,
        target_depth: str,
        source_preferences: list[str],
        has_user_links: bool,
        has_rag: bool,
        material_metadata: Optional[list[dict]] = None,
    ) -> dict:
        """Decide which retrievers to enable + produce focused sub_queries.

        Returns a JSON-like dict:
            {
              "enabled_retrievers": ["rag", "user_links", "web", "arxiv", "github"],
              "sub_queries": ["...", "..."],
              "chapter_hint_count": 6,
              "notes": "..."
            }
        """
        prefs = ", ".join(source_preferences) if source_preferences else "(none)"
        materials_lines = []
        for m in material_metadata or []:
            kind = m.get("kind", "")
            title_m = m.get("title", "")
            status = m.get("status", "")
            extra = m.get("extra") or {}
            label = extra.get("status_label") or status
            materials_lines.append(f"- {kind}: {title_m} ({label})")
        materials_section = "\n".join(materials_lines) if materials_lines else "（无）"

        prompt = f"""你是一个学习任务规划助手。根据用户的学习需求决定调用哪些信息源，并生成 2-3 个聚焦的检索子查询。

## 用户需求
- 主题: {title}
- 详细描述: {description}
- 学习目标: {target}
- 学习深度: {target_depth}
- 用户偏好来源: {prefs}
- 是否有用户上传材料: {"是" if has_rag else "否"}
- 是否有用户指定链接: {"是" if has_user_links else "否"}

## 用户提供的资料清单（仅元数据）
{materials_section}

## 可选检索源
- rag: 用户上传的文件/笔记（只有在 has_rag=是 时才能选）
- user_links: 用户指定链接（只有在 has_user_links=是 时才能选）
- web: 通用网络搜索（Tavily + Jina），几乎总是值得开
- arxiv: arXiv 学术论文，适合学术/研究/算法/理论相关
- github: 开源代码仓库，适合代码/项目/库/框架/工程实现相关

## 决策原则
- 始终包含 web，除非用户明确只想用自己的资料
- arxiv 在涉及学术、算法、模型、理论、研究、论文时启用
- github 在涉及代码、库、框架、SDK、工程实现时启用
- has_rag/has_user_links 为否时不要选它们

## 输出
返回严格 JSON：
{{
  "enabled_retrievers": ["..."],
  "sub_queries": ["一个聚焦的检索查询", "另一个角度的查询"],
  "chapter_hint_count": 5,
  "notes": "一句话说明决策理由"
}}
chapter_hint_count: standard 5-7，deep_dive 8-12。
只返回 JSON。"""

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "你是规划助手，只返回严格 JSON。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                response_format={"type": "json_object"},
            )
            return json.loads(response.choices[0].message.content or "{}")
        except Exception as exc:
            logger.warning("[AI] plan_retrieval failed: %s", exc)
            return {}

    async def curate_knowledge_cards(
        self,
        *,
        title: str,
        target: str,
        retrieval_blocks: list[dict],
        max_cards: int = 18,
        media_catalog_prompt: Optional[str] = None,
    ) -> dict:
        """Compress raw retrieval blobs into small structured knowledge cards.

        `retrieval_blocks` items: { "source_key": str, "text": str }
        Returns: {"cards": [KnowledgeCard-like dicts], "topic_index": {topic: [ids]}}
        """
        if not retrieval_blocks:
            return {"cards": [], "topic_index": {}}

        joined = []
        budget = 18000
        used = 0
        for blk in retrieval_blocks:
            txt = blk.get("text") or ""
            if not txt:
                continue
            header = f"### 来源: {blk.get('source_key')}"
            piece = f"{header}\n{txt}"
            if used + len(piece) > budget:
                piece = piece[: max(0, budget - used)]
            joined.append(piece)
            used += len(piece)
            if used >= budget:
                break
        merged = "\n\n========\n\n".join(joined)

        media_section = ""
        if media_catalog_prompt:
            media_section = f"""
## 可用多媒体素材（引用时可在 source_urls 使用 media id，如 img-1 / vid-1）
{media_catalog_prompt}
"""

        prompt = f"""你是一名信息策展员。请把下面来自多个来源的原始检索资料，提炼为结构化的知识卡片。

## 学习任务
- 主题: {title}
- 学习目标: {target}

## 原始检索资料（多来源拼接，可能含噪声）
{merged}
{media_section}

## 任务要求
- 输出 8-{max_cards} 张知识卡片，每张卡片只聚焦一个主题/事实/概念
- 卡片之间不要主题重复，能合并就合并
- 保留可追溯来源（URL），最多 3 条
- 如果卡片依据某个图片或视频素材，请把对应 media id（如 img-1 / vid-1）放入 source_urls，供后续章节按需引用
- 卡片要服务于"撰写课程章节"，因此重技术细节、定义、要点、对比、示例

## 输出 JSON
{{
  "cards": [
    {{
      "id": "c1",
      "topic": "一句话主题",
      "summary": "2-4 句概述",
      "key_facts": ["要点1", "要点2"],
      "source_urls": ["https://..."],
      "source_types": ["web" | "arxiv" | "github" | "user_link" | "rag"]
    }}
  ],
  "topic_index": {{
    "topic 名称": ["c1", "c3"]
  }}
}}
只返回 JSON。"""

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "你是严谨的信息策展员，只返回严格 JSON。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                response_format={"type": "json_object"},
            )
            return json.loads(response.choices[0].message.content or "{}")
        except Exception as exc:
            logger.warning("[AI] curate_knowledge_cards failed: %s", exc)
            return {"cards": [], "topic_index": {}}

    async def generate_outline_from_cards(
        self,
        *,
        title: str,
        description: str,
        target: str,
        target_depth: str,
        cards_summary: str,
        chapter_hint: Optional[int] = None,
    ) -> dict:
        """Outline generator that consumes knowledge cards instead of raw context.

        Returned chapters carry an additional `relevant_card_ids` list selected
        by the model.
        """
        depth_instructions = {
            "standard": "创建 5-7 个章节，覆盖全面同时易于理解。",
            "deep_dive": "创建 8-12 个章节，深入技术细节与底层原理。",
        }
        depth_instruction = depth_instructions.get(target_depth, depth_instructions["standard"])
        hint_clause = f"建议章节数: {chapter_hint}" if chapter_hint else ""

        prompt = f"""你是专业的课程设计师。根据下列知识卡片为用户设计章节大纲。

## 学习需求
- 主题: {title}
- 详细描述: {description}
- 学习目标: {target if target else '全面理解该主题'}

## 深度要求
{depth_instruction}
{hint_clause}

## 可用知识卡片（id + 主题 + 摘要）
{cards_summary}

## 任务
- 设计逻辑清晰、由浅入深的章节
- 每个章节挑选 2-5 个最相关的卡片 id
- 章节标题简洁有吸引力
- 每个章节给出 2-3 句 outline，描述要讲什么

## 输出 JSON
{{
  "title": "课程标题",
  "description": "课程简介",
  "chapters": [
    {{
      "title": "章节标题",
      "outline": "本章概述",
      "relevant_card_ids": ["c1", "c5"]
    }}
  ]
}}
只返回 JSON。"""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "你是课程设计师，始终返回严格 JSON。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content or "{}")

    async def generate_chapter_from_cards(
        self,
        *,
        course_title: str,
        chapter_title: str,
        chapter_outline: str,
        target: str,
        target_depth: str,
        cards_block: str,
        media_catalog_prompt: Optional[str] = None,
    ) -> str:
        """Chapter writer that consumes a chapter-specific knowledge card subset."""
        length_instructions = {
            "standard": "撰写全面的章节（800-1200 字）。包含清晰的解释、实用示例和必要的背景知识。",
            "deep_dive": "撰写深入的章节（1200-1800 字）。包含详细解释、多个示例、代码片段（如适用）和技术深度分析。",
        }
        length_instruction = length_instructions.get(target_depth, length_instructions["standard"])

        cards_section = (
            f"""
## 本章可引用的知识卡片
{cards_block}

写作时请优先依据上述卡片中的事实，必要时可标注卡片来源。"""
            if cards_block
            else ""
        )

        media_section = ""
        if media_catalog_prompt:
            media_section = f"""
## 可用多媒体素材（引用规则严格）
{media_catalog_prompt}

引用方式（必须使用这些占位符，禁止直接写 URL）：
- 图片：`![[img-1]]` 系统会替换为真实图片
- 视频：`::video[vid-1]` 系统会替换为视频播放器

使用约束：
- 根据本章讲解需要灵活插入图片或视频；不需要时可以不用
- 占位符必须独占一行
- 只选择与当前概念直接相关的素材，不要为了展示素材而插入
- 同一个 id 不要在本章内重复引用
- 不要在图片或视频后复述素材描述、caption、字幕摘录等原始理解文本；这些信息只作为写作依据
"""

        prompt = f"""你是一位专业的教育内容创作者，正在为在线学习平台撰写课程内容。

## 课程信息
**课程：** {course_title}
**章节：** {chapter_title}
**章节大纲：** {chapter_outline}
**学习目标：** {target if target else '全面理解该主题'}
{cards_section}
{media_section}

## 内容长度要求
{length_instruction}

{RICH_FORMATTING_GUIDE}

## 写作指南
- 以简短引言开始（1-2 段）
- 使用清晰的标题和子标题（## 和 ###）
- 概念由浅入深递进
- 每个重要概念后给具体示例
- 关键要点总结结束
- 复杂结构/流程/时序首选 Mermaid 图
- 普通代码块（非 mermaid）禁止任何 HTML 标签或高亮语法

## 输出
直接以 Markdown 输出章节正文，不要包含 H1 标题。
不要"好的"、"以下是内容"等开场白。

开始撰写："""

        return await self._chapter_completion(prompt)
