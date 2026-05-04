import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startStream, appendStream, stopStream } from "./slack-client.js";

describe("slack-client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockSlack(response: Record<string, unknown>) {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      json: () => Promise.resolve(response),
    } as Response);
  }

  function lastCallBody(): Record<string, unknown> {
    return JSON.parse(
      (vi.mocked(globalThis.fetch).mock.calls[0][1] as RequestInit)
        .body as string,
    );
  }

  describe("startStream", () => {
    it("calls chat.startStream with channel and thread_ts", async () => {
      mockSlack({ ok: true, channel: "C123", ts: "111.222" });

      const result = await startStream("xoxb-token", "C123", "999.888");

      expect(result.ok).toBe(true);
      expect(result.ts).toBe("111.222");

      const url = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
      expect(url).toBe("https://slack.com/api/chat.startStream");

      const body = lastCallBody();
      expect(body.channel).toBe("C123");
      expect(body.thread_ts).toBe("999.888");
    });

    it("includes display mode", async () => {
      mockSlack({ ok: true, ts: "111.222" });

      await startStream("xoxb-token", "C123", "999.888", {
        displayMode: "plan",
      });

      expect(lastCallBody().task_display_mode).toBe("plan");
    });

    it("includes initial chunks", async () => {
      mockSlack({ ok: true, ts: "111.222" });

      await startStream("xoxb-token", "C123", "999.888", {
        chunks: [
          { type: "markdown_text", text: "Starting..." },
          {
            type: "task_update",
            id: "step1",
            title: "First step",
            status: "in_progress",
          },
        ],
      });

      const body = lastCallBody();
      const chunks = body.chunks as any[];
      expect(chunks).toHaveLength(2);
      expect(chunks[0].type).toBe("markdown_text");
      expect(chunks[1].type).toBe("task_update");
    });

    it("includes recipient fields for channels", async () => {
      mockSlack({ ok: true, ts: "111.222" });

      await startStream("xoxb-token", "C123", "999.888", {
        recipientUserId: "U123",
        recipientTeamId: "T456",
      });

      const body = lastCallBody();
      expect(body.recipient_user_id).toBe("U123");
      expect(body.recipient_team_id).toBe("T456");
    });

    it("omits optional fields when not provided", async () => {
      mockSlack({ ok: true, ts: "111.222" });

      await startStream("xoxb-token", "C123", "999.888");

      const body = lastCallBody();
      expect(body.recipient_user_id).toBeUndefined();
      expect(body.recipient_team_id).toBeUndefined();
      expect(body.chunks).toBeUndefined();
    });

    it("returns error from Slack API", async () => {
      mockSlack({ ok: false, error: "invalid_auth" });

      const result = await startStream("xoxb-token", "C123", "999.888");

      expect(result.ok).toBe(false);
      expect(result.error).toBe("invalid_auth");
    });
  });

  describe("appendStream", () => {
    it("sends task_update chunks", async () => {
      mockSlack({ ok: true });

      const result = await appendStream("xoxb-token", "C123", "111.222", [
        {
          type: "task_update",
          id: "step1",
          title: "Checking logs",
          status: "complete",
          output: "Found 3 errors in the last hour",
        },
      ]);

      expect(result.ok).toBe(true);

      const url = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
      expect(url).toBe("https://slack.com/api/chat.appendStream");

      const body = lastCallBody();
      expect(body.channel).toBe("C123");
      expect(body.ts).toBe("111.222");
      expect((body.chunks as any[])[0].status).toBe("complete");
    });

    it("sends multiple chunks at once", async () => {
      mockSlack({ ok: true });

      await appendStream("xoxb-token", "C123", "111.222", [
        {
          type: "task_update",
          id: "s1",
          title: "Done",
          status: "complete",
        },
        {
          type: "task_update",
          id: "s2",
          title: "Next",
          status: "in_progress",
        },
      ]);

      const chunks = lastCallBody().chunks as any[];
      expect(chunks).toHaveLength(2);
    });
  });

  describe("stopStream", () => {
    it("calls chat.stopStream", async () => {
      mockSlack({ ok: true });

      const result = await stopStream("xoxb-token", "C123", "111.222");

      expect(result.ok).toBe(true);

      const url = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
      expect(url).toBe("https://slack.com/api/chat.stopStream");

      const body = lastCallBody();
      expect(body.channel).toBe("C123");
      expect(body.ts).toBe("111.222");
    });

    it("includes final chunks when provided", async () => {
      mockSlack({ ok: true });

      await stopStream("xoxb-token", "C123", "111.222", [
        { type: "markdown_text", text: "All done." },
      ]);

      const chunks = lastCallBody().chunks as any[];
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe("All done.");
    });
  });
});
