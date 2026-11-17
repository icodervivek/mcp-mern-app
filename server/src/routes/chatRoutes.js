import express from "express";

import { chatWithMcp } from "../controllers/chatController.js";

const router = express.Router();

router.post("/", chatWithMcp);

export default router;
