// ============================================================
// WORKFLOW TEMPLATES
// Pre-built workflow definitions for common use cases
// ============================================================

import { createWorkflow } from './builder.js';
import type { WorkflowDefinition } from './types.js';

// ============================================================
// RESEARCH WORKFLOW
// ============================================================

export function createResearchWorkflow(topic?: string): WorkflowDefinition {
  return createWorkflow('Research Workflow', 'Multi-step research with validation')
    .input('topic', 'string', { description: 'Research topic', required: true })
    .input('depth', 'string', { description: 'Research depth', default: 'medium' })

    .start()

    .task('research', 'Research the topic: ${topic}. Depth: ${depth}', {
      name: 'Initial Research',
      agent: 'research',
      timeout: 120000
    })

    .task('analyze', 'Analyze the research findings and identify key insights from: ${taskResult}', {
      name: 'Analyze Findings',
      agent: 'research'
    })

    .decision('quality-check', [
      { when: 'taskResult && taskResult.length > 500', then: 'summarize' },
      { when: 'true', then: 'deep-research' }
    ], { name: 'Quality Check', default: 'summarize' })

    .from('quality-check')
    .task('deep-research', 'Conduct deeper research on: ${topic}. Previous findings were insufficient.', {
      name: 'Deep Research',
      agent: 'research'
    })
    .connect('deep-research', 'summarize')

    .from('quality-check')
    .task('summarize', 'Create a comprehensive summary of all findings about ${topic}', {
      name: 'Summarize',
      agent: 'research'
    })

    .end()

    .build();
}

// ============================================================
// CODE REVIEW WORKFLOW
// ============================================================

export function createCodeReviewWorkflow(): WorkflowDefinition {
  return createWorkflow('Code Review Workflow', 'Automated code review with multiple checks')
    .input('filePath', 'string', { description: 'Path to file or directory to review' })
    .input('criteria', 'array', { description: 'Review criteria', default: ['security', 'performance', 'style'] })

    .start()

    .task('read-code', 'Read the code from ${filePath}', {
      name: 'Read Code',
      agent: 'coding'
    })

    .parallel('review-checks', ['security-check', 'performance-check', 'style-check'], {
      name: 'Parallel Reviews',
      waitFor: 'all'
    })

    // Security check branch
    .from('review-checks')
    .task('security-check', 'Review the code for security vulnerabilities: ${taskResult}', {
      name: 'Security Review',
      agent: 'coding'
    })

    // Performance check branch
    .from('review-checks')
    .task('performance-check', 'Review the code for performance issues: ${taskResult}', {
      name: 'Performance Review',
      agent: 'coding'
    })

    // Style check branch
    .from('review-checks')
    .task('style-check', 'Review the code for style and best practices: ${taskResult}', {
      name: 'Style Review',
      agent: 'coding'
    })

    .from('review-checks')
    .task('consolidate', 'Consolidate all review findings into a single report', {
      name: 'Consolidate Reviews'
    })

    .end()

    .build();
}

// ============================================================
// DATA PIPELINE WORKFLOW
// ============================================================

export function createDataPipelineWorkflow(): WorkflowDefinition {
  return createWorkflow('Data Pipeline', 'ETL workflow for data processing')
    .input('sourcePath', 'string', { description: 'Source data file path' })
    .input('destPath', 'string', { description: 'Destination path' })
    .input('transforms', 'array', { description: 'Transformations to apply', default: [] })

    .start()

    .task('extract', 'Read and parse data from ${sourcePath}', {
      name: 'Extract Data',
      agent: 'data-analyst'
    })

    .transform('validate', [
      { type: 'filter', expression: 'taskResult | item !== null', target: 'validData' }
    ], { name: 'Validate Data' })

    .loop('transform-loop', {
      name: 'Apply Transforms',
      iterator: 'transform',
      collection: 'transforms',
      body: 'apply-transform'
    })

    .task('apply-transform', 'Apply transformation ${transform} to the data', {
      name: 'Apply Transform',
      agent: 'data-analyst'
    })

    .from('transform-loop')
    .task('load', 'Save processed data to ${destPath}', {
      name: 'Load Data',
      agent: 'data-analyst'
    })

    .task('report', 'Generate summary report of the pipeline execution', {
      name: 'Generate Report',
      agent: 'data-analyst'
    })

    .end()

    .build();
}

