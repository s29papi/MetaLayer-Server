import fs from 'fs/promises';

async function  main() {
    const buffer = await fs.readFile('./test.txt');
    const base64 = buffer.toString('base64');

    await fetch("http://localhost:3000/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
             fileName: "test_file_one.txt", 
             creator: "0x330cA32b71b81Ea2b1D3a5C391C5cFB6520E0A10",
             fileSize: buffer.length,
             fileData: base64
        }),
    })
}

main()  




