import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing } from '../column-exists';

/**
 * Full schema for a fresh database. Later migrations only add columns that
 * this baseline does not already include, and they skip columns that exist.
 */
export class BaselineSchema1762370000000 implements MigrationInterface {
  name = 'BaselineSchema1762370000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" varchar PRIMARY KEY NOT NULL,
        "email" varchar NOT NULL,
        "password_hash" varchar NOT NULL,
        "role" varchar NOT NULL DEFAULT ('operator'),
        "display_name" varchar,
        "locale" varchar NOT NULL DEFAULT ('en'),
        "locale_pinned" boolean NOT NULL DEFAULT (0),
        "face_template" text,
        "suspended" boolean NOT NULL DEFAULT (0),
        "token_version" integer NOT NULL DEFAULT (0),
        "safe_action_pin_hash" varchar,
        "two_factor_enabled" boolean NOT NULL DEFAULT (0),
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "register_maps" (
        "id" varchar PRIMARY KEY NOT NULL,
        "name" varchar NOT NULL,
        "address" integer NOT NULL,
        "kind" varchar NOT NULL,
        "data_type" varchar NOT NULL DEFAULT ('bool'),
        "scale" float NOT NULL DEFAULT (1),
        "rw" varchar NOT NULL DEFAULT ('rw'),
        "trended" boolean NOT NULL DEFAULT (0),
        "node_id" varchar,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_register_maps_name" UNIQUE ("name")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plc_connections" (
        "id" varchar PRIMARY KEY NOT NULL,
        "label" varchar NOT NULL,
        "protocol" varchar NOT NULL DEFAULT ('modbus-tcp'),
        "host" varchar NOT NULL DEFAULT ('127.0.0.1'),
        "port" integer NOT NULL DEFAULT (1502),
        "unit_id" integer NOT NULL DEFAULT (1),
        "poll_ms" integer NOT NULL DEFAULT (250),
        "enabled" boolean NOT NULL DEFAULT (1),
        "is_simulator" boolean NOT NULL DEFAULT (0),
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_plc_connections_label" UNIQUE ("label")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cells" (
        "id" varchar PRIMARY KEY NOT NULL,
        "row" integer NOT NULL,
        "col" integer NOT NULL,
        "label" varchar NOT NULL,
        "style" varchar NOT NULL DEFAULT ('default'),
        "is_motion" boolean NOT NULL DEFAULT (0),
        "requires_safe_action" boolean NOT NULL DEFAULT (0),
        "variable_speed" boolean NOT NULL DEFAULT (1),
        "slow_speed_pct" integer NOT NULL DEFAULT (30),
        "fast_speed_pct" integer NOT NULL DEFAULT (100),
        "primary_register_id" varchar,
        "secondary_register_id" varchar,
        "feedback_register_id" varchar,
        "status_register_id" varchar,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_cells_primary_register" FOREIGN KEY ("primary_register_id") REFERENCES "register_maps"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cells_secondary_register" FOREIGN KEY ("secondary_register_id") REFERENCES "register_maps"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cells_feedback_register" FOREIGN KEY ("feedback_register_id") REFERENCES "register_maps"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cells_status_register" FOREIGN KEY ("status_register_id") REFERENCES "register_maps"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "background_displays" (
        "id" varchar PRIMARY KEY NOT NULL,
        "name" varchar NOT NULL,
        "image_url" varchar,
        "css_background" varchar,
        "active" boolean NOT NULL DEFAULT (0),
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_background_displays_name" UNIQUE ("name")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "overlay_labels" (
        "id" varchar PRIMARY KEY NOT NULL,
        "label" varchar NOT NULL,
        "x_pct" float NOT NULL,
        "y_pct" float NOT NULL,
        "format" varchar NOT NULL DEFAULT ('{value}'),
        "background_id" varchar NOT NULL,
        "register_id" varchar,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_overlay_background" FOREIGN KEY ("background_id") REFERENCES "background_displays"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_overlay_register" FOREIGN KEY ("register_id") REFERENCES "register_maps"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "safety_roles" (
        "id" varchar PRIMARY KEY NOT NULL,
        "estop_register_id" varchar,
        "deadman_register_id" varchar,
        "heartbeat_register_id" varchar,
        "safe_state_register_id" varchar,
        "allow_timed_media_motion" boolean NOT NULL DEFAULT (0),
        "operator_estop_latched" boolean NOT NULL DEFAULT (0)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" varchar PRIMARY KEY NOT NULL,
        "user_id" varchar,
        "user_email" varchar,
        "user_display_name" varchar,
        "action" varchar NOT NULL,
        "resource" varchar,
        "details" text,
        "ip" varchar,
        "client_id" varchar,
        "result" varchar NOT NULL DEFAULT ('success'),
        "created_at" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "alarm_definitions" (
        "id" varchar PRIMARY KEY NOT NULL,
        "name" varchar NOT NULL,
        "severity" varchar NOT NULL DEFAULT ('warning'),
        "compare_op" varchar NOT NULL DEFAULT ('eq'),
        "threshold" float NOT NULL DEFAULT (1),
        "enabled" boolean NOT NULL DEFAULT (1),
        "register_id" varchar NOT NULL,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_alarm_definitions_name" UNIQUE ("name"),
        CONSTRAINT "FK_alarm_definitions_register" FOREIGN KEY ("register_id") REFERENCES "register_maps"("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "alarm_events" (
        "id" varchar PRIMARY KEY NOT NULL,
        "definition_id" varchar NOT NULL,
        "value" float NOT NULL,
        "state" varchar NOT NULL DEFAULT ('active'),
        "acked_at" datetime,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_alarm_events_definition" FOREIGN KEY ("definition_id") REFERENCES "alarm_definitions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "trend_samples" (
        "id" varchar PRIMARY KEY NOT NULL,
        "series_key" varchar NOT NULL,
        "value" float NOT NULL,
        "created_at" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "scan_codes" (
        "id" varchar PRIMARY KEY NOT NULL,
        "code" varchar NOT NULL,
        "label" varchar NOT NULL,
        "kind" varchar NOT NULL DEFAULT ('asset'),
        "route_hint" varchar,
        "notes" text,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_scan_codes_code" UNIQUE ("code")
      )
    `);
    await addColumnIfMissing(
      queryRunner,
      'users',
      'two_factor_enabled',
      'boolean NOT NULL DEFAULT (0)',
    );
    await addColumnIfMissing(
      queryRunner,
      'register_maps',
      'node_id',
      'varchar',
    );
    await addColumnIfMissing(
      queryRunner,
      'plc_connections',
      'protocol',
      "varchar NOT NULL DEFAULT ('modbus-tcp')",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'alarm_events',
      'alarm_definitions',
      'overlay_labels',
      'cells',
      'trend_samples',
      'scan_codes',
      'audit_logs',
      'safety_roles',
      'background_displays',
      'plc_connections',
      'register_maps',
      'users',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }
}
