// ── HubSpot CRM API v3 response shapes ─────────────────────────────────

export interface HubSpotPaginatedResponse<T> {
  results: T[];
  paging?: {
    next?: {
      after: string;
      link: string;
    };
  };
}

export interface HubSpotDeal {
  id: string;
  properties: {
    dealname: string;
    dealstage: string;
    amount: string | null;
    closedate: string | null;
    closed_lost_reason: string | null;
    hs_lastmodifieddate: string;
    [key: string]: string | null;
  };
  associations?: {
    companies?: { results: Array<{ id: string; type: string }> };
    contacts?: { results: Array<{ id: string; type: string }> };
  };
}

export interface HubSpotNote {
  id: string;
  properties: {
    hs_note_body: string;
    hs_timestamp: string;
    hs_lastmodifieddate: string;
    hubspot_owner_id: string | null;
    [key: string]: string | null;
  };
  associations?: {
    deals?: { results: Array<{ id: string; type: string }> };
    companies?: { results: Array<{ id: string; type: string }> };
    contacts?: { results: Array<{ id: string; type: string }> };
  };
}

export interface HubSpotTicket {
  id: string;
  properties: {
    subject: string;
    content: string | null;
    hs_pipeline_stage: string;
    hs_ticket_priority: string | null;
    hs_lastmodifieddate: string;
    [key: string]: string | null;
  };
}

export interface HubSpotCallEngagement {
  id: string;
  properties: {
    hs_call_body: string | null;
    hs_call_title: string | null;
    hs_call_direction: string | null;
    hs_call_duration: string | null;
    hs_call_disposition: string | null;
    hs_timestamp: string;
    hs_lastmodifieddate: string;
    [key: string]: string | null;
  };
  associations?: {
    deals?: { results: Array<{ id: string; type: string }> };
    companies?: { results: Array<{ id: string; type: string }> };
    contacts?: { results: Array<{ id: string; type: string }> };
  };
}

export interface HubSpotFeedbackSubmission {
  id: string;
  properties: {
    hs_content: string | null;
    hs_survey_type: string | null;
    hs_sentiment: string | null;
    hs_response_value: string | null;
    hs_submission_timestamp: string;
    hs_lastmodifieddate: string;
    [key: string]: string | null;
  };
  associations?: {
    contacts?: { results: Array<{ id: string; type: string }> };
  };
}

export interface HubSpotCompany {
  id: string;
  properties: {
    name: string;
    domain: string | null;
    industry: string | null;
    [key: string]: string | null;
  };
}

export interface HubSpotContact {
  id: string;
  properties: {
    firstname: string | null;
    lastname: string | null;
    email: string | null;
    company: string | null;
    [key: string]: string | null;
  };
}

export interface HubSpotOAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

// ── Config shape stored in DataSource.config ───────────────────────────

export interface HubSpotConfig {
  encryptedTokens?: string;
  portalId?: string;
  /** Whether Service Hub feedback surveys are available */
  hasFeedbackSurveys?: boolean;
  lastSyncTimestamp?: string;
}
