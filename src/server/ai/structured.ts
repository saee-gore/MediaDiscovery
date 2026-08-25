/**
 * Structured LLM output with validation and repair.
 *
 * Small local models produce *mostly* valid JSON. "Mostly" is not a contract,
 * so nothing reaches the rest of the system until it has passed a Zod schema:
 *
 *   1. Ask in JSON mode with an explicit schema description.
 *   2. Salvage the JSON object from whatever prose wraps it.
 *   3. Validate. On failure, show the model its own output plus the validation
 *      errors and ask once for a correction.
 *   4. Still invalid -> throw LLM_INVALID_OUTPUT, and the caller falls back to
 *      a deterministic path.
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { z, ZodTypeAny } from "zod";

import { getJsonModel, withLlmTimeout } from "@/server/ai/ollama";
import { llmInvalidOutput } from "@/server/lib/errors";
import { logger, timed } from "@/server/lib/logger";

/**
 * Pull the first balanced JSON object or array out of a string. Handles the
 * common failure modes: markdown fences, a leading "Here is the JSON:", and
 * trailing commentary after the closing brace.
 */
export function extractJson(text: string): string | null {
  const withoutFences = text.replace(/```(?:json)?/gi, "").trim();
  const start = withoutFences.search(/[{[]/);
  if (start === -1) return null;

  const open = withoutFences[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < withoutFences.length; i += 1) {
    const char = withoutFences[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return withoutFences.slice(start, i + 1);
    }
  }
  return null;
}

function contentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string" ? part : typeof part === "object" && part && "text" in part
          ? String((part as { text: unknown }).text)
          : "",
      )
      .join("");
  }
  return String(content ?? "");
}

export interface StructuredOptions<S extends ZodTypeAny> {
  name: string;
  system: string;
  user: string;
  schema: S;
  /** Extra guidance appended to the system prompt describing the JSON shape. */
  shape: string;
}

export async function callStructured<S extends ZodTypeAny>({
  name,
  system,
  user,
  schema,
  shape,
}: StructuredOptions<S>): Promise<z.infer<S>> {
  const model = getJsonModel();
  const systemPrompt = `${system}\n\nRespond with a single JSON object and nothing else. Shape:\n${shape}`;

  const invoke = async (messages: Array<SystemMessage | HumanMessage>) => {
    const response = await withLlmTimeout(name, () => model.invoke(messages));
    return contentToString(response.content);
  };

  return timed(`llm:${name}`, async () => {
    const first = await invoke([new SystemMessage(systemPrompt), new HumanMessage(user)]);
    const firstParse = tryParse(schema, first);
    if (firstParse.ok) return firstParse.value;

    logger.warn("llm output failed validation; requesting repair", {
      stage: name,
      issues: firstParse.issues,
    });

    const repair = await invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(user),
      new HumanMessage(
        [
          "Your previous reply could not be used:",
          "```",
          first.slice(0, 1500),
          "```",
          "Problems:",
          firstParse.issues.map((issue) => `- ${issue}`).join("\n"),
          "Reply again with corrected JSON only. No explanation, no markdown.",
        ].join("\n"),
      ),
    ]);

    const secondParse = tryParse(schema, repair);
    if (secondParse.ok) return secondParse.value;

    logger.error("llm output failed validation after repair", {
      stage: name,
      issues: secondParse.issues,
    });
    throw llmInvalidOutput({ stage: name, issues: secondParse.issues });
  });
}

function tryParse<S extends ZodTypeAny>(
  schema: S,
  raw: string,
): { ok: true; value: z.infer<S> } | { ok: false; issues: string[] } {
  const json = extractJson(raw);
  if (!json) return { ok: false, issues: ["No JSON object found in the response."] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      issues: [`Not valid JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const result = schema.safeParse(parsed);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    issues: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    ),
  };
}
