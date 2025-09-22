#!/usr/bin/env node

/**
 * Migration script to convert existing child photos to base64 format
 * This script can be run independently or integrated into the app
 */

console.log('🔄 Child Photo Base64 Migration Script\n');

// Mock implementation for testing (in real app, this would use actual services)
const mockMigration = {
  async checkMigrationNeeded() {
    // Simulate checking existing photos
    return {
      needsMigration: true,
      childrenCount: 3,
      photosToMigrate: 2
    };
  },

  async migratePhotosToBase64(onProgress) {
    const children = [
      { id: '1', firstName: 'Alice', photo: 'file:///path/to/alice.jpg' },
      { id: '2', firstName: 'Bob', photo: 'file:///path/to/bob.png' },
      { id: '3', firstName: 'Charlie', photo: null }
    ];

    const results = {
      success: true,
      migratedCount: 0,
      errors: [],
      skippedCount: 0
    };

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      
      if (!child.photo) {
        continue;
      }

      if (onProgress) {
        onProgress(i + 1, children.length, child.firstName);
      }

      // Simulate migration delay
      await new Promise(resolve => setTimeout(resolve, 500));

      if (child.photo.startsWith('file://')) {
        // Simulate successful migration
        console.log(`   ✅ Migrated photo for ${child.firstName}`);
        results.migratedCount++;
      } else {
        console.log(`   ⏭️  Skipped ${child.firstName} (no photo or already base64)`);
        results.skippedCount++;
      }
    }

    return results;
  },

  async validatePhotoMigration() {
    return {
      valid: true,
      invalidPhotos: [],
      totalPhotos: 2,
      validPhotos: 2
    };
  },

  async getMigrationStats() {
    return {
      totalChildren: 3,
      childrenWithPhotos: 2,
      base64Photos: 2,
      fileUriPhotos: 0,
      otherUriPhotos: 0,
      invalidPhotos: 0,
      totalPhotoSize: 1024 * 150 // 150KB total
    };
  }
};

async function runMigration() {
  try {
    console.log('📊 Checking migration status...');
    const status = await mockMigration.checkMigrationNeeded();
    
    console.log(`   Children: ${status.childrenCount}`);
    console.log(`   Photos to migrate: ${status.photosToMigrate}`);
    
    if (!status.needsMigration) {
      console.log('✅ No migration needed - all photos are already in base64 format');
      return;
    }

    console.log('\n🔄 Starting photo migration...');
    
    const results = await mockMigration.migratePhotosToBase64((current, total, childName) => {
      console.log(`   [${current}/${total}] Processing ${childName}...`);
    });

    console.log('\n📋 Migration Results:');
    console.log(`   ✅ Successfully migrated: ${results.migratedCount} photos`);
    console.log(`   ⏭️  Skipped: ${results.skippedCount} children`);
    console.log(`   ❌ Errors: ${results.errors.length}`);

    if (results.errors.length > 0) {
      console.log('\n❌ Migration Errors:');
      results.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.childName}: ${error.error}`);
      });
    }

    console.log('\n🔍 Validating migration...');
    const validation = await mockMigration.validatePhotoMigration();
    
    if (validation.valid) {
      console.log('✅ Validation successful - all photos are in base64 format');
    } else {
      console.log(`❌ Validation failed - ${validation.invalidPhotos.length} photos still need migration`);
      validation.invalidPhotos.forEach((photo, index) => {
        console.log(`   ${index + 1}. ${photo.childName}: ${photo.photoType}`);
      });
    }

    console.log('\n📊 Final Statistics:');
    const stats = await mockMigration.getMigrationStats();
    console.log(`   Total children: ${stats.totalChildren}`);
    console.log(`   Children with photos: ${stats.childrenWithPhotos}`);
    console.log(`   Base64 photos: ${stats.base64Photos}`);
    console.log(`   File URI photos: ${stats.fileUriPhotos}`);
    console.log(`   Total photo size: ${(stats.totalPhotoSize / 1024).toFixed(2)} KB`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Command line interface
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node migrate-photos-to-base64.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h     Show this help message');
  console.log('  --check-only   Only check migration status, don\'t migrate');
  console.log('  --validate     Only validate existing migration');
  console.log('  --stats        Show migration statistics');
  console.log('');
  console.log('Examples:');
  console.log('  node migrate-photos-to-base64.js                # Run full migration');
  console.log('  node migrate-photos-to-base64.js --check-only   # Check status only');
  console.log('  node migrate-photos-to-base64.js --validate     # Validate migration');
  console.log('  node migrate-photos-to-base64.js --stats        # Show statistics');
  process.exit(0);
}

if (args.includes('--check-only')) {
  console.log('📊 Checking migration status only...');
  mockMigration.checkMigrationNeeded().then(status => {
    console.log(`   Children: ${status.childrenCount}`);
    console.log(`   Photos to migrate: ${status.photosToMigrate}`);
    console.log(`   Migration needed: ${status.needsMigration ? 'Yes' : 'No'}`);
  });
} else if (args.includes('--validate')) {
  console.log('🔍 Validating photo migration...');
  mockMigration.validatePhotoMigration().then(validation => {
    if (validation.valid) {
      console.log('✅ All photos are in base64 format');
    } else {
      console.log(`❌ ${validation.invalidPhotos.length} photos need migration`);
    }
    console.log(`   Total photos: ${validation.totalPhotos}`);
    console.log(`   Valid photos: ${validation.validPhotos}`);
  });
} else if (args.includes('--stats')) {
  console.log('📊 Migration statistics...');
  mockMigration.getMigrationStats().then(stats => {
    console.log(`   Total children: ${stats.totalChildren}`);
    console.log(`   Children with photos: ${stats.childrenWithPhotos}`);
    console.log(`   Base64 photos: ${stats.base64Photos}`);
    console.log(`   File URI photos: ${stats.fileUriPhotos}`);
    console.log(`   Other URI photos: ${stats.otherUriPhotos}`);
    console.log(`   Invalid photos: ${stats.invalidPhotos}`);
    console.log(`   Total photo size: ${(stats.totalPhotoSize / 1024).toFixed(2)} KB`);
  });
} else {
  // Run full migration
  runMigration();
}

console.log('');
console.log('💡 Integration Notes:');
console.log('   • In the actual app, import PhotoMigration from src/utils/photoMigration.js');
console.log('   • Run migration on app startup or in settings');
console.log('   • Consider showing progress UI during migration');
console.log('   • Migration is safe and can be run multiple times');