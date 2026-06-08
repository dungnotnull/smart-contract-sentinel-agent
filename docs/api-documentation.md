# SmartSentinel API Documentation

This document describes the REST API endpoints for monitoring, managing, and integrating with SmartSentinel.

## Base URL

- Production: `https://smartsentinel.example.com/api/v1`
- Development: `http://localhost:8080/api/v1`

## Authentication

All endpoints require Bearer token authentication:

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
  https://smartsentinel.example.com/api/v1/status
```

API tokens can be generated via the CLI:

```bash
npm run generate-api-token -- --name "Integration Token" --expiry 90d
```

## Response Format

All responses return JSON:

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "timestamp": "2026-06-08T12:00:00Z"
}
```

Error responses:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid contract address format",
    "details": { ... }
  },
  "timestamp": "2026-06-08T12:00:00Z"
}
```

## Endpoints

### Health & Status

#### GET /health

Liveness probe. Returns system health status.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-06-08T12:00:00Z",
    "components": [
      {
        "name": "sentinel_core",
        "status": "healthy",
        "message": "Sentinel core running",
        "lastCheck": "2026-06-08T12:00:00Z",
        "latencyMs": 5
      }
    ],
    "uptime": 86400,
    "version": "1.0.0"
  }
}
```

**Status Codes:**
- 200: System is healthy
- 503: System is unhealthy

---

#### GET /ready

Readiness probe. Returns whether system can handle requests.

**Response:**
```json
{
  "success": true,
  "data": {
    "ready": true
  }
}
```

**Status Codes:**
- 200: System is ready
- 503: System is not ready

---

#### GET /api/v1/status

Detailed system status including metrics.

**Query Parameters:**
- `include_metrics`: boolean - Include full metrics (default: false)
- `format`: `json` | `text` - Response format (default: json)

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 86400,
    "version": "1.0.0",
    "chains": {
      "ethereum": {
        "connected": true,
        "blockNumber": 18000000,
        "transactionsProcessed": 1500000
      },
      "arbitrum": {
        "connected": true,
        "blockNumber": 150000000,
        "transactionsProcessed": 800000
      }
    },
    "detection": {
      "threatsDetected": 45,
      "falsePositives": 2,
      "detectionRate": 0.96
    },
    "performance": {
      "avgLatencyMs": 1250,
      "p95LatencyMs": 2800,
      "p99LatencyMs": 4500
    }
  }
}
```

---

### Monitored Contracts

#### GET /api/v1/monitored-contracts

List all monitored contracts.

**Query Parameters:**
- `chain`: Filter by chain (optional)
- `status`: Filter by status (`active` | `paused`) (optional)

**Response:**
```json
{
  "success": true,
  "data": {
    "contracts": [
      {
        "name": "Aave V3 Pool",
        "chain": "ethereum",
        "address": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
        "status": "active",
        "tvlUsd": 5000000000,
        "drainThresholdPct": 3.0,
        "addedAt": "2026-01-15T00:00:00Z",
        "lastActivity": "2026-06-08T11:45:00Z"
      }
    ],
    "total": 15,
    "active": 15,
    "paused": 0
  }
}
```

---

#### GET /api/v1/monitored-contracts/:address

Get details for a specific monitored contract.

**Path Parameters:**
- `address`: Contract address (0x-prefixed)

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "Aave V3 Pool",
    "chain": "ethereum",
    "address": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    "pauseMethod": "setPoolPause(bool)",
    "guardianAddress": "0x...",
    "tvlUsd": 5000000000,
    "drainThresholdPct": 3.0,
    "gnnThreshold": 0.80,
    "notify": {
      "telegramChatId": "-100...",
      "pagerdutyServiceKey": "..."
    },
    "status": "active",
    "addedBy": "human-review",
    "addedAt": "2026-01-15T00:00:00Z",
    "lastActivity": "2026-06-08T11:45:00Z",
    "statistics": {
      "transactionsAnalyzed": 150000,
      "threatsDetected": 12,
      "falsePositives": 1,
      "pausesTriggered": 3
    }
  }
}
```

