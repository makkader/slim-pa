import { search, translate } from "@navetacandra/ddg";
import minimist from "minimist";

// Parse command line arguments using minimist
const args = minimist(process.argv.slice(2), {
  alias: {
    h: "help",
  },
  string: ["type"],
  default: {
    type: "web"
  }
});

// Help message
const helpMessage = [
  "Usage: node web_search.js <query> [--type \"web|image|video|news\"]",
  "Options:",
  "  --type, -t Search type (web, image, video, news) - defaults to 'web'",
  "  --help, -h Show this help message"
];

// Handle help
if (args.help) {
  console.log(helpMessage.join("\n"));
  process.exit(0);
}

// Validate query
if (!args._ || args._.length === 0) {
  console.error("Error: Query argument is required");
  console.log(helpMessage.join("\n"));
  process.exit(1);
}

// Get query
const query = args._[0];

// Validate type
const validTypes = ["web", "image", "video", "news"];
if (!validTypes.includes(args.type)) {
  console.error(`Error: Invalid type '${args.type}'. Valid types are: ${validTypes.join(", ")}`);
  console.log(helpMessage.join("\n"));
  process.exit(1);
}

const result = await search({ query }, args.type);
console.log(result);
