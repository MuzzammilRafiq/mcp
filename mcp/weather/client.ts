import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";
import readline from "readline";

export class WeatherMCPClient {
  private client: Client;
  private serverProcess: any;
  private isConnected: boolean;
  constructor() {
    this.client = new Client(
      {
        name: "weather-client",
        version: "0.1.0",
      },
      {
        capabilities: {},
      }
    );
    this.serverProcess = null;
    this.isConnected = false;
  }

  async connect(serverPath = "./mcp/weather/server.ts") {
    try {
      console.log("Starting weather MCP server...", serverPath);
      this.serverProcess = spawn("bun", [serverPath], {
        stdio: ["pipe", "pipe", "inherit"],
      });

      // Create transport using the server process stdio
      const transport = new StdioClientTransport({
        command: "bun", // The command to execute
        args: [serverPath], // The arguments for the command
        // options: { stdio: ["pipe", "pipe", "inherit"] }, // Stdio configuration for the spawned process
      });

      // Connect to the server
      await this.client.connect(transport);
      this.isConnected = true;
      console.log("Connected to weather MCP server!");

      // Handle server process errors
      this.serverProcess.on("error", (error: any) => {
        console.error("Server process error:", error);
        this.isConnected = false;
      });

      this.serverProcess.on("exit", (code: any) => {
        console.log(`Server process exited with code ${code}`);
        this.isConnected = false;
      });
    } catch (error) {
      console.error("Failed to connect to MCP server:", error);
      throw error;
    }
  }

  async listTools() {
    if (!this.isConnected) {
      throw new Error("Not connected to MCP server");
    }

    try {
      const response = await this.client.listTools();
      return response.tools;
    } catch (error) {
      console.error("Error listing tools:", error);
      throw error;
    }
  }

  async getCurrentWeather() {
    if (!this.isConnected) {
      throw new Error("Not connected to MCP server");
    }

    try {
      const response = await this.client.callTool({
        name: "get_current_weather",
        arguments: {},
      });
      if (
        !response.content ||
        !Array.isArray(response.content) ||
        !response.content[0]?.text
      ) {
        throw new Error("Invalid response format");
      }
      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error("Error getting current weather:", error);
      throw error;
    }
  }

  async disconnect() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
    this.isConnected = false;
    console.log("Disconnected from MCP server");
  }

  // Interactive CLI for testing
  async startInteractiveCLI() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("\n=== Weather MCP Client CLI ===");
    console.log("Commands:");
    console.log("  current Get current weather");
    console.log("  tools - List available tools");
    console.log("  quit - Exit the application");
    console.log("  help - Show this help message\n");

    const promptUser = () => {
      rl.question("weather> ", async (input) => {
        const parts = input.trim().split(" ");
        const command = parts[0]?.toLowerCase();

        try {
          switch (command) {
            case "current":
              const currentWeather = await this.getCurrentWeather();
              console.log(currentWeather);
              break;

            case "tools":
              console.log("Available tools:");
              const tools = await this.listTools();
              tools.forEach((tool) => {
                console.log(`\n- ${tool.name}: ${tool.description}`);
                console.log(
                  `  Input schema: ${JSON.stringify(tool.inputSchema, null, 2)}`
                );
              });
              break;

            case "q":
              console.log("Goodbye!");
              rl.close();
              await this.disconnect();
              process.exit(0);
            default:
              console.log(
                `Unknown command: ${command}. Type 'help' for available commands.`
              );
              break;
          }
        } catch (error: any) {
          console.error("Error:", error.message);
        }
        promptUser();
      });
    };
    promptUser();
  }
}

// CLI usage
async function main() {
  const client = new WeatherMCPClient();

  try {
    await client.connect();
    await client.startInteractiveCLI();
  } catch (error) {
    console.error("Application error:", error);
    await client.disconnect();
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  process.exit(0);
});

// if __name__ == "__main__":
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
