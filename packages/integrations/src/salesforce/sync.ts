import { decryptTokens } from "../encryption.js";
import type { SyncResult, OAuthTokens } from "../types.js";

import { SalesforceClient } from "./client.js";
import {
  mapOpportunityToFeedback,
  mapCaseToFeedback,
  mapTaskToFeedback,
  mapFeatureRequestToFeedback,
} from "./mapper.js";
import type {
  SalesforceConfig,
  SalesforceOpportunity,
  SalesforceCase,
  SalesforceCaseComment,
  SalesforceTask,
  SalesforceFeatureRequest,
} from "./types.js";

/**
 * Build a SalesforceClient from stored config.
 */
function buildClient(config: SalesforceConfig, secret: string): SalesforceClient {
  if (!config.encryptedTokens || !config.instanceUrl) {
    throw new Error("Salesforce integration is not authenticated");
  }

  const tokens = decryptTokens<OAuthTokens>(config.encryptedTokens, secret);
  return new SalesforceClient(config.instanceUrl, tokens.accessToken);
}

/** Build a SystemModstamp filter clause for incremental sync. */
function modstampFilter(after?: string): string {
  if (!after) return "";
  return ` WHERE SystemModstamp > ${after}`;
}

/**
 * Run a sync pass against Salesforce.
 *
 * Queries four object types via SOQL:
 * 1. Closed-lost Opportunities (with lost reason + notes)
 * 2. Cases and their comments
 * 3. Call activity Tasks with notes
 * 4. Custom Feature Request objects (if configured)
 *
 * All use `SystemModstamp` for incremental sync.
 */
export async function syncSalesforce(
  config: SalesforceConfig,
  secret: string,
  cursor?: string,
): Promise<SyncResult> {
  const client = buildClient(config, secret);
  const instanceUrl = config.instanceUrl!;
  const closedLostField = config.closedLostReasonField ?? "Closed_Lost_Reason__c";
  const allItems = [];

  const syncAfter = cursor ?? config.lastSyncTimestamp;
  const filter = modstampFilter(syncAfter);

  // 1. Closed-lost Opportunities
  const opps = await client.query<SalesforceOpportunity>(
    `SELECT Id, Name, StageName, Amount, CloseDate, AccountId, Account.Name, ` +
      `${closedLostField}, Description, SystemModstamp ` +
      `FROM Opportunity` +
      (filter || ` WHERE StageName = 'Closed Lost'`) +
      (filter ? ` AND StageName = 'Closed Lost'` : "") +
      ` ORDER BY SystemModstamp ASC LIMIT 200`,
  );

  for (const opp of opps) {
    const item = mapOpportunityToFeedback(opp, instanceUrl, closedLostField);
    if (item) allItems.push(item);
  }

  // 2. Cases and their comments
  const cases = await client.query<SalesforceCase>(
    `SELECT Id, CaseNumber, Subject, Description, Status, Priority, ` +
      `AccountId, Account.Name, ContactId, Contact.Name, Contact.Email, SystemModstamp ` +
      `FROM Case${filter} ORDER BY SystemModstamp ASC LIMIT 200`,
  );

  if (cases.length > 0) {
    const caseIds = cases.map((c) => `'${c.Id}'`).join(",");
    const comments = await client.query<SalesforceCaseComment>(
      `SELECT Id, ParentId, CommentBody, IsPublished, CreatedDate, ` +
        `CreatedBy.Name, CreatedBy.Email, SystemModstamp ` +
        `FROM CaseComment WHERE ParentId IN (${caseIds}) AND IsPublished = true ` +
        `ORDER BY CreatedDate ASC`,
    );

    // Group comments by case
    const commentsByCase = new Map<string, SalesforceCaseComment[]>();
    for (const c of comments) {
      const arr = commentsByCase.get(c.ParentId) ?? [];
      arr.push(c);
      commentsByCase.set(c.ParentId, arr);
    }

    for (const sfCase of cases) {
      const caseComments = commentsByCase.get(sfCase.Id) ?? [];
      const items = mapCaseToFeedback(sfCase, caseComments, instanceUrl);
      allItems.push(...items);
    }
  }

  // 3. Call activity logs (Tasks with CallType)
  const tasks = await client.query<SalesforceTask>(
    `SELECT Id, Subject, Description, Status, ActivityDate, ` +
      `WhoId, Who.Name, WhatId, What.Name, What.Type, ` +
      `AccountId, Account.Name, ` +
      `CallType, CallDurationInSeconds, SystemModstamp ` +
      `FROM Task` +
      (filter || ` WHERE `) +
      (filter ? ` AND ` : "") +
      `CallType != null AND Description != null ` +
      `ORDER BY SystemModstamp ASC LIMIT 200`,
  );

  for (const task of tasks) {
    const item = mapTaskToFeedback(task, instanceUrl);
    if (item) allItems.push(item);
  }

  // 4. Custom Feature Request object (if configured and exists)
  if (config.featureRequestObject) {
    const objectName = config.featureRequestObject;
    const exists = await client.describeSObject(objectName);
    if (exists) {
      const frs = await client.query<SalesforceFeatureRequest>(
        `SELECT Id, Name, Description__c, Status__c, Priority__c, ` +
          `Account__c, Account__r.Name, Contact__c, Contact__r.Name, Contact__r.Email, ` +
          `SystemModstamp ` +
          `FROM ${objectName}${filter} ORDER BY SystemModstamp ASC LIMIT 200`,
      );

      for (const fr of frs) {
        const item = mapFeatureRequestToFeedback(fr, instanceUrl);
        if (item) allItems.push(item);
      }
    }
  }

  // Cursor is the current ISO timestamp for next incremental sync
  return {
    items: allItems,
    cursor: new Date().toISOString(),
    hasMore: false, // We fetch everything in one pass with LIMIT; next sync picks up new items
  };
}
