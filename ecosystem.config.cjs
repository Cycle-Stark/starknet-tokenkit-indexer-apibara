module.exports = {
  apps: [
    {
      name: 'transfers_mainnet',
      script: 'yarn',
      args: 'start:transfers:mainnet',
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'transfers_sepolia',
      script: 'yarn',
      args: 'start:transfers:sepolia',
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
