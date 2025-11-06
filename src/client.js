const fs = require('fs/promises');

async function main() {
    const buffer = await fs.readFile('./test.txt');
    const base64 = buffer.toString('base64');

    try {
        const response = await fetch("https://metalayer-server.onrender.com/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fileName: "test_file_one.txt", 
                creator: "0x330cA32b71b81Ea2b1D3a5C391C5cFB6520E0A10",
                fileSize: buffer.length,
                fileData: base64
            }),
        });
        
        const result = await response.json();
        console.log("Upload result:", result);
    } catch (error) {
        console.error("Upload failed:", error);
    }
}

main();