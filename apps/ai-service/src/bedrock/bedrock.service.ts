import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type SystemContentBlock,
} from '@aws-sdk/client-bedrock-runtime';

export interface ConverseInput {
  systemPrompt: string;
  systemPromptId: string;        // for prompt-cache key + audit
  userMessages: Message[];
  modelId?: string;              // overrides default
  maxTokens?: number;
  temperature?: number;
  cacheSystemPrompt?: boolean;   // true → request prompt caching
}

export interface ConverseResult {
  text: string;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadInputTokens?: number;
    cacheWriteInputTokens?: number;
  };
  model: string;
  latencyMs: number;
}

/**
 * Thin wrapper around Bedrock Converse with cost / latency tracking and
 * prompt-cache hooks. Per-tenant budget caps live in the calling service —
 * this module just executes inferences.
 */
@Injectable()
export class BedrockService {
  private readonly logger = new Logger(BedrockService.name);
  private readonly client: BedrockRuntimeClient;
  private readonly defaultModel: string;

  constructor(private readonly config: ConfigService) {
    this.client = new BedrockRuntimeClient({
      region: this.config.get<string>('AWS_REGION') ?? 'ap-southeast-1',
    });
    this.defaultModel =
      this.config.get<string>('BEDROCK_MODEL_SONNET') ??
      'anthropic.claude-sonnet-4-6-20260101-v1:0';
  }

  async converse(input: ConverseInput): Promise<ConverseResult> {
    const start = Date.now();
    const modelId = input.modelId ?? this.defaultModel;

    const system: SystemContentBlock[] = input.cacheSystemPrompt
      ? [
          { text: input.systemPrompt },
          // Anthropic prompt-cache breakpoint marker
          { cachePoint: { type: 'default' } },
        ]
      : [{ text: input.systemPrompt }];

    const cmd = new ConverseCommand({
      modelId,
      system,
      messages: input.userMessages,
      inferenceConfig: {
        maxTokens: input.maxTokens ?? 1024,
        temperature: input.temperature ?? 0.2,
      },
    });

    const response = await this.client.send(cmd);
    const latencyMs = Date.now() - start;

    const text =
      response.output?.message?.content
        ?.map((block) => block.text ?? '')
        .join('') ?? '';

    const usage = response.usage ?? {};

    this.logger.log(
      `converse model=${modelId} prompt=${input.systemPromptId} ` +
        `tokens=${usage.inputTokens ?? 0}/${usage.outputTokens ?? 0} ` +
        `cache=${usage.cacheReadInputTokens ?? 0}/${usage.cacheWriteInputTokens ?? 0} ` +
        `latency=${latencyMs}ms`,
    );

    return {
      text,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens,
        cacheWriteInputTokens: usage.cacheWriteInputTokens,
      },
      model: modelId,
      latencyMs,
    };
  }
}
