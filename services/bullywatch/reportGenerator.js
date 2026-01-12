/**
 * Report Generator Service
 * Generates comprehensive harassment reports for groups
 * Used by admins for monitoring and intervention
 */

const temporalAnalysisService = require('./temporalAnalysisService');
const feedbackService = require('./feedbackService');

class ReportGenerator {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    console.log('✅ ReportGenerator initialized');
  }

  /**
   * Generate comprehensive harassment report for a group
   * @param {string} groupId - Group ID
   * @param {number} timeRangeMs - Time range in milliseconds (default: 24 hours)
   * @returns {Object} - Comprehensive report
   */
  async generateGroupReport(groupId, timeRangeMs = 24 * 60 * 60 * 1000) {
    const report = temporalAnalysisService.generateReport(groupId, timeRangeMs);
    const accuracy = feedbackService.getAccuracyMetrics();

    // Build comprehensive report
    return {
      groupId,
      timeRange: this.formatTimeRange(timeRangeMs),
      generatedAt: new Date().toISOString(),

      // Overview statistics
      overview: {
        totalMessages: report.totalMessages,
        flaggedMessages: report.negativeMessages,
        flaggedPercentage: report.negativePercentage + '%',
        severity: report.severity,
      },

      // Top offenders (senders with most flagged messages)
      topOffenders: report.topSenders.map(([userId, count]) => ({
        userId: this.anonymizeUserId(userId),
        flaggedCount: count,
        percentage: ((count / report.negativeMessages) * 100).toFixed(1) + '%'
      })),

      // Top targets (users receiving most harassment)
      topTargets: report.topTargets.map(([userId, count]) => ({
        userId: this.anonymizeUserId(userId),
        targetedCount: count,
        percentage: ((count / report.negativeMessages) * 100).toFixed(1) + '%'
      })),

      // System accuracy (if feedback available)
      systemAccuracy: accuracy.totalReviews > 0 ? accuracy : null,

      // Recommendations
      recommendations: this.generateRecommendations(report),
    };
  }

  /**
   * Generate actionable recommendations based on report
   */
  generateRecommendations(report) {
    const recommendations = [];

    // Severity-based recommendations
    if (report.severity === 'CRITICAL') {
      recommendations.push({
        priority: 'HIGH',
        action: 'Immediate intervention required',
        description: 'Over 30% of messages are flagged as potentially harmful. Consider immediate admin review.'
      });
    } else if (report.severity === 'HIGH') {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Monitor closely',
        description: '15-30% of messages flagged. Increase monitoring frequency.'
      });
    }

    // Target-based recommendations
    if (report.topTargets.length > 0) {
      const mostTargeted = report.topTargets[0];
      if (mostTargeted[1] >= 5) {
        recommendations.push({
          priority: 'HIGH',
          action: 'Check on targeted user',
          description: `One user has been targeted ${mostTargeted[1]} times. Reach out privately to check their wellbeing.`
        });
      }
    }

    // Offender-based recommendations
    if (report.topSenders.length > 0) {
      const topOffender = report.topSenders[0];
      if (topOffender[1] >= 10) {
        recommendations.push({
          priority: 'MEDIUM',
          action: 'Warn repeat offender',
          description: `One user has ${topOffender[1]} flagged messages. Consider a warning or temporary restriction.`
        });
      }
    }

    // Baseline recommendation
    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'LOW',
        action: 'Continue monitoring',
        description: 'No immediate action required. Continue routine monitoring.'
      });
    }

    return recommendations;
  }

  /**
   * Generate weekly digest report
   * Summarizes all MONITOR-level flags from the past week
   */
  async generateWeeklyDigest(groupIds) {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const reports = [];

    for (const groupId of groupIds) {
      const report = await this.generateGroupReport(groupId, weekMs);
      if (report.overview.flaggedMessages > 0) {
        reports.push(report);
      }
    }

    // Sort by severity
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    reports.sort((a, b) =>
      severityOrder[a.overview.severity] - severityOrder[b.overview.severity]
    );

    return {
      period: 'Weekly Digest',
      startDate: new Date(Date.now() - weekMs).toISOString(),
      endDate: new Date().toISOString(),
      totalGroups: groupIds.length,
      groupsWithFlags: reports.length,
      reports
    };
  }

  /**
   * Format time range for display
   */
  formatTimeRange(ms) {
    const hours = ms / (1000 * 60 * 60);
    if (hours < 24) {
      return `Last ${Math.round(hours)} hours`;
    }
    const days = Math.round(hours / 24);
    return `Last ${days} day${days > 1 ? 's' : ''}`;
  }

  /**
   * Anonymize user ID for privacy
   */
  anonymizeUserId(userId) {
    // Keep last 4 digits only
    if (userId && userId.length > 4) {
      return '***' + userId.slice(-4);
    }
    return '***';
  }

  /**
   * Export report as formatted text for WhatsApp message
   */
  formatReportForWhatsApp(report) {
    let message = `📊 *Bullywatch Report*\n`;
    message += `Group: ${report.groupId}\n`;
    message += `Period: ${report.timeRange}\n`;
    message += `Generated: ${new Date(report.generatedAt).toLocaleString('he-IL')}\n\n`;

    // Overview
    message += `📈 *Overview*\n`;
    message += `Total messages: ${report.overview.totalMessages}\n`;
    message += `Flagged: ${report.overview.flaggedMessages} (${report.overview.flaggedPercentage})\n`;
    message += `Severity: ${this.getSeverityEmoji(report.overview.severity)} ${report.overview.severity}\n\n`;

    // Top offenders
    if (report.topOffenders.length > 0) {
      message += `⚠️ *Top Offenders*\n`;
      report.topOffenders.slice(0, 3).forEach((offender, index) => {
        message += `${index + 1}. User ${offender.userId}: ${offender.flaggedCount} flags (${offender.percentage})\n`;
      });
      message += `\n`;
    }

    // Top targets
    if (report.topTargets.length > 0) {
      message += `🎯 *Top Targets*\n`;
      report.topTargets.slice(0, 3).forEach((target, index) => {
        message += `${index + 1}. User ${target.userId}: ${target.targetedCount} times (${target.percentage})\n`;
      });
      message += `\n`;
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      message += `💡 *Recommendations*\n`;
      report.recommendations.forEach((rec, index) => {
        const emoji = rec.priority === 'HIGH' ? '🔴' : rec.priority === 'MEDIUM' ? '🟡' : '🟢';
        message += `${emoji} ${rec.action}\n`;
        message += `   ${rec.description}\n\n`;
      });
    }

    // System accuracy (if available)
    if (report.systemAccuracy) {
      message += `🎯 *System Accuracy*\n`;
      message += `Precision: ${report.systemAccuracy.precision}\n`;
      message += `Total reviews: ${report.systemAccuracy.totalReviews}\n\n`;
    }

    message += `_Generated by bCommGuard Bullywatch_`;

    return message;
  }

  /**
   * Get emoji for severity level
   */
  getSeverityEmoji(severity) {
    const emojis = {
      CRITICAL: '🔴',
      HIGH: '🟠',
      MEDIUM: '🟡',
      LOW: '🟢'
    };
    return emojis[severity] || '⚪';
  }
}

// Singleton instance
const reportGenerator = new ReportGenerator();

module.exports = reportGenerator;
