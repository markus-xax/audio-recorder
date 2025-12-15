const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startRecording: () => ipcRenderer.invoke('start-recording'),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  isRecording: () => ipcRenderer.invoke('is-recording'),
  onRecordingStopped: (callback) => ipcRenderer.on('recording-stopped', (event, path) => callback(path)),
  onRecordingError: (callback) => ipcRenderer.on('recording-error', (event, error) => callback(error))
});

