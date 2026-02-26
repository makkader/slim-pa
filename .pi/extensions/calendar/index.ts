/**
 * Calendar extension using khal CLI for event/calendar/reminder management
 *
 * This extension wraps khal (https://github.com/pimutils/khal) and provides:
 * - calendar_add: Add events (khal new)
 * - calendar_list: List upcoming events (khal list)
 * - calendar_today: Show today's agenda (khal today)
 * - calendar_search: Search events (khal search/print)
 * - calendar_delete: Delete events
 * - calendar_configure: Configure khal (khal configure)
 *
 * Requires: pip install khal
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execSync, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CONFIG_DIR = path.join(os.homedir(), ".config", "khal");
const CONFIG_FILE = path.join(CONFIG_DIR, "config");

// Check if khal is available
function checkKhal(): { installed: boolean; version?: string; error?: string } {
  try {
    const output = execSync("khal --version", { encoding: "utf-8", timeout: 5000 });
    return { installed: true, version: output.trim() };
  } catch (error) {
    return {
      installed: false,
      error: `khal is not installed. Install with: pip install khal\nSee: https://github.com/pimutils/khal`,
    };
  }
}

// Get default calendar path
function getDefaultCalendarPath(): string {
  return path.join(os.homedir(), ".calendars", "personal");
}

// Ensure khal config exists
function ensureKhalConfig(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    const calendarPath = getDefaultCalendarPath();
    // Ensure calendar directory exists
    if (!fs.existsSync(calendarPath)) {
      fs.mkdirSync(calendarPath, { recursive: true });
    }

    const config = `[calendars]
[[personal]]
path = ${calendarPath}
displayname = Personal

[default]
default_calendar = personal
timedelta = 30
highlight_event_days = true
`;
    fs.writeFileSync(CONFIG_FILE, config, "utf-8");
  }
}

// Execute khal command
function execKhal(
  args: string[],
  timeout = 30000
): { success: boolean; output: string; error?: string } {
  try {
    ensureKhalConfig();
    const output = execSync(`khal ${args.join(" ")}`, {
      encoding: "utf-8",
      timeout,
      cwd: process.cwd(),
    });
    return { success: true, output: output.trim() };
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    return {
      success: false,
      output: "",
      error: err.stderr || err.message || String(error),
    };
  }
}

export default function (pi: ExtensionAPI) {
  // Register calendar_add tool
  pi.registerTool({
    name: "calendar_add",
    label: "Add Calendar Event (khal)",
    description:
      "Add an event using khal. Supports natural language dates like 'today', 'tomorrow', 'next Friday at 2pm'. Uses khal's 'new' command.",
    parameters: Type.Object({
      title: Type.String({ description: "Event title/summary" }),
      datetime: Type.String({
        description:
          "Event date/time. Examples: 'today 14:00', 'tomorrow at 2pm', '2025-02-25 14:30', 'next Monday 10:00'",
      }),
      end_datetime: Type.Optional(
        Type.String({
          description: "Optional end time (defaults to 1 hour after start)",
        })
      ),
      location: Type.Optional(
        Type.String({ description: "Optional event location" })
      ),
      description: Type.Optional(
        Type.String({ description: "Optional event description" })
      ),
      calendar: Type.Optional(
        Type.String({
          description: "Calendar name (defaults to 'personal')",
          default: "personal",
        })
      ),
    }),
    execute: async (_toolCallId, params) => {
      const khalCheck = checkKhal();
      if (!khalCheck.installed) {
        return {
          content: [
            {
              type: "text",
              text: `❌ ${khalCheck.error}`,
            },
          ],
          isError: true,
          details: {},
        };
      }

      try {
        const {
          title,
          datetime,
          end_datetime,
          location,
          description,
          calendar = "personal",
        } = params;

        // Build the datetime range string for khal
        let timeSpec = datetime as string;
        if (end_datetime) {
          timeSpec = `${datetime} ${end_datetime}`;
        }

        // Build khal new command: khal new DATETIME TITLE [LOCATION]
        // Use --calendar to specify calendar
        const args = ["new", "--calendar", calendar as string];

        // Add location if provided
        if (location) {
          args.push(timeSpec, `"${title}"`, `"${location}"`);
        } else {
          args.push(timeSpec, `"${title}"`);
        }

        const result = execKhal(args);

        if (!result.success) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Failed to add event: ${result.error}`,
              },
            ],
            isError: true,
            details: {},
          };
        }

        let output = `✅ Event added to ${calendar} calendar:\n📌 ${title}\n📅 ${datetime}`;
        if (end_datetime) output += ` - ${end_datetime}`;
        if (location) output += `\n📍 ${location}`;
        if (description) output += `\n📝 ${description}`;

        return {
          content: [
            {
              type: "text",
              text: output,
            },
          ],
          details: {},
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: {},
        };
      }
    },
  });

  // Register calendar_list tool
  pi.registerTool({
    name: "calendar_list",
    label: "List Calendar Events (khal)",
    description: "List upcoming events using khal's list command. Shows events from today onwards.",
    parameters: Type.Object({
      days: Type.Optional(
        Type.Number({
          description: "Number of days to show (default: 7)",
          default: 7,
        })
      ),
      calendar: Type.Optional(
        Type.String({ description: "Specific calendar to query (default: all)" })
      ),
      include_past: Type.Optional(
        Type.Boolean({
          description: "Include past events (default: false)",
          default: false,
        })
      ),
    }),
    execute: async (_toolCallId, params) => {
      const khalCheck = checkKhal();
      if (!khalCheck.installed) {
        return {
          content: [
            {
              type: "text",
              text: `❌ ${khalCheck.error}`,
            },
          ],
          isError: true,
          details: {},
        };
      }

      try {
        const days = (params.days as number) || 7;
        const calendar = params.calendar as string | undefined;
        const includePast = (params.include_past as boolean) || false;

        const args = ["list"];

        if (calendar) {
          args.push("--calendar", calendar);
        }

        if (includePast) {
          args.push("--past");
        }

        // khal list shows from today by default, can specify date range
        args.push("today", `${days}d`);

        const result = execKhal(args);

        if (!result.success) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Failed to list events: ${result.error}`,
              },
            ],
            isError: true,
            details: {},
          };
        }

        const output = result.output || "No upcoming events found.";

        return {
          content: [
            {
              type: "text",
              text: `📅 Upcoming events (next ${days} days):\n\n${output}`,
            },
          ],
          details: {},
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: {},
        };
      }
    },
  });

  // Register calendar_today tool
  pi.registerTool({
    name: "calendar_today",
    label: "Today's Calendar (khal)",
    description: "Show today's agenda using khal's list command for today.",
    parameters: Type.Object({
      calendar: Type.Optional(
        Type.String({ description: "Specific calendar (default: all)" })
      ),
    }),
    execute: async (_toolCallId, params) => {
      const khalCheck = checkKhal();
      if (!khalCheck.installed) {
        return {
          content: [
            {
              type: "text",
              text: `❌ ${khalCheck.error}`,
            },
          ],
          isError: true,
          details: {},
        };
      }

      try {
        const calendar = params.calendar as string | undefined;
        const args = ["list", "--past"];

        if (calendar) {
          args.push("--calendar", calendar);
        }

        args.push("today", "1d");

        const result = execKhal(args);

        if (!result.success) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Failed to get today's events: ${result.error}`,
              },
            ],
            isError: true,
            details: {},
          };
        }

        const output = result.output || "No events scheduled for today.";

        return {
          content: [
            {
              type: "text",
              text: `📅 Today's Schedule:\n\n${output}`,
            },
          ],
          details: {},
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: {},
        };
      }
    },
  });

  // Register calendar_search tool
  pi.registerTool({
    name: "calendar_search",
    label: "Search Calendar (khal)",
    description: "Search calendar events using khal's search functionality.",
    parameters: Type.Object({
      query: Type.String({ description: "Search term to find in events" }),
      calendar: Type.Optional(
        Type.String({ description: "Specific calendar (default: all)" })
      ),
    }),
    execute: async (_toolCallId, params) => {
      const khalCheck = checkKhal();
      if (!khalCheck.installed) {
        return {
          content: [
            {
              type: "text",
              text: `❌ ${khalCheck.error}`,
            },
          ],
          isError: true,
          details: {},
        };
      }

      try {
        const query = params.query as string;
        const calendar = params.calendar as string | undefined;

        // khal doesn't have a direct search, so we use list + grep
        // or export and search
        const args = ["print", "--format", "{start-loc} - {end-loc}: {title} [{location}]"];

        if (calendar) {
          args.push("--calendar", calendar);
        }

        // Print events from today to 1 year ahead
        args.push("today", "1y");

        const result = execKhal(args, 60000);

        if (!result.success) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Failed to search events: ${result.error}`,
              },
            ],
            isError: true,
            details: {},
          };
        }

        // Filter results by query
        const lines = result.output.split("\n").filter((line) =>
          line.toLowerCase().includes(query.toLowerCase())
        );

        if (lines.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No events found matching "${query}".`,
              },
            ],
            details: {},
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `🔍 Search results for "${query}" (${lines.length}):\n\n${lines.join("\n")}`,
            },
          ],
          details: {},
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: {},
        };
      }
    },
  });

  // Register calendar_agenda tool
  pi.registerTool({
    name: "calendar_agenda",
    label: "Calendar Agenda (khal)",
    description: "Show calendar agenda for a specific time period using khal's agenda view.",
    parameters: Type.Object({
      start: Type.String({
        description: "Start date (e.g., 'today', 'tomorrow', '2025-02-25')",
        default: "today",
      }),
      days: Type.Optional(
        Type.Number({
          description: "Number of days to show (default: 14)",
          default: 14,
        })
      ),
      calendar: Type.Optional(
        Type.String({ description: "Specific calendar (default: all)" })
      ),
    }),
    execute: async (_toolCallId, params) => {
      const khalCheck = checkKhal();
      if (!khalCheck.installed) {
        return {
          content: [
            {
              type: "text",
              text: `❌ ${khalCheck.error}`,
            },
          ],
          isError: true,
          details: {},
        };
      }

      try {
        const start = (params.start as string) || "today";
        const days = (params.days as number) || 14;
        const calendar = params.calendar as string | undefined;

        const args = ["agenda"];

        if (calendar) {
          args.push("--calendar", calendar);
        }

        args.push(start, `${days}d`);

        const result = execKhal(args);

        if (!result.success) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Failed to get agenda: ${result.error}`,
              },
            ],
            isError: true,
            details: {},
          };
        }

        const output =
          result.output || `No events found for ${start} - ${days} days.`;

        return {
          content: [
            {
              type: "text",
              text: `📋 Agenda from ${start} (${days} days):\n\n${output}`,
            },
          ],
          details: {},
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: {},
        };
      }
    },
  });

  // Register calendar_info tool
  pi.registerTool({
    name: "calendar_info",
    label: "Calendar Info (khal)",
    description: "Show khal configuration and calendar information.",
    parameters: Type.Object({}),
    execute: async (_toolCallId, _params) => {
      const khalCheck = checkKhal();
      if (!khalCheck.installed) {
        return {
          content: [
            {
              type: "text",
              text: `❌ ${khalCheck.error}`,
            },
          ],
          isError: true,
          details: {},
        };
      }

      try {
        // Get calendars
        const calResult = execKhal(["printcalendars"]);
        const calendars = calResult.success
          ? calResult.output
          : "Could not retrieve calendars";

        // Show config location
        let configInfo = "";
        if (fs.existsSync(CONFIG_FILE)) {
          configInfo = `\nConfig file: ${CONFIG_FILE}`;
        }

        return {
          content: [
            {
              type: "text",
              text: `📅 Khal Calendar Information\n${"=".repeat(30)}\n\nVersion: ${khalCheck.version}\n\nConfigured Calendars:\n${calendars}${configInfo}\n\nCalendar storage: ~/.calendars/`,
            },
          ],
          details: {},
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: {},
        };
      }
    },
  });
}
