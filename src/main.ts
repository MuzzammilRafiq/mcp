//main.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";
import readline from "readline";

import OpenAI from "openai";

export class MCPToolClient {
  private client: Client;
  private serverProcess: any;
  private isConnected: boolean;
  private llmClient: any;

  constructor() {
    this.client = new Client(
      {
        name: "mcp-tool-client",
        version: "0.1.0",
      },
      {
        capabilities: {},
      }
    );
    this.serverProcess = null;
    this.isConnected = false;

    this.llmClient = new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
  }

  async connect(serverPath = "./mcp/server.ts") {
    try {
      console.log("Starting MCP tool server...", serverPath);
      this.serverProcess = spawn("bun", [serverPath], {
        stdio: ["pipe", "pipe", "inherit"],
      });

      const transport = new StdioClientTransport({
        command: "bun",
        args: [serverPath],
      });

      await this.client.connect(transport);
      this.isConnected = true;
      console.log("Connected to MCP tool server!");

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
      if (!response.content || !Array.isArray(response.content) || !response.content[0]?.text) {
        throw new Error("Invalid response format");
      }
      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error("Error getting current weather:", error);
      throw error;
    }
  }

  async writeFile(path: string, content: string, createDirectories: boolean = true) {
    if (!this.isConnected) {
      throw new Error("Not connected to MCP server");
    }

    try {
      const response = await this.client.callTool({
        name: "write_file",
        arguments: { path, content, createDirectories },
      });

      if (!response.content || !Array.isArray(response.content) || !response.content[0]?.text) {
        throw new Error("Invalid response format");
      }
      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error("Error writing file:", error);
      throw error;
    }
  }

  async readFile(path: string) {
    if (!this.isConnected) {
      throw new Error("Not connected to MCP server");
    }

    try {
      const response = await this.client.callTool({
        name: "read_file",
        arguments: { path },
      });

      if (!response.content || !Array.isArray(response.content) || !response.content[0]?.text) {
        throw new Error("Invalid response format");
      }
      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error("Error reading file:", error);
      throw error;
    }
  }

  async processUserRequest(userMessage: string) {
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

      const systemPrompt = `You are a helpful assistant with access to various tools. Use them automatically when needed based on user requests.

Available tools:
- get_current_weather: Use when user asks about weather, temperature, humidity, or current conditions
- write_file: Use when user wants to create files, write code, save content to files, or mentions file extensions like .html, .css, .js, .py, etc.
- read_file: Use when user wants to see file contents or asks about existing files

IMPORTANT GUIDELINES:
- For weather requests: Always use get_current_weather tool
- For code/file creation requests: Always use write_file tool with appropriate filename and extension
- When writing files, suggest good filenames if user doesn't specify (e.g., "index.html", "styles.css", "script.js")
- If user says "create", "write", "make a file", "save to", or mentions file extensions, use write_file
- Provide helpful responses explaining what you did

Examples:
- "What's the weather?" → use get_current_weather
- "Create an HTML page" → use write_file with HTML content
- "Make a CSS file for styling" → use write_file with CSS content
- "Write a Python script" → use write_file with Python code
- "Show me the contents of file.txt" → use read_file`;

      const completion = await this.llmClient.chat.completions.create({
        model: "gemini-2.5-flash-preview-05-20",
        reasoning_effort: "none",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        tools: toolDefinitions,
        tool_choice: "auto",
      });

      const message = completion.choices[0].message;

      if (message.tool_calls && message.tool_calls.length > 0) {
        // Handle tool calls
        const toolMessages = [message];

        for (const toolCall of message.tool_calls) {
          let toolResult;

          try {
            switch (toolCall.function.name) {
              case "get_current_weather":
                console.log("🌤️ Getting current weather...");
                toolResult = await this.getCurrentWeather();
                break;

              case "write_file":
                const writeArgs = JSON.parse(toolCall.function.arguments);
                console.log(`📝 Writing to file: ${writeArgs.path}`);
                toolResult = await this.writeFile(
                  writeArgs.path,
                  writeArgs.content,
                  writeArgs.createDirectories
                );
                break;

              case "read_file":
                const readArgs = JSON.parse(toolCall.function.arguments);
                console.log(`📖 Reading file: ${readArgs.path}`);
                toolResult = await this.readFile(readArgs.path);
                break;

              default:
                toolResult = { error: `Unknown tool: ${toolCall.function.name}` };
            }
          } catch (error: any) {
            toolResult = { error: error.message };
          }

          toolMessages.push({
            role: "tool",
            content: JSON.stringify(toolResult),
            tool_call_id: toolCall.id,
          });
        }

        // Send tool results back to LLM for final response
        const followUpCompletion = await this.llmClient.chat.completions.create({
          model: "gemini-2.5-flash-preview-05-20",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
            ...toolMessages,
          ],
        });

        return followUpCompletion.choices[0].message.content;
      }

      return message.content;
    } catch (error) {
      console.error("Error processing user request:", error);
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

  async startInteractiveCLI() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("\n=== Intelligent MCP Assistant ===");
    console.log("Just ask me naturally! I can help with:");
    console.log("🌤️  Weather information");
    console.log("📝 Creating and writing files (HTML, CSS, JS, Python, etc.)");
    console.log("📖 Reading existing files");
    console.log("\nExamples:");
    console.log('• "What\'s the weather like?"');
    console.log('• "Create a simple HTML page"');
    console.log('• "Make a CSS file with basic styling"');
    console.log('• "Write a Python hello world script"');
    console.log('• "Show me the contents of index.html"');
    console.log("\nType 'quit' to exit\n");

    const promptUser = () => {
      rl.question("🤖 Ask me anything: ", async (input) => {
        const trimmedInput = input.trim();

        if (trimmedInput.toLowerCase() === "quit" || trimmedInput.toLowerCase() === "q") {
          console.log("Goodbye! 👋");
          rl.close();
          await this.disconnect();
          process.exit(0);
        }

        if (!trimmedInput) {
          promptUser();
          return;
        }

        try {
          console.log("🤖 Processing your request...\n");
          const response = await this.processUserRequest(trimmedInput);
          console.log("🤖:", response);
          console.log(); // Add spacing
        } catch (error: any) {
          console.error("❌ Error:", error.message);
        }

        promptUser();
      });
    };

    promptUser();
  }
}

// CLI usage
async function main() {
  const client = new MCPToolClient();

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
