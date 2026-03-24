const cwd = process.env.APP_DIR || '/Users/bini/apps/06_trill-lab';
const port = process.env.PORT || '23310';

module.exports = {
  apps: [
    {
      name: 'trill-lab',
      cwd,
      script: 'node_modules/next/dist/bin/next',
      args: `start --hostname 127.0.0.1 --port ${port}`,
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: port,
      },
    },
  ],
};
