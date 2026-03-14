import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config();

console.log("Starting server script...");
console.log("NODE_ENV:", process.env.NODE_ENV);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  console.log("Initializing database...");
  let db: Database.Database;
  try {
    // Use an absolute path for the database to avoid issues in different environments
    const dbPath = path.resolve(process.cwd(), "database.sqlite");
    console.log(`Database path: ${dbPath}`);
    db = new Database(dbPath);
    console.log("Database initialized successfully");
  } catch (err) {
    console.error("Failed to initialize database:", err);
    // Fallback to in-memory if disk is not writable, to prevent crash
    console.log("Falling back to in-memory database...");
    db = new Database(":memory:");
  }

  // Initialize database
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      name TEXT,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      prompt_tokens INTEGER,
      candidates_tokens INTEGER,
      total_tokens INTEGER,
      action TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  // Migration: Add role column if it doesn't exist
  try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all() as any[];
    const hasRole = tableInfo.some(col => col.name === 'role');
    if (!hasRole) {
      console.log("Adding 'role' column to users table...");
      db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
    }
  } catch (err) {
    console.error("Migration error:", err);
  }

  const app = express();
  const PORT = 3000;

  // Root health check
  app.get("/healthz", (req, res) => res.send("ok"));
  app.post("/api/test", (req, res) => res.json({ ok: true, body: req.body }));

  app.use(express.json());

  // Simple CORS middleware
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Request logger
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    // Log headers in dev or if specifically debugging
    if (process.env.NODE_ENV !== 'production') {
      console.log("Headers:", JSON.stringify(req.headers));
    }
    next();
  });

  // Auth API Routes
  app.post(["/api/auth/signup", "/api/auth/signup/"], (req, res) => {
    const { email, password, name } = req.body;
    console.log(`Signup attempt for: ${email}`);
    try {
      // Check if this is the first user, if so make them admin
      const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as any;
      const role = userCount.count === 0 ? 'admin' : 'user';

      const stmt = db.prepare("INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)");
      const result = stmt.run(email, password, name, role);
      console.log(`Signup successful for: ${email}`);
      res.json({ success: true, user: { email, name, id: result.lastInsertRowid, role } });
    } catch (err: any) {
      console.error("Signup error:", err);
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        res.status(400).json({ error: "An account with this email already exists." });
      } else {
        res.status(500).json({ error: `Internal server error: ${err.message}` });
      }
    }
  });

  app.post(["/api/auth/login", "/api/auth/login/"], (req, res) => {
    const { email, password } = req.body;
    console.log(`Login attempt for: ${email}`);
    try {
      const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
      const user = stmt.get(email) as any;
      
      if (!user) {
        console.log(`Login failed: Account not found for ${email}`);
        return res.status(404).json({ error: "Account not found. Please sign up first." });
      }
      
      if (user.password !== password) {
        console.log(`Login failed: Invalid password for ${email}`);
        return res.status(401).json({ error: "Invalid password. Please try again." });
      }
      
      console.log(`Login successful for: ${email}`);
      res.json({ success: true, user: { email: user.email, name: user.name, id: user.id, role: user.role } });
    } catch (err: any) {
      console.error("Login error:", err);
      res.status(500).json({ error: `Internal server error: ${err.message}` });
    }
  });

  // Token Usage Logging
  app.post(["/api/usage/log", "/api/usage/log/"], (req, res) => {
    const { userId, promptTokens, candidatesTokens, totalTokens, action } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO token_usage (user_id, prompt_tokens, candidates_tokens, total_tokens, action) VALUES (?, ?, ?, ?, ?)");
      stmt.run(userId, promptTokens, candidatesTokens, totalTokens, action);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to log usage" });
    }
  });

  // Admin Usage Stats
  app.get("/api/admin/usage", (req, res) => {
    try {
      const stats = db.prepare(`
        SELECT 
          tu.*, 
          u.name as userName, 
          u.email as userEmail 
        FROM token_usage tu
        JOIN users u ON tu.user_id = u.id
        ORDER BY tu.created_at DESC
      `).all();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Catch-all for unhandled API routes to ensure they always return JSON
  app.all("/api/*", (req, res) => {
    console.warn(`[404 API] ${req.method} ${req.url}`);
    res.status(404).json({ 
      error: `API route ${req.method} ${req.url} not found`,
      suggestion: "Check if the route is defined correctly in server.ts"
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    const indexPath = path.resolve(distPath, "index.html");
    
    console.log(`Production mode: Serving static files from ${distPath}`);
    
    // Verify dist folder exists
    import("fs").then(fs => {
      if (!fs.existsSync(distPath)) {
        console.error(`ERROR: dist directory not found at ${distPath}`);
      } else if (!fs.existsSync(indexPath)) {
        console.error(`ERROR: index.html not found at ${indexPath}`);
      } else {
        console.log("Static assets verified.");
      }
    });

    app.use(express.static(distPath));
    
    app.get('*', (req, res) => {
      // Check if the request is for an API route that was missed
      if (req.url.startsWith('/api/')) {
        return res.status(404).json({ error: `API route ${req.url} not found` });
      }
      
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error(`Error sending index.html:`, err);
          if (!res.headersSent) {
            res.status(500).send("Internal Server Error: Static files could not be served.");
          }
        }
      });
    });
  }

  // Final 404 handler for anything not caught
  app.use((req, res) => {
    console.warn(`[404] ${req.method} ${req.url}`);
    if (req.accepts('json') || req.url.startsWith('/api/')) {
      res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
    } else {
      res.status(404).send("Page not found");
    }
  });

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("GLOBAL ERROR:", err);
    res.status(500).json({ 
      error: "Internal Server Error", 
      message: err.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack 
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is listening on 0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
