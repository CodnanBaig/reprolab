// Framework-independent ESM adapter. In React, call start() inside an effect or an explicit user action, and stop() on cleanup.
import './reprolab.js';
export const startRecording = options => window.ReproLab.start(options);
export const version = '0.1.0';
