import express from "express";
import cors from "cors";
import { ZgFile, Indexer } from "@0glabs/0g-ts-sdk"
import { ethers } from "ethers";
import multer from "multer";
import path from "path";
import fs from "fs";
import {detectFileCtxFromName} from "@searchboxlabs/metalayer/utils"
// import { NETWORKS } from "@searchboxlabs/metalayer/network";
import MetaLayerClient  from "@searchboxlabs/metalayer/metalayer";
import cron from "node-cron";
import { NETWORKS } from '@searchboxlabs/metalayer/network';
import dotenv from "dotenv";

dotenv.config();


const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for specific origins
app.use(cors({
  origin: ['https://metalayer-indexer.lovable.app'],
  credentials: true
}));

// --- Network configuration ---
const TESTNET_INDEXER_RPC = "https://indexer-storage-turbo.0g.ai";

const INDEXER_RPC = TESTNET_INDEXER_RPC;

// --- Initialize provider and signer ---
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) throw new Error("Missing PRIVATE_KEY in environment!");
const client = new MetaLayerClient()


const indexer = new Indexer(INDEXER_RPC);

app.use(express.json());

app.post("/upload", async (req, res) => {
  try {
    const buffer = Buffer.from(req.body.fileData, 'base64');
    const ctx = detectFileCtxFromName(req.body?.fileName, req.body?.creator)
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
    }
    const provider = new ethers.JsonRpcProvider(NETWORKS.mainnet.rpcUrl)
    const privateKey: any = process.env.PRIVATE_KEY;
    const signer = new ethers.Wallet(privateKey, provider);

    const resp = await client.uploadWithCtx(indexer, ctx, file, NETWORKS.mainnet, signer)

    res.json({
      success: true,
      message: "Upload successful",
      data: resp
    });
  } catch (error) {
    console.error("Upload failed:", error);
    res.status(500).json({
      success: false,
      message: "Upload failed",
      error: error.message
    });
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({ 
    message: "MetaLayer Server is running", 
    timestamp: new Date().toISOString(),
    status: "ready",
    endpoints: {
      upload: "POST /upload",
      simpleUpload: "POST /upload-simple", 
      health: "POST /health"
    }
  });
});

app.post("/health", async (req, res) => {
  res.json({"status": "healthy"})
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📡 Using 0G Testnet: ${TESTNET_INDEXER_RPC}`);
  console.log(`🔗 Using Ethereum RPC: ${NETWORKS.testnet.rpcUrl}`);
});

// Health check cron - use your actual Render URL
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