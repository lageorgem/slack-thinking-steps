/**
 * Slack Thinking Steps API client.
 *
 * Wraps chat.startStream / chat.appendStream / chat.stopStream
 * for the native collapsible thinking experience.
 */

export interface SlackApiResponse {
  ok: boolean;
  error?: string;
  channel?: string;
  ts?: string;
}

export type TaskStatus = "pending" | "in_progress" | "complete" | "error";

export interface TaskChunk {
  type: "task_update";
  id: string;
  title: string;
  status: TaskStatus;
  details?: string;
  output?: string;
  sources?: Array<{ type: "url"; text: string; url: string }>;
}

export interface PlanChunk {
  type: "plan_update";
  title: string;
}

export interface MarkdownChunk {
  type: "markdown_text";
  text: string;
}

export type StreamChunk = TaskChunk | PlanChunk | MarkdownChunk;

/**
 * Starts a thinking stream in a Slack thread.
 * @returns The stream's channel and ts (needed for append/stop)
 */
export async function startStream(
  token: string,
  channel: string,
  threadTs: string,
  options?: {
    displayMode?: "timeline" | "plan";
    chunks?: StreamChunk[];
    recipientUserId?: string;
    recipientTeamId?: string;
  },
): Promise<SlackApiResponse> {
  const body: Record<string, unknown> = {
    channel,
    thread_ts: threadTs,
  };

  if (options?.displayMode) {
    body.task_display_mode = options.displayMode;
  }
  if (options?.chunks) {
    body.chunks = options.chunks;
  }
  if (options?.recipientUserId) {
    body.recipient_user_id = options.recipientUserId;
  }
  if (options?.recipientTeamId) {
    body.recipient_team_id = options.recipientTeamId;
  }

  return slackPost(token, "chat.startStream", body);
}

/**
 * Appends content to an active thinking stream.
 */
export async function appendStream(
  token: string,
  channel: string,
  ts: string,
  chunks: StreamChunk[],
): Promise<SlackApiResponse> {
  return slackPost(token, "chat.appendStream", {
    channel,
    ts,
    chunks,
  });
}

/**
 * Finalizes a thinking stream.
 */
export async function stopStream(
  token: string,
  channel: string,
  ts: string,
  chunks?: StreamChunk[],
): Promise<SlackApiResponse> {
  const body: Record<string, unknown> = { channel, ts };
  if (chunks) {
    body.chunks = chunks;
  }
  return slackPost(token, "chat.stopStream", body);
}

async function slackPost(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<SlackApiResponse> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  return (await response.json()) as SlackApiResponse;
}
