import express from "express";
import cors from "cors";
import { ZgFile, Indexer } from "@0glabs/0g-ts-sdk"
import { ethers } from "ethers";
import * as cron from "node-cron";
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

// Define NETWORKS manually since the import path doesn't work
const NETWORKS = {
  testnet: {
    rpcUrl: "https://rpc.ankr.com/eth_sepolia", // Using Sepolia testnet
    chainId: 11155111,
    name: "sepolia"
  }
};

// --- Initialize provider and signer ---
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) throw new Error("Missing PRIVATE_KEY in environment!");

// Initialize clients - use the default export from metalayer
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

// --- Upload endpoint ---
app.post("/upload", async (req, res) => {
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

    // Initialize provider and signer
    const provider = new ethers.JsonRpcProvider(NETWORKS.testnet.rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider); 

    console.log("Starting upload...", { fileName, creator, fileSize: buffer.length });

    // Upload the file using metalayer
    const resp = await client.uploadWithCtx(indexer, ctx, file, NETWORKS.testnet, signer);

    console.log("Upload response:", resp);

    // Send response
    if (resp?.error) {
      return res.status(500).json({
        success: false,
        error: resp.error,
        message: "Upload failed"
      });
    }

    res.json({
      success: true,
      message: "File uploaded successfully",
      rootHash: resp?.rootHash,
      totalChunks: resp?.totalChunks,
      txHash: resp?.txHash,
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
  }
});

app.post("/health", async (req, res) => {
  res.json({"status": "healthy"})
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({ 
    message: "MetaLayer Server is running", 
    timestamp: new Date().toISOString(),
    status: "ready"
  });
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📡 Using 0G Testnet: ${TESTNET_INDEXER_RPC}`);
});

cron.schedule('*/30 * * * *', async () => {
  try {
    const response = await fetch(`http://localhost:${port}/health`, {
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
