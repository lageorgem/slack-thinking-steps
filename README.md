# slack-thinking-steps

OpenClaw plugin that exposes [Slack's native Thinking Steps API](https://slack.dev/slack-thinking-steps-ai-agents/) as agent tools. The model publishes a plan upfront, updates each step with collapsible reasoning as it works, then writes its final answer normally.

## What it does

Instead of the model dumping its reasoning inline (cluttering the Slack conversation), this plugin gives it tools to stream thinking as **native Slack collapsible blocks** — task cards with expand chevrons that users can click to see details.

**Before:** Wall of reasoning text followed by the answer.
**After:** Clean checklist of steps (collapsed by default) followed by the answer.

## Tools

| Tool | Purpose |
|------|---------|
| `slack_stream_start` | Open a thinking stream in a Slack thread |
| `slack_stream_task` | Add/update a collapsible task card with status + reasoning |
| `slack_stream_stop` | Finalize the stream before the final answer |

## Requirements

- OpenClaw `>=2026.3.24-beta.2`
- Slack app with **Agents & AI Apps** enabled and `chat:write` scope
- For channel threads (not DMs): `recipient_user_id` and `recipient_team_id` are required by Slack's API

## Installation

```bash
# Local development
openclaw plugins install /path/to/slack-thinking-steps -l

# From ClawHub (when published)
openclaw plugins install clawhub:@your-org/slack-thinking-steps
```

## Configuration

No plugin-specific config needed. The plugin reads the Slack bot token automatically from `channels.slack.botToken` in `openclaw.json`, falling back to the `SLACK_BOT_TOKEN` environment variable. The model extracts the channel and thread from conversation metadata.

```json5
{
  plugins: {
    entries: {
      "slack-thinking-steps": {
        enabled: true
      }
    }
  }
}
```

## Sample prompt

Add this to your agent's system prompt or AGENTS.md to teach the model how to use the tools:

---

### Slack Thinking Steps

You have 3 tools for showing your thinking as collapsible Slack blocks. **Use them on every non-trivial request. Never output intermediate reasoning as regular messages — all thinking, narration, and progress updates MUST go through `slack_stream_task` updates.**

When you output thinking as regular text, it gets delivered to Slack as a visible message that clutters the conversation. Instead, wrap ALL intermediate reasoning in `slack_stream_task` output fields — they collapse behind a chevron, keeping the conversation clean. The only regular message you should write is your **final answer** after calling `slack_stream_stop`.

**Tools:**

- **`slack_stream_start`** — Opens a thinking stream. Use `display_mode: "plan"`.
- **`slack_stream_task`** — Adds or updates a task card. `task_id` to reuse, `title` always visible, `status` (pending/in_progress/complete/error), `output` for ALL reasoning and narration (collapsed behind chevron).
- **`slack_stream_stop`** — Closes the stream. Call when done, then write your final answer.

**Extracting Slack metadata from every inbound message:**

| Field | Source in metadata | Used for |
|-------|-------------------|----------|
| `channel` | `thread_label` — take the ID after `#` (e.g. `Slack thread #D0AREFNFWAH` → `D0AREFNFWAH`) | All stream calls |
| `thread_ts` | `reply_to_id` | `slack_stream_start` |
| `recipient_user_id` | `sender_id` — **required in channels (C...), optional for DMs (D...)** | `slack_stream_start` |
| `recipient_team_id` | `group_space` — **required in channels (C...), optional for DMs (D...)** | `slack_stream_start` |

**Small tasks (single step):**

1. Open a stream with a single task:
   ```
   slack_stream_start(channel="...", thread_ts="...", display_mode="plan",
     initial_task_id="task", initial_task_title="Checking Redis cluster health")
   ```
2. Do the work. Put all reasoning in `output`:
   ```
   slack_stream_task(task_id="task", title="Checking Redis cluster health", status="in_progress",
     output="Queried 6 PromQL metrics. All 11 nodes responding, memory at 64-68%...")
   ```
3. Mark complete and stop:
   ```
   slack_stream_task(task_id="task", title="Checking Redis cluster health", status="complete",
     output="All 11 nodes up. Memory 64-68%. No evictions.")
   slack_stream_stop()
   ```
4. Write your final answer normally.

**Large tasks (multi-step plan):**

1. Break the task into steps.
2. Open a stream with all steps as `pending`:
   ```
   slack_stream_start(channel="...", thread_ts="...", display_mode="plan",
     initial_task_id="step1", initial_task_title="Check Redis health")
   slack_stream_task(task_id="step2", title="Check MongoDB health", status="pending")
   slack_stream_task(task_id="step3", title="Review alert rules", status="pending")
   ```
3. Work through each step — set `in_progress` before, `complete` after with reasoning in `output`.
4. Call `slack_stream_stop`, then write your final answer.

**Rules:**

- **NEVER output intermediate thinking as regular messages.** All reasoning goes in `slack_stream_task` `output` fields.
- **Keep task titles short** — they're the checklist items users scan.
- **Update `output` as you go**, not just at the end.
- **Always call `slack_stream_stop` before your final answer.**
- **In channels (C...), always pass `recipient_user_id` and `recipient_team_id`.**

---

## Development

```bash
npm install
npm test           # run tests
npm run dev        # watch mode
npm run build      # compile to dist/
```

## License

MIT
