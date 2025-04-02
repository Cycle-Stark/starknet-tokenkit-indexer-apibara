#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the environment name from command line arguments
const args = process.argv.slice(2);
const envIndex = args.findIndex(arg => arg === '--env');
let envName = 'mainnet';

if (envIndex >= 0 && envIndex < args.length - 1) {
  envName = args[envIndex + 1];
  // Remove the --env and its value from args
  args.splice(envIndex, 2);
}

// Add the command to the arguments if not present
if (!args.includes('dev') && !args.includes('start')) {
  args.unshift('dev');
}

// Add the preset if not present
if (!args.includes('--preset')) {
  args.push('--preset', envName);
}

// Determine the env file to use
const envFile = envName === 'sepolia' ? '.sepolia.env' : '.env';
const envPath = path.resolve(process.cwd(), envFile);

console.log(`Using environment file: ${envFile}`);
console.log(`Running command: apibara ${args.join(' ')}`);

// Check if the env file exists
if (!fs.existsSync(envPath)) {
  console.error(`Error: Environment file ${envFile} not found!`);
  process.exit(1);
}

// Load environment variables from the file
dotenv.config({ path: envPath });

// Run the apibara command with the remaining arguments
const command = 'apibara';
const childProcess = spawn(command, args, { 
  stdio: 'inherit',
  env: { ...process.env },
  shell: true
});

childProcess.on('close', (code) => {
  process.exit(code);
});
