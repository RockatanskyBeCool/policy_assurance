import fs from "node:fs/promises";
import OpenAI from "openai";
import type { CandidateSection, PageImageRef } from "./types.js";
import { buildExtractionPrompt, buildRepairPrompt, SYSTEM_PROMPT } from "./policy-extraction-prompt.js";

export interface QwenExtractionConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
}

export class QwenExtractionService {
  private readonly client: OpenAI | undefined;

  constructor(private readonly config: QwenExtractionConfig) {
    if (config.apiKey) {
      this.client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl
      });
    }
  }

  get configured(): boolean {
    return Boolean(this.client);
  }

  async extract(sections: CandidateSection[], images: PageImageRef[]): Promise<string> {
    if (!this.client) {
      throw new Error("ALIBABA_API_KEY is required to call Qwen extraction");
    }
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: buildExtractionPrompt(sections, images) }
    ];
    for (const image of images) {
      content.push({
        type: "image_url",
        image_url: {
          url: await imageToDataUrl(image)
        }
      });
    }

    const response = await this.client.chat.completions.create({
      model: this.config.model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content }
      ]
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw || Array.isArray(raw)) {
      throw new Error("Qwen returned an empty or unsupported response");
    }
    return raw;
  }

  async repair(rawOutput: string, validationError: string): Promise<string> {
    if (!this.client) {
      throw new Error("ALIBABA_API_KEY is required to call Qwen repair");
    }
    const response = await this.client.chat.completions.create({
      model: this.config.model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildRepairPrompt(rawOutput, validationError) }
      ]
    });
    const raw = response.choices[0]?.message?.content;
    if (!raw || Array.isArray(raw)) {
      throw new Error("Qwen returned an empty or unsupported repair response");
    }
    return raw;
  }
}

async function imageToDataUrl(image: PageImageRef): Promise<string> {
  const base64 = (await fs.readFile(image.path)).toString("base64");
  return `data:${image.mimeType};base64,${base64}`;
}
