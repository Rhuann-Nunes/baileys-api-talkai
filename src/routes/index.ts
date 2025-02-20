import { Router } from "express";
import chatRoutes from "./chats";
import groupRoutes from "./groups";
import messageRoutes from "./messages";
import sessionRoutes from "./sessions";
import contactRoutes from "./contacts";
import { apiKeyValidator } from "@/middlewares/api-key-validator";

const router = Router();

// Health check route - no authentication required
router.get("/", (_, res) => {
  res.status(200).json({
    status: "ok",
    service: "baileys-api",
    timestamp: new Date().toISOString()
  });
});

// Protected routes
router.use("/sessions", apiKeyValidator, sessionRoutes);
router.use("/:sessionId/chats", apiKeyValidator, chatRoutes);
router.use("/:sessionId/contacts", apiKeyValidator, contactRoutes);
router.use("/:sessionId/groups", apiKeyValidator, groupRoutes);
router.use("/:sessionId/messages", apiKeyValidator, messageRoutes);

export default router;
