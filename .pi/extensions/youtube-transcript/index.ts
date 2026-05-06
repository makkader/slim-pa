/**
 * YouTube Transcript extension
 *
 * This extension fetches transcripts from YouTube videos using youtube-transcript-plus.
 * It provides a tool that accepts a video ID or URL and returns the formatted transcript.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { YoutubeTranscript } from "youtube-transcript-plus";

/**
 * Format seconds into H:MM:SS or M:SS timestamp
 */
function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Extract video ID from YouTube URL or return the input if it's already an ID
 */
function extractVideoId(input: string): string {
  // If it looks like a URL, extract the ID
  if (input.includes("youtube.com") || input.includes("youtu.be")) {
    const match = input.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match) {
      return match[1];
    }
  }
  // Otherwise assume it's already a video ID
  return input;
}

export default function (pi: ExtensionAPI) {
  // Register youtube_transcript tool
  pi.registerTool({
    name: "youtube_transcript",
    label: "Get YouTube Transcript",
    description:
      "Fetch the transcript from a YouTube video. Accepts either a video ID (e.g., 'EBw7gsDPAYQ') or a full YouTube URL (e.g., 'https://www.youtube.com/watch?v=EBw7gsDPAYQ').",
    parameters: Type.Object({
      video_id: Type.String({
        description:
          "YouTube video ID or full URL. Examples: 'EBw7gsDPAYQ' or 'https://www.youtube.com/watch?v=EBw7gsDPAYQ'",
      }),
    }),
    execute: async (_toolCallId: string, params: any) => {
      try {
        const videoInput = params.video_id as string;

        if (!videoInput) {
          return {
            content: [
              {
                type: "text",
                text: "❌ Error: video_id parameter is required",
              },
            ],
            isError: true,
            details: {},
          };
        }

        // Extract video ID from URL if needed
        const videoId = extractVideoId(videoInput);

        // Fetch the transcript
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);

        if (!transcript || transcript.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `⚠️ No transcript available for video ID: ${videoId}`,
              },
            ],
            isError: false,
            details: {},
          };
        }

        // Format transcript entries with timestamps
        const formattedEntries = transcript.map((entry) => {
          const timestamp = formatTimestamp(entry.offset / 1000);
          return `[${timestamp}] ${entry.text}`;
        });

        const output = formattedEntries.join("\n");

        return {
          content: [
            {
              type: "text",
              text: `📹 YouTube Transcript (Video ID: ${videoId})\n${"=".repeat(50)}\n\n${output}`,
            },
          ],
          details: {
            videoId,
            entryCount: transcript.length,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Error fetching transcript: ${errorMessage}`,
            },
          ],
          isError: true,
          details: {},
        };
      }
    },
  });
}