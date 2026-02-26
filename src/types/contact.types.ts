export interface ConsolidatedContact {
  primaryContactId: number;
  emails: string[];
  phoneNumbers: string[];
  secondaryContactIds: number[];
}

export interface IdentifyResponse {
  contact: ConsolidatedContact;
}
