import { Contact, LinkPrecedence, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../config/prisma";

type TxClient = Prisma.TransactionClient;

class ContactRepository {
  /**
   * Find all contacts where email OR phoneNumber matches.
   * Excludes soft-deleted records.
   */
  async findByEmailOrPhone(
    email?: string,
    phoneNumber?: string,
    tx?: TxClient
  ): Promise<Contact[]> {
    const client = tx ?? prisma;
    const conditions: Prisma.ContactWhereInput[] = [];

    if (email) {
      conditions.push({ email });
    }
    if (phoneNumber) {
      conditions.push({ phoneNumber });
    }

    if (conditions.length === 0) return [];

    return client.contact.findMany({
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
  async findById(id: number, tx?: TxClient): Promise<Contact | null> {
    const client = tx ?? prisma;
    return client.contact.findUnique({
      where: { id },
    });
  }

  /**
   * Find all contacts linked to a primary contact (direct secondaries).
   */
  async findAllLinkedContacts(primaryId: number, tx?: TxClient): Promise<Contact[]> {
    const client = tx ?? prisma;
    return client.contact.findMany({
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
  async findPrimaryWithSecondaries(primaryId: number, tx?: TxClient): Promise<Contact[]> {
    const client = tx ?? prisma;
    return client.contact.findMany({
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
    data: Prisma.ContactUncheckedCreateInput,
    tx?: TxClient
  ): Promise<Contact> {
    const client = tx ?? prisma;
    return client.contact.create({ data });
  }

  /**
   * Update a contact to secondary, linking it to a primary.
   */
  async updateToSecondary(
    id: number,
    linkedId: number,
    tx?: TxClient
  ): Promise<Contact> {
    const client = tx ?? prisma;
    return client.contact.update({
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
    toPrimaryId: number,
    tx?: TxClient
  ): Promise<Prisma.BatchPayload> {
    const client = tx ?? prisma;
    return client.contact.updateMany({
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
