const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startRecording: (deviceIndex) => ipcRenderer.invoke('start-recording', deviceIndex),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  isRecording: () => ipcRenderer.invoke('is-recording'),
  listAudioDevices: () => ipcRenderer.invoke('list-audio-devices'),
  onRecordingStopped: (callback) => ipcRenderer.on('recording-stopped', (event, path) => callback(path)),
  onRecordingError: (callback) => ipcRenderer.on('recording-error', (event, error) => callback(error))
});

