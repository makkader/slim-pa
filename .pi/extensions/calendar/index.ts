/**
 * Calendar extension using khal CLI for event/calendar/reminder management
 *
 * This extension wraps khal (https://github.com/pimutils/khal) and provides:
 * - calendar_add: Add events (khal new)
 * - calendar_list: List upcoming events (khal list)
 * - calendar_search: Search events (khal search/print)
 * - calendar_delete: Delete events (direct .ics manipulation since khal edit is interactive)
 * - calendar_edit: Edit events (direct .ics manipulation)
 * - calendar_configure: Configure khal (khal configure)
 *
 * Requires: pip install khal, npm install ical ical-generator
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import ical from "ical";
import icalGenerator, { ICalEvent } from "ical-generator";

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

// Get calendar path from khal config or use default
function getCalendarPath(calendarName: string = "personal"): string {
  // Try to read from khal config
  if (fs.existsSync(CONFIG_FILE)) {
    const config = fs.readFileSync(CONFIG_FILE, "utf-8");
    const calendarMatch = config.match(new RegExp(`\\[\\[${calendarName}\\]\\][\\s\\S]*?path\\s*=\\s*(.+)`));
    if (calendarMatch) {
      return calendarMatch[1].trim();
    }
  }
  // Fallback to default
  return path.join(os.homedir(), ".calendars", calendarName);
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
    const output = execSync(`khal --config ${CONFIG_FILE} ${args.join(" ")}`, {
      encoding: "utf-8",
      timeout,
      //cwd: process.cwd(),
    });
    return { success: true, output: output.trim() };
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    return { success: false, output: "", error: err.stderr || err.message || String(error) };
  }
}

// Parse .ics files from a calendar directory
function parseICalDirectory(calendarPath: string): Array<{ uid: string; event: any; filePath: string; filename: string }> {
  const events: Array<{ uid: string; event: any; filePath: string; filename: string }> = [];
  
  if (!fs.existsSync(calendarPath)) {
    return events;
  }

  const files = fs.readdirSync(calendarPath);
  
  for (const filename of files) {
    if (filename.endsWith('.ics')) {
      const filePath = path.join(calendarPath, filename);
      try {
        const data = ical.parseFile(filePath);
        for (const uid in data) {
          if (data[uid].type === 'VEVENT') {
            events.push({
              uid: uid,
              event: data[uid],
              filePath: filePath,
              filename: filename
            });
          }
        }
      } catch (e) {
        console.error('Failed to parse:', filePath, e);
      }
    }
  }
  
  // Sort events by start time
  events.sort((a, b) => a.event.start.getTime() - b.event.start.getTime());
  
  return events;
}

// Find event by UID or search term
function findEvent(
  calendarPath: string,
  searchTerm: string
): Array<{ uid: string; event: any; filePath: string; filename: string }> {
  const allEvents = parseICalDirectory(calendarPath);
  const term = searchTerm.toLowerCase();
  
  return allEvents.filter(({ event }) => {
    const matchesUid = event.uid?.toLowerCase().includes(term) || false;
    const matchesSummary = event.summary?.toLowerCase().includes(term) || false;
    const matchesDescription = event.description?.toLowerCase().includes(term) || false;
    return matchesUid || matchesSummary || matchesDescription;
  });
}


// Update an event file (removing old event, adding updated)
function updateEventFile(
  filePath: string,
  oldEventId: string,
  newEventData: any
): boolean {
  try {
    // Parse existing file
    const existingEvents: any[] = [];
    try {
      const data = ical.parseFile(filePath);
      for (const uid in data) {
        if (data[uid].type === 'VEVENT' && uid !== oldEventId) {
          existingEvents.push(data[uid]);
        }
      }
    } catch (e) {
      // File might not exist or be empty
    }
    
    // Create new calendar
    const cal = icalGenerator({ name: 'Calendar' });
    
    // Add existing events (except the one being updated)
    for (const evt of existingEvents) {
      cal.createEvent({
        id: evt.uid,
        summary: evt.summary,
        description: evt.description,
        location: evt.location,
        start: evt.start,
        end: evt.end || new Date(evt.start.getTime() + 3600000),
        timezone: evt.timezone || 'local',
        allDay: evt.allDay || false,
      });
    }
    
    // Add updated event
    cal.createEvent({
      id: newEventData.uid || oldEventId,
      summary: newEventData.summary,
      description: newEventData.description,
      location: newEventData.location,
      start: newEventData.start,
      end: newEventData.end || new Date(newEventData.start.getTime() + 3600000),
      timezone: newEventData.timezone || 'local',
      allDay: newEventData.allDay || false,
      status: newEventData.status,
    });
    
    fs.writeFileSync(filePath, cal.toString());
    return true;
  } catch (error) {
    console.error('Failed to update event file:', error);
    return false;
  }
}

// Remove event from file (delete event entirely)
function removeEventFromFile(filePath: string, eventId: string): boolean {
  try {
    const data = ical.parseFile(filePath);
    const remainingEvents: any[] = [];
    
    for (const uid in data) {
      if (data[uid].type === 'VEVENT' && uid !== eventId) {
        remainingEvents.push(data[uid]);
      }
    }
    
    if (remainingEvents.length === 0) {
      // Delete file if empty
      fs.unlinkSync(filePath);
    } else {
      // Rewrite file without deleted event
      const cal = icalGenerator({ name: 'Calendar' });
      for (const evt of remainingEvents) {
        cal.createEvent({
          id: evt.uid,
          summary: evt.summary,
          description: evt.description,
          location: evt.location,
          start: evt.start,
          end: evt.end || new Date(evt.start.getTime() + 3600000),
          timezone: evt.timezone || 'local',
          allDay: evt.allDay || false,
          status: evt.status,
        });
      }
      fs.writeFileSync(filePath, cal.toString());
    }
    
    return true;
  } catch (error) {
    console.error('Failed to remove event:', error);
    return false;
  }
}

export default function (pi: ExtensionAPI) {
  // Register calendar_add tool
  pi.registerTool({
    name: "calendar_add",
    label: "Add Calendar Event (khal)",
    description: "Add an event using khal. Supports title, datetime, location, description, and recurrence.",
    parameters: Type.Object({
      title: Type.String({ description: "Event title/summary" }),
      datetime: Type.String({
        description: "Event date/time in YYYY-MM-DD HH:MM AM/PM format. Examples: '2026-03-05 03:00 PM'",
      }),
      end_datetime: Type.Optional(
        Type.String({
          description: "Optional end date/time (defaults to 1 hour after start)",
        })
      ),
      location: Type.Optional(
        Type.String({ description: "Optional event location" })
      ),
      description: Type.Optional(
        Type.String({ description: "Optional event description" })
      ),
      repeat: Type.Optional(
        Type.String({
          description: "Recurrence rule: daily, weekly, monthly, or yearly",
          enum: ["daily", "weekly", "monthly", "yearly"],
        })
      ),
      calendar: Type.Optional(
        Type.String({
          description: "Calendar name (defaults to 'personal')",
          default: "personal",
        })
      ),
    }),
    execute: async (_toolCallId: string, params: any) => {
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
          repeat,
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

        // Add repeat if provided
        if (repeat) {
          args.push("--repeat", repeat as string);
        }

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
        if (repeat) output += `\n🔄 Repeats: ${repeat}`;
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
    execute: async (_toolCallId: string, params: any) => {
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

  // Register calendar_search tool
  pi.registerTool({
    name: "calendar_search",
    label: "Search Calendar (khal)",
    description: "Search calendar events using khal's search functionality.",
    parameters: Type.Object({
      query: Type.String({ description: "Search term to find in events" }),
    }),
    execute: async (_toolCallId: string, params: any) => {
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

        const args = [
          "search",
          query
        ];
        
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

        const output = result.output || "No matching events found.";

        return {
          content: [
            {
              type: "text",
              text: `🔍 Search results for "${query}": ${output}`,
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
    execute: async (_toolCallId: string, _params: any) => {
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
              text: `📅 Khal Calendar Information\n${"=".repeat(
                30
              )}\n\nVersion: ${khalCheck.version}\n\nConfigured Calendars:\n${calendars}${configInfo}`,
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

  // Register calendar_delete tool - Direct .ics manipulation
  pi.registerTool({
    name: "calendar_delete",
    label: "Delete Calendar Event",
    description: "Delete an event from the calendar using direct .ics file manipulation (since khal edit is interactive only).",
    parameters: Type.Object({
      event_id: Type.Optional(
        Type.String({ description: "Event UID to delete (use search to find)" })
      ),
      search_term: Type.Optional(
        Type.String({ description: "Search term to find event (if event_id not provided)" })
      ),
      calendar: Type.Optional(
        Type.String({
          description: "Calendar name (defaults to 'personal')",
          default: "personal",
        })
      ),
    }),
    execute: async (_toolCallId: string, params: any) => {
      try {
        const calendar = (params.calendar as string) || "personal";
        const eventId = params.event_id as string | undefined;
        const searchTerm = params.search_term as string | undefined;

        if (!eventId && !searchTerm) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Either event_id or search_term must be provided.`,
              },
            ],
            isError: true,
            details: {},
          };
        }

        const calendarPath = getCalendarPath(calendar);
        
        if (!fs.existsSync(calendarPath)) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Calendar "${calendar}" not found at ${calendarPath}`,
              },
            ],
            isError: true,
            details: {},
          };
        }

        // Find the event
        let targetEvents;
        if (eventId) {
          targetEvents = findEvent(calendarPath, eventId);
        } else {
          targetEvents = findEvent(calendarPath, searchTerm!);
        }

        if (targetEvents.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No events found matching "${eventId || searchTerm}" in calendar "${calendar}".`,
              },
            ],
            isError: true,
            details: {},
          };
        }

        if (targetEvents.length > 1) {
          // Show multiple matches
          const matches = targetEvents.map((e, i) => 
            `${i + 1}. ${e.event.summary} (${e.event.start.toLocaleString()}) [UID: ${e.uid}]`
          ).join('\n');
          
          return {
            content: [
              {
                type: "text",
                text: `Multiple events found. Please use the specific event_id:\n\n${matches}`,
              },
            ],
            isError: true,
            details: {},
          };
        }

        // Delete the single matching event
        const eventToDelete = targetEvents[0];
        const success = removeEventFromFile(eventToDelete.filePath, eventToDelete.uid);

        if (success) {
          return {
            content: [
              {
                type: "text",
                text: `✅ Deleted event:\n📌 ${eventToDelete.event.summary}\n📅 ${eventToDelete.event.start.toLocaleString()}\n🆔 ${eventToDelete.uid}`,
              },
            ],
            details: {},
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `❌ Failed to delete event.`,
              },
            ],
            isError: true,
            details: {},
          };
        }
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

  // Register calendar_edit tool - Direct .ics manipulation
  pi.registerTool({
    name: "calendar_edit",
    label: "Edit Calendar Event",
    description: "Edit an existing calendar event using direct .ics file manipulation (since khal edit is interactive only).",
    parameters: Type.Object({
      event_id: Type.Optional(
        Type.String({ description: "Event UID to edit (use search to find)" })
      ),
      search_term: Type.Optional(
        Type.String({ description: "Search term to find event (if event_id not provided)" })
      ),
      calendar: Type.Optional(
        Type.String({
          description: "Calendar name (defaults to 'personal')",
          default: "personal",
        })
      ),
      new_title: Type.Optional(
        Type.String({ description: "New event title" })
      ),
      new_start: Type.Optional(
        Type.String({ description: "New start datetime (ISO format or natural language)" })
      ),
      new_end: Type.Optional(
        Type.String({ description: "New end datetime (ISO format or natural language)" })
      ),
      new_location: Type.Optional(
        Type.String({ description: "New location" })
      ),
      new_description: Type.Optional(
        Type.String({ description: "New description" })
      ),
    }),
    execute: async (_toolCallId: string, params: any) => {
      try {
        const calendar = (params.calendar as string) || "personal";
        const eventId = params.event_id as string | undefined;
        const searchTerm = params.search_term as string | undefined;

        if (!eventId && !searchTerm) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Either event_id or search_term must be provided.`,
              },
            ],
            isError: true,
            details: {},
          };
        }

        const calendarPath = getCalendarPath(calendar);
        
        if (!fs.existsSync(calendarPath)) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Calendar "${calendar}" not found at ${calendarPath}`,
              },
            ],
            isError: true,
            details: {},
          };
        }

        // Find the event
        let targetEvents;
        if (eventId) {
          targetEvents = findEvent(calendarPath, eventId);
        } else {
          targetEvents = findEvent(calendarPath, searchTerm!);
        }

        if (targetEvents.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No events found matching "${eventId || searchTerm}" in calendar "${calendar}".`,
              },
            ],
            isError: true,
            details: {},
          };
        }

        if (targetEvents.length > 1) {
          // Show multiple matches
          const matches = targetEvents.map((e, i) => 
            `${i + 1}. ${e.event.summary} (${e.event.start.toLocaleString()}) [UID: ${e.uid}]`
          ).join('\n');
          
          return {
            content: [
              {
                type: "text",
                text: `Multiple events found. Please use the specific event_id:\n\n${matches}`,
              },
            ],
            isError: true,
            details: {},
          };
        }

        // Edit the single matching event
        const eventToEdit = targetEvents[0];
        const evt = eventToEdit.event;

        // Build updated event data
        let newStart = evt.start;
        let newEnd = evt.end;

        if (params.new_start) {
          const startDate = new Date(params.new_start as string);
          if (!isNaN(startDate.getTime())) {
            newStart = startDate;
          }
        }

        if (params.new_end) {
          const endDate = new Date(params.new_end as string);
          if (!isNaN(endDate.getTime())) {
            newEnd = endDate;
          }
        } else if (params.new_start && !params.new_end) {
          // If only start changed, adjust end to keep same duration or default to 1 hour
          const duration = evt.end ? evt.end.getTime() - evt.start.getTime() : 3600000;
          newEnd = new Date(newStart.getTime() + duration);
        }

        const updatedEventData = {
          uid: eventToEdit.uid,
          summary: params.new_title || evt.summary,
          description: params.new_description !== undefined ? params.new_description : evt.description,
          location: params.new_location !== undefined ? params.new_location : evt.location,
          start: newStart,
          end: newEnd,
          timezone: evt.timezone || 'local',
          allDay: evt.allDay || false,
        };

        const success = updateEventFile(eventToEdit.filePath, eventToEdit.uid, updatedEventData);

        if (success) {
          let output = `✅ Updated event:\n📌 ${updatedEventData.summary}\n📅 ${newStart.toLocaleString()}`;
          if (updatedEventData.end) output += ` - ${updatedEventData.end.toLocaleString()}`;
          if (updatedEventData.location) output += `\n📍 ${updatedEventData.location}`;
          if (updatedEventData.description) output += `\n📝 ${updatedEventData.description}`;
          output += `\n🆔 ${eventToEdit.uid}`;

          return {
            content: [
              {
                type: "text",
                text: output,
              },
            ],
            details: {},
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `❌ Failed to update event.`,
              },
            ],
            isError: true,
            details: {},
          };
        }
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
