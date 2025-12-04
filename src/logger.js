const fs = require('fs');
const path = require('path');

class Logger {
  constructor(config) {
    this.config = config || { enabled: true, directory: 'logs', console: true, file: true };
    this.logFile = null;

    if (this.config.enabled && this.config.file) {
      this.setupLogFile();
    }
  }

  setupLogFile() {
    try {
      // Create logs directory if it doesn't exist
      if (!fs.existsSync(this.config.directory)) {
        fs.mkdirSync(this.config.directory, { recursive: true });
      }

      // Create log filename with date
      const date = new Date().toISOString().split('T')[0];
      this.logFile = path.join(this.config.directory, `app-${date}.log`);
    } catch (err) {
      console.error('Failed to setup log file:', err.message);
      this.config.file = false;
    }
  }

  formatMessage(level, message) {
    const timestamp = new Date().toLocaleString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  writeToFile(message) {
    if (this.config.file && this.logFile) {
      try {
        fs.appendFileSync(this.logFile, message + '\n');
      } catch (err) {
        console.error('Failed to write to log file:', err.message);
      }
    }
  }

  info(message) {
    const formatted = this.formatMessage('INFO', message);
    if (this.config.console) {
      console.log(formatted);
    }
    this.writeToFile(formatted);
  }

  error(message) {
    const formatted = this.formatMessage('ERROR', message);
    if (this.config.console) {
      console.error(formatted);
    }
    this.writeToFile(formatted);
  }

  warn(message) {
    const formatted = this.formatMessage('WARN', message);
    if (this.config.console) {
      console.warn(formatted);
    }
    this.writeToFile(formatted);
  }

  success(message) {
    const formatted = this.formatMessage('SUCCESS', message);
    if (this.config.console) {
      console.log(formatted);
    }
    this.writeToFile(formatted);
  }
}

module.exports = Logger;
