import OpenAI from "openai";
import { loadWorkspaceEnv } from "./extraction/load-env.js";

loadWorkspaceEnv();

const apiKey = process.env.ALIBABA_API_KEY;
const baseURL = process.env.ALIBABA_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const model = process.argv.includes("--model")
  ? process.argv[process.argv.indexOf("--model") + 1]
  : (process.env.QWEN_VL_MODEL ?? "qwen3-vl-32b-instruct");

if (!apiKey) {
  console.error("ALIBABA_API_KEY is not set in .env");
  process.exit(1);
}

const client = new OpenAI({ apiKey, baseURL });

try {
  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: 'Authentication smoke test. Return only this JSON: {"ok":true,"model_accessible":true}'
      }
    ]
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    console.error("Qwen returned an empty response");
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        model,
        baseURL,
        response: content
      },
      null,
      2
    )
  );
} catch (error) {
  const detail = error && typeof error === "object" && "status" in error ? error : undefined;
  console.error(
    JSON.stringify(
      {
        ok: false,
        model,
        baseURL,
        message: error instanceof Error ? error.message : String(error),
        status: detail && "status" in detail ? detail.status : undefined,
        code: detail && "code" in detail ? detail.code : undefined,
        type: detail && "type" in detail ? detail.type : undefined
      },
      null,
      2
    )
  );
  process.exit(1);
}
