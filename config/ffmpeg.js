const path = require('path');
const fs = require('fs');
const { app } = require('electron');

/**
 * Получает путь к FFmpeg (работает и в dev, и в production)
 * @returns {string} Путь к исполняемому файлу FFmpeg
 */
function getFfmpegPath() {
  if (app.isPackaged) {
    // В продакшене FFmpeg находится в распакованном asar
    const platform = process.platform;
    const ffmpegName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    
    // Путь для ffmpeg-static в production
    const ffmpegPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'ffmpeg-static',
      ffmpegName
    );

    if (fs.existsSync(ffmpegPath)) {
      return ffmpegPath;
    }

    // Если не найден, возвращаем путь (для отладки)
    return ffmpegPath;
  } else {
    // В режиме разработки используем путь из ffmpeg-static
    // ffmpeg-static экспортирует путь напрямую как строку
    return require('ffmpeg-static');
  }
}

/**
 * Проверяет наличие FFmpeg
 * @returns {{exists: boolean, path: string, error?: string}}
 */
function validateFfmpeg() {
  const ffmpegPath = getFfmpegPath();
  const exists = fs.existsSync(ffmpegPath);

  if (!exists) {
    const error = app.isPackaged
      ? 'Встроенный FFmpeg не найден. Переустановите приложение.'
      : `FFmpeg не найден по пути: ${ffmpegPath}\n\nВыполните: npm install`;
    return { exists: false, path: ffmpegPath, error };
  }

  return { exists: true, path: ffmpegPath };
}

module.exports = {
  getFfmpegPath,
  validateFfmpeg
};

