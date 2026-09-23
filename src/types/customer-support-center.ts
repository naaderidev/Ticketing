export type CustomerKnowledgeArticle = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  service: { id: number; code: string; name: string } | null;
  requestType: { id: number; code: string; name: string } | null;
  popularityScore: number;
  isFrequent: boolean;
  matchScore: number;
  matchConfidence: "HIGH" | "MEDIUM" | "LOW";
  matchReasons: string[];
  isRecommended: boolean;
  detectedTopic: string | null;
};

export type CustomerKnowledgeConversationMessage = {
  id: string;
  author: "CUSTOMER" | "SYSTEM";
  kind: "QUESTION" | "GUIDANCE" | "OUTCOME" | "HANDOFF";
  body: string;
  createdAt: string;
};

export type CustomerKnowledgeJourney = {
  id: string;
  status: string;
  convertedToTicket: boolean;
  customerQuestion: string | null;
};

export type StartedKnowledgeJourney = {
  journey: CustomerKnowledgeJourney;
  article: {
    id: number;
    slug: string;
    version: number;
    title: string;
    body: string;
    service: { id: number; code: string; name: string } | null;
    requestType: { id: number; code: string; name: string } | null;
  };
  conversation: CustomerKnowledgeConversationMessage[];
  replayed: boolean;
};
