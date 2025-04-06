module.exports = {
  apps: [
    {
      name: 'transfers_sepolia',
      script: 'yarn',
      args: 'dev:sepolia',
      watch: false,
      env: {
        NODE_ENV: 'development'
      }
    }
  ]
};
