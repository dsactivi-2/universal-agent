module.exports = {
  apps: [
    {
      name: 'universal-agent-backend',
      script: 'dist/server.js',
      cwd: '/root/universal-agent',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      env_file: '.env',
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10
    },
    {
      name: 'universal-agent-frontend',
      script: 'npm',
      args: 'start',
      cwd: '/root/universal-agent/frontend',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true
    }
  ]
};
