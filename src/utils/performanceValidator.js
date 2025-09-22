/**
 * Performance validation utility for Family Time optimizations
 * Run this to validate that all optimizations are working correctly
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import FamilyTimeService from '../services/FamilyTimeService';
import { 
  ImageOptimizer, 
  PerformanceMonitor, 
  CacheManager, 
  Debouncer,
  PaginationHelper 
} from './performanceUtils';

export class PerformanceValidator {
  constructor() {
    this.results = [];
  }

  // Log test result
  logResult(testName, passed, details = '') {
    const result = {
      test: testName,
      passed,
      details,
      timestamp: new Date().toISOString()
    };
    this.results.push(result);
    
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${testName}${details ? ` - ${details}` : ''}`);
  }

  // Test image optimization
  async testImageOptimization() {
    console.log('\n🖼️ Testing Image Optimization...');
    
    try {
      // Test large image settings
      const largeImageSettings = ImageOptimizer.getOptimalCompressionSettings(4000, 3000, 8 * 1024 * 1024);
      this.logResult(
        'Large image compression settings',
        largeImageSettings.shouldCompress && largeImageSettings.targetWidth < 1200,
        `Target width: ${largeImageSettings.targetWidth}, Quality: ${largeImageSettings.compressionQuality}`
      );

      // Test small image settings
      const smallImageSettings = ImageOptimizer.getOptimalCompressionSettings(800, 600, 1 * 1024 * 1024);
      this.logResult(
        'Small image preservation',
        !smallImageSettings.shouldCompress,
        `Should compress: ${smallImageSettings.shouldCompress}`
      );

      // Test file size estimation
      const estimatedSize = ImageOptimizer.estimateCompressedSize(5 * 1024 * 1024, 0.7, 0.5);
      this.logResult(
        'File size estimation',
        estimatedSize > 0 && estimatedSize < 5 * 1024 * 1024,
        `Estimated: ${Math.round(estimatedSize / 1024)}KB`
      );

    } catch (error) {
      this.logResult('Image optimization', false, error.message);
    }
  }

  // Test caching functionality
  async testCaching() {
    console.log('\n💾 Testing Caching...');
    
    try {
      // Test cache key generation
      const key1 = CacheManager.generateCacheKey('test-input');
      const key2 = CacheManager.generateCacheKey('test-input');
      const key3 = CacheManager.generateCacheKey('different-input');
      
      this.logResult(
        'Cache key consistency',
        key1 === key2 && key1 !== key3,
        `Keys: ${key1 === key2 ? 'consistent' : 'inconsistent'}`
      );

      // Test cache limits
      const limits = CacheManager.getCacheLimits();
      this.logResult(
        'Cache limits configuration',
        limits.maxCacheSize > 0 && limits.maxCacheAge > 0,
        `Size: ${limits.maxCacheSize / 1024 / 1024}MB, Age: ${limits.maxCacheAge / 1000 / 60 / 60}h`
      );

    } catch (error) {
      this.logResult('Caching', false, error.message);
    }
  }

  // Test debouncing
  async testDebouncing() {
    console.log('\n⏱️ Testing Debouncing...');
    
    try {
      const debouncer = new Debouncer(100);
      let callCount = 0;
      
      const testFunction = () => {
        callCount++;
        return Promise.resolve(`result-${callCount}`);
      };

      // Make multiple rapid calls
      const promise1 = debouncer.debounce('test-key', testFunction);
      const promise2 = debouncer.debounce('test-key', testFunction);
      const promise3 = debouncer.debounce('test-key', testFunction);

      // Wait for completion
      await promise1;

      this.logResult(
        'Debouncing effectiveness',
        callCount === 1 && promise1 === promise2 && promise2 === promise3,
        `Function called ${callCount} times for 3 requests`
      );

    } catch (error) {
      this.logResult('Debouncing', false, error.message);
    }
  }

  // Test pagination
  async testPagination() {
    console.log('\n📄 Testing Pagination...');
    
    try {
      // Test pagination calculation
      const pagination = PaginationHelper.calculatePagination(25, 2, 10);
      
      this.logResult(
        'Pagination calculation',
        pagination.totalPages === 3 && pagination.startIndex === 10 && pagination.endIndex === 20,
        `Page 2 of 3: items ${pagination.startIndex}-${pagination.endIndex}`
      );

      // Test page items extraction
      const items = Array.from({ length: 25 }, (_, i) => `item-${i}`);
      const pageItems = PaginationHelper.getPageItems(items, 2, 10);
      
      this.logResult(
        'Page items extraction',
        pageItems.length === 10 && pageItems[0] === 'item-10',
        `Got ${pageItems.length} items, first: ${pageItems[0]}`
      );

    } catch (error) {
      this.logResult('Pagination', false, error.message);
    }
  }

  // Test performance monitoring
  async testPerformanceMonitoring() {
    console.log('\n📊 Testing Performance Monitoring...');
    
    try {
      const timer = PerformanceMonitor.startTimer('test-operation');
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const duration = timer.end();
      
      this.logResult(
        'Performance timing',
        duration >= 40 && duration <= 100,
        `Measured ${duration}ms for 50ms operation`
      );

    } catch (error) {
      this.logResult('Performance monitoring', false, error.message);
    }
  }

  // Test FamilyTimeService performance
  async testFamilyTimeServicePerformance() {
    console.log('\n🏠 Testing FamilyTimeService Performance...');
    
    try {
      // Test activity validation performance
      const validActivity = {
        type: 'Reading Time',
        title: 'Test Activity',
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 3600000).toISOString(),
        participants: [{ childId: 'child-1', childName: 'Test Child', feeling: 'Happy' }]
      };

      const timer = PerformanceMonitor.startTimer('activity-validation');
      const validation = FamilyTimeService.validateActivityData(validActivity);
      const duration = timer.end();

      this.logResult(
        'Activity validation performance',
        validation.isValid && duration < 50,
        `Validation took ${duration}ms`
      );

      // Test data structure validation
      const invalidActivity = { type: 'Invalid' };
      const invalidValidation = FamilyTimeService.validateActivityData(invalidActivity);
      
      this.logResult(
        'Invalid activity detection',
        !invalidValidation.isValid && invalidValidation.errors.length > 0,
        `Found ${invalidValidation.errors.length} validation errors`
      );

    } catch (error) {
      this.logResult('FamilyTimeService performance', false, error.message);
    }
  }

  // Run all tests
  async runAllTests() {
    console.log('🚀 Starting Family Time Performance Validation...\n');
    
    const startTime = Date.now();
    
    await this.testImageOptimization();
    await this.testCaching();
    await this.testDebouncing();
    await this.testPagination();
    await this.testPerformanceMonitoring();
    await this.testFamilyTimeServicePerformance();
    
    const totalTime = Date.now() - startTime;
    
    // Summary
    console.log('\n📋 Test Summary:');
    const passedTests = this.results.filter(r => r.passed).length;
    const totalTests = this.results.length;
    
    console.log(`✅ Passed: ${passedTests}/${totalTests}`);
    console.log(`⏱️ Total time: ${totalTime}ms`);
    
    if (passedTests === totalTests) {
      console.log('🎉 All performance optimizations are working correctly!');
    } else {
      console.log('⚠️ Some optimizations need attention:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => console.log(`   - ${r.test}: ${r.details}`));
    }
    
    return {
      passed: passedTests,
      total: totalTests,
      duration: totalTime,
      results: this.results
    };
  }

  // Get detailed results
  getResults() {
    return this.results;
  }
}

// Export for use in components
export default PerformanceValidator;

// Auto-run validation in development
if (__DEV__) {
  // Uncomment to run validation on import
  // const validator = new PerformanceValidator();
  // validator.runAllTests().then(results => {
  //   console.log('Performance validation completed:', results);
  // });
}