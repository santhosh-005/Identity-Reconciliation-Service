#!/usr/bin/env node

const BASE_URL = process.argv[2] || "http://localhost:3000";

let pass = 0;
let fail = 0;

function ok(msg) {
  console.log("✓", msg);
  pass++;
}

function error(msg) {
  console.log("✗", msg);
  fail++;
}

async function request(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

function validateShape(body) {
  if (!body.contact) return false;

  const c = body.contact;

  return (
    typeof c.primaryContactId === "number" &&
    Array.isArray(c.emails) &&
    Array.isArray(c.phoneNumbers) &&
    Array.isArray(c.secondaryContactIds)
  );
}

(async () => {
  console.log("\nTesting:", BASE_URL, "\n");

  // 1️⃣ Empty body should return 400
  const emptyRes = await fetch(`${BASE_URL}/identify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (emptyRes.status === 400) ok("Empty body → 400");
  else error("Empty body should return 400");

  // 2️⃣ New primary
  const res1 = await request("/identify", {
    email: "lorraine@hillvalley.edu",
    phoneNumber: "123456",
  });

  if (res1.status === 200) ok("New primary → 200");
  else error("New primary failed");

  if (validateShape(res1.body)) ok("Response shape valid");
  else error("Invalid response structure");

  // 3️⃣ Secondary creation
  const res2 = await request("/identify", {
    email: "mcfly@hillvalley.edu",
    phoneNumber: "123456",
  });

  if (res2.status === 200) ok("Secondary → 200");
  else error("Secondary creation failed");

  if (
    res2.body.contact.emails.includes("lorraine@hillvalley.edu") &&
    res2.body.contact.emails.includes("mcfly@hillvalley.edu")
  ) {
    ok("Emails merged correctly");
  } else {
    error("Emails not merged correctly");
  }

  // 4️⃣ Merge primaries
  await request("/identify", {
    email: "george@hillvalley.edu",
    phoneNumber: "919191",
  });

  await request("/identify", {
    email: "biffsucks@hillvalley.edu",
    phoneNumber: "717171",
  });

  const mergeRes = await request("/identify", {
    email: "george@hillvalley.edu",
    phoneNumber: "717171",
  });

  if (mergeRes.status === 200) ok("Primary merge → 200");
  else error("Primary merge failed");

  if (
    mergeRes.body.contact.phoneNumbers.includes("919191") &&
    mergeRes.body.contact.phoneNumbers.includes("717171")
  ) {
    ok("Primary merge data correct");
  } else {
    error("Primary merge incorrect");
  }

  console.log("\n---------------------------");
  console.log(`Result: ${pass} passed, ${fail} failed`);
  console.log("---------------------------\n");

  process.exit(fail === 0 ? 0 : 1);
})();