//server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

//services
import { weatherService } from "./weather-service";
import { writeFileService, readFileService } from "./file-service";

class MCPToolServer {
  private server: Server;
  constructor() {
    this.server = new Server(
      {
        name: "mcp-tool-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "get_current_weather",
            description: "Get the current location temperature and humidity and the next 4 hours",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
              additionalProperties: false,
            },
          },
          {
            name: "write_file",
            description: "Write content to a file (supports HTML, CSS, JS,Python etc.)",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "The file path where content should be written",
                },
                content: {
                  type: "string",
                  description: "The content to write to the file",
                },
                createDirectories: {
                  type: "boolean",
                  description:
                    "Whether to create parent directories if they don't exist (default: true)",
                  default: true,
                },
              },
              required: ["path", "content"],
              additionalProperties: false,
            },
          },
          {
            name: "read_file",
            description: "Read content from a file",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "The file path to read from",
                },
              },
              required: ["path"],
              additionalProperties: false,
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        switch (name) {
          case "get_current_weather": {
            const result = await weatherService();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }
          case "write_file": {
            const {
              path,
              content,
              createDirectories = true,
            } = args as {
              path: string;
              content: string;
              createDirectories?: boolean;
            };

            const result = await writeFileService({ path, content, createDirectories });
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }
          case "read_file": {
            const { path } = args as { path: string };

            const result = await readFileService(path);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error: any) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Tool execution error: ${error.message}`);
      }
    });
  }
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Weather MCP server running on stdio (this is not error even though its red)");
  }
}

const server = new MCPToolServer();
server.run().catch(console.error);
