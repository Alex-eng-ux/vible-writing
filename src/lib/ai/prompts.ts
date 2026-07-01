// Centralized prompt templates. Keeping them in one place makes it easy to iterate.
// All functions return structured JSON. If the model returns invalid JSON,
// the AI service will fall back to mock data so the user flow is never blocked.

const CHINESE_OUTPUT_RULE = '默认使用简体中文输出所有正文、标题、摘要、建议和解释。只有 JSON 键名保持英文，JSON 的值内容使用中文。';

export const PROMPTS = {
  optimizePrompt: (input: {
    rawIdea: string;
    genre?: string;
    targetLength?: string;
    stylePreference?: string;
  }) => `You are a senior fiction editor. The user has a raw, possibly vague story idea.
Your job is to analyze it, identify what is missing, and produce a structured creative brief.
${CHINESE_OUTPUT_RULE}

Return ONLY valid JSON with this exact shape:
{
  "completenessScore": number, // 0-100, your honest assessment of how much is already present
  "refinedIdea": string,        // a tightened, expanded restatement of the idea (2-4 paragraphs)
  "genre": string,
  "tone": string,
  "targetAudience": string,
  "protagonist": { "name": string, "summary": string },
  "coreConflict": string,
  "worldDirection": string,
  "writingConstraints": string[],
  "missingInfo": string[],
  "directions": [string, string, string],  // three distinct possible directions
  "followUpQuestions": string[]
}

User's raw idea:
"""
${input.rawIdea}
"""

Additional context:
- Genre hint: ${input.genre || 'unspecified'}
- Target length: ${input.targetLength || 'unspecified'}
- Style preference: ${input.stylePreference || 'unspecified'}

Be specific and concrete. Do not write the actual story, only the brief.`,

  generateOutline: (ctx: {
    refinedIdea: string;
    totalChapters: number;
  }) => `You are a professional long-form story architect.
Given the creative brief below, design ${ctx.totalChapters} chapter outlines that form a coherent arc.
Each chapter should advance the plot and connect to the global story.
${CHINESE_OUTPUT_RULE}

Return ONLY valid JSON with this exact shape:
{
  "chapters": [
    {
      "chapterNumber": number,
      "title": string,
      "goal": string,
      "summary": string,
      "requiredBeats": string[],
      "relatedCharacters": string[],
      "relatedForeshadowing": string[]
    }
  ]
}

Creative brief:
"""
${ctx.refinedIdea}
"""`,

  generateChapter: (ctx: {
    chapterNumber: number;
    title: string;
    outline: { goal: string; summary: string; requiredBeats: string[]; relatedCharacters: string[] };
    previousSummary: string;
    characters: Array<{ name: string; description: string; status: string }>;
    locations: Array<{ name: string; description: string }>;
    items: Array<{ name: string; description: string }>;
    worldRules: Array<{ name: string; description: string }>;
    foreshadowing: Array<{ name: string; description: string; status: string }>;
    writingConstraints: string[];
    targetLengthWords: number;
  }) => `You are a professional long-form fiction author. Write chapter ${ctx.chapterNumber}.
${CHINESE_OUTPUT_RULE}

Title: ${ctx.title}
Goal: ${ctx.outline.goal}
Summary: ${ctx.outline.summary}
Required beats (all must appear):
${ctx.outline.requiredBeats.map((b) => `- ${b}`).join('\n')}

Related characters (must appear):
${ctx.outline.relatedCharacters.map((c) => `- ${c}`).join('\n') || '(none)'}

Previous chapter summary:
"""
${ctx.previousSummary || '(this is the first chapter)'}
"""

Characters in this chapter (respect status):
${ctx.characters.map((c) => `- ${c.name} (${c.status}): ${c.description}`).join('\n') || '(none yet)'}

Locations:
${ctx.locations.map((l) => `- ${l.name}: ${l.description}`).join('\n') || '(none yet)'}

Items:
${ctx.items.map((i) => `- ${i.name}: ${i.description}`).join('\n') || '(none yet)'}

World rules (do NOT violate):
${ctx.worldRules.map((r) => `- ${r.name}: ${r.description}`).join('\n') || '(none yet)'}

Open foreshadowing (plant at least one subtle reference):
${ctx.foreshadowing.map((f) => `- ${f.name} (${f.status}): ${f.description}`).join('\n') || '(none yet)'}

Writing constraints:
${ctx.writingConstraints.map((c) => `- ${c}`).join('\n') || '(none)'}

Target length: about ${ctx.targetLengthWords} Chinese characters.

Return ONLY valid JSON: { "content": string, "summary": string }.
The "content" should be the prose of the chapter. Use blank lines between paragraphs.
The "summary" should be 2-4 sentences capturing what happens in this chapter, suitable as context for the next chapter.`,

  continueChapter: (ctx: {
    chapterNumber: number;
    title: string;
    existingContent: string;
    previousSummary: string;
    characters: Array<{ name: string; description: string; status: string }>;
    targetLengthWords: number;
  }) => `You are continuing chapter ${ctx.chapterNumber} titled "${ctx.title}".
${CHINESE_OUTPUT_RULE}

Existing content so far:
"""
${ctx.existingContent}
"""

Previous chapter summary (for context):
"""
${ctx.previousSummary || '(this is the first chapter)'}
"""

Characters present:
${ctx.characters.map((c) => `- ${c.name} (${c.status}): ${c.description}`).join('\n') || '(none yet)'}

Continue the narrative naturally, in the same style and voice. Add about ${ctx.targetLengthWords} Chinese characters.

Return ONLY valid JSON: { "content": string, "summary": string }.`,

  polishText: (ctx: {
    text: string;
    mode: 'selection' | 'full';
    styleHints?: string;
  }) => `You are a senior fiction editor. Polish the following ${ctx.mode === 'selection' ? 'selected passage' : 'full text'}.
Improve prose quality, clarity, rhythm, and consistency with the story's voice. Do not change plot facts.
${CHINESE_OUTPUT_RULE}
${ctx.styleHints ? `Style hints: ${ctx.styleHints}` : ''}

Return ONLY valid JSON: { "content": string }.

Text:
"""
${ctx.text}
"""`,

  extractFacts: (ctx: {
    chapterNumber: number;
    title: string;
    content: string;
    brief: { protagonist?: { name?: string }; worldDirection?: string } | null;
    existingNames?: {
      characters?: string[];
      locations?: string[];
      items?: string[];
      worldRules?: string[];
      foreshadowing?: string[];
    };
  }) => `You are a careful continuity editor. Read the chapter below and extract EVERY relevant fact
that should be tracked in the Story Bible for a long-form novel.
${CHINESE_OUTPUT_RULE}

Chapter ${ctx.chapterNumber}: ${ctx.title}
"""
${ctx.content}
"""
${
  ctx.existingNames && (ctx.existingNames.characters?.length || ctx.existingNames.locations?.length || ctx.existingNames.items?.length || ctx.existingNames.worldRules?.length || ctx.existingNames.foreshadowing?.length)
    ? `
Already tracked in the Story Bible (skip these names unless something material changed):
- Characters: ${(ctx.existingNames.characters || []).join(', ') || '(none)'}
- Locations: ${(ctx.existingNames.locations || []).join(', ') || '(none)'}
- Items: ${(ctx.existingNames.items || []).join(', ') || '(none)'}
- World rules: ${(ctx.existingNames.worldRules || []).join(', ') || '(none)'}
- Foreshadowing: ${(ctx.existingNames.foreshadowing || []).join(', ') || '(none)'}
`
    : ''
}
Return ONLY valid JSON with this exact shape:
{
  "characters": [{ "name": string, "role": string, "status": string }],
  "locations":  [{ "name": string, "description": string }],
  "items":      [{ "name": string, "owner": string | null, "description": string }],
  "events":     [{ "name": string, "description": string }],
  "worldRules": [{ "name": string, "description": string }],
  "characterStatusChanges": [{ "character": string, "before": string | null, "after": string }],
  "foreshadowing": [{ "name": string, "description": string }],
  "timeline":  [{ "name": string, "description": string, "order": number }]
}

Be thorough but not redundant. Only include items that actually appear in the chapter.`,

  checkConsistency: (ctx: {
    chapterNumber: number;
    title: string;
    content: string;
    outline?: { goal: string; summary: string };
    storyBible: {
      characters: Array<{ name: string; description: string; status: string }>;
      locations: Array<{ name: string; description: string }>;
      items: Array<{ name: string; description: string }>;
      worldRules: Array<{ name: string; description: string }>;
      foreshadowing: Array<{ name: string; description: string; status: string }>;
      timelineEvents: Array<{ name: string; description: string }>;
    };
    writingConstraints: string[];
  }) => `You are a meticulous continuity editor for a long-form novel.
Compare the chapter below against the project's Story Bible. Report any conflicts.
${CHINESE_OUTPUT_RULE}

Chapter ${ctx.chapterNumber}: ${ctx.title}
${ctx.outline ? `Outline goal: ${ctx.outline.goal}\nOutline summary: ${ctx.outline.summary}` : ''}

Chapter content:
"""
${ctx.content}
"""

Story Bible Characters:
${ctx.storyBible.characters.map((c) => `- ${c.name} (${c.status}): ${c.description}`).join('\n') || '(none)'}

Story Bible Locations:
${ctx.storyBible.locations.map((l) => `- ${l.name}: ${l.description}`).join('\n') || '(none)'}

Story Bible Items:
${ctx.storyBible.items.map((i) => `- ${i.name}: ${i.description}`).join('\n') || '(none)'}

Story Bible World Rules:
${ctx.storyBible.worldRules.map((r) => `- ${r.name}: ${r.description}`).join('\n') || '(none)'}

Story Bible Foreshadowing (open):
${ctx.storyBible.foreshadowing.map((f) => `- ${f.name} (${f.status}): ${f.description}`).join('\n') || '(none)'}

Story Bible Timeline:
${ctx.storyBible.timelineEvents.map((t) => `- ${t.name}: ${t.description}`).join('\n') || '(none)'}

Writing constraints:
${ctx.writingConstraints.map((c) => `- ${c}`).join('\n') || '(none)'}

Look for these issue types:
- character_status_conflict: a character's action contradicts their recorded status
- character_location_conflict: a character is in two impossible places
- item_ownership_conflict: an item is held by two characters or used inconsistently
- timeline_conflict: events happen in impossible order
- world_rule_conflict: a scene violates an established world rule
- unresolved_foreshadowing: foreshadowing that should be addressed but is ignored
- style_or_constraint_violation: prose violates a writing constraint

Return ONLY valid JSON with this exact shape:
{
  "issues": [
    {
      "severity": "critical" | "warning" | "info",
      "type": "...",
      "message": string,
      "evidence": [{ "source": "chapter" | "storyBible", "chapterNumber": number | null, "field": string | null, "quote": string }],
      "suggestions": [string]
    }
  ]
}

If there are no issues, return { "issues": [] }. Do not invent problems.`,

  generateFix: (ctx: {
    issue: {
      severity: string;
      type: string;
      message: string;
      evidence: Array<{ source: string; chapterNumber?: number; quote: string }>;
      suggestions: string[];
    };
    chapterContent: string;
  }) => `You are a senior fiction editor fixing a continuity issue.
${CHINESE_OUTPUT_RULE}

Issue:
- Type: ${ctx.issue.type}
- Severity: ${ctx.issue.severity}
- Message: ${ctx.issue.message}
- Evidence:
${ctx.issue.evidence.map((e) => `  - [${e.source}${e.chapterNumber ? ` ch.${e.chapterNumber}` : ''}] ${e.quote}`).join('\n')}
- Suggestions offered: ${ctx.issue.suggestions.join('; ') || '(none)'}

Chapter content (for context):
"""
${ctx.chapterContent.slice(0, 4000)}
"""

Return ONLY valid JSON with this exact shape:
{
  "explanation": string,
  "options": [
    { "title": string, "description": string, "patch": string }
  ],
  "recommended": number  // 0-based index into options
}

Provide exactly 3 distinct fix options. The "patch" should be a drop-in paragraph or sentence the author can paste in.`,
};

export type PromptKey = keyof Omit<typeof PROMPTS, never>;
