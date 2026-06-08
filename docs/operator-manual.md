# SmartSentinel Operator Manual

This manual guides operators through daily operations, monitoring, alert response, and maintenance procedures for running SmartSentinel in production.

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Monitoring and Alerts](#monitoring-and-alerts)
3. [Incident Response](#incident-response)
4. [Maintenance Procedures](#maintenance-procedures)
5. [Configuration Management](#configuration-management)
6. [Performance Tuning](#performance-tuning)
7. [Emergency Procedures](#emergency-procedures)

## Daily Operations

### Morning Checklist

**Every day at start of shift:**

1. **System Health**
   ```bash
   # Check overall health
   curl http://localhost:8080/health | jq .

   # Verify all components operational
   curl -s http://localhost:8080/health | jq '.components[] | select(.status != "healthy")'
   ```

2. **Recent Incidents**
   ```bash
   # Review last 24 hours
   npm run incident-log -- --since 24h

   # Check for any pauses triggered
   npm run incident-log -- --action pause --since 24h
   ```

3. **Alert Channels**
   - Verify Telegram alerts are being received
   - Check PagerDuty for any escalated incidents
   - Review Slack notifications (if enabled)

4. **Performance Metrics**
   ```bash
   # Check detection rate (last 24h)
   curl -s http://localhost:9090/metrics | grep threats_detected_total

   # Check latency (p95 should be < 3s)
   curl -s http://localhost:9090/metrics | grep detection_latency_seconds
   ```

### Weekly Tasks

**Every week:**

1. **Full System Review**
   ```bash
   # Generate weekly report
   npm run incident-log -- --report weekly --format json > weekly-report.json
   ```

2. **Configuration Audit**
   - Verify `config/monitored-contracts.yml` matches approved contracts
   - Check `config/thresholds.yml` for unauthorized changes
   - Review RPC endpoint health and failover logs

3. **Backup Verification**
   ```bash
   # Verify recent backups exist
   ls -lh data/backups/ | tail -5

   # Test backup restore
   cp data/backups/incident-log-latest.db /tmp/test-restore.db
   sqlite3 /tmp/test-restore.db "SELECT COUNT(*) FROM incidents"
   ```

4. **Security Audit**
   ```bash
   # Review audit log for suspicious activity
   grep -i "unauthorized\|failed\|blocked" /data/audit.log | tail -20

   # Check for rate limit violations
   grep "rate_limit_exceeded" /data/audit.log | tail -20
   ```

### Monthly Tasks

**Every month:**

1. **Comprehensive Backtest**
   ```bash
   # Run full exploit replay
   npm run backtest

   # Review detection rate by vulnerability type
   npm run tune-thresholds -- data/backtest-results/backtest-*.json
   ```

2. **Performance Optimization Review**
   - Analyze latency metrics (p50, p95, p99)
   - Review RPC pool failover frequency
   - Check simulation pool utilization

3. **Dependency Updates**
   ```bash
   # Check for security updates
   npm audit
   pip-audit

   # Update dependencies (after testing)
   npm update
   pip install -U -r ml-pipeline/requirements.txt
   ```

4. **Capacity Planning**
   - Review transaction volume trends
   - Check resource utilization (CPU, RAM, disk)
   - Plan scaling if needed

## Monitoring and Alerts

### Key Metrics to Monitor

**Detection Performance:**
- `threats_detected_total` - Total threats detected (should be low but non-zero)
- `transactions_processed_total` - Total transactions monitored
- Detection rate = `threats_detected / transactions_processed` (typically < 0.1%)

**System Health:**
- `connected_listeners` - Number of active chain listeners (should equal monitored chains)
- `gnn_server_up` - GNN server availability (should be 1)
- `active_simulations` - Current simulation pool usage

**Performance:**
- `detection_latency_seconds` - End-to-end latency (p95 < 3s target)
- `simulation_latency_seconds` - Simulation time (p95 < 10s)
- `bundle_submission_latency_seconds` - Response time (p95 < 30s)

**Reliability:**
- `rpc_failures_total` - RPC connection failures (should be minimal)
- `simulation_errors_total` - Simulation failures (should be < 1%)
- `bundles_submitted_total` vs `bundles_included_total` - Front-run success rate

### Alert Thresholds

**Critical Alerts (immediate action required):**
- System status = "down"
- GNN server down for > 1 minute
- RPC pool fully down for any chain
- Detection latency p95 > 10 seconds
- False positive pause (confirmed by protocol team)

**Warning Alerts (investigate within 1 hour):**
- System status = "degraded"
- GNN server degraded for > 5 minutes
- Detection rate < 50% (suspiciously low)
- Average latency > 5 seconds
- Simulation failure rate > 5%

**Info Alerts (review daily):**
- New threat detected
- Pause action triggered
- Bundle submitted but not included
- Known attacker added to registry

### Alert Response Procedures

**When a critical alert fires:**

1. **Acknowledge immediately** (PagerDuty/Telegram)
2. **Check system status**
   ```bash
   curl http://localhost:8080/health | jq .
   ```
3. **Review recent logs**
   ```bash
   docker-compose -f docker-compose.production.yml logs --tail=100 | grep -i error
   ```
4. **Identify root cause** (see troubleshooting guide)
5. **Implement fix** or escalate
6. **Document incident** in incident log

## Incident Response

### Triage Process

When an alert indicates a potential issue:

1. **Assess Severity**
   - **Critical**: System down, funds at risk
   - **High**: Degraded detection, potential false positive/negative
   - **Medium**: Performance degradation, minor issues
   - **Low**: Informational, no impact

2. **Gather Context**
   ```bash
   # Get incident details
   npm run incident-log -- --last 1 --format json

   # Check what triggered detection
   npm run incident-log -- --last 1 --show-tx-details
   ```

3. **Verify Detection Accuracy**

   For detected threats:
   - Review simulation results (drain %)
   - Check GNN score and vulnerability type
   - Verify heuristic flags
   - Confirm transaction is actually malicious

4. **Determine Action**

   **True Positive:**
   - If pause succeeded: Monitor recovery, notify protocol team
   - If pause failed: Investigate why, consider retry

   **False Positive:**
   - Document why detection was incorrect
   - Add to false positive analysis
   - Adjust thresholds if pattern repeats

   **False Negative:**
   - Critical: Why was exploit missed?
   - Update detection criteria
   - Consider GNN retraining

### Escalation Matrix

**Level 1: On-Call Operator**
- Responds to initial alerts
- Performs triage
- Resolves routine issues
- Escalates if needed

**Level 2: Security Engineer**
- Investigates complex issues
- Makes detection accuracy decisions
- Updates configurations
- Available within 15 minutes

**Level 3: Engineering Lead**
- Handles critical incidents
- Coordinates with protocol teams
- Makes architecture decisions
- Available within 30 minutes

**Level 4: CTO/VP Engineering**
- Business decisions during major incidents
- External communications
- Post-incident review

## Maintenance Procedures

### Adding Monitored Contracts

**Process:**

1. **Request Submission**
   - Protocol team submits request
   - Includes: contract address, chain, pause method, guardian details

2. **Security Review**
   - Verify contract authenticity
   - Check pause method is callable
   - Validate guardian address
   - Assess TVL and risk profile

3. **Testing**
   ```bash
   # Add in test mode first
   npm run add-monitored-contract \
     --address 0x... \
     --chain ethereum \
     --test-mode

   # Run simulation test
   npm run replay-exploit -- --contract 0x... --test-transaction
   ```

4. **Production Addition**
   ```bash
   # Edit config/monitored-contracts.yml
   # Add contract with "added_by: human-review"
   # Commit with descriptive message
   git add config/monitored-contracts.yml
   git commit -m "Add [Protocol Name] contract to monitoring"

   # Deploy to production
   kubectl apply -f configmap.yaml -n smartsentinel
   # or restart service
   sudo systemctl reload smartsentinel
   ```

5. **Verification**
   ```bash
   # Confirm contract is monitored
   curl http://localhost:8080/api/v1/monitored-contracts | jq .

   # Test detection with mock transaction
   npm run test-detection -- --contract 0x...
   ```

### Threshold Tuning

**When to Tune:**

- Detection rate < 75% (lower thresholds)
- False positive rate > 5/day (raise thresholds)
- Latency > 3s p95 (optimize pipeline)
- New vulnerability type prevalent (retrain GNN)

**Process:**

```bash
# Analyze recent performance
npm run backtest

# Get tuning recommendations
npm run tune-thresholds -- data/backtest-results/backtest-*.json

# Edit config/thresholds.yml
# Apply recommended changes

# Test with backtest
npm run backtest

# Deploy if improved
git add config/thresholds.yml
git commit -m "Tune detection thresholds based on backtest"
```

### GNN Model Retraining

**When to Retrain:**

- Detection rate drops > 10%
- New vulnerability types emerge
- False negative rate increases
- Quarterly (at minimum)

**Process:**

```bash
# Gather new labeled data
# (From incidents, research papers, SmartBugs updates)

# Update training dataset
python ml-pipeline/data/merge_new_labels.py

# Retrain model
python ml-pipeline/train.py \
  --epochs 100 \
  --batch-size 32 \
  --output-dir models/gnn-vuln-classifier/

# Evaluate on benchmark
python ml-pipeline/eval/benchmark.py

# If improved, deploy new version
# Update model-card.json with new version
# Archive old model
mv models/gnn-vuln-classifier/model.pt models/gnn-vuln-classifier/model-v1.0.0.pt
# Deploy new model
kubectl apply -f deployment.yaml -n smartsentinel
```

## Configuration Management

### Version Control

All configuration changes MUST go through git:

```bash
# Edit configuration
vim config/thresholds.yml

# Stage changes
git add config/thresholds.yml

# Commit with descriptive message
git commit -m "Increase GNN threshold to 0.80 to reduce false positives"

# Push to origin
git push origin main

# Deploy to production
kubectl apply -f configmap.yaml -n smartsentinel
```

### Change Approval Process

**Low Risk Changes** (thresholds, RPC endpoints):
1. Make change in test environment
2. Run backtest
3. Get approval from security engineer
4. Deploy to production

**Medium Risk Changes** (new contracts, GNN settings):
1. Make change in test environment
2. Run full backtest
3. Review with engineering lead
4. Get written approval
5. Deploy during low-traffic period

**High Risk Changes** (architecture, core detection logic):
1. Create proposal document
2. Test in staging environment
3. Review with full engineering team
4. Get approval from CTO/VP Engineering
5. Create rollback plan
6. Deploy with full team on-call

### Rollback Procedures

```bash
# Quick rollback (last change)
git revert HEAD
kubectl apply -f configmap.yaml -n smartsentinel

# Full rollback (to specific version)
git checkout v1.2.3
kubectl apply -f configmap.yaml -n smartsentinel

# Emergency rollback (restore from backup)
cp data/backups/config-20240608.tar.gz /tmp/
tar -xzf /tmp/config-20240608.tar.gz -C config/
kubectl apply -f configmap.yaml -n smartsentinel
```

## Performance Tuning

### Latency Optimization

**If detection latency > 3s p95:**

1. **Profile pipeline**
   ```bash
   npm run profile -- --duration 60
   ```

2. **Identify bottlenecks**
   - Pre-filter: Add more aggressive filters
   - Simulation: Increase pool size, optimize timeout
   - GNN scoring: Use batch inference, optimize model

3. **Apply optimizations**
   ```yaml
   # config/thresholds.yml
   simulation:
     timeout_seconds: 5  # Reduce from 10
     pool_size: 10      # Increase from 5

   gnn:
     batch_size: 8       # Batch multiple transactions
   ```

4. **Re-test**
   ```bash
   npm run backtest -- --iterations 100
   ```

### Throughput Optimization

**If processing > 100 tx/s:**

1. **Horizontal scaling**
   ```bash
   # Scale to more instances
   kubectl scale deployment smartsentinel --replicas=5 -n smartsentinel
   ```

2. **Chain sharding**
   - Assign different chains to different instances
   - Use consistent routing by chain ID

3. **Simulation optimization**
   - Use persistent forks instead of creating new ones
   - Implement transaction batching

### Resource Optimization

**Memory Issues:**

```yaml
# Kubernetes resources
resources:
  requests:
    memory: "8Gi"
  limits:
    memory: "16Gi"
```

**CPU Issues:**

```yaml
resources:
  requests:
    cpu: "4"
  limits:
    cpu: "8"
```

## Emergency Procedures

### System Down

**Symptoms:**
- Health check returns "down"
- All components showing errors
- No metrics being exported

**Immediate Actions:**

1. **Check service status**
   ```bash
   sudo systemctl status smartsentinel
   # or
   kubectl get pods -n smartsentinel
   ```

2. **Review logs**
   ```bash
   sudo journalctl -u smartsentinel -n 100
   # or
   kubectl logs -f deployment/smartsentinel -n smartsentinel
   ```

3. **Restart service**
   ```bash
   sudo systemctl restart smartsentinel
   # or
   kubectl rollout restart deployment smartsentinel -n smartsentinel
   ```

4. **If restart fails**, restore from backup or escalate

### False Positive Pause

**Symptoms:**
- Protocol reports unexpected pause
- Investigation shows no actual exploit

**Immediate Actions:**

1. **Verify false positive**
   ```bash
   # Review detection details
   npm run incident-log -- --last 1 --show-full-context
   ```

2. **Coordinate with protocol team**
   - Confirm pause was unnecessary
   - Plan unpause timing

3. **Document incident**
   - Add to false positive database
   - Root cause analysis

4. **Prevent recurrence**
   - Adjust thresholds
   - Add detection rule refinement
   - Consider GNN retraining

### RPC Pool Failure

**Symptoms:**
- All RPC endpoints for a chain failing
- Chain listener showing "down"

**Immediate Actions:**

1. **Check RPC status**
   ```bash
   curl http://localhost:8080/health | jq '.components[] | select(.name | contains("rpc"))'
   ```

2. **Verify endpoint availability**
   ```bash
   curl -X POST https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
   ```

3. **Add fallback endpoint**
   ```yaml
   # config/chains.yml
   ethereum:
     rpc_urls:
       - https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
       - https://mainnet.infura.io/v3/YOUR_KEY
       - https://backup-rpc.example.com
   ```

4. **Restart service**
   ```bash
   sudo systemctl reload smartsentinel
   ```

### GNN Server Down

**Symptoms:**
- GNN server component showing "down"
- Detections still happening (fallback mode)

**Immediate Actions:**

1. **Check GNN server**
   ```bash
   curl http://localhost:8765/health
   ```

2. **Restart GNN server**
   ```bash
   systemctl restart gnn-server
   # or
   kubectl rollout restart deployment gnn-server -n ml-pipeline
   ```

3. **Verify fallback mode working**
   - Check detections are still being made
   - Latency may be higher, but should still function

4. **If server won't start**, check logs and escalate

## On-Call Rotation

### Responsibilities

- Respond to pages within 5 minutes
- Triage and assess incidents
- Resolve or escalate appropriately
- Document all incidents
- Handover to next on-call

### Handover Procedure

**End of shift:**

1. **Review open incidents**
   ```bash
   npm run incident-log -- --status open
   ```

2. **Document system state**
   - Any ongoing issues
   - Recent changes
   - Upcoming maintenance

3. **Notify next on-call**
   - Send summary via Slack/Telegram
   - Include any open items
   - Transfer PagerDuty

4. **Verify handover complete**
   - Next on-call acknowledges
   - PagerDuty shows correct rotation

### Training Requirements

**New operators must complete:**

1. **System overview** (2 hours)
   - Architecture review
   - Component interactions
   - Detection pipeline

2. **Hands-on practice** (4 hours)
   - Alert response simulation
   - Configuration changes
   - Troubleshooting exercises

3. **Shadow shifts** (2 weeks)
   - Observe on-call operations
   - Assist with incidents
   - Practice procedures

4. **Certification**
   - Pass written exam
   - Complete practical scenarios
   - Sign off on procedures

## Appendix

### Quick Reference Commands

```bash
# System status
npm run status

# Recent incidents
npm run incident-log -- --last 10

# Health check
curl http://localhost:8080/health

# Metrics
curl http://localhost:9090/metrics

# Test detection
npm run replay-exploit -- --exploit euler-2023

# Full backtest
npm run backtest

# Add contract
npm run add-monitored-contract --address 0x... --chain ethereum

# View logs
sudo journalctl -u smartsentinel -f
```

### Contact Information

**On-Call:** PagerDuty (available 24/7)
**Engineering Lead:** slack://@smartsentinel-lead
**Security Team:** security@smartsentinel.io
**Emergency:** +1-555-EMERGENCY
