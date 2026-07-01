// Deterministic mock data for every AI function.
// Activated automatically when OPENAI_API_KEY is missing or the model returns invalid JSON.
// The goal is that the user can run the full product loop without configuring any API.

import type {
  ChapterGenerationContext,
  CreativeBrief,
  FactExtractionPayload,
  ConsistencyIssue,
  FixSuggestion,
  BibleRecord,
  ChapterOutline,
  BibleCategory,
  StoryBibleData,
} from '@/types/domain';
import { BIBLE_CATEGORIES } from '@/types/domain';

const now = () => new Date().toISOString();

const newId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

function pickGenre(rawIdea: string): string {
  const lower = rawIdea.toLowerCase();
  if (/(玄幻|修真|仙侠|江湖|武侠)/.test(rawIdea)) return '仙侠';
  if (/(科幻|space|robot|alien|星际|赛博|cyber|未来)/i.test(lower)) return '科幻';
  if (/(魔幻|魔法|巫师|fantasy|demon|dragon)/i.test(lower)) return '奇幻';
  if (/(悬疑|侦探|谋杀|mystery|detective|crime)/i.test(lower)) return '悬疑';
  if (/(爱情|romance|都市|恋爱)/.test(rawIdea)) return '都市言情';
  if (/(历史|古代|王朝|empire|kingdom)/.test(rawIdea)) return '历史';
  return '现代都市';
}

export function mockOptimizePrompt(input: {
  rawIdea: string;
  genre?: string;
  targetLength?: string;
  stylePreference?: string;
}): CreativeBrief {
  const genre = input.genre?.trim() || pickGenre(input.rawIdea);
  const raw = input.rawIdea.trim();
  const completeness =
    raw.length > 400 ? 72 : raw.length > 200 ? 58 : raw.length > 80 ? 42 : 28;

  return {
    completenessScore: completeness,
    refinedIdea: `${raw}\n\n这个故事从一个普通人在非常规情境下被迫做出选择开始，TA 原本平静的生活被一个看似偶然的事件打破。随着真相逐渐浮出水面，主角发现事件背后牵涉到一个远超自己想象的势力网络。在一次次抉择中，TA 必须面对自己内心的恐惧、过去的创伤以及对所爱之人的责任。最终，主角将以某种代价换得真相，故事在余韵中结束，留给读者关于勇气、牺牲与信念的回味空间。`,
    genre,
    tone: '沉稳、内敛、克制中带有锋芒',
    targetAudience: '18-40 岁喜欢长篇阅读、对人物心理与世界观深度有要求的读者',
    protagonist: {
      name: '沈砚',
      summary:
        '表面上是普通的调查员，实则背负一段被抹去的过去。擅长观察、不轻易信任他人，但在与伙伴并肩作战的过程中逐渐学会依靠他人。',
    },
    coreConflict:
      '个人对真相的追寻 vs. 一个试图通过信息封锁与记忆篡改来维持秩序的强大组织。',
    worldDirection:
      '一个表面与现实世界高度相似、底层却被某些"看不见的规则"操控的近未来社会。',
    writingConstraints: [
      '每章字数 3000-5000 字，保持稳定节奏',
      '避免"爽文"式快速反转，注重心理与伏笔铺垫',
      '对白不超过正文的 30%',
      '每章至少埋一处伏笔或回收一处早期伏笔',
      '关键人物出场需有具体可感的环境描写',
    ],
    missingInfo: [
      '故事发生的时间段（现代/近未来/架空）',
      '主角的核心动机（复仇/自证/守护/追寻真相）',
      '反派阵营的真正诉求',
      '是否存在超自然/科幻元素',
      '主要次要角色数量与关系网',
    ],
    directions: [
      '硬核悬疑路线：以调查与解谜为主线，强化逻辑链与反转，强调"信息差"张力。',
      '人物群像路线：以主角团队的多视角展开，强化情感与道德冲突，慢热但人物鲜明。',
      '史诗世界观路线：融入宏大设定与势力对抗，主角成长线贯穿全篇，节奏更长线。',
    ],
    followUpQuestions: [
      '主角失去的记忆具体是什么？谁造成的？',
      '组织名称与运作机制是什么？',
      '故事最终的结局基调是悲剧、开放式还是救赎式？',
      '是否需要安排一条感情线？走向如何？',
    ],
  };
}

