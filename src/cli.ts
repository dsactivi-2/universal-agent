#!/usr/bin/env node
// ============================================================
// CLI - Interactive command-line interface for testing
// ============================================================

import * as readline from 'readline';
import { UniversalAgent } from './index.js';

const BANNER = `
╔═══════════════════════════════════════════════════════════╗
║            UNIVERSAL AI AGENT SYSTEM v0.1.0              ║
║               Local Development Build                    ║
╚═══════════════════════════════════════════════════════════╝
`;

async function main(): Promise<void> {
  console.log(BANNER);

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY environment variable is required');
    console.log('   Set it with: export ANTHROPIC_API_KEY=your-key');
    process.exit(1);
  }

  // Initialize agent
  console.log('🚀 Initializing agent...');
  const agent = new UniversalAgent({
    dbPath: './data/agent.db'
  });
  console.log('✅ Agent ready!\n');

  // Show help
  console.log('Commands:');
  console.log('  /help    - Show this help');
  console.log('  /status  - Show system status');
  console.log('  /exit    - Exit the program');
  console.log('\nType your request or question:\n');

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Handle commands
    if (input.startsWith('/')) {
      switch (input.toLowerCase()) {
        case '/help':
          console.log('\nCommands:');
          console.log('  /help    - Show this help');
          console.log('  /status  - Show system status');
          console.log('  /exit    - Exit the program\n');
          break;

        case '/status':
          console.log('\n📊 System Status:');
          console.log('  - Anthropic API: ' + (process.env.ANTHROPIC_API_KEY ? '✅ Configured' : '❌ Missing'));
          console.log('  - Tavily API: ' + (process.env.TAVILY_API_KEY ? '✅ Configured' : '⚠️ Using simulated search'));
          console.log('  - Database: ./data/agent.db\n');
          break;

        case '/exit':
        case '/quit':
        case '/q':
          console.log('\n👋 Goodbye!\n');
          agent.close();
          process.exit(0);

        default:
          console.log(`Unknown command: ${input}\n`);
      }
      rl.prompt();
      return;
    }

    // Process user request
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
      const result = await agent.run(input, {
        onLog: (log) => {
          const prefix = log.level === 'error' ? '❌' :
                         log.level === 'warn' ? '⚠️' :
                         log.level === 'debug' ? '🔍' : '📝';
          console.log(`${prefix} ${log.message}`);
        },
        onToolCall: (call) => {
          if (call.error) {
            console.log(`🔧 Tool ${call.toolName} failed: ${call.error}`);
          } else {
            console.log(`🔧 Tool ${call.toolName} completed (${call.duration}ms)`);
          }
        },
        onProgress: (phase, progress) => {
          console.log(`📈 ${phase}: ${Math.round(progress * 100)}%`);
        }
      });

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      if (result.status === 'completed') {
        console.log('✅ Task completed!\n');
        if (result.summary) {
          console.log('📋 Summary:');
          console.log(result.summary);
          console.log();
        }
      } else if (result.status === 'failed') {
        console.log(`❌ Task failed: ${result.error}\n`);
      }

      console.log(`⏱️  Duration: ${result.duration}ms\n`);
    } catch (error) {
      console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n👋 Goodbye!\n');
    agent.close();
    process.exit(0);
  });
}

main().catch(console.error);