**Status Codes:**
- 200: Contract found
- 404: Contract not found

---

#### POST /api/v1/monitored-contracts

Add a new monitored contract (requires admin role).

**Request Body:**
```json
{
  "name": "New Protocol Vault",
  "chain": "ethereum",
  "address": "0x...",
  "pauseMethod": "pause()",
  "guardianAddress": "0x...",
  "guardianPrivateKeyEnv": "VAULT_GUARDIAN_KEY",
  "tvlUsd": 100000000,
  "drainThresholdPct": 5.0,
  "gnnThreshold": 0.75,
  "notify": {
    "telegramChatId": "-100...",
    "pagerdutyServiceKeyEnv": "PD_VAULT_KEY"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "contract": {
      "name": "New Protocol Vault",
      "address": "0x...",
      "status": "active",
      "addedAt": "2026-06-08T12:00:00Z"
    },
    "validation": {
      "passed": true,
      "checks": {
        "addressValid": true,
        "pauseMethodExists": true,
        "guardianHasPermission": true,
        "chainSupported": true
      }
    }
  }
}
```

**Status Codes:**
- 201: Contract added successfully
- 400: Invalid request
- 403: Insufficient permissions

---

#### PUT /api/v1/monitored-contracts/:address

Update monitored contract configuration (requires admin role).

**Path Parameters:**
- `address`: Contract address

**Request Body:**
```json
{
  "drainThresholdPct": 3.5,
  "gnnThreshold": 0.85
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "contract": {
      "address": "0x...",
      "drainThresholdPct": 3.5,
      "gnnThreshold": 0.85,
      "updatedAt": "2026-06-08T12:00:00Z"
    }
  }
}
```

**Status Codes:**
- 200: Contract updated
- 400: Invalid request
- 403: Insufficient permissions
- 404: Contract not found

---

#### DELETE /api/v1/monitored-contracts/:address

Remove a contract from monitoring (requires admin role).

**Path Parameters:**
- `address`: Contract address

**Response:**
```json
{
  "success": true,
  "data": {
    "removed": true,
    "address": "0x...",
    "removedAt": "2026-06-08T12:00:00Z"
  }
}
```

**Status Codes:**
- 200: Contract removed
- 403: Insufficient permissions
- 404: Contract not found

---

### Incidents & Detection

#### GET /api/v1/incidents

List incidents (detections).

**Query Parameters:**
- `since`: ISO8601 timestamp - Filter incidents since (optional)
- `until`: ISO8601 timestamp - Filter incidents until (optional)
- `limit`: integer - Max results (default: 100, max: 1000)
- `offset`: integer - Pagination offset (default: 0)
- `detected`: boolean - Filter by detection status (optional)
- `action`: `pause` | `alert` | `none` - Filter by action taken (optional)
- `vuln_type`: string - Filter by vulnerability type (optional)

**Response:**
```json
{
  "success": true,
  "data": {
    "incidents": [
      {
        "id": "inc_20260608120000_0x123",
        "timestamp": "2026-06-08T12:00:00Z",
        "chain": "ethereum",
        "blockNumber": 18000000,
        "transactionHash": "0x...",
        "fromAddress": "0x...",
        "toAddress": "0x...",
        "monitoredContract": "0x...",
        "detected": true,
        "action": "pause",
        "threatScore": 0.85,
        "vulnType": "reentrancy",
        "drainPct": 15.5,
        "simulationPassed": true,
        "latencyMs": 1250,
        "bundleHash": "0x...",
        "bundleIncluded": true,
        "alertsSent": ["telegram", "pagerduty"]
      }
    ],
    "total": 145,
    "limit": 100,
    "offset": 0
  }
}
```

---

#### GET /api/v1/incidents/:id

Get full details for a specific incident.

