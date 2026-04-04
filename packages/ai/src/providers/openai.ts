import OpenAI from "openai";

import type {
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  LLMProvider,
  StreamEvent,
} from "../types";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey?: string, baseUrl?: string, defaultModel?: string) {
    this.client = new OpenAI({
      apiKey: apiKey ?? process.env.OPENAI_API_KEY,
      baseURL: baseUrl,
    });
    this.defaultModel = defaultModel ?? "gpt-4o";
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model ?? this.defaultModel,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
    });

    const choice = response.choices[0];
    return {
      content: choice?.message?.content ?? "",
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    };
  }

  async *streamComplete(request: CompletionRequest): AsyncIterable<StreamEvent> {
    const stream = await this.client.chat.completions.create({
      model: request.model ?? this.defaultModel,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      stream: true,
    });

    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield { type: "content_delta", content: delta };
      }

      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens;
        completionTokens = chunk.usage.completion_tokens;
      }
    }

    yield {
      type: "done",
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const response = await this.client.embeddings.create({
      model: request.model ?? "text-embedding-3-small",
      input: request.input,
    });

    return {
      embeddings: response.data.map((d) => d.embedding),
      model: response.model,
      usage: {
        totalTokens: response.usage.total_tokens,
      },
    };
  }
}
