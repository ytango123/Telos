import json
from openai import AsyncOpenAI
from typing import Optional

from app.config import settings


class AIService:
    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
        )
        self.model = settings.deepseek_model
    
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
            "quick_overview": "Keep the course concise with 3-4 chapters. Focus on key concepts and practical takeaways. Each chapter should be brief but informative.",
            "standard": "Create a balanced course with 5-7 chapters. Cover the topic comprehensively but accessibly. Include examples and explanations.",
            "deep_dive": "Design an in-depth course with 8-12 chapters. Explore the topic thoroughly including advanced concepts, detailed explanations, and technical depth.",
        }
        
        depth_instruction = depth_instructions.get(target_depth, depth_instructions["standard"])
        
        context_section = ""
        if context:
            context_section = f"""
## Reference Material
The following is relevant context from the user's uploaded materials. Use this to inform the course structure:
{context[:2000]}
"""
        
        prompt = f"""You are an expert course designer. Create a structured course outline based on the following learning request.

## Learning Request
**Title:** {title}
**Description:** {description}
**Learning Goal:** {target if target else 'General understanding of the topic'}
{context_section}
## Depth Requirement
{depth_instruction}

## Output Format
Return a JSON object with the following structure:
{{
    "title": "Course title",
    "description": "Brief course description (2-3 sentences)",
    "chapters": [
        {{
            "title": "Chapter title",
            "outline": "Brief description of what this chapter covers (2-3 sentences)"
        }}
    ]
}}

Important:
- Make the course title engaging and specific
- Each chapter should have a clear learning objective
- Organize chapters in a logical learning progression
- Ensure the depth matches the requirement

Return only valid JSON, no markdown formatting."""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "You are an expert educational content designer. Always respond with valid JSON."},
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
    ) -> str:
        """Generate detailed chapter content in Markdown format"""
        
        length_instructions = {
            "quick_overview": "Keep the chapter concise (300-500 words). Focus on essential information.",
            "standard": "Write a comprehensive chapter (600-1000 words). Include explanations and examples.",
            "deep_dive": "Write an in-depth chapter (1000-1500 words). Include detailed explanations, examples, code snippets if relevant, and technical depth.",
        }
        
        length_instruction = length_instructions.get(target_depth, length_instructions["standard"])
        
        context_section = ""
        if context:
            context_section = f"""
## Reference Material
The following is relevant context from the user's materials:
{context}

Use this context to enhance your explanations where relevant.
"""
        
        prompt = f"""You are an expert educator creating learning content.

## Course Information
**Course:** {course_title}
**Chapter:** {chapter_title}
**Chapter Outline:** {chapter_outline}
**Learning Goal:** {target if target else 'General understanding'}
{context_section}

## Content Requirements
{length_instruction}

## Writing Guidelines
1. Start with a brief introduction to the chapter topic
2. Use clear headings and subheadings (## and ###)
3. Explain concepts progressively from simple to complex
4. Include practical examples where appropriate
5. Use bullet points and numbered lists for clarity
6. If code is relevant, include well-commented code blocks
7. End with a brief summary or key takeaways
8. Use proper Markdown formatting

## Output Format
Write the chapter content in Markdown format. Do not include the chapter title as an H1 heading (it will be added separately).

Begin writing the chapter content now:"""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "You are an expert educator who creates clear, engaging, and well-structured learning content. Write in Markdown format."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
        )
        
        return response.choices[0].message.content
