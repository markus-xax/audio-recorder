const { spawn } = require('child_process');
const fs = require('fs');
const { getFfmpegPath, validateFfmpeg } = require('../config/ffmpeg');
const { getRecordingArgs, getPlatformErrorMessage, getSmallFileWarning } = require('../config/platform');

class RecordingService {
  constructor() {
    this.recordingProcess = null;
    this.outputPath = null;
    this.mainWindow = null;
  }

  /**
   * Устанавливает главное окно для отправки сообщений
   * @param {BrowserWindow} mainWindow
   */
  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
  }

  /**
   * Начинает запись
   * @param {string} filePath - Путь для сохранения файла
   * @param {number|null} deviceIndex - Индекс аудио устройства (для macOS)
   * @returns {{success: boolean, error?: string, path?: string}}
   */
  startRecording(filePath, deviceIndex = null) {
    if (this.recordingProcess) {
      return { success: false, error: 'Запись уже идет' };
    }

    try {
      // Проверяем FFmpeg
      const validation = validateFfmpeg();
      if (!validation.exists) {
        console.error('FFmpeg not found:', validation.path);
        return { success: false, error: validation.error };
      }

      const ffmpegPath = validation.path;
      this.outputPath = filePath;

      // Получаем аргументы для платформы
      const { args, error } = getRecordingArgs(filePath, deviceIndex);
      if (error) {
        return { success: false, error };
      }

      // Запускаем запись
      console.log('Запуск FFmpeg с аргументами:', args.join(' '));
      this.recordingProcess = spawn(ffmpegPath, args);

      this._setupProcessHandlers();

      return { success: true, path: filePath };
    } catch (error) {
      console.error('Ошибка при запуске записи:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Настраивает обработчики процесса записи
   * @private
   */
  _setupProcessHandlers() {
    const recordingProc = this.recordingProcess;
    const platform = process.platform;

    recordingProc.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
    });

    recordingProc.stderr.on('data', (data) => {
      // FFmpeg выводит информацию в stderr, это нормально
      const output = data.toString();
      console.log('FFmpeg output:', output);

      // Проверяем на ошибки
      if (
        output.includes('No AV capture device found') ||
        output.includes('Input/output error') ||
        output.includes('Cannot find') ||
        output.includes('error') ||
        output.includes('Error')
      ) {
        console.error(`FFmpeg error: ${output}`);

        const errorMessage = getPlatformErrorMessage(output);
        if (errorMessage) {
          recordingProc.kill();
          this.recordingProcess = null;
          if (this.mainWindow) {
            this.mainWindow.webContents.send('recording-error', errorMessage);
          }
        }
      }
    });

    recordingProc.on('close', (code, signal) => {
      this._handleProcessClose(code, signal);
    });

    recordingProc.on('error', (error) => {
      this.recordingProcess = null;
      if (this.mainWindow) {
        this.mainWindow.webContents.send(
          'recording-error',
          `Ошибка запуска процесса записи: ${error.message}`
        );
      }
    });
  }

  /**
   * Обрабатывает закрытие процесса записи
   * @param {number|null} code - Код выхода
   * @param {string|null} signal - Сигнал завершения
   * @private
   */
  _handleProcessClose(code, signal) {
    const savedPath = this.outputPath;
    this.recordingProcess = null;
    this.outputPath = null;

    const platform = process.platform;

    // Коды выхода при корректной остановке:
    // 0 - успешное завершение
    // 130 - SIGINT (Ctrl+C)
    // null + SIGINT - остановлено сигналом
    if (code === 0 || code === 130 || signal === 'SIGINT') {
      console.log(`Запись успешно остановлена. Код: ${code}, Сигнал: ${signal}`);
      this._validateAndNotifyFile(savedPath, platform);
    } else if (code === null && signal === 'SIGINT') {
      console.log('Запись остановлена по сигналу SIGINT');
      this._validateAndNotifyFile(savedPath, platform);
    } else if (code === 255 || code === 1) {
      // Код 255 или 1 часто возникает при принудительной остановке
      console.log(`Запись остановлена (код ${code}). Проверяем файл...`);
      this._handleErrorCode(savedPath, code, platform);
    } else if (code !== null) {
      console.error(`Ошибка при записи. Код: ${code}, Сигнал: ${signal}`);
      if (this.mainWindow) {
        this.mainWindow.webContents.send(
          'recording-error',
          `Ошибка при записи (код: ${code}). Убедитесь, что FFmpeg установлен и настроен правильно.`
        );
      }
    }
  }

  /**
   * Проверяет файл и отправляет уведомление
   * @param {string} savedPath - Путь к сохраненному файлу
   * @param {string} platform - Платформа
   * @private
   */
  _validateAndNotifyFile(savedPath, platform) {
    if (savedPath && fs.existsSync(savedPath)) {
      const stats = fs.statSync(savedPath);
      console.log(`Файл сохранен, размер: ${stats.size} байт`);

      if (stats.size < 1024 && platform === 'darwin') {
        // Файл очень маленький на macOS - предупреждаем о BlackHole
        const msg = getSmallFileWarning();
        if (this.mainWindow) {
          this.mainWindow.webContents.send('recording-error', msg);
        }
        return;
      }
    }

    if (this.mainWindow) {
      this.mainWindow.webContents.send('recording-stopped', savedPath);
    }
  }

  /**
   * Обрабатывает код ошибки при завершении процесса
   * @param {string} savedPath - Путь к сохраненному файлу
   * @param {number} code - Код выхода
   * @param {string} platform - Платформа
   * @private
   */
  _handleErrorCode(savedPath, code, platform) {
    if (savedPath && fs.existsSync(savedPath)) {
      const stats = fs.statSync(savedPath);
      if (stats.size > 1024) {
        // Больше 1KB - вероятно есть звук
        console.log(`Файл сохранен, размер: ${stats.size} байт`);
        if (this.mainWindow) {
          this.mainWindow.webContents.send('recording-stopped', savedPath);
        }
      } else if (stats.size > 0) {
        // Файл очень маленький - возможно только заголовок
        console.warn(`Файл создан, но очень маленький: ${stats.size} байт`);
        const msg = getSmallFileWarning();
        if (this.mainWindow) {
          this.mainWindow.webContents.send('recording-error', msg);
        }
      } else {
        if (this.mainWindow) {
          this.mainWindow.webContents.send(
            'recording-error',
            'Запись была прервана. Файл создан, но пуст.'
          );
        }
      }
    } else {
      if (this.mainWindow) {
        this.mainWindow.webContents.send(
          'recording-error',
          `Ошибка при записи (код: ${code}). Файл не был создан.`
        );
      }
    }
  }

  /**
   * Останавливает запись
   * @returns {{success: boolean, error?: string}}
   */
  async stopRecording() {
    if (!this.recordingProcess) {
      return { success: false, error: 'Запись не запущена' };
    }

    try {
      const processToStop = this.recordingProcess;

      // Сначала пробуем отправить 'q' в stdin для корректной остановки FFmpeg
      if (processToStop.stdin && !processToStop.stdin.destroyed) {
        try {
          processToStop.stdin.write('q\n');
          processToStop.stdin.end();

          // Даем время на корректное завершение (2 секунды)
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Если процесс еще жив, отправляем SIGINT
          if (!processToStop.killed) {
            processToStop.kill('SIGINT');
          }
        } catch (stdinError) {
          // Если stdin недоступен, сразу используем SIGINT
          console.log('Не удалось отправить команду в stdin, используем SIGINT');
          processToStop.kill('SIGINT');
        }
      } else {
        // Если stdin недоступен, используем SIGINT
        processToStop.kill('SIGINT');
      }

      // Не обнуляем recordingProcess сразу - пусть обработчик 'close' это сделает
      return { success: true };
    } catch (error) {
      console.error('Ошибка при остановке записи:', error);
      this.recordingProcess = null;
      return { success: false, error: error.message };
    }
  }

  /**
   * Проверяет, идет ли запись
   * @returns {boolean}
   */
  isRecording() {
    return this.recordingProcess !== null;
  }
}

// Экспортируем singleton
module.exports = new RecordingService();

