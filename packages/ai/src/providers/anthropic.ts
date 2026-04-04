import Anthropic from "@anthropic-ai/sdk";

import type { CompletionRequest, CompletionResponse, LLMProvider, StreamEvent } from "../types";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private defaultModel: string;

  constructor(apiKey?: string, defaultModel?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    this.defaultModel = defaultModel ?? "claude-sonnet-4-20250514";
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const systemMessage = request.messages.find((m) => m.role === "system");
    const nonSystemMessages = request.messages.filter((m) => m.role !== "system");

    const response = await this.client.messages.create({
      model: request.model ?? this.defaultModel,
      max_tokens: request.maxTokens ?? 4096,
      system: systemMessage?.content,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      temperature: request.temperature ?? 0.7,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return {
      content: textBlock?.text ?? "",
      model: response.model,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  async *streamComplete(request: CompletionRequest): AsyncIterable<StreamEvent> {
    const systemMessage = request.messages.find((m) => m.role === "system");
    const nonSystemMessages = request.messages.filter((m) => m.role !== "system");

    const stream = this.client.messages.stream({
      model: request.model ?? this.defaultModel,
      max_tokens: request.maxTokens ?? 4096,
      system: systemMessage?.content,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      temperature: request.temperature ?? 0.7,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "content_delta", content: event.delta.text };
      }
    }

    const finalMessage = await stream.finalMessage();
    yield {
      type: "done",
      usage: {
        promptTokens: finalMessage.usage.input_tokens,
        completionTokens: finalMessage.usage.output_tokens,
        totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
      },
    };
  }
}
