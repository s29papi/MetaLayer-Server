const fs = require('fs/promises');

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
                creator: "0x330cA32b71b81Ea2b1D3a5C391C5cFB6520E0A10",
                fileData: base64
            }),
        });
        
        const result = await response.json();
        console.log("Metalayer upload result:", result);

        // If metalayer fails, try simple upload with the SAME URL
        if (!result.success) {
            console.log("\nTrying simple upload...");
            const simpleResponse = await fetch("https://metalayer-server.onrender.com/upload-simple", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fileName: "test_file_simple.txt", 
                    fileData: base64
                }),
            });
            
            const simpleResult = await simpleResponse.json();
            console.log("Simple upload result:", simpleResult);
        }
        
    } catch (error) {
        console.error("Upload failed:", error);
    }
}

main();