import { describe, it, expect } from "vitest";

import {
  mapOpportunityToFeedback,
  mapCaseToFeedback,
  mapTaskToFeedback,
  mapFeatureRequestToFeedback,
} from "../../src/salesforce/mapper.js";
import type {
  SalesforceOpportunity,
  SalesforceCase,
  SalesforceCaseComment,
  SalesforceTask,
  SalesforceFeatureRequest,
} from "../../src/salesforce/types.js";

const INSTANCE_URL = "https://myorg.salesforce.com";

describe("mapOpportunityToFeedback", () => {
  const makeOpp = (overrides?: Partial<SalesforceOpportunity>): SalesforceOpportunity => ({
    Id: "006ABC123",
    Name: "Acme Deal",
    StageName: "Closed Lost",
    Amount: 50000,
    CloseDate: "2024-01-15",
    AccountId: "001ABC",
    Account: { Name: "Acme Corp" },
    Closed_Lost_Reason__c: "Missing feature: SSO integration",
    Description: null,
    SystemModstamp: "2024-01-15T12:00:00.000Z",
    ...overrides,
  });

  it("maps a closed-lost opportunity with lost reason", () => {
    const item = mapOpportunityToFeedback(makeOpp(), INSTANCE_URL, "Closed_Lost_Reason__c");

    expect(item).not.toBeNull();
    expect(item!.content).toBe("Missing feature: SSO integration");
    expect(item!.sourceRef).toBe("salesforce:opportunity:006ABC123");
    expect(item!.sourceUrl).toBe("https://myorg.salesforce.com/006ABC123");
    expect(item!.segmentTags).toEqual(["account:Acme Corp"]);
    expect(item!.metadata).toMatchObject({
      salesforceObjectType: "Opportunity",
      amount: 50000,
      revenueWeight: 50000,
      closedLostReason: "Missing feature: SSO integration",
    });
  });

  it("falls back to Description when no lost reason field", () => {
    const opp = makeOpp({ Closed_Lost_Reason__c: null, Description: "Customer wanted X" });
    const item = mapOpportunityToFeedback(opp, INSTANCE_URL, "Closed_Lost_Reason__c");
    expect(item!.content).toBe("Customer wanted X");
  });

  it("returns null when neither lost reason nor description exists", () => {
    const opp = makeOpp({ Closed_Lost_Reason__c: null, Description: null });
    const item = mapOpportunityToFeedback(opp, INSTANCE_URL, "Closed_Lost_Reason__c");
    expect(item).toBeNull();
  });
});

describe("mapCaseToFeedback", () => {
  const makeCase = (): SalesforceCase => ({
    Id: "500ABC",
    CaseNumber: "00001234",
    Subject: "API returns 500 error",
    Description: "When calling /api/v2/export, I get a 500 error",
    Status: "Escalated",
    Priority: "High",
    AccountId: "001ABC",
    Account: { Name: "Acme Corp" },
    ContactId: "003ABC",
    Contact: { Name: "John Doe", Email: "john@acme.com" },
    SystemModstamp: "2024-01-15T12:00:00.000Z",
  });

  const makeComment = (overrides?: Partial<SalesforceCaseComment>): SalesforceCaseComment => ({
    Id: "07aABC",
    ParentId: "500ABC",
    CommentBody: "This is happening for all our users",
    IsPublished: true,
    CreatedDate: "2024-01-15T13:00:00.000Z",
    CreatedBy: { Name: "John Doe", Email: "john@acme.com" },
    SystemModstamp: "2024-01-15T13:00:00.000Z",
    ...overrides,
  });

  it("maps case description and published comments", () => {
    const items = mapCaseToFeedback(makeCase(), [makeComment()], INSTANCE_URL);

    expect(items).toHaveLength(2);
    expect(items[0].content).toBe("When calling /api/v2/export, I get a 500 error");
    expect(items[0].customerEmail).toBe("john@acme.com");
    expect(items[0].segmentTags).toContain("account:Acme Corp");

    expect(items[1].content).toBe("This is happening for all our users");
    expect(items[1].sourceRef).toBe("salesforce:case_comment:07aABC");
  });

  it("filters out unpublished comments", () => {
    const comment = makeComment({ IsPublished: false });
    const items = mapCaseToFeedback(makeCase(), [comment], INSTANCE_URL);
    expect(items).toHaveLength(1); // Only the description
  });
});

describe("mapTaskToFeedback", () => {
  it("maps a call log task with notes", () => {
    const task: SalesforceTask = {
      Id: "00TABC",
      Subject: "Call with John re: product feedback",
      Description: "John mentioned they need better API rate limiting controls",
      Status: "Completed",
      ActivityDate: "2024-01-15",
      WhoId: "003ABC",
      WhatId: "006ABC",
      Who: { Name: "John Doe" },
      What: { Name: "Acme Deal", Type: "Opportunity" },
      Account: { Name: "Acme Corp" },
      AccountId: "001ABC",
      CallType: "Outbound",
      CallDurationInSeconds: 1800,
      SystemModstamp: "2024-01-15T14:00:00.000Z",
    };

    const item = mapTaskToFeedback(task, INSTANCE_URL);
    expect(item).not.toBeNull();
    expect(item!.content).toBe("John mentioned they need better API rate limiting controls");
    expect(item!.metadata).toMatchObject({
      callType: "Outbound",
      callDuration: 1800,
      accountName: "Acme Corp",
    });
  });

  it("returns null for tasks without description", () => {
    const task: SalesforceTask = {
      Id: "00T123",
      Subject: "Quick call",
      Description: null,
      Status: "Completed",
      ActivityDate: null,
      WhoId: null,
      WhatId: null,
      AccountId: null,
      CallType: "Inbound",
      CallDurationInSeconds: 60,
      SystemModstamp: "2024-01-15T14:00:00.000Z",
    };
    expect(mapTaskToFeedback(task, INSTANCE_URL)).toBeNull();
  });
});

describe("mapFeatureRequestToFeedback", () => {
  it("maps a feature request custom object", () => {
    const fr: SalesforceFeatureRequest = {
      Id: "a01ABC",
      Name: "SSO Support",
      Description__c: "Customer needs SAML SSO for enterprise compliance",
      Status__c: "Under Review",
      Priority__c: "High",
      Account__c: "001ABC",
      Account__r: { Name: "Enterprise Co" },
      Contact__c: "003ABC",
      Contact__r: { Name: "Mary", Email: "mary@enterprise.com" },
      SystemModstamp: "2024-01-15T15:00:00.000Z",
    };

    const item = mapFeatureRequestToFeedback(fr, INSTANCE_URL);
    expect(item).not.toBeNull();
    expect(item!.content).toBe("Customer needs SAML SSO for enterprise compliance");
    expect(item!.segmentTags).toEqual(["feature_request", "account:Enterprise Co"]);
    expect(item!.sourceRef).toBe("salesforce:feature_request:a01ABC");
  });
});