export function mockGenerateOutline(brief: CreativeBrief, totalChapters = 8) {
  const chapters: Array<{
    chapterNumber: number;
    title: string;
    goal: string;
    summary: string;
    requiredBeats: string[];
    relatedCharacters: string[];
    relatedForeshadowing: string[];
  }> = [];

  const beatNames = ['触发', '入局', '试探', '受挫', '觉醒', '抉择', '高潮', '余波'];
  for (let i = 1; i <= totalChapters; i++) {
    const beat = beatNames[i - 1] || `第${i}拍`;
    chapters.push({
      chapterNumber: i,
      title: `第${i}章 · ${beat}`,
      goal: `推进「${brief.protagonist.name || '主角'}」的「${beat}」阶段，呈现其在当前压力下的关键反应。`,
      summary: `本章围绕「${beat}」展开，主角面对新的信息或冲突，需要在内外压力下做出关键选择，逐步逼近「${brief.coreConflict}」的核心。`,
      requiredBeats: [
        `主角面对与「${beat}」相关的关键事件`,
        '至少一处新角色登场或已有角色展现新面向',
        '埋下与前文呼应的伏笔或回收一条旧伏笔',
      ],
      relatedCharacters: [brief.protagonist.name || '沈砚'],
      relatedForeshadowing: i === 1 ? ['失落的信物'] : i === totalChapters ? ['失落的信物'] : [],
    });
  }
  return { chapters };
}

export function mockGenerateChapter(ctx: ChapterGenerationContext): {
  content: string;
  summary: string;
} {
  const title = `第${ctx.chapterNumber}章`;
  const beats = ctx.outline.requiredBeats.length
    ? ctx.outline.requiredBeats
    : ['建立场景', '引入冲突', '埋下伏笔'];
  const character = ctx.characters[0]?.name || ctx.outline.relatedCharacters[0] || '主角';
  const setting = ctx.locations[0]?.name || '城市一角';

  const content = `${title} · ${ctx.outline.goal || '关键转折'}

${setting}的夜比想象中更安静。

${character}站在窗前，看着远处零星的灯火，脑海里不断回放着白天发生的事——那些本不应该出现的细节，像针一样扎进他的思绪。他原本以为自己已经把过去埋得很深，可现实却一遍又一遍地提醒他：有些东西从未真正消失。

"你必须做出选择。"——不知道是谁的话，此刻却格外清晰。

他深吸一口气，闭上眼睛，让思绪沿着线索重新走了一遍。从最初的那个"偶然"开始，到今天这个不得不面对的局面，他意识到自己早已站在了某个巨大棋局的边缘。退后一步是安全的，向前一步是未知的。他向来不喜欢未知。

但这次不一样。

他转身走向书桌，拉开抽屉，取出那只已经有些磨损的旧物——那是他唯一还保留着的、和过去有关的信物。它看起来毫不起眼，却让他的手指微微发抖。他知道，揭开它的故事，就意味着必须面对自己一直逃避的东西。

夜更深了。

他终于做出了决定。

明天，他会去找那个人。

[本章关键节拍]
${beats.map((b) => `· ${b}`).join('\n')}

[未回收伏笔]
${ctx.foreshadowing.length ? ctx.foreshadowing.map((f) => `· ${f.name}`).join('\n') : '· 暂无'}
`;

  const summary = `${character} 在 ${setting} 面对来自过去的线索，最终决定不再回避，准备主动接触相关人物。本章确立了本章核心节拍并埋下后续伏笔。`;
  return { content, summary };
}

