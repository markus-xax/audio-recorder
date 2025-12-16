const { spawn } = require('child_process');
const fs = require('fs');
const { getFfmpegPath, validateFfmpeg } = require('../config/ffmpeg');
const { getListDevicesArgs } = require('../config/platform');

/**
 * Парсит список аудио устройств из вывода FFmpeg для macOS
 * @param {string} output - Вывод FFmpeg
 * @returns {Array<{index: number, name: string}>} Массив устройств с индексом и именем
 */
function parseMacOSDevices(output) {
  const devices = [];
  const lines = output.split('\n');
  
  let inAudioSection = false;
  
  for (const line of lines) {
    // Ищем секцию аудио устройств
    if (line.includes('AVFoundation audio devices:')) {
      inAudioSection = true;
      continue;
    }
    
    // Если нашли видео устройства, заканчиваем
    if (inAudioSection && line.includes('AVFoundation video devices:')) {
      break;
    }
    
    // Парсим строки вида "[0] Built-in Microphone"
    if (inAudioSection) {
      const match = line.match(/\[(\d+)\]\s+(.+)/);
      if (match) {
        const index = parseInt(match[1], 10);
        const name = match[2].trim();
        devices.push({ index, name });
      }
    }
  }
  
  return devices;
}

/**
 * Получает список доступных аудио устройств
 * @returns {Promise<{success: boolean, devices?: string, parsedDevices?: Array, platform?: string, error?: string}>}
 */
async function listAudioDevices() {
  try {
    const validation = validateFfmpeg();
    if (!validation.exists) {
      return { success: false, error: 'FFmpeg не найден' };
    }

    const platform = process.platform;
    const { args, error } = getListDevicesArgs(validation.path);

    if (error) {
      return { success: false, error };
    }

    const listCommand = spawn(validation.path, args);
    let output = '';
    let errorOutput = '';

    listCommand.stdout.on('data', (data) => {
      output += data.toString();
    });

    listCommand.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    return new Promise((resolve) => {
      listCommand.on('close', (code) => {
        // FFmpeg выводит список устройств в stderr
        const devices = errorOutput || output;
        
        // Парсим устройства для macOS
        let parsedDevices = null;
        if (platform === 'darwin') {
          parsedDevices = parseMacOSDevices(devices);
        }
        
        resolve({
          success: true,
          devices: devices,
          parsedDevices: parsedDevices,
          platform: platform
        });
      });

      listCommand.on('error', (error) => {
        resolve({
          success: false,
          error: error.message
        });
      });
    });
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  listAudioDevices,
  parseMacOSDevices
};

