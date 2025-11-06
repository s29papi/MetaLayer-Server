import express from "express";
import cors from "cors";
import { ZgFile, Indexer } from "@0glabs/0g-ts-sdk"
import { ethers } from "ethers";
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Import metalayer components safely
import * as metalayer from "@searchboxlabs/metalayer";

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

// Use free public RPC endpoints that don't require API keys
const NETWORKS = {
  testnet: {
    rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/demo", // Free Alchemy demo endpoint
    chainId: 11155111,
    name: "sepolia"
  }
};

// --- Initialize clients ---
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) throw new Error("Missing PRIVATE_KEY in environment!");

const client = new metalayer.default();
const indexer = new Indexer(INDEXER_RPC);

app.use(express.json({ limit: '50mb' }));

// Helper function to replace detectFileCtxFromName
// FIX: Added 'fileSize' which was causing 'Cannot convert undefined to a BigInt' during ABI encoding.
function detectFileCtxFromName(fileName: string, creator: string, fileSize: number) {
  return {
    fileName,
    creator,
    timestamp: Date.now(),
    description: `File uploaded by ${creator}`,
    fileSize: BigInt(fileSize) // Crucial fix for Metalayer SDK
  };
}

// Helper function to create temporary file for ZgFile
async function createTempFile(buffer: Buffer, fileName: string): Promise<string> {
  // Use a more unique temp file name to prevent conflicts
  const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${fileName}`);
  await fs.promises.writeFile(tempFilePath, buffer);
  return tempFilePath;
}

// --- Upload endpoint (Fix 1: BigInt error addressed) ---
app.post("/upload", async (req, res) => {
  let tempFilePath: string | null = null;
  
  try {
    const { fileName, creator, fileData } = req.body;
    
    if (!fileName || !creator || !fileData) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: fileName, creator, fileData"
      });
    }

    const buffer = Buffer.from(fileData, 'base64');
    // Pass buffer.length to the context helper
    const ctx = detectFileCtxFromName(fileName, creator, buffer.length); 
    
    console.log("Initializing provider and signer...");
    
    // Initialize provider and signer
    let signer: ethers.Wallet;
    try {
      const provider = new ethers.JsonRpcProvider(NETWORKS.testnet.rpcUrl);
      signer = new ethers.Wallet(privateKey, provider);
      const signerAddress = await signer.getAddress();
      console.log("Signer address:", signerAddress);
      
    } catch (signerError) {
      console.error("Signer initialization failed:", signerError);
      return res.status(500).json({
        success: false,
        error: "Signer initialization failed",
        message: signerError instanceof Error ? signerError.message : "Unknown signer error"
      });
    }

    console.log("Starting metalayer upload...", { 
      fileName, 
      creator, 
      fileSize: buffer.length
    });

    // Create proper file object for metalayer
    const file: any = {
      size: buffer.length,
      slice: (start: number, end: number) => ({
        arrayBuffer: async () => {
          const s = Math.max(0, start | 0);
          const e = Math.min(buffer.length, end | 0);
          const view = buffer.subarray(s, e);
          // Return the *actual* ArrayBuffer slice
          return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
        }
      })
    };

    // The full signer object is passed, and now ctx is complete.
    const resp = await client.uploadWithCtx(indexer, ctx, file, NETWORKS.testnet, signer);

    console.log("Upload response:", resp);

    // Send response
    if (!resp || resp.error) { 
      return res.status(500).json({
        success: false,
        error: resp?.error || "Upload failed (No response or error in response)",
        message: "Upload failed"
      });
    }

    res.json({
      success: true,
      message: "File uploaded successfully",
      rootHash: resp.rootHash,
      totalChunks: resp.totalChunks,
      txHash: resp.txHash,
      fileName: fileName,
      fileSize: buffer.length
    });

  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Upload failed",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    // Clean up temporary file
    if (tempFilePath) {
      try {
        await fs.promises.unlink(tempFilePath);
        console.log(`Cleaned up temp file: ${tempFilePath}`);
      } catch (cleanupError) {
        console.error("Failed to clean up temp file:", cleanupError);
      }
    }
  }
});

// Simple upload endpoint using only 0g-sdk (fallback) (Fix 2: Temp file robustness maintained)
app.post("/upload-simple", async (req, res) => {
  let tempFilePath: string | null = null;
  
  try {
    const { fileName, fileData } = req.body;
    
    if (!fileName || !fileData) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: fileName, fileData"
      });
    }

    const buffer = Buffer.from(fileData, 'base64');
    
    // Create temporary file for ZgFile
    tempFilePath = await createTempFile(buffer, fileName);
    
    console.log("Uploading with direct 0g-sdk...");
    
    // Create ZgFile from temporary file path. This relies on the temp file being stable.
    const file = new ZgFile(tempFilePath);
    
    // This is the call that failed with 'this.fd?.read'. If the temp file fix wasn't enough,
    // this suggests a deeper SDK issue, but we must proceed with the correct usage.
    const streamId = await indexer.upload(file);
    
    res.json({
      success: true,
      streamId,
      fileName,
      fileSize: buffer.length,
      message: "File uploaded successfully using direct 0g-sdk"
    });

  } catch (error) {
    console.error("Simple upload error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Simple upload failed",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    // Clean up temporary file
    if (tempFilePath) {
      try {
        await fs.promises.unlink(tempFilePath);
        console.log(`Cleaned up temp file: ${tempFilePath}`);
      } catch (cleanupError) {
        console.error("Failed to clean up temp file:", cleanupError);
      }
    }
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