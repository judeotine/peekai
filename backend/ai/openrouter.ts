import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { secret } from "encore.dev/config";
import { user } from "~encore/clients";

const openRouterKey = secret("OpenRouterKey");

export interface AskQuestionRequest {
  question: string;
  context?: {
    pageTitle?: string;
    pageUrl?: string;
    pageDomain?: string;
    surroundingText?: string;
    selectedText?: string;
  };
  model?: string;
  stream?: boolean;
}

export interface AskQuestionResponse {
  answer: string;
  model: string;
  responseTimeMs: number;
  tokensUsed?: number;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

// Asks a question using OpenRouter AI models
export const askQuestion = api<AskQuestionRequest, AskQuestionResponse>(
  { expose: true, method: "POST", path: "/ask", auth: true },
  async (req) => {
    const auth = getAuthData()!;
    const startTime = Date.now();

    // Check usage limits
    const usage = await user.getUsageStats();
    const limits = getTierLimits(usage.tier);
    
    if (usage.dailyUsage >= limits.daily) {
      throw APIError.resourceExhausted("daily query limit exceeded");
    }

    // Prepare the prompt with context
    const prompt = buildContextualPrompt(req.question, req.context);
    const model = req.model || getDefaultModel(usage.tier);

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterKey()}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://peekai.app",
          "X-Title": "PeekAI Browser Extension",
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "system",
              content: "You are PeekAI, a helpful AI assistant that provides accurate, contextual answers to questions about web content. Be concise but thorough, and format your responses clearly with markdown when appropriate."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = await response.json();
      const answer = data.choices[0]?.message?.content || "No response generated";
      const responseTimeMs = Date.now() - startTime;

      // Update usage
      await updateUserUsage(auth.userID);

      // Save to history
      await saveQueryHistory({
        userId: auth.userID,
        question: req.question,
        answer: answer,
        pageTitle: req.context?.pageTitle,
        pageUrl: req.context?.pageUrl,
        pageDomain: req.context?.pageDomain,
        contextText: req.context?.surroundingText,
        modelUsed: model,
        responseTimeMs: responseTimeMs,
      });

      return {
        answer,
        model,
        responseTimeMs,
        tokensUsed: data.usage?.total_tokens,
      };
    } catch (error) {
      throw APIError.internal("failed to get AI response", error);
    }
  }
);

// Streams a question response using OpenRouter AI models
export const askQuestionStream = api.streamOut<AskQuestionRequest, StreamChunk>(
  { expose: true, path: "/ask/stream", auth: true },
  async (req, stream) => {
    const auth = getAuthData()!;
    const startTime = Date.now();

    // Check usage limits
    const usage = await user.getUsageStats();
    const limits = getTierLimits(usage.tier);
    
    if (usage.dailyUsage >= limits.daily) {
      throw APIError.resourceExhausted("daily query limit exceeded");
    }

    const prompt = buildContextualPrompt(req.question, req.context);
    const model = req.model || getDefaultModel(usage.tier);

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterKey()}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://peekai.app",
          "X-Title": "PeekAI Browser Extension",
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "system",
              content: "You are PeekAI, a helpful AI assistant that provides accurate, contextual answers to questions about web content. Be concise but thorough, and format your responses clearly with markdown when appropriate."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1000,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      let fullAnswer = "";
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                await stream.send({ content: "", done: true });
                break;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices[0]?.delta?.content || "";
                if (content) {
                  fullAnswer += content;
                  await stream.send({ content, done: false });
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Update usage and save history
      await updateUserUsage(auth.userID);
      await saveQueryHistory({
        userId: auth.userID,
        question: req.question,
        answer: fullAnswer,
        pageTitle: req.context?.pageTitle,
        pageUrl: req.context?.pageUrl,
        pageDomain: req.context?.pageDomain,
        contextText: req.context?.surroundingText,
        modelUsed: model,
        responseTimeMs: Date.now() - startTime,
      });

    } catch (error) {
      throw APIError.internal("failed to stream AI response", error);
    } finally {
      await stream.close();
    }
  }
);

function buildContextualPrompt(question: string, context?: AskQuestionRequest['context']): string {
  let prompt = question;

  if (context) {
    const contextParts = [];
    
    if (context.pageTitle) {
      contextParts.push(`Page: ${context.pageTitle}`);
    }
    
    if (context.pageDomain) {
      contextParts.push(`Domain: ${context.pageDomain}`);
    }
    
    if (context.selectedText) {
      contextParts.push(`Selected text: "${context.selectedText}"`);
    }
    
    if (context.surroundingText) {
      contextParts.push(`Context: ${context.surroundingText.slice(0, 500)}...`);
    }

    if (contextParts.length > 0) {
      prompt = `Context:\n${contextParts.join('\n')}\n\nQuestion: ${question}`;
    }
  }

  return prompt;
}

function getDefaultModel(tier: string): string {
  switch (tier) {
    case "premium":
      return "anthropic/claude-3-opus";
    case "student_pro":
      return "openai/gpt-4-turbo";
    default:
      return "openai/gpt-3.5-turbo";
  }
}

function getTierLimits(tier: string): { daily: number; monthly: number } {
  switch (tier) {
    case "free":
      return { daily: 10, monthly: 300 };
    case "student_pro":
      return { daily: 200, monthly: 6000 };
    case "premium":
      return { daily: 1000, monthly: 30000 };
    default:
      return { daily: 10, monthly: 300 };
  }
}

async function updateUserUsage(userId: string): Promise<void> {
  const { userDB } = await import("../user/db");
  
  await userDB.exec`
    UPDATE profiles 
    SET 
      daily_usage = daily_usage + 1,
      monthly_usage = monthly_usage + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${userId}
  `;
}

interface SaveQueryHistoryParams {
  userId: string;
  question: string;
  answer: string;
  pageTitle?: string;
  pageUrl?: string;
  pageDomain?: string;
  contextText?: string;
  modelUsed: string;
  responseTimeMs: number;
}

async function saveQueryHistory(params: SaveQueryHistoryParams): Promise<void> {
  const { userDB } = await import("../user/db");
  
  await userDB.exec`
    INSERT INTO query_history (
      user_id, question, answer, page_title, page_url, page_domain,
      context_text, model_used, response_time_ms
    ) VALUES (
      ${params.userId}, ${params.question}, ${params.answer}, ${params.pageTitle},
      ${params.pageUrl}, ${params.pageDomain}, ${params.contextText},
      ${params.modelUsed}, ${params.responseTimeMs}
    )
  `;
}
