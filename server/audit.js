/**
 * DimDash Audit Logger (P09)
 * Records Privileged Operations to data/audit.ndjson with Sanitization and Rotation
 */
const fs = require('fs');
const path = require('path');

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

class AuditLogger {
  constructor(dataDir) {
    this.logFile = path.join(dataDir, 'audit.ndjson');
  }

  log(entry) {
    try {
      const sanitized = Object.assign({}, entry);
      sanitized.ts = new Date().toISOString();

      // Mask sensitive fields
      if (sanitized.details && typeof sanitized.details === 'object') {
        const d = Object.assign({}, sanitized.details);
        ['pin', 'password', 'secret', 'token', 'admin_pin', 'user_pin'].forEach((k) => {
          if (k in d) d[k] = '***MASKED***';
        });
        sanitized.details = d;
      }

      this.checkRotate();

      const line = JSON.stringify(sanitized) + '\n';
      fs.appendFileSync(this.logFile, line, 'utf-8');
    } catch (e) {
      console.error('[AuditLogger] Failed to write audit log:', e.message);
    }
  }

  checkRotate() {
    try {
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        if (stats.size >= MAX_LOG_SIZE) {
          const rot1 = `${this.logFile}.1`;
          const rot2 = `${this.logFile}.2`;
          if (fs.existsSync(rot1)) {
            fs.renameSync(rot1, rot2);
          }
          fs.renameSync(this.logFile, rot1);
        }
      }
    } catch (e) {
      console.error('[AuditLogger] Rotation error:', e.message);
    }
  }

  getRecentLogs(limit = 100) {
    try {
      if (!fs.existsSync(this.logFile)) return [];
      const content = fs.readFileSync(this.logFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      return lines
        .slice(-limit)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .reverse();
    } catch {
      return [];
    }
  }
}

module.exports = AuditLogger;
