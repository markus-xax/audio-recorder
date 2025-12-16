const { ipcMain, dialog } = require('electron');
const recordingService = require('../services/recording');
const { listAudioDevices } = require('../services/audioDevices');

/**
 * Регистрирует все IPC обработчики
 * @param {BrowserWindow} mainWindow - Главное окно приложения
 */
function registerIpcHandlers(mainWindow) {
  // Устанавливаем главное окно в сервис записи
  recordingService.setMainWindow(mainWindow);

  // Обработка начала записи
  ipcMain.handle('start-recording', async (event, deviceIndex = null) => {
    if (recordingService.isRecording()) {
      return { success: false, error: 'Запись уже идет' };
    }

    try {
      // Получаем путь для сохранения файла
      const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
        title: 'Сохранить запись',
        defaultPath: `recording-${Date.now()}.mp3`,
        filters: [
          { name: 'MP3 файлы', extensions: ['mp3'] },
          { name: 'Все файлы', extensions: ['*'] }
        ]
      });

      if (canceled) {
        return { success: false, error: 'Отменено пользователем' };
      }

      return recordingService.startRecording(filePath, deviceIndex);
    } catch (error) {
      console.error('Ошибка при обработке записи:', error);
      return { success: false, error: error.message };
    }
  });

  // Обработка остановки записи
  ipcMain.handle('stop-recording', async () => {
    return recordingService.stopRecording();
  });

  // Проверка статуса записи
  ipcMain.handle('is-recording', () => {
    return recordingService.isRecording();
  });

  // Получение списка доступных аудио устройств (для диагностики)
  ipcMain.handle('list-audio-devices', async () => {
    return listAudioDevices();
  });
}

module.exports = {
  registerIpcHandlers
};

