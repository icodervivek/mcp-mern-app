import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import connectDB from "./config/db.js";
import taskRoutes from "./src/routes/taskRoutes.js";
import chatRoutes from "./src/routes/chatRoutes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "MERN MCP Task Manager API is running" });
});

app.use("/api/tasks", taskRoutes);
app.use("/api/chat", chatRoutes);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