**Path Parameters:**
- `id`: Incident ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "inc_20260608120000_0x123",
    "timestamp": "2026-06-08T12:00:00Z",
    "chain": "ethereum",
    "blockNumber": 18000000,
    "transaction": {
      "hash": "0x...",
      "from": "0x...",
      "to": "0x...",
      "value": "1000000000000000000",
      "gas": 500000,
      "gasPrice": "50000000000",
      "input": "0x..."
    },
    "analysis": {
      "preFilter": {
        "passed": true,
        "flags": ["function_selector", "gas_anomaly"]
      },
      "simulation": {
        "drainPct": 15.5,
        "passed": true,
        "durationMs": 850
      },
      "gnn": {
        "score": 0.85,
        "vulnType": "reentrancy",
        "confidence": "high",
        "durationMs": 320
      },
      "decision": {
        "action": "pause",
        "reason": "GNN score 0.85 > threshold 0.75, drain 15.5% > threshold 5.0%",
        "confidence": "high"
      }
    },
    "response": {
      "action": "pause",
      "pauseTxHash": "0x...",
      "bundleHash": "0x...",
      "bundleIncluded": true,
      "blockIncluded": 18000002
    },
    "alerts": [
      {
        "channel": "telegram",
        "sent": true,
        "timestamp": "2026-06-08T12:00:01Z"
      },
      {
        "channel": "pagerduty",
        "sent": true,
        "incidentKey": "inc_20260608120000_0x123"
      }
    ],
    "forensicReport": "https://smartsentinel.example.com/reports/inc_20260608120000_0x123.pdf"
  }
}
```

**Status Codes:**
- 200: Incident found
- 404: Incident not found

---

### Configuration

#### GET /api/v1/config

Get current configuration (requires admin role).

**Response:**
```json
{
  "success": true,
  "data": {
    "thresholds": {
      "gnn_score_threshold": 0.75,
      "drain_threshold_pct": 5.0,
      "gas_anomaly_multiplier": 3.0
    },
    "simulation": {
      "timeout_seconds": 10,
      "block_offset": 0,
      "pool_size": 10
    },
    "response": {
      "gas_price_boost_pct": 15,
      "max_gas_price_gwei": 500,
      "retry_attempts": 3
    },
    "chains": ["ethereum", "arbitrum", "optimism", "base", "polygon", "solana"]
  }
}
```

**Status Codes:**
- 200: Configuration retrieved
- 403: Insufficient permissions

---

#### PUT /api/v1/config

Update configuration (requires admin role).

**Request Body:**
```json
{
  "thresholds": {
    "gnn_score_threshold": 0.80,
    "drain_threshold_pct": 3.0
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "updated": true,
    "previousConfig": { ... },
    "newConfig": { ... },
    "updatedAt": "2026-06-08T12:00:00Z"
  }
}
```

**Status Codes:**
- 200: Configuration updated
- 400: Invalid configuration
- 403: Insufficient permissions

---

### Analytics & Reporting

#### GET /api/v1/analytics/summary

Get analytics summary for a time period.

**Query Parameters:**
- `since`: ISO8601 timestamp - Start of period (required)
- `until`: ISO8601 timestamp - End of period (default: now)
- `chain`: string - Filter by chain (optional)

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "since": "2026-06-01T00:00:00Z",
      "until": "2026-06-08T12:00:00Z"
    },
    "overview": {
      "transactionsAnalyzed": 1500000,
      "threatsDetected": 45,
      "detectionRate": 0.96,
      "falsePositiveRate": 0.04
    },
    "byChain": {
      "ethereum": {
        "transactionsAnalyzed": 800000,
        "threatsDetected": 25,
        "detectionRate": 0.95
      },
      "arbitrum": {
        "transactionsAnalyzed": 400000,
        "threatsDetected": 12,
        "detectionRate": 0.97
      }
    },
    "byVulnType": {
      "reentrancy": {
        "detected": 20,
        "total": 22,
        "detectionRate": 0.91
      },
      "flash_loan": {
        "detected": 15,
        "total": 16,
        "detectionRate": 0.94
      }
    },
    "performance": {
      "avgLatencyMs": 1250,
      "p50LatencyMs": 1100,
      "p95LatencyMs": 2800,
      "p99LatencyMs": 4500
    },
    "response": {
      "pausesTriggered": 30,
      "bundlesSubmitted": 30,
      "bundlesIncluded": 28,
      "inclusionRate": 0.93
    }
  }
}
```

