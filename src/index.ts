/**
 * slack-reasoning-collapse — OpenClaw plugin
 *
 * Intercepts outbound Slack messages and collapses AI thinking/reasoning blocks
 * into summarized or hidden sections instead of streaming them inline.
 */
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { transformContent } from "./reasoning.js";

export interface PluginConfig {
  mode: "collapsed" | "hidden" | "inline";
  patterns: string[];
  collapsedLabel: string;
  showSummary: boolean;
  summaryMaxLength: number;
}

const DEFAULT_CONFIG: PluginConfig = {
  mode: "collapsed",
  patterns: [
    "<think>[\\s\\S]*?</think>",
    "<reasoning>[\\s\\S]*?</reasoning>",
    "<antThinking>[\\s\\S]*?</antThinking>",
  ],
  collapsedLabel: "Thinking",
  showSummary: true,
  summaryMaxLength: 150,
};

export default definePluginEntry({
  id: "slack-reasoning-collapse",

  register(api) {
    if (api.registrationMode !== "full") return;

    api.on(
      "message_sending",
      (event) => {
        const config: PluginConfig = {
          ...DEFAULT_CONFIG,
          ...(event.context?.pluginConfig as Partial<PluginConfig> | undefined),
        };

        if (config.mode === "inline") return;

        const result = transformContent(event.content, config.mode, {
          patterns: config.patterns,
          collapsedLabel: config.collapsedLabel,
          showSummary: config.showSummary,
          summaryMaxLength: config.summaryMaxLength,
        });

        if (!result.hasReasoning) return;

        return { content: result.content };
      },
      { priority: 80 },
    );
  },
});
