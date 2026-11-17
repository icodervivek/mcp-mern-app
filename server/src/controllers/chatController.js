import { GoogleGenAI } from "@google/genai";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";

import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// ------------------------------------------
// Gemini configuration
// ------------------------------------------

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL ||
  "http://127.0.0.1:5001/mcp";

// ------------------------------------------
// Format MCP result for Gemini
// ------------------------------------------

function formatToolResult(result) {
  return {
    isError: Boolean(result.isError),
    content: (result.content || [])
      .map((item) => {
        if (item.type === "text") {
          return item.text;
        }

        return `[${item.type} content]`;
      })
      .join("\n"),
    ...(result.structuredContent
      ? { structuredContent: result.structuredContent }
      : {}),
  };
}

// ------------------------------------------
// Main Chat Controller
// ------------------------------------------

export const chatWithMcp = async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid message.",
    });
  }

  if (message.length > 4000) {
    return res.status(400).json({
      success: false,
      message: "Message is too long. Maximum is 4000 characters.",
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      success: false,
      message: "GEMINI_API_KEY is not configured.",
    });
  }

  // MCP client and transport
  const mcpClient = new Client({
    name: "mern-task-ai-client",
    version: "1.0.0",
  });

  const transport = new StreamableHTTPClientTransport(
    new URL(MCP_SERVER_URL)
  );

  try {
    // 1. Connect to MCP server
    await mcpClient.connect(transport);

    console.log("Connected to MCP server");

    // 2. Initialize Gemini
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    // 3. Discover available MCP tools
    const { tools } = await mcpClient.listTools();

    console.log(
      "Discovered MCP tools:",
      tools.map((tool) => tool.name)
    );

    // 4. Convert MCP tools into Gemini function declarations
    const functionDeclarations = tools.map((tool) => ({
      name: tool.name,
      description: tool.description || tool.name,
      parametersJsonSchema: tool.inputSchema,
    }));

    // 5. Initial conversation
    const contents = [
      {
        role: "user",
        parts: [
          {
            text: message.trim(),
          },
        ],
      },
    ];

    let finalAnswer = "";

    // 6. Tool-calling loop
    // Limit iterations to avoid endless tool execution.
    for (let iteration = 0; iteration < 6; iteration++) {
      const response = await ai.models.generateContent({
        model: MODEL,

        contents,

        config: {
          systemInstruction: `
            You are an AI assistant for a MERN Task Manager.

            You can manage tasks using the available MCP tools.

            Rules:
            - Use MCP tools whenever the user asks about actual tasks.
            - Never invent task records or MongoDB IDs.
            - Use the actual tool result when answering.
            - For task creation, use create_task.
            - For task retrieval, use get_all_tasks or get_task_by_id.
            - For task updates, use update_task.
            - Only delete a task when the user explicitly requests deletion.
            - Do not claim an operation succeeded unless the tool confirms it.
            - If an operation fails, explain the error.
            - Respond in clear, natural language.
          `,

          tools: [
            {
              functionDeclarations,
            },
          ],
        },
      });

      // 7. Check whether Gemini wants to call tools
      const functionCalls = response.functionCalls || [];

      // No tool calls: Gemini has generated the final response
      if (functionCalls.length === 0) {
        finalAnswer =
          response.text || "I couldn't generate a response.";

        break;
      }

      // Add Gemini's function-call message to conversation history
      const modelContent = response.candidates?.[0]?.content;

      if (modelContent) {
        contents.push(modelContent);
      }

      // 8. Execute MCP tools sequentially
      const functionResponseParts = [];

      for (const functionCall of functionCalls) {
        console.log(
          "Gemini requested MCP tool:",
          functionCall.name
        );

        try {
          const toolResult = await mcpClient.callTool({
            name: functionCall.name,
            arguments: functionCall.args || {},
          });

          functionResponseParts.push({
            functionResponse: {
              name: functionCall.name,
              response: {
                result: formatToolResult(toolResult),
              },
              ...(functionCall.id
                ? { id: functionCall.id }
                : {}),
            },
          });
        } catch (error) {
          functionResponseParts.push({
            functionResponse: {
              name: functionCall.name,
              response: {
                error:
                  error instanceof Error
                    ? error.message
                    : "Tool execution failed",
              },
              ...(functionCall.id
                ? { id: functionCall.id }
                : {}),
            },
          });
        }
      }

      // 9. Send tool results back to Gemini
      contents.push({
        role: "user",
        parts: functionResponseParts,
      });
    }

    if (!finalAnswer) {
      finalAnswer =
        "I reached the maximum number of tool-calling rounds. Please try a simpler request.";
    }

    return res.status(200).json({
      success: true,
      reply: finalAnswer,
    });
  } catch (error) {
    console.error("AI/MCP error:", error);

    return res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Something went wrong.",
    });
  } finally {
    // 10. Always close the MCP connection
    try {
      await mcpClient.close();
    } catch (error) {
      console.error("MCP client cleanup error:", error);
    }
  }
};
