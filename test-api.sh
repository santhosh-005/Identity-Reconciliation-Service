#!/bin/bash
# ============================================================
# Identity Reconciliation — Manual API Test Script
# Usage: bash test-api.sh [BASE_URL]
# Default: http://localhost:3000
# ============================================================

BASE_URL="${1:-http://localhost:3000}"
PASS=0
FAIL=0

green() { echo -e "\033[32m✓ $1\033[0m"; }
red() { echo -e "\033[31m✗ $1\033[0m"; }

assert_status() {
  local test_name="$1" expected="$2" actual="$3"
  if [ "$actual" -eq "$expected" ]; then
    green "$test_name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    red "$test_name — expected $expected, got $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local test_name="$1" body="$2" expected="$3"
  if echo "$body" | grep -q "$expected"; then
    green "$test_name"
    PASS=$((PASS + 1))
  else
    red "$test_name — response missing: $expected"
    echo "  Response: $body"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "==============================================="
echo "  Identity Reconciliation — API Tests"
echo "  Target: $BASE_URL"
echo "==============================================="
echo ""

# ----------------------------------------------------------
# Test 0: Health Check
# ----------------------------------------------------------
echo "--- Health Check ---"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/health")
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

assert_status "GET /health returns 200" 200 "$STATUS"
assert_contains "Health body contains ok" "$BODY" '"status":"ok"'

# ----------------------------------------------------------
# Test 1: 404 for unknown route
# ----------------------------------------------------------
echo ""
echo "--- 404 Handler ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/unknown")
assert_status "GET /unknown returns 404" 404 "$STATUS"

# ----------------------------------------------------------
# Test 2: Empty body returns 400
# ----------------------------------------------------------
echo ""
echo "--- Validation ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/identify" \
  -H "Content-Type: application/json" -d '{}')
assert_status "POST /identify with empty body returns 400" 400 "$STATUS"

# ----------------------------------------------------------
# Test 3: New primary contact
# ----------------------------------------------------------
echo ""
echo "--- Case 1: New Primary Contact ---"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/identify" \
  -H "Content-Type: application/json" \
  -d '{"email":"lorraine@hillvalley.edu","phoneNumber":"123456"}')
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

assert_status "Create new primary returns 200" 200 "$STATUS"
assert_contains "Response has primaryContactId" "$BODY" '"primaryContactId"'
assert_contains "Response has lorraine email" "$BODY" '"lorraine@hillvalley.edu"'
assert_contains "Response has phone 123456" "$BODY" '"123456"'
assert_contains "secondaryContactIds is empty" "$BODY" '"secondaryContactIds":\[\]'

# ----------------------------------------------------------
# Test 4: Secondary contact (shared phone, new email)
# ----------------------------------------------------------
echo ""
echo "--- Case 2: Secondary Contact Created ---"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/identify" \
  -H "Content-Type: application/json" \
  -d '{"email":"mcfly@hillvalley.edu","phoneNumber":"123456"}')
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

assert_status "Secondary creation returns 200" 200 "$STATUS"
assert_contains "Has lorraine (primary) email" "$BODY" '"lorraine@hillvalley.edu"'
assert_contains "Has mcfly (secondary) email" "$BODY" '"mcfly@hillvalley.edu"'
assert_contains "secondaryContactIds is non-empty" "$BODY" '"secondaryContactIds":\['

# ----------------------------------------------------------
# Test 5: Exact match — no duplicate
# ----------------------------------------------------------
echo ""
echo "--- Case 3: Exact Match (No Duplicate) ---"
RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/identify" \
  -H "Content-Type: application/json" \
  -d '{"email":"mcfly@hillvalley.edu","phoneNumber":"123456"}')
STATUS2=$(echo "$RESPONSE2" | tail -1)
BODY2=$(echo "$RESPONSE2" | sed '$d')

assert_status "Exact match returns 200" 200 "$STATUS2"
# Compare secondary IDs — should be identical (no new row)
SEC1=$(echo "$BODY" | grep -o '"secondaryContactIds":\[[^]]*\]')
SEC2=$(echo "$BODY2" | grep -o '"secondaryContactIds":\[[^]]*\]')
if [ "$SEC1" = "$SEC2" ]; then
  green "No duplicate row created (secondaryContactIds unchanged)"
  PASS=$((PASS + 1))
else
  red "Duplicate may have been created — secondaryContactIds changed"
  FAIL=$((FAIL + 1))
fi

# ----------------------------------------------------------
# Test 6: Two primaries merge
# ----------------------------------------------------------
echo ""
echo "--- Case 4: Primary Merge ---"
# Create two independent primaries
curl -s -o /dev/null -X POST "$BASE_URL/identify" \
  -H "Content-Type: application/json" \
  -d '{"email":"george@hillvalley.edu","phoneNumber":"919191"}'

curl -s -o /dev/null -X POST "$BASE_URL/identify" \
  -H "Content-Type: application/json" \
  -d '{"email":"biffsucks@hillvalley.edu","phoneNumber":"717171"}'

# Link them
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/identify" \
  -H "Content-Type: application/json" \
  -d '{"email":"george@hillvalley.edu","phoneNumber":"717171"}')
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

assert_status "Primary merge returns 200" 200 "$STATUS"
assert_contains "Merged: has george email" "$BODY" '"george@hillvalley.edu"'
assert_contains "Merged: has biffsucks email" "$BODY" '"biffsucks@hillvalley.edu"'
assert_contains "Merged: has phone 919191" "$BODY" '"919191"'
assert_contains "Merged: has phone 717171" "$BODY" '"717171"'

# ----------------------------------------------------------
# Test 7: Email only
# ----------------------------------------------------------
echo ""
echo "--- Edge: Email Only ---"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/identify" \
  -H "Content-Type: application/json" \
  -d '{"email":"solo@hillvalley.edu"}')
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

assert_status "Email-only returns 200" 200 "$STATUS"
assert_contains "Has solo email" "$BODY" '"solo@hillvalley.edu"'

# ----------------------------------------------------------
# Test 8: Phone only
# ----------------------------------------------------------
echo ""
echo "--- Edge: Phone Only ---"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/identify" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"555555"}')
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

assert_status "Phone-only returns 200" 200 "$STATUS"
assert_contains "Has phone 555555" "$BODY" '"555555"'

# ----------------------------------------------------------
# Test 9: phoneNumber as number (coercion)
# ----------------------------------------------------------
echo ""
echo "--- Edge: phoneNumber as Number ---"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/identify" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":999888}')
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

assert_status "Number phone returns 200" 200 "$STATUS"
assert_contains "Coerced to string 999888" "$BODY" '"999888"'

# ----------------------------------------------------------
# Summary
# ----------------------------------------------------------
echo ""
echo "==============================================="
TOTAL=$((PASS + FAIL))
echo "  Results: $PASS/$TOTAL passed"
if [ "$FAIL" -eq 0 ]; then
  echo -e "  \033[32mAll tests passed!\033[0m"
else
  echo -e "  \033[31m$FAIL test(s) failed.\033[0m"
fi
echo "==============================================="
echo ""

exit $FAIL
