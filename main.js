const { app, BrowserWindow, ipcMain } = require("electron/main");
const path = require("node:path");
const { spawn } = require("child_process");

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1920,
        height: 1080,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false
        },
        autoHideMenuBar: true
    });

    ipcMain.on("process-file", (event, { fileName, fileBuffer, securityLevel, additionalParams }) => {
        console.log(`Processing file: ${fileName} with security level: ${securityLevel}`);
        console.log("Security Rules:", additionalParams);

        const pythonProcess = require("child_process").execFile("process_template.exe", [
            securityLevel,
            fileName
        ], {
            stdio: ["pipe", "pipe", "pipe"]
        });

        // Write YAML file first
        pythonProcess.stdin.write(Buffer.from(fileBuffer));
        pythonProcess.stdin.write("\n---END-YAML---\n"); // Separator

        // Write JSON rules
        pythonProcess.stdin.write(JSON.stringify(additionalParams));
        pythonProcess.stdin.write("\n");
        pythonProcess.stdin.end();

        let pythonOutput = "";
        let pythonError = "";

        pythonProcess.stdout.on("data", (data) => {
            pythonOutput += data.toString();
        });

        pythonProcess.stderr.on("data", (data) => {
            pythonError += data.toString();
        });

        pythonProcess.on("close", (code) => {
            if (code !== 0) {
                console.error(`Python process exited with error code ${code}:\n${pythonError}`);
                win.webContents.send("processing-error", pythonError);
            } else {
                console.log(`Python process exited with code ${code}`);
                win.webContents.send("processing-complete", pythonOutput, fileName);
            }
        });
    });

    win.loadFile("index.html");
};

app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