---

#### GET /api/v1/analytics/performance

Get detailed performance metrics.

**Query Parameters:**
- `since`: ISO8601 timestamp (required)
- `until`: ISO8601 timestamp (optional)
- `granularity`: `minute` | `hour` | `day` - Time granularity (default: hour)

**Response:**
```json
{
  "success": true,
  "data": {
    "metrics": [
      {
        "timestamp": "2026-06-08T11:00:00Z",
        "latency": {
          "avg": 1250,
          "p50": 1100,
          "p95": 2800,
          "p99": 4500
        },
        "throughput": {
          "transactionsPerSecond": 25.5,
          "detectionsPerMinute": 0.15
        },
        "resources": {
          "cpuUsagePct": 45.2,
          "memoryUsageMB": 8192,
          "activeSimulations": 8
        }
      }
    ]
  }
}
```

---

#### POST /api/v1/analytics/report

Generate and download a report.

**Request Body:**
```json
{
  "type": "incident",
  "format": "pdf",
  "since": "2026-06-01T00:00:00Z",
  "until": "2026-06-08T12:00:00Z",
  "include": {
    "details": true,
    "forensicReports": true,
    "charts": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reportId": "rpt_20260608120000",
    "status": "generating",
    "estimatedCompletion": "2026-06-08T12:01:00Z",
    "downloadUrl": "https://smartsentinel.example.com/api/v1/reports/rpt_20260608120000"
  }
}
```

---

### Testing & Simulation

#### POST /api/v1/test/alert

Send a test alert to verify notification channels.

**Request Body:**
```json
{
  "severity": "info",
  "channels": ["telegram", "pagerduty"],
  "message": "Test alert - verify notification channels"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sent": true,
    "channels": [
      {
        "name": "telegram",
        "sent": true,
        "messageId": 12345
      },
      {
        "name": "pagerduty",
        "sent": true,
        "incidentKey": "test_20260608120000"
      }
    ]
  }
}
```

---

#### POST /api/v1/test/detection

Simulate detection with a test transaction.

**Request Body:**
```json
{
  "chain": "ethereum",
  "transaction": {
    "from": "0x...",
    "to": "0x...",
    "value": "1000000000000000000",
    "input": "0x...",
    "gas": 500000
  },
  "simulate": true,
  "dryRun": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "hash": "0x...",
      "from": "0x...",
      "to": "0x..."
    },
    "preFilter": {
      "passed": true,
      "flags": ["function_selector", "gas_anomaly"]
    },
    "simulation": {
      "drainPct": 15.5,
      "passed": true
    },
    "gnn": {
      "score": 0.85,
      "vulnType": "reentrancy"
    },
    "decision": {
      "action": "pause",
      "reason": "GNN score 0.85 > threshold 0.75, drain 15.5% > threshold 5.0%"
    },
    "wouldPause": true,
    "dryRun": true
  }
}
```

---

#### POST /api/v1/test/backtest

Run backtest against historical exploits.

**Request Body:**
```json
{
  "exploits": ["beanstalk-2022", "euler-2023"],
  "thresholds": {
    "gnn_score_threshold": 0.75,
    "drain_threshold_pct": 5.0
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "backtestId": "bt_20260608120000",
    "status": "running",
    "estimatedCompletion": "2026-06-08T12:05:00Z",
    "resultsUrl": "https://smartsentinel.example.com/api/v1/backtests/bt_20260608120000"
  }
}
```

---

### Administrative

#### POST /api/v1/admin/validate-config

Validate configuration without applying changes.

**Request Body:**
```json
{
  "config": {
    "thresholds": {
      "gnn_score_threshold": 0.80
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "warnings": [],
    "errors": []
  }
}
```

---

#### POST /api/v1/admin/restart

