import express from "express";
import cors from "cors";
import { PORT } from "./config/env";
import bucketRoutes from "./routes/bucket.routes";
import deployRoutes from "./routes/deploy.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/bucket", bucketRoutes);
app.use("/api/deploy", deployRoutes);

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
