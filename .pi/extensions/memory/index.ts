/**
 * Memory extension for writing, searching, and retrieving text from memory.md
 *
 * This extension provides tools for:
 * - memory_write: Append text to memory.md (creates if not exists)
 * - memory_search: Search for relevant text using keyword/semantic similarity
 * - memory_get: Retrieve specific lines by line number
 *
 * Requires: npm install in this directory
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "fs";
import * as path from "path";
import { distance } from "fastest-levenshtein";

const MEMORY_FILENAME = "MEMORY.MD";

function getMemoryFilePath(): string {
  // Use current working directory (project root)
  return path.join(process.cwd(), MEMORY_FILENAME);
}

function readMemoryFile(): string[] {
  const filePath = getMemoryFilePath();
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return content.split("\n");
}

function writeMemoryFile(lines: string[]): void {
  const filePath = getMemoryFilePath();
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

export default function (pi: ExtensionAPI) {
  // Register memory_write tool
  pi.registerTool({
    name: "memory_write",
    label: "Write to Memory",
    description: "Append text to the memory.md file in the project directory. Creates the file if it does not exist.",
    parameters: Type.Object({
      text: Type.String({
        description: "The text to append to memory.md",
      }),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const text = params.text as string;
        const filePath = getMemoryFilePath();
        
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, text + "\n", "utf-8");
        } else {
          const content = fs.readFileSync(filePath, "utf-8");
          const separator = content.endsWith("\n") ? "" : "\n";
          fs.appendFileSync(filePath, separator + text + "\n", "utf-8");
        }
        
        return {
          content: [
            {
              type: "text",
              text: `Successfully appended text to ${MEMORY_FILENAME}.`,
            },
          ],
          details: {},
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error writing to memory: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: {},
        };
      }
    },
  });

  // Register memory_search tool
  pi.registerTool({
    name: "memory_search",
    label: "Search Memory",
    description: "Search for relevant text in memory.md using keyword matching and semantic similarity. Returns matching lines with line numbers.",
    parameters: Type.Object({
      query: Type.String({
        description: "The search query to find relevant memories",
      }),
      max_results: Type.Optional(
        Type.Number({
          description: "Maximum number of results to return (default: 10)",
          default: 10,
        })
      ),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const query = (params.query as string).toLowerCase();
        const maxResults = (params.max_results as number) || 10;
        const lines = readMemoryFile();
        
        if (lines.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No memory file found at ${MEMORY_FILENAME}. Create it first with memory_write.`,
              },
            ],
            details: {},
          };
        }
        
        // Score each line based on relevance
        type MatchResult = {
          lineNumber: number;
          line: string;
          score: number;
        };
        
        const matches: MatchResult[] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineLower = line.toLowerCase();
          
          let score = 0;
          
          // Check for exact substring match
          if (lineLower.includes(query)) {
            score += 10;
            // Bonus for word boundary match
            const words = lineLower.split(/\s+/);
            const queryWords = query.split(/\s+/);
            for (const qw of queryWords) {
              for (const w of words) {
                if (w === qw) {
                  score += 5;
                } else if (w.includes(qw) || qw.includes(w)) {
                  score += 2;
                }
              }
            }
          } else {
            // Calculate Levenshtein distance similarity for fuzzy matching
            const levDistance = distance(lineLower.slice(0, 100), query.slice(0, 100));
            const maxLen = Math.max(lineLower.length, query.length);
            if (maxLen > 0) {
              const similarity = 1 - levDistance / maxLen;
              if (similarity > 0.5) {
                score += similarity * 3;
              }
            }
            
            // Check individual word matches
            const queryWords = query.split(/\s+/);
            const lineWords = lineLower.split(/\s+/);
            for (const qw of queryWords) {
              for (const lw of lineWords) {
                const wordDist = distance(qw, lw);
                const wordMaxLen = Math.max(qw.length, lw.length);
                if (wordMaxLen > 0 && wordDist / wordMaxLen < 0.4) {
                  score += 2;
                }
              }
            }
          }
          
          // Only include lines with positive scores
          if (score > 0) {
            matches.push({
              lineNumber: i + 1,
              line: line,
              score: score,
            });
          }
        }
        
        // Sort by score descending
        matches.sort((a, b) => b.score - a.score);
        
        // Take top results
        const topMatches = matches.slice(0, maxResults);
        
        if (topMatches.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No matches found for query: "${params.query}"`,
              },
            ],
            details: {},
          };
        }
        
        // Format results
        const results = topMatches.map((m) => ({
          line: m.lineNumber,
          text: m.line,
          relevance: Math.round(m.score * 10) / 10,
        }));
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
          details: {},
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error searching memory: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: {},
        };
      }
    },
  });

  // Register memory_get tool
  pi.registerTool({
    name: "memory_get",
    label: "Get Memory Lines",
    description: "Retrieve specific lines from memory.md by line number(s). Supports single line, range (start-end), or multiple line numbers.",
    parameters: Type.Object({
      lines: Type.Union([
        Type.String({
          description: "Line specification: single number (e.g., '5'), range (e.g., '10-20'), or comma-separated (e.g., '1,3,5')",
        }),
        Type.Array(Type.Number(), {
          description: "Array of line numbers to retrieve",
        }),
      ]),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const linesInput = params.lines;
        const allLines = readMemoryFile();
        
        if (allLines.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No memory file found at ${MEMORY_FILENAME}. Create it first with memory_write.`,
              },
            ],
            details: {},
          };
        }
        
        const lineNumbers: number[] = [];
        
        // Parse line specification
        if (typeof linesInput === "string") {
          const trimmed = linesInput.trim();
          
          // Check for range (e.g., "10-20")
          if (trimmed.includes("-")) {
            const [start, end] = trimmed.split("-").map((s) => parseInt(s.trim(), 10));
            if (!isNaN(start) && !isNaN(end)) {
              for (let i = start; i <= end; i++) {
                lineNumbers.push(i);
              }
            }
          }
          // Check for comma-separated (e.g., "1,3,5")
          else if (trimmed.includes(",")) {
            lineNumbers.push(...trimmed.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n)));
          }
          // Single line number
          else {
            const n = parseInt(trimmed, 10);
            if (!isNaN(n)) {
              lineNumbers.push(n);
            }
          }
        } else if (Array.isArray(linesInput)) {
          lineNumbers.push(...linesInput.filter((n) => typeof n === "number" && !isNaN(n)));
        }
        
        if (lineNumbers.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "Invalid line specification. Use a line number, range (e.g., '10-20'), or comma-separated list.",
              },
            ],
            isError: true,
            details: {},
          };
        }
        
        // Get unique, sorted line numbers
        const uniqueLines = [...new Set(lineNumbers)].sort((a, b) => a - b);
        
        // Retrieve lines
        const results: { line: number; text: string }[] = [];
        for (const lineNum of uniqueLines) {
          if (lineNum >= 1 && lineNum <= allLines.length) {
            results.push({
              line: lineNum,
              text: allLines[lineNum - 1], // 0-indexed array
            });
          }
        }
        
        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No valid lines found. File has ${allLines.length} lines.`,
              },
            ],
            details: {},
          };
        }
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
          details: {},
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error retrieving memory: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: {},
        };
      }
    },
  });
}
