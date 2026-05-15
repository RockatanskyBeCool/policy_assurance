import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";
import { PolicyAlignmentReportSchema, type PolicyAlignmentReport } from "./schemas.js";
import { buildPolicyAlignmentPrompt, POLICY_ALIGNMENT_SYSTEM_PROMPT, type PolicyAlignmentPromptInput } from "./policy-alignment-prompt.js";

export interface PolicyAlignmentLlmConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
}

export interface PolicyAlignmentAnalysisResult {
  report: PolicyAlignmentReport;
  rawOutput: string;
}

export class PolicyAlignmentService {
  private readonly client: OpenAI | undefined;

  constructor(private readonly config: PolicyAlignmentLlmConfig) {
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

  async analyse(input: PolicyAlignmentPromptInput): Promise<PolicyAlignmentAnalysisResult> {
    if (!this.client) {
      throw new Error("An LLM API key is required to run policy template alignment analysis");
    }

    const response = await this.client.chat.completions.create({
      model: this.config.model,
      temperature: 0,
      messages: [
        { role: "system", content: POLICY_ALIGNMENT_SYSTEM_PROMPT },
        { role: "user", content: buildPolicyAlignmentPrompt(input) }
      ]
    });

    const rawOutput = response.choices[0]?.message?.content;
    if (!rawOutput || Array.isArray(rawOutput)) {
      throw new Error("LLM returned an empty or unsupported policy alignment response");
    }

    return {
      rawOutput,
      report: parsePolicyAlignmentReport(rawOutput)
    };
  }
}

export function parsePolicyAlignmentReport(rawOutput: string): PolicyAlignmentReport {
  const repaired = jsonrepair(rawOutput);
  return PolicyAlignmentReportSchema.parse(JSON.parse(repaired));
}
