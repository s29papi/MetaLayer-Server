import express from "express";
import { ZgFile, Indexer } from "@0glabs/0g-ts-sdk"
import { ethers } from "ethers";
import multer from "multer";
import path from "path";
import fs from "fs";
import {detectFileCtxFromName} from "@searchboxlabs/metalayer/utils"
// import { NETWORKS } from "@searchboxlabs/metalayer/network";
import MetaLayerClient  from "@searchboxlabs/metalayer/metalayer";

import { NETWORKS } from '@searchboxlabs/metalayer/network';


const app = express();
const port = process.env.PORT || 3000;

// --- Network configuration ---
const TESTNET_INDEXER_RPC = "https://indexer-storage-turbo.0g.ai";

const INDEXER_RPC = TESTNET_INDEXER_RPC;

// --- Initialize provider and signer ---
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) throw new Error("Missing PRIVATE_KEY in environment!");
const client = new MetaLayerClient()


const indexer = new Indexer(INDEXER_RPC);

app.use(express.json());


// --- Upload endpoint ---
app.post("/upload", async (req, res) => {
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

  // Task:
  // send a http resp
  // resp?.error
  // or
  // resp?.rootHash
  // resp?.totalChunks
  // resp?.txHash
});


app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});


