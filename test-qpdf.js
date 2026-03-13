import fs from 'fs';
import loadQpdf from 'qpdf-wasm';

async function testVitePath() {
    try {
        const qpdf = await loadQpdf({});
        console.log("QPDF Loaded Successfully");

        // Test with a dummy pdf
        const dummyPdf = new Uint8Array([
            37, 80, 68, 70, 45, 49, 46, 55, 10, 37, 226, 227, 207, 211, 10,
            49, 32, 48, 32, 111, 98, 106, 10, 60, 60, 47, 84, 121, 112, 101, 47,
            67, 97, 116, 97, 108, 111, 103, 47, 80, 97, 103, 101, 115, 32, 50,
            32, 48, 32, 82, 62, 62, 10, 101, 110, 100, 111, 98, 106, 10
        ]);

        qpdf.FS.writeFile('/input.pdf', dummyPdf);
        console.log("File written to VFS");

        const exitCode = qpdf.callMain(['--decrypt', '/input.pdf', '/output.pdf']);
        console.log("Exit Code:", exitCode);

        if (exitCode === 0) {
            console.log("Output size:", qpdf.FS.readFile('/output.pdf').length);
        } else {
            console.log("Error generated");
        }
    } catch (e) {
        console.error("Test Error:", e);
    }
}

testVitePath();
