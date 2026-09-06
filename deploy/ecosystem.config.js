/**
 * PM2 production config — run: pm2 start ecosystem.config.js
 * Or reload after deploy: pm2 reload ecosystem.config.js
 */
module.exports = {
  apps: [
    {
      name: 'www',
      script: './bin/www',
      cwd: __dirname + '/..',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 15,
      min_uptime: '10s',
      restart_delay: 3000,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true
    }
  ]
};