export function mockContinueChapter(ctx: {
  chapterNumber: number;
  title: string;
  existingContent: string;
  previousSummary: string;
  characters: Array<{ name: string; description: string; status: string }>;
}) {
  const character = ctx.characters[0]?.name || '主角';
  const content = `\n\n第二天清晨，${character} 比约定时间早到了半小时。\n\n他选了一个靠窗的位置坐下，把那只旧物放在桌上，盯着它看了很久。咖啡凉了又续，续了又凉。来往的行人匆匆，没有人注意到角落里这个安静的人。\n\n他想起很多年前，也是在这样一个早晨，有人对他说过一句话。\n\n"你永远不会是一个人。"\n\n那时候他不信。现在，他仍然不完全相信。但至少，他愿意试一试。\n\n门铃响起，约定的人到了。`;

  const summary = `${character} 主动赴约，进入关键对话的准备阶段，过去与现在的关系在内心开始松动。`;
  return { content, summary };
}

export function mockPolishText(text: string) {
  // Simple "polish": tighten whitespace, ensure ends with period-like punctuation.
  const polished = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { content: polished };
}

export function mockExtractFacts(ctx: {
  chapterNumber: number;
  content: string;
  existingNames?: {
    characters?: string[];
    locations?: string[];
    items?: string[];
    worldRules?: string[];
    foreshadowing?: string[];
  };
}): FactExtractionPayload {
  // Heuristic extraction from content for mock data.
  const existingCharacters = new Set(ctx.existingNames?.characters ?? []);
  const existingLocations = new Set(ctx.existingNames?.locations ?? []);
  const characters = Array.from(
    new Set(
      (ctx.content.match(/[\u4e00-\u9fa5]{2,3}(?=的|在|说|想|看|走|来|去|坐|站|听)/g) || [])
        .filter((n) => !existingCharacters.has(n))
        .slice(0, 6)
    )
  );
  const locations = Array.from(
    new Set(
      (ctx.content.match(/[\u4e00-\u9fa5]{2,4}(?=的|里|中|旁|处|间)/g) || [])
        .filter((n) => !existingLocations.has(n))
        .slice(0, 4)
    )
  );
  return {
    characters: characters.map((name) => ({
      name,
      role: '次要角色',
      status: '活跃',
    })),
    locations: locations.map((name) => ({
      name,
      description: `在第 ${ctx.chapterNumber} 章中首次出现`,
    })),
    items: [
      { name: '旧物', owner: characters[0] || '主角', description: '与过去相关的一件信物' },
    ],
    events: [
      {
        name: `第${ctx.chapterNumber}章关键决定`,
        description: '主角做出了一个改变后续走向的关键决定',
      },
    ],
    worldRules: [],
    characterStatusChanges: [
      {
        character: characters[0] || '主角',
        before: '被动、回避',
        after: '主动、面对',
      },
    ],
    foreshadowing: [
      {
        name: '旧物的来历',
        description: '尚未揭示的旧物真实来历，可能与核心冲突直接相关',
      },
    ],
    timeline: [
      {
        name: `第${ctx.chapterNumber}章 · 夜`,
        description: '主角在夜里做出决定',
        order: 1,
      },
      {
        name: `第${ctx.chapterNumber}章 · 翌晨`,
        description: '主角赴约',
        order: 2,
      },
    ],
  };
}

