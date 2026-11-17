
import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";

import * as z from "zod/v4";

const PORT = Number(process.env.PORT) || 5001;

const API_BASE_URL =
  process.env.API_BASE_URL || "http://127.0.0.1:5000";

// ------------------------------------------
// Helper: Call Express REST API
// ------------------------------------------

async function callApi(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);

  const text = await response.text();

  let result: any;

  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { message: text };
  }

  if (!response.ok) {
    throw new Error(
      result.message || `Backend error: ${response.status}`
    );
  }

  return result;
}

// ------------------------------------------
// Helper: MCP tool error response
// ------------------------------------------

function toolError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unknown error";

  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
  };
}

// ------------------------------------------
// Create MCP Server
// ------------------------------------------

function createTaskServer() {
  const server = new McpServer({
    name: "mern-task-manager",
    version: "1.0.0",
  });

  // TOOL 1: Get all tasks

  server.registerTool(
    "get_all_tasks",
    {
      description: "Retrieve all tasks from the database.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await callApi("/api/tasks");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.data, null, 2),
            },
          ],
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  // TOOL 2: Create task

  server.registerTool(
    "create_task",
    {
      description: "Create a new task.",
      inputSchema: {
        title: z.string().trim().min(1),
        description: z.string().optional(),
      },
    },
    async ({ title, description }) => {
      try {
        const result = await callApi("/api/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            description,
          }),
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.data, null, 2),
            },
          ],
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  // TOOL 3: Get task by ID

  server.registerTool(
    "get_task_by_id",
    {
      description: "Retrieve a task using its MongoDB ID.",
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async ({ id }) => {
      try {
        const result = await callApi(
          `/api/tasks/${encodeURIComponent(id)}`
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.data, null, 2),
            },
          ],
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  // TOOL 4: Update task

  server.registerTool(
    "update_task",
    {
      description: "Update an existing task.",
      inputSchema: {
        id: z.string().min(1),
        title: z.string().trim().min(1).optional(),
        description: z.string().optional(),
        status: z.enum(["pending", "completed"]).optional(),
      },
    },
    async ({ id, ...updates }) => {
      try {
        if (Object.keys(updates).length === 0) {
          throw new Error("Provide at least one field to update.");
        }

        const result = await callApi(
          `/api/tasks/${encodeURIComponent(id)}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updates),
          }
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.data, null, 2),
            },
          ],
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  // TOOL 5: Delete task

  server.registerTool(
    "delete_task",
    {
      description: "Delete a task using its MongoDB ID.",
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async ({ id }) => {
      try {
        const result = await callApi(
          `/api/tasks/${encodeURIComponent(id)}`,
          {
            method: "DELETE",
          }
        );

        return {
          content: [
            {
              type: "text",
              text: result.message || "Task deleted successfully.",
            },
          ],
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  return server;
}

// ------------------------------------------
// Stateless Streamable HTTP
// ------------------------------------------

const app = createMcpExpressApp({
  host: "127.0.0.1",
});

app.post("/mcp", async (req, res) => {
  const server = createTaskServer();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined!,
  });

  // Register cleanup before handling the request
  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal MCP server error",
        },
        id: null,
      });
    }

    await transport.close();
    await server.close();
  }
});

// Stateless server does not maintain GET streams or sessions.

app.get("/mcp", (_req, res) => {
  res.status(405).json({
    error: "GET is not supported by this stateless MCP server.",
  });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({
    error: "Session termination is not supported in stateless mode.",
  });
});

app.get("/", (_req, res) => {
  res.json({
    name: "MERN Task Manager MCP Server",
    status: "running",
    transport: "Streamable HTTP",
    mode: "stateless",
    endpoint: "/mcp",
  });
});

// ------------------------------------------
// Start Server
// ------------------------------------------

app.listen(PORT, "127.0.0.1", () => {
  console.log(`MCP Server running on port ${PORT}`);
  console.log(`MCP Endpoint: http://127.0.0.1:${PORT}/mcp`);
});
