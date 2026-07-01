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
      ? `أنت مساعد جدولة دوام لمتجر. اشرح الخطة المقترحة بوضوح بالعربية. لا تخترع قواعد — التزم بسياق الخطة. قواعد ثابتة: الجمعة PM فقط، PM≥2 (سبت-خميس)، احترم الإجازات. اقترح فقط ما هو في الخطة أو اشرح لماذا لا يمكن الإصلاح.`
      : `You are a retail schedule assistant. Explain the proposed plan clearly. Do not invent rules — follow the plan context. Fixed rules: Friday PM-only, PM≥2 (Sat-Thu), respect leave. Only suggest what is in the plan or explain unresolved issues.`;

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
