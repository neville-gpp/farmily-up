#!/usr/bin/env node

/**
 * DynamoDB Setup Script
 *
 * This script sets up the DynamoDB infrastructure for the Parent-Child App.
 * It creates all required tables and waits for them to become active.
 *
 * Usage:
 *   node scripts/setup-dynamodb.js [options]
 *
 * Options:
 *   --validate-only    Only validate existing infrastructure, don't create tables
 *   --force           Force recreation of existing tables (destructive)
 *   --help            Show this help message
 */

import { DynamoDBTableCreator } from '../src/utils/dynamodb-table-creator.js';

// Parse command line arguments
const args = process.argv.slice(2);
const validateOnly = args.includes('--validate-only');
const force = args.includes('--force');
const help = args.includes('--help');

if (help) {
  console.log(`
DynamoDB Setup Script

This script sets up the DynamoDB infrastructure for the Parent-Child App.

Usage:
  node scripts/setup-dynamodb.js [options]

Options:
  --validate-only    Only validate existing infrastructure, don't create tables
  --force           Force recreation of existing tables (destructive)
  --help            Show this help message

Environment Variables:
  EXPO_PUBLIC_AWS_REGION              AWS region (default: us-east-1)
  EXPO_PUBLIC_AWS_ACCESS_KEY_ID       AWS access key ID
  EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY   AWS secret access key
  EXPO_PUBLIC_DYNAMODB_TABLE_PREFIX   Table name prefix (default: FarmilyUP)
`);
  process.exit(0);
}

async function main() {
  try {
    console.log('🚀 DynamoDB Setup Script Starting...\n');

    // Validate environment variables
    const requiredEnvVars = [
      'EXPO_PUBLIC_AWS_ACCESS_KEY_ID',
      'EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY',
    ];

    const missingEnvVars = requiredEnvVars.filter(
      (envVar) => !process.env[envVar]
    );

    if (missingEnvVars.length > 0) {
      console.error('❌ Missing required environment variables:');
      missingEnvVars.forEach((envVar) => console.error(`   - ${envVar}`));
      console.error(
        '\nPlease set these variables in your .env file or environment.\n'
      );
      process.exit(1);
    }

    console.log('✅ Environment variables validated');
    console.log(
      `📍 Region: ${process.env.EXPO_PUBLIC_AWS_REGION || 'ap-east-1'}`
    );
    console.log(
      `🏷️  Table Prefix: ${
        process.env.EXPO_PUBLIC_DYNAMODB_TABLE_PREFIX || 'FarmilyUP'
      }\n`
    );

    if (validateOnly) {
      console.log('🔍 Validating existing infrastructure...\n');
      const validation = await DynamoDBTableCreator.validateInfrastructure();

      console.log('\n📊 Validation Summary:');
      console.log(`   Total Tables: ${validation.totalTables}`);
      console.log(`   Existing: ${validation.existingTables}`);
      console.log(`   Missing: ${validation.missingTables}`);
      console.log(`   Errors: ${validation.errorTables}`);

      if (validation.missingTables > 0 || validation.errorTables > 0) {
        console.log('\n❌ Infrastructure validation failed');
        console.log('Run without --validate-only to create missing tables');
        process.exit(1);
      } else {
        console.log('\n✅ All tables exist and are accessible');
        process.exit(0);
      }
    }

    if (force) {
      console.log(
        '⚠️  Force mode enabled - this will recreate existing tables'
      );
      console.log('⚠️  This is destructive and will delete all existing data');
      console.log(
        '⚠️  Press Ctrl+C to cancel, or wait 5 seconds to continue...\n'
      );

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // Setup infrastructure
    console.log('🏗️  Setting up DynamoDB infrastructure...\n');
    const setupResult = await DynamoDBTableCreator.setupInfrastructure();

    console.log('\n📊 Setup Summary:');
    console.log(`   Total Tables: ${setupResult.totalTables}`);
    console.log(`   Created: ${setupResult.createdTables}`);
    console.log(`   Failed: ${setupResult.failedCreations}`);
    console.log(`   Active: ${setupResult.activeTables}`);

    // Show detailed results
    if (setupResult.failedCreations > 0) {
      console.log('\n❌ Failed Table Creations:');
      setupResult.creationResults
        .filter((result) => !result.success)
        .forEach((result) => {
          console.log(`   - ${result.tableKey}: ${result.error}`);
        });
    }

    if (setupResult.activeTables < setupResult.createdTables) {
      console.log('\n⏳ Tables not yet active:');
      Object.entries(setupResult.activeResults)
        .filter(([, result]) => !result.success)
        .forEach(([tableName, result]) => {
          console.log(`   - ${tableName}: ${result.message || result.error}`);
        });
    }

    if (
      setupResult.failedCreations === 0 &&
      setupResult.activeTables === setupResult.totalTables
    ) {
      console.log('\n✅ DynamoDB infrastructure setup completed successfully!');
      console.log('🎉 All tables are created and active');
      process.exit(0);
    } else {
      console.log('\n⚠️  Setup completed with some issues');
      console.log('Please check the logs above and retry if necessary');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Setup failed with error:', error.message);
    console.error('\nFull error details:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the main function
main();
