const { app, BrowserWindow } = require('electron');
const path = require('path');
const { initializePlatform } = require('./config/platform');
const { registerIpcHandlers } = require('./handlers/ipcHandlers');

// Инициализация платформо-специфичных настроек
initializePlatform();

let mainWindow;

/**
 * Создает главное окно приложения
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    resizable: false,
    title: 'System Audio Recorder'
  });

  mainWindow.loadFile('index.html');

  // Регистрируем IPC обработчики после создания окна
  registerIpcHandlers(mainWindow);
}

// Запуск приложения
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Закрытие приложения
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