Restart the service (requires admin role).

**Request Body:**
```json
{
  "gracePeriodSeconds": 30
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "restartScheduled": true,
    "estimatedDowntime": "5s"
  }
}
```

---

## Webhooks

SmartSentinel can send webhook notifications for events.

### Creating Webhooks

Webhooks are configured via environment variables or config file:

```yaml
# config/webhooks.yml
webhooks:
  - name: "Security Team"
    url: "https://your-endpoint.com/smartsentinel-webhook"
    events:
      - "threat.detected"
      - "pause.triggered"
      - "incident.resolved"
    headers:
      "Authorization": "Bearer YOUR_WEBHOOK_TOKEN"
    secret: "webhook_secret_for_signature"
    enabled: true
```

### Webhook Payload

**Event: threat.detected**
```json
{
  "event": "threat.detected",
  "timestamp": "2026-06-08T12:00:00Z",
  "incidentId": "inc_20260608120000_0x123",
  "data": {
    "chain": "ethereum",
    "transactionHash": "0x...",
    "monitoredContract": "0x...",
    "threatScore": 0.85,
    "vulnType": "reentrancy",
    "drainPct": 15.5,
    "action": "pause"
  }
}
```

**Event: pause.triggered**
```json
{
  "event": "pause.triggered",
  "timestamp": "2026-06-08T12:00:01Z",
  "incidentId": "inc_20260608120000_0x123",
  "data": {
    "chain": "ethereum",
    "pauseTxHash": "0x...",
    "bundleHash": "0x...",
    "monitoredContract": "0x...",
    "success": true
  }
}
```

### Webhook Signature

Webhooks are signed using HMAC-SHA256:

```python
import hmac
import hashlib

signature = hmac.new(
    b'webhook_secret_for_signature',
    payload,
    hashlib.sha256
).hexdigest()

# Verify signature
expected_signature = request.headers['X-SmartSentinel-Signature']
if signature != expected_signature:
    return "Invalid signature", 401
```

## Rate Limits

API endpoints are rate limited:

- Health endpoints: 100 requests/second
- Read endpoints: 50 requests/second
- Write endpoints: 10 requests/second
- Admin endpoints: 5 requests/second

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1623148800
```

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_REQUEST` | Malformed request or invalid parameters |
| `UNAUTHORIZED` | Missing or invalid authentication |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `CONFLICT` | Resource conflict (e.g., duplicate) |
| `RATE_LIMITED` | Rate limit exceeded |
| `INTERNAL_ERROR` | Internal server error |
| `SERVICE_UNAVAILABLE` | Service temporarily unavailable |
| `CONFIGURATION_ERROR` | Invalid configuration |
| `SIMULATION_FAILED` | Transaction simulation failed |
| `RESPONSE_FAILED` | Failed to execute response |

## SDKs

### JavaScript/TypeScript

```typescript
import { SmartSentinelClient } from '@smartsentinel/sdk';

const client = new SmartSentinelClient({
  baseURL: 'https://smartsentinel.example.com/api/v1',
  apiKey: 'your-api-key'
});

const incidents = await client.incidents.list({
  since: '2026-06-01T00:00:00Z',
  detected: true
});
```

### Python

```python
from smartsentinel import SmartSentinelClient

client = SmartSentinelClient(
    base_url='https://smartsentinel.example.com/api/v1',
    api_key='your-api-key'
)

incidents = client.incidents.list(
    since='2026-06-01T00:00:00Z',
    detected=True
)
```

### Go

```go
import "github.com/smartsentinel/go-sdk"

client := smartsentinel.NewClient(
    "https://smartsentinel.example.com/api/v1",
    "your-api-key",
)

incidents, err := client.Incidents().List(
    smartsentinel.WithSince(time.Now().Add(-24*time.Hour)),
    smartsentinel.WithDetected(true),
)
```

## Changelog

### v1.0.0 (2026-06-08)
- Initial API release
- All core endpoints implemented
- Webhook support added
- Rate limiting enabled