export function mockCheckConsistency(ctx: {
  chapterNumber: number;
  content: string;
  storyBible: {
    characters: BibleRecord[];
    locations: BibleRecord[];
    items: BibleRecord[];
    worldRules: BibleRecord[];
    foreshadowing: BibleRecord[];
    timelineEvents: BibleRecord[];
  };
  writingConstraints: string[];
}): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  // Heuristic 1: any character marked as 已故 (deceased) appearing in the prose triggers a conflict.
  for (const c of ctx.storyBible.characters) {
    if (c.status === 'deceased' && ctx.content.includes(c.name)) {
      issues.push({
        severity: 'critical',
        type: 'character_status_conflict',
        message: `角色「${c.name}」在 Story Bible 中标记为已故，但本章正文再次出现。`,
        evidence: [
          {
            source: 'storyBible',
            field: 'characters',
            quote: `${c.name} (${c.status})`,
          },
          {
            source: 'chapter',
            chapterNumber: ctx.chapterNumber,
            quote: ctx.content.split('\n').find((l) => l.includes(c.name))?.slice(0, 80) || c.name,
          },
        ],
        suggestions: [
          `移除「${c.name}」在本章的出场，或改为闪回/回忆/他人提及。`,
          `如果剧情需要，临时将「${c.name}」在 Story Bible 中标记为「失联 / 假死」。`,
        ],
      });
    }
  }

  // Heuristic 2: more than 3 constraints violation demo issue.
  if (ctx.writingConstraints.length > 0) {
    issues.push({
      severity: 'info',
      type: 'style_or_constraint_violation',
      message: '建议确认本章是否满足所有写作约束。',
      evidence: [
        {
          source: 'storyBible',
          field: 'writingConstraints',
          quote: ctx.writingConstraints.slice(0, 2).join('；'),
        },
      ],
      suggestions: ['逐条对照写作约束，必要时调整篇幅、节奏或对白比例。'],
    });
  }

  // Heuristic 3: any open foreshadowing that the user hasn't touched recently.
  if (ctx.storyBible.foreshadowing.length > 0) {
    const first = ctx.storyBible.foreshadowing[0];
    if (first.status === 'active' && !ctx.content.includes(first.name)) {
      issues.push({
        severity: 'warning',
        type: 'unresolved_foreshadowing',
        message: `伏笔「${first.name}」已开启但本章未回应或推进，建议安排呼应。`,
        evidence: [
          {
            source: 'storyBible',
            field: 'foreshadowing',
            quote: `${first.name}: ${first.description}`,
          },
        ],
        suggestions: [
          '在本章末尾加入一个细微呼应（物品、对话、视角切换）。',
          '或在未来 1-2 章内安排一次明示回收。',
        ],
      });
    }
  }

  return issues;
}

export function mockGenerateFix(issue: ConsistencyIssue): FixSuggestion {
  return {
    explanation: `针对「${issue.type}」类型的连续性问题，建议优先在不破坏主线节奏的前提下做出最小修改。下面提供三种方案以供选择。`,
    options: [
      {
        title: '最小改动：在原句后追加一行说明',
        description: '保留原句，附加一行简短补充，澄清状态或位置。',
        patch: '（补丁：此处可插入一句澄清当前角色状态/位置的句子。）',
      },
      {
        title: '中等改动：重写本段 1-2 句',
        description: '将相关句子重写为符合 Story Bible 的新表述。',
        patch: '他并没有真正离开过——他只是换了一种方式在场。',
      },
      {
        title: '结构改动：将场景改为回忆/旁白',
        description: '把出现冲突的角色出现段落改写为回忆或他人转述。',
        patch: '多年后他依然记得那个早晨，仿佛一切就发生在昨天——但那已是另一个时代的事了。',
      },
    ],
    recommended: 0,
  };
}

export function mockStoryFoundation(brief: CreativeBrief): StoryBibleData {
  const stamp = now();
  const record = (
    name: string,
    description: string,
    attributes?: BibleRecord['attributes']
  ): BibleRecord => ({
    id: newId('bible'),
    name,
    description,
    status: 'active',
    updatedAt: stamp,
    attributes,
  });

  const partial: Partial<Record<BibleCategory, BibleRecord[]>> = {
    characters: [
      record(brief.protagonist.name || '沈砚', brief.protagonist.summary, { role: '主角' }),
      record('林澈', '主角的同行者，理性、克制，掌握部分关键线索。', { role: '搭档' }),
      record('未知对手', brief.coreConflict, { role: '对立面' }),
    ],
    locations: [record('城市档案馆', brief.worldDirection)],
    items: [record('旧物', '与主角过去有关的信物，尚未揭示来历。')],
    worldRules: [record('信息封锁', '组织通过删改公共记录与私人记忆来维持秩序。')],
    plotThreads: [record('失落的记忆', '主角试图找回被抹去的过去。')],
    foreshadowing: [record('失落的信物', '主角随身携带的旧物将在后续揭示关键真相。')],
    timelineEvents: [record('开篇事件', '主角原本平静的生活被打破。', { order: 1 })],
  };

  return Object.fromEntries(
    BIBLE_CATEGORIES.map((c) => [c, partial[c] ?? []])
  ) as StoryBibleData;
}
