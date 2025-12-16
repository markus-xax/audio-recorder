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
    const arch = process.arch === 'x64' ? 'x64' : 'ia32';
    const platformArch = `${platform}-${arch}`;
    const ffmpegName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const ffmpegPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      '@ffmpeg-installer',
      'ffmpeg',
      platformArch,
      ffmpegName
    );

    // Если файл не найден по первому пути, пробуем альтернативный
    if (!fs.existsSync(ffmpegPath)) {
      // Альтернативный путь (для некоторых версий пакета)
      const altPath = path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        '@ffmpeg-installer',
        'ffmpeg',
        'bin',
        platform,
        arch,
        ffmpegName
      );
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