// ============================================================
// APPROVAL WORKFLOW
// ============================================================

export function createApprovalWorkflow(): WorkflowDefinition {
  return createWorkflow('Approval Workflow', 'Human-in-the-loop approval process')
    .input('request', 'string', { description: 'Request to be approved' })
    .input('requester', 'string', { description: 'Person making the request' })

    .start()

    .task('prepare', 'Prepare approval request summary for: ${request}', {
      name: 'Prepare Request'
    })

    .humanInput('approval', {
      name: 'Request Approval',
      prompt: 'Please review and approve the following request from ${requester}:\n\n${taskResult}',
      fields: [
        { name: 'approved', type: 'boolean', label: 'Approve this request?', required: true },
        { name: 'comments', type: 'text', label: 'Comments (optional)' }
      ],
      timeout: 86400000 // 24 hours
    })

    .decision('check-approval', [
      { when: 'approved === true', then: 'process-approved' },
      { when: 'approved === false', then: 'process-rejected' }
    ], { name: 'Check Decision' })

    .from('check-approval')
    .task('process-approved', 'Process approved request: ${request}', {
      name: 'Process Approved'
    })
    .webhook('notify-approved', {
      name: 'Notify Approval',
      url: '${notificationWebhook}',
      method: 'POST',
      body: JSON.stringify({
        status: 'approved',
        request: '${request}',
        requester: '${requester}',
        comments: '${comments}'
      })
    })
    .connect('notify-approved', 'end')

    .from('check-approval')
    .task('process-rejected', 'Handle rejected request: ${request}. Reason: ${comments}', {
      name: 'Process Rejected'
    })
    .webhook('notify-rejected', {
      name: 'Notify Rejection',
      url: '${notificationWebhook}',
      method: 'POST',
      body: JSON.stringify({
        status: 'rejected',
        request: '${request}',
        requester: '${requester}',
        comments: '${comments}'
      })
    })
    .connect('notify-rejected', 'end')

    .end()

    .build();
}

// ============================================================
// MONITORING WORKFLOW
// ============================================================

export function createMonitoringWorkflow(): WorkflowDefinition {
  return createWorkflow('System Monitoring', 'Periodic system health checks')
    .input('endpoints', 'array', { description: 'Endpoints to monitor' })
    .input('alertThreshold', 'number', { description: 'Alert threshold in ms', default: 5000 })

    .start()

    .loop('check-endpoints', {
      name: 'Check All Endpoints',
      iterator: 'endpoint',
      collection: 'endpoints',
      body: 'health-check'
    })

    .webhook('health-check', {
      name: 'Health Check',
      url: '${endpoint}',
      method: 'GET',
      timeout: 10000
    })

    .from('check-endpoints')
    .transform('analyze-results', [
      { type: 'filter', expression: 'results | item.webhookStatus !== 200', target: 'failures' },
      { type: 'extract', expression: 'failures.length', target: 'failureCount' }
    ], { name: 'Analyze Results' })

    .decision('alert-check', [
      { when: 'failureCount > 0', then: 'send-alert' },
      { when: 'failureCount === 0', then: 'end' }
    ], { name: 'Check for Failures' })

    .from('alert-check')
    .task('send-alert', 'Generate alert report for ${failureCount} failed endpoints', {
      name: 'Generate Alert'
    })
    .connect('send-alert', 'end')

    .end()

    .build();
}

// ============================================================
// TEMPLATE REGISTRY
// ============================================================

export const workflowTemplates = {
  research: createResearchWorkflow,
  codeReview: createCodeReviewWorkflow,
  dataPipeline: createDataPipelineWorkflow,
  approval: createApprovalWorkflow,
  monitoring: createMonitoringWorkflow
};

export function getTemplate(name: keyof typeof workflowTemplates): WorkflowDefinition {
  const factory = workflowTemplates[name];
  if (!factory) {
    throw new Error(`Unknown workflow template: ${name}`);
  }
  return factory();
}

export function listTemplates(): string[] {
  return Object.keys(workflowTemplates);
}
