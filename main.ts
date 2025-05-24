import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";
import readline from "readline";

// You'll need to install and import your preferred LLM client
// Example with OpenAI (install: npm install openai)
import OpenAI from "openai";

// Example with Anthropic Claude (install: npm install @anthropic-ai/sdk)
// import Anthropic from '@anthropic-ai/sdk';

export class WeatherMCPClient {
  private client: Client;
  private serverProcess: any;
  private isConnected: boolean;
  private llmClient: any; // Your LLM client instance

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

    // Initialize your LLM client here
    // Example for OpenAI:
    this.llmClient = new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
  }

  async connect(serverPath = "./mcp/weather/server.ts") {
    try {
      console.log("Starting weather MCP server...", serverPath);
      this.serverProcess = spawn("bun", [serverPath], {
        stdio: ["pipe", "pipe", "inherit"],
      });

      const transport = new StdioClientTransport({
        command: "bun",
        args: [serverPath],
        // options: { stdio: ["pipe", "pipe", "inherit"] },
      });

      await this.client.connect(transport);
      this.isConnected = true;
      console.log("Connected to weather MCP server!");

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

  async callLLMWithTools(userMessage: string) {
    if (!this.isConnected) {
      throw new Error("Not connected to MCP server");
    }

    try {
      // Get available tools
      const tools = await this.listTools();

      // Create tool definitions for the LLM
      const toolDefinitions = tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema || {},
        },
      }));

      const systemPrompt = `You are a helpful weather assistant. You have access to weather tools that can provide current weather based on current location which tool automatically detects .

Available tools:
${tools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n")}

The weather data returned includes:
- city: The city name
- weather: Object containing arrays of time, temperature, and humidity data (hourly data)

When a user asks about weather, use the appropriate tool and then provide a helpful, natural language response about the weather conditions. Format your responses in a conversational and informative way. Include relevant details like trends, comparisons, or suggestions based on the weather data.`;

      // Example with OpenAI GPT

      const completion = await this.llmClient.chat.completions.create({
        model: "gemini-2.5-flash-preview-05-20",
        reasoning_effort: "low",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        tools: toolDefinitions,
        tool_choice: "auto",
      });

      const message = completion.choices[0].message;

      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];

        if (toolCall.function.name === "get_current_weather") {
          const weatherData = await this.getCurrentWeather();

          // Send the tool result back to the LLM for a natural response
          const followUpCompletion =
            await this.llmClient.chat.completions.create({
              model: "gemini-2.5-flash-preview-05-20",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage },
                message,
                {
                  role: "tool",
                  content: JSON.stringify(weatherData),
                  tool_call_id: toolCall.id,
                },
              ],
            });

          return followUpCompletion.choices[0].message.content;
        }
      }

      return message.content;
    } catch (error) {
      console.error("Error calling LLM with tools:", error);
      throw error;
    }
  }

  async formatWithLLM(
    weatherData: any,
    originalQuery: string
  ): Promise<string> {
    // This method calls LLM to format the weather data response
    const prompt = `User asked: "${originalQuery}"
Weather data for ${weatherData.city}:
${JSON.stringify(weatherData, null, 2)}

Please provide a natural, conversational response about the weather. Include relevant details from the data such as current conditions, trends over the next few hours, and any insights or recommendations based on the weather patterns. Make it friendly and informative.`;

    const response = await this.llmClient.chat.completions.create({
      model: "gemini-2.5-flash-preview-05-20",
      reasoning_effort: "low",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful weather assistant. Format weather data into natural, conversational responses.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 300,
    });

    return response.choices[0].message.content;
  }

  async disconnect() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
    this.isConnected = false;
    console.log("Disconnected from MCP server");
  }

  // Enhanced Interactive CLI with LLM integration
  async startInteractiveCLI() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("\n=== Weather MCP Client with LLM ===");
    console.log("Commands:");
    console.log("  current - Get current weather directly");
    console.log("  tools - List available tools");
    console.log(
      "  llm <message> - Chat with LLM (can use tools automatically)"
    );
    console.log("  quit - Exit the application");
    console.log("  help - Show this help message\n");
    console.log(
      "You can also just type natural language questions about weather!\n"
    );

    const promptUser = () => {
      rl.question("weather> ", async (input) => {
        const parts = input.trim().split(" ");
        const command = parts[0]?.toLowerCase();

        try {
          switch (command) {
            case "current":
              const currentWeather = await this.getCurrentWeather();
              const formattedResponse = await this.formatWithLLM(
                currentWeather,
                "What's the current weather?"
              );
              console.log(formattedResponse);
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

            case "llm":
              const llmMessage = parts.slice(1).join(" ");
              if (!llmMessage) {
                console.log("Please provide a message after 'llm'");
                break;
              }
              console.log("🤖 Processing with LLM...");
              const response = await this.callLLMWithTools(llmMessage);
              console.log("🤖:", response);
              break;

            case "quit":
            case "q":
              console.log("Goodbye!");
              rl.close();
              await this.disconnect();
              process.exit(0);

            case "help":
              console.log("Commands:");
              console.log("  current - Get current weather directly");
              console.log("  tools - List available tools");
              console.log("  llm <message> - Chat with LLM");
              console.log("  quit - Exit the application");
              break;

            default:
              // If it's not a command, treat it as a natural language query
              console.log("🤖 Processing with LLM...");
              const naturalResponse = await this.callLLMWithTools(input);
              console.log("🤖:", naturalResponse);
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
