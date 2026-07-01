/**
 * OpenAI chat for schedule assistant — optional layer over deterministic planner.
 */

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export type ScheduleAssistantChatResult = {
  reply: string;
  aiEnabled: boolean;
};

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

export async function scheduleAssistantChat(input: {
  locale: string;
  userMessage: string;
  history: ChatMessage[];
  planContext: string;
}): Promise<ScheduleAssistantChatResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      aiEnabled: false,
      reply:
        input.locale === 'ar'
          ? 'مساعد الذكاء الاصطناعي غير مفعّل (OPENAI_API_KEY غير موجود). يمكنك استخدام الخطة المقترحة أعلاه.'
          : 'AI assistant is not configured (OPENAI_API_KEY missing). Use the proposed plan above.',
    };
  }

  const systemPrompt =
    input.locale === 'ar'
      ? `أنت مساعد جدولة دوام. القوانين: سبت–خميس AM ≥ 2، PM ≥ AM، PM ≥ 2. Split حتى 2 لكل موظف/أسبوع. الجمعة مساءً فقط. لا تضف موظفين من فروع أخرى — التغطية الخارجية يدوية فقط. اشرح الخطة بالعربية ولا تخترع قواعد.`
      : `You are a retail schedule assistant. Rules: Sat–Thu AM ≥ 2, PM ≥ AM, PM ≥ 2. Split max 2 per employee per week. Friday PM-only. Never add staff from other branches — external coverage is manual only. Explain the plan; do not invent rules.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `Current plan context:\n${input.planContext}` },
    ...input.history.filter((m) => m.role !== 'system').slice(-8),
    { role: 'user', content: input.userMessage },
  ];

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 800,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        aiEnabled: true,
        reply:
          input.locale === 'ar'
            ? `تعذّر الاتصال بخدمة AI (${res.status}). ${errText.slice(0, 120)}`
            : `AI request failed (${res.status}). ${errText.slice(0, 120)}`,
      };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = data.choices?.[0]?.message?.content?.trim();
    return {
      aiEnabled: true,
      reply: reply || (input.locale === 'ar' ? 'لم أتمكن من إنشاء رد.' : 'No reply generated.'),
    };
  } catch (e) {
    return {
      aiEnabled: true,
      reply: e instanceof Error ? e.message : 'AI error',
    };
  }
}
