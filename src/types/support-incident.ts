export type SupportIncidentStatus = "DETECTED" | "INVESTIGATING" | "MITIGATED" | "RESOLVED" | "CLOSED";
export type SupportIncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type SupportIncident = {
  id: number;
  incidentKey: string;
  title: string;
  description: string;
  status: SupportIncidentStatus;
  severity: SupportIncidentSeverity;
  sourceType: "MANUAL" | "RECURRING_SIGNAL" | "EXTERNAL_MONITOR";
  sourceReference: string | null;
  requestTypeId: number | null;
  serviceCode: string | null;
  initialNotice: string | null;
  initialNoticeAt: string | null;
  resolutionSummary: string | null;
  resolvedAt: string | null;
  detectedAt: string;
  impacts: Array<{
    id: number;
    partyId: number;
    organizationId: number | null;
    displayLabel: string | null;
    notifiedAt: string | null;
  }>;
  ticketLinks: Array<{
    ticketId: string;
    subject: string;
    lifecycleStatus: string | null;
    linkedAt: string;
  }>;
};

export type CustomerSupportIncident = Pick<
  SupportIncident,
  | "incidentKey"
  | "title"
  | "description"
  | "status"
  | "severity"
  | "initialNotice"
  | "initialNoticeAt"
  | "resolutionSummary"
  | "resolvedAt"
  | "detectedAt"
>;
