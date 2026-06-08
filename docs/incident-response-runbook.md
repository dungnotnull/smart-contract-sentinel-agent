# SmartSentinel Incident Response Runbook

This runbook provides step-by-step procedures for responding to incidents involving SmartSentinel or the protocols it protects.

## Table of Contents

1. [Incident Classification](#incident-classification)
2. [Response Procedures](#response-procedures)
3. [Communication Protocols](#communication-protocols)
4. [Post-Incident Activities](#post-incident-activities)
5. [Escalation Paths](#escalation-paths)

## Incident Classification

### Severity Levels

**SEV-0 (Critical)**
- Funds actively being drained (> $1M)
- SmartSentinel completely down during active attack
- False positive pause on major protocol (> $100M TVL)

**SEV-1 (High)**
- Funds being drained (< $1M but > $100K)
- SmartSentinel partially down
- Detection of sophisticated exploit that bypassed controls
- Multiple protocols under attack simultaneously

**SEV-2 (Medium)**
- Suspicious activity detected but not confirmed
- SmartSentinel performance degraded
- Single chain monitoring down
- False positive pause on smaller protocol

**SEV-3 (Low)**
- Configuration issues
- Minor performance degradation
- Documentation gaps
- Questions or clarifications needed

### Incident Types

**Type A: Active Exploit**
- Ongoing drain from protocol
- Attacker actively submitting transactions
- Requires immediate defensive action

**Type B: SmartSentinel Failure**
- System not detecting or responding
- Degraded performance
- Component failures

**Type C: False Positive**
- Legitimate transaction incorrectly flagged
- Unnecessary pause triggered
- Requires remediation and protocol communication

**Type D: Configuration Issue**
- Misconfigured thresholds
- Missing monitored contract
- Incorrect permissions

**Type E: Security Incident**
- Unauthorized access to SmartSentinel
- Compromised credentials
- Suspicious system activity

## Response Procedures

### Initial Response (All Incidents)

**When ANY incident is detected:**

1. **Acknowledge Immediately** (within 5 minutes)
   - PagerDuty: Acknowledge alert
   - Slack: Post in #incidents channel
   - Create incident ticket

2. **Assess Severity**
   - Gather initial information
   - Determine severity level
   - Assign incident commander

3. **Create War Room**
   - Zoom bridge: smartsentinel-emergency
   - Slack channel: #incident-SEV{N}-{date}
   - Shared notes document

4. **Initial Status Update**
   - Post to #incidents
   - Email stakeholders if SEV-0/1

### Type A: Active Exploit (SEV-0/1)

**T-0: Immediate Response (Minutes 0-5)**

1. **Confirm Attack**
   ```bash
   # Verify exploit is real
   npm run incident-log -- --last 1 --show-details

   # Check if pause fired
   npm run incident-log -- --last 1 --action pause

   # Monitor attacker address
   npm run monitor-address -- --address ATTACKER_ADDRESS --watch
   ```

2. **Assess Impact**
   - What protocol is affected?
   - How much has been drained?
   - Is the drain ongoing?
   - What's the attacker's method?

3. **Engage Protocol Team**
   - Immediate call with protocol core team
   - Share transaction hash and attacker address
   - Confirm pause status
   - Discuss next steps

4. **Document Everything**
   - Start incident log
   - Capture all transaction hashes
   - Save attacker contract bytecode
   - Record all communications

**T+5: Stabilization (Minutes 5-15)**

5. **Verify Defensive Position**
   ```bash
   # Confirm pause is effective
   npm run verify-pause -- --contract CONTRACT_ADDRESS

   # Check for related contracts
   npm run check-related-contracts -- --attacker ATTACKER_ADDRESS

   # Monitor for bypass attempts
   npm run monitor-mempool -- --attacker ATTACKER_ADDRESS
   ```

6. **Prevent Spread**
   - Check other monitored contracts for exposure
   - Review attacker's other recent transactions
   - Check for similar vulnerabilities

7. **Coordinate Response**
   - Protocol team: Execute emergency response
   - SmartSentinel team: Ensure continued monitoring
   - Communications team: Prepare public statement

**T+15: Investigation (Minutes 15-60)**

8. **Full Attack Analysis**
   ```bash
   # Generate forensic report
   npm run forensic-report -- --tx ATTACK_TX_HASH --output full

   # Extract attack pattern
   npm run analyze-attack -- --tx ATTACK_TX_HASH --pattern

   # Check if known exploit
   npm run check-known-exploits -- --pattern ATTACK_PATTERN
   ```

9. **Determine Root Cause**
   - What vulnerability was exploited?
   - Was it detectable by SmartSentinel?
   - Why wasn't it prevented?
   - Is there a fix?

10. **Remediation Planning**
    - Protocol team: Plan patch
    - SmartSentinel team: Update detection
    - Coordinate timing

**T+60: Resolution (Hours 1-24)**

11. **Implement Fixes**
    - Protocol team: Deploy patch
    - SmartSentinel team: Update detection rules
    - Test changes thoroughly

12. **Resume Operations**
    - Protocol team: Unpause gradually
    - SmartSentinel team: Monitor for relaunch
    - Verify normal operations

13. **Post-Mortem**
    - Schedule post-mortem meeting
    - Document timeline
    - Identify improvements
    - Create action items

### Type B: SmartSentinel Failure (SEV-1/2)

**T-0: Immediate Response**

1. **Diagnose Failure**
   ```bash
   # Check system health
   curl http://localhost:8080/health | jq .

   # Identify failed components
   curl -s http://localhost:8080/health | jq '.components[] | select(.status != "healthy")'

   # Check recent logs
   docker-compose -f docker-compose.production.yml logs --tail=100 | grep ERROR
   ```

2. **Determine Impact**
   - Which chains are affected?
   - Are detections still happening?
   - Is fallback mode active?
   - What's the blast radius?

3. **Engage On-Call**
   - Page SmartSentinel engineer
   - Create incident channel
   - Start diagnosis

**T+5: Stabilization**

4. **Restore Service**
   ```bash
   # Restart deployment
   kubectl rollout restart deployment smartsentinel -n smartsentinel

   # Check recovery
   watch -n 5 'curl -s http://localhost:8080/health | jq .status'
   ```

5. **Verify Functionality**
   - Test detection with known exploit
   - Verify all chains connected
   - Check alert channels working

**T+15: Root Cause**

6. **Investigate Failure**
   - Review logs for errors
   - Check resource limits
   - Verify dependencies
   - Test in staging environment

7. **Implement Fix**
   - Patch identified issue
   - Add monitoring
   - Update runbook
   - Test thoroughly

### Type C: False Positive (SEV-2/3)

**T-0: Immediate Response**

1. **Verify False Positive**
   ```bash
   # Get detection details
   npm run incident-log -- --last 1 --show-full-context

   # Review decision logic
   npm run analyze-decision -- --incident INCIDENT_ID

   # Check transaction details
   npm run get-transaction -- --hash TX_HASH --decode-input
   ```

2. **Assess Impact**
   - Was pause triggered?
   - Is protocol disrupted?
   - Can we unpause?
   - User impact assessment

3. **Engage Protocol Team**
   - Explain situation
   - Confirm false positive
   - Plan remediation

**T+5: Remediation**

4. **Restore Normal Operations**
   ```bash
   # Unpause if appropriate
   npm run unpause-contract -- --contract CONTRACT_ADDRESS --reason "false_positive"

   # Verify restoration
   npm run check-contract-status -- --contract CONTRACT_ADDRESS
   ```

5. **Document False Positive**
   - Add to false positive database
   - Record triggering pattern
   - Identify why it happened

**T+15: Prevention**

6. **Tune Detection**
   - Adjust thresholds if needed
   - Add exception pattern
   - Update detection logic
   - Test with backtest

7. **Communicate**
   - Apologize to protocol team
   - Explain root cause
   - Share prevention steps

### Type D: Configuration Issue (SEV-2/3)

**T-0: Response**

1. **Identify Issue**
   ```bash
   # Validate configuration
   npm run validate-config

   # Check for recent changes
   git log --since="1 day ago" config/

   # Compare with known-good config
   diff config/thresholds.yml config/backups/thresholds-*.yml
   ```

2. **Assess Impact**
   - What's misconfigured?
   - How long has it been wrong?
   - What's the impact?

3. **Fix Configuration**
   - Revert to known-good if needed
   - Apply correct configuration
   - Validate thoroughly
   - Deploy to production

**T+5: Verification**

4. **Test Changes**
   - Run backtest
   - Validate detections
   - Test with known exploits

5. **Prevent Recurrence**
   - Add validation checks
   - Update configuration process
   - Document requirements

### Type E: Security Incident (SEV-0/1)

**T-0: Immediate Response**

1. **Contain Incident**
   ```bash
   # If unauthorized access suspected:
   # 1. Rotate all credentials
   # 2. Revoke all API tokens
   # 3. Enable enhanced monitoring
   # 4. Lock down access
   ```

2. **Assess Compromise**
   - What was accessed?
   - Was data exfiltrated?
   - Are systems still compromised?
   - Who was the attacker?

3. **Engage Security Team**
   - Page security immediately
   - Forensic investigation
   - Legal notification

**T+5: Investigation**

4. **Full Audit**
   - Review all access logs
   - Check for suspicious activity
   - Audit all configurations
   - Scan for indicators of compromise

5. **Remediation**
   - Close all vulnerabilities
   - Update all credentials
   - Enhance monitoring
   - Implement additional controls

**T+15: Recovery**

6. **Restore Operations**
   - Only after full cleanup
   - With enhanced monitoring
   - Under security team supervision

7. **Post-Mortem**
   - Full security review
   - Implement recommendations
   - Update security posture

## Communication Protocols

### Internal Communication

**Slack Channels:**
- `#incidents`: All incidents
- `#incident-SEV{N}-{date}`: Specific incident
- `#smartsentinel-ops`: Daily operations
- `#smartsentinel-dev`: Development discussions

**Status Update Format:**

```
## Incident Update - HH:MM UTC

**Severity:** SEV-N
**Type:** A/B/C/D/E
**Status:** Investigating/Monitoring/Resolved

**Summary:** [One sentence update]

**Details:**
- [Bullet point 1]
- [Bullet point 2]

**Next Steps:**
- [Step 1]
- [Step 2]

**ETA:** [If applicable]
```

**Update Frequency:**
- SEV-0: Every 15 minutes
- SEV-1: Every 30 minutes
- SEV-2: Every hour
- SEV-3: Every 4 hours

### External Communication

**Protocol Teams:**

When an incident affects a monitored protocol:

1. **Initial Contact** (within 5 minutes for SEV-0/1)
   - Send message via primary channel (Telegram/Slack)
   - Include: incident type, severity, what we know

2. **Follow-up** (within 15 minutes)
   - Detailed status update
   - Recommended actions
   - Offer engineering support

3. **Ongoing Updates**
   - Every 30 minutes for active exploits
   - As needed for other incidents

**Public Communications:**

Only for SEV-0 incidents with public impact:

1. **Initial Statement** (within 1 hour)
   - Acknowledge incident
   - Share what we know
   - Commit to updates

2. **Updates**
   - Every 2 hours until resolved
   - Final summary when resolved

3. **Post-Mortem**
   - Share within 7 days
   - Be transparent
   - Share improvements

### Escalation Contacts

**SmartSentinel Team:**
- On-Call: PagerDuty (24/7)
- Engineering Lead: slack://@smartsentinel-lead
- CTO: slack://@cto

**Protocol Teams:**
- Each protocol has designated contacts in `config/monitored-contracts.yml`

**Security:**
- Security Team: security@smartsentinel.io
- CISO: ciso@smartsentinel.io

**Legal:**
- Legal Team: legal@smartsentinel.io

**PR/Comms:**
- PR Team: pr@smartsentinel.io

## Post-Incident Activities

### Post-Mortem Process

**Within 24 hours of resolution:**

1. **Schedule Post-Mortem**
   - Invite all participants
   - Set agenda
   - Share timeline

2. **Gather Facts**
   - What happened?
   - When did it happen?
   - Why did it happen?
   - How was it resolved?
   - What could be better?

3. **Write Report**

**Post-Mortem Template:**

```markdown
# Incident Post-Mortem: [Brief Title]

**Date:** [Date of incident]
**Severity:** SEV-N
**Duration:** [Start time] to [End time]
**Incident Commander:** [Name]

## Executive Summary
[2-3 sentence overview]

## Timeline
- **HH:MM UTC**: Event 1
- **HH:MM UTC**: Event 2
- ...

## Impact
- **Protocols Affected:** [List]
- **Funds Lost:** [Amount]
- **Users Affected:** [Number]
- **Duration:** [Time]

## Root Cause
[What caused the incident?]

## Resolution
[How was it fixed?]

## Timeline of Response
[Detailed response timeline]

## What Went Well
- [What worked?]

## What Could Be Improved
- [What didn't work?]

## Action Items
- [ ] [Owner] - [Action item] - [Due date]
- [ ] [Owner] - [Action item] - [Due date]

## Lessons Learned
[Key takeaways]
```

4. **Share Report**
   - Internal: All engineering
   - External: If public incident
   - Protocol teams: If they were affected

5. **Track Action Items**
   - Create GitHub issues
   - Assign owners
   - Set due dates
   - Follow up

### Improvement Process

**Weekly Incident Review:**

Every week, review all incidents from the past week:

1. What incidents occurred?
2. Were they handled well?
3. What can be improved?
4. Update runbooks if needed

**Monthly Process Review:**

Every month, review the incident response process:

1. Are runbooks up to date?
2. Are contacts current?
3. Is training adequate?
4. Are tools effective?

**Quarterly Drill:**

Every quarter, run a drill:

1. Simulate SEV-0 incident
2. Test response procedures
3. Identify gaps
4. Update procedures

## Escalation Paths

### On-Call Escalation

**Level 1: On-Call Operator**
- First responder
- Handles routine incidents
- Escalates if needed

**Level 2: SmartSentinel Engineer**
- Handles technical incidents
- Available within 15 minutes
- Escalates if needed

**Level 3: Engineering Lead**
- Handles complex incidents
- Coordinates protocol teams
- Available within 30 minutes

**Level 4: CTO**
- Handles business decisions
- External communications
- Available immediately for SEV-0

### Protocol Escalation

When incident affects a monitored protocol:

1. **Level 1: Protocol On-Call**
   - Initial contact
   - Status updates

2. **Level 2: Protocol Core Team**
   - Technical discussions
   - Decision-making

3. **Level 3: Protocol Leadership**
   - Business decisions
   - Public communications

### External Escalation

**When to involve external parties:**

- **Legal:** When funds > $1M or legal implications
- **PR:** When public impact or media attention
- **Law Enforcement:** When criminal activity confirmed
- **Regulators:** When required by law

## Emergency Contacts

### SmartSentinel Team

**On-Call:**
- PagerDuty: Available 24/7

**Engineering:**
- Lead: slack://@smartsentinel-lead
- CTO: slack://@cto

**Security:**
- Team: security@smartsentinel.io
- CISO: ciso@smartsentinel.io

**Legal/PR:**
- Legal: legal@smartsentinel.io
- PR: pr@smartsentinel.io

### External

**Emergency:**
- Police: 911 (US) / 999 (UK) / 112 (EU)
- FBI Cyber: +1-855-292-3933

**Legal:**
- External Counsel: [Contact info]

**PR:**
- Crisis PR Firm: [Contact info]

### Additional Resources

**Protocol Guardian Multisig:** See `config/monitored-contracts.yml`
**SEAL911:** https://seal911.io (File novel attack patterns)
**Flashbots Discord:** https://discord.gg/flashbots
**Smart Contract Audit Firms:** [Contact list]

## Quick Reference

### Critical Commands

```bash
# System health
curl http://localhost:8080/health

# Recent incidents
npm run incident-log -- --last 5

# Check specific incident
npm run incident-log -- --incident INCIDENT_ID --show-full

# Pause status
npm run verify-pause -- --contract CONTRACT_ADDRESS

# Monitor attacker
npm run monitor-address -- --address ATTACKER_ADDRESS --watch

# Forensic report
npm run forensic-report -- --tx TX_HASH

# System restart
kubectl rollout restart deployment smartsentinel -n smartsentinel
```

### Decision Trees

**Should I escalate?**
- YES if: Can't resolve in 30 minutes OR impact is worsening
- NO if: Resolving AND impact is contained

**Should I wake someone up?**
- YES if: SEV-0 OR funds actively draining OR system completely down
- NO if: SEV-2/3 AND can handle until morning

**Should I go public?**
- YES if: SEV-0 AND public impact AND >1 hour elapsed
- NO if: Internal issue OR contained OR <1 hour

## Appendix

### Incident Types Quick Reference

| Type | Description | Example |
|------|-------------|---------|
| A | Active exploit draining funds | Ongoing reentrancy attack |
| B | SmartSentinel failure | GNN server down |
| C | False positive | Legitimate tx flagged |
| D | Configuration issue | Wrong threshold set |
| E | Security incident | Unauthorized access |

### Severity Quick Reference

| Severity | Description | Response Time | Example |
|----------|-------------|----------------|---------|
| SEV-0 | Critical, funds at risk | Immediate | Active exploit >$1M |
| SEV-1 | High, significant impact | 5 minutes | Active exploit <$1M |
| SEV-2 | Medium, contained | 30 minutes | One chain down |
| SEV-3 | Low, minimal impact | 4 hours | Config typo |

### Communication Channels

| Purpose | Channel | When to Use |
|---------|---------|-------------|
| All incidents | #incidents | Every incident |
| Specific incident | #incident-SEV{N}-{date} | For incident details |
| Operations | #smartsentinel-ops | Daily ops |
| Development | #smartsentinel-dev | Technical discussions |
| Protocol comms | Per protocol | Protocol-specific |

## Conclusion

This runbook is a living document. Update it as we learn from incidents. When in doubt, err on the side of over-communicating and escalating early.
