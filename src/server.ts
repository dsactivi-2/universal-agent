#!/usr/bin/env node
// ============================================================
// SERVER ENTRY POINT
// ============================================================

import 'dotenv/config';
import { APIServer } from './api/server.js';

// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY environment variable is required');
  console.log('   Set it with: export ANTHROPIC_API_KEY=your-key');
  process.exit(1);
}

const port = parseInt(process.env.PORT || '3000');
const server = new APIServer({
  jwtSecret: process.env.JWT_SECRET,
  dbPath: process.env.DB_PATH || './data/agent.db',
  memoryDbPath: process.env.MEMORY_DB_PATH || './data/memory.db'
});

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.stop();
  process.exit(0);
});

// Start server
server.start(port);
