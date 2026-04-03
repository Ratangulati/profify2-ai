import type { FeedbackItemData } from "../types.js";

import type {
  SalesforceOpportunity,
  SalesforceCase,
  SalesforceCaseComment,
  SalesforceTask,
  SalesforceFeatureRequest,
} from "./types.js";

/**
 * Map a closed-lost Opportunity into a FeedbackItemData.
 * Captures the lost reason and deal notes as product feedback signals.
 */
export function mapOpportunityToFeedback(
  opp: SalesforceOpportunity,
  instanceUrl: string,
  closedLostReasonField: string,
): FeedbackItemData | null {
  const lostReason = (opp as unknown as Record<string, unknown>)[closedLostReasonField] as
    | string
    | null;
  const content = lostReason ?? opp.Description;

  if (!content) return null;

  const segmentTags: string[] = [];
  if (opp.Account?.Name) segmentTags.push(`account:${opp.Account.Name}`);

  return {
    content,
    sourceRef: `salesforce:opportunity:${opp.Id}`,
    sourceUrl: `${instanceUrl}/${opp.Id}`,
    segmentTags,
    metadata: {
      salesforceObjectType: "Opportunity",
      salesforceId: opp.Id,
      opportunityName: opp.Name,
      stageName: opp.StageName,
      amount: opp.Amount,
      closeDate: opp.CloseDate,
      accountName: opp.Account?.Name,
      closedLostReason: lostReason,
      revenueWeight: opp.Amount ?? undefined,
    },
  };
}

/**
 * Map a Case + its published comments into FeedbackItemData entries.
 */
export function mapCaseToFeedback(
  sfCase: SalesforceCase,
  comments: SalesforceCaseComment[],
  instanceUrl: string,
): FeedbackItemData[] {
  const items: FeedbackItemData[] = [];
  const sourceUrl = `${instanceUrl}/${sfCase.Id}`;

  const segmentTags: string[] = [];
  if (sfCase.Account?.Name) segmentTags.push(`account:${sfCase.Account.Name}`);

  const baseMetadata: Record<string, unknown> = {
    salesforceObjectType: "Case",
    salesforceId: sfCase.Id,
    caseNumber: sfCase.CaseNumber,
    caseSubject: sfCase.Subject,
    caseStatus: sfCase.Status,
    casePriority: sfCase.Priority,
    accountName: sfCase.Account?.Name,
  };

  // Case description
  if (sfCase.Description) {
    items.push({
      content: sfCase.Description,
      sourceRef: `salesforce:case:${sfCase.Id}:description`,
      sourceUrl,
      customerEmail: sfCase.Contact?.Email,
      customerName: sfCase.Contact?.Name,
      segmentTags,
      metadata: { ...baseMetadata, commentType: "description" },
    });
  }

  // Published case comments
  for (const comment of comments.filter((c) => c.IsPublished)) {
    items.push({
      content: comment.CommentBody,
      sourceRef: `salesforce:case_comment:${comment.Id}`,
      sourceUrl,
      customerName: comment.CreatedBy?.Name,
      customerEmail: comment.CreatedBy?.Email,
      segmentTags,
      metadata: { ...baseMetadata, commentType: "case_comment" },
    });
  }

  return items;
}

/**
 * Map a Salesforce Task (call log) into a FeedbackItemData.
 */
export function mapTaskToFeedback(
  task: SalesforceTask,
  instanceUrl: string,
): FeedbackItemData | null {
  const content = task.Description;
  if (!content) return null;

  const segmentTags: string[] = [];
  if (task.Account?.Name) segmentTags.push(`account:${task.Account.Name}`);

  return {
    content,
    sourceRef: `salesforce:task:${task.Id}`,
    sourceUrl: `${instanceUrl}/${task.Id}`,
    customerName: task.Who?.Name,
    segmentTags,
    metadata: {
      salesforceObjectType: "Task",
      salesforceId: task.Id,
      taskSubject: task.Subject,
      taskStatus: task.Status,
      callType: task.CallType,
      callDuration: task.CallDurationInSeconds,
      activityDate: task.ActivityDate,
      relatedTo: task.What?.Name,
      relatedToType: task.What?.Type,
      accountName: task.Account?.Name,
    },
  };
}

/**
 * Map a custom Feature Request object into a FeedbackItemData.
 */
export function mapFeatureRequestToFeedback(
  fr: SalesforceFeatureRequest,
  instanceUrl: string,
): FeedbackItemData | null {
  const content = fr.Description__c;
  if (!content) return null;

  const segmentTags: string[] = ["feature_request"];
  if (fr.Account__r?.Name) segmentTags.push(`account:${fr.Account__r.Name}`);

  return {
    content,
    sourceRef: `salesforce:feature_request:${fr.Id}`,
    sourceUrl: `${instanceUrl}/${fr.Id}`,
    customerEmail: fr.Contact__r?.Email,
    customerName: fr.Contact__r?.Name,
    segmentTags,
    metadata: {
      salesforceObjectType: "Feature_Request__c",
      salesforceId: fr.Id,
      featureRequestName: fr.Name,
      status: fr.Status__c,
      priority: fr.Priority__c,
      accountName: fr.Account__r?.Name,
    },
  };
}
