import { Contact, LinkPrecedence } from "@prisma/client";
import { contactRepository } from "../repositories/contact.repository";
import { IdentifyResponse } from "../types/contact.types";

class ContactService {
  /**
   * Main entry point — reconciles identity based on email and/or phoneNumber.
   *
   * Handles 4 cases:
   *  1. No match → create new primary contact
   *  2. Exact match → return existing consolidated contact (no new row)
   *  3. Partial match (new info) → create secondary contact linked to primary
   *  4. Two separate primaries found → merge: older stays primary, newer becomes secondary
   */
  async identifyContact(
    email?: string,
    phoneNumber?: string
  ): Promise<IdentifyResponse> {
    // Step 1: Find all contacts matching the given email OR phoneNumber
    const matchingContacts = await contactRepository.findByEmailOrPhone(
      email,
      phoneNumber
    );

    // Case 1: No matches — create a brand new primary contact
    if (matchingContacts.length === 0) {
      const newContact = await contactRepository.create({
        email: email ?? null,
        phoneNumber: phoneNumber ?? null,
        linkPrecedence: LinkPrecedence.primary,
      });

      return this.buildResponse(newContact, []);
    }

    // Step 2: Resolve all distinct primary contacts
    const primaryContacts = await this.resolvePrimaries(matchingContacts);

    // Case 4: Two (or more) distinct primaries — merge them
    if (primaryContacts.length > 1) {
      await this.mergePrimaries(primaryContacts);
    }

    // After potential merge, the oldest primary is the winner
    const primaryContact = primaryContacts[0]!;

    // Step 3: Gather THE FULL linked group (primary + all secondaries)
    let allContacts = await contactRepository.findPrimaryWithSecondaries(
      primaryContact.id
    );

    // Case 2 & 3: Check if a new secondary contact needs to be created
    const needsNewSecondary = this.hasNewInformation(
      allContacts,
      email,
      phoneNumber
    );

    if (needsNewSecondary) {
      // Case 3: Create a secondary contact with the new information
      const newSecondary = await contactRepository.create({
        email: email ?? null,
        phoneNumber: phoneNumber ?? null,
        linkedId: primaryContact.id,
        linkPrecedence: LinkPrecedence.secondary,
      });

      allContacts.push(newSecondary);
    }

    // Build and return consolidated response
    const secondaries = allContacts.filter(
      (c) => c.id !== primaryContact.id
    );

    return this.buildResponse(primaryContact, secondaries);
  }

  /**
   * Given a list of matched contacts, resolves their root primary contacts.
   * Walks the linkedId chain to find the true primary (handles deep chains).
   * Returns deduplicated primaries sorted by createdAt ascending (oldest first).
   */
  private async resolvePrimaries(contacts: Contact[]): Promise<Contact[]> {
    const primaryMap = new Map<number, Contact>();

    for (const contact of contacts) {
      let primary = contact;

      // Walk up the chain if this is a secondary
      while (primary.linkedId !== null) {
        const parent = await contactRepository.findById(primary.linkedId);
        if (!parent) break;
        primary = parent;
      }

      primaryMap.set(primary.id, primary);
    }

    // Sort by createdAt ascending — oldest first
    return Array.from(primaryMap.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
  }

  /**
   * Merges multiple primaries into one.
   * The oldest (index 0) stays as primary.
   * All others become secondary, and their secondaries get re-linked.
   */
  private async mergePrimaries(primaries: Contact[]): Promise<void> {
    const winner = primaries[0]!;

    for (let i = 1; i < primaries.length; i++) {
      const loser = primaries[i]!;

      // Re-link all existing secondaries of the loser to the winner
      await contactRepository.relinkSecondaries(loser.id, winner.id);

      // Demote the loser from primary to secondary
      await contactRepository.updateToSecondary(loser.id, winner.id);
    }
  }

  /**
   * Checks if the incoming request contains information not already
   * present in the linked contact group.
   * Returns true only when BOTH email and phone are provided AND
   * the exact combination doesn't already exist.
   */
  private hasNewInformation(
    existingContacts: Contact[],
    email?: string,
    phoneNumber?: string
  ): boolean {
    // If only one field is provided, no "new info" to link
    if (!email || !phoneNumber) return false;

    const existingEmails = new Set(
      existingContacts.map((c) => c.email).filter(Boolean)
    );
    const existingPhones = new Set(
      existingContacts.map((c) => c.phoneNumber).filter(Boolean)
    );

    const emailIsNew = !existingEmails.has(email);
    const phoneIsNew = !existingPhones.has(phoneNumber);

    // If at least one piece of information is new, create a secondary
    if (emailIsNew || phoneIsNew) return true;

    // Both email and phone already exist — but check if they exist on the SAME row
    // If they exist on different rows, this is an existing link, no new row needed
    return false;
  }

  /**
   * Builds the consolidated response matching the spec format.
   * Primary's email/phone come first in their respective arrays.
   */
  private buildResponse(
    primary: Contact,
    secondaries: Contact[]
  ): IdentifyResponse {
    const allContacts = [primary, ...secondaries];

    // Deduplicated emails — primary's email first
    const emails: string[] = [];
    if (primary.email) emails.push(primary.email);
    for (const contact of secondaries) {
      if (contact.email && !emails.includes(contact.email)) {
        emails.push(contact.email);
      }
    }

    // Deduplicated phone numbers — primary's phone first
    const phoneNumbers: string[] = [];
    if (primary.phoneNumber) phoneNumbers.push(primary.phoneNumber);
    for (const contact of secondaries) {
      if (contact.phoneNumber && !phoneNumbers.includes(contact.phoneNumber)) {
        phoneNumbers.push(contact.phoneNumber);
      }
    }

    // Secondary contact IDs
    const secondaryContactIds = secondaries.map((c) => c.id);

    return {
      contact: {
        primaryContactId: primary.id,
        emails,
        phoneNumbers,
        secondaryContactIds,
      },
    };
  }
}

export const contactService = new ContactService();
