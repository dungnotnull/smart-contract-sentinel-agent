# SmartSentinel Troubleshooting Guide

This guide covers common issues, their causes, and resolution procedures for SmartSentinel operators.

## Table of Contents

1. [Quick Diagnosis](#quick-diagnosis)
2. [Detection Issues](#detection-issues)
3. [Performance Issues](#performance-issues)
4. [Connectivity Issues](#connectivity-issues)
5. [Simulation Issues](#simulation-issues)
6. [ML/GNN Issues](#mlgnn-issues)
7. [Response Issues](#response-issues)
8. [Configuration Issues](#configuration-issues)
9. [Data Issues](#data-issues)

## Quick Diagnosis

### Health Check Commands

```bash
# Overall system health
curl http://localhost:8080/health | jq .

# Component status
curl -s http://localhost:8080/health | jq '.components[] | select(.status != "healthy")'

# Recent errors
docker-compose -f docker-compose.production.yml logs --tail=100 | grep ERROR

# Failed RPC calls
curl -s http://localhost:9090/metrics | grep rpc_failures_total

# Detection rate (last hour)
sqlite3 data/incident-log.db \
  "SELECT COUNT(CASE WHEN detected = 1 THEN 1 END) * 100.0 / COUNT(*) as detection_rate \
   FROM incidents WHERE timestamp > datetime('now', '-1 hour')"
```

### Log Locations

**Docker:**
```bash
docker-compose -f docker-compose.production.yml logs -f smartsentinel
```

**Kubernetes:**
```bash
kubectl logs -f deployment/smartsentinel -n smartsentinel
```

**Bare Metal:**
```bash
sudo journalctl -u smartsentinel -f
# or
tail -f /var/log/smartsentinel/sentinel.log
```

## Detection Issues

### High False Positive Rate

**Symptoms:**
- More than 5 false positive alerts per day
- Protocol teams reporting unnecessary pauses
- Detection rate > 10% (suspiciously high)

**Diagnosis:**
```bash
# Check recent detections
npm run incident-log -- --since 24h --show-details

# Analyze detection scores
npm run incident-log -- --since 24h --analyze-scores

# Review threshold settings
cat config/thresholds.yml
```

**Resolutions:**

1. **Adjust GNN Threshold**
   ```yaml
   # config/thresholds.yml
   detection:
     gnn_score_threshold: 0.80  # Increase from 0.75
   ```

2. **Adjust Drain Threshold**
   ```yaml
   detection:
     drain_threshold_pct: 7.0  # Increase from 5.0
   ```

3. **Refine Heuristic Filters**
   ```yaml
   filters:
     function_selector:
       enabled: true
       min_confidence: 0.9  # Increase from 0.8
   ```

4. **Add False Positive Pattern**
   ```bash
   # Document the pattern
   npm run add-false-positive -- --pattern "specific_function_signature" --reason "legitimate_protocol_operation"
   ```

**Prevention:**
- Run weekly backtest to catch threshold drift
- Review all detections with protocol teams
- Maintain false positive database

### High False Negative Rate

**Symptoms:**
- Known exploits not being detected
- Detection rate < 50%
- Protocol team reports successful attacks

**Diagnosis:**
```bash
# Run comprehensive backtest
npm run backtest

# Check which vulnerability types are missed
npm run tune-thresholds -- data/backtest-results/backtest-*.json

# Review recent undetected exploits
npm run incident-log -- --show-missed --since 7d
```

**Resolutions:**

1. **Lower Detection Thresholds**
   ```yaml
   detection:
     gnn_score_threshold: 0.70  # Decrease from 0.75
     drain_threshold_pct: 3.0   # Decrease from 5.0
   ```

2. **Retrain GNN Model**
   ```bash
   # Add missed exploits to training data
   python ml-pipeline/data/add_mined_exploits.py --source incident-log

   # Retrain with new data
   python ml-pipeline/train.py --epochs 150 --incremental
   ```

3. **Add New Vulnerability Patterns**
   ```bash
   # Extract bytecode patterns from missed exploits
   python ml-pipeline/data/extract_patterns.py --exploits data/missed-exploits/

   # Update feature extractor
   vim ml-pipeline/models/feature_extractor.py
   ```

4. **Enable Additional Heuristics**
   ```yaml
   filters:
     whale_tracker:
       enabled: true
       threshold_usd: 1000000  # Lower from 5000000
   ```

**Prevention:**
- Daily monitoring of detection rate
- Weekly backtest against known exploits
- Monthly GNN model evaluation

### No Detections at All

**Symptoms:**
- Zero detections for extended period
- No threat scores being recorded
- Metrics show no activity

**Diagnosis:**
```bash
# Check if system is processing transactions
curl -s http://localhost:9090/metrics | grep transactions_processed_total

# Verify chain listeners are connected
curl -s http://localhost:8080/health | jq '.components[] | select(.name | contains("listener"))'

# Check if pre-filter is blocking everything
docker-compose logs | grep "Pre-filter rejected"
```

**Resolutions:**

1. **Verify Pre-Filter Configuration**
   ```yaml
   filters:
     pre_filter:
       enabled: true
       pass_rate_minimum: 0.01  # Allow at least 1% to pass
   ```

2. **Check Chain Listeners**
   ```bash
   # Restart listeners
   kubectl rollout restart deployment smartsentinel -n smartsentinel
   ```

3. **Verify Monitored Contracts**
   ```bash
   # Ensure contracts are configured
   curl http://localhost:8080/api/v1/monitored-contracts | jq '.contracts | length'
   ```

## Performance Issues

### High Detection Latency (> 3s p95)

**Symptoms:**
- P95 latency > 3 seconds
- Detections completing after transaction confirmed
- Front-run bundles failing

**Diagnosis:**
```bash
# Profile the pipeline
npm run profile -- --duration 60

# Check component latencies
curl -s http://localhost:9090/metrics | grep "_latency_seconds"

# Identify slowest component
docker-compose logs | grep "Pipeline stage duration"
```

**Resolutions:**

1. **Optimize Simulation**
   ```yaml
   simulation:
     timeout_seconds: 5  # Reduce from 10
     pool_size: 10      # Increase from 5
     reuse_forks: true  # Enable fork reuse
   ```

2. **Optimize GNN Scoring**
   ```yaml
   gnn:
     batch_size: 8      # Enable batch inference
     cache_enabled: true
   ```

3. **Parallelize Pipeline**
   ```yaml
   pipeline:
     parallel_stages: true
     max_parallel_simulations: 5
   ```

4. **Increase Resources**
   ```yaml
   # Kubernetes
   resources:
     requests:
       cpu: "8"
       memory: "16Gi"
   ```

**Prevention:**
- Continuous latency monitoring
- Regular performance profiling
- Capacity planning based on volume

### High Memory Usage

**Symptoms:**
- OOM kills
- Memory usage > 90%
- Swap usage increasing

**Diagnosis:**
```bash
# Check memory usage
kubectl top pod -n smartsentinel
# or
docker stats smartsentinel

# Check for memory leaks
curl -s http://localhost:9090/metrics | grep process_resident_memory_bytes
```

**Resolutions:**

1. **Increase Memory Limit**
   ```yaml
   resources:
     limits:
       memory: "32Gi"  # Increase from 16Gi
   ```

2. **Reduce Simulation Pool**
   ```yaml
   simulation:
     pool_size: 5  # Decrease from 10
   ```

3. **Enable Memory Profiling**
   ```bash
   # Run with memory profiler
   node --heap-prof dist/main.js
   ```

4. **Restart Service**
   ```bash
   # Clear accumulated memory
   kubectl rollout restart deployment smartsentinel -n smartsentinel
   ```

### High CPU Usage

**Symptoms:**
- CPU consistently > 80%
- Throttling detected
- Slow response times

**Diagnosis:**
```bash
# Check CPU usage
kubectl top pod -n smartsentinel
# or
docker stats smartsentinel

# Profile CPU usage
npm run profile -- --cpu --duration 30
```

**Resolutions:**

1. **Scale Horizontally**
   ```bash
   kubectl scale deployment smartsentinel --replicas=3 -n smartsentinel
   ```

2. **Reduce Simulation Complexity**
   ```yaml
   simulation:
     max_steps: 1000  # Reduce from 10000
   ```

3. **Optimize GNN Inference**
   ```yaml
   gnn:
     quantized: true  # Use quantized model
   ```

4. **Chain Sharding**
   - Run separate instances per chain
   - Use consistent routing

## Connectivity Issues

### RPC Pool Failures

**Symptoms:**
- High RPC failure rate
- Chain listener showing "down"
- No transactions from specific chain

**Diagnosis:**
```bash
# Check RPC failures
curl -s http://localhost:9090/metrics | grep rpc_failures_total

# Test RPC endpoints manually
curl -X POST https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Check rate limits
curl -s http://localhost:9090/metrics | grep rpc_rate_limited
```

**Resolutions:**

1. **Add Fallback RPCs**
   ```yaml
   # config/chains.yml
   ethereum:
     rpc_urls:
       - https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
       - https://mainnet.infura.io/v3/YOUR_KEY
       - https://eth.drpc.org
       - https://rpc.ankr.com/eth
   ```

2. **Adjust Rate Limits**
   ```yaml
   rpc:
     rate_limit_rpm: 120  # Increase from 60
     burst_size: 20
   ```

3. **Use Different RPC Provider**
   - Some providers have better uptime
   - Consider enterprise plans for production

4. **Enable Health Checks**
   ```yaml
   rpc:
     health_check_interval: 30  # Check every 30 seconds
     unhealthy_threshold: 3    # Failover after 3 failures
   ```

### WebSocket Connection Drops

**Symptoms:**
- Frequent reconnections
- Gaps in transaction coverage
- WebSocket error logs

**Diagnosis:**
```bash
# Check connection logs
docker-compose logs | grep "WebSocket.*disconnect"

# Check reconnection rate
curl -s http://localhost:9090/metrics | grep websocket_reconnects_total
```

**Resolutions:**

1. **Enable Auto-Reconnect**
   ```yaml
   websocket:
     auto_reconnect: true
     max_reconnect_attempts: 10
     reconnect_delay_ms: 1000
   ```

2. **Use Persistent Connections**
   ```yaml
   websocket:
     ping_interval: 30
     ping_timeout: 10
   ```

3. **Add Connection Monitor**
   ```bash
   # External monitoring
   npm run monitor-websocket -- --alert-on-disconnect
   ```

### GNN Server Unreachable

**Symptoms:**
- GNN server component showing "down"
- Detections falling back to heuristics
- GNN connection errors

**Diagnosis:**
```bash
# Check GNN server health
curl http://localhost:8765/health

# Test connectivity
curl -X POST http://localhost:8765/predict \
  -H "Content-Type: application/json" \
  -d '{"bytecode":"0x..."}'

# Check logs
docker-compose -f docker-compose.production.yml logs gnn-server
```

**Resolutions:**

1. **Restart GNN Server**
   ```bash
   kubectl rollout restart deployment gnn-server -n ml-pipeline
   ```

2. **Enable Fallback Mode**
   ```yaml
   gnn:
     fallback_enabled: true
     fallback_drain_multiplier: 0.8  # Use 80% of threshold
   ```

3. **Increase Timeout**
   ```yaml
   gnn:
     timeout_ms: 10000  # Increase from 5000
   ```

4. **Add Load Balancer**
   - Deploy multiple GNN server instances
   - Use HAProxy/nginx for load balancing

## Simulation Issues

### Simulation Timeouts

**Symptoms:**
- High simulation failure rate
- "Simulation timeout" errors
- Incomplete drain calculations

**Diagnosis:**
```bash
# Check simulation failures
curl -s http://localhost:9090/metrics | grep simulation_errors_total

# Review timeout logs
docker-compose logs | grep "Simulation timeout"

# Check Anvil fork health
kubectl get pods -n smartsentinel -l app=anvil-fork
```

**Resolutions:**

1. **Increase Timeout**
   ```yaml
   simulation:
     timeout_seconds: 15  # Increase from 10
   ```

2. **Optimize Transaction**
   ```yaml
   simulation:
     max_steps: 5000  # Reduce from 10000
     gas_limit_multiplier: 1.5
   ```

3. **Add Pre-Simulation Check**
   ```yaml
   simulation:
     preflight_check: true
     abort_on_gas_anomaly: true
   ```

4. **Scale Simulation Pool**
   ```yaml
   simulation:
     pool_size: 15  # Increase from 10
   ```

### Incorrect Drain Calculations

**Symptoms:**
- Drain % doesn't match expected
- False positives due to bad drain calc
- Negative drain values

**Diagnosis:**
```bash
# Review simulation logs
npm run incident-log -- --last 1 --show-simulation-details

# Test with known transaction
npm run replay-exploit -- --tx 0x... --show-drain-calc

# Check for token pricing issues
docker-compose logs | grep "Token price.*error"
```

**Resolutions:**

1. **Update Token Prices**
   ```bash
   # Refresh price oracle
   npm run update-token-prices
   ```

2. **Fix Drain Calculator**
   ```bash
   # Verify calculation logic
   npm run test-drain-calculator -- --validate
   ```

3. **Add Price Sanity Checks**
   ```yaml
   simulation:
     price_variance_threshold: 0.2  # Alert if price moves > 20%
   ```

4. **Use Alternative Price Source**
   ```yaml
   simulation:
     price_sources:
       - chainlink
       - uniswap
       - coinbase
   ```

### Anvil Fork Issues

**Symptoms:**
- Fork creation failures
- "State not available" errors
- Incorrect fork state

**Diagnosis:**
```bash
# Check Anvil pod status
kubectl get pods -n smartsentinel -l app=anvil-fork

# Review Anvil logs
kubectl logs -f deployment/anvil-fork -n smartsentinel

# Test fork creation manually
anvil --fork-url https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY --fork-block-number 18000000
```

**Resolutions:**

1. **Restart Anvil Pool**
   ```bash
   kubectl rollout restart deployment anvil-fork -n smartsentinel
   ```

2. **Adjust Fork Block**
   ```yaml
   simulation:
     fork_block_offset: -100  # Use earlier block
   ```

3. **Increase Fork Pool Size**
   ```yaml
   simulation:
     fork_pool_size: 20  # Increase warm forks
   ```

4. **Add Fork Health Monitor**
   ```bash
   npm run monitor-forks -- --auto-heal
   ```

## ML/GNN Issues

### Low Model Confidence

**Symptoms:**
- GNN scores consistently < 0.5
- "Low confidence" warnings
- High variance in scores

**Diagnosis:**
```bash
# Check GNN score distribution
npm run incident-log -- --analyze-gnn-scores --since 24h

# Test model on known samples
python ml-pipeline/eval/test_known_samples.py

# Review model version
curl http://localhost:8765/model-info
```

**Resolutions:**

1. **Retrain Model**
   ```bash
   python ml-pipeline/train.py --full-retrain --epochs 200
   ```

2. **Add More Training Data**
   ```bash
   # Include recent exploits
   python ml-pipeline/data/add_recent_exploits.py --days 30
   ```

3. **Adjust Model Architecture**
   ```python
   # Increase model capacity
   # ml-pipeline/models/gnn_classifier.py
   hidden_dim = 256  # Increase from 128
   num_layers = 4    # Increase from 3
   ```

4. **Enable Ensemble**
   ```yaml
   gnn:
     ensemble_enabled: true
     models:
       - model-v1.0.0.pt
       - model-v1.1.0.pt
   ```

### Model Inference Slow

**Symptoms:**
- GNN scoring > 500ms
- Timeout errors
- Backlog building up

**Diagnosis:**
```bash
# Profile GNN inference
curl -X POST http://localhost:8765/predict \
  -H "Content-Type: application/json" \
  -d '{"bytecode":"0x...","profile":true}'
```

**Resolutions:**

1. **Use Quantized Model**
   ```bash
   python ml-pipeline/export.py --quantize --format onnx
   ```

2. **Enable Batching**
   ```yaml
   gnn:
     batch_size: 16
     batch_timeout_ms: 100
   ```

3. **Add GPU Acceleration**
   ```yaml
   # Kubernetes
   resources:
     limits:
       nvidia.com/gpu: 1
   ```

4. **Scale GNN Server**
   ```bash
   kubectl scale deployment gnn-server --replicas=3 -n ml-pipeline
   ```

### Feature Extraction Errors

**Symptoms:**
- "Feature extraction failed" errors
- No GNN scores
- Feature vector empty

**Diagnosis:**
```bash
# Test feature extraction
python ml-pipeline/models/feature_extractor.py --test-bytecode 0x...

# Check for parsing errors
docker-compose -f docker-compose.production.yml logs | grep "Bytecode parse error"
```

**Resolutions:**

1. **Update Feature Extractor**
   ```bash
   # Handle new bytecode patterns
   python ml-pipeline/models/update_features.py
   ```

2. **Add Error Handling**
   ```python
   # Add fallback features
   try:
       features = extract_features(bytecode)
   except Exception as e:
       features = get_fallback_features(bytecode)
   ```

3. **Validate Bytecode**
   ```yaml
   gnn:
     bytecode_validation: true
     min_bytecode_length: 100
   ```

## Response Issues

### Bundle Not Included

**Symptoms:**
- Bundle submitted but not included
- "Bundle not included" errors
- Response failed

**Diagnosis:**
```bash
# Check bundle inclusion rate
curl -s http://localhost:9090/metrics | grep bundles_included_total

# Review Flashbots logs
docker-compose logs | grep "Bundle.*included"

# Check gas price
npm run incident-log -- --last 1 --show-gas-price
```

**Resolutions:**

1. **Increase Gas Price**
   ```yaml
   response:
     gas_price_boost_pct: 25  # Increase from 15
   ```

2. **Use Higher Tip**
   ```yaml
   response:
     coinbase_tip_gwei: 5  # Add miner tip
   ```

3. **Retry with Higher Gas**
   ```yaml
   response:
     retry_with_boost: true
     boost_multiplier: 1.5
   ```

4. **Check Flashbots Status**
   ```bash
   curl https://relay.flashbots.net/health
   ```

### Pause Transaction Failed

**Symptoms:**
- Pause transaction reverted
- "Pause failed" error
- Contract not actually paused

**Diagnosis:**
```bash
# Check pause method
npm run incident-log -- --last 1 --show-pause-details

# Verify guardian permissions
npm run verify-guardian -- --contract 0x... --method pause

# Check revert reason
docker-compose logs | grep "Revert.*pause"
```

**Resolutions:**

1. **Verify Pause Method**
   ```yaml
   # config/monitored-contracts.yml
   contracts:
     - pause_method: "pause(bool)"  # Verify signature
   ```

2. **Check Guardian Permissions**
   ```bash
   # Ensure guardian has PAUSER_ROLE
   npm run check-role -- --contract 0x... --role PAUSER_ROLE --guardian 0x...
   ```

3. **Add Retry Logic**
   ```yaml
   response:
     pause_retry_attempts: 3
     pause_retry_delay_ms: 1000
   ```

4. **Use Alternative Pause**
   ```yaml
   response:
     fallback_pause_methods:
       - "pause()"
       - "setPaused(bool)"
       - "suspend()"
   ```

### Alert Not Delivered

**Symptoms:**
- No Telegram alert received
- PagerDuty not triggered
- Slack notification missing

**Diagnosis:**
```bash
# Check alert logs
docker-compose logs | grep "Alert.*dispatched"

# Test notification channels
npm run test-alerts -- --channel telegram

# Verify credentials
cat .env | grep -E "TELEGRAM|PAGERDUTY|SLACK"
```

**Resolutions:**

1. **Verify Bot Token**
   ```bash
   # Test Telegram bot
   curl https://api.telegram.org/bot$TOKEN/getMe
   ```

2. **Check Chat ID**
   ```bash
   # Get correct chat ID
   curl https://api.telegram.org/bot$TOKEN/getUpdates
   ```

3. **Retry Failed Alerts**
   ```yaml
   alerts:
     retry_attempts: 3
     retry_delay_ms: 5000
   ```

4. **Add Fallback Channel**
   ```yaml
   alerts:
     fallback_channels:
       - telegram
       - email
       - pagerduty
   ```

## Configuration Issues

### Invalid Configuration

**Symptoms:**
- "Configuration validation failed"
- Service won't start
- Missing required fields

**Diagnosis:**
```bash
# Validate configuration
npm run validate-config

# Check for syntax errors
yamllint config/*.yml

# Review startup logs
docker-compose logs | grep "Config.*error"
```

**Resolutions:**

1. **Fix Schema Violations**
   ```bash
   # Use config loader to validate
   node dist/core/config-loader.js --validate
   ```

2. **Add Missing Fields**
   ```yaml
   # Ensure all required fields present
   contracts:
     - name: "Example"
       chain: ethereum  # Required
       address: "0x..."  # Required
       # ... all required fields
   ```

3. **Use Example Config**
   ```bash
   # Start from example
   cp config/monitored-contracts.example.yml config/monitored-contracts.yml
   ```

### Configuration Not Applied

**Symptoms:**
- Changes to config files not reflected
- Old settings still in use
- Requires restart to apply

**Diagnosis:**
```bash
# Check current config
curl http://localhost:8080/api/v1/config

# Compare with file
diff config/thresholds.yml <(curl -s http://localhost:8080/api/v1/config | jq '.thresholds')
```

**Resolutions:**

1. **Reload Configuration**
   ```bash
   # Send SIGHUP to reload
   kill -HUP $(pgrep -f smartsentinel)
   ```

2. **Restart Service**
   ```bash
   kubectl rollout restart deployment smartsentinel -n smartsentinel
   ```

3. **Verify ConfigMap Applied**
   ```bash
   kubectl get configmap smartsentinel-config -n smartsentinel -o yaml
   ```

## Data Issues

### Database Corruption

**Symptoms:**
- "Database is malformed" errors
- Cannot query incident log
- Records missing

**Diagnosis:**
```bash
# Check database integrity
sqlite3 data/incident-log.db "PRAGMA integrity_check;"

# Try to open database
sqlite3 data/incident-log.db "SELECT COUNT(*) FROM incidents;"
```

**Resolutions:**

1. **Restore from Backup**
   ```bash
   cp data/backups/incident-log-latest.db data/incident-log.db
   ```

2. **Export and Reimport**
   ```bash
   # Export what we can
   sqlite3 data/incident-log.db ".dump incidents" > incidents.sql

   # Create new database
   sqlite3 data/incident-log-new.db < incidents.sql
   mv data/incident-log-new.db data/incident-log.db
   ```

3. **Enable WAL Mode**
   ```sql
   -- Better corruption resistance
   PRAGMA journal_mode=WAL;
   ```

### Known Attackers Registry Issues

**Symptoms:**
- Whale tracker not working
- Attackers not being flagged
- Registry won't load

**Diagnosis:**
```bash
# Validate JSON
jq '.' data/known-attackers.json

# Check file size
ls -lh data/known-attackers.json
```

**Resolutions:**

1. **Fix JSON Syntax**
   ```bash
   # Format and validate
   jq '.' data/known-attackers.json > data/known-attackers-fixed.json
   mv data/known-attackers-fixed.json data/known-attackers.json
   ```

2. **Rebuild Registry**
   ```bash
   npm run rebuild-attacker-registry
   ```

3. **Add Missing Fields**
   ```json
   {
     "attackers": [
       {
         "address": "0x...",
         "added_at": "2026-06-08",
         "source": "incident",
         "chains": ["ethereum"]
       }
     ]
   }
   ```

## Emergency Procedures

### Complete System Failure

**Symptoms:**
- All components down
- No health check response
- No metrics available

**Immediate Actions:**

1. **Check Infrastructure**
   ```bash
   # Kubernetes
   kubectl get nodes
   kubectl get pods -n smartsentinel

   # Docker
   docker ps -a | grep smartsentinel

   # Bare Metal
   sudo systemctl status smartsentinel
   ```

2. **Restart Everything**
   ```bash
   # Kubernetes
   kubectl rollout restart deployment smartsentinel -n smartsentinel

   # Docker
   docker-compose -f docker-compose.production.yml restart

   # Bare Metal
   sudo systemctl restart smartsentinel
   ```

3. **If Still Down, Restore from Backup**
   ```bash
   # Restore last known good state
   ./scripts/emergency-restore.sh --backup-date $(date +%Y%m%d -d 'yesterday')
   ```

4. **Escalate**
   - Page on-call if not already done
   - Engage engineering team
   - Notify stakeholders

### Database Loss

**Symptoms:**
- Database file missing
- Empty database
- Cannot read records

**Immediate Actions:**

1. **Stop Service**
   ```bash
   sudo systemctl stop smartsentinel
   ```

2. **Restore Latest Backup**
   ```bash
   cp data/backups/incident-log-latest.db data/incident-log.db
   cp data/backups/known-attackers-latest.json data/known-attackers.json
   ```

3. **Verify Restore**
   ```bash
   sqlite3 data/incident-log.db "SELECT COUNT(*) FROM incidents;"
   ```

4. **Restart Service**
   ```bash
   sudo systemctl start smartsentinel
   ```

5. **Investigate Root Cause**
   - Check disk space
   - Review logs for errors
   - Verify backup process

## Contact and Escalation

### When to Escalate

- **Immediate**: System down, funds at risk, database corruption
- **Within 1 hour**: High false positive/negative rate, performance degradation
- **Within 24 hours**: Configuration issues, minor bugs
- **Weekly**: Routine maintenance, optimization

### Escalation Contacts

- **On-Call**: PagerDuty (24/7)
- **Engineering Lead**: slack://@smartsentinel-lead
- **Database Admin**: dba@smartsentinel.io
- **Infrastructure**: infra@smartsentinel.io

### Documentation Updates

After resolving any issue:

1. **Document the incident**
   ```bash
   npm run document-incident -- --type "issue-resolved" --summary "Brief description"
   ```

2. **Update runbook**
   - Add new troubleshooting steps
   - Update procedures if needed
   - Share with team

3. **Improve monitoring**
   - Add alerts for similar issues
   - Create dashboards
   - Update runbook
