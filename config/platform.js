const { app } = require('electron');

/**
 * Инициализирует платформо-специфичные настройки
 */
function initializePlatform() {
  // Отключение аппаратного ускорения на Windows для решения проблем с GPU
  if (process.platform === 'win32') {
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-gpu-compositing');
    app.commandLine.appendSwitch('disable-software-rasterizer');
  }
}

/**
 * Получает аргументы FFmpeg для записи в зависимости от платформы
 * @param {string} outputPath - Путь для сохранения файла
 * @param {number|null} deviceIndex - Индекс аудио устройства (для macOS, по умолчанию 0)
 * @param {boolean} useDirectShow - Использовать DirectShow вместо WASAPI (fallback для Windows)
 * @param {number} directShowDeviceIndex - Индекс устройства DirectShow для попытки (по умолчанию 0)
 * @returns {{args: string[], error?: string}} Аргументы FFmpeg или ошибка
 */
function getRecordingArgs(outputPath, deviceIndex = null, useDirectShow = false, directShowDeviceIndex = 0) {
  const platform = process.platform;

  if (platform === 'win32') {
    if (useDirectShow) {
      // Fallback: используем DirectShow для захвата системного звука
      // Пробуем несколько стандартных вариантов устройств по очереди
      // Используем наиболее распространенные имена устройств для захвата системного звука
      const deviceOptions = [
        'audio="Stereo Mix (Realtek High Definition Audio)"',
        'audio="Stereo Mix (Realtek Audio)"',
        'audio="Stereo Mix"',
        'audio="What U Hear"',
        'audio="Wave Out Mix"',
        'audio="virtual-audio-capturer"',
        'audio="CABLE Input"',
        'audio="VB-Audio Virtual Cable"'
      ];
      
      // Используем устройство по индексу (пробуем по очереди)
      const deviceIndex = Math.min(directShowDeviceIndex, deviceOptions.length - 1);
      const selectedDevice = deviceOptions[deviceIndex];
      
      console.log(`Пробуем DirectShow устройство ${deviceIndex + 1}/${deviceOptions.length}: ${selectedDevice}`);
      
      return {
        args: [
          '-f', 'dshow',
          '-i', selectedDevice,
          '-acodec', 'libmp3lame',
          '-b:a', '192k',
          '-ar', '44100',
          '-ac', '2',
          '-y',
          outputPath
        ],
        deviceIndex: deviceIndex,
        totalDevices: deviceOptions.length
      };
    }
    // Для Windows используем WASAPI loopback для захвата системного звука
    // Пробуем несколько вариантов синтаксиса для максимальной совместимости
    return {
      args: [
        '-f', 'wasapi',
        '-i', 'loopback',
        '-acodec', 'libmp3lame',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-y',
        outputPath
      ]
    };
  } else if (platform === 'darwin') {
    // Для macOS используем avfoundation
    // ВАЖНО: На macOS невозможно напрямую захватить системный звук через avfoundation
    // Для захвата системного звука необходимо установить BlackHole
    // По умолчанию используется индекс 1 (протестировано и работает)
    const index = deviceIndex !== null && deviceIndex !== undefined ? deviceIndex : 1;
    const audioDeviceIndex = `:${index}`;

    console.log(`Используется аудио устройство: ${audioDeviceIndex} (индекс ${index})`);

    return {
      args: [
        '-f', 'avfoundation',
        '-i', audioDeviceIndex,
        '-acodec', 'libmp3lame',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-y',
        outputPath
      ]
    };
  } else {
    return {
      error: 'Неподдерживаемая платформа'
    };
  }
}

/**
 * Получает команду для списка аудио устройств
 * @param {string} ffmpegPath - Путь к FFmpeg
 * @returns {{args: string[], error?: string}} Аргументы команды или ошибка
 */
function getListDevicesArgs(ffmpegPath) {
  const platform = process.platform;

  if (platform === 'win32') {
    return {
      args: ['-f', 'wasapi', '-list_devices', 'true', '-i', 'dummy']
    };
  } else if (platform === 'darwin') {
    return {
      args: ['-f', 'avfoundation', '-list_devices', 'true', '-i', '']
    };
  } else {
    return {
      error: 'Неподдерживаемая платформа'
    };
  }
}

/**
 * Получает сообщение об ошибке для платформы
 * @param {string} errorOutput - Вывод ошибки FFmpeg
 * @returns {string|null} Сообщение об ошибке или null
 */
function getPlatformErrorMessage(errorOutput) {
  const platform = process.platform;

  if (platform === 'darwin') {
    if (errorOutput.includes('No AV capture device found') || errorOutput.includes('Input/output error')) {
      return (
        'Не найдено аудио устройство для захвата.\n\n' +
        'Для записи системного звука на macOS:\n' +
        '1. Установите BlackHole: https://github.com/ExistentialAudio/BlackHole\n' +
        '2. Выберите BlackHole как устройство вывода в настройках системы\n' +
        '3. Попробуйте снова'
      );
    }
  } else if (platform === 'win32') {
    if (errorOutput.includes('Unknown input format: \'wasapi\'') || errorOutput.includes('Unknown input format: wasapi')) {
      return (
        'Ваша версия FFmpeg не поддерживает WASAPI.\n\n' +
        'Это происходит, если используется старая версия FFmpeg.\n\n' +
        'Решения:\n' +
        '1. Обновите пакет: npm install @ffmpeg-installer/ffmpeg@latest\n' +
        '2. Или установите FFmpeg вручную с официального сайта: https://ffmpeg.org/download.html\n' +
        '3. Убедитесь, что установлена версия FFmpeg с поддержкой WASAPI'
      );
    }
    if (errorOutput.includes('Cannot find') || errorOutput.includes('error')) {
      return (
        'Не удалось найти устройство записи.\n\n' +
        'Попробуйте:\n' +
        '1. Убедитесь, что звук воспроизводится\n' +
        '2. Проверьте настройки звука в Windows\n' +
        '3. Перезапустите приложение'
      );
    }
  }

  return null;
}

/**
 * Получает предупреждение о маленьком файле для платформы
 * @returns {string} Сообщение-предупреждение
 */
function getSmallFileWarning() {
  const platform = process.platform;

  if (platform === 'darwin') {
    return (
      'Запись завершена, но звука в файле нет.\n\n' +
      'Для захвата системного звука на macOS:\n' +
      '1. Установите BlackHole: https://github.com/ExistentialAudio/BlackHole\n' +
      '2. Выберите BlackHole как устройство вывода в системных настройках\n' +
      '3. Попробуйте снова'
    );
  } else {
    return 'Запись завершена, но звука в файле нет. Проверьте настройки звука.';
  }
}

module.exports = {
  initializePlatform,
  getRecordingArgs,
  getListDevicesArgs,
  getPlatformErrorMessage,
  getSmallFileWarning
};

