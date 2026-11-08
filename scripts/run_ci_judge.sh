#!/usr/bin/env bash
# Run the AI Judge CI locally.
# Usage: ./scripts/run_ci_judge.sh
#
# Set JUDGE_SERVICE_URL and JUDGE_INTERNAL_KEY if running on non-default URLs.

set -e

JUDGE_URL="${JUDGE_SERVICE_URL:-http://localhost:8140}"
INTERNAL_KEY="${JUDGE_INTERNAL_KEY:-changeme-judge}"

echo "▶  Triggering CI run at $JUDGE_URL ..."

RESPONSE=$(curl -sf -X POST "$JUDGE_URL/ci/run?triggered_by=manual&wait=true" \
  -H "X-Internal-Key: $INTERNAL_KEY" \
  -H "Content-Type: application/json")

echo "$RESPONSE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
run_id = d['id']
passed = d['passed']
failed = d['failed']
total  = d['total_cases']
print(f'Run #{run_id}: {passed}/{total} passed, {failed} failed')
if failed > 0:
    print('FAILED test cases:')
    for j in d.get('judgments', []):
        if j['overall_score'] < 7.0:
            print(f\"  [{j['feature']}] score={j['overall_score']} – {j['feedback']}\")
    sys.exit(1)
else:
    print('All tests passed ✓')
"
