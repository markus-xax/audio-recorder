const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const status = document.getElementById('status');

let isRecording = false;

// Обновление статуса
function updateStatus(text, className) {
  status.textContent = text;
  status.className = `status ${className}`;
}

// Обновление кнопок
function updateButtons(recording) {
  isRecording = recording;
  recordBtn.disabled = recording;
  stopBtn.disabled = !recording;
}

// Обработчики событий от Electron
window.electronAPI.onRecordingStopped((path) => {
  updateStatus(`Запись сохранена: ${path}`, 'idle');
  updateButtons(false);
  alert(`Запись успешно сохранена!\n\n${path}`);
});

window.electronAPI.onRecordingError((error) => {
  updateStatus('Ошибка записи', 'idle');
  updateButtons(false);
  alert(`Ошибка: ${error}`);
});

// Начало записи
recordBtn.addEventListener('click', async () => {
  try {
    const result = await window.electronAPI.startRecording();
    if (result.success) {
      updateStatus('● Запись...', 'recording');
      updateButtons(true);
    } else {
      alert(`Ошибка: ${result.error}`);
    }
  } catch (error) {
    alert(`Ошибка: ${error.message}`);
  }
});

// Остановка записи
stopBtn.addEventListener('click', async () => {
  try {
    const result = await window.electronAPI.stopRecording();
    if (result.success) {
      updateStatus('Остановка записи...', 'idle');
    } else {
      alert(`Ошибка: ${result.error}`);
    }
  } catch (error) {
    alert(`Ошибка: ${error.message}`);
  }
});

// Проверка статуса при загрузке
window.electronAPI.isRecording().then((recording) => {
  if (recording) {
    updateStatus('● Запись...', 'recording');
    updateButtons(true);
  }
});

