/**
 * slack-thinking-steps — OpenClaw plugin
 *
 * Exposes Slack's native Thinking Steps API (chat.startStream / appendStream /
 * stopStream) as agent tools. The model publishes a plan upfront, updates each
 * step with reasoning as it works, then writes its final answer normally.
 *
 * Tools:
 *   slack_stream_start  — open a collapsible thinking stream (plan or timeline)
 *   slack_stream_task   — add/update a task card with status + collapsible output
 *   slack_stream_stop   — finalize the stream before the final answer
 */
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  startStream,
  appendStream,
  stopStream,
  type StreamChunk,
} from "./slack-client.js";

const PLUGIN_ID = "slack-thinking-steps";

/** Active streams keyed by a model-chosen alias */
const activeStreams = new Map<string, { channel: string; ts: string }>();

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "Slack Thinking Steps",
  description: "Exposes Slack's native Thinking Steps API as agent tools for plan-and-execute visibility.",

  register(api) {
    if (api.registrationMode !== "full") return;

    // Resolve Slack bot token from openclaw.json or env at registration time.
    let slackBotToken: string | undefined;
    try {
      const configPath = join(
        process.env.HOME ?? "/root",
        ".openclaw",
        "openclaw.json",
      );
      const raw = JSON.parse(readFileSync(configPath, "utf-8"));
      slackBotToken = raw?.channels?.slack?.botToken;
    } catch {
      // Config read failure is non-fatal — token can come from env
    }

    const getToken = () =>
      slackBotToken ?? process.env.SLACK_BOT_TOKEN;

    // ── slack_stream_start ──────────────────────────────────────────
    (api.registerTool as any)({
      name: "slack_stream_start",
      description:
        "Start a Slack Thinking Steps stream. Call this at the beginning of your reasoning " +
        "to open a collapsible thinking block. Returns a stream_id to use with subsequent calls. " +
        "Extract channel from thread_label in conversation metadata (e.g. #D0AREFNFWAH → D0AREFNFWAH) " +
        "and thread_ts from reply_to_id.",
      parameters: {
        type: "object",
        required: ["thread_ts"],
        properties: {
          channel: {
            type: "string",
            description:
              "Slack channel/DM ID. Falls back to plugin default.",
          },
          thread_ts: {
            type: "string",
            description:
              "Parent message timestamp (reply_to_id from conversation metadata).",
          },
          display_mode: {
            type: "string",
            enum: ["timeline", "plan"],
            description:
              "timeline = sequential steps, plan = checklist overview. Default: plan.",
          },
          stream_id: {
            type: "string",
            description:
              "Alias for this stream (for multiple streams). Default: 'default'.",
          },
          initial_text: {
            type: "string",
            description:
              "Initial markdown text shown when the stream opens (avoids empty message).",
          },
          initial_task_id: {
            type: "string",
            description: "Optional first task card ID to show immediately.",
          },
          initial_task_title: {
            type: "string",
            description: "Title for the initial task card.",
          },
          recipient_user_id: {
            type: "string",
            description:
              "User ID of the message recipient. Required in channels (C...), optional for DMs (D...). Extract sender_id from conversation metadata.",
          },
          recipient_team_id: {
            type: "string",
            description:
              "Team/workspace ID. Required in channels (C...), optional for DMs (D...). Extract group_space from conversation metadata.",
          },
        },
      } as any,
      async execute(_id: string, params: any) {
        const token = getToken();
        if (!token) return err("No Slack bot token configured.");

        const channel = params.channel;
        if (!channel)
          return err("No channel. Pass channel from conversation metadata.");

        const chunks: StreamChunk[] = [];
        if (params.initial_text) {
          chunks.push({ type: "markdown_text", text: params.initial_text });
        }
        if (params.initial_task_id && params.initial_task_title) {
          chunks.push({
            type: "task_update",
            id: params.initial_task_id,
            title: params.initial_task_title,
            status: "in_progress",
          });
        }

        const result = await startStream(token, channel, params.thread_ts, {
          displayMode: params.display_mode ?? "plan",
          chunks: chunks.length > 0 ? chunks : undefined,
          recipientUserId: params.recipient_user_id,
          recipientTeamId: params.recipient_team_id,
        });

        if (!result.ok) return err(`Slack API: ${result.error}`);

        const sid = params.stream_id ?? "default";
        activeStreams.set(sid, { channel, ts: result.ts! });

        return ok(
          `Stream started (id: ${sid}). Use slack_stream_task to add steps, then slack_stream_stop when done.`,
        );
      },
    });

    // ── slack_stream_task ────────────────────────────────────────────
    (api.registerTool as any)({
      name: "slack_stream_task",
      description:
        "Add or update a task card in the thinking stream. Each card is collapsible — " +
        "the title is always visible, details and output are hidden behind an expand chevron. " +
        "Put your reasoning in 'output' so it collapses cleanly. " +
        "Update status as you progress: pending → in_progress → complete/error. " +
        "Reuse the same task_id to update a card's status/output.",
      parameters: {
        type: "object",
        required: ["task_id", "title", "status"],
        properties: {
          task_id: {
            type: "string",
            description:
              "Unique ID for this task (e.g. 'search_logs'). Reuse to update status.",
          },
          title: {
            type: "string",
            description: "Task title — always visible in the collapsed card.",
          },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "complete", "error"],
            description: "Current status.",
          },
          details: {
            type: "string",
            description:
              "Short context shown under the title (max 256 chars).",
          },
          output: {
            type: "string",
            description:
              "Reasoning, findings, or results — hidden behind expand chevron. Put verbose reasoning here.",
          },
          stream_id: {
            type: "string",
            description: "Stream alias. Default: 'default'.",
          },
        },
      } as any,
      async execute(_id: string, params: any) {
        const token = getToken();
        if (!token) return err("No Slack bot token configured.");

        const sid = params.stream_id ?? "default";
        const stream = activeStreams.get(sid);
        if (!stream)
          return err(
            `No active stream '${sid}'. Call slack_stream_start first.`,
          );

        const chunk: StreamChunk = {
          type: "task_update",
          id: params.task_id,
          title: params.title,
          status: params.status,
          ...(params.details && { details: params.details }),
          ...(params.output && { output: params.output }),
        };

        const result = await appendStream(
          token,
          stream.channel,
          stream.ts,
          [chunk],
        );
        if (!result.ok) return err(`Slack API: ${result.error}`);

        return ok(`Task '${params.task_id}' → ${params.status}`);
      },
    });

    // ── slack_stream_stop ────────────────────────────────────────────
    (api.registerTool as any)({
      name: "slack_stream_stop",
      description:
        "Finalize and close the thinking stream. Call this after all thinking steps " +
        "are done, before writing your final answer.",
      parameters: {
        type: "object",
        properties: {
          stream_id: {
            type: "string",
            description: "Stream alias. Default: 'default'.",
          },
        },
      } as any,
      async execute(_id: string, params: any) {
        const token = getToken();
        if (!token) return err("No Slack bot token configured.");

        const sid = params.stream_id ?? "default";
        const stream = activeStreams.get(sid);
        if (!stream) return err(`No active stream '${sid}'.`);

        const result = await stopStream(token, stream.channel, stream.ts);
        activeStreams.delete(sid);

        if (!result.ok) return err(`Slack API: ${result.error}`);

        return ok("Stream finalized. Now write your final answer.");
      },
    });
  },
});

function ok(text: string) {
  return { content: [{ type: "text" as const, text }], details: {} };
}

function err(text: string) {
  return { content: [{ type: "text" as const, text: `Error: ${text}` }], details: {} };
}
