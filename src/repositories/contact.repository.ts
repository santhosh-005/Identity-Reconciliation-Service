import { Contact, LinkPrecedence, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

class ContactRepository {
  /**
   * Find all contacts where email OR phoneNumber matches.
   * Excludes soft-deleted records.
   */
  async findByEmailOrPhone(
    email?: string,
    phoneNumber?: string
  ): Promise<Contact[]> {
    const conditions: Prisma.ContactWhereInput[] = [];

    if (email) {
      conditions.push({ email });
    }
    if (phoneNumber) {
      conditions.push({ phoneNumber });
    }

    if (conditions.length === 0) return [];

    return prisma.contact.findMany({
      where: {
        deletedAt: null,
        OR: conditions,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Find a single contact by ID.
   */
  async findById(id: number): Promise<Contact | null> {
    return prisma.contact.findUnique({
      where: { id },
    });
  }

  /**
   * Find all contacts linked to a primary contact (direct secondaries).
   */
  async findAllLinkedContacts(primaryId: number): Promise<Contact[]> {
    return prisma.contact.findMany({
      where: {
        linkedId: primaryId,
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Find the primary contact and all its secondaries in one query.
   */
  async findPrimaryWithSecondaries(primaryId: number): Promise<Contact[]> {
    return prisma.contact.findMany({
      where: {
        deletedAt: null,
        OR: [{ id: primaryId }, { linkedId: primaryId }],
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Create a new contact.
   */
  async create(
    data: Prisma.ContactUncheckedCreateInput
  ): Promise<Contact> {
    return prisma.contact.create({ data });
  }

  /**
   * Update a contact to secondary, linking it to a primary.
   */
  async updateToSecondary(
    id: number,
    linkedId: number
  ): Promise<Contact> {
    return prisma.contact.update({
      where: { id },
      data: {
        linkedId,
        linkPrecedence: LinkPrecedence.secondary,
      },
    });
  }

  /**
   * Re-link all secondaries of one primary to another primary.
   * Used when merging two primary contacts.
   */
  async relinkSecondaries(
    fromPrimaryId: number,
    toPrimaryId: number
  ): Promise<Prisma.BatchPayload> {
    return prisma.contact.updateMany({
      where: {
        linkedId: fromPrimaryId,
        deletedAt: null,
      },
      data: {
        linkedId: toPrimaryId,
      },
    });
  }

  /**
   * Execute multiple operations in a transaction.
   */
  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return prisma.$transaction(fn);
  }
}

export const contactRepository = new ContactRepository();
