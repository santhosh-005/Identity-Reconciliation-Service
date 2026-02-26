import request from "supertest";
import app from "../app";
import { prisma } from "../config/prisma";

beforeAll(async () => {
  await prisma.contact.deleteMany();
});

afterAll(async () => {
  await prisma.contact.deleteMany();
  await prisma.$disconnect();
});

describe("POST /identify", () => {
  it("should return 400 for empty body", async () => {
    const res = await request(app).post("/identify").send({});
    expect(res.status).toBe(400);
  });

  it("should create a new primary contact", async () => {
    const res = await request(app)
      .post("/identify")
      .send({ email: "lorraine@hillvalley.edu", phoneNumber: "123456" });

    expect(res.status).toBe(200);
    expect(res.body.contact.primaryContactId).toBeDefined();
    expect(res.body.contact.emails).toEqual(["lorraine@hillvalley.edu"]);
    expect(res.body.contact.phoneNumbers).toEqual(["123456"]);
    expect(res.body.contact.secondaryContactIds).toEqual([]);
  });

  it("should create a secondary when new email shares same phone", async () => {
    const res = await request(app)
      .post("/identify")
      .send({ email: "mcfly@hillvalley.edu", phoneNumber: "123456" });

    expect(res.status).toBe(200);
    expect(res.body.contact.emails).toContain("lorraine@hillvalley.edu");
    expect(res.body.contact.emails).toContain("mcfly@hillvalley.edu");
    expect(res.body.contact.secondaryContactIds.length).toBe(1);
  });

  it("should not create duplicate for exact match", async () => {
    const res = await request(app)
      .post("/identify")
      .send({ email: "mcfly@hillvalley.edu", phoneNumber: "123456" });

    expect(res.status).toBe(200);
    expect(res.body.contact.secondaryContactIds.length).toBe(1);
  });

  it("should merge two primaries when linked by new request", async () => {
    // Create two independent primaries
    await request(app)
      .post("/identify")
      .send({ email: "george@hillvalley.edu", phoneNumber: "919191" });

    await request(app)
      .post("/identify")
      .send({ email: "biffsucks@hillvalley.edu", phoneNumber: "717171" });

    // Link them
    const res = await request(app)
      .post("/identify")
      .send({ email: "george@hillvalley.edu", phoneNumber: "717171" });

    expect(res.status).toBe(200);
    expect(res.body.contact.emails).toContain("george@hillvalley.edu");
    expect(res.body.contact.emails).toContain("biffsucks@hillvalley.edu");
    expect(res.body.contact.phoneNumbers).toContain("919191");
    expect(res.body.contact.phoneNumbers).toContain("717171");
    expect(res.body.contact.secondaryContactIds.length).toBeGreaterThanOrEqual(1);
  });

  it("should work with only email", async () => {
    const res = await request(app)
      .post("/identify")
      .send({ email: "solo@hillvalley.edu" });

    expect(res.status).toBe(200);
    expect(res.body.contact.emails).toEqual(["solo@hillvalley.edu"]);
    expect(res.body.contact.phoneNumbers).toEqual([]);
  });

  it("should work with only phoneNumber", async () => {
    const res = await request(app)
      .post("/identify")
      .send({ phoneNumber: "555555" });

    expect(res.status).toBe(200);
    expect(res.body.contact.phoneNumbers).toEqual(["555555"]);
    expect(res.body.contact.emails).toEqual([]);
  });

  it("should accept phoneNumber as number and coerce to string", async () => {
    const res = await request(app)
      .post("/identify")
      .send({ phoneNumber: 999888 });

    expect(res.status).toBe(200);
    expect(res.body.contact.phoneNumbers).toEqual(["999888"]);
  });
});

describe("GET /health", () => {
  it("should return ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("404", () => {
  it("should return 404 for unknown routes", async () => {
    const res = await request(app).get("/unknown");
    expect(res.status).toBe(404);
  });
});
