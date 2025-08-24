import express from "express";
import cors from "cors";
// This MUST be here, at the top.

import authRouter from "./auth.js";
import { authMiddleware } from "./middleware.js";
import filesRouter from "./files.js";

const app = express();
const port = process.env.PORT || 8080;

// Middleware to parse JSON bodies
app.use(
  cors({
    origin: [
      "https://drive-clone-frontend-sand.vercel.app/",
      "http://localhost:5173",
    ],
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());
// API Routes
app.use("/auth", authRouter);
app.use("/files", filesRouter);

// Example Protected Route for testing the middleware
app.get("/protected-route", authMiddleware, (req, res) => {
  // Because of the middleware, we can safely access req.user
  const user = (req as any).user;
  res.send(
    `✅ Welcome user ${user.email}! You have accessed a protected route.`
  );
});

app.get("/", (req, res) => {
  res.send("Backend Server is Running!");
});

app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
