// ── Salesforce REST API response shapes ────────────────────────────────

export interface SalesforceQueryResult<T> {
  totalSize: number;
  done: boolean;
  nextRecordsUrl?: string;
  records: T[];
}

export interface SalesforceOpportunity {
  Id: string;
  Name: string;
  StageName: string;
  Amount: number | null;
  CloseDate: string;
  AccountId: string | null;
  Account?: { Name: string } | null;
  Closed_Lost_Reason__c?: string | null;
  Description?: string | null;
  SystemModstamp: string;
}

export interface SalesforceNote {
  Id: string;
  Title: string;
  Body: string;
  ParentId: string;
  CreatedDate: string;
  SystemModstamp: string;
}

export interface SalesforceContentNote {
  Id: string;
  Title: string;
  TextPreview: string;
  Content: string | null;
  CreatedDate: string;
  SystemModstamp: string;
}

export interface SalesforceCase {
  Id: string;
  CaseNumber: string;
  Subject: string;
  Description: string | null;
  Status: string;
  Priority: string;
  AccountId: string | null;
  Account?: { Name: string } | null;
  ContactId: string | null;
  Contact?: { Name: string; Email: string } | null;
  SystemModstamp: string;
}

export interface SalesforceCaseComment {
  Id: string;
  ParentId: string;
  CommentBody: string;
  IsPublished: boolean;
  CreatedDate: string;
  CreatedBy?: { Name: string; Email: string } | null;
  SystemModstamp: string;
}

export interface SalesforceTask {
  Id: string;
  Subject: string;
  Description: string | null;
  Status: string;
  ActivityDate: string | null;
  WhoId: string | null;
  WhatId: string | null;
  Who?: { Name: string; Email?: string } | null;
  What?: { Name: string; Type: string } | null;
  Account?: { Name: string } | null;
  AccountId: string | null;
  CallType: string | null;
  CallDurationInSeconds: number | null;
  SystemModstamp: string;
}

export interface SalesforceFeatureRequest {
  Id: string;
  Name: string;
  Description__c: string | null;
  Status__c: string | null;
  Priority__c: string | null;
  Account__c: string | null;
  Account__r?: { Name: string } | null;
  Contact__c: string | null;
  Contact__r?: { Name: string; Email: string } | null;
  SystemModstamp: string;
}

export interface SalesforceOAuthResponse {
  access_token: string;
  refresh_token: string;
  instance_url: string;
  token_type: string;
  issued_at: string;
  id: string;
}

// ── Config shape stored in DataSource.config ───────────────────────────

export interface SalesforceConfig {
  encryptedTokens?: string;
  instanceUrl?: string;
  /** Name of the custom Feature Request object, e.g. "Feature_Request__c" */
  featureRequestObject?: string;
  /** API name of the closed-lost reason field on Opportunity */
  closedLostReasonField?: string;
  lastSyncTimestamp?: string;
}
