/**
 * Migration: Create Initial Schema
 * - All core tables for the chat application
 * - Date: 2026-06-01
 * 
 * Run:  npx knex migrate:latest
 * Undo: npx knex migrate:rollback
 */

export async function up(knex) {
  // ==========================================
  // 1. PAYS (COUNTRIES) TABLE
  // ==========================================
  await knex.schema.createTable('pays', (table) => {
    table.increments('idPays').primary();
    table.string('libelle', 100).notNullable().unique();
    table.string('prefix', 10).notNullable().unique();
    table.string('timeZone', 50).notNullable();
    table.integer('decalageHoraire').notNullable();
    table.timestamp('createdAt').defaultTo(knex.fn.now());
  });

  // ==========================================
  // 2. USERS TABLE
  // ==========================================
  await knex.schema.createTable('users', (table) => {
    table.increments('alanyaID').primary();
    table.string('nom', 100);
    table.string('pseudo', 80);
    table.string('alanyaPhone', 9);
    table.smallint('idPays', 2).unsigned();
    table.string('password', 255);
    table.string('avatar_url', 255);
    table.smallint('type_compte');
    table.tinyint('is_online', 1).unsigned();
    table.datetime('last_seen');
    table.tinyint('exclus', 1).unsigned();
    table.tinyint('in_call', 1).unsigned();
    table.tinyint('biometric', 1).unsigned();
    table.string('fcm_token', 255);
    table.string('device_ID', 255);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Foreign key
    table.foreign('idPays').references('idPays').inTable('pays');

    // Indexes
    table.index('alanyaPhone', 'idx_users_phone');
    table.index('created_at', 'idx_users_created');
  });

  // ==========================================
  // 3. CONVERSATION TABLE
  // ==========================================
  await knex.schema.createTable('conversation', (table) => {
    table.increments('conversationId').primary();
    table.integer('idGroup');
    table.string('groupName', 255).notNullable();
    table.string('groupPhoto', 255);
    table.longText('lastMessage');
    table.integer('lastMessageSenderId');
    table.string('lastMessageType', 20);
    table.string('lastMessageStatus', 20);
    table.timestamp('createdAt').defaultTo(knex.fn.now());

    // Indexes
    table.index('idGroup', 'idx_conversation_idGroup');
  });

  // ==========================================
  // 4. CONVERSATION PARTICIPANTS TABLE
  // ==========================================
  await knex.schema.createTable('conv_participants', (table) => {
    table.increments('id').primary();
    table.integer('conversationId').notNullable();
    table.integer('alanyaID').notNullable();
    table.integer('unreadCount').notNullable().defaultTo(0);
    table.tinyint('isThread', 1).notNullable().defaultTo(0);
    table.tinyint('isArchived', 1).notNullable().defaultTo(0);
    table.timestamp('joinedAt').defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('conversationId').references('conversationId').inTable('conversation').onDelete('CASCADE');
    table.foreign('alanyaID').references('alanyaID').inTable('users').onDelete('CASCADE');

    // Constraints
    table.unique(['conversationId', 'alanyaID']);

    // Indexes
    table.index('alanyaID', 'idx_conv_part_user');
  });

  // ==========================================
  // 5. MESSAGES TABLE
  // ==========================================
  await knex.schema.createTable('messages', (table) => {
    table.increments('messageId').primary();
    table.integer('senderId').notNullable();
    table.integer('conversationId').notNullable();
    table.longText('content').notNullable();
    table.string('type', 20).notNullable().defaultTo('text');
    table.string('status', 20).notNullable().defaultTo('pending');
    table.timestamp('sentAt').defaultTo(knex.fn.now());
    table.datetime('readAt');
    table.string('mediaUrl', 255);
    table.string('mediaName', 255);
    table.integer('mediaDuration');
    table.tinyint('isDeleted', 1).notNullable().defaultTo(0);
    table.datetime('deletedAt');
    table.integer('deletedForId');
    table.datetime('editedAt');
    table.integer('forwardedFrom');
    table.integer('replyToId');
    table.longText('replyToContent');

    // Foreign keys
    table.foreign('senderId').references('alanyaID').inTable('users').onDelete('CASCADE');
    table.foreign('conversationId').references('conversationId').inTable('conversation').onDelete('CASCADE');
    table.foreign('replyToId').references('messageId').inTable('messages').onDelete('SET NULL');

    // Indexes
    table.index('conversationId', 'idx_messages_conv');
    table.index('senderId', 'idx_messages_sender');
    table.index('status', 'idx_messages_status');
    table.index('sentAt', 'idx_messages_sentAt');
  });

  // ==========================================
  // 6. MESSAGE READ RECEIPTS TABLE
  // ==========================================
  await knex.schema.createTable('messageReadReceipts', (table) => {
    table.increments('id').primary();
    table.integer('messageId').notNullable();
    table.integer('alanyaID').notNullable();
    table.timestamp('readAt').defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('messageId').references('messageId').inTable('messages').onDelete('CASCADE');
    table.foreign('alanyaID').references('alanyaID').inTable('users').onDelete('CASCADE');

    // Indexes
    table.index('messageId');
    table.index('alanyaID');
  });

  // ==========================================
  // 7. STATUS (STORIES) TABLE
  // ==========================================
  await knex.schema.createTable('status', (table) => {
    table.increments('statusId').primary();
    table.integer('userId').notNullable();
    table.string('contentUrl', 255).notNullable();
    table.string('type', 20).defaultTo('image');
    table.string('caption', 255);
    table.timestamp('createdAt').defaultTo(knex.fn.now());
    table.timestamp('expiresAt');

    // Foreign key
    table.foreign('userId').references('alanyaID').inTable('users').onDelete('CASCADE');

    // Indexes
    table.index('userId');
    table.index('createdAt', 'idx_status_created');
  });

  // ==========================================
  // 8. STATUS VIEWERS TABLE
  // ==========================================
  await knex.schema.createTable('statusViewer', (table) => {
    table.increments('id').primary();
    table.integer('statusId').notNullable();
    table.integer('viewerId').notNullable();
    table.timestamp('viewedAt').defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('statusId').references('statusId').inTable('status').onDelete('CASCADE');
    table.foreign('viewerId').references('alanyaID').inTable('users').onDelete('CASCADE');

    // Constraints
    table.unique(['statusId', 'viewerId']);

    // Indexes
    table.index('statusId');
    table.index('viewerId');
  });

  // ==========================================
  // 9. BLOCKED USERS TABLE
  // ==========================================
  await knex.schema.createTable('blocked', (table) => {
    table.increments('id').primary();
    table.integer('blockerId').notNullable();
    table.integer('blockedUserId').notNullable();
    table.timestamp('blockedAt').defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('blockerId').references('alanyaID').inTable('users').onDelete('CASCADE');
    table.foreign('blockedUserId').references('alanyaID').inTable('users').onDelete('CASCADE');

    // Constraints
    table.unique(['blockerId', 'blockedUserId']);

    // Indexes
    table.index('blockerId');
    table.index('blockedUserId');
  });

  // ==========================================
  // 10. CALL HISTORY TABLE
  // ==========================================
  await knex.schema.createTable('callHistory', (table) => {
    table.increments('callId').primary();
    table.integer('callerId').notNullable();
    table.integer('calleeId').notNullable();
    table.string('type', 20).defaultTo('voice');
    table.string('status', 20).defaultTo('pending');
    table.timestamp('initiatedAt').defaultTo(knex.fn.now());
    table.datetime('answeredAt');
    table.datetime('endedAt');
    table.integer('duration');

    // Foreign keys
    table.foreign('callerId').references('alanyaID').inTable('users').onDelete('CASCADE');
    table.foreign('calleeId').references('alanyaID').inTable('users').onDelete('CASCADE');

    // Indexes
    table.index('callerId');
    table.index('calleeId');
    table.index('initiatedAt', 'idx_call_initiated');
  });

  console.log('✅ Created all tables successfully');
}

export async function down(knex) {
  // Drop tables in reverse order (foreign key dependencies)
  await knex.schema.dropTableIfExists('callHistory');
  await knex.schema.dropTableIfExists('blocked');
  await knex.schema.dropTableIfExists('statusViewer');
  await knex.schema.dropTableIfExists('status');
  await knex.schema.dropTableIfExists('messageReadReceipts');
  await knex.schema.dropTableIfExists('messages');
  await knex.schema.dropTableIfExists('conv_participants');
  await knex.schema.dropTableIfExists('conversation');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('pays');

  console.log('✅ Dropped all tables successfully');
}
