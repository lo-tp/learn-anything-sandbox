#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://localhost:3001/api/compile}"

CODE='import { useState } from "react";

export default function Demo() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <h1>Count: {count}</h1>
      <button onClick={() => setCount(count + 1)}>increment</button>
    </div>
  );
}'

# Send valid JSX as the `code` field.
BODY=$(jq -n --arg code "$CODE" '{code: $code}')

echo "POST $URL"
curl -sS -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "$BODY" | head -c 400
echo
