/**
 * IncidentLog — Append-only SQLite writer for all sentinel decisions.
 * NEVER UPDATE OR DELETE ROWS. The audit trail is legally and operationally critical.
 */

import Database from "better-sqlite3";
import { resolve } from "node:path";
import { logger } from "../utils/logger.js";

const DB_PATH = resolve(process.cwd(), "data", "incident-log.db");

export interface IncidentRecord {
  incident_id: string;
  timestamp: string;
  action: string;
  tx_hash: string;
  contract_name: string;
  contract_address: string;
  chain: string;
  gnn_score: number;
  drain_pct: number;
  heuristic_flags: string;
  decision_reason: string;
  pipeline_latency_ms: number;
  flash_loan_detected: number;
  reentrancy_detected: number;
  oracle_manipulation: number;
}

export class IncidentLog {
  private db: Database.Database;

  constructor(dbPath?: string) {
    this.db = new Database(dbPath ?? DB_PATH);
    this.initialize();
  }

  /** Create the incidents table if it doesn't exist */
  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS incidents (
        incident_id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        contract_name TEXT NOT NULL,
        contract_address TEXT NOT NULL,
        chain TEXT NOT NULL,
        gnn_score REAL NOT NULL,
        drain_pct REAL NOT NULL,
        heuristic_flags TEXT NOT NULL,
        decision_reason TEXT NOT NULL,
        pipeline_latency_ms REAL NOT NULL,
        flash_loan_detected INTEGER NOT NULL DEFAULT 0,
        reentrancy_detected INTEGER NOT NULL DEFAULT 0,
        oracle_manipulation INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_incidents_tx_hash ON incidents(tx_hash);
      CREATE INDEX IF NOT EXISTS idx_incidents_contract ON incidents(contract_address);
      CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp);
      CREATE INDEX IF NOT EXISTS idx_incidents_action ON incidents(action);
    `);

    logger.info({ dbPath: DB_PATH }, "Incident log database initialized");
  }

  /** Log an incident — APPEND ONLY, never update or delete */
  async logIncident(data: {
    incidentId: string;
    action: string;
    txHash: string;
    contractName: string;
    contractAddress: string;
    chain: string;
    gnnScore: number;
    drainPct: number;
    heuristicFlags: string[];
    decisionReason: string;
    pipelineLatencyMs: number;
    timestamp: string;
  }): Promise<void> {
    const insert = this.db.prepare(`
      INSERT INTO incidents (
        incident_id, timestamp, action, tx_hash, contract_name,
        contract_address, chain, gnn_score, drain_pct,
        heuristic_flags, decision_reason, pipeline_latency_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      insert.run(
        data.incidentId,
        data.timestamp,
        data.action,
        data.txHash,
        data.contractName,
        data.contractAddress,
        data.chain,
        data.gnnScore,
        data.drainPct,
        JSON.stringify(data.heuristicFlags),
        data.decisionReason,
        data.pipelineLatencyMs,
      );
      logger.info({ incidentId: data.incidentId, action: data.action }, "Incident logged");
    } catch (error) {
      logger.error({ incidentId: data.incidentId, err: error }, "Failed to log incident");
    }
  }

  /** Query recent incidents */
  getRecentIncidents(limit: number = 50): IncidentRecord[] {
    const query = this.db.prepare(`
      SELECT * FROM incidents ORDER BY timestamp DESC LIMIT ?
    `);
    return query.all(limit) as IncidentRecord[];
  }

  /** Get incidents by contract */
  getIncidentsByContract(contractAddress: string, limit: number = 50): IncidentRecord[] {
    const query = this.db.prepare(`
      SELECT * FROM incidents WHERE contract_address = ? ORDER BY timestamp DESC LIMIT ?
    `);
    return query.all(contractAddress, limit) as IncidentRecord[];
  }

  /** Get incident by ID */
  getIncidentById(incidentId: string): IncidentRecord | undefined {
    const query = this.db.prepare(`SELECT * FROM incidents WHERE incident_id = ?`);
    return query.get(incidentId) as IncidentRecord | undefined;
  }

  /** Close the database connection */
  close(): void {
    this.db.close();
    logger.info("Incident log database closed");
  }
}