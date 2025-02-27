const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("complianceAPI", {
    processFile: (fileName, fileBuffer, securityLevel, additionalParams) => {
        ipcRenderer.send("process-file", {
            fileName,
            fileBuffer,
            securityLevel,
            additionalParams
        });
    },

    onProcessingComplete: (callback) => {
        ipcRenderer.on("processing-complete", (_event, processedData, fileName) => {
            callback(processedData, fileName);
        });
    },

    onProcessingError: (callback) => {
        ipcRenderer.on("processing-error", (_event, errorMessage) => {
            console.error(`Python process exited with error:\n${errorMessage}`);
            callback(errorMessage);
        });
    }
});
