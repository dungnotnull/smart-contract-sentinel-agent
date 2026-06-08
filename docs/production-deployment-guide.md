# SmartSentinel Production Deployment Guide

This guide covers deploying SmartSentinel to production environments, including Docker, Kubernetes, and bare metal deployments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Configuration](#environment-configuration)
3. [Docker Deployment](#docker-deployment)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [Bare Metal Deployment](#bare-metal-deployment)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Monitoring and Maintenance](#monitoring-and-maintenance)

## Prerequisites

### System Requirements

**Minimum:**
- CPU: 4 cores
- RAM: 8 GB
- Disk: 50 GB SSD
- Network: 1 Gbps

**Recommended:**
- CPU: 8 cores
- RAM: 16 GB
- Disk: 100 GB NVMe SSD
- Network: 10 Gbps

### Software Requirements

- Docker 24.0+ (for Docker deployment)
- Kubernetes 1.28+ (for K8s deployment)
- Node.js 20.0+ (for bare metal)
- Python 3.11+ (for ML pipeline)
- Anvil 0.2.0+ (for simulation)
- Make and build tools

### External Dependencies

- RPC endpoints (Alchemy, Infura, QuickNode) for each monitored chain
- GNN inference server (can be local or remote)
- Flashbots relay access (for Ethereum mainnet)
- Telegram bot token (for alerts)
- PagerDuty integration key (optional)
- Slack webhook URL (optional)

## Environment Configuration

### 1. Environment Variables

Create a `.env` file in the project root:

```bash
# Core Configuration
NODE_ENV=production
LOG_LEVEL=info
SENTRY_DSN=

# Chain RPC Endpoints
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ETHEREUM_FALLBACK_RPC_1=https://mainnet.infura.io/v3/YOUR_KEY
ETHEREUM_FALLBACK_RPC_2=https://eth.quicknode.com/YOUR_KEY

ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_KEY
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY

SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_FALLBACK_RPC_1=https://solana-api.projectserum.com

# GNN ML Service
GNN_SERVER_URL=http://localhost:8765
GNN_SERVER_TIMEOUT_MS=5000
GNN_FALLBACK_ENABLED=true

# Flashbots Configuration
FLASHBOTS_RELAY_URL=https://relay.flashbots.net
FLASHBOTS_ENABLE_PRIVATE_RELAY=true

# Guardian Wallet (ENCRYPTED - use Key Manager)
GUARDIAN_KEY_ENCRYPTION_KEY=32-byte-hex-key
GUARDIAN_WALLET_ADDRESS=0x...

# Notification Channels
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=-100...
PAGERDUTY_SERVICE_KEY=your-service-key
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Database
INCIDENT_LOG_PATH=/data/incident-log.db
KNOWN_ATTACKERS_PATH=/data/known-attackers.json

# Security
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=1000
RATE_LIMIT_MAX_REQUESTS=100
AUDIT_LOG_ENABLED=true
AUDIT_LOG_PATH=/data/audit.log

# Monitoring
METRICS_ENABLED=true
METRICS_PORT=9090
HEALTH_CHECK_PORT=8080
```

### 2. Monitored Contracts Configuration

Edit `config/monitored-contracts.yml`:

```yaml
contracts:
  - name: "Example Protocol Vault"
    chain: ethereum
    address: "0x..."
    pause_method: "pause()"
    guardian_address: "0x..."
    guardian_private_key_env: "EXAMPLE_GUARDIAN_KEY"
    tvl_usd: 100000000
    drain_threshold_pct: 3.0
    gnn_threshold: 0.80
    notify:
      telegram_chat_id: "-100..."
      pagerduty_service_key_env: "PD_EXAMPLE_KEY"
    added_by: "human-review"
    added_at: "2026-06-08"
```

### 3. Thresholds Configuration

Edit `config/thresholds.yml`:

```yaml
detection:
  gnn_score_threshold: 0.75
  drain_threshold_pct: 5.0
  gas_anomaly_multiplier: 3.0

simulation:
  timeout_seconds: 10
  block_offset: 0

response:
  gas_price_boost_pct: 15
  max_gas_price_gwei: 500
  retry_attempts: 3
```

## Docker Deployment

### Quick Start

```bash
# Build the image
docker build -t smartsentinel:latest .

# Run with environment file
docker run -d \
  --name smartsentinel \
  --env-file .env \
  -v $(pwd)/data:/data \
  -v $(pwd)/config:/config \
  -p 8080:8080 \
  -p 9090:9090 \
  smartsentinel:latest
```

### Docker Compose (Production)

```bash
# Start all services
docker-compose -f docker-compose.production.yml up -d

# View logs
docker-compose -f docker-compose.production.yml logs -f

# Stop services
docker-compose -f docker-compose.production.yml down
```

### Health Checks

```bash
# Check service health
curl http://localhost:8080/health

# Check readiness
curl http://localhost:8080/ready

# View metrics
curl http://localhost:9090/metrics
```

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster 1.28+
- kubectl configured
- Helm 3.0+ (recommended)

### Deploy with Helm

```bash
# Create namespace
kubectl create namespace smartsentinel

# Add secrets
kubectl create secret generic smartsentinel-secrets \
  --from-literal=guardian-key-encrypted='...' \
  --from-literal=telegram-bot-token='...' \
  -n smartsentinel

# Deploy using Helm chart
helm install smartsentinel ./helm/smartsentinel \
  --namespace smartsentinel \
  --values helm/smartsentinel/values.production.yaml \
  --set secrets.existingSecret=smartsentinel-secrets

# Check deployment
kubectl get pods -n smartsentinel
kubectl logs -f deployment/smartsentinel -n smartsentinel
```

### Scaling

```bash
# Horizontal scaling
kubectl scale deployment smartsentinel --replicas=3 -n smartsentinel

# Configure autoscaling (in values.yaml)
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80
```

### Upgrading

```bash
# Upgrade deployment
helm upgrade smartsentinel ./helm/smartsentinel \
  --namespace smartsentinel \
  --values helm/smartsentinel/values.production.yaml

# Rollback if needed
helm rollback smartsentinel -n smartsentinel
```

## Bare Metal Deployment

### Installation

```bash
# Install dependencies
npm install
pip install -r ml-pipeline/requirements.txt --break-system-packages

# Build TypeScript
npm run build

# Initialize configuration
cp config/chains.example.yml config/chains.yml
cp config/monitored-contracts.example.yml config/monitored-contracts.yml
# Edit configuration files...

# Initialize database
mkdir -p data
touch data/incident-log.db
touch data/known-attackers.json
echo '{"attackers":[]}' > data/known-attackers.json
```

### Systemd Service

Create `/etc/systemd/system/smartsentinel.service`:

```ini
[Unit]
Description=SmartSentinel DeFi Defense Agent
After=network.target

[Service]
Type=simple
User=smartsentinel
Group=smartsentinel
WorkingDirectory=/opt/smartsentinel
Environment="NODE_ENV=production"
EnvironmentFile=/etc/smartsentinel/env
ExecStart=/usr/bin/node /opt/smartsentinel/dist/main.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=smartsentinel

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable smartsentinel
sudo systemctl start smartsentinel
sudo systemctl status smartsentinel
```

### Log Rotation

Create `/etc/logrotate.d/smartsentinel`:

```
/var/log/smartsentinel/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 smartsentinel smartsentinel
    sharedscripts
    postrotate
        systemctl reload smartsentinel > /dev/null 2>&1 || true
    endscript
}
```

## Post-Deployment Verification

### 1. Health Checks

```bash
# All checks should pass
curl http://localhost:8080/health | jq .
# Expected output: {"status":"healthy",...}

curl http://localhost:8080/ready | jq .
# Expected output: {"ready":true}

# Check metrics endpoint
curl http://localhost:9090/metrics
# Should return Prometheus metrics
```

### 2. Connectivity Tests

```bash
# Test RPC connections
npm run status

# Test GNN server (if enabled)
curl http://localhost:8765/health

# Test simulation pool
# (Check logs for Anvil fork creation)
```

### 3. Backtest Validation

```bash
# Run exploit replay framework
npm run backtest

# Expected results:
# - Detection rate > 75%
# - Average latency < 3 seconds
# - No critical errors
```

### 4. Alert Channels

```bash
# Send test alert
curl -X POST http://localhost:8080/api/v1/test-alert \
  -H "Content-Type: application/json" \
  -d '{"severity":"info","message":"Test alert"}'

# Verify notifications arrive in:
# - Telegram chat
# - PagerDuty (if configured)
# - Slack (if configured)
```

## Monitoring and Maintenance

### Prometheus Monitoring

Configure Prometheus scrape:

```yaml
scrape_configs:
  - job_name: 'smartsentinel'
    static_configs:
      - targets: ['localhost:9090']
    scrape_interval: 15s
```

Key metrics to monitor:
- `transactions_processed_total` - Transaction throughput
- `threats_detected_total` - Detection count
- `detection_latency_seconds` - Pipeline latency (p95 < 3s)
- `bundles_submitted_total` - Front-run attempts
- `rpc_failures_total` - RPC reliability
- `gnn_server_up` - ML service availability

### Grafana Dashboards

Import `docs/grafana-dashboard.json` for pre-built visualization.

### Log Aggregation

```bash
# View real-time logs
docker-compose -f docker-compose.production.yml logs -f

# Search for errors
docker-compose -f docker-compose.production.yml logs | grep ERROR

# Export logs
docker-compose -f docker-compose.production.yml logs > deployment.log
```

### Backup Procedures

```bash
# Backup database
cp data/incident-log.db data/backups/incident-log-$(date +%Y%m%d).db

# Backup configuration
tar -czf config-backup-$(date +%Y%m%d).tar.gz config/

# Backup known attackers registry
cp data/known-attackers.json data/backups/known-attackers-$(date +%Y%m%d).json
```

### Update Procedures

```bash
# Pull latest code
git pull origin main

# Update dependencies
npm install
pip install -r ml-pipeline/requirements.txt --break-system-packages

# Rebuild
npm run build

# Restart service
sudo systemctl restart smartsentinel
# or
docker-compose -f docker-compose.production.yml up -d --force-recreate
```

### Incident Log Rotation

```bash
# Archive old incident logs
sqlite3 data/incident-log.db \
  "ATTACH DATABASE 'data/incident-log-archive.db' AS archive; \
   INSERT INTO archive.incidents SELECT * FROM incidents WHERE timestamp < datetime('now', '-30 days'); \
   DELETE FROM incidents WHERE timestamp < datetime('now', '-30 days');"
```

## Security Considerations

1. **Never expose guardian keys** in logs or monitoring
2. **Use encrypted secrets** in Kubernetes (Seals, Vault, etc.)
3. **Enable audit logging** for all security events
4. **Rotate credentials** every 90 days
5. **Limit network access** via firewall rules
6. **Run as non-root user** (Docker/Kubernetes)
7. **Enable rate limiting** on public endpoints
8. **Monitor for unusual activity** via Prometheus alerts

## Troubleshooting

See `docs/troubleshooting-guide.md` for detailed troubleshooting procedures.

Common issues:
- High latency: Check GNN server, optimize simulation timeout
- RPC failures: Verify endpoint availability, check rate limits
- False positives: Adjust thresholds in config/thresholds.yml
- Memory issues: Increase simulation pool size, add RAM

## Support

- Documentation: `docs/`
- Issues: GitHub Issues
- Emergency: PagerDuty escalation
