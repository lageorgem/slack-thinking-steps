/**
 * Reasoning block detection and transformation utilities.
 */

export interface ReasoningBlock {
  /** Full matched text including tags */
  fullMatch: string;
  /** Inner content without tags */
  content: string;
  /** Start index in source text */
  startIndex: number;
  /** End index in source text */
  endIndex: number;
}

export interface TransformResult {
  /** Message content with reasoning blocks processed */
  content: string;
  /** Extracted reasoning blocks */
  blocks: ReasoningBlock[];
  /** Whether any reasoning was found */
  hasReasoning: boolean;
}

const DEFAULT_PATTERNS = [
  "<think>[\\s\\S]*?</think>",
  "<reasoning>[\\s\\S]*?</reasoning>",
  "<antThinking>[\\s\\S]*?</antThinking>",
];

/**
 * Extracts reasoning blocks from message content using configured patterns.
 * @param content - Raw message content
 * @param patterns - Regex patterns to match reasoning blocks
 * @returns Extracted reasoning blocks
 */
export function extractReasoningBlocks(
  content: string,
  patterns: string[] = DEFAULT_PATTERNS,
): ReasoningBlock[] {
  const blocks: ReasoningBlock[] = [];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern, "gi");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const fullMatch = match[0];
      const inner = stripOuterTags(fullMatch);

      blocks.push({
        fullMatch,
        content: inner.trim(),
        startIndex: match.index,
        endIndex: match.index + fullMatch.length,
      });
    }
  }

  // Sort by position so we process in document order
  blocks.sort((a, b) => a.startIndex - b.startIndex);

  return blocks;
}

/**
 * Strips the outermost XML-like tags from a string.
 * @param text - Text with outer tags
 * @returns Text without outer tags
 */
function stripOuterTags(text: string): string {
  return text.replace(/^<[^>]+>/, "").replace(/<\/[^>]+>$/, "");
}

/**
 * Generates a brief summary of reasoning content.
 * @param reasoningContent - Raw reasoning text
 * @param maxLength - Maximum summary length
 * @returns Truncated summary
 */
export function summarizeReasoning(
  reasoningContent: string,
  maxLength: number = 150,
): string {
  // Collapse whitespace
  const normalized = reasoningContent.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  // Cut at last word boundary before maxLength
  const truncated = normalized.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "...";
}

/**
 * Removes reasoning blocks from content, optionally replacing with a collapsed indicator.
 * @param content - Raw message content
 * @param mode - Display mode: 'collapsed', 'hidden', or 'inline'
 * @param options - Configuration options
 * @returns Transformed content and extracted blocks
 */
export function transformContent(
  content: string,
  mode: "collapsed" | "hidden" | "inline",
  options: {
    patterns?: string[];
    collapsedLabel?: string;
    showSummary?: boolean;
    summaryMaxLength?: number;
  } = {},
): TransformResult {
  const {
    patterns = DEFAULT_PATTERNS,
    collapsedLabel = "Thinking",
    showSummary = true,
    summaryMaxLength = 150,
  } = options;

  const blocks = extractReasoningBlocks(content, patterns);

  if (blocks.length === 0 || mode === "inline") {
    return { content, blocks, hasReasoning: blocks.length > 0 };
  }

  let transformed = content;

  // Process blocks in reverse order to preserve indices
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];

    if (mode === "hidden") {
      transformed =
        transformed.slice(0, block.startIndex) +
        transformed.slice(block.endIndex);
    } else if (mode === "collapsed") {
      const indicator = buildCollapsedIndicator(
        block.content,
        collapsedLabel,
        showSummary,
        summaryMaxLength,
      );
      transformed =
        transformed.slice(0, block.startIndex) +
        indicator +
        transformed.slice(block.endIndex);
    }
  }

  // Clean up extra whitespace from removals
  transformed = transformed.replace(/\n{3,}/g, "\n\n").trim();

  return { content: transformed, blocks, hasReasoning: true };
}

/**
 * Builds the Slack-compatible collapsed indicator for a reasoning block.
 *
 * Uses Slack mrkdwn blockquote formatting with muted text to create a
 * visually distinct, unobtrusive indicator.
 *
 * @param reasoningContent - The reasoning text to summarize
 * @param label - Label for the indicator
 * @param showSummary - Whether to include a content summary
 * @param summaryMaxLength - Max length of the summary
 * @returns Formatted indicator string
 */
function buildCollapsedIndicator(
  reasoningContent: string,
  label: string,
  showSummary: boolean,
  summaryMaxLength: number,
): string {
  if (!showSummary) {
    return `> _${label}_`;
  }

  const summary = summarizeReasoning(reasoningContent, summaryMaxLength);
  return `> _${label}:_ ${summary}`;
}
