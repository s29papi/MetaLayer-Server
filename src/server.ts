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
function detectFileCtxFromName(fileName: string, creator: string) {
  return {
    fileName,
    creator,
    timestamp: Date.now(),
    description: `File uploaded by ${creator}`
  };
}

// Helper function to create temporary file for ZgFile
// NOTE: Must use a unique file name to avoid collisions
async function createTempFile(buffer: Buffer, fileName: string): Promise<string> {
  // Use a more unique temp file name
  const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${fileName}`);
  await fs.promises.writeFile(tempFilePath, buffer);
  return tempFilePath;
}

// --- Upload endpoint (Fix 1: BigInt error in metalayer) ---
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
    const ctx = detectFileCtxFromName(fileName, creator);
    
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
    // NOTE: The metalayer SDK expects a `File` object interface, which includes
    // `slice` that returns an object with an `arrayBuffer` method.
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

    // Corrected call: pass the initialized `signer` object directly.
    // The previous error "Cannot convert undefined to a BigInt" often happens 
    // when a required ethers component (like a signer) is missing or incomplete.
    const resp = await client.uploadWithCtx(indexer, ctx, file, NETWORKS.testnet, signer);

    console.log("Upload response:", resp);

    // Send response
    if (!resp || resp.error) { // Check for null/undefined resp and resp.error
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

// Simple upload endpoint using only 0g-sdk (fallback) (Fix 2: this.fd?.read is not a function)
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
    // ZgFile's underlying implementation expects a file path it can open and read
    // like a traditional file stream, which is why a temp file is needed.
    tempFilePath = await createTempFile(buffer, fileName);
    
    console.log("Uploading with direct 0g-sdk...");
    
    // Create ZgFile from temporary file path
    // The error "this.fd?.read is not a function" means the ZgFile object
    // didn't successfully create a file descriptor/stream from the path.
    const file = new ZgFile(tempFilePath);
    
    // ZgFile constructor and upload is a two-step process.
    // Ensure the ZgFile is properly initialized/opened before upload.
    // NOTE: The ZgFile may be an older implementation that relies on a synchronous
    // file open within the constructor or a later synchronous method.
    // If the path exists and is readable, this should work.
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
        // IMPORTANT: The cleanup must happen AFTER the upload to prevent the ZgFile
        // from being deleted while the indexer is trying to read it.
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
    // Note: 'fetch' is not globally available in Node.js < v18 without a polyfill.
    // If your environment is older, replace `fetch` with a library like `axios` or `node-fetch`.
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