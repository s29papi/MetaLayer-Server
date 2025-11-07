import fs from 'fs/promises';

async function main() {
    try {
        const buffer = await fs.readFile('./test.txt');
        const base64 = buffer.toString('base64');

        console.log("Testing metalayer upload...");
        
        const response = await fetch("https://metalayer-server.onrender.com/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fileName: "test_file.txt", 
                creator: "0xF709Fd15664A25009ffda6694617f18fD709C000",
                fileData: base64
            }),
        });
        
        const result = await response.json();
        console.log("Metalayer upload result:", result);
        
    } catch (error) {
        console.error("Upload failed:", error);
    }
}

main();