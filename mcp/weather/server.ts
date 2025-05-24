import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { weatherService } from "./service";

class WeatherServer {
  private server: Server;
  constructor() {
    this.server = new Server(
      {
        name: "weather-server",
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
            description:
              "Get the current location temperature and humidity and the next 4 hours",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
              additionalProperties: false,
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (name === "get_current_weather") {
          const result = await weatherService();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } else {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error: any) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution error: ${error.message}`
        );
      }
    });
  }
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(
      "Weather MCP server running on stdio (this is not error even though its red)"
    );
  }
}

const server = new WeatherServer();
server.run().catch(console.error);
