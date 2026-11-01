import { NextRequest, NextResponse } from 'next/server';
import type { MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { supabaseAdmin } from '@/lib/supabase';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { farmer_id, crop, growth_stage, lat, lon } = body;

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${request.headers.get('host')}`;

  // Dynamically import to avoid build issues
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const { buildSystemPrompt } = await import('@/lib/agent/prompts');
  const { AGENT_TOOLS, executeTool } = await import('@/lib/agent/tools');
  const { runSafetyCheck } = await import('@/lib/agent/safety');

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const messages: MessageParam[] = [
    {
      role: 'user',
      content: `I am a ${crop} farmer in Guntur, Andhra Pradesh. My crop is at the ${growth_stage} stage. My farm is at coordinates: latitude ${lat}, longitude ${lon}.

Please fetch the live weather, soil moisture, and today's mandi price for ${crop}, then tell me the single most important action I should take today. Speak to me in Telugu.`,
    },
  ];

  let weatherSnapshot: Record<string, unknown> = {};
  let soilSnapshot: Record<string, unknown> = {};
  let priceSnapshot: Record<string, unknown> = {};
  let finalTeluguAdvice = '';
  let finalEnglishSummary = '';
  let reasoningChain = '';

  try {
    // Tool-use agentic loop
    let continueLoop = true;
    let loopCount = 0;

    while (continueLoop && loopCount < 6) {
      loopCount++;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: buildSystemPrompt(crop, growth_stage),
        tools: AGENT_TOOLS,
        messages,
      });

      // Add assistant's response to message history
      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'tool_use') {
        // Execute each tool call
        const toolResults: ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === 'tool_use') {
            const result = await executeTool(
              block.name,
              block.input as Record<string, unknown>,
              baseUrl
            );

            // Capture snapshots for DB storage
            try {
              const parsed = JSON.parse(result);
              if (block.name === 'get_weather_data') weatherSnapshot = parsed;
              if (block.name === 'get_soil_data') soilSnapshot = parsed;
              if (block.name === 'get_mandi_price') priceSnapshot = parsed;
            } catch { /* ignore parse errors */ }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        messages.push({ role: 'user', content: toolResults });
      } else {
        // Final text response
        continueLoop = false;
        const textBlock = response.content.find(b => b.type === 'text');
        const fullText = textBlock && textBlock.type === 'text' ? textBlock.text : '';

        // Parse structured output
        const teluguMatch = fullText.split('---TELUGU_ACTION---');
        const englishMatch = fullText.split('---ENGLISH_SUMMARY---');

        if (teluguMatch.length > 1) {
          reasoningChain = teluguMatch[0].trim();
          const afterTelugu = teluguMatch[1];
          const parts = afterTelugu.split('---ENGLISH_SUMMARY---');
          finalTeluguAdvice = parts[0].trim();
          finalEnglishSummary = parts[1]?.trim() || '';
        } else {
          // Fallback: use full text
          finalTeluguAdvice = fullText;
          finalEnglishSummary = '';
          reasoningChain = '';
        }
      }
    }

    // Run safety check on the advice
    const safetyResult = runSafetyCheck(
      finalTeluguAdvice,
      weatherSnapshot as { rainfall_24h?: number; max_temp?: number },
      soilSnapshot as { soil_moisture_percent?: number }
    );

    finalTeluguAdvice = safetyResult.filteredAdvice;

    // Save to Supabase advice_history
    let adviceId: string | null = null;
    try {
      const { data } = await supabaseAdmin.from('advice_history').insert({
        farmer_id: farmer_id || null,
        weather_snapshot: weatherSnapshot,
        soil_snapshot: soilSnapshot,
        price_snapshot: priceSnapshot,
        advice_telugu: finalTeluguAdvice,
        advice_english: finalEnglishSummary,
      }).select('id').single();
      adviceId = data?.id || null;
    } catch { /* non-fatal */ }

    return NextResponse.json({
      success: true,
      advice_id: adviceId,
      advice_telugu: finalTeluguAdvice,
      advice_english: finalEnglishSummary,
      reasoning_chain: reasoningChain,
      safety_warnings: safetyResult.warnings,
      data_used: {
        weather: weatherSnapshot,
        soil: soilSnapshot,
        price: priceSnapshot,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Agent error:', err);
    return NextResponse.json(
      { error: String(err), success: false },
      { status: 500 }
    );
  }
}
