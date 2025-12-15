const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Отключение аппаратного ускорения на Windows для решения проблем с GPU
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('disable-software-rasterizer');
}

// Получаем путь к FFmpeg (работает и в dev, и в production)
function getFfmpegPath() {
  if (app.isPackaged) {
    // В продакшене FFmpeg находится в распакованном asar
    const platform = process.platform;
    const arch = process.arch === 'x64' ? 'x64' : 'ia32';
    const platformArch = `${platform}-${arch}`;
    const ffmpegName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const ffmpegPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', 'ffmpeg', platformArch, ffmpegName);
    
    // Если файл не найден по первому пути, пробуем альтернативный
    if (!fs.existsSync(ffmpegPath)) {
      // Альтернативный путь (для некоторых версий пакета)
      const altPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', 'ffmpeg', 'bin', platform, arch, ffmpegName);
      if (fs.existsSync(altPath)) {
        return altPath;
      }
    }
    return ffmpegPath;
  } else {
    // В режиме разработки используем обычный путь
    return require('@ffmpeg-installer/ffmpeg').path;
  }
}

let mainWindow;
let recordingProcess = null;
let outputPath = null;

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
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Обработка начала записи
ipcMain.handle('start-recording', async () => {
  if (recordingProcess) {
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

    outputPath = filePath;

    // Используем встроенный FFmpeg
    const command = getFfmpegPath();
    
    // Определяем аргументы в зависимости от платформы
    let args;
    const platform = process.platform;

    if (platform === 'win32') {
      // Для Windows используем WASAPI loopback для захвата системного звука
      // Используем формат для WASAPI loopback - нужно указать устройство с (loopback)
      // Или можно использовать индекс устройства
      args = [
        '-f', 'wasapi',
        '-i', 'default', // Попробуем default, если не сработает - нужно указать конкретное устройство
        '-acodec', 'libmp3lame',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-y',
        filePath
      ];
      
      // Примечание: если default не работает, нужно:
      // 1. Запустить: ffmpeg -f wasapi -list_devices true -i dummy
      // 2. Найти устройство с "(loopback)" в названии
      // 3. Использовать его имя или индекс вместо 'default'
      
    } else if (platform === 'darwin') {
      // Для macOS используем BlackHole (виртуальный аудио драйвер)
      // Пользователь должен установить BlackHole и выбрать его как устройство вывода
      // Или используем системный звук через Core Audio
      args = [
        '-f', 'avfoundation',
        '-i', ':none', // :none означает только системный звук (без микрофона)
        '-acodec', 'libmp3lame',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-y',
        filePath
      ];
      
      // Альтернатива: если установлен BlackHole, можно использовать:
      // Сначала нужно узнать индекс устройства BlackHole:
      // ffmpeg -f avfoundation -list_devices true -i ""
      // Затем использовать его индекс вместо :none
    } else {
      return { success: false, error: 'Неподдерживаемая платформа' };
    }

    // Проверяем наличие файла FFmpeg и запускаем запись
    if (!fs.existsSync(command)) {
      return { 
        success: false, 
        error: 'Встроенный FFmpeg не найден. Переустановите приложение.' 
      };
    }

    // Запускаем запись
    try {
      recordingProcess = spawn(command, args);

            recordingProcess.stdout.on('data', (data) => {
              console.log(`stdout: ${data}`);
            });

            recordingProcess.stderr.on('data', (data) => {
              // FFmpeg выводит информацию в stderr, это нормально
              const output = data.toString();
              if (output.includes('error') || output.includes('Error')) {
                console.error(`stderr: ${output}`);
              }
            });

            recordingProcess.on('close', (code, signal) => {
              recordingProcess = null;
              if (code === 0 || signal === 'SIGINT') {
                mainWindow.webContents.send('recording-stopped', outputPath);
              } else if (code !== null) {
                mainWindow.webContents.send('recording-error', 
                  `Ошибка при записи (код: ${code}). Убедитесь, что FFmpeg установлен и настроен правильно.`);
              }
            });

      recordingProcess.on('error', (error) => {
        recordingProcess = null;
        mainWindow.webContents.send('recording-error', 
          `Ошибка запуска процесса записи: ${error.message}`);
      });

      return { success: true, path: filePath };
    } catch (error) {
      console.error('Ошибка при запуске записи:', error);
      return { success: false, error: error.message };
    }
  } catch (error) {
    console.error('Ошибка при обработке записи:', error);
    return { success: false, error: error.message };
  }
});

// Обработка остановки записи
ipcMain.handle('stop-recording', async () => {
  if (!recordingProcess) {
    return { success: false, error: 'Запись не запущена' };
  }

  try {
    // Отправляем SIGINT для корректного завершения ffmpeg
    recordingProcess.kill('SIGINT');
    recordingProcess = null;
    return { success: true };
  } catch (error) {
    console.error('Ошибка при остановке записи:', error);
    return { success: false, error: error.message };
  }
});

// Проверка статуса записи
ipcMain.handle('is-recording', () => {
  return recordingProcess !== null;
});

