import DataNamespacing from '../utils/dataNamespacing';
import AuthenticationService from './AuthenticationService';
import MigrationService from './MigrationService';

/**
 * Migration Reporting Service
 * Provides comprehensive reporting and audit trail functionality for migrations
 */
class MigrationReportingService {
  // Report types
  static REPORT_TYPES = {
    SUMMARY: 'summary',
    DETAILED: 'detailed',
    AUDIT_TRAIL: 'audit_trail',
    VERIFICATION: 'verification',
    CLEANUP: 'cleanup'
  };

  // Report formats
  static REPORT_FORMATS = {
    JSON: 'json',
    TEXT: 'text',
    CSV: 'csv'
  };

  /**
   * Get current authenticated user ID
   * @private
   * @returns {Promise<string>} User ID
   * @throws {Error} If user is not authenticated
   */
  static async _getCurrentUserId() {
    const user = await AuthenticationService.getCurrentUser();
    if (!user || !user.id) {
      throw new Error('User not authenticated');
    }
    return user.id;
  }

  /**
   * Generate comprehensive migration report
   * @param {string} userId - Optional user ID (uses current user if not provided)
   * @param {string} reportType - Type of report to generate
   * @param {string} format - Report format
   * @returns {Promise<Object>} Migration report
   */
  static async generateMigrationReport(userId = null, reportType = this.REPORT_TYPES.SUMMARY, format = this.REPORT_FORMATS.JSON) {
    try {
      const currentUserId = userId || await this._getCurrentUserId();
      
      const report = {
        userId: currentUserId,
        reportType,
        format,
        generatedAt: new Date().toISOString(),
        version: '1.0.0'
      };

      switch (reportType) {
        case this.REPORT_TYPES.SUMMARY:
          report.data = await this._generateSummaryReport(currentUserId);
          break;
        
        case this.REPORT_TYPES.DETAILED:
          report.data = await this._generateDetailedReport(currentUserId);
          break;
        
        case this.REPORT_TYPES.AUDIT_TRAIL:
          report.data = await this._generateAuditTrailReport(currentUserId);
          break;
        
        case this.REPORT_TYPES.VERIFICATION:
          report.data = await this._generateVerificationReport(currentUserId);
          break;
        
        case this.REPORT_TYPES.CLEANUP:
          report.data = await this._generateCleanupReport(currentUserId);
          break;
        
        default:
          throw new Error(`Unknown report type: ${reportType}`);
      }

      // Format the report based on requested format
      if (format === this.REPORT_FORMATS.TEXT) {
        report.formattedData = this._formatReportAsText(report.data, reportType);
      } else if (format === this.REPORT_FORMATS.CSV) {
        report.formattedData = this._formatReportAsCSV(report.data, reportType);
      }

      // Store report for future reference
      await this._storeReport(currentUserId, report);

      return report;

    } catch (error) {
      console.error('Error generating migration report:', error);
      return {
        success: false,
        error: error.message,
        generatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Get migration statistics
   * @param {string} userId - Optional user ID (uses current user if not provided)
   * @returns {Promise<Object>} Migration statistics
   */
  static async getMigrationStatistics(userId = null) {
    try {
      const currentUserId = userId || await this._getCurrentUserId();
      
      const [
        migrationStatus,
        migrationPlan,
        verificationResult,
        rollbackStatus
      ] = await Promise.all([
        DataNamespacing.getUserData(MigrationService.MIGRATION_KEYS.STATUS, null, currentUserId),
        DataNamespacing.getUserData(MigrationService.MIGRATION_KEYS.PLAN, null, currentUserId),
        DataNamespacing.getUserData(MigrationService.MIGRATION_KEYS.VERIFICATION, null, currentUserId),
        DataNamespacing.getUserData('rollback_status', null, currentUserId)
      ]);

      const stats = {
        userId: currentUserId,
        generatedAt: new Date().toISOString(),
        migration: {
          status: migrationStatus?.status || 'unknown',
          hasBeenAttempted: migrationStatus !== null,
          isCompleted: migrationStatus?.status === MigrationService.MIGRATION_STATUS.COMPLETED,
          isVerified: migrationStatus?.status === MigrationService.MIGRATION_STATUS.VERIFIED,
          startedAt: migrationStatus?.startedAt || null,
          completedAt: migrationStatus?.completedAt || null,
          verifiedAt: migrationStatus?.verifiedAt || null
        },
        plan: {
          exists: migrationPlan !== null,
          totalItems: migrationPlan?.totalItems || 0,
          totalSteps: migrationPlan?.totalSteps || 0,
          estimatedDuration: migrationPlan?.estimatedDuration || 0,
          createdAt: migrationPlan?.createdAt || null
        },
        execution: {
          completedSteps: migrationStatus?.completedSteps || 0,
          totalErrors: migrationStatus?.errors?.length || 0,
          totalWarnings: migrationStatus?.warnings?.length || 0,
          migratedItems: this._calculateMigratedItems(migrationStatus?.migratedItems)
        },
        verification: {
          hasBeenVerified: verificationResult !== null,
          verificationSuccess: verificationResult?.success || false,
          verificationErrors: verificationResult?.errors?.length || 0,
          verificationWarnings: verificationResult?.warnings?.length || 0,
          verifiedAt: verificationResult?.verifiedAt || null
        },
        rollback: {
          hasBeenRolledBack: rollbackStatus !== null,
          rollbackStatus: rollbackStatus?.status || 'none',
          rollbackSuccess: rollbackStatus?.success || false,
          rolledBackAt: rollbackStatus?.completedAt || null
        }
      };

      // Calculate overall health score
      stats.healthScore = this._calculateHealthScore(stats);

      return stats;

    } catch (error) {
      console.error('Error getting migration statistics:', error);
      return {
        success: false,
        error: error.message,
        generatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Get migration timeline
   * @param {string} userId - Optional user ID (uses current user if not provided)
   * @returns {Promise<Array>} Migration timeline events
   */
  static async getMigrationTimeline(userId = null) {
    try {
      const currentUserId = userId || await this._getCurrentUserId();
      
      const timeline = [];

      // Get all migration-related data
      const [
        migrationStatus,
        migrationPlan,
        verificationResult,
        rollbackStatus,
        detectionResult
      ] = await Promise.all([
        DataNamespacing.getUserData(MigrationService.MIGRATION_KEYS.STATUS, null, currentUserId),
        DataNamespacing.getUserData(MigrationService.MIGRATION_KEYS.PLAN, null, currentUserId),
        DataNamespacing.getUserData(MigrationService.MIGRATION_KEYS.VERIFICATION, null, currentUserId),
        DataNamespacing.getUserData('rollback_status', null, currentUserId),
        DataNamespacing.getUserData('migration_detection', null, currentUserId)
      ]);

      // Add detection event
      if (detectionResult) {
        timeline.push({
          event: 'migration_detected',
          timestamp: detectionResult.detectedAt,
          description: `Migration need detected: ${detectionResult.reason}`,
          data: {
            needed: detectionResult.needed,
            totalItems: detectionResult.legacyData?.totalItems || 0
          }
        });
      }

      // Add plan creation event
      if (migrationPlan) {
        timeline.push({
          event: 'plan_created',
          timestamp: migrationPlan.createdAt,
          description: `Migration plan created with ${migrationPlan.totalSteps} steps`,
          data: {
            totalItems: migrationPlan.totalItems,
            estimatedDuration: migrationPlan.estimatedDuration
          }
        });
      }

      // Add migration execution events
      if (migrationStatus) {
        if (migrationStatus.startedAt) {
          timeline.push({
            event: 'migration_started',
            timestamp: migrationStatus.startedAt,
            description: 'Migration execution started',
            data: {
              status: migrationStatus.status
            }
          });
        }

        if (migrationStatus.completedAt) {
          timeline.push({
            event: 'migration_completed',
            timestamp: migrationStatus.completedAt,
            description: `Migration ${migrationStatus.status}`,
            data: {
              success: migrationStatus.status === MigrationService.MIGRATION_STATUS.COMPLETED,
              completedSteps: migrationStatus.completedSteps,
              errors: migrationStatus.errors?.length || 0
            }
          });
        }

        if (migrationStatus.failedAt) {
          timeline.push({
            event: 'migration_failed',
            timestamp: migrationStatus.failedAt,
            description: `Migration failed: ${migrationStatus.error}`,
            data: {
              error: migrationStatus.error,
              completedSteps: migrationStatus.completedSteps
            }
          });
        }
      }

      // Add verification event
      if (verificationResult) {
        timeline.push({
          event: 'migration_verified',
          timestamp: verificationResult.verifiedAt,
          description: `Migration verification ${verificationResult.success ? 'passed' : 'failed'}`,
          data: {
            success: verificationResult.success,
            errors: verificationResult.errors?.length || 0,
            warnings: verificationResult.warnings?.length || 0
          }
        });
      }

      // Add rollback events
      if (rollbackStatus) {
        if (rollbackStatus.startedAt) {
          timeline.push({
            event: 'rollback_started',
            timestamp: rollbackStatus.startedAt,
            description: 'Migration rollback started',
            data: {
              reason: rollbackStatus.reason || 'Migration failure'
            }
          });
        }

        if (rollbackStatus.completedAt) {
          timeline.push({
            event: 'rollback_completed',
            timestamp: rollbackStatus.completedAt,
            description: `Rollback ${rollbackStatus.success ? 'successful' : 'failed'}`,
            data: {
              success: rollbackStatus.success,
              operations: rollbackStatus.operations?.length || 0
            }
          });
        }
      }

      // Sort timeline by timestamp
      timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      return timeline;

    } catch (error) {
      console.error('Error getting migration timeline:', error);
      return [];
    }
  }

  /**
   * Export migration data for backup or analysis
   * @param {string} userId - Optional user ID (uses current user if not provided)
   * @param {Array} dataTypes - Types of data to export
   * @returns {Promise<Object>} Exported migration data
   */
  static async exportMigrationData(userId = null, dataTypes = ['all']) {
    try {
      const currentUserId = userId || await this._getCurrentUserId();
      
      const exportData = {
        userId: currentUserId,
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        data: {}
      };

      const allDataTypes = [
        'migration_status',
        'migration_plan',
        'migration_verification',
        'migration_backup',
        'rollback_status',
        'migration_detection'
      ];

      const typesToExport = dataTypes.includes('all') ? allDataTypes : dataTypes;

      for (const dataType of typesToExport) {
        const data = await DataNamespacing.getUserData(dataType, null, currentUserId);
        if (data) {
          exportData.data[dataType] = data;
        }
      }

      // Add metadata
      exportData.metadata = {
        totalDataTypes: Object.keys(exportData.data).length,
        dataSize: JSON.stringify(exportData.data).length,
        exportedTypes: Object.keys(exportData.data)
      };

      return exportData;

    } catch (error) {
      console.error('Error exporting migration data:', error);
      return {
        success: false,
        error: error.message,
        exportedAt: new Date().toISOString()
      };
    }
  }

  // Private helper methods

  /**
   * Generate summary report
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Summary report data
   */
  static async _generateSummaryReport(userId) {
    const stats = await this.getMigrationStatistics(userId);
    
    return {
      overview: {
        migrationStatus: stats.migration.status,
        isCompleted: stats.migration.isCompleted,
        isVerified: stats.migration.isVerified,
        healthScore: stats.healthScore
      },
      execution: {
        totalItemsPlanned: stats.plan.totalItems,
        totalItemsMigrated: stats.execution.migratedItems.total,
        completedSteps: stats.execution.completedSteps,
        totalSteps: stats.plan.totalSteps,
        errors: stats.execution.totalErrors,
        warnings: stats.execution.totalWarnings
      },
      timing: {
        startedAt: stats.migration.startedAt,
        completedAt: stats.migration.completedAt,
        verifiedAt: stats.migration.verifiedAt,
        duration: this._calculateDuration(stats.migration.startedAt, stats.migration.completedAt)
      }
    };
  }

  /**
   * Generate detailed report
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Detailed report data
   */
  static async _generateDetailedReport(userId) {
    const [stats, timeline] = await Promise.all([
      this.getMigrationStatistics(userId),
      this.getMigrationTimeline(userId)
    ]);

    const migrationStatus = await DataNamespacing.getUserData(MigrationService.MIGRATION_KEYS.STATUS, null, userId);
    const migrationPlan = await DataNamespacing.getUserData(MigrationService.MIGRATION_KEYS.PLAN, null, userId);

    return {
      summary: await this._generateSummaryReport(userId),
      timeline,
      plan: migrationPlan,
      execution: {
        status: migrationStatus,
        itemBreakdown: stats.execution.migratedItems,
        errorDetails: migrationStatus?.errors || [],
        warningDetails: migrationStatus?.warnings || []
      },
      verification: await DataNamespacing.getUserData(MigrationService.MIGRATION_KEYS.VERIFICATION, null, userId),
      rollback: await DataNamespacing.getUserData('rollback_status', null, userId)
    };
  }

  /**
   * Generate audit trail report
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Audit trail report data
   */
  static async _generateAuditTrailReport(userId) {
    const timeline = await this.getMigrationTimeline(userId);
    
    return {
      auditTrail: timeline.map(event => ({
        timestamp: event.timestamp,
        event: event.event,
        description: event.description,
        dataHash: this._generateDataHash(event.data),
        metadata: {
          userId,
          eventId: `${event.event}_${event.timestamp}`,
          version: '1.0.0'
        }
      })),
      integrity: {
        totalEvents: timeline.length,
        firstEvent: timeline[0]?.timestamp || null,
        lastEvent: timeline[timeline.length - 1]?.timestamp || null,
        auditHash: this._generateDataHash(timeline)
      }
    };
  }

  /**
   * Generate verification report
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Verification report data
   */
  static async _generateVerificationReport(userId) {
    const verificationResult = await DataNamespacing.getUserData(MigrationService.MIGRATION_KEYS.VERIFICATION, null, userId);
    
    if (!verificationResult) {
      return {
        status: 'not_verified',
        message: 'Migration has not been verified'
      };
    }

    return {
      status: verificationResult.success ? 'verified' : 'verification_failed',
      verifiedAt: verificationResult.verifiedAt,
      checks: verificationResult.checks,
      errors: verificationResult.errors,
      warnings: verificationResult.warnings,
      summary: {
        totalChecks: Object.keys(verificationResult.checks || {}).length,
        passedChecks: Object.values(verificationResult.checks || {}).filter(check => check.success).length,
        totalErrors: verificationResult.errors?.length || 0,
        totalWarnings: verificationResult.warnings?.length || 0
      }
    };
  }

  /**
   * Generate cleanup report
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Cleanup report data
   */
  static async _generateCleanupReport(userId) {
    const migrationStatus = await DataNamespacing.getUserData(MigrationService.MIGRATION_KEYS.STATUS, null, userId);
    
    return {
      cleanupStatus: migrationStatus?.cleanupCompletedAt ? 'completed' : 'not_completed',
      cleanupCompletedAt: migrationStatus?.cleanupCompletedAt || null,
      cleanupResult: migrationStatus?.cleanupResult || null,
      recommendations: this._generateCleanupRecommendations(migrationStatus)
    };
  }

  /**
   * Calculate migrated items from migration status
   * @private
   * @param {Object} migratedItems - Migrated items data
   * @returns {Object} Calculated migrated items
   */
  static _calculateMigratedItems(migratedItems) {
    if (!migratedItems) {
      return { total: 0, children: 0, events: 0, activities: 0 };
    }

    return {
      total: (migratedItems.children?.migrated || 0) + 
             (migratedItems.calendar_events?.migrated || 0) + 
             (migratedItems.family_time_activities?.migrated || 0),
      children: migratedItems.children?.migrated || 0,
      events: migratedItems.calendar_events?.migrated || 0,
      activities: migratedItems.family_time_activities?.migrated || 0
    };
  }

  /**
   * Calculate health score based on migration statistics
   * @private
   * @param {Object} stats - Migration statistics
   * @returns {number} Health score (0-100)
   */
  static _calculateHealthScore(stats) {
    let score = 0;

    // Migration completion (40 points)
    if (stats.migration.isCompleted) {
      score += 40;
    } else if (stats.migration.hasBeenAttempted) {
      score += 20;
    }

    // Verification (30 points)
    if (stats.migration.isVerified) {
      score += 30;
    } else if (stats.verification.hasBeenVerified) {
      score += 15;
    }

    // Error rate (20 points)
    const totalItems = stats.plan.totalItems || 1;
    const errorRate = stats.execution.totalErrors / totalItems;
    if (errorRate === 0) {
      score += 20;
    } else if (errorRate < 0.1) {
      score += 15;
    } else if (errorRate < 0.25) {
      score += 10;
    }

    // Rollback status (10 points)
    if (!stats.rollback.hasBeenRolledBack) {
      score += 10;
    } else if (stats.rollback.rollbackSuccess) {
      score += 5;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Calculate duration between two timestamps
   * @private
   * @param {string} startTime - Start timestamp
   * @param {string} endTime - End timestamp
   * @returns {Object} Duration breakdown
   */
  static _calculateDuration(startTime, endTime) {
    if (!startTime || !endTime) {
      return null;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMs = end - start;

    return {
      milliseconds: durationMs,
      seconds: Math.floor(durationMs / 1000),
      minutes: Math.floor(durationMs / (1000 * 60)),
      hours: Math.floor(durationMs / (1000 * 60 * 60)),
      humanReadable: this._formatDuration(durationMs)
    };
  }

  /**
   * Format duration in human readable format
   * @private
   * @param {number} durationMs - Duration in milliseconds
   * @returns {string} Human readable duration
   */
  static _formatDuration(durationMs) {
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Generate data hash for integrity checking
   * @private
   * @param {Object} data - Data to hash
   * @returns {string} Simple hash
   */
  static _generateDataHash(data) {
    // Simple hash function for data integrity
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Generate cleanup recommendations
   * @private
   * @param {Object} migrationStatus - Migration status
   * @returns {Array} Cleanup recommendations
   */
  static _generateCleanupRecommendations(migrationStatus) {
    const recommendations = [];

    if (!migrationStatus) {
      return recommendations;
    }

    if (migrationStatus.status === MigrationService.MIGRATION_STATUS.VERIFIED && !migrationStatus.cleanupCompletedAt) {
      recommendations.push({
        type: 'cleanup_safe',
        priority: 'high',
        message: 'Migration is verified and safe to clean up AsyncStorage data',
        action: 'Run cleanup process'
      });
    }

    if (migrationStatus.status === MigrationService.MIGRATION_STATUS.COMPLETED && !migrationStatus.verifiedAt) {
      recommendations.push({
        type: 'verify_first',
        priority: 'medium',
        message: 'Migration completed but not verified. Verify before cleanup',
        action: 'Run verification process'
      });
    }

    if (migrationStatus.errors && migrationStatus.errors.length > 0) {
      recommendations.push({
        type: 'review_errors',
        priority: 'high',
        message: 'Migration has errors that should be reviewed before cleanup',
        action: 'Review and resolve migration errors'
      });
    }

    return recommendations;
  }

  /**
   * Format report as text
   * @private
   * @param {Object} data - Report data
   * @param {string} reportType - Report type
   * @returns {string} Formatted text
   */
  static _formatReportAsText(data, reportType) {
    // Simple text formatting - could be enhanced
    return `Migration Report (${reportType})\n` +
           `Generated: ${new Date().toISOString()}\n` +
           `Data: ${JSON.stringify(data, null, 2)}`;
  }

  /**
   * Format report as CSV
   * @private
   * @param {Object} data - Report data
   * @param {string} reportType - Report type
   * @returns {string} Formatted CSV
   */
  static _formatReportAsCSV(data, reportType) {
    // Simple CSV formatting - could be enhanced based on report type
    if (reportType === this.REPORT_TYPES.AUDIT_TRAIL && data.auditTrail) {
      const headers = 'Timestamp,Event,Description\n';
      const rows = data.auditTrail.map(event => 
        `${event.timestamp},${event.event},"${event.description}"`
      ).join('\n');
      return headers + rows;
    }
    
    return `Migration Report (${reportType})\n${JSON.stringify(data)}`;
  }

  /**
   * Store report for future reference
   * @private
   * @param {string} userId - User ID
   * @param {Object} report - Report to store
   */
  static async _storeReport(userId, report) {
    const reportKey = `migration_report_${report.reportType}_${report.generatedAt.replace(/[:.]/g, '_')}`;
    await DataNamespacing.setUserData(reportKey, report, userId);
  }
}

export default MigrationReportingService;