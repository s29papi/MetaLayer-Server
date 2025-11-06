const express = require("express");
const cors = require("cors");
const { Indexer } = require("@0glabs/0g-ts-sdk");
const { ethers } = require("ethers");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");

// Import the problematic package with error handling
let detectFileCtxFromName: any;
let MetaLayerClient: any;
let NETWORKS: any;

try {
  const metalayer = require("@searchboxlabs/metalayer");
  detectFileCtxFromName = metalayer.detectFileCtxFromName;
  MetaLayerClient = metalayer.MetaLayerClient;
  NETWORKS = metalayer.NETWORKS;
} catch (error) {
  console.warn("Failed to load @searchboxlabs/metalayer, using fallbacks:", error);
  // Fallback implementations
  detectFileCtxFromName = (fileName: string, creator: string) => ({
    fileName,
    creator,
    timestamp: Date.now()
  });
  MetaLayerClient = class {
    constructor() {
      console.log("Using fallback MetaLayerClient");
    }
  };
  NETWORKS = {};
}

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for specific origins
app.use(cors({
  origin: ['https://metalayer-indexer.lovable.app', 'http://localhost:3000'],
  credentials: true
}));

// --- Network configuration ---
const TESTNET_INDEXER_RPC = "https://indexer-storage-turbo.0g.ai";
const INDEXER_RPC = TESTNET_INDEXER_RPC;

// --- Initialize provider and signer ---
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) throw new Error("Missing PRIVATE_KEY in environment!");

const client = new MetaLayerClient();
const indexer = new Indexer(INDEXER_RPC);

app.use(express.json({ limit: '50mb' }));

// --- Upload endpoint ---
app.post("/upload", async (req: any, res: any) => {
  try {
    const buffer = Buffer.from(req.body.fileData, 'base64');
    const ctx = detectFileCtxFromName(req.body?.fileName, req.body?.creator);
    
    const file: any = {
      size: buffer.length,
      slice: (start: number, end: number) => ({
        arrayBuffer: async () => {
          const s = Math.max(0, start | 0);
          const e = Math.min(buffer.length, end | 0);
          const view = buffer.subarray(s, e);
          return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
        }
      })
    };

    // TODO: Add your upload logic here
    
    res.json({ 
      success: true, 
      message: "File received", 
      fileName: req.body.fileName,
      fileSize: buffer.length 
    });
    
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Upload failed",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.post("/health", async (req: any, res: any) => {
  res.json({"status": "healthy"})
});

// Simple health check endpoint for Render
app.get("/", (req: any, res: any) => {
  res.json({ 
    message: "MetaLayer Server is running", 
    timestamp: new Date().toISOString() 
  });
});

// Cron job to call health endpoint every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  try {
    const response = await fetch(`https://metalayer-server.onrender.com/health`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json();
    console.log(`Health check at ${new Date().toISOString()}: ${JSON.stringify(data)}`);
  } catch (error) {
    console.error(`Health check failed at ${new Date().toISOString()}:`, error);
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});