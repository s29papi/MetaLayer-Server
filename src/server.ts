import express from "express";
import cors from "cors";
import { ZgFile, Indexer } from "@0glabs/0g-ts-sdk"
import { ethers } from "ethers";
import multer from "multer";
import path from "path";
import fs from "fs";
import {detectFileCtxFromName} from "@searchboxlabs/metalayer/utils"
import { NETWORKS } from '@searchboxlabs/metalayer/network';
import MetaLayerClient  from "@searchboxlabs/metalayer/metalayer";
import * as cron from "node-cron";

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

app.use(express.json({ limit: '50mb' })); // Increase limit for file uploads

// --- Upload endpoint ---
app.post("/upload", async (req, res) => {
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
    // You'll need to implement the actual upload to 0G storage
    
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

app.post("/health", async (req, res) => {
  res.json({"status": "healthy"})
});

// Simple health check endpoint for Render
app.get("/", (req, res) => {
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