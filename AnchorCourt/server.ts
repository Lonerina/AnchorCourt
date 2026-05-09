import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Client as NotionClient } from "@notionhq/client";
import { google } from "googleapis";
import admin from "firebase-admin";
import firebaseConfig from "./firebase-applet-config.json";

// Initialize Firebase Admin
admin.initializeApp({
  projectId: firebaseConfig.projectId,
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Middleware to verify Firebase Auth Token
  const authenticateToken = async (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: "No token provided" });

    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = decodedToken;
      next();
    } catch (error) {
      res.status(403).json({ error: "Invalid token" });
    }
  };

  // Notion Proxy
  app.post("/api/notion/search", authenticateToken, async (req: any, res) => {
    const userId = req.user.uid;
    let apiKey = process.env.NOTION_API_KEY;

    try {
      // Try to fetch user-specific key from Firestore
      const firestore = admin.firestore() as any;
      const userDoc = await firestore
        .doc(`users/${userId}/private/integrations`)
        .get();
      
      const notionData = userDoc.data()?.notion;
      if (notionData?.apiKey) {
        apiKey = notionData.apiKey;
      }
    } catch (e) {
      console.warn("Failed to fetch user notion key, falling back to global:", e);
    }

    if (!apiKey) {
      return res.status(401).json({ error: "Notion API key not configured for this user" });
    }

    const notion = new NotionClient({ auth: apiKey });
    try {
      const response = await notion.search({
        query: req.body.query,
        sort: { direction: "descending", timestamp: "last_edited_time" },
      });
      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/notion/create", authenticateToken, async (req: any, res) => {
    const userId = req.user.uid;
    const { parentId, title, content } = req.body;
    let apiKey = process.env.NOTION_API_KEY;

    try {
      const firestore = admin.firestore() as any;
      const userDoc = await firestore.doc(`users/${userId}/private/integrations`).get();
      if (userDoc.data()?.notion?.apiKey) apiKey = userDoc.data()?.notion.apiKey;

      if (!apiKey) return res.status(401).json({ error: "Notion not connected" });

      const notion = new NotionClient({ auth: apiKey });
      const response = await notion.pages.create({
        parent: { page_id: parentId },
        properties: {
          title: {
            title: [{ text: { content: title } }]
          }
        },
        children: content ? [{
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content } }] }
        }] : []
      });
      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/notion/comment", authenticateToken, async (req: any, res) => {
    const userId = req.user.uid;
    const { pageId, text } = req.body;
    let apiKey = process.env.NOTION_API_KEY;

    try {
      const firestore = admin.firestore() as any;
      const userDoc = await firestore.doc(`users/${userId}/private/integrations`).get();
      if (userDoc.data()?.notion?.apiKey) apiKey = userDoc.data()?.notion.apiKey;
      if (!apiKey) return res.status(401).json({ error: "Notion not connected" });

      const notion = new NotionClient({ auth: apiKey });
      const response = await notion.comments.create({
        parent: { page_id: pageId },
        rich_text: [{ text: { content: text } }]
      });
      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/notion/update", authenticateToken, async (req: any, res) => {
    const userId = req.user.uid;
    const { pageId, title, archived } = req.body;
    let apiKey = process.env.NOTION_API_KEY;

    try {
      const firestore = admin.firestore() as any;
      const userDoc = await firestore.doc(`users/${userId}/private/integrations`).get();
      if (userDoc.data()?.notion?.apiKey) apiKey = userDoc.data()?.notion.apiKey;
      if (!apiKey) return res.status(401).json({ error: "Notion not connected" });

      const notion = new NotionClient({ auth: apiKey });
      const response = await notion.pages.update({
        page_id: pageId,
        properties: title ? {
          title: {
            title: [{ text: { content: title } }]
          }
        } : undefined,
        archived: archived
      });
      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/google/drive/search", authenticateToken, async (req: any, res) => {
    const userId = req.user.uid;
    const { query } = req.body;
    
    try {
      const firestore = admin.firestore() as any;
      const userDoc = await firestore.doc(`users/${userId}/private/integrations`).get();
      const googleData = userDoc.data()?.google;

      if (!googleData?.accessToken) return res.status(401).json({ error: "Google not connected" });

      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      oauth2Client.setCredentials({
        access_token: googleData.accessToken,
        refresh_token: googleData.refreshToken
      });

      const drive = google.drive({ version: "v3", auth: oauth2Client });
      const response = await drive.files.list({
        q: query ? `name contains '${query}'` : undefined,
        fields: "files(id, name, mimeType, webViewLink)",
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/google/calendar/events", authenticateToken, async (req: any, res) => {
    const userId = req.user.uid;
    
    try {
      const firestore = admin.firestore() as any;
      const userDoc = await firestore.doc(`users/${userId}/private/integrations`).get();
      const googleData = userDoc.data()?.google;

      if (!googleData?.accessToken) return res.status(401).json({ error: "Google not connected" });

      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      oauth2Client.setCredentials({
        access_token: googleData.accessToken,
        refresh_token: googleData.refreshToken
      });

      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: new Date().toISOString(),
        maxResults: 10,
        singleEvents: true,
        orderBy: "startTime",
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/google/gmail/list", authenticateToken, async (req: any, res) => {
    const userId = req.user.uid;
    const { query } = req.body;
    
    try {
      const firestore = admin.firestore() as any;
      const userDoc = await firestore.doc(`users/${userId}/private/integrations`).get();
      const googleData = userDoc.data()?.google;

      if (!googleData?.accessToken) return res.status(401).json({ error: "Google not connected" });

      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      oauth2Client.setCredentials({
        access_token: googleData.accessToken,
        refresh_token: googleData.refreshToken
      });

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const response = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 10
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
