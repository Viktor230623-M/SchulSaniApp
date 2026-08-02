// PM2-Ecosystem-Vorlage fuer SchulSani. Platzhalter in GROSSBUCHSTABEN mit
// spitzen Klammern werden vom Einrichtungsassistenten bzw. bei manuellen
// Deploys von Hand ersetzt, bevor die Datei aktiv genutzt wird.
//
// Manuelle Verwendung (ohne Assistent):
//   cp ops/install/ecosystem.config.js ecosystem.config.js
//   # Platzhalter ersetzen, dann:
//   pm2 start ecosystem.config.js
//   pm2 save

module.exports = {
  apps: [
    {
      name: "sani-backend",
      cwd: "<APP_ROOT>/artifacts/api-server",
      script: "dist/index.cjs",
      env: {
        NODE_ENV: "production",
        PORT: "3002",
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      out_file: "/var/log/schulsani/sani-backend.out.log",
      error_file: "/var/log/schulsani/sani-backend.err.log",
      time: true,
    },
  ],
};
